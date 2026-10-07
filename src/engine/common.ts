import type { Comparator } from './expr.ts'

/** A query that cannot be evaluated, such as one naming an ability that does not exist. */
export class QueryError extends Error {
  override name = 'QueryError'
}

/** The slug of a display name: lower case, with `-` for each run of other characters. */
export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

/** Version groups that go by one name together, by its abbreviation: `vg:rse` is the games of both. */
export const COMBINED_GROUPS: Record<string, string[]> = {
  rby: ['red-blue', 'yellow'], gsc: ['gold-silver', 'crystal'], rse: ['ruby-sapphire', 'emerald'], dppt: ['diamond-pearl', 'platinum'],
}

export const COMPARE: Record<Comparator, (a: number, b: number) => boolean> = {
  '<': (a, b) => a < b,
  '<=': (a, b) => a <= b,
  '=': (a, b) => a === b,
  '!=': (a, b) => a !== b,
  '>=': (a, b) => a >= b,
  '>': (a, b) => a > b,
}
