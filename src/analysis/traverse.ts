import traverseModule from '@babel/traverse';

/**
 * @babel/traverse is CommonJS with an `exports.default`. Under NodeNext the default import is the whole
 * module object at type level, and, depending on the runtime or bundler, at value level too.
 */
type Traverse = typeof traverseModule.default;
const loaded = traverseModule as unknown as { default?: Traverse } & Traverse;
export const traverse: Traverse = loaded.default ?? loaded;
