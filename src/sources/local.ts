import { promises as fs } from 'node:fs';
import path from 'node:path';
import { SourceError, UsageError } from '../infra/errors.js';
import { createScope, type Scope, type ScopeOptions } from '../scope/scope.js';
import { findOriginUrl, parseGitHubUrl } from './gitRemote.js';
import type { MetadataProvider, RepoMetadata, RepoSource } from './types.js';

export interface LocalSourceOptions extends Pick<ScopeOptions, 'include' | 'exclude'> {
  /** Called only when the repo has a github.com origin; the CLI passes one only when GITHUB_TOKEN is set (FR-18). */
  metadataProvider?: MetadataProvider;
}

async function readOptional(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new SourceError(`could not read ${path.basename(file)}: ${(error as NodeJS.ErrnoException).code}`, {
      cause: error,
    });
  }
}

/** Normalises a relative path to POSIX form and rejects anything that escapes the root (NFR-4). */
export function toSafeRelative(file: string): string | null {
  const normalized = path.posix.normalize(file.replaceAll('\\', '/')).replace(/^\.\//, '');
  if (normalized === '..' || normalized.startsWith('../') || path.posix.isAbsolute(normalized)) return null;
  if (/^[A-Za-z]:/.test(normalized)) return null;
  return normalized;
}

export class LocalSource implements RepoSource {
  readonly label: string;
  readonly defaultName: string;
  private files: Promise<string[]> | null = null;
  private listed: Promise<Set<string>> | null = null;

  private constructor(
    private readonly root: string,
    private readonly scope: Scope,
    private readonly metadataProvider: MetadataProvider | undefined,
  ) {
    this.label = root;
    this.defaultName = path.basename(root);
  }

  static async create(root: string, options: LocalSourceOptions = {}): Promise<LocalSource> {
    const absolute = path.resolve(root);
    const stat = await fs.stat(absolute).catch(() => null);
    if (!stat?.isDirectory()) throw new UsageError(`path "${root}" does not exist or is not a directory`);
    const gitignore = await readOptional(path.join(absolute, '.gitignore'));
    const scope = createScope({ include: options.include, exclude: options.exclude, gitignore });
    return new LocalSource(absolute, scope, options.metadataProvider);
  }

  private listedSet(): Promise<Set<string>> {
    this.listed ??= this.listFiles().then((files) => new Set(files));
    return this.listed;
  }

  listFiles(): Promise<string[]> {
    this.files ??= this.walk('').then((files) => files.sort());
    return this.files;
  }

  async readFile(file: string): Promise<string | null> {
    const relative = toSafeRelative(file);
    // Only files in the listing are served; the walk skips symlinks, so nothing outside the root can be read (CR-1).
    if (relative === null || !(await this.listedSet()).has(relative)) return null;
    const absolute = path.resolve(this.root, relative);
    if (!absolute.startsWith(this.root + path.sep)) return null;
    return readOptional(absolute);
  }

  async getMetadata(): Promise<RepoMetadata | null> {
    if (!this.metadataProvider) return null;
    const gitConfig = await readOptional(path.join(this.root, '.git', 'config'));
    const origin = gitConfig ? findOriginUrl(gitConfig) : null;
    const repo = origin ? parseGitHubUrl(origin) : null;
    return repo ? this.metadataProvider(repo) : null;
  }

  private async walk(dir: string): Promise<string[]> {
    let entries;
    try {
      entries = await fs.readdir(path.join(this.root, dir), { withFileTypes: true });
    } catch (error) {
      throw new SourceError(
        `could not read directory ${dir || '.'}: ${(error as NodeJS.ErrnoException).code}`,
        {
          cause: error,
        },
      );
    }
    const nested = await Promise.all(
      entries.map(async (entry) => {
        const relative = dir ? `${dir}/${entry.name}` : entry.name;
        if (entry.isDirectory()) return this.scope.isListedDir(relative) ? this.walk(relative) : [];
        return entry.isFile() && this.scope.isListed(relative) ? [relative] : [];
      }),
    );
    return nested.flat();
  }
}
