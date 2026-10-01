import { describe, expect, it } from 'vitest';
import { SourceError } from '../../src/infra/errors.js';
import { createMemoryLogger } from '../../src/infra/logger.js';
import { renderSections } from '../../src/core/pipeline.js';
import { requireMarkers } from '../../src/markers/markers.js';
import {
  SUMMARY_LIMIT_BYTES,
  findDrift,
  formatSummaryReport,
  formatTerminalReport,
} from '../../src/report/drift.js';
import type { SectionId } from '../../src/sections/ids.js';
import { memorySource } from '../helpers/memorySource.js';

const readme = (body: string) => `# App\n<!-- docsync:start setup -->\n${body}<!-- docsync:end setup -->\n`;

describe('renderSections (T-13)', () => {
  const files = { 'package.json': '{"name":"a","scripts":{"b":"tsc"}}', 'src/a.ts': 'process.env.X' };

  it('renders the requested sections deterministically (FR-14)', async () => {
    const run = () =>
      renderSections(memorySource(files), {
        sections: ['setup', 'env-vars'],
        logger: createMemoryLogger().logger,
      });
    const first = await run();
    expect([...first.keys()]).toEqual(['setup', 'env-vars']);
    expect(await run()).toEqual(first);
  });

  it('refuses an empty repository (FR-20, AC7)', async () => {
    await expect(
      renderSections(memorySource({}), { sections: ['setup'], logger: createMemoryLogger().logger }),
    ).rejects.toThrow(SourceError);
  });
});

describe('findDrift (FR-16)', () => {
  const rendered = new Map<SectionId, string>([['setup', 'new line']]);

  it('reports nothing when blocks match', () => {
    const text = readme('new line\n');
    expect(findDrift(requireMarkers(text, 'README.md'), rendered, 'README.md')).toEqual([]);
  });

  it('treats CRLF blocks that match as in sync', () => {
    const text = readme('new line\n').replace(/\n/g, '\r\n');
    expect(findDrift(requireMarkers(text, 'README.md'), rendered, 'README.md')).toEqual([]);
  });

  it('returns a unified diff per stale section', () => {
    const drift = findDrift(requireMarkers(readme('old line\n'), 'README.md'), rendered, 'README.md');
    expect(drift).toHaveLength(1);
    expect(drift[0]?.section).toBe('setup');
    expect(drift[0]?.diff).toContain('-old line');
    expect(drift[0]?.diff).toContain('+new line');
  });

  it('ignores blocks for sections that were not rendered', () => {
    expect(findDrift(requireMarkers(readme('x\n'), 'README.md'), new Map(), 'README.md')).toEqual([]);
  });
});

describe('reports', () => {
  const drift = [
    { section: 'api-endpoints' as const, diff: '--- a\n+++ b\n@@ -1 +1 @@\n-x\n+POST /api/orders\n' },
  ];

  it('formats the terminal report with the section name and next step (AC3)', () => {
    const text = formatTerminalReport(drift, 'README.md');
    expect(text).toMatch(/^README.md is out of date in 1 section\(s\): api-endpoints/);
    expect(text).toContain('+POST /api/orders');
    expect(text).toMatch(/Run `docsync sync`/);
    expect(formatTerminalReport([], 'README.md')).toBe('README.md is in sync.');
  });

  it('formats the job summary as Markdown (AC9)', () => {
    const summary = formatSummaryReport(drift, 'README.md');
    expect(summary).toContain('### `api-endpoints`');
    expect(summary).toContain('```diff');
    expect(formatSummaryReport([], 'README.md')).toMatch(/is in sync/);
  });

  it('caps the job summary size (DR-13)', () => {
    const huge = Array.from({ length: 5 }, (_, i) => ({
      section: 'env-vars' as const,
      diff: `+${'x'.repeat(300 * 1024)}\n${i}`,
    }));
    const summary = formatSummaryReport(huge, 'README.md');
    expect(Buffer.byteLength(summary)).toBeLessThan(SUMMARY_LIMIT_BYTES + 200);
    expect(summary).toMatch(/report truncated/);
  });
});
