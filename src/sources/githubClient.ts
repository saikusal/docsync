import { retry } from '@octokit/plugin-retry';
import { throttling } from '@octokit/plugin-throttling';
import { Octokit } from '@octokit/rest';
import { SourceError } from '../infra/errors.js';
import { VERSION } from '../version.js';

const DocsyncOctokit = Octokit.plugin(throttling, retry);
export type GitHubClient = InstanceType<typeof DocsyncOctokit>;

const REQUEST_TIMEOUT_MS = 30_000;
const silentLog = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

export interface GitHubClientOptions {
  /** Read from process.env.GITHUB_TOKEN by the caller; never from a CLI flag (NFR-2). */
  token?: string | undefined;
  fetch?: typeof globalThis.fetch;
  /** Retries for 5xx and network errors. */
  retries?: number;
  /** Base delay between retries in ms (lowered in tests). */
  retryAfterBaseValue?: number;
}

function withTimeout(fetchImpl: typeof globalThis.fetch): typeof globalThis.fetch {
  return (input, init) =>
    fetchImpl(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
}

export function createGitHubClient({
  token,
  fetch = globalThis.fetch,
  retries = 2,
  retryAfterBaseValue = 1000,
}: GitHubClientOptions = {}): GitHubClient {
  return new DocsyncOctokit({
    auth: token || undefined,
    userAgent: `docsync/${VERSION}`,
    log: silentLog,
    // Retries are configured only via the retry plugin: a request-level `retries` makes the
    // throttling plugin retry primary rate-limit errors, wasting quota.
    request: { fetch: withTimeout(fetch) },
    retry: { retries, retryAfterBaseValue, doNotRetry: [400, 401, 403, 404, 410, 422, 429, 451] },
    throttle: {
      // Primary limit: fail with a clear message instead of waiting up to an hour.
      onRateLimit: () => false,
      // Secondary (abuse) limit: wait once, as GitHub asks, then give up.
      onSecondaryRateLimit: (_retryAfter: number, _options: unknown, _octokit: unknown, retryCount: number) =>
        retryCount < 1,
    },
  });
}

interface RequestErrorLike {
  status?: number;
  response?: { headers?: Record<string, string | number | undefined> };
  code?: string;
  name?: string;
  cause?: unknown;
}

function header(error: RequestErrorLike, name: string): string | undefined {
  const value = error.response?.headers?.[name];
  return value === undefined ? undefined : String(value);
}

function networkReason(error: RequestErrorLike): string {
  const cause = error.cause as RequestErrorLike | undefined;
  const nested = (cause?.cause as RequestErrorLike | undefined)?.code;
  return (
    cause?.code ??
    nested ??
    (cause?.name === 'TimeoutError' ? 'timeout' : (cause?.name ?? error.name ?? 'unknown'))
  );
}

export function formatLocalTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** Turns any Octokit/fetch error into a specific, actionable SourceError (FR-21). Never includes the token. */
export function mapGitHubError(error: unknown, repoLabel: string): SourceError {
  if (error instanceof SourceError) return error;
  const e = (error ?? {}) as RequestErrorLike;
  const status = e.status;
  const options = { cause: error };

  if (status === undefined || (status >= 500 && !e.response)) {
    return new SourceError(
      `could not reach GitHub (${networkReason(e)}); check your network connection and try again`,
      options,
    );
  }
  if (status === 401) {
    return new SourceError(
      'GitHub rejected the token (401): check that GITHUB_TOKEN is valid and not expired',
      options,
    );
  }
  if ((status === 403 || status === 429) && header(e, 'x-ratelimit-remaining') === '0') {
    const reset = Number(header(e, 'x-ratelimit-reset'));
    const when =
      Number.isFinite(reset) && reset > 0
        ? `; it resets at ${formatLocalTime(new Date(reset * 1000))} (local time)`
        : '';
    return new SourceError(
      `GitHub API rate limit reached${when}. Set GITHUB_TOKEN for a higher limit`,
      options,
    );
  }
  if (status === 403 || status === 429) {
    return new SourceError(
      `GitHub refused the request (${status}) for ${repoLabel}: the token may lack read access, or a secondary rate limit was hit`,
      options,
    );
  }
  if (status === 404) {
    return new SourceError(
      `repository ${repoLabel} was not found, or the token has no access to it (404)`,
      options,
    );
  }
  if (status === 409) return new SourceError(`repository ${repoLabel} is empty`, options);
  if (status >= 500) {
    return new SourceError(
      `GitHub returned a server error (${status}) after retries; try again later`,
      options,
    );
  }
  return new SourceError(`GitHub request for ${repoLabel} failed (${status})`, options);
}
