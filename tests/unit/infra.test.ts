import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { writeFileAtomic, type AtomicWriteDeps } from '../../src/infra/atomicWrite.js';
import { ExitCode, SourceError, UsageError } from '../../src/infra/errors.js';
import { createMemoryLogger } from '../../src/infra/logger.js';
import { createRedactor } from '../../src/infra/redact.js';

describe('errors', () => {
  it('maps error classes to exit codes', () => {
    expect(new UsageError('x').exitCode).toBe(ExitCode.Usage);
    expect(new SourceError('x').exitCode).toBe(ExitCode.Source);
    expect(new UsageError('x').name).toBe('UsageError');
  });
});

describe('redactor', () => {
  it('masks literal secrets and token-shaped strings', () => {
    const redact = createRedactor(['my-super-secret-token', undefined, 'ab']);
    expect(redact('value=my-super-secret-token end')).toBe('value=*** end');
    expect(redact('ghp_abcdefghijklmnopqrstuvwxyz0123456789')).toBe('***');
    expect(redact('github_pat_11ABCDEFG0123456789_abcdefghijklmnop')).toBe('***');
    expect(redact('authorization: Bearer abc.def-ghi_jkl')).toBe('authorization: ***');
  });

  it('does not mask short literals that would destroy normal text', () => {
    expect(createRedactor(['ab'])('about tab')).toBe('about tab');
  });
});

describe('logger', () => {
  it('writes results to stdout, diagnostics to stderr, and redacts both', () => {
    const { logger, stdout, stderr } = createMemoryLogger(createRedactor(['s3cr3t-value']));
    logger.result('README with s3cr3t-value');
    logger.info('hello');
    logger.warn('token s3cr3t-value leaked?');
    logger.debug('hidden');
    expect(stdout()).toBe('README with ***');
    expect(stderr()).toBe('hello\nwarning: token *** leaked?\n');
    expect(logger.warnings).toEqual(['token *** leaked?']);
  });

  it('prints debug lines only in debug mode', () => {
    const { logger, stderr } = createMemoryLogger(undefined, true);
    logger.debug('details');
    expect(stderr()).toBe('debug: details\n');
  });
});

describe('writeFileAtomic', () => {
  it('replaces the file and leaves no temporary files behind', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'docsync-'));
    const target = path.join(dir, 'README.md');
    await writeFile(target, 'old');
    await writeFileAtomic(target, 'new');
    expect(await readFile(target, 'utf8')).toBe('new');
    expect(await readdir(dir)).toEqual(['README.md']);
  });

  function fakeDeps(renameFailures: string[]): AtomicWriteDeps & { unlink: ReturnType<typeof vi.fn> } {
    const failures = [...renameFailures];
    return {
      writeFile: vi.fn(async () => undefined),
      rename: vi.fn(async () => {
        const code = failures.shift();
        if (code) throw Object.assign(new Error(code), { code });
      }),
      unlink: vi.fn(async () => undefined),
      delay: vi.fn(async () => undefined),
    };
  }

  it('retries a locked file on Windows (EPERM/EBUSY) and then succeeds', async () => {
    const deps = fakeDeps(['EPERM', 'EBUSY']);
    await writeFileAtomic('/x/README.md', 'data', deps);
    expect(deps.rename).toHaveBeenCalledTimes(3);
    expect(deps.unlink).not.toHaveBeenCalled();
  });

  it('gives up after the retries, removes the temp file and raises a SourceError', async () => {
    const deps = fakeDeps(Array(10).fill('EBUSY'));
    await expect(writeFileAtomic('/x/README.md', 'data', deps)).rejects.toThrow(
      /is it open in another program/,
    );
    expect(deps.rename).toHaveBeenCalledTimes(6);
    expect(deps.unlink).toHaveBeenCalledTimes(1);
  });

  it('does not retry non-retryable errors', async () => {
    const deps = fakeDeps(['ENOENT']);
    await expect(writeFileAtomic('/x/README.md', 'data', deps)).rejects.toBeInstanceOf(SourceError);
    expect(deps.rename).toHaveBeenCalledTimes(1);
  });
});
