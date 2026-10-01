import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseConfigFile, resolveConfig, resolveTarget } from '../../src/config/config.js';
import { UsageError } from '../../src/infra/errors.js';
import { SECTION_IDS } from '../../src/sections/ids.js';

describe('resolveTarget', () => {
  it('defaults to the current directory in local mode', () => {
    expect(resolveTarget({})).toEqual({ kind: 'local', root: path.resolve('.') });
  });

  it('parses owner/repo and ref in remote mode', () => {
    expect(resolveTarget({ repo: 'saikusal/docsync', ref: 'v1' })).toEqual({
      kind: 'remote',
      owner: 'saikusal',
      repo: 'docsync',
      ref: 'v1',
    });
  });

  it('rejects --path together with --repo (FR-1)', () => {
    expect(() => resolveTarget({ path: '.', repo: 'a/b' })).toThrow(/either --path or --repo/);
  });

  it.each(['not-a-repo', 'a/b/c', '/b', 'a/', 'a b/c'])('rejects malformed --repo %s (FR-3)', (repo) => {
    expect(() => resolveTarget({ repo })).toThrow(/expected the form owner\/repo/);
  });

  it('rejects --ref without --repo', () => {
    expect(() => resolveTarget({ ref: 'main' })).toThrow(UsageError);
  });
});

describe('parseConfigFile', () => {
  it('accepts a valid file', () => {
    expect(parseConfigFile('{"readme":"docs/README.md","sections":["env-vars"]}', 'cfg')).toEqual({
      readme: 'docs/README.md',
      sections: ['env-vars'],
    });
  });

  it('names an unknown key', () => {
    expect(() => parseConfigFile('{"sectons":["env-vars"]}', 'docsync.config.json')).toThrow(
      /invalid docsync.config.json: \(root\): unknown key\(s\) sectons/,
    );
  });

  it('names the field with the wrong type', () => {
    expect(() => parseConfigFile('{"include":"src/**"}', 'cfg')).toThrow(/cfg: include:/);
  });

  it('names an unknown section value', () => {
    expect(() => parseConfigFile('{"sections":["nope"]}', 'cfg')).toThrow(/sections\.0/);
  });

  it('rejects invalid JSON', () => {
    expect(() => parseConfigFile('{', 'cfg')).toThrow(/not valid JSON/);
  });
});

describe('resolveConfig', () => {
  const target = { kind: 'local', root: '/repo' } as const;

  it('uses defaults when there is no file and no flags', () => {
    const config = resolveConfig({}, target, null);
    expect(config.readme).toBe('README.md');
    expect(config.sections).toEqual([...SECTION_IDS]);
    expect(config.yes).toBe(false);
  });

  it('applies precedence: flags > file > defaults (FR-2)', () => {
    const file = { readme: 'FILE.md', sections: ['setup' as const], exclude: ['scripts/**'] };
    expect(resolveConfig({}, target, file).sections).toEqual(['setup']);
    const config = resolveConfig({ readme: 'CLI.md', sections: 'env-vars, overview' }, target, file);
    expect(config.readme).toBe('CLI.md');
    expect(config.sections).toEqual(['env-vars', 'overview']);
    expect(config.exclude).toEqual(['scripts/**']);
  });

  it('rejects unknown section names from the CLI (FR-3)', () => {
    expect(() => resolveConfig({ sections: 'env-vars,bogus' }, target, null)).toThrow(
      /unknown section\(s\): bogus/,
    );
  });

  it.each(['../README.md', '/etc/passwd', 'C:\\README.md', 'docs/../../x.md'])(
    'rejects README path %s outside the root',
    (readme) => {
      expect(() => resolveConfig({ readme }, target, null)).toThrow(/must be relative/);
    },
  );
});
