import ignore, { type Ignore } from 'ignore';

export const SOURCE_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.mts', '.cts'] as const;

/** Directories that are never listed or walked. */
const EXCLUDED_DIRS = ['node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.turbo', '.cache'];

/** Test code is listed (it shows up in the project structure) but is not analysed for env vars or routes. */
const TEST_PATTERNS = ['*.test.*', '*.spec.*', '__tests__/', 'test/', 'tests/', '__mocks__/'];

/** Root files that sections read even though they are not source code. */
const MANIFESTS = new Set([
  'package.json',
  'package-lock.json',
  '.env.example',
  '.gitignore',
  'docsync.config.json',
  'LICENSE',
  'LICENSE.md',
  'LICENSE.txt',
  'LICENCE',
  'LICENCE.md',
  'LICENCE.txt',
]);

const ENV_FILE = /^\.env(\..+)?$/;

export interface ScopeOptions {
  /** gitignore-style patterns; when non-empty, only matching files count as source. */
  include?: readonly string[];
  /** gitignore-style patterns removed from the listing entirely. */
  exclude?: readonly string[];
  /** Contents of the root .gitignore, if any. */
  gitignore?: string | null;
}

export interface Scope {
  /** Whether a directory should be walked at all. `dir` is a relative POSIX path without trailing slash. */
  isListedDir(dir: string): boolean;
  /** Whether a file appears in the repository listing (project structure, manifests, sources). */
  isListed(file: string): boolean;
  /** Whether a listed file is source code to analyse for env vars and routes. */
  isSource(file: string): boolean;
  isManifest(file: string): boolean;
}

function basename(file: string): string {
  return file.slice(file.lastIndexOf('/') + 1);
}

/** `.env`, `.env.local`, `.env.production` … are never listed, so they can never be read (NFR-1). */
export function isSecretEnvFile(file: string): boolean {
  const name = basename(file);
  return ENV_FILE.test(name) && name !== '.env.example';
}

function matcher(patterns: readonly string[]): Ignore {
  return ignore().add([...patterns]);
}

export function createScope({ include = [], exclude = [], gitignore = null }: ScopeOptions = {}): Scope {
  const hidden = matcher(EXCLUDED_DIRS.map((dir) => `${dir}/`)).add([...exclude]);
  if (gitignore) hidden.add(gitignore);
  const tests = matcher(TEST_PATTERNS);
  const included = include.length > 0 ? matcher(include) : null;

  const isListed = (file: string) => file.length > 0 && !isSecretEnvFile(file) && !hidden.ignores(file);

  return {
    isListedDir: (dir) => dir.length === 0 || !hidden.ignores(`${dir}/`),
    isListed,
    isSource: (file) =>
      isListed(file) &&
      SOURCE_EXTENSIONS.some((extension) => file.endsWith(extension)) &&
      !file.endsWith('.d.ts') &&
      !tests.ignores(file) &&
      (included === null || included.ignores(file)),
    isManifest: (file) => MANIFESTS.has(file),
  };
}
