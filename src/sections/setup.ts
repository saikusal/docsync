import { NOT_FOUND, fmt, maybe, type Maybe } from '../core/facts.js';
import { cell, code, compareText, table } from '../core/markdown.js';
import { defineSection } from './types.js';

export interface SetupFacts {
  node: Maybe<string>;
  packageManager: Maybe<string>;
  install: Maybe<string>;
  scripts: { name: string; command: string; run: string }[];
}

const MANAGERS: { lockfile: string; name: string; install: string; run: (script: string) => string }[] = [
  { lockfile: 'package-lock.json', name: 'npm', install: 'npm ci', run: (s) => `npm run ${s}` },
  {
    lockfile: 'pnpm-lock.yaml',
    name: 'pnpm',
    install: 'pnpm install --frozen-lockfile',
    run: (s) => `pnpm run ${s}`,
  },
  {
    lockfile: 'yarn.lock',
    name: 'yarn',
    install: 'yarn install --frozen-lockfile',
    run: (s) => `yarn run ${s}`,
  },
  {
    lockfile: 'bun.lockb',
    name: 'bun',
    install: 'bun install --frozen-lockfile',
    run: (s) => `bun run ${s}`,
  },
];

export const setup = defineSection<SetupFacts>({
  id: 'setup',
  async extract({ packageJson, files }) {
    const manager = MANAGERS.find((candidate) => files.includes(candidate.lockfile));
    const run = manager?.run ?? ((script: string) => `npm run ${script}`);
    return {
      node: maybe(packageJson?.engines?.node),
      packageManager: manager ? manager.name : packageJson ? 'npm' : NOT_FOUND,
      install: manager ? manager.install : packageJson ? 'npm install' : NOT_FOUND,
      scripts: Object.entries(packageJson?.scripts ?? {})
        .map(([name, command]) => ({ name, command, run: run(name) }))
        .sort((a, b) => compareText(a.name, b.name)),
    };
  },
  render(facts) {
    return [
      '**Prerequisites**',
      '',
      `- Node.js: ${fmt(facts.node, code)}`,
      `- Package manager: ${fmt(facts.packageManager)}`,
      '',
      '**Install**',
      '',
      fmt(facts.install, (command) => `\`\`\`sh\n${command}\n\`\`\``),
      '',
      '**Scripts**',
      '',
      table(
        ['Script', 'Run with', 'Command'],
        // Pipes must be escaped even inside code spans in GFM tables.
        facts.scripts.map((script) => [code(script.name), code(script.run), code(cell(script.command))]),
      ),
    ].join('\n');
  },
});
