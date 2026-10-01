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

/** Reads a directory tree into a relative-path → content map. */
export async function readTree(root: string, dir = ''): Promise<Record<string, string>> {
  const { readdir, readFile } = await import('node:fs/promises');
  const files: Record<string, string> = {};
  for (const entry of await readdir(path.join(root, dir), { withFileTypes: true })) {
    const relative = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) Object.assign(files, await readTree(root, relative));
    else files[relative] = await readFile(path.join(root, relative), 'utf8');
  }
  return files;
}

/** Copies a fixture from tests/fixtures into a fresh temporary directory, with optional extra files. */
export async function copyFixture(name: string, extra: Record<string, string> = {}): Promise<string> {
  const source = path.join(import.meta.dirname, '..', 'fixtures', name);
  return createTempRepo({ ...(await readTree(source)), ...extra });
}
