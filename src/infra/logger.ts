import type { Redactor } from './redact.js';

export interface OutputStream {
  write(chunk: string): unknown;
}

export interface Logger {
  /** Command results (README content, reports). Goes to stdout. */
  result(text: string): void;
  /** Progress and summaries. Goes to stderr so stdout stays clean for piping. */
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  /** Only printed with --debug. */
  debug(message: string): void;
  readonly warnings: readonly string[];
}

export interface LoggerOptions {
  redact: Redactor;
  debug?: boolean;
  stdout?: OutputStream;
  stderr?: OutputStream;
}

export function createLogger({
  redact,
  debug = false,
  stdout = process.stdout,
  stderr = process.stderr,
}: LoggerOptions): Logger {
  const warnings: string[] = [];
  const line = (stream: OutputStream, text: string) => stream.write(`${redact(text)}\n`);

  return {
    result: (text) => stdout.write(redact(text)),
    info: (message) => line(stderr, message),
    warn: (message) => {
      warnings.push(redact(message));
      line(stderr, `warning: ${message}`);
    },
    error: (message) => line(stderr, `error: ${message}`),
    debug: (message) => {
      if (debug) line(stderr, `debug: ${message}`);
    },
    warnings,
  };
}

/** A logger that records everything in memory, for tests and for internal use. */
export function createMemoryLogger(redact: Redactor = (text) => text, debug = false) {
  const out: string[] = [];
  const err: string[] = [];
  const logger = createLogger({
    redact,
    debug,
    stdout: { write: (chunk) => out.push(chunk) },
    stderr: { write: (chunk) => err.push(chunk) },
  });
  return { logger, stdout: () => out.join(''), stderr: () => err.join('') };
}
