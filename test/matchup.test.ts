import { beforeAll, expect, test } from 'vitest'
import { gamesOf } from '../src/data/gamemask.ts'
import { createEngine, type Engine } from '../src/engine/engine.ts'
import { formsOf } from '../src/engine/pairset.ts'
import { buildNameTable, type NameTable } from '../src/query/names.ts'
import { parse } from '../src/query/parser.ts'
import { print } from '../src/query/printer.ts'
import { suggest } from '../src/query/suggest.ts'
import { committedDataset } from './data.ts'

let engine: Engine
let names: NameTable
beforeAll(async () => {
  engine = createEngine(await committedDataset())
  names = buildNameTable(engine.dataset)
})

// The matches of a query that must have no problems, as `species/form` with the games matched in.
function matches(text: string): Record<string, string[]> {
  const { expr, diagnostics } = parse(text, names)
  expect(diagnostics).toEqual([])
  const { forms, meta } = engine.dataset.bundle
  const set = engine.evaluate(expr!)
  return Object.fromEntries(formsOf(set).map((id) => [`${forms[id]!.species}/${forms[id]!.form}`, gamesOf(set, 2 * id).map((g) => meta.games[g]!.slug)]))
}
const games = (text: string, form: string) => matches(text)[form] ?? []
const forms = (text: string) => Object.keys(matches(text))

test('matchups follow each generation\'s chart', () => {
  expect(games('species:alakazam immune:ghost', 'alakazam/none')).toEqual(['red', 'blue', 'yellow'])
  expect(games('species:alakazam weak to ghost gen 2', 'alakazam/none')).toEqual(['gold', 'silver', 'crystal'])
  expect(games('species:bulbasaur vs:bug = 4', 'bulbasaur/none')).toEqual(['red', 'blue', 'yellow'])
  const skarmory = games('species:skarmory resists dark', 'skarmory/none')
  expect(skarmory).toContain('white-2')
  expect(skarmory).not.toContain('x')
})

test('matchups follow each game\'s types', () => {
  expect(games('species:clefairy weak:fighting', 'clefairy/none')).toContain('black')
  expect(games('species:clefairy weak:fighting', 'clefairy/none')).not.toContain('x')
  expect(games('species:clefairy immune:dragon weak:steel', 'clefairy/none')).toContain('x')
})

test('a type that a generation lacks has no matchups there', () => {
  expect(forms('weak:fairy gen 5')).toEqual([])
  expect(forms('(weak:dark | resists:dark | immune:dark | neutral:dark | vs:dark >= 0) gen 1')).toEqual([])
  expect(forms('neutral:fairy x').length).toBeGreaterThan(100)
})

test('abilities count unless told otherwise', () => {
  expect(games('species:bronzong weak:fire', 'bronzong/none')).toContain('platinum')
  expect(games('species:bronzong immune:ground', 'bronzong/none')).toContain('platinum')
  // With Levitate it is weak to Fire, with Heatproof it is not; only without abilities is it always so.
  expect(games('species:bronzong always-weak:fire', 'bronzong/none')).toEqual(['legends-arceus'])
  expect(forms('species:bronzong always-immune:ground')).toEqual([])
  expect(forms('species:bronzong base-immune:ground')).toEqual([])
  expect(games('species:bronzong base-weak:fire', 'bronzong/none')).toContain('platinum')
  expect(games('species:shedinja immune:water always-immune:normal', 'shedinja/none')).toContain('emerald')
  expect(forms('immune:ground -type:flying -levitate sword')).toEqual(['shedinja/none'])
  expect(forms('species:rhyperior vs:water = 3')).toEqual(['rhyperior/none'])
})

test('abilities take effect from the generation that gave it to them', () => {
  const manectric = games('species:manectric immune:electric', 'manectric/none')
  expect(manectric).not.toContain('emerald')
  expect(manectric).toContain('black')
})

test('matchups are written in several ways', () => {
  const expr = (text: string) => parse(text, names).expr
  expect(expr('weak to fire')).toEqual({ kind: 'matchup', relation: 'weak', type: 'fire' })
  expect(expr('Immune to Ground')).toEqual({ kind: 'matchup', relation: 'immune', type: 'ground' })
  expect(expr('resists:steel')).toEqual({ kind: 'matchup', relation: 'resists', type: 'steel' })
  expect(expr('always-neutral:ice')).toEqual({ kind: 'matchup', relation: 'neutral', type: 'ice', abilities: 'all' })
  expect(expr('vs:Ice >= 4')).toEqual({ kind: 'compare', comparator: '>=', left: { kind: 'matchup', type: 'ice' }, right: { kind: 'number', value: 4 } })
  for (const text of ['always-weak:fire', 'base-immune:ground', 'vs:ice >= 4', 'vs:fire < vs:water']) expect(print(expr(text)!)).toBe(text)
  expect(parse('weak:levitate', names).diagnostics.map((d) => d.message)).toEqual(['unknown matchup "levitate"'])
})

test('matchups are suggested', () => {
  const labels = (text: string) => suggest(text, names).map((token) => (token.kind === 'op' ? '' : `${token.group}: ${token.label}`))
  expect(labels('weak to gr')).toEqual(['Weak to: Grass', 'Weak to: Ground'])
  expect(labels('always-immune:f')).toEqual(['Immune to (every ability): Fire', 'Immune to (every ability): Fighting', 'Immune to (every ability): Flying', 'Immune to (every ability): Fairy'])
  expect(labels('vs:rock > 2')).toEqual(['Comparison: damage from Rock > 2'])
  expect(labels('fire')[0]).toBe('Type: Fire')
  expect(labels('weak fire')).toEqual(['Weak to: Fire'])
})
