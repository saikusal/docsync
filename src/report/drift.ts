import { createTwoFilesPatch } from 'diff';
import { formatBlockContent, type Block } from '../markers/markers.js';
import type { SectionId } from '../sections/ids.js';

/** GitHub rejects job summaries over 1 MiB; stay well below it (DR-13). */
export const SUMMARY_LIMIT_BYTES = 900 * 1024;

export interface SectionDrift {
  section: SectionId;
  /** Unified diff from the README's current block to the expected content (LF line endings). */
  diff: string;
}

const toLf = (text: string) => text.replace(/\r\n|\r/g, '\n');

/** Compares each README block with freshly rendered content. Blocks of sections that were not rendered are skipped. */
export function findDrift(
  blocks: readonly Block[],
  rendered: ReadonlyMap<SectionId, string>,
  readmeName: string,
) {
  const drift: SectionDrift[] = [];
  for (const block of blocks) {
    const markdown = rendered.get(block.section);
    if (markdown === undefined) continue;
    const expected = formatBlockContent(markdown, block.eol);
    if (expected === block.content) continue;
    const diff = createTwoFilesPatch(
      `${readmeName} (${block.section})`,
      `${readmeName} (${block.section}, expected)`,
      toLf(block.content),
      toLf(expected),
      undefined,
      undefined,
      { context: 2 },
    );
    drift.push({ section: block.section, diff: diff.replace(/^=+\n/m, '') });
  }
  return drift;
}

export function formatTerminalReport(drift: readonly SectionDrift[], readmeName: string): string {
  if (drift.length === 0) return `${readmeName} is in sync.`;
  const names = drift.map((item) => item.section).join(', ');
  return [
    `${readmeName} is out of date in ${drift.length} section(s): ${names}`,
    '',
    ...drift.map((item) => item.diff.trimEnd()),
    '',
    'Run `docsync sync` to update it.',
  ].join('\n');
}

export function formatSummaryReport(drift: readonly SectionDrift[], readmeName: string): string {
  if (drift.length === 0) return `## docsync check\n\n✅ \`${readmeName}\` is in sync with the code.\n`;
  const header = [
    '## docsync check',
    '',
    `❌ \`${readmeName}\` is out of date in ${drift.length} section(s). Run \`docsync sync\` and commit the result.`,
    '',
  ].join('\n');
  const sections = drift.map(
    (item) => `### \`${item.section}\`\n\n\`\`\`diff\n${item.diff.trimEnd()}\n\`\`\`\n`,
  );

  let report = header;
  for (const section of sections) {
    if (Buffer.byteLength(report + section) > SUMMARY_LIMIT_BYTES) {
      return `${report}\n… report truncated, see the job log for the full diff.\n`;
    }
    report += `\n${section}`;
  }
  return report;
}
