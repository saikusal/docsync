import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { SourceError } from './errors.js';

const RETRYABLE_CODES = new Set(['EPERM', 'EBUSY', 'EACCES']);
const RETRY_DELAYS_MS = [50, 100, 200, 400, 800];

export interface AtomicWriteDeps {
  writeFile: (file: string, data: string | Uint8Array) => Promise<void>;
  rename: (from: string, to: string) => Promise<void>;
  unlink: (file: string) => Promise<void>;
  delay: (ms: number) => Promise<unknown>;
}

const defaultDeps: AtomicWriteDeps = {
  writeFile: (file, data) => fs.writeFile(file, data),
  rename: (from, to) => fs.rename(from, to),
  unlink: (file) => fs.unlink(file),
  delay: (ms) => sleep(ms),
};

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : undefined;
}

/**
 * Writes via a temporary file in the same directory and a rename, so readers never see a half-written file.
 * On Windows the rename can fail while another process holds the file open; it is retried with back-off.
 */
export async function writeFileAtomic(
  target: string,
  data: string | Uint8Array,
  deps: AtomicWriteDeps = defaultDeps,
): Promise<void> {
  const temp = path.join(
    path.dirname(target),
    `.${path.basename(target)}.docsync-${randomBytes(6).toString('hex')}.tmp`,
  );
  try {
    await deps.writeFile(temp, data);
  } catch (error) {
    throw new SourceError(
      `could not write ${path.basename(target)}: ${errorCode(error) ?? 'unknown error'}`,
      {
        cause: error,
      },
    );
  }

  for (let attempt = 0; ; attempt++) {
    try {
      await deps.rename(temp, target);
      return;
    } catch (error) {
      const code = errorCode(error);
      const delay = RETRY_DELAYS_MS[attempt];
      if (code !== undefined && RETRYABLE_CODES.has(code) && delay !== undefined) {
        await deps.delay(delay);
        continue;
      }
      await deps.unlink(temp).catch(() => undefined);
      throw new SourceError(
        `could not replace ${path.basename(target)} (${code ?? 'unknown error'}); is it open in another program?`,
        { cause: error },
      );
    }
  }
}
