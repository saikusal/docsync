import type { CliOptions } from '../config/config.js';
import { parsePackageJson } from '../core/packageJson.js';
import { renderSections } from '../core/pipeline.js';
import { ExitCode, SourceError, UsageError } from '../infra/errors.js';
import {
  createReadme,
  insertMissingBlocks,
  replaceBlocks,
  requireMarkers,
  type Block,
  type ReadmeText,
} from '../markers/markers.js';
import { findDrift, formatSummaryReport, formatTerminalReport } from '../report/drift.js';
import type { SectionId } from '../sections/ids.js';
import type { Runtime } from './runtime.js';
import { openTarget, type OpenTarget } from './target.js';

const INIT_HINT = 'run `docsync init` to add the section markers';

/** An empty repository is reported as such before anything else is looked at (FR-20, AC7). */
async function openNonEmptyTarget(cli: CliOptions, runtime: Runtime): Promise<OpenTarget> {
  const target = await openTarget(cli, runtime);
  if ((await target.source.listFiles()).length === 0) {
    throw new SourceError(`repository ${target.source.label} is empty`);
  }
  return target;
}

/** Reads the README and its blocks; sync/check never create files (FR-7). */
async function loadManagedReadme(target: OpenTarget): Promise<{ readme: ReadmeText; blocks: Block[] }> {
  const name = target.config.readme;
  const readme = await target.readReadme();
  if (readme === null) throw new UsageError(`${name} not found in ${target.source.label}; ${INIT_HINT}`);
  const blocks = requireMarkers(readme.text, name);
  if (blocks.length === 0) throw new UsageError(`${name} has no docsync markers; ${INIT_HINT}`);
  return { readme, blocks };
}

async function renderManaged(target: OpenTarget, blocks: readonly Block[], runtime: Runtime) {
  const present = new Set(blocks.map((block) => block.section));
  const sections = target.config.sections.filter((section) => present.has(section));
  const missing = target.config.sections.filter((section) => !present.has(section));
  if (missing.length > 0)
    runtime.logger.debug(`no block in ${target.config.readme} for: ${missing.join(', ')}`);
  return renderSections(target.source, {
    sections,
    logger: runtime.logger,
    include: target.config.include,
    exclude: target.config.exclude,
  });
}

export async function initCommand(cli: CliOptions, runtime: Runtime): Promise<number> {
  const target = await openNonEmptyTarget(cli, runtime);
  const { config, source } = target;
  const existing = await target.readReadme();

  let next: ReadmeText;
  let added: SectionId[];
  if (existing === null) {
    const pkg = await source.readFile('package.json');
    const name = (pkg === null ? null : parsePackageJson(pkg))?.name ?? source.defaultName;
    next = { text: createReadme(name, config.sections), hasBom: false };
    added = [...config.sections];
  } else {
    const result = insertMissingBlocks(existing.text, config.sections, config.readme);
    next = { text: result.text, hasBom: existing.hasBom };
    added = result.added;
  }

  if (added.length === 0) {
    runtime.logger.info(`${config.readme} already has blocks for all sections; nothing to do.`);
    return ExitCode.Ok;
  }

  const action = existing === null ? `create ${config.readme} with` : `add to ${config.readme}`;
  runtime.logger.info(`docsync init will ${action} these sections: ${added.join(', ')}`);
  if (!config.yes) {
    if (!runtime.isInteractive)
      throw new UsageError('not running interactively; re-run with --yes to confirm');
    if (!(await runtime.confirm('Proceed? [y/N] '))) {
      runtime.logger.info('Cancelled; nothing was changed.');
      return ExitCode.Ok;
    }
  }
  const where = await target.writeReadme(next);
  runtime.logger.info(`Wrote ${where}. Next: run \`docsync sync\` to fill in the sections.`);
  return ExitCode.Ok;
}

export async function syncCommand(cli: CliOptions, runtime: Runtime): Promise<number> {
  const target = await openNonEmptyTarget(cli, runtime);
  const { readme, blocks } = await loadManagedReadme(target);
  const rendered = await renderManaged(target, blocks, runtime);
  const drift = findDrift(blocks, rendered, target.config.readme);

  if (drift.length === 0) {
    runtime.logger.info(`${target.config.readme} is already up to date; no changes.`);
    // --out (and remote mode, which never writes to GitHub) always receives the result, so piping works (CR-4).
    if (target.config.out !== undefined || target.config.target.kind === 'remote')
      await target.writeReadme(readme);
    return ExitCode.Ok;
  }
  const updated: ReadmeText = { text: replaceBlocks(readme.text, blocks, rendered), hasBom: readme.hasBom };
  const where = await target.writeReadme(updated);
  runtime.logger.info(
    `Updated ${drift.length} section(s) in ${where}: ${drift.map((item) => item.section).join(', ')}`,
  );
  return ExitCode.Ok;
}

export async function checkCommand(cli: CliOptions, runtime: Runtime): Promise<number> {
  const target = await openNonEmptyTarget(cli, runtime);
  const { blocks } = await loadManagedReadme(target);
  const rendered = await renderManaged(target, blocks, runtime);
  const drift = findDrift(blocks, rendered, target.config.readme);

  runtime.logger.result(`${formatTerminalReport(drift, target.config.readme)}\n`);
  const summaryFile = runtime.env.GITHUB_STEP_SUMMARY;
  if (summaryFile) await runtime.appendFile(summaryFile, formatSummaryReport(drift, target.config.readme));
  return drift.length === 0 ? ExitCode.Ok : ExitCode.Drift;
}
