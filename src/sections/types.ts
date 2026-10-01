import type { EnvScan } from '../analysis/env.js';
import type { RouteScan } from '../analysis/routes.js';
import type { PackageJson } from '../core/packageJson.js';
import type { Logger } from '../infra/logger.js';
import type { RepoMetadata, RepoSource } from '../sources/types.js';
import type { SectionId } from './ids.js';

export interface Analysis {
  env: EnvScan;
  routes: RouteScan;
}

/** Everything a section may read. Built once per run by the pipeline. */
export interface SectionContext {
  source: RepoSource;
  /** All listed files (sorted, POSIX). */
  files: readonly string[];
  /** Listed files that count as source code (FR-19). */
  sourceFiles: readonly string[];
  packageJson: PackageJson | null;
  /** Resolved dependency versions from the lockfile, or null when unavailable. */
  lockedVersions: ReadonlyMap<string, string> | null;
  /** GitHub metadata, fetched on first use only (memoised), so sections that do not need it make no API calls. */
  metadata(): Promise<RepoMetadata | null>;
  /** Names from .env.example (never values), or null when the file is absent. */
  envExampleKeys: readonly string[] | null;
  /** Parses source files once and runs the env and route analysers (memoised). */
  analysis(): Promise<Analysis>;
  readFile(file: string): Promise<string | null>;
  logger: Logger;
}

/** One README section: extracts facts, then renders them as Markdown (NFR-10). */
export interface Section<F = unknown> {
  id: SectionId;
  extract(context: SectionContext): Promise<F>;
  render(facts: F): string;
}

export function defineSection<F>(section: Section<F>): Section<F> {
  return section;
}
