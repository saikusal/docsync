import { describe, expect, it } from 'vitest';
import { findEnvUsages } from '../../src/analysis/env.js';
import { parseSource } from '../../src/analysis/parse.js';

function scan(code: string, file = 'src/app.ts') {
  const parsed = parseSource(file, code);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return findEnvUsages(file, parsed.ast);
}

const summary = (code: string, file?: string) =>
  scan(code, file).usages.map(
    ({ name, hasFallback, line }) => `${name}:${hasFallback ? 'optional' : 'required'}@${line}`,
  );

describe('findEnvUsages: access forms (FR-11)', () => {
  it('finds dot, bracket, template and optional-chaining access', () => {
    expect(
      summary(
        [
          'const a = process.env.DATABASE_URL;',
          "const b = process.env['JWT_SECRET'];",
          'const c = process.env[`REDIS_URL`];',
          'const d = process.env?.SENTRY_DSN;',
          "const e = process['env'].LOG_LEVEL;",
        ].join('\n'),
      ),
    ).toEqual([
      'DATABASE_URL:required@1',
      'JWT_SECRET:required@2',
      'REDIS_URL:required@3',
      'SENTRY_DSN:required@4',
      'LOG_LEVEL:required@5',
    ]);
  });

  it('finds destructuring, with defaults as optional', () => {
    expect(summary("const { API_KEY, PORT = '3000', 'X-Y': xy, ...rest } = process.env;")).toEqual([
      'API_KEY:required@1',
      'PORT:optional@1',
      'X-Y:required@1',
    ]);
  });

  it('works in JavaScript, JSX and CommonJS files', () => {
    expect(summary('module.exports = () => <div>{process.env.PUBLIC_URL}</div>;', 'src/a.jsx')).toEqual([
      'PUBLIC_URL:required@1',
    ]);
    expect(summary("const x = require('x'); exports.u = process.env.U || 'd';", 'src/a.cjs')).toEqual([
      'U:optional@1',
    ]);
  });
});

describe('findEnvUsages: the "required" rule (DR-1)', () => {
  it.each([
    ["process.env.PORT || '3000'", 'optional'],
    ["process.env.PORT ?? '3000'", 'optional'],
    ['Number(process.env.PORT) || 3000', 'optional'],
    ["(process.env.PORT as string) ?? 'x'", 'optional'],
    ['process.env.PORT! || 1', 'optional'],
    ['process.env.PORT', 'required'],
    ["'x' || process.env.PORT", 'required'],
    ["process.env.PORT ? 'a' : 'b'", 'required'],
    ['Number(process.env.PORT)', 'required'],
    ['process.env.PORT && start()', 'required'],
  ])('%s → %s', (expression, expected) => {
    expect(summary(`const v = ${expression};`)[0]).toBe(`PORT:${expected}@1`);
  });

  it('treats guards that throw as required, not as fallbacks', () => {
    expect(summary("if (!process.env.API_KEY) throw new Error('API_KEY missing');")).toEqual([
      'API_KEY:required@1',
    ]);
  });

  it('treats ||= and ??= as fallbacks', () => {
    expect(summary("process.env.NODE_ENV ??= 'development';")).toEqual(['NODE_ENV:optional@1']);
  });

  it('ignores writes and deletes', () => {
    expect(summary("process.env.FOO = 'bar'; delete process.env.BAZ;")).toEqual([]);
  });
});

describe('findEnvUsages: dynamic keys (DR-10)', () => {
  it('skips process.env[name] and reports the line', () => {
    const result = scan('const key = "A";\nconst v = process.env[key];');
    expect(result.usages).toEqual([]);
    expect(result.dynamicKeys).toEqual([{ file: 'src/app.ts', line: 2 }]);
  });

  it('does not confuse other objects named env', () => {
    expect(summary('const env = {}; env.X; config.env.Y; process.argv;')).toEqual([]);
  });
});

describe('parseSource (FR-22)', () => {
  it('reports a syntax error with line and column but no source excerpt', () => {
    const result = parseSource('src/bad.ts', 'const secret = "REAL_SENTINEL_VALUE";\nconst = ;');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.line).toBe(2);
    expect(result.error.column).toBeGreaterThan(0);
    expect(result.error.message).not.toContain('REAL_SENTINEL_VALUE');
    expect(result.error.message).not.toMatch(/\(\d+:\d+\)$/);
  });

  it('parses TypeScript with types and decorators, and ESM/CJS JavaScript', () => {
    expect(
      parseSource('a.ts', 'interface A { x: number }\n@dec class B {}\nexport const c = <T,>(v: T) => v;').ok,
    ).toBe(true);
    expect(parseSource('a.mjs', 'import x from "y"; export default x;').ok).toBe(true);
    expect(parseSource('a.js', 'const a = require("b"); module.exports = a;').ok).toBe(true);
  });
});
