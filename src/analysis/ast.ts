import * as t from '@babel/types';

/** The value of a string literal or an expression-free template literal; null when computed at runtime. */
export function staticString(node: t.Node | null | undefined): string | null {
  if (!node) return null;
  if (t.isStringLiteral(node)) return node.value;
  if (t.isTemplateLiteral(node) && node.expressions.length === 0) return node.quasis[0]?.value.cooked ?? null;
  return null;
}

/** A property key as written: `obj.key`, `obj['key']`, `{ key: … }`. Null for computed, non-static keys. */
export function staticKey(node: t.Node, computed: boolean): string | null {
  if (!computed && t.isIdentifier(node)) return node.name;
  return staticString(node);
}
