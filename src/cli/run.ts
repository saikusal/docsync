import { promises as fs } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { Command, CommanderError, Option } from 'commander';
import { checkCommand, initCommand, syncCommand } from '../commands/commands.js';
import type { Runtime } from '../commands/runtime.js';
import type { CliOptions } from '../config/config.js';
import { DocsyncError, ExitCode } from '../infra/errors.js';
import { createLogger, type OutputStream } from '../infra/logger.js';
import { createRedactor } from '../infra/redact.js';
import { SECTION_IDS } from '../sections/ids.js';
import { VERSION } from '../version.js';

export interface RunOptions {
  env?: Readonly<Record<string, string | undefined>>;
  stdout?: OutputStream;
  stderr?: OutputStream;
  isInteractive?: boolean;
  confirm?: Runtime['confirm'];
  fetch?: typeof globalThis.fetch;
}

type Handler = (cli: CliOptions, runtime: Runtime) => Promise<number>;

async function askOnStdin(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    return /^y(es)?$/i.test((await rl.question(question)).trim());
  } finally {
    rl.close();
  }
}

function addCommonOptions(command: Command): Command {
  return command
    .option('-p, --path <dir>', 'local repository directory (default: current directory)')
    .option(
      '-r, --repo <owner/repo>',
      'read a GitHub repository through the API instead of a local directory',
    )
    .option('--ref <ref>', 'branch, tag or commit to read in --repo mode (default: the default branch)')
    .option('--readme <file>', 'README path relative to the repository root (default: README.md)')
    .option('-c, --config <file>', 'config file (default: docsync.config.json in the repository root)')
    .option('-s, --sections <list>', `comma-separated sections to process: ${SECTION_IDS.join(', ')}`)
    .option('--debug', 'show debug details and stack traces');
}

/** Runs the CLI and returns the exit code (0 ok, 1 drift, 2 usage/config/markers, 3 source/GitHub). */
export async function run(argv: readonly string[], options: RunOptions = {}): Promise<number> {
  // Only these two variables are ever read; an empty value counts as unset.
  const env = options.env ?? {
    GITHUB_TOKEN: process.env.GITHUB_TOKEN || undefined,
    GITHUB_STEP_SUMMARY: process.env.GITHUB_STEP_SUMMARY || undefined,
  };
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const debug = argv.includes('--debug');
  // GITHUB_TOKEN is read from the environment only and masked in every line of output (NFR-2).
  const logger = createLogger({ redact: createRedactor([env.GITHUB_TOKEN]), debug, stdout, stderr });
  const runtime: Runtime = {
    logger,
    env,
    isInteractive: options.isInteractive ?? Boolean(process.stdin.isTTY),
    confirm: options.confirm ?? askOnStdin,
    fetch: options.fetch,
    appendFile: (file, text) => fs.appendFile(file, text),
    writeFile: (file, text) => fs.writeFile(file, text),
  };

  let exitCode: number = ExitCode.Ok;
  const action = (handler: Handler) => async (cli: CliOptions) => {
    exitCode = await handler(cli, runtime);
  };

  const program = new Command()
    .name('docsync')
    .description("Keeps a repository's README in sync with its code.")
    .version(VERSION, '-v, --version')
    .exitOverride()
    .configureOutput({
      writeOut: (text) => stdout.write(text),
      writeErr: (text) => stderr.write(text),
    });

  addCommonOptions(
    program
      .command('init')
      .description('add docsync section markers to the README (creates a README if there is none)'),
  )
    .option('-y, --yes', 'do not ask for confirmation')
    .option('-o, --out <file>', 'write the README to this file instead')
    .action(action(initCommand));

  addCommonOptions(program.command('sync').description('update the marked README sections from the code'))
    .option('-o, --out <file>', 'write the README to this file instead (default in --repo mode: stdout)')
    .action(action(syncCommand));

  addCommonOptions(
    program.command('check').description('report README sections that are out of date; exit 1 on drift'),
  )
    .addOption(new Option('-o, --out <file>').hideHelp())
    .action(action(checkCommand));

  try {
    await program.parseAsync([...argv], { from: 'user' });
    return exitCode;
  } catch (error) {
    if (error instanceof CommanderError) {
      if (error.code === 'commander.helpDisplayed' || error.code === 'commander.version') return ExitCode.Ok;
      if (error.code === 'commander.help' || error.code === 'commander.executeSubCommandAsync')
        return ExitCode.Ok;
      return ExitCode.Usage;
    }
    if (error instanceof DocsyncError) {
      logger.error(error.message);
      if (debug && error.stack) logger.debug(error.stack);
      return error.exitCode;
    }
    logger.error(
      `unexpected error: ${(error as Error)?.message ?? String(error)}; re-run with --debug for details`,
    );
    if (debug && error instanceof Error && error.stack) logger.debug(error.stack);
    return ExitCode.Source;
  }
}
