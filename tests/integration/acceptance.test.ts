/**
 * Acceptance tests for DOCS-101 (AC1–AC8) and the cross-cutting NFRs, run through the real CLI entry point
 * against fixture repositories. AC9 (CI) is covered by the workflow itself plus the job-summary test in cli.test.ts.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli } from '../helpers/cli.js';
import { createFakeFetch, fakeRepoRoutes, json } from '../helpers/fakeGitHub.js';
import { copyFixture, createTempRepo, readTree } from '../helpers/tempRepo.js';

const SENTINELS = ['DOTENV_SENTINEL_VALUE', 'EXAMPLE_SENTINEL_VALUE', 'FALLBACK_SENTINEL_VALUE'];
const TOKEN = 'ghp_TOKENSENTINEL0123456789abcdefghijklmn';
const DOTENV = { '.env': 'DATABASE_URL=postgres://admin:DOTENV_SENTINEL_VALUE@prod:5432/shop\n' };

const readme = (root: string) => readFile(path.join(root, 'README.md'), 'utf8');
const noNetwork: typeof globalThis.fetch = async () => {
  throw new Error('network access is not allowed in this test');
};

describe('AC1: sync updates only the marked blocks', () => {
  it('lists env vars with their files and leaves hand-written text byte-identical', async () => {
    const root = await copyFixture('express-app', DOTENV);
    const before = await readme(root);
    const result = await runCli(['sync', '--path', root], { fetch: noNetwork });
    expect(result.code).toBe(0);

    const after = await readme(root);
    expect(after).toContain(
      [
        '| Variable | Required | Used in |',
        '| --- | --- | --- |',
        '| `API_KEY` | No | `src/middleware/auth.ts` |',
        '| `DATABASE_URL` | Yes | `src/server.ts` |',
        '| `LOG_LEVEL` | Not Found | Not Found |',
        '| `PORT` | No | `src/server.ts` |',
      ].join('\n'),
    );
    expect(after).not.toContain('TEST_ONLY_VAR');

    const outside = (text: string) =>
      text.replace(/(<!-- docsync:start (\S+) -->\n)[\s\S]*?(<!-- docsync:end \2 -->)/g, '$1$3');
    expect(outside(after)).toBe(outside(before));
  });
});

describe('AC2: sync is idempotent', () => {
  it('a second sync reports no changes and leaves the file byte-identical', async () => {
    const root = await copyFixture('express-app');
    await runCli(['sync', '--path', root]);
    const first = await readFile(path.join(root, 'README.md'));
    const second = await runCli(['sync', '--path', root]);
    expect(second.stderr).toMatch(/already up to date; no changes/);
    expect(await readFile(path.join(root, 'README.md'))).toEqual(first);
  });
});

describe('AC3: check detects a new route', () => {
  it('exits 1 and names api-endpoints and the missing route', async () => {
    const root = await copyFixture('express-app');
    await runCli(['sync', '--path', root]);
    expect((await runCli(['check', '--path', root])).code).toBe(0);

    const orders = path.join(root, 'src', 'routes', 'orders.ts');
    const code = await readFile(orders, 'utf8');
    await writeFile(
      orders,
      code.replace(
        'export default',
        "router.post('/orders', (_req, res) => res.sendStatus(201));\n\nexport default",
      ),
    );

    const result = await runCli(['check', '--path', root]);
    expect(result.code).toBe(1);
    expect(result.stdout).toMatch(/out of date in 1 section\(s\): api-endpoints/);
    expect(result.stdout).toContain('+| POST | `/api/orders` | `src/routes/orders.ts` |');
  });

  it('applies the mount prefix through middleware arguments', async () => {
    const root = await copyFixture('express-app');
    await runCli(['sync', '--path', root]);
    expect(await readme(root)).toContain('| GET | `/api/orders/:id` | `src/routes/orders.ts` |');
  });
});

describe('AC4: Not Found instead of guessing', () => {
  it('shows Not Found for a missing license and missing engines', async () => {
    const root = await createTempRepo({
      'package.json': '{"name":"bare"}',
      'src/index.js': 'console.log(1)',
      'README.md':
        '<!-- docsync:start overview -->\n<!-- docsync:end overview -->\n<!-- docsync:start setup -->\n<!-- docsync:end setup -->\n',
    });
    await runCli(['sync', '--path', root]);
    const text = await readme(root);
    expect(text).toContain('| License | Not Found |');
    expect(text).toContain('- Node.js: Not Found');
  });
});

describe('AC5 / NFR-1 / NFR-2: secrets never leak', () => {
  it('no .env value, .env.example value or code fallback appears anywhere', async () => {
    const root = await copyFixture('express-app', DOTENV);
    const outputs = [
      await runCli(['init', '--path', root, '--yes', '--debug']),
      await runCli(['sync', '--path', root, '--debug']),
      await runCli(['check', '--path', root, '--debug']),
    ];
    const everything = [
      await readme(root),
      ...outputs.flatMap((output) => [output.stdout, output.stderr]),
    ].join('\n');
    for (const sentinel of SENTINELS) expect(everything).not.toContain(sentinel);
  });

  it('the token never appears in output, even on API errors', async () => {
    const fake = createFakeFetch({
      'GET /repos/octo/app': () => json({ message: `bad token ${TOKEN}` }, 401),
    });
    const result = await runCli(['check', '--repo', 'octo/app', '--debug'], {
      env: { GITHUB_TOKEN: TOKEN },
      fetch: fake.fetch,
    });
    expect(result.code).toBe(3);
    expect(result.stderr).toMatch(/rejected the token \(401\)/);
    expect(result.stdout + result.stderr).not.toContain(TOKEN);
    expect(fake.requests[0]?.authorization).toBe(`token ${TOKEN}`);
  });
});

describe('AC8: GitHub API failures are specific and actionable', () => {
  const remoteFailure = async (status: number, headers: Record<string, string> = {}) => {
    const fake = createFakeFetch({ 'GET /repos/octo/app': () => json({ message: 'x' }, status, headers) });
    return runCli(['check', '--repo', 'octo/app'], { fetch: fake.fetch });
  };

  it.each([
    [404, {}, /octo\/app was not found, or the token has no access to it \(404\)/],
    [
      403,
      { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1790000000' },
      /rate limit reached; it resets at \d\d:\d\d/,
    ],
  ])('HTTP %i', async (status, headers, message) => {
    const result = await remoteFailure(status, headers);
    expect(result.code).toBe(3);
    expect(result.stderr).toMatch(message);
    expect(result.stderr).not.toMatch(/\n\s+at /);
  });

  it('network failure', async () => {
    const result = await runCli(['check', '--repo', 'octo/app'], {
      fetch: async () => {
        throw new TypeError('fetch failed', { cause: Object.assign(new Error('x'), { code: 'ENOTFOUND' }) });
      },
    });
    expect(result.code).toBe(3);
    expect(result.stderr).toMatch(/could not reach GitHub \(ENOTFOUND\)/);
  });
});

describe('remote mode end to end (FR-15, FR-17)', () => {
  it('produces byte-identical output to local mode for the same repository (DR-16 contract)', async () => {
    const root = await copyFixture('express-app');
    const localOut = path.join(root, 'local.md');
    await runCli(['sync', '--path', root, '--out', localOut]);

    const files = await readTree(path.join(import.meta.dirname, '..', 'fixtures', 'express-app'));
    const fake = createFakeFetch(fakeRepoRoutes(files, { repo: path.basename(root) }));
    const remote = await runCli(['sync', '--repo', `octo/${path.basename(root)}`], { fetch: fake.fetch });

    expect(remote.code).toBe(0);
    expect(remote.stdout).toBe(await readFile(localOut, 'utf8'));
    expect(new Set(fake.requests.map((request) => request.method))).toEqual(new Set(['GET']));
  });

  it("honours the repository's own docsync.config.json", async () => {
    const files = {
      'package.json': '{"name":"cfg"}',
      'src/a.ts': 'process.env.ONLY_ME',
      'docsync.config.json': '{"sections":["env-vars"]}',
      'README.md':
        '<!-- docsync:start env-vars -->\n<!-- docsync:end env-vars -->\n<!-- docsync:start setup -->\nkeep\n<!-- docsync:end setup -->\n',
    };
    const fake = createFakeFetch(fakeRepoRoutes(files));
    const result = await runCli(['sync', '--repo', 'octo/app'], { fetch: fake.fetch });
    expect(result.stdout).toContain('`ONLY_ME`');
    expect(result.stdout).toContain('<!-- docsync:start setup -->\nkeep\n');
  });
});

describe('NFR-9: local mode makes no network calls without a token', () => {
  it('works with the network disabled', async () => {
    const root = await copyFixture('express-app');
    const result = await runCli(['sync', '--path', root], { fetch: noNetwork });
    expect(result.code).toBe(0);
    expect(await readme(root)).toContain('| `/health` |');
  });
});

describe('DR-6: BOM and CRLF READMEs survive byte for byte', () => {
  it('keeps the BOM and CRLF line endings outside and inside the blocks', async () => {
    const original =
      '\uFEFF# T\r\nIntro\r\n<!-- docsync:start setup -->\r\n<!-- docsync:end setup -->\r\nOutro\r\n';
    const root = await createTempRepo({
      'package.json': '{"name":"t","scripts":{"x":"y"}}',
      'README.md': original,
    });
    await runCli(['sync', '--path', root]);
    const bytes = await readFile(path.join(root, 'README.md'));
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = bytes.toString('utf8');
    expect(text.startsWith('\uFEFF# T\r\nIntro\r\n<!-- docsync:start setup -->\r\n')).toBe(true);
    expect(text.endsWith('<!-- docsync:end setup -->\r\nOutro\r\n')).toBe(true);
    expect(text.replace(/\r\n/g, '')).not.toContain('\n');
  });
});

describe('NFR-5: performance', () => {
  it('syncs a 500-file repository in under 10 seconds', async () => {
    const files: Record<string, string> = {
      'package.json': '{"name":"big","dependencies":{"express":"^4.21.2"}}',
      'README.md':
        '<!-- docsync:start env-vars -->\n<!-- docsync:end env-vars -->\n<!-- docsync:start api-endpoints -->\n<!-- docsync:end api-endpoints -->\n',
      'src/app.ts': "import express from 'express';\nexport const app = express();\n",
    };
    for (let i = 0; i < 500; i++) {
      files[`src/modules/m${i}/routes.ts`] = [
        "import { Router } from 'express';",
        'export const router = Router();',
        `router.get('/items/${i}', (_q, s) => s.json(process.env.VAR_${i % 50} ?? null));`,
        `const helper${i} = (x: number): number => x * ${i};`,
        'export default helper' + i + ';',
      ].join('\n');
    }
    const root = await createTempRepo(files);
    const started = performance.now();
    const result = await runCli(['sync', '--path', root]);
    const seconds = (performance.now() - started) / 1000;
    expect(result.code).toBe(0);
    expect(seconds).toBeLessThan(10);
    expect((await readme(root)).match(/\| GET \|/g)).toHaveLength(500);
  }, 30_000);
});
