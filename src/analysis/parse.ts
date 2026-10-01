import { parse, type ParserPlugin } from '@babel/parser';
import type { File } from '@babel/types';

export interface ParseFailure {
  line: number;
  column: number;
  /** Parser message only, never a code frame or source excerpt (DR-2). */
  message: string;
}

export type ParseResult = { ok: true; ast: File } | { ok: false; error: ParseFailure };

function pluginsFor(file: string): ParserPlugin[] {
  if (/\.(ts|mts|cts)$/.test(file)) return ['typescript', 'decorators-legacy'];
  if (file.endsWith('.tsx')) return ['typescript', 'jsx', 'decorators-legacy'];
  return ['jsx'];
}

export function parseSource(file: string, code: string): ParseResult {
  try {
    const ast = parse(code, {
      sourceType: 'unambiguous',
      sourceFilename: file,
      plugins: pluginsFor(file),
      errorRecovery: true,
      allowReturnOutsideFunction: true,
      allowAwaitOutsideFunction: true,
      allowImportExportEverywhere: true,
    });
    // errorRecovery returns an AST even for invalid code; such files are skipped like any other parse failure (FR-22).
    const recovered = (ast as { errors?: { loc?: { line?: number; column?: number }; message?: string }[] })
      .errors?.[0];
    if (recovered) {
      return {
        ok: false,
        error: {
          line: recovered.loc?.line ?? 0,
          column: (recovered.loc?.column ?? 0) + 1,
          message: String(recovered.message ?? 'syntax error').replace(/\s*\(\d+:\d+\)\s*$/, ''),
        },
      };
    }
    return { ok: true, ast };
  } catch (error) {
    const loc = (error as { loc?: { line?: number; column?: number } }).loc;
    const message = String((error as Error).message ?? 'syntax error').replace(/\s*\(\d+:\d+\)\s*$/, '');
    return { ok: false, error: { line: loc?.line ?? 0, column: (loc?.column ?? 0) + 1, message } };
  }
}
