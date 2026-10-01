import { NOT_FOUND, fmt, type Maybe } from '../core/facts.js';
import { code, compareText, table } from '../core/markdown.js';
import { defineSection } from './types.js';

export interface ProjectStructureFacts {
  folders: { name: string; purpose: Maybe<string> }[];
}

/** Purposes of conventional folder names. Anything else is `Not Found` rather than a guess (A-4). */
const KNOWN_FOLDERS: Record<string, string> = {
  '.claude': 'Claude Code configuration (skills, agents, hooks)',
  '.github': 'GitHub workflows and templates',
  '.husky': 'Git hooks',
  '.vscode': 'Editor settings',
  __mocks__: 'Test mocks',
  __tests__: 'Tests',
  api: 'API handlers',
  app: 'Application code',
  assets: 'Static assets',
  bin: 'Executables',
  components: 'UI components',
  config: 'Configuration',
  controllers: 'Request controllers',
  docs: 'Documentation',
  e2e: 'End-to-end tests',
  examples: 'Examples',
  fixtures: 'Test fixtures',
  lib: 'Library code',
  middleware: 'Middleware',
  migrations: 'Database migrations',
  models: 'Data models',
  packages: 'Workspace packages',
  pages: 'Pages',
  prisma: 'Prisma schema and migrations',
  public: 'Public static files',
  routes: 'HTTP routes',
  scripts: 'Helper scripts',
  services: 'Service layer',
  src: 'Source code',
  static: 'Static files',
  styles: 'Stylesheets',
  test: 'Tests',
  tests: 'Tests',
  types: 'Type definitions',
  utils: 'Utilities',
  views: 'View templates',
};

export const projectStructure = defineSection<ProjectStructureFacts>({
  id: 'project-structure',
  async extract({ files }) {
    const folders = new Set(
      files.filter((file) => file.includes('/')).map((file) => file.slice(0, file.indexOf('/'))),
    );
    return {
      folders: [...folders]
        .sort(compareText)
        .map((name) => ({ name, purpose: KNOWN_FOLDERS[name] ?? NOT_FOUND })),
    };
  },
  render({ folders }) {
    return table(
      ['Folder', 'Purpose'],
      folders.map((folder) => [code(`${folder.name}/`), fmt(folder.purpose)]),
    );
  },
});
