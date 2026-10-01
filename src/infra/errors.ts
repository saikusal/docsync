export const ExitCode = {
  Ok: 0,
  Drift: 1,
  Usage: 2,
  Source: 3,
} as const;

export type ErrorExitCode = typeof ExitCode.Usage | typeof ExitCode.Source;

/** Base class for every expected failure. The CLI maps `exitCode` to the process exit code. */
export class DocsyncError extends Error {
  constructor(
    message: string,
    readonly exitCode: ErrorExitCode,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** Bad flags, invalid config, missing or malformed markers. Exit code 2. */
export class UsageError extends DocsyncError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, ExitCode.Usage, options);
  }
}

/** Empty repository, GitHub API failure, file-system failure. Exit code 3. */
export class SourceError extends DocsyncError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, ExitCode.Source, options);
  }
}
