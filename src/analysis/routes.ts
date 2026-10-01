import path from 'node:path';
import * as t from '@babel/types';
import { staticKey, staticString } from './ast.js';
import { traverse } from './traverse.js';

export const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'all'] as const;
const METHOD_SET = new Set<string>(HTTP_METHODS);
const RESOLVE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];
/** One hop of `export { x } from './y'` is followed (DR-15). */
const MAX_REEXPORT_HOPS = 1;

export interface Route {
  method: string;
  /** Full path including mount prefixes, or null when any part is not a static string. */
  path: string | null;
  file: string;
  line: number;
}

/** A path segment: a static string, or null when it is computed at runtime. */
type Segment = string | null;

type Binding = { kind: 'router'; id: string } | { kind: 'import'; source: string; imported: string };

type ExportTarget = { kind: 'local'; name: string } | { kind: 'reexport'; source: string; imported: string };

interface RouteDecl {
  receiver: string;
  method: string;
  path: Segment;
  line: number;
}

interface MountDecl {
  receiver: string;
  prefix: Segment;
  child: { kind: 'name'; name: string } | { kind: 'require'; source: string };
}

interface FileFacts {
  bindings: Map<string, Binding>;
  exports: Map<string, ExportTarget>;
  routes: RouteDecl[];
  mounts: MountDecl[];
}

export interface RouteScan {
  routes: Route[];
  warnings: string[];
}

function propertyName(node: t.MemberExpression): string | null {
  return staticKey(node.property, node.computed);
}

/** `express()`, `express.Router()`, `Router()`, `require('express')()`, `new Router()`. */
function isRouterFactory(node: t.Node | null | undefined): boolean {
  if (!t.isCallExpression(node) && !t.isNewExpression(node)) return false;
  const callee = node.callee;
  if (t.isIdentifier(callee)) return callee.name === 'express' || callee.name === 'Router';
  if (t.isMemberExpression(callee)) return t.isIdentifier(callee.property, { name: 'Router' });
  return isRequireOf(callee, 'express');
}

function requireSource(node: t.Node | null | undefined): string | null {
  if (!t.isCallExpression(node) || !t.isIdentifier(node.callee, { name: 'require' })) return null;
  return staticString(node.arguments[0]);
}

function isRequireOf(node: t.Node, source: string): boolean {
  return requireSource(node) === source;
}

function moduleExportsName(node: t.Node): string | null {
  // module.exports = x  → default;  module.exports.r = x / exports.r = x → r
  if (!t.isMemberExpression(node)) return null;
  if (t.isIdentifier(node.object, { name: 'module' }) && propertyName(node) === 'exports') return 'default';
  const isExportsObject =
    t.isIdentifier(node.object, { name: 'exports' }) ||
    (t.isMemberExpression(node.object) &&
      t.isIdentifier(node.object.object, { name: 'module' }) &&
      propertyName(node.object) === 'exports');
  return isExportsObject ? propertyName(node) : null;
}

function collect(file: string, ast: t.File): FileFacts {
  const facts: FileFacts = { bindings: new Map(), exports: new Map(), routes: [], mounts: [] };
  const routerId = (name: string) => `${file}#${name}`;

  const bindVariable = (name: string, init: t.Node | null | undefined) => {
    if (isRouterFactory(init)) {
      facts.bindings.set(name, { kind: 'router', id: routerId(name) });
      return;
    }
    const source = requireSource(init);
    if (source) facts.bindings.set(name, { kind: 'import', source, imported: 'default' });
  };

  traverse(ast, {
    ImportDeclaration(p) {
      const source = p.node.source.value;
      for (const specifier of p.node.specifiers) {
        const imported = t.isImportSpecifier(specifier)
          ? (staticString(specifier.imported) ?? (specifier.imported as t.Identifier).name)
          : 'default';
        facts.bindings.set(specifier.local.name, { kind: 'import', source, imported });
      }
    },
    VariableDeclarator(p) {
      const { id, init } = p.node;
      if (t.isIdentifier(id)) bindVariable(id.name, init);
      const source = requireSource(init);
      if (t.isObjectPattern(id) && source) {
        for (const property of id.properties) {
          if (!t.isObjectProperty(property) || !t.isIdentifier(property.value)) continue;
          const imported =
            staticString(property.key) ?? (t.isIdentifier(property.key) ? property.key.name : null);
          if (imported) facts.bindings.set(property.value.name, { kind: 'import', source, imported });
        }
      }
    },
    ExportDefaultDeclaration(p) {
      const declaration = p.node.declaration;
      if (t.isIdentifier(declaration))
        facts.exports.set('default', { kind: 'local', name: declaration.name });
      else if (isRouterFactory(declaration)) {
        facts.bindings.set('*default*', { kind: 'router', id: routerId('default') });
        facts.exports.set('default', { kind: 'local', name: '*default*' });
      }
    },
    ExportNamedDeclaration(p) {
      const { declaration, specifiers, source } = p.node;
      if (t.isVariableDeclaration(declaration)) {
        for (const declarator of declaration.declarations) {
          if (t.isIdentifier(declarator.id))
            facts.exports.set(declarator.id.name, { kind: 'local', name: declarator.id.name });
        }
      }
      for (const specifier of specifiers) {
        if (!t.isExportSpecifier(specifier)) continue;
        const exported = staticString(specifier.exported) ?? (specifier.exported as t.Identifier).name;
        const local = specifier.local.name;
        facts.exports.set(
          exported,
          source
            ? { kind: 'reexport', source: source.value, imported: local }
            : { kind: 'local', name: local },
        );
      }
    },
    AssignmentExpression(p) {
      const exportName = moduleExportsName(p.node.left);
      if (exportName === null) return;
      const right = p.node.right;
      if (t.isIdentifier(right)) facts.exports.set(exportName, { kind: 'local', name: right.name });
      else if (isRouterFactory(right)) {
        const local = `*export:${exportName}*`;
        facts.bindings.set(local, { kind: 'router', id: routerId(local) });
        facts.exports.set(exportName, { kind: 'local', name: local });
      }
    },
    CallExpression(p) {
      const callee = p.node.callee;
      if (!t.isMemberExpression(callee)) return;
      const method = propertyName(callee);
      if (method === null) return;
      const line = p.node.loc?.start.line ?? 0;
      const args = p.node.arguments;

      // router.route('/x').get(h).post(h)
      if (METHOD_SET.has(method) && t.isCallExpression(callee.object)) {
        let inner: t.Node = callee.object;
        while (t.isCallExpression(inner) && t.isMemberExpression(inner.callee)) {
          const innerName = propertyName(inner.callee);
          if (innerName === 'route' && t.isIdentifier(inner.callee.object)) {
            facts.routes.push({
              receiver: inner.callee.object.name,
              method,
              path: staticString(inner.arguments[0]),
              line,
            });
            return;
          }
          if (innerName === null || !METHOD_SET.has(innerName)) return;
          inner = inner.callee.object;
        }
        return;
      }

      if (!t.isIdentifier(callee.object)) return;
      const receiver = callee.object.name;

      // app.get('/x', handler). A single argument is Express's settings getter (app.get('env')), not a route.
      if (METHOD_SET.has(method) && args.length >= 2) {
        facts.routes.push({ receiver, method, path: staticString(args[0]), line });
        return;
      }

      if (method === 'use' && args.length > 0) {
        const first = args[0];
        const hasPrefix =
          t.isStringLiteral(first) || t.isTemplateLiteral(first) || t.isArrayExpression(first);
        // app.use(['/a', '/b'], router) mounts the router at every listed path (CR-3).
        const prefixes: Segment[] = !hasPrefix
          ? ['']
          : t.isArrayExpression(first)
            ? first.elements.map((element) => staticString(element))
            : [staticString(first)];
        for (const arg of hasPrefix ? args.slice(1) : args) {
          const source = requireSource(arg);
          const child: MountDecl['child'] | null = t.isIdentifier(arg)
            ? { kind: 'name', name: arg.name }
            : source
              ? { kind: 'require', source }
              : null;
          if (child) for (const prefix of prefixes) facts.mounts.push({ receiver, prefix, child });
        }
      }
    },
  });

  return facts;
}

/** Joins mount prefixes and a route path into one normalised path. */
export function joinPaths(...segments: string[]): string {
  const joined = segments.join('/').replace(/\/{2,}/g, '/');
  const trimmed = joined.length > 1 ? joined.replace(/\/$/, '') : joined;
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

export function analyseRoutes(files: ReadonlyMap<string, t.File>): RouteScan {
  const warnings: string[] = [];
  const facts = new Map<string, FileFacts>();
  for (const [file, ast] of files) {
    try {
      facts.set(file, collect(file, ast));
    } catch (error) {
      warnings.push(`skipping ${file} for route detection: ${(error as Error).message}`);
    }
  }

  const resolveModule = (from: string, specifier: string): string | null => {
    if (!specifier.startsWith('.')) return null;
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier));
    const withoutJs = base.replace(/\.(m|c)?js$/, '');
    const candidates = [
      base,
      ...RESOLVE_EXTENSIONS.map((extension) => withoutJs + extension),
      ...RESOLVE_EXTENSIONS.map((extension) => `${base}/index${extension}`),
    ];
    return candidates.find((candidate) => facts.has(candidate)) ?? null;
  };

  const resolveExport = (file: string, name: string, hops: number): string | null => {
    const target = facts.get(file)?.exports.get(name);
    if (!target) return null;
    if (target.kind === 'local') return resolveName(file, target.name, hops);
    if (hops >= MAX_REEXPORT_HOPS) {
      warnings.push(
        `${file}: re-export chain for "${name}" is too deep to follow; its routes are listed without a prefix`,
      );
      return null;
    }
    const next = resolveModule(file, target.source);
    return next ? resolveExport(next, target.imported, hops + 1) : null;
  };

  function resolveName(file: string, name: string, hops = 0): string | null {
    const binding = facts.get(file)?.bindings.get(name);
    if (!binding) return null;
    if (binding.kind === 'router') return binding.id;
    const target = resolveModule(file, binding.source);
    return target ? resolveExport(target, binding.imported, hops) : null;
  }

  // Mount graph: child router → [parent router, prefix]
  const parents = new Map<string, { parent: string; prefix: Segment }[]>();
  for (const [file, fileFacts] of facts) {
    for (const mount of fileFacts.mounts) {
      const parent = resolveName(file, mount.receiver);
      if (!parent) continue;
      let child: string | null = null;
      if (mount.child.kind === 'name') child = resolveName(file, mount.child.name);
      else {
        const target = resolveModule(file, mount.child.source);
        child = target ? resolveExport(target, 'default', 0) : null;
      }
      if (!child) continue;
      const list = parents.get(child) ?? [];
      list.push({ parent, prefix: mount.prefix });
      parents.set(child, list);
    }
  }

  const prefixesOf = (router: string, visiting: Set<string>): Segment[] => {
    const incoming = parents.get(router);
    if (!incoming || incoming.length === 0) return [''];
    const result: Segment[] = [];
    for (const { parent, prefix } of incoming) {
      if (visiting.has(parent)) {
        warnings.push(`router mount cycle detected at ${parent.split('#')[0]}; the cycle was ignored`);
        continue;
      }
      for (const parentPrefix of prefixesOf(parent, new Set([...visiting, router]))) {
        result.push(parentPrefix === null || prefix === null ? null : joinPaths(parentPrefix, prefix));
      }
    }
    return result.length > 0 ? result : [''];
  };

  const routes: Route[] = [];
  for (const [file, fileFacts] of facts) {
    for (const route of fileFacts.routes) {
      const router = resolveName(file, route.receiver);
      if (!router) continue;
      for (const prefix of prefixesOf(router, new Set([router]))) {
        routes.push({
          method: route.method.toUpperCase(),
          path: prefix === null || route.path === null ? null : joinPaths(prefix, route.path),
          file,
          line: route.line,
        });
      }
    }
  }
  return { routes, warnings: [...new Set(warnings)] };
}
