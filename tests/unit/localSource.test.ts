import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { UsageError } from '../../src/infra/errors.js';
import { findOriginUrl, parseGitHubUrl } from '../../src/sources/gitRemote.js';
import { LocalSource, toSafeRelative } from '../../src/sources/local.js';
import { createTempRepo } from '../helpers/tempRepo.js';

describe('LocalSource', () => {
  it('lists files sorted, skipping dependencies, build output, gitignored files and .env (NFR-1)', async () => {
    const root = await createTempRepo({
      'package.json': '{}',
      '.gitignore': 'generated/\n',
      '.env': 'SECRET=REAL_SENTINEL_VALUE',
      '.env.local': 'x',
      '.env.example': 'SECRET=',
      'src/app.ts': '',
      'src/routes/orders.ts': '',
      'tests/app.test.ts': '',
      'node_modules/express/index.js': '',
      'dist/cli.js': '',
      'generated/client.ts': '',
    });
    const source = await LocalSource.create(root);
    expect(await source.listFiles()).toEqual([
      '.env.example',
      '.gitignore',
      'package.json',
      'src/app.ts',
      'src/routes/orders.ts',
      'tests/app.test.ts',
    ]);
    expect(source.defaultName).toBe(path.basename(root));
  });

  it('reads listed files and refuses .env, unlisted and escaping paths (NFR-4)', async () => {
    const root = await createTempRepo({
      'package.json': '{"name":"x"}',
      '.env': 'SECRET=1',
      'src/a.ts': 'a',
    });
    const source = await LocalSource.create(root);
    expect(await source.readFile('package.json')).toBe('{"name":"x"}');
    expect(await source.readFile('src\\a.ts')).toBe('a');
    expect(await source.readFile('.env')).toBeNull();
    expect(await source.readFile('../outside.txt')).toBeNull();
    expect(await source.readFile('src/../../outside.txt')).toBeNull();
    expect(await source.readFile('missing.ts')).toBeNull();
  });

  it('returns an empty listing for an empty directory', async () => {
    const source = await LocalSource.create(await createTempRepo({}));
    expect(await source.listFiles()).toEqual([]);
  });

  it('rejects a path that does not exist', async () => {
    await expect(LocalSource.create(path.join(await createTempRepo({}), 'nope'))).rejects.toBeInstanceOf(
      UsageError,
    );
  });

  it('asks the metadata provider only when origin is on github.com (FR-18)', async () => {
    const provider = vi.fn(async () => null);
    const github = await createTempRepo({
      '.git/config':
        '[core]\n\tbare = false\n[remote "origin"]\n\turl = https://github.com/saikusal/docsync.git\n',
    });
    await (await LocalSource.create(github, { metadataProvider: provider })).getMetadata();
    expect(provider).toHaveBeenCalledWith({ owner: 'saikusal', repo: 'docsync' });

    provider.mockClear();
    const gitlab = await createTempRepo({
      '.git/config': '[remote "origin"]\n\turl = https://gitlab.com/a/b.git\n',
    });
    expect(await (await LocalSource.create(gitlab, { metadataProvider: provider })).getMetadata()).toBeNull();
    expect(provider).not.toHaveBeenCalled();

    expect(await (await LocalSource.create(github)).getMetadata()).toBeNull();
  });
});

describe('git remote parsing', () => {
  it.each([
    ['https://github.com/a/b.git', { owner: 'a', repo: 'b' }],
    ['https://github.com/a/b', { owner: 'a', repo: 'b' }],
    ['https://user@github.com/a/b.git', { owner: 'a', repo: 'b' }],
    ['git@github.com:a/b.git', { owner: 'a', repo: 'b' }],
    ['ssh://git@github.com/a/my.repo.git', { owner: 'a', repo: 'my.repo' }],
    ['https://gitlab.com/a/b.git', null],
  ])('parses %s', (url, expected) => {
    expect(parseGitHubUrl(url)).toEqual(expected);
  });

  it('finds the origin url, not other remotes', () => {
    const config =
      '[remote "upstream"]\n url = https://github.com/u/u\n[remote "origin"]\n url = git@github.com:o/r.git\n';
    expect(findOriginUrl(config)).toBe('git@github.com:o/r.git');
    expect(findOriginUrl('[core]\n')).toBeNull();
  });
});

describe('toSafeRelative', () => {
  it.each([
    ['./src/a.ts', 'src/a.ts'],
    ['src\\a.ts', 'src/a.ts'],
    ['../a', null],
    ['/etc/passwd', null],
    ['C:/x', null],
    ['a/../../b', null],
  ])('%s → %s', (input, expected) => {
    expect(toSafeRelative(input)).toBe(expected);
  });
});
