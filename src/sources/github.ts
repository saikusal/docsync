import { CONFIG_FILE_NAME } from '../config/config.js';
import { mapLimit } from '../infra/concurrency.js';
import { SourceError } from '../infra/errors.js';
import type { Logger } from '../infra/logger.js';
import { createScope, type ScopeOptions } from '../scope/scope.js';
import { mapGitHubError, type GitHubClient } from './githubClient.js';
import type { GitHubRepoRef, MetadataProvider, RepoMetadata, RepoSource } from './types.js';

const MAX_CONCURRENT_REQUESTS = 8;
const MAX_FILE_BYTES = 1024 * 1024;
const SYMLINK_MODE = '120000';

interface TreeEntry {
  path?: string;
  mode?: string;
  type?: string;
  sha?: string;
  size?: number;
}

function remaining(headers: Record<string, unknown>): number | null {
  const value = Number(headers['x-ratelimit-remaining']);
  return Number.isFinite(value) ? value : null;
}

async function call<T>(label: string, request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    throw mapGitHubError(error, label);
  }
}

async function latestRelease(client: GitHubClient, { owner, repo }: GitHubRepoRef): Promise<string | null> {
  try {
    const { data } = await client.rest.repos.getLatestRelease({ owner, repo });
    return data.tag_name || null;
  } catch (error) {
    if ((error as { status?: number }).status === 404) return null;
    throw mapGitHubError(error, `${owner}/${repo}`);
  }
}

function toMetadata(
  data: {
    full_name: string;
    description: string | null;
    topics?: string[];
    license: { spdx_id?: string | null } | null;
    default_branch: string;
  },
  release: string | null,
): RepoMetadata {
  const spdx = data.license?.spdx_id;
  return {
    fullName: data.full_name,
    description: data.description?.trim() || null,
    topics: [...(data.topics ?? [])].sort(),
    license: spdx && spdx !== 'NOASSERTION' ? spdx : null,
    defaultBranch: data.default_branch || null,
    latestRelease: release,
  };
}

/** Metadata lookup used by LocalSource when GITHUB_TOKEN is set and origin is on github.com (FR-18). */
export function createMetadataProvider(client: GitHubClient): MetadataProvider {
  return async (ref) => {
    const label = `${ref.owner}/${ref.repo}`;
    const { data } = await call(label, () => client.rest.repos.get({ owner: ref.owner, repo: ref.repo }));
    return toMetadata(data, await latestRelease(client, ref));
  };
}

export interface RemoteScope extends Pick<ScopeOptions, 'include' | 'exclude'> {
  /** Extra files to download, e.g. the README (which is neither source nor manifest). */
  alsoRead?: readonly string[];
}

export interface GitHubSourceOptions {
  ref?: string | undefined;
  logger: Logger;
  /**
   * Called once with the repository's docsync.config.json (or null) before anything else is downloaded,
   * so the config's include/exclude and README path apply to remote mode too (FR-2).
   */
  configure?: (configText: string | null) => RemoteScope;
}

/**
 * Reads a repository through the REST API (FR-17): the ref is resolved to one commit SHA, the tree is listed once,
 * and only in-scope sources and manifests are downloaded, as blobs by SHA (DR-3).
 */
export class GitHubSource implements RepoSource {
  readonly label: string;
  readonly defaultName: string;

  private constructor(
    repo: GitHubRepoRef,
    private readonly files: string[],
    private readonly contents: ReadonlyMap<string, string>,
    private readonly metadata: RepoMetadata,
  ) {
    this.label = `${repo.owner}/${repo.repo}`;
    this.defaultName = repo.repo;
  }

  static async create(
    client: GitHubClient,
    repo: GitHubRepoRef,
    options: GitHubSourceOptions,
  ): Promise<GitHubSource> {
    const label = `${repo.owner}/${repo.repo}`;
    const { logger } = options;

    const { data: repoData } = await call(label, () =>
      client.rest.repos.get({ owner: repo.owner, repo: repo.repo }),
    );
    const ref = options.ref ?? repoData.default_branch;
    const { data: commit } = await call(label, async () => {
      try {
        return await client.rest.repos.getCommit({ ...repo, ref });
      } catch (error) {
        // GitHub answers 404 or 422 ("No commit found for SHA") for an unknown branch, tag or SHA.
        const status = (error as { status?: number }).status;
        if (options.ref !== undefined && (status === 404 || status === 422)) {
          throw new SourceError(
            `ref "${ref}" was not found in ${label}; check the branch, tag or commit name`,
          );
        }
        throw error;
      }
    });
    logger.debug(`resolved ${label}@${ref} to ${commit.sha}`);

    const tree = await call(label, () =>
      client.rest.git.getTree({ ...repo, tree_sha: commit.commit.tree.sha, recursive: 'true' }),
    );
    if (tree.data.truncated) {
      throw new SourceError(
        `${label} is too large for remote mode (GitHub truncated the file tree); run docsync on a local clone`,
      );
    }

    const blobs = (tree.data.tree as TreeEntry[]).filter((entry) => {
      if (entry.type === 'commit') logger.warn(`skipping submodule ${entry.path}`);
      if (entry.mode === SYMLINK_MODE) logger.debug(`skipping symlink ${entry.path}`);
      return entry.type === 'blob' && entry.mode !== SYMLINK_MODE && entry.path && entry.sha;
    });

    const readBlob = async (sha: string) => {
      const { data } = await call(label, () => client.rest.git.getBlob({ ...repo, file_sha: sha }));
      return Buffer.from(data.content, data.encoding === 'base64' ? 'base64' : 'utf8').toString('utf8');
    };

    const gitignoreEntry = blobs.find((entry) => entry.path === '.gitignore');
    const gitignore = gitignoreEntry?.sha ? await readBlob(gitignoreEntry.sha) : null;
    const configEntry = blobs.find((entry) => entry.path === CONFIG_FILE_NAME);
    const configText = configEntry?.sha ? await readBlob(configEntry.sha) : null;
    const { include, exclude, alsoRead = [] } = options.configure?.(configText) ?? {};
    const scope = createScope({ include, exclude, gitignore });
    const extra = new Set(alsoRead);

    const listed = blobs.filter((entry) => scope.isListed(entry.path as string));
    const toRead = listed.filter((entry) => {
      const file = entry.path as string;
      if (file === '.gitignore' || file === CONFIG_FILE_NAME) return false;
      if (!scope.isSource(file) && !scope.isManifest(file) && !extra.has(file)) return false;
      if ((entry.size ?? 0) > MAX_FILE_BYTES) {
        logger.warn(`skipping ${file}: larger than 1 MB (probably generated)`);
        return false;
      }
      return true;
    });

    const needed = toRead.length + 1;
    const left = remaining(tree.headers as Record<string, unknown>);
    if (left !== null && left < needed) {
      throw new SourceError(
        `remote mode needs about ${needed} GitHub API requests but only ${left} remain in the current rate-limit window; ` +
          'set GITHUB_TOKEN for a higher limit, or run docsync on a local clone',
      );
    }

    const texts = await mapLimit(toRead, MAX_CONCURRENT_REQUESTS, (entry) => readBlob(entry.sha as string));
    const contents = new Map(toRead.map((entry, index) => [entry.path as string, texts[index] as string]));
    if (gitignore !== null) contents.set('.gitignore', gitignore);
    if (configText !== null) contents.set(CONFIG_FILE_NAME, configText);

    const metadata = toMetadata(repoData, await latestRelease(client, repo));
    const files = listed.map((entry) => entry.path as string).sort();
    return new GitHubSource(repo, files, contents, metadata);
  }

  async listFiles(): Promise<string[]> {
    return this.files;
  }

  async readFile(file: string): Promise<string | null> {
    return this.contents.get(file.replaceAll('\\', '/').replace(/^\.\//, '')) ?? null;
  }

  async getMetadata(): Promise<RepoMetadata | null> {
    return this.metadata;
  }
}
