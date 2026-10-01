import type { File } from '@babel/types';
import { findEnvUsages, type EnvScan } from '../analysis/env.js';
import { parseSource } from '../analysis/parse.js';
import { analyseRoutes } from '../analysis/routes.js';
import { mapLimit } from '../infra/concurrency.js';
import type { Logger } from '../infra/logger.js';
import { parseEnvExampleKeys } from '../scope/envExample.js';
import { createScope, type ScopeOptions } from '../scope/scope.js';
import type { Analysis, SectionContext } from '../sections/types.js';
import type { RepoMetadata, RepoSource } from '../sources/types.js';
import { parseLockfileVersions, parsePackageJson } from './packageJson.js';

const PARSE_CONCURRENCY = 16;

async function analyse(
  source: RepoSource,
  sourceFiles: readonly string[],
  logger: Logger,
): Promise<Analysis> {
  const asts = new Map<string, File>();
  const env: EnvScan = { usages: [], dynamicKeys: [] };

  const parsed = await mapLimit(sourceFiles, PARSE_CONCURRENCY, async (file) => {
    const text = await source.readFile(file);
    return text === null ? null : { file, result: parseSource(file, text) };
  });

  for (const entry of parsed) {
    if (entry === null) continue;
    const { file, result } = entry;
    if (!result.ok) {
      logger.warn(`skipping ${file}:${result.error.line}:${result.error.column}: ${result.error.message}`);
      continue;
    }
    let scan: EnvScan;
    try {
      scan = findEnvUsages(file, result.ast);
    } catch (error) {
      logger.warn(`skipping ${file}: ${(error as Error).message}`);
      continue;
    }
    asts.set(file, result.ast);
    env.usages.push(...scan.usages);
    env.dynamicKeys.push(...scan.dynamicKeys);
  }

  for (const { file, line } of env.dynamicKeys) {
    logger.debug(`${file}:${line}: process.env[...] with a computed name is not documented`);
  }
  const routes = analyseRoutes(asts);
  for (const warning of routes.warnings) logger.warn(warning);
  return { env, routes };
}

export async function buildContext(
  source: RepoSource,
  scopeOptions: Pick<ScopeOptions, 'include' | 'exclude'>,
  logger: Logger,
): Promise<SectionContext> {
  const files = await source.listFiles();
  const scope = createScope({ ...scopeOptions, gitignore: await source.readFile('.gitignore') });
  const sourceFiles = files.filter((file) => scope.isSource(file));

  const packageText = await source.readFile('package.json');
  const packageJson = packageText === null ? null : parsePackageJson(packageText);
  if (packageText !== null && packageJson === null)
    logger.warn('package.json is not valid JSON; its facts are shown as Not Found');

  let lockedVersions: Map<string, string> | null = null;
  const lockText = await source.readFile('package-lock.json');
  if (lockText !== null) {
    const lock = parseLockfileVersions(lockText);
    if ('versions' in lock) lockedVersions = lock.versions;
    else logger.warn(lock.unsupported);
  }

  const envExample = await source.readFile('.env.example');
  let analysis: Promise<Analysis> | null = null;
  let metadata: Promise<RepoMetadata | null> | null = null;

  return {
    source,
    files,
    sourceFiles,
    packageJson,
    lockedVersions,
    metadata: () => (metadata ??= source.getMetadata()),
    envExampleKeys: envExample === null ? null : parseEnvExampleKeys(envExample),
    analysis: () => (analysis ??= analyse(source, sourceFiles, logger)),
    readFile: (file) => source.readFile(file),
    logger,
  };
}
