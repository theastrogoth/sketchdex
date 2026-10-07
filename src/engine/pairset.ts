import { MASK_WORDS, hasGame } from '../data/gamemask.ts'

/**
 * A set of (form, game) pairs: for each form id, the mask of the games it is paired
 * with, in words `2 * form` and `2 * form + 1`.
 */
export type PairSet = Uint32Array

export function emptyPairs(formCount: number): PairSet {
  return new Uint32Array(MASK_WORDS * formCount)
}

export function intersection(a: PairSet, b: PairSet): PairSet {
  const result = new Uint32Array(a.length)
  for (let i = 0; i < a.length; i++) result[i] = a[i]! & b[i]!
  return result
}

export function union(a: PairSet, b: PairSet): PairSet {
  const result = new Uint32Array(a.length)
  for (let i = 0; i < a.length; i++) result[i] = a[i]! | b[i]!
  return result
}

/** The pairs of `a` that are not in `b`. */
export function difference(a: PairSet, b: PairSet): PairSet {
  const result = new Uint32Array(a.length)
  for (let i = 0; i < a.length; i++) result[i] = a[i]! & ~b[i]!
  return result
}

/** Add the games of the mask (`lo`, `hi`) to `form`'s pairs. */
export function addGames(set: PairSet, form: number, lo: number, hi: number): void {
  set[2 * form] = set[2 * form]! | lo
  set[2 * form + 1] = set[2 * form + 1]! | hi
}

export function hasPair(set: PairSet, form: number, game: number): boolean {
  return hasGame(set, MASK_WORDS * form, game)
}

/** The ids of the forms paired with at least one game, in ascending order. */
export function formsOf(set: PairSet): number[] {
  const forms: number[] = []
  for (let form = 0; 2 * form < set.length; form++) {
    if (set[2 * form] !== 0 || set[2 * form + 1] !== 0) forms.push(form)
  }
  return forms
}
