export const SECTION_IDS = [
  'overview',
  'tech-stack',
  'setup',
  'env-vars',
  'api-endpoints',
  'project-structure',
] as const;

export type SectionId = (typeof SECTION_IDS)[number];

/** Heading that `docsync init` puts above each block. It sits outside the markers, so maintainers may rename it. */
export const SECTION_TITLES: Record<SectionId, string> = {
  overview: 'Overview',
  'tech-stack': 'Tech stack',
  setup: 'Setup',
  'env-vars': 'Environment variables',
  'api-endpoints': 'API endpoints',
  'project-structure': 'Project structure',
};

export function isSectionId(value: string): value is SectionId {
  return (SECTION_IDS as readonly string[]).includes(value);
}
