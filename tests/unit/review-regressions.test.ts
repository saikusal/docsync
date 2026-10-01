/** Regression tests for the Phase 6 code-review findings (docs/code-review.md). */
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { File } from '@babel/types';
import { describe, expect, it } from 'vitest';
import { parseSource } from '../../src/analysis/parse.js';
import { analyseRoutes } from '../../src/analysis/routes.js';
import { LocalSource } from '../../src/sources/local.js';
import { runCli } from '../helpers/cli.js';
import { createFakeFetch, json } from '../helpers/fakeGitHub.js';
import { createTempRepo } from '../helpers/tempRepo.js';

describe('CR-1: LocalSource never reads outside the root through a symlink', () => {
  it('serves only listed files', async (context) => {
    const outside = await createTempRepo({ 'package.json': '{"name":"OUTSIDE_SENTINEL"}' });
    const root = await createTempRepo({ 'src/a.ts': '' });
    try {
      await symlink(path.join(outside, 'package.json'), path.join(root, 'package.json'));
    } catch {
      context.skip(); // creating symlinks needs extra privileges on Windows
    }
    const source = await LocalSource.create(root);
    expect(await source.listFiles()).toEqual(['src/a.ts']);
    expect(await source.readFile('package.json')).toBeNull();
  });
});

describe('CR-2: optional GitHub metadata never aborts local mode', () => {
  it('warns and shows Not Found when the metadata request fails', async () => {
    const root = await createTempRepo({
      '.git/config': '[remote "origin"]\n\turl = https://github.com/octo/private.git\n',
      'package.json': '{"name":"p"}',
      'README.md': '<!-- docsync:start overview -->\n<!-- docsync:end overview -->\n',
    });
    const fake = createFakeFetch({
      'GET /repos/octo/private': () => json({ message: 'Bad credentials' }, 401),
    });
    const result = await runCli(['sync', '--path', root], {
      env: { GITHUB_TOKEN: 'ghp_0123456789abcdefghijklmnopqrstuvwxyz' },
      fetch: fake.fetch,
    });
    expect(result.code).toBe(0);
    expect(result.stderr).toMatch(/warning: could not read GitHub metadata for octo\/private .*Not Found/);
    expect(await readFile(path.join(root, 'README.md'), 'utf8')).toContain('| Topics | Not Found |');
  });
});

describe('CR-3: app.use with an array of paths', () => {
  it('mounts the router at every listed path', () => {
    const code = `
      const express = require('express');
      const app = express();
      const r = express.Router();
      r.get('/x', h);
      app.use(['/a', '/b'], r);
      app.use([dynamic], r);`;
    const parsed = parseSource('src/app.js', code);
    if (!parsed.ok) throw new Error(parsed.error.message);
    const routes = analyseRoutes(new Map<string, File>([['src/app.js', parsed.ast]])).routes;
    expect(routes.map((route) => route.path ?? '<dynamic>').sort()).toEqual(['/a/x', '/b/x', '<dynamic>']);
  });
});

describe('CR-4: sync --out writes even when nothing changed', () => {
  it('creates the output file for an up-to-date README', async () => {
    const root = await createTempRepo({
      'package.json': '{"name":"a"}',
      'README.md': '<!-- docsync:start setup -->\n<!-- docsync:end setup -->\n',
    });
    await runCli(['sync', '--path', root]);
    const out = path.join(root, 'copy.md');
    expect((await runCli(['sync', '--path', root, '--out', out])).code).toBe(0);
    expect(await readFile(out, 'utf8')).toBe(await readFile(path.join(root, 'README.md'), 'utf8'));
  });
});

describe('CR-5: init reports malformed markers with the real README path', () => {
  it('names the configured README file', async () => {
    const root = await createTempRepo({ 'package.json': '{"name":"a"}' });
    await mkdir(path.join(root, 'docs'));
    await writeFile(path.join(root, 'docs', 'INDEX.md'), '# x\n<!-- docsync:start setup -->\n');
    const result = await runCli(['init', '--path', root, '--readme', 'docs/INDEX.md', '--yes']);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('docs/INDEX.md:2: start marker for "setup" has no matching end marker');
  });
});
