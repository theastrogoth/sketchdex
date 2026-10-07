import { beforeAll, expect, test } from 'vitest'
import type { Dataset } from '../src/data/dataset.ts'
import { gamesOf } from '../src/data/gamemask.ts'
import { createEngine, type Engine } from '../src/engine/engine.ts'
import { formsOf } from '../src/engine/pairset.ts'
import { buildNameTable, type NameTable } from '../src/query/names.ts'
import { parse } from '../src/query/parser.ts'
import { suggest } from '../src/query/suggest.ts'
import { print } from '../src/query/printer.ts'
import { tokensOf, tokensToText } from '../src/query/tokens.ts'
import { HELP_EXAMPLES } from '../src/ui/helpExamples.ts'
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
const id = (species: string, form = 'none') => dataset.bundle.forms.findIndex((f) => f.species === species && f.form === form)

test('evolution links follow forms', () => {
  const into = (species: string, form = 'none') => dataset.evolvesInto[id(species, form)]!.map((to) => `${dataset.bundle.forms[to]!.species}/${dataset.bundle.forms[to]!.form}`)
  expect(into('meowth')).toEqual(['persian/none'])
  expect(into('meowth', 'galarian')).toEqual(['perrserker/none'])
  expect(into('shellos', 'east-sea')).toEqual(['gastrodon/east-sea'])
  expect(into('eevee')).toHaveLength(8)
  expect(into('pikachu', 'kanto-cap')).toEqual([])
  expect(dataset.evolvesFrom[id('pikachu', 'kanto-cap')]).toEqual([id('pichu')])
  expect(dataset.evolvesFrom[id('charizard', 'mega-x')]).toEqual([id('charmeleon')])
  expect(dataset.family[id('sylveon')]).toBe(dataset.family[id('eevee', 'partner')])
  expect(dataset.family[id('perrserker')]).toBe(dataset.family[id('persian', 'alolan')])
  expect(dataset.family[id('tauros')]).not.toBe(dataset.family[id('miltank')])
})

test('whether a form can evolve depends on the game', () => {
  expect(games('species:duraludon is:nfe', 'duraludon/none')).toEqual(['scarlet', 'violet', 'the-indigo-disk-scarlet', 'the-indigo-disk-violet'])
  expect(games('species:duraludon fully evolved', 'duraludon/none')).toContain('sword')
  expect(games('species:scyther fully evolved', 'scyther/none')).toContain('red')
  expect(games('species:scyther can evolve', 'scyther/none')).toContain('gold')
  expect(games('species:pikachu basic', 'pikachu/none')).toContain('yellow')
  expect(games('species:pikachu evolved', 'pikachu/none')).toContain('gold')
  expect(forms('species:tauros fully evolved basic')).toContain('tauros/none')
  expect(forms('form:charizard/mega-x nfe')).toEqual([])
})

test('a short list of Pokémon does not make evolved ones basic', () => {
  // Champions has Charizard without Charmander, and The Crown Tundra's list Raichu without Pikachu.
  expect(forms('stage = 1 (species:charizard | species:raichu | species:venusaur | species:dragonite | species:gengar)')).toEqual([])
  expect(games('species:charizard stage = 3', 'charizard/none')).toEqual(expect.arrayContaining(['red', 'champions', 'the-isle-of-armor-sword']))
  expect(forms('stage = 1 is:evolved')).toEqual([])
  expect(games('species:pikachu basic', 'pikachu/none')).toEqual(['red', 'blue', 'yellow'])
  expect(games('species:raichu evolved', 'raichu/none')).toContain('the-crown-tundra-sword')
  // An evolution in the base game counts in its DLC, and one that is in neither does not.
  expect(games('species:duraludon is:nfe', 'duraludon/none')).toEqual(['scarlet', 'violet', 'the-indigo-disk-scarlet', 'the-indigo-disk-violet'])
  expect(games('species:scyther fully evolved', 'scyther/none')).toEqual(expect.arrayContaining(['red', 'lets-go-pikachu']))
})

test('stages count the forms that existed', () => {
  expect(games('species:pikachu stage = 1', 'pikachu/none')).toContain('red')
  expect(games('species:pikachu stage = 2', 'pikachu/none')).toContain('crystal')
  expect(games('species:raichu stage = 3', 'raichu/none')).not.toContain('red')
  expect(forms('form:charizard/mega-x stage = 3')).toEqual(['charizard/mega-x'])
  expect(forms('stage > 3')).toEqual([])
})

test('how a form evolves', () => {
  expect(forms('evolves with water stone red')).toEqual(['poliwhirl/none', 'shellder/none', 'staryu/none', 'eevee/none'])
  expect(forms('evolves:trade game:red')).toEqual(['kadabra/none', 'machoke/none', 'graveler/none', 'haunter/none'])
  expect(forms('evolves-with:kings-rock').sort()).toEqual(['poliwhirl/none', 'slowpoke/none'])
  expect(forms('species:dragonair evolevel = 55')).toEqual(['dragonair/none'])
  expect(forms('species:eevee evolves:friendship')).toEqual(['eevee/none'])
  expect(games('species:eevee evolves:friendship', 'eevee/none')).not.toContain('red')
})

test('kinships carry filters along evolutionary lines, within a game', () => {
  expect(forms('prevo(species:eevee) gold')).toEqual(['vaporeon/none', 'jolteon/none', 'flareon/none', 'espeon/none', 'umbreon/none'])
  expect(forms('evo(species:raichu) crystal')).toEqual(['pikachu/none', 'pichu/none'])
  expect(forms('family(species:pikachu) red')).toEqual(['pikachu/none', 'raichu/none'])
  // Pichu is not in Red, so nothing there has it for a relative.
  expect(forms('family(species:pichu) red')).toEqual([])
  expect(forms('prevo(type:normal) type:fairy x')).toContain('sylveon/none')
  expect(forms('prevo(prevo(species:charmander)) x')).toEqual(['charizard/none', 'charizard/mega-x', 'charizard/mega-y'])
  expect(forms('family(ability:levitate) type:fire')).toContain('rotom/heat')
})

test('kinships are written and read back', () => {
  const expr = (text: string) => parse(text, names)
  expect(expr('prevo(type:fire | egg:monster) basic').expr).toEqual({
    kind: 'and',
    args: [{ kind: 'kin', kinship: 'prevo', arg: { kind: 'or', args: [{ kind: 'type', type: 'fire' }, { kind: 'eggGroup', group: 'monster' }] } }, { kind: 'evolution', state: 'basic' }],
  })
  for (const text of ['family(type:fire & is:nfe)', 'evo(prevo(species:eevee))', '!evo(stage = 3)', 'evolves-with:king-s-rock | evolves:trade', 'evolevel >= 30']) {
    expect(print(expr(text).expr!)).toBe(text)
  }
  expect(expr('family(type:fire').diagnostics.map((d) => d.message)).toEqual(['missing closing parenthesis'])
  expect(expr('family ()').diagnostics.map((d) => d.message)).toEqual(['unknown name "family"'])
  const text = 'prevo( type:fire | is:basic ) evolves:trade'
  expect(tokensToText(tokensOf(text, expr(text), names)).text).toBe('prevo( type:fire | is:basic ) evolves:trade')
})

test('effort values yielded and gender ratios compare, and fixed genders are named', () => {
  // Blissey yields HP alone; Pidgeot three of Speed from Generation III on, and nothing that is known of before.
  expect(forms('species:blissey evhp >= 2 game:violet')).toEqual(['blissey/none'])
  expect(forms('species:blissey evspe > 0')).toEqual([])
  expect(games('species:pidgeot evspe = 3', 'pidgeot/none')).toContain('emerald')
  expect(games('species:pidgeot evspe = 3', 'pidgeot/none')).not.toContain('red')
  // Percent male, and its complement; a genderless form has neither.
  expect(forms('species:pyroar male < 20 game:x')).toEqual(['pyroar/none'])
  expect(forms('species:pyroar female = 87.5 game:x')).toEqual(['pyroar/none'])
  expect(forms('species:magnemite (male >= 0 | female >= 0)')).toEqual([])
  expect(forms('species:magnemite genderless game:violet')).toEqual(['magnemite/none'])
  expect(forms('(species:blissey | species:tauros | species:eevee) always female game:violet')).toEqual(['blissey/none'])
  expect(forms('(species:blissey | species:tauros | species:eevee) male only game:red')).toEqual(['tauros/none'])
  expect(print(parse('all male', names).expr!)).toBe('gender:male-only')
})

test('growth rates, hidden abilities, counts of types and abilities, and ways of evolving', () => {
  expect(forms('(species:altaria | species:garchomp) growth:erratic game:violet')).toEqual(['altaria/none'])
  expect(print(parse('fluctuating', names).expr!)).toBe('growth:fluctuating')
  // Hidden abilities are from Generation V on.
  expect(games('species:garchomp has:hidden-ability', 'garchomp/none')).toContain('black')
  expect(games('species:garchomp has hidden ability', 'garchomp/none')).not.toContain('platinum')
  expect(forms('(species:charizard | species:charmander) types = 1 game:red')).toEqual(['charmander/none'])
  expect(forms('(species:garchomp | species:ditto) abilities = 2 game:violet').sort()).toEqual(['ditto/none', 'garchomp/none'])
  // A trade holding an item is both an evolution by trade and one by item; a stone is by item alone.
  const gold = (text: string) => forms(`(species:onix | species:kadabra | species:eevee | species:gloom) ${text} game:gold`).sort()
  expect(gold('evolves:trade')).toEqual(['kadabra/none', 'onix/none'])
  expect(gold('evolves:item')).toEqual(['eevee/none', 'gloom/none', 'onix/none'])
  expect(gold('evolves at night')).toEqual(['eevee/none'])
  expect(forms('evolves:rain game:x')).toEqual(['sliggoo/none'])
  expect(forms('evolves-knowing:rollout game:platinum')).toEqual(['lickitung/none'])
  expect(print(parse('evolves knowing rollout', names).expr!)).toBe('evolves-knowing:rollout')
})

test('an encounter with a Pokémon holding an item', () => {
  expect(forms('holds:rare-candy')).toContain('meowth/none')
  expect(games('encounter(holds:rare-candy level > 1)', 'meowth/none')).toEqual(['black-2', 'white-2'])
  expect(print(parse('holding rare candy', names).expr!)).toBe('holds:rare-candy')
})

test('games with none in common, joined by and, are each to hold', () => {
  // In one game and in another: nothing is in both at once.
  expect(games('game:sword game:scarlet species:eevee', 'eevee/none')).toEqual(['sword', 'scarlet'])
  expect(forms('game:sword game:scarlet species:bidoof')).toEqual([])
  // What else is said is said of each.
  expect(forms('game:sword game:scarlet type:fire tag:legendary')).toContain('moltres/none')
  expect(forms('game:sword game:scarlet type:fire tag:legendary')).not.toContain('moltres/galarian')
  const both = forms('(obtain:catchable game:firered) (obtain:catchable game:leafgreen)')
  expect(both).toContain('caterpie/none')
  expect(both).not.toContain('ekans/none')
  expect(forms('obtain:catchable game:firered')).toContain('ekans/none')
  // Games with some in common still mean those.
  expect(games('gen:9 game:scarlet species:eevee', 'eevee/none')).toEqual(['scarlet'])
  expect(games('(game:sword | game:shield) game:scarlet species:eevee', 'eevee/none')).toEqual(['sword', 'shield', 'scarlet'])
})

test('items held in the wild', () => {
  // Chansey may hold a Lucky Egg from Generation III to VI.
  expect(games('holds:lucky-egg species:chansey', 'chansey/none')).toContain('emerald')
  expect(games('holds:lucky-egg species:chansey', 'chansey/none')).not.toContain('sun')
  expect(forms('holding silver powder game:emerald')).toContain('butterfree/none')
  // Among the filters on one encounter, only an encounter that gives the item counts.
  expect(forms('encounter(holds:lucky-egg)')).toEqual([])
  expect(parse('holds:no-such-item', names).diagnostics).not.toEqual([])
})

test('groups of games are named by their games and known by their abbreviations', () => {
  const shown = (text: string) => tokensOf(text, parse(text, names), names).map((token) => token.kind === 'leaf' && token.label)
  expect(shown('vg:firered-leafgreen')).toEqual(['FireRed & LeafGreen'])
  expect(shown('vg:the-teal-mask')).toEqual(['The Teal Mask'])
  expect(print(parse('FRLG', names).expr!)).toBe('vg:firered-leafgreen')
  expect(print(parse('swsh', names).expr!)).toBe('vg:sword-shield')
  expect(print(parse('LZA', names).expr!)).toBe('game:legends-z-a')
  // Abbreviations of several groups together.
  expect(shown('rby')).toEqual(['Red, Blue & Yellow'])
  expect(games('rse species:treecko', 'treecko/none')).toEqual(['ruby', 'sapphire', 'emerald'])
})

test('a form with any item held in the wild', () => {
  expect(games('has:held-item species:chansey', 'chansey/none')).toContain('emerald')
  expect(forms('has:held-item species:chansey game:red')).toEqual([])
  expect(forms('(species:chansey | species:caterpie) holds an item game:emerald')).toEqual(['chansey/none'])
})

test('typing of raids brings up the comparison of their stars', () => {
  const offered = (text: string) => suggest(text, names).map((suggestion) => (suggestion.kind === 'hint' ? suggestion.draft : suggestion.kind === 'leaf' ? suggestion.text : suggestion.op))
  expect(offered('raid').slice(0, 5)).toContain('stars >= ')
  expect(offered('tera raid').slice(0, 2)).toEqual(['method:tera-raid', 'stars >= '])
  expect(offered('max raid')).toContain('stars >= ')
  expect(offered('sta')).toContain('stars >= ')
  expect(offered('ra')).toContain('stars >= ')
  expect(offered('r')).not.toContain('stars >= ')
})

test('the examples of the help are queries without problems that find something', () => {
  for (const example of Object.values(HELP_EXAMPLES).flat()) {
    const { expr, diagnostics } = parse(example, names)
    expect(diagnostics, example).toEqual([])
    expect(formsOf(engine.evaluate(expr!)).length, example).toBeGreaterThan(0)
  }
})

test('encounters with a Pokémon that is always there are static', () => {
  expect(print(parse('method:static', names).expr!)).toBe('method:interact')
  expect(print(parse('encounter(static level >= 50)', names).expr!)).toBe('encounter(method:interact & level >= 50)')
  expect(names.display({ kind: 'method', method: 'interact' })).toBe('Static')
})

test('different regions, joined by and, are each to be one the form is found in', () => {
  // Whatever the games: the Terarium is in other games than most of Paldea, and Kanto in others still.
  const both = forms('region:terarium region:paldea')
  expect(both).toEqual(expect.arrayContaining(['chansey/none', 'venonat/none', 'venomoth/none']))
  expect(games('region:terarium region:paldea species:chansey', 'chansey/none')).toEqual(['scarlet', 'violet', 'the-indigo-disk-scarlet', 'the-indigo-disk-violet'])
  expect(forms('region:paldea region:kanto type:fire')).toContain('growlithe/none')
  expect(forms('region:paldea region:kanto species:fuecoco')).toEqual([])
  // One region, or one of two, is as before.
  expect(games('region:terarium species:chansey', 'chansey/none')).toEqual(['the-indigo-disk-scarlet', 'the-indigo-disk-violet'])
  expect(forms('(region:terarium | region:paldea) species:fuecoco')).toEqual(['fuecoco/none'])
})

test('the Sevii Islands are a region of their own', () => {
  expect(games('region:sevii species:sentret', 'sentret/none')).toEqual(['firered', 'leafgreen'])
  expect(forms('region:kanto species:sentret game:firered')).toEqual([])
  expect(print(parse('sevii islands berry forest', names).expr!)).toBe('place:sevii/berry-forest')
})

test('obtainable is had within the game in any way, and not by transfer or from an event', () => {
  // Bulbasaur is a gift in Red, Ivysaur evolves from it, and both are transferred into Gold; Mew is from events.
  expect(forms('obtainable:red')).toEqual(expect.arrayContaining(['bulbasaur/none', 'ivysaur/none', 'pidgey/none']))
  expect(forms('obtainable:red')).not.toContain('mew/none')
  for (const game of ['red', 'gold', 'scarlet']) {
    const ways = ['catchable', 'trade', 'breed', 'evolve', 'mega-evolution'].flatMap((way) => forms(`${way}:${game}`))
    expect(forms(`obtainable:${game}`)).toEqual(expect.arrayContaining(ways))
    expect(forms(`obtainable:${game} (transfer:${game} | event:${game})`)).toEqual([])
    expect(forms(`obtainable:${game}`).length + forms(`transfer:${game}`).length + forms(`event:${game}`).length + forms(`unknown:${game}`).length)
      .toBe(forms(`game:${game} (obtainable:${game} | transfer:${game} | event:${game} | unknown:${game})`).length)
  }
  expect(forms('transfer:gold')).toContain('bulbasaur/none')
  expect(forms('obtainable:gold')).not.toContain('bulbasaur/none')
})

test('what one version has that the other lacks', () => {
  const scarletOnly = forms('(obtain:catchable game:scarlet) -(obtain:catchable game:violet)')
  expect(scarletOnly).toEqual(expect.arrayContaining(['larvitar/none', 'tauros/paldean-blaze-breed']))
  expect(scarletOnly).not.toContain('misdreavus/none')
  expect(scarletOnly).not.toContain('pikachu/none')
  expect(forms('(obtain:catchable game:violet) -(obtain:catchable game:scarlet)')).toContain('misdreavus/none')
})

test('"catchable in" goes on as the prefix does', () => {
  const offered = (text: string) => suggest(text, names).flatMap((suggestion) => (suggestion.kind === 'leaf' ? [suggestion.text] : []))
  expect(offered('catchable in scar')).toEqual(offered('catchable:scar'))
  expect(offered('catchable in scar')[0]).toBe('catchable:scarlet')
  expect(offered('catchable in').length).toBeGreaterThan(5)
  expect(offered('catchable in')).toEqual(offered('catchable:'))
  expect(offered('By breeding in gold')[0]).toBe('breed:gold')
  // A game's name alone does not bring them up.
  expect(offered('scarlet').some((text) => text.startsWith('catchable:'))).toBe(false)
  expect(print(parse('catchable in scarlet -catchable in violet', names).expr!)).toBe('catchable:scarlet & !catchable:violet')
})

test('a place is of its region: places and regions of different regions are each to hold, whatever the games', () => {
  // Route 1 is Kanto's in Red, and Johto is in Gold: Pidgey is on the one and in the other.
  expect(games('place:kanto/route-1 region:johto', 'pidgey/none')).toEqual(expect.arrayContaining(['red', 'gold', 'heartgold']))
  expect(games('place:kanto/route-1 place:johto/route-29', 'pidgey/none')).toEqual(expect.arrayContaining(['red', 'gold']))
  expect(forms('place:kanto/route-1 region:paldea')).not.toContain('pidgey/none')
  // Places of one region are in one game, as before; so is a place with its own region.
  const route1 = games('place:kanto/route-1', 'pidgey/none')
  const route2 = games('place:kanto/route-2', 'pidgey/none')
  expect(games('place:kanto/route-1 place:kanto/route-2', 'pidgey/none')).toEqual(route1.filter((game) => route2.includes(game)))
  expect(forms('place:kanto/route-1 region:kanto')).toEqual(forms('place:kanto/route-1'))
})

test('not, of regions, is the forms found there in no game', () => {
  const notJohto = forms('not region:johto')
  expect(notJohto).toContain('fuecoco/none')
  expect(notJohto).not.toContain('pidgey/none')
  // In every game they are in, as with games.
  expect(games('not region:johto species:fuecoco', 'fuecoco/none')).toContain('scarlet')
  expect(forms('region:paldea not region:kanto type:fire')).toContain('fuecoco/none')
  expect(forms('region:paldea not region:kanto type:fire')).not.toContain('growlithe/none')
})

test('not, of where or whether a form is to be had, beside named games is of none of those games', () => {
  // Mareep is caught in Johto in Gold and Silver, and is absent from Crystal: it is not uncatchable in Generation II.
  const uncatchable = forms('gen:2 not (obtain:catchable region:johto)')
  expect(uncatchable).not.toContain('mareep/none')
  expect(uncatchable).not.toContain('phanpy/none')
  expect(uncatchable).toContain('bulbasaur/none')
  expect(forms('vg:sword-shield not obtain:catchable species:deino')).toEqual([])
  // What a form is, as against where it is, is still said game by game.
  expect(games('(gen:1 | gen:6) not type:fairy species:clefairy', 'clefairy/none')).toEqual(['red', 'blue', 'yellow'])
  // With no games named, it is of no game at all; a game named beside it is the one it is of.
  expect(forms('not obtain:catchable species:mareep')).toEqual([])
  expect(games('game:crystal not obtain:catchable species:mareep', 'mareep/none')).toEqual(['crystal'])
  expect(forms('not obtain:catchable')).toContain('mew/none')
  // Deeper in the query it is the same: the games named around the brackets are those in question.
  const nested = forms('gen:2 (type:fire | not obtain:catchable)')
  expect(nested).toEqual(expect.arrayContaining(['cyndaquil/none', 'bulbasaur/none']))
  expect(nested).not.toContain('mareep/none')
  // A mix of what a form is and where it is to be had is of the form as well.
  expect(forms('gen:2 not (type:electric obtain:catchable)')).not.toContain('mareep/none')
})

test('a region and games it is in none of are worlds apart', () => {
  // In Scarlet, and found in Kanto in games of its own.
  expect(games('region:kanto game:scarlet species:pikachu', 'pikachu/none')).toEqual(expect.arrayContaining(['red', 'scarlet']))
  expect(forms('region:kanto game:scarlet')).not.toContain('fuecoco/none')
  expect(games('catchable:scarlet region:kanto species:larvitar', 'larvitar/none')).toEqual(['crystal', 'scarlet'])
  // A region that is in the game is in it.
  expect(games('game:scarlet region:paldea species:fuecoco', 'fuecoco/none')).toEqual(['scarlet'])
  // Not found in a region that is in none of the games named is not found there in any game.
  const scarletNotKanto = forms('game:scarlet not region:kanto')
  expect(scarletNotKanto).toContain('fuecoco/none')
  expect(scarletNotKanto).not.toContain('pikachu/none')
  expect(forms('gen:1 not region:johto')).not.toContain('pidgey/none')
  expect(forms('gen:1 not region:johto')).toContain('bulbasaur/none')
  // In the games named, where the region is in some of them.
  expect(forms('gen:2 not region:johto')).toContain('bulbasaur/none')
  expect(forms('gen:2 not (obtain:catchable region:johto)')).not.toContain('mareep/none')
})

test('a relative is of the world that the filters on it name, in games of its own', () => {
  // Annihilape is in no game with Kanto, where Mankey and Primeape are found.
  expect(forms('family(region:kanto) species:annihilape')).toEqual(['annihilape/none'])
  const notOfKanto = forms('game:scarlet not family(region:kanto)')
  expect(notOfKanto).not.toContain('annihilape/none')
  expect(notOfKanto).not.toContain('pikachu/none')
  expect(notOfKanto).toContain('fuecoco/none')
  expect(notOfKanto.length).toBeLessThan(forms('game:scarlet').length)
  // Larvitar evolves, in Violet, into what is caught in Scarlet.
  expect(games('evo(catchable:scarlet) game:violet species:larvitar', 'larvitar/none')).toEqual(['violet'])
  // In a game of that world, and with filters that name none, it is the same game as before.
  expect(games('family(region:kanto) gen:1 species:pikachu', 'pikachu/none')).toEqual(['red', 'blue', 'yellow'])
  expect(forms('evo(type:fairy) species:clefairy game:red')).toEqual([])
})
