import type { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import { staticKey } from './ast.js';
import { traverse } from './traverse.js';

export interface EnvUsage {
  name: string;
  file: string;
  line: number;
  /** True when this use supplies a default, so the variable is optional here (FR-11, DR-1). */
  hasFallback: boolean;
}

export interface EnvScan {
  usages: EnvUsage[];
  /** Lines with `process.env[expr]` where the name is not static; reported at debug level (DR-10). */
  dynamicKeys: { file: string; line: number }[];
}

const COERCIONS = new Set(['Number', 'String', 'Boolean', 'parseInt', 'parseFloat']);

function isProcessEnv(node: t.Node): boolean {
  if (!t.isMemberExpression(node) && !t.isOptionalMemberExpression(node)) return false;
  if (!t.isIdentifier(node.object, { name: 'process' })) return false;
  return node.computed
    ? t.isStringLiteral(node.property, { value: 'env' })
    : t.isIdentifier(node.property, { name: 'env' });
}

/**
 * Walks up through wrappers that don't change whether a value is "missing":
 * parentheses, TS casts/non-null, and coercions like Number(process.env.PORT).
 */
function outermost(path: NodePath): NodePath {
  let current = path;
  for (;;) {
    const parent = current.parentPath;
    if (!parent) return current;
    const node = parent.node;
    const transparent =
      t.isParenthesizedExpression(node) ||
      t.isTSAsExpression(node) ||
      t.isTSSatisfiesExpression(node) ||
      t.isTSNonNullExpression(node) ||
      t.isTSTypeAssertion(node) ||
      (t.isCallExpression(node) &&
        t.isIdentifier(node.callee) &&
        COERCIONS.has(node.callee.name) &&
        node.arguments[0] === current.node);
    if (!transparent) return current;
    current = parent;
  }
}

function hasFallback(path: NodePath): boolean {
  const value = outermost(path);
  const parent = value.parent;
  if (t.isLogicalExpression(parent) && (parent.operator === '||' || parent.operator === '??')) {
    return parent.left === value.node;
  }
  if (t.isAssignmentExpression(parent) && (parent.operator === '||=' || parent.operator === '??=')) {
    return parent.left === value.node;
  }
  return false;
}

/** A write (`process.env.X = …`), `delete process.env.X` or `'X' in process.env` is not a use. */
function isWriteOrDelete(path: NodePath): boolean {
  const parent = path.parent;
  if (t.isAssignmentExpression(parent) && parent.operator === '=' && parent.left === path.node) return true;
  return t.isUnaryExpression(parent, { operator: 'delete' });
}

export function findEnvUsages(file: string, ast: t.File): EnvScan {
  const usages: EnvUsage[] = [];
  const dynamicKeys: EnvScan['dynamicKeys'] = [];

  const visitMember = (path: NodePath<t.MemberExpression | t.OptionalMemberExpression>) => {
    const { node } = path;
    if (!isProcessEnv(node.object)) return;
    const line = node.loc?.start.line ?? 0;
    const name = staticKey(node.property, node.computed);
    if (name === null) {
      dynamicKeys.push({ file, line });
      return;
    }
    if (isWriteOrDelete(path)) return;
    usages.push({ name, file, line, hasFallback: hasFallback(path) });
  };

  traverse(ast, {
    MemberExpression: visitMember,
    OptionalMemberExpression: visitMember,
    VariableDeclarator(path) {
      const { id, init } = path.node;
      if (!init || !isProcessEnv(init) || !t.isObjectPattern(id)) return;
      for (const property of id.properties) {
        if (!t.isObjectProperty(property)) continue;
        const name = staticKey(property.key, property.computed);
        if (name === null) continue;
        usages.push({
          name,
          file,
          line: property.loc?.start.line ?? 0,
          hasFallback: t.isAssignmentPattern(property.value),
        });
      }
    },
  });

  return { usages, dynamicKeys };
}
