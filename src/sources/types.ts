/** Repository facts that only the GitHub API knows. Absent values are null. */
export interface RepoMetadata {
  fullName: string;
  description: string | null;
  topics: string[];
  /** SPDX id, e.g. "MIT". */
  license: string | null;
  defaultBranch: string | null;
  latestRelease: string | null;
}

export interface GitHubRepoRef {
  owner: string;
  repo: string;
}

/** Everything downstream (pipeline, sections) reads the repository only through this interface. */
export interface RepoSource {
  /** Human-readable name for messages, e.g. "./my-app" or "octocat/hello". */
  readonly label: string;
  /** Fallback project name when package.json has none (directory or repo name). */
  readonly defaultName: string;
  /** All listed files as sorted, relative POSIX paths. Secret .env files are never included. */
  listFiles(): Promise<string[]>;
  /** File content as UTF-8, or null when the file is not listed or does not exist. */
  readFile(file: string): Promise<string | null>;
  getMetadata(): Promise<RepoMetadata | null>;
}

export type MetadataProvider = (repo: GitHubRepoRef) => Promise<RepoMetadata | null>;
