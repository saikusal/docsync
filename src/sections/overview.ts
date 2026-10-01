import { NOT_FOUND, firstFound, fmt, maybe, type Maybe } from '../core/facts.js';
import { cell, code, table } from '../core/markdown.js';
import { LICENSE_FILES } from '../scope/scope.js';
import { defineSection } from './types.js';

export interface OverviewFacts {
  name: string;
  description: Maybe<string>;
  version: Maybe<string>;
  license: Maybe<string>;
  defaultBranch: Maybe<string>;
  topics: Maybe<string[]>;
  latestRelease: Maybe<string>;
}

const LICENSE_SIGNATURES: [RegExp, string][] = [
  [/^\s*MIT License/i, 'MIT'],
  [/Apache License[\s\S]{0,200}Version 2\.0/i, 'Apache-2.0'],
  [/GNU AFFERO GENERAL PUBLIC LICENSE[\s\S]{0,200}Version 3/i, 'AGPL-3.0'],
  [/GNU LESSER GENERAL PUBLIC LICENSE[\s\S]{0,200}Version 3/i, 'LGPL-3.0'],
  [/GNU GENERAL PUBLIC LICENSE[\s\S]{0,200}Version 3/i, 'GPL-3.0'],
  [/GNU GENERAL PUBLIC LICENSE[\s\S]{0,200}Version 2/i, 'GPL-2.0'],
  [/^\s*ISC License/i, 'ISC'],
  [/Mozilla Public License,? (?:Version|v\.?) 2\.0/i, 'MPL-2.0'],
  [/^\s*The Unlicense|This is free and unencumbered software released into the public domain/i, 'Unlicense'],
];

/** Identifies a license file by its well-known opening text; returns NOT_FOUND when unrecognised. */
export function detectLicense(text: string): Maybe<string> {
  const head = text.slice(0, 2000);
  return LICENSE_SIGNATURES.find(([pattern]) => pattern.test(head))?.[1] ?? NOT_FOUND;
}

export const overview = defineSection<OverviewFacts>({
  id: 'overview',
  async extract({ packageJson, metadata, source, files, readFile }) {
    const licenseFile = LICENSE_FILES.find((file) => files.includes(file));
    const licenseText = licenseFile ? await readFile(licenseFile) : null;
    const keywords = packageJson?.keywords?.length ? [...packageJson.keywords].sort() : null;
    return {
      name: packageJson?.name ?? source.defaultName,
      description: firstFound(maybe(metadata?.description), maybe(packageJson?.description)),
      version: maybe(packageJson?.version),
      license: firstFound(
        maybe(metadata?.license),
        maybe(packageJson?.license),
        licenseText === null ? NOT_FOUND : detectLicense(licenseText),
      ),
      defaultBranch: maybe(metadata?.defaultBranch),
      topics: metadata?.topics.length ? metadata.topics : maybe(keywords),
      latestRelease: maybe(metadata?.latestRelease),
    };
  },
  render(facts) {
    return table(
      ['Field', 'Value'],
      [
        ['Name', code(facts.name)],
        ['Description', cell(fmt(facts.description))],
        ['Version', fmt(facts.version, code)],
        ['License', cell(fmt(facts.license))],
        ['Default branch', fmt(facts.defaultBranch, code)],
        ['Topics', fmt(facts.topics, (topics) => topics.map(code).join(', '))],
        ['Latest release', fmt(facts.latestRelease, code)],
      ],
    );
  },
});
