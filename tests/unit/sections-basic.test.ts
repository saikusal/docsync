import { describe, expect, it } from 'vitest';
import { NOT_FOUND, firstFound, fmt, maybe } from '../../src/core/facts.js';
import { cell, code, table } from '../../src/core/markdown.js';
import { parseLockfileVersions, parsePackageJson } from '../../src/core/packageJson.js';
import { detectLicense, overview } from '../../src/sections/overview.js';
import { projectStructure } from '../../src/sections/projectStructure.js';
import { setup } from '../../src/sections/setup.js';
import { techStack } from '../../src/sections/techStack.js';
import type { Section } from '../../src/sections/types.js';
import { contextFor } from '../helpers/memorySource.js';

async function render<F>(
  section: Section<F>,
  files: Record<string, string>,
  metadata = null as Parameters<typeof contextFor>[1],
) {
  const { context } = await contextFor(files, metadata);
  return section.render(await section.extract(context));
}

const PACKAGE = JSON.stringify({
  name: 'shop-api',
  version: '1.4.0',
  description: 'Orders API',
  license: 'MIT',
  keywords: ['shop', 'api'],
  engines: { node: '>=22.12' },
  scripts: { test: 'vitest run', start: 'node dist/server.js', lint: 'eslint . | tee lint.log' },
  dependencies: { express: '^4.19.0', zod: '^4.0.0' },
  devDependencies: { typescript: '~6.0.3' },
});

describe('facts helpers', () => {
  it('maps empty values to NOT_FOUND and renders it as "Not Found"', () => {
    expect(maybe(null)).toBe(NOT_FOUND);
    expect(maybe('  ')).toBe(NOT_FOUND);
    expect(maybe(0)).toBe(0);
    expect(firstFound(NOT_FOUND, 'b', 'c')).toBe('b');
    expect(fmt(NOT_FOUND)).toBe('Not Found');
    expect(fmt('x', (v) => `<${v}>`)).toBe('<x>');
  });

  it('renders tables, and Not Found for empty tables (DR-9)', () => {
    expect(table(['A', 'B'], [['1', '2']])).toBe('| A | B |\n| --- | --- |\n| 1 | 2 |');
    expect(table(['A'], [])).toBe('Not Found');
  });

  it('escapes table cells and inline code safely', () => {
    expect(cell('a | b\nc')).toBe('a \\| b c');
    expect(code('npm test')).toBe('`npm test`');
    expect(code('echo `x`')).toBe('`` echo `x` ``');
  });
});

describe('package.json and lockfile parsing', () => {
  it('degrades malformed fields instead of failing', () => {
    expect(parsePackageJson('{"name": 5, "scripts": "nope"}')).toMatchObject({
      name: undefined,
      scripts: {},
    });
    expect(parsePackageJson('not json')).toBeNull();
  });

  it('reads lockfile v3 versions and rejects v1 (DR-11)', () => {
    const v3 = JSON.stringify({
      lockfileVersion: 3,
      packages: {
        '': {},
        'node_modules/express': { version: '4.21.2' },
        'node_modules/@scope/pkg': { version: '1.0.0' },
        'node_modules/a/node_modules/b': { version: '9.9.9' },
      },
    });
    const parsed = parseLockfileVersions(v3);
    expect('versions' in parsed && Object.fromEntries(parsed.versions)).toEqual({
      express: '4.21.2',
      '@scope/pkg': '1.0.0',
    });
    expect(parseLockfileVersions(JSON.stringify({ lockfileVersion: 1, dependencies: {} }))).toEqual({
      unsupported: 'package-lock.json v1 is not supported; showing declared ranges',
    });
  });
});

describe('overview (FR-8)', () => {
  it('prefers GitHub metadata, then package.json', async () => {
    const markdown = await render(
      overview,
      { 'package.json': PACKAGE },
      {
        fullName: 'o/shop',
        description: 'From GitHub',
        topics: ['express', 'orders'],
        license: 'Apache-2.0',
        defaultBranch: 'main',
        latestRelease: 'v1.4.0',
      },
    );
    expect(markdown).toContain('| Description | From GitHub |');
    expect(markdown).toContain('| License | Apache-2.0 |');
    expect(markdown).toContain('| Topics | `express`, `orders` |');
    expect(markdown).toContain('| Latest release | `v1.4.0` |');
  });

  it('falls back to package.json and shows Not Found for GitHub-only facts', async () => {
    const markdown = await render(overview, { 'package.json': PACKAGE });
    expect(markdown).toBe(
      [
        '| Field | Value |',
        '| --- | --- |',
        '| Name | `shop-api` |',
        '| Description | Orders API |',
        '| Version | `1.4.0` |',
        '| License | MIT |',
        '| Default branch | Not Found |',
        '| Topics | `api`, `shop` |',
        '| Latest release | Not Found |',
      ].join('\n'),
    );
  });

  it('detects the license from the LICENSE file, else Not Found (AC4)', async () => {
    expect(await render(overview, { LICENSE: 'MIT License\n\nCopyright (c) 2026' })).toContain(
      '| License | MIT |',
    );
    expect(await render(overview, { 'src/a.js': '' })).toContain('| License | Not Found |');
    expect(await render(overview, { 'src/a.js': '' })).toContain('| Name | `memory-repo` |');
  });

  it.each([
    ['MIT License\nPermission is hereby granted', 'MIT'],
    [
      '                                 Apache License\n                           Version 2.0, January 2004',
      'Apache-2.0',
    ],
    ['GNU GENERAL PUBLIC LICENSE\n Version 3, 29 June 2007', 'GPL-3.0'],
    ['ISC License\n\nCopyright', 'ISC'],
    ['All rights reserved. Proprietary.', NOT_FOUND],
  ])('detectLicense recognises %#', (text, expected) => {
    expect(detectLicense(text)).toBe(expected);
  });
});

describe('tech-stack (FR-9)', () => {
  it('lists runtime, language and dependencies sorted, using locked versions', async () => {
    const lock = JSON.stringify({
      lockfileVersion: 3,
      packages: { 'node_modules/express': { version: '4.21.2' } },
    });
    const markdown = await render(techStack, {
      'package.json': PACKAGE,
      'package-lock.json': lock,
      'src/a.ts': '',
    });
    expect(markdown).toBe(
      [
        '- **Runtime:** Node.js `>=22.12`',
        '- **Language:** TypeScript',
        '',
        '| Package | Version | Type |',
        '| --- | --- | --- |',
        '| `express` | `4.21.2` | runtime |',
        '| `zod` | `^4.0.0` | runtime |',
        '| `typescript` | `~6.0.3` | dev |',
      ].join('\n'),
    );
  });

  it('shows Not Found without package.json', async () => {
    expect(await render(techStack, { 'README.md': '' })).toBe(
      '- **Runtime:** Not Found\n- **Language:** Not Found\n\nNot Found',
    );
  });
});

describe('setup (FR-10)', () => {
  it('lists prerequisites, install command and scripts with exact commands', async () => {
    const markdown = await render(setup, { 'package.json': PACKAGE, 'package-lock.json': '{}' });
    expect(markdown).toContain('- Node.js: `>=22.12`');
    expect(markdown).toContain('```sh\nnpm ci\n```');
    expect(markdown).toContain('| `lint` | `npm run lint` | `eslint . \\| tee lint.log` |');
    expect(markdown.indexOf('`lint`')).toBeLessThan(markdown.indexOf('`start`'));
  });

  it('detects pnpm and yarn', async () => {
    expect(await render(setup, { 'package.json': PACKAGE, 'pnpm-lock.yaml': '' })).toContain(
      'pnpm install --frozen-lockfile',
    );
    expect(await render(setup, { 'package.json': PACKAGE, 'yarn.lock': '' })).toContain('`yarn run test`');
  });

  it('shows Not Found for missing engines and missing package.json (AC4)', async () => {
    expect(await render(setup, { 'package.json': '{"name":"x"}' })).toContain('- Node.js: Not Found');
    const none = await render(setup, {});
    expect(none).toContain('- Package manager: Not Found');
    expect(none).toContain('**Install**\n\nNot Found');
    expect(none).toMatch(/\*\*Scripts\*\*\n\nNot Found$/);
  });
});

describe('project-structure (FR-13)', () => {
  it('lists top-level folders with known purposes, others Not Found', async () => {
    const markdown = await render(projectStructure, {
      'src/a.ts': '',
      'src/b/c.ts': '',
      'scripts-legacy/x.sh': '',
      'docs/a.md': '',
      'README.md': '',
      'node_modules/x/y.js': '',
    });
    expect(markdown).toBe(
      [
        '| Folder | Purpose |',
        '| --- | --- |',
        '| `docs/` | Documentation |',
        '| `scripts-legacy/` | Not Found |',
        '| `src/` | Source code |',
      ].join('\n'),
    );
  });
});
