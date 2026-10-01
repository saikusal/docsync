import { HTTP_METHODS } from '../analysis/routes.js';
import { NOT_FOUND_TEXT } from '../core/facts.js';
import { code, compareText, table } from '../core/markdown.js';
import { defineSection } from './types.js';

export interface Endpoint {
  method: string;
  /** null when the path is computed at runtime. */
  path: string | null;
  file: string;
}

export interface ApiEndpointsFacts {
  endpoints: Endpoint[];
}

const METHOD_ORDER = HTTP_METHODS.map((method) => method.toUpperCase());

function compareEndpoints(a: Endpoint, b: Endpoint): number {
  if (a.path !== b.path) {
    if (a.path === null) return 1;
    if (b.path === null) return -1;
    const byPath = compareText(a.path, b.path);
    if (byPath !== 0) return byPath;
  }
  return METHOD_ORDER.indexOf(a.method) - METHOD_ORDER.indexOf(b.method) || compareText(a.file, b.file);
}

export const apiEndpoints = defineSection<ApiEndpointsFacts>({
  id: 'api-endpoints',
  async extract({ analysis }) {
    const { routes } = await analysis();
    // Line numbers are deliberately left out: they shift with unrelated edits and would cause drift noise.
    const unique = new Map<string, Endpoint>();
    for (const { method, path, file } of routes.routes)
      unique.set(`${method} ${path} ${file}`, { method, path, file });
    return { endpoints: [...unique.values()].sort(compareEndpoints) };
  },
  render({ endpoints }) {
    return table(
      ['Method', 'Path', 'Source'],
      endpoints.map((endpoint) => [
        endpoint.method,
        endpoint.path === null ? `${NOT_FOUND_TEXT} (dynamic)` : code(endpoint.path),
        code(endpoint.file),
      ]),
    );
  },
});
