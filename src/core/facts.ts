/** Marks a fact that could not be determined from the source. Rendered as the literal text `Not Found`. */
export const NOT_FOUND = Symbol('NotFound');
export type Maybe<T> = T | typeof NOT_FOUND;

export const NOT_FOUND_TEXT = 'Not Found';

/** Turns null, undefined and empty strings into NOT_FOUND, so extractors never pass on "empty" values. */
export function maybe<T>(value: T | null | undefined): Maybe<T> {
  if (value === null || value === undefined) return NOT_FOUND;
  if (typeof value === 'string' && value.trim() === '') return NOT_FOUND;
  return value;
}

export function firstFound<T>(...values: Maybe<T>[]): Maybe<T> {
  return values.find((value) => value !== NOT_FOUND) ?? NOT_FOUND;
}

/** The single place where NOT_FOUND becomes text (architecture §5.1). */
export function fmt<T>(value: Maybe<T>, show: (found: T) => string = String): string {
  return value === NOT_FOUND ? NOT_FOUND_TEXT : show(value);
}
