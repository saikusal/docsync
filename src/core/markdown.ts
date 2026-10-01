import { NOT_FOUND_TEXT } from './facts.js';

/** Escapes text for use inside a Markdown table cell. */
export function cell(text: string): string {
  return text.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim();
}

/** Inline code that stays valid when the text itself contains backticks. */
export function code(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(longest + 1);
  const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : '';
  return `${fence}${pad}${text}${pad}${fence}`;
}

/** A Markdown table, or a single `Not Found` line when there are no rows (DR-9). */
export function table(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  if (rows.length === 0) return NOT_FOUND_TEXT;
  const line = (cells: readonly string[]) => `| ${cells.join(' | ')} |`;
  return [line(headers), line(headers.map(() => '---')), ...rows.map(line)].join('\n');
}

/** Sorts by UTF-16 code unit: identical on every OS, locale and Node.js version (IDR-16). */
export function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
