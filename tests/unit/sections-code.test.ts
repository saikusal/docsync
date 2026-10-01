import { describe, expect, it } from 'vitest';
import { apiEndpoints } from '../../src/sections/apiEndpoints.js';
import { envVars } from '../../src/sections/envVars.js';
import { SECTIONS } from '../../src/sections/index.js';
import { SECTION_IDS } from '../../src/sections/ids.js';
import type { Section } from '../../src/sections/types.js';
import { contextFor } from '../helpers/memorySource.js';

async function render<F>(section: Section<F>, files: Record<string, string>) {
  const { context, stderr } = await contextFor(files);
  return { markdown: section.render(await section.extract(context)), stderr: stderr() };
}

describe('env-vars (FR-11, AC1)', () => {
  it('lists every variable with required flag and files, sorted', async () => {
    const { markdown } = await render(envVars, {
      'src/db.ts': 'export const url = process.env.DATABASE_URL;',
      'src/auth.ts': 'const secret = process.env.JWT_SECRET;\nconst port = process.env.PORT || 3000;',
      'src/server.ts': 'listen(process.env.PORT ?? 8080);',
      'src/db.test.ts': 'process.env.TEST_ONLY;',
      '.env.example': 'DATABASE_URL=postgres://REAL_SENTINEL_VALUE@db\nUNUSED_FLAG=1\n',
    });
    expect(markdown).toBe(
      [
        '| Variable | Required | Used in |',
        '| --- | --- | --- |',
        '| `DATABASE_URL` | Yes | `src/db.ts` |',
        '| `JWT_SECRET` | Yes | `src/auth.ts` |',
        '| `PORT` | No | `src/auth.ts`, `src/server.ts` |',
        '| `UNUSED_FLAG` | Not Found | Not Found |',
      ].join('\n'),
    );
    expect(markdown).not.toContain('REAL_SENTINEL_VALUE');
    expect(markdown).not.toContain('TEST_ONLY');
  });

  it('marks a variable required if any use lacks a fallback', async () => {
    const { markdown } = await render(envVars, {
      'src/a.ts': "process.env.API_URL || 'http://localhost'",
      'src/b.ts': 'fetch(process.env.API_URL)',
    });
    expect(markdown).toContain('| `API_URL` | Yes | `src/a.ts`, `src/b.ts` |');
  });

  it('never outputs fallback literal values (DR-2)', async () => {
    const { markdown } = await render(envVars, {
      'src/a.ts': "const k = process.env.KEY || 'sk-live-REAL_SENTINEL_VALUE';",
    });
    expect(markdown).not.toContain('REAL_SENTINEL_VALUE');
  });

  it('renders Not Found when no variables exist (DR-9)', async () => {
    expect((await render(envVars, { 'src/a.ts': 'export {}' })).markdown).toBe('Not Found');
  });

  it('skips unparseable files with a warning and keeps going (FR-22)', async () => {
    const { markdown, stderr } = await render(envVars, {
      'src/bad.ts': 'const = = ;',
      'src/good.ts': 'process.env.GOOD',
    });
    expect(markdown).toContain('`GOOD`');
    expect(stderr).toMatch(/warning: skipping src\/bad.ts:1:\d+: /);
  });
});

describe('api-endpoints (FR-12, AC3)', () => {
  const APP = {
    'src/routes/orders.ts': `
      import { Router } from 'express';
      const router = Router();
      router.post('/orders', create);
      router.get('/orders', list);
      router.get(dynamicPath, h);
      export default router;`,
    'src/app.ts': `
      import express from 'express';
      import orders from './routes/orders';
      const app = express();
      app.get('/health', ok);
      app.use('/api', orders);`,
  };

  it('lists routes sorted by path then method, dynamic paths last, without line numbers', async () => {
    const { markdown } = await render(apiEndpoints, APP);
    expect(markdown).toBe(
      [
        '| Method | Path | Source |',
        '| --- | --- | --- |',
        '| GET | `/api/orders` | `src/routes/orders.ts` |',
        '| POST | `/api/orders` | `src/routes/orders.ts` |',
        '| GET | `/health` | `src/app.ts` |',
        '| GET | Not Found (dynamic) | `src/routes/orders.ts` |',
      ].join('\n'),
    );
  });

  it('renders Not Found when there are no routes (DR-9)', async () => {
    expect((await render(apiEndpoints, { 'src/a.ts': 'export {}' })).markdown).toBe('Not Found');
  });
});

describe('section registry (NFR-10)', () => {
  it('has exactly one module per section id, with matching ids', () => {
    expect(Object.keys(SECTIONS).sort()).toEqual([...SECTION_IDS].sort());
    for (const id of SECTION_IDS) expect(SECTIONS[id].id).toBe(id);
  });
});
