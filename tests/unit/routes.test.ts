import type { File } from '@babel/types';
import { describe, expect, it } from 'vitest';
import { parseSource } from '../../src/analysis/parse.js';
import { analyseRoutes, joinPaths } from '../../src/analysis/routes.js';

function scan(files: Record<string, string>) {
  const asts = new Map<string, File>();
  for (const [file, code] of Object.entries(files)) {
    const parsed = parseSource(file, code);
    if (!parsed.ok) throw new Error(`${file}: ${parsed.error.message}`);
    asts.set(file, parsed.ast);
  }
  return analyseRoutes(asts);
}

const list = (files: Record<string, string>) =>
  scan(files)
    .routes.map((route) => `${route.method} ${route.path ?? '<dynamic>'} ${route.file}`)
    .sort();

describe('analyseRoutes: single file (FR-12)', () => {
  it('finds app and router routes for every method', () => {
    expect(
      list({
        'src/app.js': `
          const express = require('express');
          const app = express();
          app.get('/health', (req, res) => res.send('ok'));
          app.post('/login', handler);
          app.delete('/items/:id', auth, handler);
          app.all('/any', handler);
          app.listen(3000);`,
      }),
    ).toEqual([
      'ALL /any src/app.js',
      'DELETE /items/:id src/app.js',
      'GET /health src/app.js',
      'POST /login src/app.js',
    ]);
  });

  it('supports route() chains', () => {
    expect(
      list({
        'src/app.ts': `
          import express from 'express';
          const router = express.Router();
          router.route('/books').get(list).post(create).put(update);`,
      }),
    ).toEqual(['GET /books src/app.ts', 'POST /books src/app.ts', 'PUT /books src/app.ts']);
  });

  it('ignores non-Express objects and the app.get(setting) getter', () => {
    expect(
      list({
        'src/client.ts': `
          import axios from 'axios';
          import express from 'express';
          const app = express();
          axios.get('/api/users', config);
          cache.get('key', fallback);
          new Map().get('x');
          app.get('env');`,
      }),
    ).toEqual([]);
  });

  it('applies a same-file mount prefix', () => {
    expect(
      list({
        'src/app.js': `
          const express = require('express');
          const app = express();
          const api = express.Router();
          api.get('/users', h);
          api.get('/', h);
          app.use('/api', api);`,
      }),
    ).toEqual(['GET /api src/app.js', 'GET /api/users src/app.js']);
  });

  it('marks dynamic paths as unknown', () => {
    expect(
      list({
        'src/app.js': `
          const app = require('express')();
          const base = '/v' + version;
          app.get(base, h);
          app.get(\`/users/\${id}\`, h);`,
      }),
    ).toEqual(['GET <dynamic> src/app.js', 'GET <dynamic> src/app.js']);
  });
});

describe('analyseRoutes: across files (AC3)', () => {
  it('applies the mount prefix to a router imported with ESM', () => {
    expect(
      list({
        'src/routes/orders.ts': `
          import { Router } from 'express';
          const router = Router();
          router.post('/orders', create);
          router.get('/orders/:id', show);
          export default router;`,
        'src/app.ts': `
          import express from 'express';
          import orders from './routes/orders.js';
          const app = express();
          app.use('/api', orders);`,
      }),
    ).toEqual(['GET /api/orders/:id src/routes/orders.ts', 'POST /api/orders src/routes/orders.ts']);
  });

  it('follows CommonJS module.exports and require(), including inline require', () => {
    expect(
      list({
        'routes/users.js': `
          const router = require('express').Router();
          router.get('/', list);
          module.exports = router;`,
        'routes/admin/index.js': `
          const express = require('express');
          const router = express.Router();
          router.delete('/cache', clear);
          module.exports = router;`,
        'server.js': `
          const express = require('express');
          const users = require('./routes/users');
          const app = express();
          app.use('/users', users);
          app.use('/admin', requireAdmin, require('./routes/admin'));`,
      }),
    ).toEqual(['DELETE /admin/cache routes/admin/index.js', 'GET /users routes/users.js']);
  });

  it('follows named exports and nested mounts', () => {
    expect(
      list({
        'src/v1.ts': `
          import { Router } from 'express';
          import { itemsRouter } from './items';
          export const v1 = Router();
          v1.use('/items', itemsRouter);`,
        'src/items.ts': `
          import { Router } from 'express';
          export const itemsRouter = Router();
          itemsRouter.get('/:id', h);`,
        'src/main.ts': `
          import express from 'express';
          import { v1 } from './v1';
          const app = express();
          app.use('/api/v1', v1);`,
      }),
    ).toEqual(['GET /api/v1/items/:id src/items.ts']);
  });

  it('follows one hop of re-export (DR-15)', () => {
    expect(
      list({
        'src/routes/health.ts': `
          import { Router } from 'express';
          const r = Router();
          r.get('/health', h);
          export default r;`,
        'src/routes/index.ts': `export { default as health } from './health';`,
        'src/app.ts': `
          import express from 'express';
          import { health } from './routes';
          const app = express();
          app.use('/status', health);`,
      }),
    ).toEqual(['GET /status/health src/routes/health.ts']);
  });

  it('lists an unmounted router without a prefix', () => {
    expect(
      list({
        'src/r.ts': `import { Router } from 'express'; export const r = Router(); r.get('/orphan', h);`,
      }),
    ).toEqual(['GET /orphan src/r.ts']);
  });

  it('survives a mount cycle with a warning', () => {
    const result = scan({
      'src/a.ts': `
        import { Router } from 'express';
        import { b } from './b';
        export const a = Router();
        a.use('/b', b);
        a.get('/x', h);`,
      'src/b.ts': `
        import { Router } from 'express';
        import { a } from './a';
        export const b = Router();
        b.use('/a', a);`,
    });
    expect(result.warnings.join('\n')).toMatch(/cycle/);
    expect(result.routes.length).toBeGreaterThan(0);
  });
});

describe('joinPaths', () => {
  it.each([
    [['', '/x'], '/x'],
    [['/api', '/'], '/api'],
    [['/api/', '/users/'], '/api/users'],
    [['', '/'], '/'],
    [['api', 'x'], '/api/x'],
  ])('%j → %s', (segments, expected) => {
    expect(joinPaths(...segments)).toBe(expected);
  });
});
