import { fmt, maybe, type Maybe } from '../core/facts.js';
import { code, compareText, table } from '../core/markdown.js';
import { defineSection } from './types.js';

export interface Dependency {
  name: string;
  version: string;
  kind: 'runtime' | 'dev';
}

export interface TechStackFacts {
  runtime: Maybe<string>;
  language: Maybe<string>;
  dependencies: Dependency[];
}

export const techStack = defineSection<TechStackFacts>({
  id: 'tech-stack',
  async extract({ packageJson, lockedVersions, sourceFiles }) {
    const collect = (deps: Record<string, string> | undefined, kind: Dependency['kind']) =>
      Object.entries(deps ?? {}).map(([name, range]) => ({
        name,
        version: lockedVersions?.get(name) ?? range,
        kind,
      }));

    const usesTypeScript =
      sourceFiles.some((file) => /\.(ts|tsx|mts|cts)$/.test(file)) ||
      packageJson?.devDependencies?.typescript !== undefined ||
      packageJson?.dependencies?.typescript !== undefined;
    const usesJavaScript = sourceFiles.some((file) => /\.(js|jsx|mjs|cjs)$/.test(file));

    return {
      runtime: maybe(packageJson?.engines?.node),
      language: usesTypeScript ? 'TypeScript' : usesJavaScript ? 'JavaScript' : maybe<string>(null),
      dependencies: [
        ...collect(packageJson?.dependencies, 'runtime'),
        ...collect(packageJson?.devDependencies, 'dev'),
      ].sort((a, b) => compareText(a.kind, b.kind) || compareText(a.name, b.name)),
    };
  },
  render(facts) {
    return [
      `- **Runtime:** ${fmt(facts.runtime, (range) => `Node.js ${code(range)}`)}`,
      `- **Language:** ${fmt(facts.language)}`,
      '',
      table(
        ['Package', 'Version', 'Type'],
        facts.dependencies.map((dep) => [code(dep.name), code(dep.version), dep.kind]),
      ),
    ].join('\n');
  },
});
