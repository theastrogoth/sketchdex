import { beforeAll, describe, expect, test } from 'vitest'
import type { Dataset } from '../src/data/dataset.ts'
import { gamesOf } from '../src/data/gamemask.ts'
import { grouped, type Domain } from '../src/engine/domain.ts'
import { createEngine, type Engine } from '../src/engine/engine.ts'
import type { Expr } from '../src/engine/expr.ts'
import { flagSlug } from '../src/engine/moves.ts'
import { formsOf } from '../src/engine/pairset.ts'
import { buildNameTable, type NameTable } from '../src/query/names.ts'
import { parse } from '../src/query/parser.ts'
import { print } from '../src/query/printer.ts'
import { suggest } from '../src/query/suggest.ts'
import { tokensOf, tokensToText } from '../src/query/tokens.ts'
import { committedDataset } from './data.ts'

let dataset: Dataset
let engine: Engine
let names: NameTable
beforeAll(async () => {
  dataset = await committedDataset()
  engine = createEngine(dataset)
  names = buildNameTable(dataset)
})

// The matches of a query that must have no problems, as `species/form` with the games matched in.
function matches(text: string): Record<string, string[]> {
  const { expr, diagnostics } = parse(text, names)
  expect(diagnostics).toEqual([])
  const { forms, meta } = dataset.bundle
  const set = engine.evaluate(expr!)
  return Object.fromEntries(formsOf(set).map((id) => [`${forms[id]!.species}/${forms[id]!.form}`, gamesOf(set, 2 * id).map((g) => meta.games[g]!.slug)]))
}
const games = (text: string, form: string) => matches(text)[form] ?? []
const forms = (text: string) => Object.keys(matches(text))
const canonical = (text: string) => print(parse(text, names).expr!)

test('conditions joined by "and" are grouped by what they can be about together', () => {
  const domain: Pick<Domain, 'attribute'> = {
    attribute: (expr) => (expr.kind === 'move' ? '!' : expr.kind === 'learn' ? '*' : expr.kind === 'compare' ? null : expr.kind),
  }
  const fire: Expr = { kind: 'moveType', type: 'fire' }
  const water: Expr = { kind: 'moveType', type: 'water' }
  const byTm: Expr = { kind: 'learn', method: 'tm' }
  const physical: Expr = { kind: 'category', category: 'physical' }
  const strong: Expr = { kind: 'compare', comparator: '>', left: { kind: 'moveAttribute', attribute: 'power' }, right: { kind: 'number', value: 70 } }
  const surf: Expr = { kind: 'move', move: 'surf' }
  const groups = (conditions: Expr[]) => grouped(domain as Domain, conditions)
  expect(groups([physical, fire, strong])).toEqual([[physical, fire, strong]])
  expect(groups([fire, water, physical])).toEqual([[fire, physical], [water]])
  expect(groups([surf, physical, surf])).toEqual([[surf], [physical], [surf]])
  expect(groups([surf, byTm, physical])).toEqual([[surf, byTm], [physical, byTm]])
  expect(groups([byTm])).toEqual([[byTm]])
  expect(groups([])).toEqual([])
})

test('flag slugs', () => {
  expect(['makesContact', 'isSound', 'isSheerForce'].map(flagSlug)).toEqual(['contact', 'sound', 'sheer-force'])
})

describe('moves', () => {
  test('a named move is learned in the games where it is', () => {
    expect(games('species:pikachu surf', 'pikachu/none')).toContain('yellow')
    expect(games('species:pikachu move(surf learn:event)', 'pikachu/none')).toContain('yellow')
    expect(forms('species:charmander move:surf')).toEqual([])
    expect(forms('fake tears & acid spray scarlet').length).toBeGreaterThan(0)
    expect(forms('move(fake tears & acid spray)')).toEqual([])
  })

  test('filters joined by "and" are about one move', () => {
    const one = forms('physical movetype:grass power > 70 type:water scarlet')
    expect(one).toEqual(forms('move(physical & grass & bp > 70) type:water scarlet'))
    expect(one).toContain('ludicolo/none')
    // Each alone is far more common than the three in one move.
    expect(forms('move(physical) move(grass) move(bp > 70) type:water scarlet').length).toBeGreaterThan(one.length)
  })

  test('a second type or category is about another move', () => {
    expect(forms('movetype:fire movetype:water form:gyarados/none')).toEqual(['gyarados/none'])
    expect(forms('move(fire water) form:gyarados/none')).toEqual([])
  })

  test('a move\'s values are those of the game', () => {
    // Bite was a Normal move in Generation I and a special one until Generation IV.
    expect(games('species:growlithe move(bite movetype:normal)', 'growlithe/none')).toEqual(['red', 'blue', 'yellow'])
    expect(games('species:growlithe move(move:bite category:special) gen 3', 'growlithe/none')).toContain('emerald')
    expect(forms('species:growlithe move(move:bite category:special) gen 4')).toEqual([])
    expect(games('species:bulbasaur move(tackle power = 35)', 'bulbasaur/none')).toContain('platinum')
    expect(games('species:bulbasaur move(tackle power = 35)', 'bulbasaur/none')).not.toContain('x')
    expect(forms('move(fairy) gen 5')).toEqual([])
  })

  test('how a move is learned', () => {
    expect(forms('move(flamethrower learn:levelup learnlevel <= 20) red')).toEqual([])
    expect(forms('species:charmander move(flamethrower learnlevel <= 40) red')).toEqual(['charmander/none'])
    // Joined by "and", how a move is learned is about the move named: Flamethrower was no TM before Generation III.
    expect(forms('species:charmander flamethrower learn:tm emerald')).toEqual(['charmander/none'])
    expect(forms('species:charmander flamethrower learn:tm red')).toEqual([])
    expect(forms('species:charmander flamethrower move(learn:tm) red')).toEqual(['charmander/none'])
    expect(forms('flag:sound priority > 0')).toEqual([])
    expect(forms('move(contact priority > 0) form:rattata/none')).toEqual(['rattata/none'])
  })

  test('Z-Moves and Max Moves are used by the forms with a move to make them from', () => {
    expect(names.entries.filter((entry) => entry.display === 'Devastating Drake')).toHaveLength(1)
    const drake = matches('move:devastating-drake')
    expect(drake['dragonite/none']).toEqual(['sun', 'moon', 'ultra-sun', 'ultra-moon'])
    expect(drake['magikarp/none']).toBeUndefined()
    expect(Object.keys(drake).some((form) => form.endsWith('/mega'))).toBe(false)
    expect(forms('catastropika')).toEqual(['pikachu/none'])
    expect(forms('move:light-that-burns-the-sky')).toEqual(['necrozma/ultra'])
    expect(games('species:charizard max flare', 'charizard/none')).toEqual(expect.arrayContaining(['sword', 'shield']))
    expect(forms('max flare species:zacian')).toEqual([])
    expect(canonical('move(dragon learn:zcrystal)')).toBe('move(movetype:dragon & learn:zcrystal)')
  })

  test('filters on Pokémon are refused inside a group about a move', () => {
    expect(() => engine.evaluate(parse('move(type:fire)', names).expr!)).toThrow('a filter on Pokémon cannot be among the filters on one move')
    expect(() => engine.evaluate(parse('move(surf | learn:tm)', names).expr!)).toThrow('how a move is learned can only be joined')
    expect(() => engine.evaluate(parse('power > bst', names).expr!)).toThrow('a comparison about a move can only involve numbers and what moves have')
  })
})

describe('encounters', () => {
  test('the examples of the design', () => {
    expect(forms('Paldea East Province AND (Fake Tears OR Acid Spray) AND (type:flying OR Levitate)')).toContain('gastly/none')
    const surfed = matches('Gen III AND (Surfing OR Fishing)')
    expect(surfed['magikarp/none']).toEqual(expect.arrayContaining(['ruby', 'firered', 'emerald']))
    expect(Object.values(surfed).flat().every((game) => ['ruby', 'sapphire', 'emerald', 'firered', 'leafgreen', 'colosseum', 'xd'].includes(game))).toBe(true)
  })

  test('filters joined by "and" are about one encounter', () => {
    expect(forms('encounter(surfing kanto level >= 40) red')).toEqual(['tentacool/none'])
    expect(forms('surfing kanto level >= 40 red')).toEqual(['tentacool/none'])
    // Surfed for somewhere, and found at a high level somewhere, is far more common.
    expect(forms('encounter(surfing) encounter(level >= 30) emerald')).toEqual(expect.arrayContaining(forms('surfing level >= 30 emerald')))
  })

  test('two places are both places', () => {
    const both = forms('place:paldea/east-province place:paldea/west-province')
    expect(both.length).toBeGreaterThan(10)
    expect(both.length).toBeLessThan(forms('place:paldea/east-province').length)
    expect(forms('encounter(place:paldea/east-province place:paldea/west-province)')).toEqual([])
  })

  test('a place includes its parts', () => {
    const whole = forms('place:paldea/south-province')
    const part = forms('place:paldea/south-province/south-province-area-one')
    expect(part.length).toBeGreaterThan(5)
    expect(whole).toEqual(expect.arrayContaining(part))
    expect(forms('South Province Area One')).toEqual(part)
    expect(forms('region:kitakami').length).toBeGreaterThan(50)
    // Kitakami is in the games of The Teal Mask, not in Scarlet: beside Scarlet it is a world apart, to hold as well.
    expect(forms('region:kitakami the-teal-mask-scarlet').length).toBeGreaterThan(50)
    expect(forms('region:kitakami scarlet')).toEqual(forms('anygame(region:kitakami) scarlet'))
  })

  test('times, weathers, and traits', () => {
    // Generation I has no times of day, so nothing there is found "at night".
    expect(forms('time:night red')).toEqual([])
    expect(forms('species:hoothoot night gold')).toEqual(['hoothoot/none'])
    // Surfing is not tied to a time in Gold, which has times, so it happens at night too.
    expect(forms('species:tentacool surfing night gold')).toEqual(['tentacool/none'])
    expect(forms('species:tentacool surfing night red')).toEqual([])
    expect(forms('enc:alpha region:hisui').length).toBeGreaterThan(50)
    expect(forms('enc:alpha gen 3')).toEqual([])
    expect(forms('method:tera-raid stars = 6 type:dragon')).toContain('dragonite/none')
    expect(forms('enc:gigantamax method:raid')).toContain('charizard/gigantamax')
    expect(forms('weather:thunderstorm galar').length).toBeGreaterThan(5)
  })

  test('only at a time', () => {
    expect(forms('species:hoothoot only at night gold')).toEqual(['hoothoot/none'])
    expect(forms('species:hoothoot only:day gold')).toEqual([])
    // Found at every time, by surfing: at night, but not only at night.
    expect(forms('species:tentacool only:night gold')).toEqual([])
    const nightOnly = forms('only:night kanto gold')
    expect(nightOnly).toEqual(expect.arrayContaining(['zubat/none', 'oddish/none']))
    expect(forms('time:night kanto gold')).toEqual(expect.arrayContaining(nightOnly))
    expect(forms('time:night kanto gold').length).toBeGreaterThan(nightOnly.length)
    expect(canonical('night only kanto')).toBe('only:night & region:kanto')
    expect(names.display({ kind: 'time', time: 'night', only: true })).toBe('Night')
  })

  test('seasons are a condition of encounters, not places', () => {
    const { places } = dataset.bundle
    expect(places.filter((p) => p.region === 'unova' && /\b(spring|summer|autumn|winter)\b/i.test(p.name))).toEqual([])
    expect(forms('unova route 6 winter black').length).toBeGreaterThan(3)
    // Deerling is on Route 6 in every season, Vanillite on Route 6 of Black and White only in winter.
    expect(games('species:vanillite only in winter place:unova/route-6', 'vanillite/none')).toEqual(['black', 'white'])
    expect(forms('species:deerling only:winter place:unova/route-6')).toEqual([])
    expect(forms('species:deerling season:winter place:unova/route-6').length).toBeGreaterThan(0)
    // The seasons are Unova's: nothing elsewhere is found "in winter".
    expect(forms('winter kanto')).toEqual([])
    expect(forms('winter red')).toEqual([])
    expect(canonical('summer | only:autumn')).toBe('season:summer | only:autumn')
  })

  test('only in a weather', () => {
    const inRain = forms('weather:raining sword')
    const onlyInRain = forms('only in raining sword')
    expect(onlyInRain.length).toBeGreaterThan(0)
    expect(inRain).toEqual(expect.arrayContaining(onlyInRain))
    expect(onlyInRain.length).toBeLessThan(inRain.length)
    // What is there in every weather is not there only in rain.
    expect(onlyInRain).not.toEqual(expect.arrayContaining(forms('weather:all-weather sword').slice(0, 1)))
    expect(canonical('raining only galar')).toBe('only:rain & region:galar')
    expect(canonical('only:night only:raining')).toBe('only:night & only:rain')
    expect(parse('only:surf', names).diagnostics.map((d) => d.message)).toEqual(['unknown time or season or weather "surf"'])
  })

  test('the two games\' names for one weather are one filter', () => {
    const rain = matches('weather:rain')
    expect(Object.values(rain).flat()).toEqual(expect.arrayContaining(['sword', 'legends-arceus']))
    expect(matches('raining')).toEqual(rain)
    expect(canonical('raining | overcast | snowing | heavy fog')).toBe('weather:rain | weather:cloudy | weather:snow | weather:fog')
    const weathers = names.entries.flatMap((entry) => (entry.term.kind === 'weather' && !entry.term.only ? [entry.term.weather] : []))
    expect(weathers.sort()).toEqual(['all-weather', 'cloudy', 'drought', 'fog', 'intense-sun', 'normal-weather', 'rain', 'rainstorm', 'sandstorm', 'snow', 'snowstorm', 'sunny', 'thunderstorm'])
  })

  test('weather counts only where an encounter is tied to it', () => {
    expect(forms('weather:raining scarlet')).toEqual([])
    expect(forms('weather:raining sword').length).toBeGreaterThan(20)
    expect(forms('weather:raining sword')).toEqual(expect.arrayContaining(forms('weather:all-weather sword').slice(0, 5)))
  })

  test('a shared name is asked about, a prefixed one is not', () => {
    const { expr, diagnostics } = parse('route 1', names)
    expect(expr).toBeNull()
    expect(diagnostics[0]!.candidates).toEqual(['place:kanto/route-1', 'place:unova/route-1', 'place:alola/route-1', 'place:galar/route-1'])
    expect(canonical('Kanto Route 1')).toBe('place:kanto/route-1')
    expect(canonical('surf')).toBe('move:surf')
    expect(canonical('encounter(surf)')).toBe('encounter(method:surf)')
    expect(canonical('move(grass bite) flying')).toBe('move(movetype:grass & move:bite) & type:flying')
    expect(canonical('move(contact flag:bite)')).toBe('move(flag:contact & flag:bite)')
  })

  test('inside a group, suggestions and names are the group\'s', () => {
    const labels = (text: string, scope?: 'move' | 'encounter') => suggest(text, names, scope).map((token) => (token.kind === 'op' ? '' : `${token.group}: ${token.label}`))
    expect(labels('grass')[0]).toBe('Type: Grass')
    expect(labels('grass', 'move').slice(0, 2)).toEqual(['Move type: Grass', 'Move: Grass Whistle'])
    expect(labels('surf', 'encounter').slice(0, 2)).toEqual(['Method: Surf', 'Method: Surfing'])
    expect(labels('contact', 'move')).toEqual(['Move flag: Contact'])
    expect(labels('pikachu', 'move')).toEqual([])
    expect(labels('bp>70', 'move')).toEqual(['Comparison: Power > 70'])
    expect(print(parse('grass physical', names, 'move').expr!)).toBe('movetype:grass & category:physical')
  })

  test('any game', () => {
    // Clefairy has never been both Normal and Fairy in one game.
    expect(forms('species:clefairy type:normal type:fairy')).toEqual([])
    const ever = matches('species:clefairy anygame(type:normal) anygame(type:fairy)')
    expect(ever['clefairy/none']).toEqual(expect.arrayContaining(['red', 'scarlet']))
    expect(canonical('anygame(levitate | type:fire) gen 3')).toBe('anygame(ability:levitate | type:fire) & gen:3')
  })

  test('what makes a form match', () => {
    const { forms: all, meta } = dataset.bundle
    const tentacool = all.findIndex((f) => f.species === 'tentacool')
    const red = meta.games.findIndex((g) => g.slug === 'red')
    const inRed = Uint32Array.of(1 << red, 0)
    const explain = (text: string) => engine.explain(text === '' ? null : parse(text, names).expr, tentacool, inRed)
    const surfed = explain('surfing kanto level >= 40 red')
    expect(surfed.encounters.length).toBeGreaterThan(0)
    expect(surfed.encounters.every((e) => e.method === 'surf' && e.maxLevel >= 40)).toBe(true)
    expect(surfed.learned).toEqual([])
    expect(explain('').encounters.length).toBeGreaterThan(surfed.encounters.length)
    const moves = explain('move(water learn:levelup) | surf')
    expect(moves.learned.map((way) => dataset.bundle.moves[way.move]!.slug)).toEqual(expect.arrayContaining(['water-gun', 'hydro-pump', 'surf']))
    expect(explain('not surf').learned).toEqual([])
  })

  test('groups are suggested by the start of their names', () => {
    expect(suggest('mov', names)[0]).toEqual({ kind: 'op', op: 'move(' })
    expect(suggest('pre', names)[0]).toEqual({ kind: 'op', op: 'prevo(' })
    expect(suggest('any', names)[0]).toEqual({ kind: 'op', op: 'anygame(' })
    expect(suggest('mov', names, 'move').some((s) => s.kind === 'op')).toBe(false)
    expect(names.display({ kind: 'method', method: 'sos' })).toBe('SOS')
  })

  test('groups are written back as typed', () => {
    const text = 'encounter( method:surfing & level >= 40 ) move( category:physical | movetype:grass )'
    expect(tokensToText(tokensOf(text, parse(text, names), names)).text).toBe(text)
    expect(canonical(text)).toBe('encounter(method:surfing & level >= 40) & move(category:physical | movetype:grass)')
  })
})
