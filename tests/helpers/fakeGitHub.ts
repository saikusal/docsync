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
