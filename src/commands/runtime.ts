import type { Logger } from '../infra/logger.js';

/** Everything commands need from the outside world, injectable for tests. */
export interface Runtime {
  logger: Logger;
  env: Readonly<Record<string, string | undefined>>;
  /** Whether stdin is interactive; `init` refuses to prompt otherwise (DR-12). */
  isInteractive: boolean;
  confirm: (question: string) => Promise<boolean>;
  /** Replaces the network for GitHub calls in tests. */
  fetch?: typeof globalThis.fetch;
  appendFile: (file: string, text: string) => Promise<void>;
  writeFile: (file: string, data: string | Uint8Array) => Promise<void>;
  /** Masks the token and token-shaped strings; applied to every output that bypasses the logger (ICR-3). */
  redact: (text: string) => string;
}
