import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  CONFIG_FILE_NAME,
  parseConfigFile,
  resolveConfig,
  resolveTarget,
  type CliOptions,
  type ConfigFile,
  type ResolvedConfig,
} from '../config/config.js';
import { writeFileAtomic } from '../infra/atomicWrite.js';
import { DocsyncError, SourceError } from '../infra/errors.js';
import { decodeReadme, encodeReadme, type ReadmeText } from '../markers/markers.js';
import { GitHubSource, createMetadataProvider } from '../sources/github.js';
import { createGitHubClient } from '../sources/githubClient.js';
import { LocalSource } from '../sources/local.js';
import type { MetadataProvider, RepoSource } from '../sources/types.js';
import type { Runtime } from './runtime.js';

/** A resolved target: where facts come from, and how the README is read and written. */
export interface OpenTarget {
  config: ResolvedConfig;
  source: RepoSource;
  readReadme(): Promise<ReadmeText | null>;
  /** Writes the README in place (local) or to --out / stdout (remote). Returns a description of where. */
  writeReadme(readme: ReadmeText): Promise<string>;
}

async function readConfigFile(file: string): Promise<ConfigFile | null> {
  let text: string;
  try {
    text = await fs.readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new SourceError(`could not read ${path.basename(file)}`, { cause: error });
  }
  return parseConfigFile(text, path.basename(file));
}

async function explicitConfig(cli: CliOptions): Promise<ConfigFile | null> {
  if (cli.config === undefined) return null;
  const file = await readConfigFile(path.resolve(cli.config));
  if (file === null) throw new SourceError(`config file ${cli.config} does not exist`);
  return file;
}

function outputWriter(config: ResolvedConfig, runtime: Runtime) {
  return async (readme: ReadmeText) => {
    if (config.out === undefined) {
      runtime.logger.result(readme.text);
      return 'stdout';
    }
    await runtime.writeFile(config.out, (readme.hasBom ? '﻿' : '') + readme.text);
    return config.out;
  };
}

/** GitHub metadata is optional in local mode: a failure becomes a warning and the fields show Not Found (CR-2). */
function optionalMetadata(provider: MetadataProvider, runtime: Runtime): MetadataProvider {
  return async (repo) => {
    try {
      return await provider(repo);
    } catch (error) {
      const reason = error instanceof DocsyncError ? error.message : String(error);
      runtime.logger.warn(
        `could not read GitHub metadata for ${repo.owner}/${repo.repo} (${reason}); GitHub-only fields will show Not Found`,
      );
      return null;
    }
  };
}

export async function openTarget(cli: CliOptions, runtime: Runtime): Promise<OpenTarget> {
  const target = resolveTarget(cli);
  const token = runtime.env.GITHUB_TOKEN || undefined;
  const client = () => createGitHubClient({ token, fetch: runtime.fetch });
  const fromCli = await explicitConfig(cli);

  if (target.kind === 'local') {
    const fileConfig = fromCli ?? (await readConfigFile(path.join(target.root, CONFIG_FILE_NAME)));
    const config = resolveConfig(cli, target, fileConfig);
    const source = await LocalSource.create(target.root, {
      include: config.include,
      exclude: config.exclude,
      metadataProvider: token ? optionalMetadata(createMetadataProvider(client()), runtime) : undefined,
    });
    const readmePath = path.join(target.root, ...config.readme.split('/'));
    return {
      config,
      source,
      async readReadme() {
        try {
          return decodeReadme(await fs.readFile(readmePath), config.readme);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
          throw error;
        }
      },
      async writeReadme(readme) {
        if (config.out !== undefined) return outputWriter(config, runtime)(readme);
        await writeFileAtomic(readmePath, encodeReadme(readme));
        return config.readme;
      },
    };
  }

  let config = resolveConfig(cli, target, fromCli);
  const source = await GitHubSource.create(
    client(),
    { owner: target.owner, repo: target.repo },
    {
      ref: target.ref,
      logger: runtime.logger,
      configure: (text) => {
        if (fromCli === null && text !== null)
          config = resolveConfig(cli, target, parseConfigFile(text, CONFIG_FILE_NAME));
        return { include: config.include, exclude: config.exclude, alsoRead: [config.readme] };
      },
    },
  );
  return {
    get config() {
      return config;
    },
    source,
    async readReadme() {
      const text = await source.readFile(config.readme);
      if (text === null) return null;
      const hasBom = text.startsWith('﻿');
      return { text: hasBom ? text.slice(1) : text, hasBom };
    },
    writeReadme: (readme) => outputWriter(config, runtime)(readme),
  };
}
