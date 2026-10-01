export const SECTION_IDS = [
  'overview',
  'tech-stack',
  'setup',
  'env-vars',
  'api-endpoints',
  'project-structure',
] as const;

export type SectionId = (typeof SECTION_IDS)[number];

export function isSectionId(value: string): value is SectionId {
  return (SECTION_IDS as readonly string[]).includes(value);
}
