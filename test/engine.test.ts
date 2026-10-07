import { beforeAll, describe, expect, test } from 'vitest'
import { buildDataset } from '../src/data/dataset.ts'
import { gamesOf } from '../src/data/gamemask.ts'
import { validateBundle } from '../src/data/validate.ts'
import { createEngine, slugify, type Engine } from '../src/engine/engine.ts'
import type { Attribute, Comparator, Expr } from '../src/engine/expr.ts'
import { formsOf } from '../src/engine/pairset.ts'
import { committedDataset } from './data.ts'
import { tinyBundle } from './fixture.ts'

const and = (...args: Expr[]): Expr => ({ kind: 'and', args })
const or = (...args: Expr[]): Expr => ({ kind: 'or', args })
const not = (arg: Expr): Expr => ({ kind: 'not', arg })
const type = (name: Extract<Expr, { kind: 'type' }>['type']): Expr => ({ kind: 'type', type: name })
const ability = (slug: string, hidden?: boolean): Expr => ({ kind: 'ability', ability: slug, ...(hidden === undefined ? {} : { hidden }) })
const game = (slug: string): Expr => ({ kind: 'game', game: slug })
const generation = (n: number): Expr => ({ kind: 'generation', generation: n })
function compare(left: Attribute | number, comparator: Comparator, right: Attribute | number): Expr {
  const operand = (x: Attribute | number) => (typeof x === 'number' ? { kind: 'number' as const, value: x } : { kind: 'attribute' as const, attribute: x })
  return { kind: 'compare', comparator, left: operand(left), right: operand(right) }
}

// The matches of `expr` as `species/form` with the slugs of the games matched in.
function matches(engine: Engine, expr: Expr): Record<string, string[]> {
  const { forms, meta } = engine.dataset.bundle
  const set = engine.evaluate(expr)
  return Object.fromEntries(formsOf(set).map((id) => [`${forms[id]!.species}/${forms[id]!.form}`, gamesOf(set, 2 * id).map((g) => meta.games[g]!.slug)]))
}
const names = (engine: Engine, expr: Expr) => Object.keys(matches(engine, expr))

test('slugify', () => {
  expect(['Water 1', 'Human-Like', 'Mega Evolution'].map(slugify)).toEqual(['water-1', 'human-like', 'mega-evolution'])
})

// Bulbasaur is in all four games, without abilities before Ruby; Treecko is in Ruby only.
describe('a small bundle', () => {
  const engine = createEngine(buildDataset(validateBundle(tinyBundle())))
  const all = ['red-japan', 'red', 'gold', 'ruby']

  test('terms pair forms with the games they hold in', () => {
    expect(matches(engine, type('grass'))).toEqual({ 'bulbasaur/none': all, 'treecko/none': ['ruby'] })
    expect(matches(engine, type('poison'))).toEqual({ 'bulbasaur/none': all })
    expect(matches(engine, ability('overgrow'))).toEqual({ 'bulbasaur/none': ['ruby'], 'treecko/none': ['ruby'] })
    expect(matches(engine, ability('chlorophyll', true))).toEqual({ 'bulbasaur/none': ['ruby'] })
    expect(matches(engine, ability('chlorophyll', false))).toEqual({})
    expect(matches(engine, ability('overgrow', false))).toEqual({ 'bulbasaur/none': ['ruby'], 'treecko/none': ['ruby'] })
    expect(matches(engine, { kind: 'eggGroup', group: 'dragon' })).toEqual({ 'treecko/none': ['ruby'] })
    expect(matches(engine, game('gold'))).toEqual({ 'bulbasaur/none': ['gold'] })
    expect(matches(engine, generation(1))).toEqual({ 'bulbasaur/none': ['red-japan', 'red'] })
    expect(matches(engine, { kind: 'introduced', generation: 1 })).toEqual({ 'bulbasaur/none': all })
    expect(matches(engine, { kind: 'introduced', generation: 3 })).toEqual({ 'treecko/none': ['ruby'] })
    expect(matches(engine, { kind: 'versionGroup', versionGroup: 'ruby-sapphire' })).toEqual({ 'bulbasaur/none': ['ruby'], 'treecko/none': ['ruby'] })
    expect(matches(engine, { kind: 'obtain', status: 'catchable' })).toEqual({ 'bulbasaur/none': all, 'treecko/none': ['ruby'] })
    expect(matches(engine, { kind: 'obtain', status: 'transfer' })).toEqual({})
    expect(matches(engine, { kind: 'species', species: 'treecko' })).toEqual({ 'treecko/none': ['ruby'] })
    expect(matches(engine, { kind: 'tag', tag: 'mythical' })).toEqual({ 'treecko/none': ['ruby'] })
    expect(matches(engine, { kind: 'tag', tag: 'paradox' })).toEqual({})
    expect(matches(engine, { kind: 'form', species: 'bulbasaur', form: 'none' })).toEqual({ 'bulbasaur/none': all })
  })

  test('and requires both conditions in the same game', () => {
    expect(matches(engine, and(ability('overgrow'), generation(1)))).toEqual({})
    expect(matches(engine, and(type('grass'), generation(3)))).toEqual({ 'bulbasaur/none': ['ruby'], 'treecko/none': ['ruby'] })
    expect(matches(engine, and())).toEqual({ 'bulbasaur/none': all, 'treecko/none': ['ruby'] })
  })

  test('or and not', () => {
    expect(matches(engine, or(game('gold'), type('poison')))).toEqual({ 'bulbasaur/none': all })
    expect(matches(engine, or())).toEqual({})
    expect(matches(engine, not(ability('overgrow')))).toEqual({ 'bulbasaur/none': ['red-japan', 'red', 'gold'] })
    expect(matches(engine, not(type('poison')))).toEqual({ 'treecko/none': ['ruby'] })
    expect(matches(engine, not(generation(1)))).toEqual({ 'treecko/none': ['ruby'] })
    expect(matches(engine, not(or(game('gold'), game('ruby'))))).toEqual({})
  })

  test('comparisons', () => {
    expect(names(engine, compare('spe', '>', 'atk'))).toEqual(['treecko/none'])
    expect(names(engine, compare('bst', '=', 318))).toEqual(['bulbasaur/none'])
    expect(names(engine, compare(50, '>', 'hp'))).toEqual(['bulbasaur/none', 'treecko/none'])
    expect(names(engine, compare('weight', '<=', 5))).toEqual(['treecko/none'])
    expect(names(engine, compare('dex', '!=', 1))).toEqual(['treecko/none'])
    expect(names(engine, compare('introduced', '<', 3))).toEqual(['bulbasaur/none'])
    expect(matches(engine, compare('generation', '>=', 2))).toEqual({ 'bulbasaur/none': ['gold', 'ruby'], 'treecko/none': ['ruby'] })
    expect(matches(engine, not(compare('generation', '>=', 3)))).toEqual({})
    expect(matches(engine, not(compare(2, '<', 'generation')))).toEqual({})
    expect(names(engine, compare('spa', '>=', 'spd'))).toEqual(['bulbasaur/none', 'treecko/none'])
  })

  test('rejects names that refer to nothing', () => {
    expect(() => engine.evaluate(ability('levitate'))).toThrow('unknown ability "levitate"')
    expect(() => engine.evaluate(game('emerald'))).toThrow('unknown game "emerald"')
    expect(() => engine.evaluate(generation(4))).toThrow('unknown generation 4')
    expect(() => engine.evaluate({ kind: 'introduced', generation: 2 })).toThrow('no form was introduced in generation 2')
    expect(() => engine.evaluate({ kind: 'versionGroup', versionGroup: 'x-y' })).toThrow('unknown version group "x-y"')
    expect(() => engine.evaluate({ kind: 'eggGroup', group: 'fairy' })).toThrow('unknown egg group "fairy"')
    expect(() => engine.evaluate({ kind: 'obtain', status: 'gift' })).toThrow('unknown obtainability status "gift"')
    expect(() => engine.evaluate({ kind: 'species', species: 'mew' })).toThrow('unknown species "mew"')
    expect(() => engine.evaluate({ kind: 'form', species: 'treecko', form: 'mega' })).toThrow('unknown form "treecko/mega"')
  })
})

describe('the committed data', () => {
  let engine: Engine
  beforeAll(async () => {
    engine = createEngine(await committedDataset())
  })

  test('a type holds only in the games where the form has it', () => {
    expect(names(engine, and(type('fairy'), game('black')))).toEqual([])
    expect(matches(engine, and(type('fairy'), generation(6)))['clefairy/none']).toEqual(['x', 'y', 'omega-ruby', 'alpha-sapphire'])
    expect(names(engine, and(type('normal'), game('black')))).toContain('clefairy/none')
    expect(names(engine, and(type('dragon'), generation(1)))).toEqual(['dratini/none', 'dragonair/none', 'dragonite/none'])
  })

  test('abilities combine with types', () => {
    expect(names(engine, and(type('ground'), ability('levitate')))).toEqual(['vibrava/none', 'flygon/none', 'baltoy/none', 'claydol/none'])
    expect(names(engine, and(ability('levitate'), generation(2)))).toEqual([])
    expect(names(engine, ability('friend-guard', true))).toContain('clefairy/none')
    expect(names(engine, ability('friend-guard', false))).not.toContain('clefairy/none')
  })

  test('not, of games, is the forms that are in none of them', () => {
    const notGen8 = matches(engine, not(generation(8)))
    expect(notGen8['pikachu/none']).toBeUndefined()
    expect(notGen8['patrat/none']).toEqual(expect.arrayContaining(['black', 'x', 'sun']))
    expect(Object.values(notGen8).flat().some((slug) => ['sword', 'brilliant-diamond', 'legends-arceus'].includes(slug))).toBe(false)
    // The forms in neither, not those missing from one of the two.
    const neither = names(engine, not(or(generation(8), generation(9))))
    expect(neither).toContain('pikachu/belle')
    expect(neither).not.toContain('patrat/none')
    expect(neither.length).toBeLessThan(Object.keys(notGen8).length)
    expect(names(engine, and(not(game('red')), generation(1)))).toEqual(names(engine, and(not(game('red')), game('yellow'))))
    // With something said of the forms too, it is the forms of which that holds in none of those games.
    const notFireInGen8 = matches(engine, not(and(generation(8), type('fire'))))
    expect(notFireInGen8['charmander/none']).toBeUndefined()
    expect(notFireInGen8['bulbasaur/none']).toEqual(expect.arrayContaining(['red', 'sword', 'scarlet']))
  })

  test('not is limited to the games a form is present in', () => {
    const notFire = matches(engine, and(not(type('fire')), game('scarlet')))
    expect(notFire['sprigatito/none']).toEqual(['scarlet'])
    expect(notFire['charmander/none']).toBeUndefined()
    expect(notFire['venusaur/mega']).toBeUndefined()
    expect(names(engine, not(and()))).toEqual([])
  })

  test('comparisons use each game\'s values', () => {
    expect(names(engine, and(compare('spa', '!=', 'spd'), generation(1)))).toEqual([])
    expect(names(engine, and(compare('bst', '>=', 720), game('scarlet'))).every((name) => name.startsWith('arceus/'))).toBe(true)
    expect(names(engine, compare('weight', '<', 0.2))).toContain('gastly/none')
    expect(names(engine, { kind: 'eggGroup', group: 'ditto' })).toEqual(['ditto/none'])
  })

  test('a form is introduced in the generation of its earliest game', () => {
    const fairies = matches(engine, and({ kind: 'introduced', generation: 1 }, type('fairy')))
    expect(Object.keys(fairies)).toEqual(['clefairy/none', 'clefable/none', 'jigglypuff/none', 'wigglytuff/none', 'mr-mime/none'])
    expect(fairies['clefairy/none']).not.toContain('black')
    expect(fairies['clefairy/none']).toContain('x')
    const of = (species: string, form = 'none') =>
      [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((n) => names(engine, { kind: 'introduced', generation: n }).includes(`${species}/${form}`))
    expect([of('pichu'), of('sylveon'), of('rattata', 'alolan'), of('charizard', 'mega-x'), of('clefable', 'mega')]).toEqual([[2], [6], [7], [6], [9]])
  })

  test('obtainability statuses are per game', () => {
    expect(names(engine, and({ kind: 'obtain', status: 'gift' }, game('red')))).toContain('bulbasaur/none')
    expect(names(engine, and({ kind: 'obtain', status: 'catchable' }, game('red')))).not.toContain('bulbasaur/none')
    expect(names(engine, and({ kind: 'obtain', status: 'mega-evolution' }, game('scarlet')))).toEqual([])
  })
})
