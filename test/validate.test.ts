import { expect, test } from 'vitest'
import type { Bundle } from '../src/data/schema.ts'
import { validateBundle, validateDexEntries } from '../src/data/validate.ts'
import { tinyBundle } from './fixture.ts'

// The error from validating the fixture after `mutate` has changed it.
function errorAfter(mutate: (bundle: Bundle) => void): string {
  const bundle = tinyBundle()
  mutate(bundle)
  try {
    validateBundle(bundle)
  } catch (error) {
    return (error as Error).message
  }
  throw new Error('the bundle was accepted')
}

test('accepts a conforming bundle', () => {
  const bundle = tinyBundle()
  expect(validateBundle(bundle)).toEqual(bundle)
})

test('rejects ids that refer to nothing', () => {
  expect(errorAfter((b) => { b.forms[0]!.abilities = [[2, 0]] })).toBe('forms.json[0].abilities[0][0]: expected an integer in 0..1, got 2')
  expect(errorAfter((b) => { b.forms[1]!.obtainability = [[0, 6]] })).toBe('forms.json[1].obtainability[0][1]: expected an integer in 0..5, got 6')
  expect(errorAfter((b) => { b.meta.gameSets[2] = [2, 4] })).toBe('meta.json.gameSets[2][1]: expected an integer in 0..3, got 4')
  expect(errorAfter((b) => { b.encounters.raids.kind = [5] })).toBe('encounters.json.raids.kind[0]: expected an integer in 0..4, got 5')
  expect(errorAfter((b) => { b.placeForms[0] = [[2, 0]] })).toBe('place_forms.json[0][0][0]: expected an integer in 0..1, got 2')
  expect(errorAfter((b) => { b.moves[1]!.games = 6 })).toBe('moves.json[1].games: expected an integer in 0..5, got 6')
  expect(errorAfter((b) => { b.evolutions = [{ from: 0, to: 1, trigger: 'move', level: null, item: null, move: 3, condition: null }] }))
    .toBe('evolutions.json[0].move: expected an integer in 0..2, got 3')
  expect(errorAfter((b) => { b.places[1]!.parent = 3 })).toBe('places.json[1].parent: expected an integer in 0..2, got 3')
})

test('rejects malformed learnsets', () => {
  expect(errorAfter((b) => { b.learnsets[0] = { 3: ['4L1'] } })).toBe('learnsets.json[0]: expected keys that are move ids in 0..2, got "3"')
  expect(errorAfter((b) => { b.learnsets[0] = { 1: ['4X1'] } })).toBe('learnsets.json[0].1[0]: expected a learn code: game-set id, method letter, optional level, got "4X1"')
  expect(errorAfter((b) => { b.learnsets[0] = { 1: ['9L1'] } })).toContain('learnsets.json[0].1[0]: expected a learn code')
})

test('rejects arrays that do not line up', () => {
  expect(errorAfter((b) => { b.learners.pop() })).toContain('learners.json: expected an array of length 3')
  expect(errorAfter((b) => { b.learnsets.push({}) })).toContain('learnsets.json: expected an array of length 2')
  expect(errorAfter((b) => { b.encounters.encounters.rate = [] })).toBe('encounters.json.encounters.rate: expected 1 rows, as in column place, got 0')
})

test('rejects inconsistent content', () => {
  expect(errorAfter((b) => { b.meta.gameSets[0] = [1, 0] })).toBe('meta.json.gameSets[0]: expected game ids in ascending order, got [1,0]')
  expect(errorAfter((b) => { b.forms[1]!.types = ['grass', 'grass'] })).toBe('forms.json[1].types: expected one or two distinct types, got ["grass","grass"]')
  expect(errorAfter((b) => { b.forms[1]!.species = 'bulbasaur' })).toBe('forms.json[1]: expected a key not used by an earlier item, got "bulbasaur/none"')
  expect(errorAfter((b) => { b.forms[0]!.history.baseExp = [[0, 60], [5, 61]] }))
    .toBe('forms.json[0].history.baseExp[1][0]: expected a game set disjoint from the earlier ones, got 5')
  expect(errorAfter((b) => { b.moves[1]!.history.pp = [[0, 30], [5, 25]] }))
    .toBe('moves.json[1].history.pp[1][0]: expected a game set disjoint from the earlier ones, got 5')
  expect(errorAfter((b) => { b.places[0]!.parent = 2 })).toBe('places.json[0].parent: expected a place that is not itself a part of one, got 2')
  expect(errorAfter((b) => { b.meta.games = Array.from({ length: 65 }, (_, i) => ({ ...b.meta.games[0]!, slug: `game-${i}` })) }))
    .toBe('meta.json.games: expected at most 64 games, got 65')
})

test('validates Pokédex entries against the number of forms', () => {
  const entries = [[{ games: ['Ruby'], text: 'A.' }], []]
  expect(validateDexEntries(entries, 2)).toBe(entries)
  expect(() => validateDexEntries(entries, 3)).toThrow('dex_entries.json: expected an array of length 3')
})
