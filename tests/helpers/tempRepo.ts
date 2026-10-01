import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** Creates a temporary directory containing the given files (relative POSIX path → content). */
export async function createTempRepo(files: Record<string, string | Uint8Array>): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'docsync-repo-'));
  for (const [file, content] of Object.entries(files)) {
    const absolute = path.join(root, ...file.split('/'));
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, content);
  }
  return root;
}
