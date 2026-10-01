import { run, type RunOptions } from '../../src/cli/run.js';

/** Runs the CLI in-process with captured output. */
export async function runCli(args: string[], options: RunOptions = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(args, {
    env: {},
    isInteractive: false,
    stdout: { write: (chunk) => out.push(chunk) },
    stderr: { write: (chunk) => err.push(chunk) },
    ...options,
  });
  return { code, stdout: out.join(''), stderr: err.join('') };
}
