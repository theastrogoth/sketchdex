// Runtime checks for parsed JSON. A `Check<T>` returns its argument typed as `T`,
// or throws a `DataError` naming the offending location.

/** Keys from the root to a value; the first is the file name. */
export type Path = (string | number)[]
export type Check<T> = (value: unknown, path: Path) => T

export class DataError extends Error {
  override name = 'DataError'
}

export function formatPath(path: Path): string {
  return path.map((key, i) => (i === 0 ? String(key) : typeof key === 'number' ? `[${key}]` : `.${key}`)).join('')
}

function describe(value: unknown): string {
  const text = JSON.stringify(value) ?? String(value)
  return text.length > 60 ? `${text.slice(0, 60)}…` : text
}

export function fail(path: Path, expected: string, value: unknown): never {
  throw new DataError(`${formatPath(path)}: expected ${expected}, got ${describe(value)}`)
}

// Runs `check` on `value` as the child `key` of `path`.
function child<T>(check: Check<T>, value: unknown, path: Path, key: string | number): T {
  path.push(key)
  const result = check(value, path)
  path.pop()
  return result
}

export const string: Check<string> = (value, path) => (typeof value === 'string' ? value : fail(path, 'a string', value))
export const boolean: Check<boolean> = (value, path) => (typeof value === 'boolean' ? value : fail(path, 'a boolean', value))
export const number: Check<number> = (value, path) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fail(path, 'a finite number', value)
export const integer: Check<number> = (value, path) => (Number.isInteger(value) ? (value as number) : fail(path, 'an integer', value))
export const unknown: Check<unknown> = (value) => value

/** An id: an integer position in an array of `count` items. */
export function index(count: number): Check<number> {
  return (value, path) =>
    Number.isInteger(value) && (value as number) >= 0 && (value as number) < count
      ? (value as number)
      : fail(path, `an integer in 0..${count - 1}`, value)
}

export function oneOf<const T extends string>(values: readonly T[]): Check<T> {
  const set = new Set<unknown>(values)
  return (value, path) => (set.has(value) ? (value as T) : fail(path, `one of ${values.join(', ')}`, value))
}

export function nullable<T>(check: Check<T>): Check<T | null> {
  return (value, path) => (value === null ? null : check(value, path))
}

export function array<T>(item: Check<T>, length?: number): Check<T[]> {
  return (value, path) => {
    if (!Array.isArray(value)) fail(path, 'an array', value)
    if (length !== undefined && value.length !== length) fail(path, `an array of length ${length}`, value)
    for (let i = 0; i < value.length; i++) child(item, value[i], path, i)
    return value as T[]
  }
}

export function tuple<T extends unknown[]>(...items: { [K in keyof T]: Check<T[K]> }): Check<T> {
  return (value, path) => {
    if (!Array.isArray(value) || value.length !== items.length) fail(path, `an array of length ${items.length}`, value)
    items.forEach((item, i) => child(item, value[i], path, i))
    return value as T
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

type Shape<T> = { [K in keyof T]-?: Check<T[K]> }

function keyed<T>(shape: Shape<T>, required: boolean): Check<T> {
  const keys = Object.keys(shape) as (keyof T & string)[]
  return (value, path) => {
    if (!isObject(value)) fail(path, 'an object', value)
    for (const key of Object.keys(value)) {
      if (!Object.hasOwn(shape, key)) fail(path, `only the keys ${keys.join(', ')}`, key)
    }
    for (const key of keys) {
      if (Object.hasOwn(value, key)) child(shape[key], value[key], path, key)
      else if (required) fail(path, `the key ${key}`, Object.keys(value))
    }
    return value as T
  }
}

/** An object with exactly the keys of `shape`. */
export function object<T>(shape: Shape<T>): Check<T> {
  return keyed(shape, true)
}

/** An object with some of the keys of `shape` and no others. */
export function partial<T>(shape: Shape<T>): Check<Partial<T>> {
  return keyed<Partial<T>>(shape as Shape<Partial<T>>, false)
}

/** An object with arbitrary keys; `key`, if given, throws for keys that are not allowed. */
export function record<T>(item: Check<T>, key?: (key: string, path: Path) => void): Check<Record<string, T>> {
  return (value, path) => {
    if (!isObject(value)) fail(path, 'an object', value)
    for (const [k, v] of Object.entries(value)) {
      key?.(k, path)
      child(item, v, path, k)
    }
    return value as Record<string, T>
  }
}
