import { expect, test } from 'vitest'
import { addGames, difference, emptyPairs, formsOf, hasPair, intersection, union } from './pairset.ts'

// Three forms: form 0 with games 0 and 40, form 2 with game 31.
function sample() {
  const set = emptyPairs(3)
  addGames(set, 0, 1, 1 << 8)
  addGames(set, 2, 1 << 31, 0)
  return set
}

test('pairs are addressed by form and game', () => {
  const set = sample()
  expect([hasPair(set, 0, 0), hasPair(set, 0, 40), hasPair(set, 2, 31)]).toEqual([true, true, true])
  expect([hasPair(set, 0, 1), hasPair(set, 1, 0), hasPair(set, 2, 63)]).toEqual([false, false, false])
  expect(formsOf(set)).toEqual([0, 2])
  expect(formsOf(emptyPairs(3))).toEqual([])
})

test('set operations act on pairs, not on forms', () => {
  const other = emptyPairs(3)
  addGames(other, 0, 1, 0)
  addGames(other, 1, 2, 0)
  expect(Array.from(intersection(sample(), other))).toEqual([1, 0, 0, 0, 0, 0])
  expect(Array.from(union(sample(), other))).toEqual([1, 1 << 8, 2, 0, (1 << 31) >>> 0, 0])
  expect(Array.from(difference(sample(), other))).toEqual([0, 1 << 8, 0, 0, (1 << 31) >>> 0, 0])
})
