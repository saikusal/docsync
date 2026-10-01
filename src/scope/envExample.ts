const KEY_LINE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/;

/**
 * Returns the variable names declared in a .env.example file.
 * Only the key is captured; everything after `=` is never looked at, so a real value
 * committed by mistake can't end up in the generated docs (NFR-1, DR-2).
 */
export function parseEnvExampleKeys(text: string): string[] {
  const keys = new Set<string>();
  for (const line of text.split(/\r\n|\n|\r/)) {
    const key = KEY_LINE.exec(line)?.[1];
    if (key) keys.add(key);
  }
  return [...keys];
}
