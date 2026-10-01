import { SourceError } from '../infra/errors.js';
import type { Logger } from '../infra/logger.js';
import type { ScopeOptions } from '../scope/scope.js';
import type { SectionId } from '../sections/ids.js';
import { SECTIONS } from '../sections/index.js';
import type { RepoSource } from '../sources/types.js';
import { buildContext } from './context.js';
import { maskInlineSecrets } from './secrets.js';

export interface PipelineOptions extends Pick<ScopeOptions, 'include' | 'exclude'> {
  sections: readonly SectionId[];
  logger: Logger;
}

/** Extracts and renders every requested section. Same input → same output (FR-14). */
export async function renderSections(
  source: RepoSource,
  { sections, logger, include, exclude }: PipelineOptions,
): Promise<Map<SectionId, string>> {
  const files = await source.listFiles();
  if (files.length === 0) throw new SourceError(`repository ${source.label} is empty`);

  const context = await buildContext(source, { include, exclude }, logger);
  const rendered = new Map<SectionId, string>();
  for (const id of sections) {
    const section = SECTIONS[id];
    rendered.set(id, maskInlineSecrets(section.render(await section.extract(context))));
  }
  return rendered;
}
