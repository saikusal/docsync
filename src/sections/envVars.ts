import { NOT_FOUND, fmt, type Maybe } from '../core/facts.js';
import { code, compareText, table } from '../core/markdown.js';
import { defineSection } from './types.js';

export interface EnvVariable {
  name: string;
  required: Maybe<boolean>;
  usedIn: Maybe<string[]>;
}

export interface EnvVarsFacts {
  variables: EnvVariable[];
}

export const envVars = defineSection<EnvVarsFacts>({
  id: 'env-vars',
  async extract({ analysis, envExampleKeys }) {
    const { env } = await analysis();
    const byName = new Map<string, { required: boolean; files: Set<string> }>();
    for (const usage of env.usages) {
      const entry = byName.get(usage.name) ?? { required: false, files: new Set<string>() };
      entry.required ||= !usage.hasFallback;
      entry.files.add(usage.file);
      byName.set(usage.name, entry);
    }

    const variables: EnvVariable[] = [...byName].map(([name, entry]) => ({
      name,
      required: entry.required,
      usedIn: [...entry.files].sort(compareText),
    }));
    for (const name of envExampleKeys ?? []) {
      if (!byName.has(name)) variables.push({ name, required: NOT_FOUND, usedIn: NOT_FOUND });
    }
    return { variables: variables.sort((a, b) => compareText(a.name, b.name)) };
  },
  render({ variables }) {
    return table(
      ['Variable', 'Required', 'Used in'],
      variables.map((variable) => [
        code(variable.name),
        fmt(variable.required, (required) => (required ? 'Yes' : 'No')),
        fmt(variable.usedIn, (files) => files.map(code).join(', ')),
      ]),
    );
  },
});
