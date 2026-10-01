import path from 'node:path';
import { z } from 'zod';
import { UsageError } from '../infra/errors.js';
import { toSafeRelative } from '../infra/paths.js';
import { isSecretEnvFile } from '../scope/scope.js';
import { SECTION_IDS, isSectionId, type SectionId } from '../sections/ids.js';

export const CONFIG_FILE_NAME = 'docsync.config.json';

const REPO_PATTERN = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;

const fileSchema = z.strictObject({
  readme: z.string().min(1).optional(),
  sections: z.array(z.enum(SECTION_IDS)).min(1).optional(),
  include: z.array(z.string().min(1)).optional(),
  exclude: z.array(z.string().min(1)).optional(),
});

export type ConfigFile = z.infer<typeof fileSchema>;

/** Options as parsed by the CLI, before validation. */
export interface CliOptions {
  path?: string;
  repo?: string;
  ref?: string;
  readme?: string;
  config?: string;
  sections?: string;
  out?: string;
  yes?: boolean;
  debug?: boolean;
}

export type Target =
  { kind: 'local'; root: string } | { kind: 'remote'; owner: string; repo: string; ref: string | undefined };

export interface ResolvedConfig {
  target: Target;
  readme: string;
  sections: SectionId[];
  include: string[];
  exclude: string[];
  out: string | undefined;
  yes: boolean;
  debug: boolean;
}

export function resolveTarget(cli: CliOptions): Target {
  if (cli.path !== undefined && cli.repo !== undefined) {
    throw new UsageError('use either --path or --repo, not both');
  }
  if (cli.repo !== undefined) {
    if (!REPO_PATTERN.test(cli.repo)) {
      throw new UsageError(`invalid --repo "${cli.repo}": expected the form owner/repo`);
    }
    const [owner = '', repo = ''] = cli.repo.split('/');
    return { kind: 'remote', owner, repo, ref: cli.ref };
  }
  if (cli.ref !== undefined) throw new UsageError('--ref can only be used together with --repo');
  return { kind: 'local', root: path.resolve(cli.path ?? '.') };
}

/** Parses and validates the contents of a docsync.config.json file. */
export function parseConfigFile(text: string, source: string): ConfigFile {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new UsageError(`${source} is not valid JSON`);
  }
  const parsed = fileSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path.length ? issue.path.join('.') : '(root)';
    const reason =
      issue?.code === 'unrecognized_keys' ? `unknown key(s) ${issue.keys.join(', ')}` : issue?.message;
    throw new UsageError(`invalid ${source}: ${field}: ${reason}`);
  }
  return parsed.data;
}

function parseSectionList(list: string): SectionId[] {
  const names = list
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  const unknown = names.filter((name) => !isSectionId(name));
  if (unknown.length > 0) {
    throw new UsageError(
      `unknown section(s): ${unknown.join(', ')}. Known sections: ${SECTION_IDS.join(', ')}`,
    );
  }
  if (names.length === 0) throw new UsageError('--sections must name at least one section');
  return names as SectionId[];
}

/** The README must be a relative path that stays inside the target root. */
function validateReadmePath(readme: string): string {
  const normalized = toSafeRelative(readme);
  if (normalized === null || normalized === '' || normalized === '.') {
    throw new UsageError(`README path "${readme}" must be relative to the repository root`);
  }
  // The README is read and rewritten, so it must never be a secrets file (NFR-1, ICR-1).
  if (isSecretEnvFile(normalized)) {
    throw new UsageError(`README path "${readme}" is an environment file; docsync never reads .env files`);
  }
  return normalized;
}

/** Merges defaults < config file < CLI flags. */
export function resolveConfig(cli: CliOptions, target: Target, file: ConfigFile | null): ResolvedConfig {
  const sections =
    cli.sections !== undefined ? parseSectionList(cli.sections) : (file?.sections ?? [...SECTION_IDS]);
  return {
    target,
    readme: validateReadmePath(cli.readme ?? file?.readme ?? 'README.md'),
    sections: [...new Set(sections)],
    include: file?.include ?? [],
    exclude: file?.exclude ?? [],
    out: cli.out,
    yes: cli.yes ?? false,
    debug: cli.debug ?? false,
  };
}
