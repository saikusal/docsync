import { createRedactor } from '../infra/redact.js';

const MASK = '***';
const tokenShapes = createRedactor([]);

const INLINE_SECRETS: [RegExp, string][] = [
  // API_KEY=abc, DB_PASSWORD="x y", export TOKEN='z'
  [
    /\b([A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|PWD|CREDENTIALS?|AUTH)[A-Za-z0-9_]*\s*=\s*)("[^"]*"|'[^']*'|[^\s"';&|]+)/gi,
    `$1${MASK}`,
  ],
  // npm config set //registry/:_authToken=abc
  [/(_auth(?:Token)?\s*=\s*)[^\s"';&|]+/gi, `$1${MASK}`],
  // Authorization: Bearer abc / Basic abc
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{6,}/g, `$1 ${MASK}`],
  // https://user:password@host
  [/([a-z][a-z0-9+.-]*:\/\/)[^\s:@/]+:[^\s@/]+@/gi, `$1${MASK}@`],
];

/**
 * Masks secrets that may be written inline in package.json scripts or other facts (IDR-4).
 * Applied to every rendered block before it is compared or written.
 */
export function maskInlineSecrets(text: string): string {
  let result = text;
  for (const [pattern, replacement] of INLINE_SECRETS) result = result.replace(pattern, replacement);
  return tokenShapes(result);
}
