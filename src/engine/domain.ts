import type { Expr } from './expr.ts'
import type { PairSet } from './pairset.ts'

/**
 * A kind of thing other than forms that filters can be about (moves, encounters),
 * with the way from a set of them to the forms it stands for.
 */
export interface Domain {
  /** Whether `expr` is a single condition on a thing of this kind. */
  owns(expr: Expr): boolean
  /**
   * What a condition is about, for deciding which conditions joined by `and` can be
   * about one thing: two with the same attribute cannot. `null` for a condition that
   * can always join others, `'!'` for one that never does, and `'*'` for one that
   * applies to each of the things the others are about.
   */
  attribute(expr: Expr): string | null
  /** The (form, game) pairs in which the form has one thing satisfying all of `parts`. */
  lift(parts: Expr[]): PairSet
}

/** Split conditions joined by `and` into groups that can each be about one thing. */
export function grouped(domain: Domain, conditions: Expr[]): Expr[][] {
  const groups: { parts: Expr[]; attributes: Set<string> }[] = []
  const shared = conditions.filter((condition) => domain.attribute(condition) === '*')
  for (const condition of conditions) {
    const attribute = domain.attribute(condition)
    if (attribute === '*') continue
    let group = attribute === '!' ? undefined : groups.find((g) => !g.attributes.has('!') && (attribute === null || !g.attributes.has(attribute)))
    if (!group) groups.push(group = { parts: [], attributes: new Set() })
    group.parts.push(condition)
    if (attribute !== null) group.attributes.add(attribute)
  }
  return groups.length === 0 && shared.length > 0 ? [shared] : groups.map((group) => [...group.parts, ...shared])
}
