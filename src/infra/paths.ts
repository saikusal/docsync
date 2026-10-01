import path from 'node:path';

/**
 * Normalises a relative path to POSIX form and rejects anything that escapes the root (NFR-4).
 * Returns null for absolute paths, drive letters and any path that climbs above the root.
 */
export function toSafeRelative(file: string): string | null {
  const normalized = path.posix.normalize(file.replaceAll('\\', '/')).replace(/^\.\//, '');
  if (normalized === '..' || normalized.startsWith('../') || path.posix.isAbsolute(normalized)) return null;
  if (/^[A-Za-z]:/.test(normalized)) return null;
  return normalized;
}
