const MASK = '***';
const MIN_SECRET_LENGTH = 4;

const TOKEN_PATTERNS: readonly RegExp[] = [
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /\btoken\s+[A-Za-z0-9._-]{20,}/gi,
];

export type Redactor = (text: string) => string;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Masks the given secret values and anything shaped like a GitHub token or bearer header. */
export function createRedactor(secrets: ReadonlyArray<string | undefined>): Redactor {
  const literals = secrets
    .filter((secret): secret is string => typeof secret === 'string' && secret.length >= MIN_SECRET_LENGTH)
    .sort((a, b) => b.length - a.length)
    .map((secret) => new RegExp(escapeRegExp(secret), 'g'));

  return (text) => {
    let result = text;
    for (const pattern of [...literals, ...TOKEN_PATTERNS]) result = result.replace(pattern, MASK);
    return result;
  };
}
