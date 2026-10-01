import { describe, expect, it } from 'vitest';
import { mapLimit } from '../../src/infra/concurrency.js';
import { SourceError } from '../../src/infra/errors.js';
import { createMemoryLogger } from '../../src/infra/logger.js';
import { GitHubSource, createMetadataProvider } from '../../src/sources/github.js';
import { createGitHubClient } from '../../src/sources/githubClient.js';
import { createFakeFetch, fakeRepoRoutes, json, type FakeRepoOptions } from '../helpers/fakeGitHub.js';

const FILES = {
  'package.json': '{"name":"app"}',
  '.gitignore': 'generated/\n',
  '.env.example': 'API_KEY=',
  '.env': 'API_KEY=REAL_SENTINEL_VALUE',
  'src/app.ts': 'export {}',
  'src/app.test.ts': 'test',
  'docs/guide.md': '# guide',
  'generated/client.ts': 'x',
  'node_modules/x/index.js': 'x',
};

async function load(files: Record<string, string> = FILES, options: FakeRepoOptions = {}, ref?: string) {
  const fake = createFakeFetch(fakeRepoRoutes(files, options));
  const client = createGitHubClient({ fetch: fake.fetch, retries: 0 });
  const { logger, stderr } = createMemoryLogger();
  const source = await GitHubSource.create(client, { owner: 'octo', repo: 'app' }, { logger, ref });
  return { source, requests: fake.requests, stderr };
}

describe('GitHubSource (FR-17)', () => {
  it('lists files with the same scope rules as local mode', async () => {
    const { source } = await load();
    expect(await source.listFiles()).toEqual([
      '.env.example',
      '.gitignore',
      'docs/guide.md',
      'package.json',
      'src/app.test.ts',
      'src/app.ts',
    ]);
    expect(source.label).toBe('octo/app');
    expect(source.defaultName).toBe('app');
  });

  it('downloads only sources and manifests, never .env (NFR-1, NFR-6)', async () => {
    const { source, requests } = await load();
    const blobPaths = requests.filter((request) => request.path.includes('/git/blobs/'));
    // .gitignore (once, for the scope), package.json, .env.example, src/app.ts
    expect(blobPaths).toHaveLength(4);
    expect(await source.readFile('src/app.ts')).toBe('export {}');
    expect(await source.readFile('package.json')).toBe('{"name":"app"}');
    expect(await source.readFile('.env')).toBeNull();
    expect(await source.readFile('docs/guide.md')).toBeNull();
    expect(requests.map((request) => request.path).join(' ')).not.toContain('contents');
  });

  it('uses only GET requests (NFR-3)', async () => {
    const { requests } = await load();
    expect(new Set(requests.map((request) => request.method))).toEqual(new Set(['GET']));
  });

  it('returns metadata including license, topics and latest release', async () => {
    const { source } = await load(FILES, {
      description: 'An app',
      topics: ['b', 'a'],
      license: 'MIT',
      release: 'v1.2.0',
    });
    expect(await source.getMetadata()).toEqual({
      fullName: 'octo/app',
      description: 'An app',
      topics: ['a', 'b'],
      license: 'MIT',
      defaultBranch: 'main',
      latestRelease: 'v1.2.0',
    });
  });

  it('resolves an explicit ref to one commit SHA', async () => {
    const routes = fakeRepoRoutes(FILES);
    routes['GET /repos/octo/app/commits/v2'] = () => json({ sha: 'c2', commit: { tree: { sha: 'tree1' } } });
    const fake = createFakeFetch(routes);
    const { logger } = createMemoryLogger();
    await GitHubSource.create(
      createGitHubClient({ fetch: fake.fetch }),
      { owner: 'octo', repo: 'app' },
      { logger, ref: 'v2' },
    );
    expect(fake.requests.some((request) => request.path === '/repos/octo/app/commits/v2')).toBe(true);
  });

  it('skips symlinks, submodules and files over 1 MB (DR-3)', async () => {
    const { source, stderr } = await load(
      { 'src/big.js': 'x', 'src/ok.js': 'y' },
      {
        sizes: { 'src/big.js': 2_000_000 },
        extraEntries: [
          { path: 'src/link.js', mode: '120000', type: 'blob', sha: 'l1' },
          { path: 'vendor/lib', mode: '160000', type: 'commit', sha: 's1' },
        ],
      },
    );
    expect(await source.listFiles()).toEqual(['src/big.js', 'src/ok.js']);
    expect(await source.readFile('src/big.js')).toBeNull();
    expect(stderr()).toMatch(/skipping src\/big.js: larger than 1 MB/);
    expect(stderr()).toMatch(/skipping submodule vendor\/lib/);
  });

  it('fails on a truncated tree instead of producing partial docs (DR-5)', async () => {
    await expect(load(FILES, { truncated: true })).rejects.toThrow(/too large for remote mode/);
  });

  it('fails fast when the rate limit cannot cover the needed requests (DR-4)', async () => {
    const promise = load(FILES, { rateLimitRemaining: 3 });
    await expect(promise).rejects.toBeInstanceOf(SourceError);
    await expect(promise).rejects.toThrow(/needs about 4 GitHub API requests but only 3 remain/);
  });

  it('reports an empty repository (FR-20, AC7)', async () => {
    const routes = fakeRepoRoutes({});
    routes['GET /repos/octo/app/commits/main'] = () => json({ message: 'Git Repository is empty.' }, 409);
    const fake = createFakeFetch(routes);
    const { logger } = createMemoryLogger();
    await expect(
      GitHubSource.create(
        createGitHubClient({ fetch: fake.fetch }),
        { owner: 'octo', repo: 'app' },
        { logger },
      ),
    ).rejects.toThrow('repository octo/app is empty');
  });

  it('reports a missing repository (AC8)', async () => {
    const fake = createFakeFetch({ 'GET /repos/octo/app': () => json({ message: 'Not Found' }, 404) });
    const { logger } = createMemoryLogger();
    await expect(
      GitHubSource.create(
        createGitHubClient({ fetch: fake.fetch }),
        { owner: 'octo', repo: 'app' },
        { logger },
      ),
    ).rejects.toThrow(/was not found/);
  });
});

describe('createMetadataProvider', () => {
  it('fetches metadata for local mode and treats NOASSERTION as no license', async () => {
    const routes = fakeRepoRoutes({}, { license: 'NOASSERTION' });
    const fake = createFakeFetch(routes);
    const metadata = await createMetadataProvider(createGitHubClient({ fetch: fake.fetch }))({
      owner: 'octo',
      repo: 'app',
    });
    expect(metadata?.license).toBeNull();
    expect(metadata?.latestRelease).toBeNull();
  });
});

describe('mapLimit', () => {
  it('keeps order and never exceeds the limit', async () => {
    let active = 0;
    let peak = 0;
    const result = await mapLimit([1, 2, 3, 4, 5, 6], 2, async (n) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      return n * 10;
    });
    expect(result).toEqual([10, 20, 30, 40, 50, 60]);
    expect(peak).toBe(2);
  });
});

describe('unknown --ref (verification finding V-1)', () => {
  it.each([404, 422])('names the ref when GitHub answers %i', async (status) => {
    const routes = fakeRepoRoutes({ 'src/a.ts': '' });
    routes['GET /repos/octo/app/commits/nope'] = () =>
      json({ message: 'No commit found for SHA: nope' }, status);
    const fake = createFakeFetch(routes);
    const { logger } = createMemoryLogger();
    await expect(
      GitHubSource.create(
        createGitHubClient({ fetch: fake.fetch }),
        { owner: 'octo', repo: 'app' },
        { logger, ref: 'nope' },
      ),
    ).rejects.toThrow('ref "nope" was not found in octo/app; check the branch, tag or commit name');
  });
});
