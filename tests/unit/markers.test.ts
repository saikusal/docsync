import { describe, expect, it } from 'vitest';
import {
  createReadme,
  decodeReadme,
  encodeReadme,
  formatBlockContent,
  insertMissingBlocks,
  parseMarkers,
  replaceBlocks,
  requireMarkers,
} from '../../src/markers/markers.js';
import type { SectionId } from '../../src/sections/ids.js';

const content = (entries: Record<string, string>) =>
  new Map(Object.entries(entries)) as Map<SectionId, string>;

function sync(text: string, entries: Record<string, string>): string {
  return replaceBlocks(text, requireMarkers(text, 'README.md'), content(entries));
}

describe('parseMarkers', () => {
  it('finds blocks and their current content', () => {
    const text = 'intro\n<!-- docsync:start env-vars -->\nold\n<!-- docsync:end env-vars -->\noutro\n';
    const { blocks, problems } = parseMarkers(text);
    expect(problems).toEqual([]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ section: 'env-vars', line: 2, content: 'old\n', eol: '\n' });
  });

  it('tolerates extra whitespace in markers', () => {
    const { blocks } = parseMarkers('  <!--docsync:start   setup-->\n<!--  docsync:end setup   -->\n');
    expect(blocks.map((block) => block.section)).toEqual(['setup']);
  });

  it('ignores markers inside fenced code and inline code', () => {
    const text = [
      '```md',
      '<!-- docsync:start env-vars -->',
      '```',
      'Use `<!-- docsync:start setup -->` to mark a block.',
      '~~~',
      '<!-- docsync:end overview -->',
      '~~~',
      '',
    ].join('\n');
    expect(parseMarkers(text)).toEqual({ blocks: [], problems: [] });
  });

  it.each([
    ['unclosed start', '<!-- docsync:start setup -->\ntext\n', 1, /no matching end marker/],
    ['end without start', 'x\n<!-- docsync:end setup -->\n', 2, /no matching start marker/],
    [
      'nested blocks',
      '<!-- docsync:start setup -->\n<!-- docsync:start overview -->\n<!-- docsync:end setup -->\n',
      2,
      /cannot be nested/,
    ],
    [
      'duplicate section',
      '<!-- docsync:start setup -->\n<!-- docsync:end setup -->\n<!-- docsync:start setup -->\n<!-- docsync:end setup -->\n',
      3,
      /more than once/,
    ],
    [
      'unknown section',
      '<!-- docsync:start bogus -->\n<!-- docsync:end bogus -->\n',
      1,
      /unknown section "bogus"/,
    ],
    [
      'mismatched end',
      '<!-- docsync:start setup -->\n<!-- docsync:end overview -->\n',
      2,
      /does not match "setup"/,
    ],
  ])('reports %s with its line number (FR-5)', (_name, text, line, message) => {
    const { problems } = parseMarkers(text);
    expect(problems[0]?.line).toBe(line);
    expect(problems[0]?.message).toMatch(message);
  });

  it('requireMarkers lists every problem with file and line', () => {
    expect(() => requireMarkers('<!-- docsync:start x -->\n', 'README.md')).toThrow(
      /nothing was changed\n {2}README.md:1: unknown section "x"/,
    );
  });
});

describe('replaceBlocks (FR-4, AC1)', () => {
  it('changes only block content and preserves everything else byte for byte', () => {
    const before =
      '# Title\n\nHand-written intro.\n<!-- docsync:start env-vars -->\nold\n<!-- docsync:end env-vars -->\nOutro  \n';
    const after = sync(before, { 'env-vars': '| a |\n| b |' });
    expect(after).toBe(
      '# Title\n\nHand-written intro.\n<!-- docsync:start env-vars -->\n| a |\n| b |\n<!-- docsync:end env-vars -->\nOutro  \n',
    );
  });

  it('keeps CRLF files in CRLF', () => {
    const before = 'A\r\n<!-- docsync:start setup -->\r\n<!-- docsync:end setup -->\r\nB\r\n';
    expect(sync(before, { setup: 'line1\nline2\n' })).toBe(
      'A\r\n<!-- docsync:start setup -->\r\nline1\r\nline2\r\n<!-- docsync:end setup -->\r\nB\r\n',
    );
  });

  it('uses each block’s own line ending in mixed files (DR-6)', () => {
    const before =
      'A\n<!-- docsync:start setup -->\n<!-- docsync:end setup -->\r\nB\r\n<!-- docsync:start overview -->\r\n<!-- docsync:end overview -->\n';
    const after = sync(before, { setup: 'x\ny', overview: 'p\nq' });
    expect(after).toBe(
      'A\n<!-- docsync:start setup -->\nx\ny\n<!-- docsync:end setup -->\r\nB\r\n<!-- docsync:start overview -->\r\np\r\nq\r\n<!-- docsync:end overview -->\n',
    );
  });

  it('is idempotent (AC2)', () => {
    const before = 'x\n<!-- docsync:start setup -->\n<!-- docsync:end setup -->\n';
    const once = sync(before, { setup: 'content' });
    expect(sync(once, { setup: 'content' })).toBe(once);
  });

  it('leaves blocks without new content untouched', () => {
    const before = '<!-- docsync:start setup -->\nkeep\n<!-- docsync:end setup -->\n';
    expect(sync(before, {})).toBe(before);
  });

  it('handles a README whose last line is the end marker without a newline', () => {
    const before = '<!-- docsync:start setup -->\n<!-- docsync:end setup -->';
    expect(sync(before, { setup: 'a' })).toBe('<!-- docsync:start setup -->\na\n<!-- docsync:end setup -->');
  });
});

describe('formatBlockContent', () => {
  it('normalises line endings and leaves exactly one trailing EOL', () => {
    expect(formatBlockContent('a\r\nb\n\n\n', '\r\n')).toBe('a\r\nb\r\n');
  });
});

describe('BOM handling (DR-6)', () => {
  it('round-trips a UTF-8 BOM', () => {
    const bytes = Uint8Array.of(0xef, 0xbb, 0xbf, ...new TextEncoder().encode('# Hi ✓\n'));
    const decoded = decodeReadme(bytes);
    expect(decoded).toEqual({ text: '# Hi ✓\n', hasBom: true });
    expect(encodeReadme(decoded)).toEqual(bytes);
  });

  it('refuses invalid UTF-8 rather than corrupting bytes', () => {
    expect(() => decodeReadme(Uint8Array.of(0xff, 0xfe, 0x41))).toThrow(/not valid UTF-8/);
  });
});

describe('insertMissingBlocks / createReadme (FR-6)', () => {
  it('appends only the missing blocks, each with a heading', () => {
    const before = '# Proj\n\n<!-- docsync:start setup -->\n<!-- docsync:end setup -->\n';
    const { text, added } = insertMissingBlocks(before, ['setup', 'env-vars']);
    expect(added).toEqual(['env-vars']);
    expect(text).toBe(
      `${before}\n## Environment variables\n\n<!-- docsync:start env-vars -->\n<!-- docsync:end env-vars -->\n`,
    );
    expect(text.startsWith(before)).toBe(true);
  });

  it('adds a newline when the file does not end with one, and keeps CRLF', () => {
    const { text } = insertMissingBlocks('# P\r\nno newline', ['setup']);
    expect(text).toBe(
      '# P\r\nno newline\r\n\r\n## Setup\r\n\r\n<!-- docsync:start setup -->\r\n<!-- docsync:end setup -->\r\n',
    );
  });

  it('does nothing when all blocks exist', () => {
    const before = '<!-- docsync:start setup -->\n<!-- docsync:end setup -->\n';
    expect(insertMissingBlocks(before, ['setup'])).toEqual({ text: before, added: [] });
  });

  it('creates a README with a title and all blocks', () => {
    const text = createReadme('my-app', ['overview', 'setup']);
    expect(text).toMatch(/^# my-app\n/);
    expect(parseMarkers(text).blocks.map((block) => block.section)).toEqual(['overview', 'setup']);
  });
});
