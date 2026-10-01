import { apiEndpoints } from './apiEndpoints.js';
import { envVars } from './envVars.js';
import type { SectionId } from './ids.js';
import { overview } from './overview.js';
import { projectStructure } from './projectStructure.js';
import { setup } from './setup.js';
import { techStack } from './techStack.js';
import type { Section } from './types.js';

/** The section registry. Adding a section = one module + one entry here + its id in ids.ts (NFR-10). */
export const SECTIONS: Record<SectionId, Section<never>> = {
  overview,
  'tech-stack': techStack,
  setup,
  'env-vars': envVars,
  'api-endpoints': apiEndpoints,
  'project-structure': projectStructure,
} as Record<SectionId, Section<never>>;
