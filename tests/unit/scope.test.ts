import { describe, expect, it } from 'vitest';
import { parseEnvExampleKeys } from '../../src/scope/envExample.js';
import { createScope, isSecretEnvFile } from '../../src/scope/scope.js';

describe('createScope (FR-19)', () => {
  const scope = createScope();

  it.each(['src/app.ts', 'src/routes/orders.js', 'server.mjs', 'lib/x.cjs', 'ui/App.tsx'])(
    'treats %s as source',
    (file) => {
      expect(scope.isSource(file)).toBe(true);
    },
  );

  it.each([
    'src/app.test.ts',
    'src/app.spec.js',
    'src/__tests__/a.ts',
    'tests/unit/a.ts',
    'test/a.js',
    'src/types.d.ts',
    'README.md',
    'node_modules/express/index.js',
    'dist/cli.js',
    'coverage/x.js',
  ])('does not treat %s as source', (file) => {
    expect(scope.isSource(file)).toBe(false);
  });

  it('lists test folders (for the project structure) but not build output or dependencies', () => {
    expect(scope.isListed('tests/unit/a.ts')).toBe(true);
    expect(scope.isListed('dist/cli.js')).toBe(false);
    expect(scope.isListedDir('node_modules')).toBe(false);
    expect(scope.isListedDir('packages/a/node_modules')).toBe(false);
    expect(scope.isListedDir('src')).toBe(true);
    expect(scope.isListedDir('')).toBe(true);
  });

  it('never lists .env files except .env.example (NFR-1)', () => {
    for (const file of ['.env', '.env.local', 'config/.env.production', '.env.test']) {
      expect(isSecretEnvFile(file)).toBe(true);
      expect(scope.isListed(file)).toBe(false);
    }
    expect(scope.isListed('.env.example')).toBe(true);
    expect(scope.isManifest('.env.example')).toBe(true);
  });

  it('respects .gitignore', () => {
    const withIgnore = createScope({ gitignore: 'generated/\n*.gen.ts\n' });
    expect(withIgnore.isListed('generated/a.ts')).toBe(false);
    expect(withIgnore.isListedDir('generated')).toBe(false);
    expect(withIgnore.isSource('src/a.gen.ts')).toBe(false);
    expect(withIgnore.isSource('src/a.ts')).toBe(true);
  });

  it('applies config include and exclude', () => {
    const configured = createScope({ include: ['src/**'], exclude: ['src/legacy/'] });
    expect(configured.isSource('src/app.ts')).toBe(true);
    expect(configured.isSource('scripts/seed.ts')).toBe(false);
    expect(configured.isListed('scripts/seed.ts')).toBe(true);
    expect(configured.isListed('src/legacy/old.js')).toBe(false);
  });

  it('only recognises manifests at the root', () => {
    expect(scope.isManifest('package.json')).toBe(true);
    expect(scope.isManifest('LICENSE')).toBe(true);
    expect(scope.isManifest('packages/a/package.json')).toBe(false);
  });
});

describe('parseEnvExampleKeys (DR-2)', () => {
  it('returns key names only and never the values', () => {
    const text = [
      '# comment',
      'DATABASE_URL=postgres://user:REAL_SENTINEL_VALUE@host/db',
      'export JWT_SECRET = "also-secret"',
      '  PORT=3000',
      'not a key line',
      'lower_case_ok=1',
      'DATABASE_URL=dup',
      '1INVALID=x',
      '',
    ].join('\r\n');
    const keys = parseEnvExampleKeys(text);
    expect(keys).toEqual(['DATABASE_URL', 'JWT_SECRET', 'PORT', 'lower_case_ok']);
    expect(JSON.stringify(keys)).not.toMatch(/SENTINEL|secret|3000/);
  });
});
