/** Regression tests for the independent agent review (docs/independent-review.md). */
import { readFile, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { compareText } from '../../src/core/markdown.js';
import { renderSections } from '../../src/core/pipeline.js';
import { maskInlineSecrets } from '../../src/core/secrets.js';
import { createMemoryLogger } from '../../src/infra/logger.js';
import { runCli } from '../helpers/cli.js';
import { createFakeFetch, fakeRepoRoutes } from '../helpers/fakeGitHub.js';
import { memorySource } from '../helpers/memorySource.js';
import { createTempRepo } from '../helpers/tempRepo.js';

const MARKED = '# App\n\n<!-- docsync:start env-vars -->\n<!-- docsync:end env-vars -->\n';
const TOKEN = 'ghp_ICRsentinel0123456789abcdefghijklmno';

describe('ICR-1: the README can never be a .env file or a file outside the root', () => {
  it('rejects --readme .env and a config that points at .env', async () => {
    const root = await createTempRepo({ '.env': 'SECRET=REAL_SECRET_SENTINEL_123', 'src/a.js': '' });
    for (const args of [
      ['sync', '--path', root, '--readme', '.env', '--out', path.join(root, 'leak.md')],
      ['init', '--path', root, '--readme', 'config/.env.production', '--yes'],
    ]) {
      const result = await runCli(args);
      expect(result.code).toBe(2);
      expect(result.stderr).toMatch(/is an environment file; docsync never reads \.env files/);
    }
    await writeFile(path.join(root, 'docsync.config.json'), '{"readme":".env"}');
    expect((await runCli(['check', '--path', root])).code).toBe(2);
    expect(await readFile(path.join(root, '.env'), 'utf8')).toBe('SECRET=REAL_SECRET_SENTINEL_123');
  });

  it('refuses a README that is a symlink to a file outside the root', async (context) => {
    const outside = await createTempRepo({ 'secret.md': MARKED.replace('# App', '# OUTSIDE_SENTINEL') });
    const root = await createTempRepo({ 'src/a.js': 'process.env.A' });
    try {
      await symlink(path.join(outside, 'secret.md'), path.join(root, 'README.md'));
    } catch {
      context.skip(); // symlinks need extra privileges on Windows
    }
    const result = await runCli(['sync', '--path', root, '--out', path.join(root, 'out.md')]);
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/outside the repository root/);
  });
});

describe('ICR-2: one invalid file never aborts the run (FR-22)', () => {
  it('skips files with recovered parse errors and keeps documenting the rest', async () => {
    const root = await createTempRepo({
      'README.md': MARKED,
      'src/bad.js': 'let y = 1;\nlet y = 2;\n',
      'src/also-bad.js': "import a from 'a';\nimport a from 'b';\n",
      'src/good.js': 'process.env.GOOD_VAR',
    });
    const result = await runCli(['sync', '--path', root]);
    expect(result.code).toBe(0);
    expect(result.stderr).toMatch(/warning: skipping src\/bad\.js:2:\d+: /);
    expect(result.stderr).toMatch(/warning: skipping src\/also-bad\.js:2:\d+: /);
    expect(await readFile(path.join(root, 'README.md'), 'utf8')).toContain('`GOOD_VAR`');
  });
});

describe('ICR-3 / ICR-4: the GitHub job summary', () => {
  it('is redacted like every other output', async () => {
    const root = await createTempRepo({
      'README.md': MARKED.replace('-->\n<!--', `-->\nleaked ${TOKEN}\n<!--`),
      'src/a.js': 'process.env.A',
    });
    const summary = path.join(root, 'summary.md');
    const result = await runCli(['check', '--path', root], {
      env: { GITHUB_STEP_SUMMARY: summary, GITHUB_TOKEN: TOKEN },
      fetch: async () => {
        throw new Error('no network');
      },
    });
    expect(result.code).toBe(1);
    const text = await readFile(summary, 'utf8');
    expect(text).toContain('leaked ***');
    expect(text).not.toContain(TOKEN);
  });

  it('keeps the drift exit code when the summary cannot be written', async () => {
    const root = await createTempRepo({ 'README.md': MARKED, 'src/a.js': 'process.env.A' });
    const result = await runCli(['check', '--path', root], {
      env: { GITHUB_STEP_SUMMARY: path.join(root, 'missing-dir', 'summary.md') },
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/could not write the job summary to GITHUB_STEP_SUMMARY \(ENOENT\)/);
  });
});

describe('ICR-5 / ICR-6 / ICR-7: clear usage errors', () => {
  it('reports a README path that is a directory', async () => {
    const root = await createTempRepo({ 'src/a.js': '' });
    const result = await runCli(['check', '--path', root, '--readme', 'src']);
    expect(result.code).toBe(2);
    expect(result.stderr).toBe('error: README path "src" is a directory, not a file\n');
  });

  it('treats a missing --config file as a usage error (exit 2)', async () => {
    const root = await createTempRepo({ 'README.md': MARKED, 'src/a.js': '' });
    const result = await runCli(['check', '--path', root, '--config', path.join(root, 'nope.json')]);
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/config file .*nope\.json does not exist/);
  });

  it('accepts file names that merely start with two dots', async () => {
    const root = await createTempRepo({ '..notes.md': MARKED, 'src/a.js': 'process.env.A' });
    const result = await runCli(['sync', '--path', root, '--readme', '..notes.md']);
    expect(result.code).toBe(0);
    expect(await readFile(path.join(root, '..notes.md'), 'utf8')).toContain('`A`');
  });
});

describe('ICR-8: markers in indented code blocks are documentation, not markers', () => {
  it('ignores markers indented by four or more spaces', async () => {
    const root = await createTempRepo({
      'README.md': '# x\n\nExample:\n\n    <!-- docsync:start setup -->\n    <!-- docsync:end setup -->\n',
      'src/a.js': '',
    });
    const result = await runCli(['check', '--path', root]);
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/has no docsync markers/);
  });

  it('still accepts up to three spaces', async () => {
    const root = await createTempRepo({
      'README.md': '   <!-- docsync:start env-vars -->\n   <!-- docsync:end env-vars -->\n',
      'src/a.js': 'process.env.A',
    });
    expect((await runCli(['sync', '--path', root])).code).toBe(0);
  });
});

describe('IDR-4: inline secrets in npm scripts are masked', () => {
  it.each([
    ['API_KEY=abc123 node server.js', 'API_KEY=*** node server.js'],
    ['cross-env DB_PASSWORD="p a s s" npm start', 'cross-env DB_PASSWORD=*** npm start'],
    [
      'curl -H "Authorization: Bearer abcdef123456" https://x',
      'curl -H "Authorization: Bearer ***" https://x',
    ],
    [
      'npm config set //registry.npmjs.org/:_authToken=npm_abcdef',
      'npm config set //registry.npmjs.org/:_authToken=***',
    ],
    ['psql postgres://admin:hunter2@db:5432/app', 'psql postgres://***@db:5432/app'],
    ['echo ghp_abcdefghijklmnopqrstuvwxyz0123456789', 'echo ***'],
    ['node dist/server.js --port 3000', 'node dist/server.js --port 3000'],
    ['| `API_KEY` | Yes | `src/a.ts` |', '| `API_KEY` | Yes | `src/a.ts` |'],
  ])('%s', (input, expected) => {
    expect(maskInlineSecrets(input)).toBe(expected);
  });

  it('never writes a script secret into the README', async () => {
    const root = await createTempRepo({
      'package.json': JSON.stringify({
        name: 'a',
        scripts: { deploy: 'DEPLOY_TOKEN=SCRIPT_SENTINEL_42 ./deploy.sh' },
      }),
      'README.md': '<!-- docsync:start setup -->\n<!-- docsync:end setup -->\n',
    });
    await runCli(['sync', '--path', root]);
    const text = await readFile(path.join(root, 'README.md'), 'utf8');
    expect(text).toContain('DEPLOY_TOKEN=*** ./deploy.sh');
    expect(text).not.toContain('SCRIPT_SENTINEL_42');
  });
});

describe('IDR-12: remote mode reads large manifests', () => {
  it('reads a package-lock.json over 1 MB, so the output matches local mode', async () => {
    const files = {
      'package.json': '{"name":"big","dependencies":{"express":"^4.0.0"}}',
      'package-lock.json': JSON.stringify({
        lockfileVersion: 3,
        packages: { 'node_modules/express': { version: '4.21.2' } },
      }),
      'README.md':
        '<!-- docsync:start setup -->\n<!-- docsync:end setup -->\n<!-- docsync:start tech-stack -->\n<!-- docsync:end tech-stack -->\n',
    };
    const fake = createFakeFetch(fakeRepoRoutes(files, { sizes: { 'package-lock.json': 3_000_000 } }));
    const result = await runCli(['sync', '--repo', 'octo/app'], { fetch: fake.fetch });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('npm ci');
    expect(result.stdout).toContain('`4.21.2`');
  });
});

describe('IDR-16: sorting does not depend on locale', () => {
  it('orders by UTF-16 code unit', () => {
    expect(['b', 'B', '_x', 'a', 'A', '-y'].sort(compareText)).toEqual(['-y', 'A', 'B', '_x', 'a', 'b']);
  });
});

describe('ICR-14: GitHub metadata is fetched only when a section needs it', () => {
  it('does not call getMetadata when overview is not rendered', async () => {
    const source = memorySource({ 'src/a.js': 'process.env.A', 'package.json': '{"name":"x"}' });
    const spy = vi.spyOn(source, 'getMetadata');
    const { logger } = createMemoryLogger();
    await renderSections(source, { sections: ['env-vars', 'setup'], logger });
    expect(spy).not.toHaveBeenCalled();
    await renderSections(source, { sections: ['overview'], logger });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('remote README is fetched even though it is neither source nor manifest (IDR-1 already handled)', () => {
  it('syncs a remote README', async () => {
    const files = { 'src/a.js': 'process.env.REMOTE_VAR', 'README.md': MARKED };
    const fake = createFakeFetch(fakeRepoRoutes(files));
    const result = await runCli(['sync', '--repo', 'octo/app'], { fetch: fake.fetch });
    expect(result.stdout).toContain('`REMOTE_VAR`');
  });
});
