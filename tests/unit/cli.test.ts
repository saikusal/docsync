import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli } from '../helpers/cli.js';
import { createTempRepo } from '../helpers/tempRepo.js';

const MARKED = '# App\n\n<!-- docsync:start setup -->\n<!-- docsync:end setup -->\n';
const PKG = '{"name":"app","scripts":{"test":"vitest"}}';

describe('CLI basics (FR-1)', () => {
  it('prints help listing all commands, and the version', async () => {
    const help = await runCli(['--help']);
    expect(help.code).toBe(0);
    for (const command of ['init', 'sync', 'check']) expect(help.stdout).toContain(command);
    const version = await runCli(['--version']);
    expect(version.code).toBe(0);
    expect(version.stdout).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('documents every option in command help (NFR-11)', async () => {
    const { stdout } = await runCli(['sync', '--help']);
    for (const option of [
      '--path',
      '--repo',
      '--ref',
      '--readme',
      '--config',
      '--sections',
      '--out',
      '--debug',
    ]) {
      expect(stdout).toContain(option);
    }
  });

  it('exits 2 on unknown commands, unknown options and --path with --repo', async () => {
    expect((await runCli(['bogus'])).code).toBe(2);
    expect((await runCli(['sync', '--nope'])).code).toBe(2);
    const both = await runCli(['sync', '--path', '.', '--repo', 'a/b']);
    expect(both.code).toBe(2);
    expect(both.stderr).toContain('use either --path or --repo, not both');
  });

  it('exits 2 with a clear message for a bad config file (FR-2)', async () => {
    const root = await createTempRepo({ 'README.md': MARKED, 'docsync.config.json': '{"sections":"setup"}' });
    const result = await runCli(['sync', '--path', root]);
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/invalid docsync.config.json: sections/);
  });
});

describe('init (FR-6, DR-12)', () => {
  it('refuses to prompt when not interactive and --yes is missing', async () => {
    const root = await createTempRepo({ 'package.json': PKG });
    const result = await runCli(['init', '--path', root]);
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/re-run with --yes/);
  });

  it('creates a README with all blocks, titled from package.json', async () => {
    const root = await createTempRepo({ 'package.json': PKG });
    expect((await runCli(['init', '--path', root, '--yes'])).code).toBe(0);
    const readme = await readFile(path.join(root, 'README.md'), 'utf8');
    expect(readme).toMatch(/^# app\n/);
    expect(readme.match(/docsync:start/g)).toHaveLength(6);
  });

  it('asks for confirmation interactively and respects "no"', async () => {
    const root = await createTempRepo({ 'README.md': '# Mine\n' });
    const result = await runCli(['init', '--path', root], {
      isInteractive: true,
      confirm: async () => false,
    });
    expect(result.stderr).toMatch(/Cancelled/);
    expect(await readFile(path.join(root, 'README.md'), 'utf8')).toBe('# Mine\n');
  });

  it('adds only the missing blocks and keeps existing content', async () => {
    const root = await createTempRepo({ 'README.md': MARKED });
    await runCli(['init', '--path', root, '--yes', '--sections', 'setup,env-vars']);
    const readme = await readFile(path.join(root, 'README.md'), 'utf8');
    expect(readme.startsWith(MARKED)).toBe(true);
    expect(readme).toContain('<!-- docsync:start env-vars -->');
    expect(readme.match(/docsync:start setup/g)).toHaveLength(1);
  });
});

describe('sync and check (FR-7, FR-15, FR-16)', () => {
  it('fails without a README or markers, pointing to init and creating nothing (AC6)', async () => {
    const root = await createTempRepo({ 'package.json': PKG });
    const missing = await runCli(['sync', '--path', root]);
    expect(missing.code).toBe(2);
    expect(missing.stderr).toMatch(/README.md not found .*docsync init/);
    await expect(readFile(path.join(root, 'README.md'))).rejects.toThrow();

    const unmarked = await createTempRepo({ 'package.json': PKG, 'README.md': '# x\n' });
    const result = await runCli(['check', '--path', unmarked]);
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/no docsync markers/);
  });

  it('reports malformed markers with line numbers and changes nothing (FR-5)', async () => {
    const root = await createTempRepo({
      'package.json': PKG,
      'README.md': '# x\n<!-- docsync:start setup -->\n',
    });
    const result = await runCli(['sync', '--path', root]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('README.md:2: start marker for "setup" has no matching end marker');
    expect(await readFile(path.join(root, 'README.md'), 'utf8')).toBe('# x\n<!-- docsync:start setup -->\n');
  });

  it('check exits 1 on drift, sync fixes it, check then exits 0', async () => {
    const root = await createTempRepo({ 'package.json': PKG, 'README.md': MARKED });
    const before = await runCli(['check', '--path', root]);
    expect(before.code).toBe(1);
    expect(before.stdout).toMatch(/out of date in 1 section\(s\): setup/);

    const sync = await runCli(['sync', '--path', root]);
    expect(sync.code).toBe(0);
    expect(sync.stderr).toMatch(/Updated 1 section\(s\) in README.md: setup/);

    const after = await runCli(['check', '--path', root]);
    expect(after.code).toBe(0);
    expect(after.stdout).toBe('README.md is in sync.\n');
  });

  it('writes the job summary when GITHUB_STEP_SUMMARY is set (AC9)', async () => {
    const root = await createTempRepo({ 'package.json': PKG, 'README.md': MARKED });
    const summary = path.join(root, 'summary.md');
    await runCli(['check', '--path', root], { env: { GITHUB_STEP_SUMMARY: summary } });
    expect(await readFile(summary, 'utf8')).toMatch(/## docsync check[\s\S]*### `setup`[\s\S]*```diff/);
  });

  it('sync --out writes elsewhere and leaves the README untouched', async () => {
    const root = await createTempRepo({ 'package.json': PKG, 'README.md': MARKED });
    const out = path.join(root, 'out.md');
    expect((await runCli(['sync', '--path', root, '--out', out])).code).toBe(0);
    expect(await readFile(path.join(root, 'README.md'), 'utf8')).toBe(MARKED);
    expect(await readFile(out, 'utf8')).toContain('npm run test');
  });

  it.each(['init', 'sync', 'check'])(
    '%s exits 3 with "repository is empty" for an empty repo (AC7)',
    async (command) => {
      const root = await createTempRepo({});
      const result = await runCli([command, '--path', root, ...(command === 'init' ? ['--yes'] : [])]);
      expect(result.code).toBe(3);
      expect(result.stderr).toMatch(/^error: repository .* is empty\n$/);
    },
  );

  it('hides stack traces unless --debug is given (FR-23)', async () => {
    const result = await runCli(['sync', '--path', path.join(await createTempRepo({}), 'missing')]);
    expect(result.code).toBe(2);
    expect(result.stderr).not.toMatch(/\n\s+at /);
    const debug = await runCli(['sync', '--debug', '--path', path.join(await createTempRepo({}), 'missing')]);
    expect(debug.stderr).toMatch(/debug: UsageError/);
  });
});
