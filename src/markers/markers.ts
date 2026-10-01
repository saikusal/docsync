import { UsageError } from '../infra/errors.js';
import { SECTION_TITLES, isSectionId, type SectionId } from '../sections/ids.js';

const BOM = Uint8Array.of(0xef, 0xbb, 0xbf);
/** A marker must be alone on its line, so markers quoted in inline code are ignored. */
const MARKER_LINE = /^\s*<!--\s*docsync:(start|end)\s+([^\s>]+)\s*-->\s*$/;
const FENCE = /^\s{0,3}(`{3,}|~{3,})/;

export interface ReadmeText {
  /** README content without the BOM. */
  text: string;
  hasBom: boolean;
}

export interface Block {
  section: SectionId;
  /** 1-based line number of the start marker. */
  line: number;
  /** Offset of the first character after the start marker's line ending. */
  contentStart: number;
  /** Offset of the first character of the end marker's line. */
  contentEnd: number;
  /** Line ending of the start marker line; block content is rendered with it. */
  eol: string;
  content: string;
}

export interface MarkerProblem {
  line: number;
  message: string;
}

interface Line {
  number: number;
  start: number;
  /** Offset just after the line ending (or end of text). */
  next: number;
  body: string;
  eol: string;
}

/** Decodes README bytes, keeping the BOM flag. Invalid UTF-8 is refused so bytes can be preserved exactly. */
export function decodeReadme(bytes: Uint8Array, name = 'README'): ReadmeText {
  const hasBom = bytes.length >= 3 && BOM.every((byte, index) => bytes[index] === byte);
  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
      hasBom ? bytes.subarray(3) : bytes,
    );
    return { text, hasBom };
  } catch {
    throw new UsageError(`${name} is not valid UTF-8; docsync only edits UTF-8 files`);
  }
}

export function encodeReadme({ text, hasBom }: ReadmeText): Uint8Array {
  const body = new TextEncoder().encode(text);
  if (!hasBom) return body;
  const out = new Uint8Array(BOM.length + body.length);
  out.set(BOM);
  out.set(body, BOM.length);
  return out;
}

function splitLines(text: string): Line[] {
  const lines: Line[] = [];
  const pattern = /\r\n|\n|\r/g;
  let start = 0;
  let number = 1;
  for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
    lines.push({
      number: number++,
      start,
      next: match.index + match[0].length,
      body: text.slice(start, match.index),
      eol: match[0],
    });
    start = match.index + match[0].length;
  }
  if (start < text.length) lines.push({ number, start, next: text.length, body: text.slice(start), eol: '' });
  return lines;
}

/** The first line ending used in the text, or LF for single-line or empty text. */
export function detectEol(text: string): string {
  return /\r\n|\n|\r/.exec(text)?.[0] ?? '\n';
}

export function parseMarkers(text: string): { blocks: Block[]; problems: MarkerProblem[] } {
  const blocks: Block[] = [];
  const problems: MarkerProblem[] = [];
  const seen = new Set<string>();
  let open: { section: string; line: Line; valid: boolean } | null = null;
  let fence: string | null = null;

  for (const line of splitLines(text)) {
    const fenceMatch = FENCE.exec(line.body);
    if (fenceMatch?.[1]) {
      const marker = fenceMatch[1];
      if (fence === null) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      continue;
    }
    if (fence !== null) continue;

    const match = MARKER_LINE.exec(line.body);
    if (!match) continue;
    const [, kind, section = ''] = match;

    if (kind === 'start') {
      if (open) {
        problems.push({
          line: line.number,
          message: `"${section}" starts inside "${open.section}" (opened on line ${open.line.number}); blocks cannot be nested`,
        });
        continue;
      }
      let valid = true;
      if (!isSectionId(section)) {
        problems.push({ line: line.number, message: `unknown section "${section}"` });
        valid = false;
      } else if (seen.has(section)) {
        problems.push({ line: line.number, message: `section "${section}" appears more than once` });
        valid = false;
      }
      seen.add(section);
      open = { section, line, valid };
      continue;
    }

    if (!open) {
      problems.push({
        line: line.number,
        message: `end marker for "${section}" has no matching start marker`,
      });
    } else if (open.section !== section) {
      problems.push({
        line: line.number,
        message: `end marker for "${section}" does not match "${open.section}" opened on line ${open.line.number}`,
      });
      open = null;
    } else {
      if (open.valid && isSectionId(section)) {
        blocks.push({
          section,
          line: open.line.number,
          contentStart: open.line.next,
          contentEnd: line.start,
          eol: open.line.eol,
          content: text.slice(open.line.next, line.start),
        });
      }
      open = null;
    }
  }

  if (open) {
    problems.push({
      line: open.line.number,
      message: `start marker for "${open.section}" has no matching end marker`,
    });
  }
  return { blocks, problems };
}

/** Parses markers and throws one UsageError listing every problem with its line number. */
export function requireMarkers(text: string, readmeName: string): Block[] {
  const { blocks, problems } = parseMarkers(text);
  if (problems.length > 0) {
    const details = problems
      .map((problem) => `  ${readmeName}:${problem.line}: ${problem.message}`)
      .join('\n');
    throw new UsageError(`malformed docsync markers; nothing was changed\n${details}`);
  }
  return blocks;
}

/** Normalizes rendered content to the block's line ending and guarantees exactly one trailing line ending. */
export function formatBlockContent(markdown: string, eol: string): string {
  const body = markdown.replace(/\r\n|\r/g, '\n').replace(/\n+$/, '');
  return `${body.split('\n').join(eol)}${eol}`;
}

/** Replaces the content of the given blocks. Text outside the blocks is copied unchanged. */
export function replaceBlocks(
  text: string,
  blocks: readonly Block[],
  content: ReadonlyMap<SectionId, string>,
): string {
  let result = '';
  let cursor = 0;
  for (const block of [...blocks].sort((a, b) => a.contentStart - b.contentStart)) {
    const markdown = content.get(block.section);
    if (markdown === undefined) continue;
    result += text.slice(cursor, block.contentStart) + formatBlockContent(markdown, block.eol);
    cursor = block.contentEnd;
  }
  return result + text.slice(cursor);
}

function blockSkeleton(section: SectionId, eol: string): string {
  return [
    `## ${SECTION_TITLES[section]}`,
    '',
    `<!-- docsync:start ${section} -->`,
    `<!-- docsync:end ${section} -->`,
    '',
  ].join(eol);
}

/** Appends marker blocks (with a heading) for every section that has none yet. Existing content is untouched. */
export function insertMissingBlocks(
  text: string,
  sections: readonly SectionId[],
  readmeName = 'README.md',
): { text: string; added: SectionId[] } {
  const present = new Set(requireMarkers(text, readmeName).map((block) => block.section));
  const added = sections.filter((section) => !present.has(section));
  if (added.length === 0) return { text, added };

  const eol = detectEol(text);
  let result = text;
  if (result.length > 0 && !/(\r\n|\n|\r)$/.test(result)) result += eol;
  if (result.length > 0) result += eol;
  result += added.map((section) => blockSkeleton(section, eol)).join(eol);
  return { text: result, added };
}

export function createReadme(title: string, sections: readonly SectionId[]): string {
  return insertMissingBlocks(`# ${title}\n`, sections).text;
}
