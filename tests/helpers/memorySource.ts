import { createMemoryLogger } from '../../src/infra/logger.js';
import { buildContext } from '../../src/core/context.js';
import { createScope } from '../../src/scope/scope.js';
import type { RepoMetadata, RepoSource } from '../../src/sources/types.js';

/** An in-memory RepoSource with the same listing rules as the real sources. */
export function memorySource(
  files: Record<string, string>,
  metadata: RepoMetadata | null = null,
  name = 'memory-repo',
): RepoSource {
  const scope = createScope({ gitignore: files['.gitignore'] ?? null });
  const listed = Object.keys(files)
    .filter((file) => scope.isListed(file))
    .sort();
  return {
    label: name,
    defaultName: name,
    listFiles: async () => listed,
    readFile: async (file) => (listed.includes(file) ? (files[file] ?? null) : null),
    getMetadata: async () => metadata,
  };
}

export async function contextFor(files: Record<string, string>, metadata: RepoMetadata | null = null) {
  const memory = createMemoryLogger();
  const context = await buildContext(memorySource(files, metadata), {}, memory.logger);
  return { context, stderr: memory.stderr };
}
