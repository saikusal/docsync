export type Route = (url: URL, init: RequestInit | undefined) => Response | Promise<Response>;

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'x-ratelimit-remaining': '4999', ...headers },
  });
}

/**
 * A fetch replacement that serves GitHub API routes from a table, records every request,
 * and fails the test on any unexpected request. No network access is ever made (NFR-9).
 */
export function createFakeFetch(routes: Record<string, Route>) {
  const requests: { method: string; path: string; authorization: string | null }[] = [];
  const fetchImpl: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = (init?.method ?? 'GET').toUpperCase();
    const headers = new Headers(init?.headers);
    requests.push({ method, path: url.pathname + url.search, authorization: headers.get('authorization') });
    const key = `${method} ${url.pathname}`;
    const route = routes[key];
    if (!route) return json({ message: `no fake route for ${key}` }, 599);
    return route(url, init);
  };
  return { fetch: fetchImpl, requests };
}

export interface FakeRepoOptions {
  owner?: string;
  repo?: string;
  description?: string | null;
  topics?: string[];
  license?: string | null;
  release?: string | null;
  truncated?: boolean;
  rateLimitRemaining?: number;
  /** Extra raw tree entries (symlinks, submodules). */
  extraEntries?: { path: string; mode: string; type: string; sha: string; size?: number }[];
  /** Override reported sizes. */
  sizes?: Record<string, number>;
}

/** Serves a whole repository (metadata, commit, tree, blobs, latest release) through the fake fetch. */
export function fakeRepoRoutes(
  files: Record<string, string>,
  options: FakeRepoOptions = {},
): Record<string, Route> {
  const { owner = 'octo', repo = 'app' } = options;
  const base = `/repos/${owner}/${repo}`;
  const entries = Object.entries(files).map(([path, content], index) => ({
    path,
    mode: '100644',
    type: 'blob',
    sha: `blob${index}`,
    size: options.sizes?.[path] ?? Buffer.byteLength(content),
    content,
  }));
  const blobs = new Map(entries.map((entry) => [entry.sha, entry.content]));
  const limit = { 'x-ratelimit-remaining': String(options.rateLimitRemaining ?? 4999) };

  return {
    [`GET ${base}`]: () =>
      json({
        full_name: `${owner}/${repo}`,
        description: options.description ?? null,
        topics: options.topics ?? [],
        license: options.license ? { spdx_id: options.license } : null,
        default_branch: 'main',
      }),
    [`GET ${base}/commits/main`]: () => json({ sha: 'commit1', commit: { tree: { sha: 'tree1' } } }),
    [`GET ${base}/git/trees/tree1`]: () =>
      json(
        {
          sha: 'tree1',
          truncated: options.truncated ?? false,
          tree: [...entries.map(({ content: _content, ...entry }) => entry), ...(options.extraEntries ?? [])],
        },
        200,
        limit,
      ),
    ...Object.fromEntries(
      [...blobs].map(([sha, content]) => [
        `GET ${base}/git/blobs/${sha}`,
        () => json({ sha, encoding: 'base64', content: Buffer.from(content).toString('base64') }),
      ]),
    ),
    [`GET ${base}/releases/latest`]: () =>
      options.release ? json({ tag_name: options.release }) : json({ message: 'Not Found' }, 404),
  };
}
