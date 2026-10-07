import { EVOLUTION_TRIGGERS, TAGS } from '../src/data/schema.ts'
import { encounterVocabulary } from '../src/engine/encounters.ts'
import { slugify } from '../src/engine/engine.ts'
import { EVOLUTION_STATES } from '../src/engine/expr.ts'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { beforeAll, describe, expect, test } from 'vitest'
import { buildDataset, type Dataset } from '../src/data/dataset.ts'
import { validateBundle } from '../src/data/validate.ts'
import { LANGUAGES, translationsFile, type Language, type Translations } from '../src/i18n/languages.ts'
import { translator } from '../src/i18n/ui.ts'
import { DESCRIPTIONS } from '../src/query/describe.ts'
import { buildNameTable } from '../src/query/names.ts'
import { parse } from '../src/query/parser.ts'
import { print } from '../src/query/printer.ts'
import { createHandler } from '../src/worker/handler.ts'
import { committedDataset } from './data.ts'
import { tinyBundle } from './fixture.ts'

test('the interface\'s text falls back to English', () => {
  expect(translator('fr')('{n} forms', { n: 3 })).toBe('3 formes')
  expect(translator('en')('{n} forms', { n: 3 })).toBe('3 forms')
  expect(translator('de')('no such text')).toBe('no such text')
  expect(translator('ja')('Remove {label}', { label: 'ほのお' })).toBe('ほのおを削除')
})

test('translated names are typed and shown alongside the English ones', () => {
  const dataset = buildDataset(validateBundle(tinyBundle()))
  const handler = createHandler(dataset, { sprite: [null, null], localSprite: [null, null], badge: [null, null], art: [null, null], shinyArt: [null, null], home: [null, null], homeShiny: [null, null] })
  handler.setLanguage('fr', { 'species:bulbasaur': 'Bulbizarre', 'type:grass': 'Plante', 'ability:overgrow': 'Engrais', 'game:gold': 'Or' })
  const ready = handler.ready()
  expect([ready.language, ready.forms[0]!.name, ready.forms[1]!.name, ready.types.grass, ready.types.poison, ready.abilities, ready.games[2]!.name])
    .toEqual(['fr', 'Bulbizarre', 'Treecko', 'Plante', 'Poison', ['Engrais', 'Chlorophyll'], 'Or'])
  const { tokens, diagnostics } = handler.answer({ id: 0, kind: 'parse', text: 'bulbizarre Bulbasaur plante weak to plante engrais or "Or"' })
  expect(diagnostics).toEqual([])
  expect(tokens).toMatchObject([
    { text: 'species:bulbasaur', label: 'Bulbizarre' }, { text: 'species:bulbasaur', label: 'Bulbizarre' }, { text: 'type:grass', label: 'Plante' },
    { text: 'weak:grass', label: 'Plante', group: 'Weak to' }, { text: 'ability:overgrow', label: 'Engrais' },
    // The game Gold is "Or" in French; unquoted, the word is the operator.
    { kind: 'op', op: 'or' }, { text: 'game:gold', label: 'Or' },
  ])
  expect(handler.answer({ id: 0, kind: 'suggest', text: 'bulbi' })).toMatchObject([{ text: 'species:bulbasaur', label: 'Bulbizarre' }])
  handler.setLanguage('en', {})
  expect(handler.ready().forms[0]!.name).toBe('Bulbasaur')
})

describe('the committed translations', () => {
  let dataset: Dataset
  const translations = {} as Record<Exclude<Language, 'en'>, Translations>
  beforeAll(async () => {
    dataset = await committedDataset()
    for (const language of Object.keys(LANGUAGES) as Language[]) {
      if (language !== 'en') translations[language] = JSON.parse(await readFile(join(import.meta.dirname, '../public/data', translationsFile(language)), 'utf8')) as Translations
    }
  })

  test('ways of learning and of meeting, and what encounters are tied to, have a name in every language', () => {
    const vocabulary = encounterVocabulary(dataset)
    const keys = [
      ...Object.values(dataset.bundle.meta.learnMethods).map((method) => `learn:${method}`), ...vocabulary.methods.map((method) => `method:${method}`),
      ...vocabulary.times.map((time) => `time:${time}`), ...vocabulary.seasons.map((season) => `season:${season}`),
      ...vocabulary.weathers.map((weather) => `weather:${weather}`),
      ...TAGS.map((tag) => `tag:${tag}`), ...EVOLUTION_STATES.map((state) => `state:${state}`), ...EVOLUTION_TRIGGERS.map((trigger) => `trigger:${trigger}`),
      ...dataset.bundle.meta.obtainStatuses.map((status) => `obtain:${slugify(status)}`), ...new Set(dataset.bundle.forms.map((form) => `growth:${slugify(form.growthRate)}`)),
      'gender:genderless', 'has:hidden-ability', 'has:held-item',
    ]
    for (const names of Object.values(translations)) expect(keys.filter((key) => !(key in names))).toEqual([])
  })

  test('the values of fixed filters are shown, and can be typed, in the language', () => {
    const table = buildNameTable(dataset, translations.fr)
    expect(table.display({ kind: 'tag', tag: 'legendary' })).toBe('Légendaire')
    expect(table.display({ kind: 'evolution', state: 'fully-evolved' })).toBe('Évolution finale')
    expect(table.display({ kind: 'gender', gender: 'female-only' })).toBe('100% ♀')
    expect(print(parse('légendaire asexué', table).expr!)).toBe('tag:legendary & gender:genderless')
    expect(print(parse('always female', table).expr!)).toBe('gender:female-only')
  })

  test('a query is described in words, in every language', () => {
    // One handler per language: making one takes a while.
    const handlers = new Map<Language, ReturnType<typeof createHandler>>()
    const described = (language: Language, text: string) => {
      let handler = handlers.get(language)
      if (!handler) {
        handlers.set(language, handler = createHandler(dataset, { sprite: [], localSprite: [], badge: [], art: [], shinyArt: [], home: [], homeShiny: [] }))
        if (language !== 'en') handler.setLanguage(language, translations[language]!)
      }
      return handler.answer({ id: 0, kind: 'query', text }).description
    }
    expect(described('en', '')).toBeNull()
    expect(described('en', 'type:normal or type:fire')).toBe('A Pokémon that has the Normal type OR has the Fire type')
    expect(described('en', 'Paldea East Province & (Fake Tears | Acid Spray) & (type:flying | Levitate)'))
      .toBe('A Pokémon that is found in East Province (Paldea) AND (learns Fake Tears OR learns Acid Spray) AND (has the Flying type OR has the Levitate ability)')
    // After `not`, a filter has a wording of its own.
    expect(described('en', '(type:normal | type:fire) game:scarlet -ability:levitate -(bst > 500 | tag:mega)'))
      .toBe('A Pokémon that (has the Normal type OR has the Fire type) AND is in Scarlet AND does NOT have the Levitate ability AND NOT (has BST > 500 OR is: Mega Evolution)')
    // Among the filters on one move, the words are said of the move.
    expect(described('en', 'move(movetype:grass power > 70) movetype:fire -move(category:status)'))
      .toBe('A Pokémon that learns a move that (has the Grass type AND has Power > 70) AND learns a Fire-type move AND does NOT learn a move that (is a Status move)')
    expect(described('en', 'always-weak:fire prevo(species:eevee)')).toBe('A Pokémon that is weak to Fire (every ability) AND evolves from a Pokémon that (is Eevee)')
    expect(described('fr', 'type:normal or type:fire -levitate')).toBe('Un Pokémon qui a le type Normal OU (a le type Feu ET n’a pas le talent Lévitation)')
    expect(described('de', 'type:fire move(movetype:grass)')).toBe('Ein Pokémon, das den Typ Feuer hat UND eine Attacke erlernt, die (vom Typ Pflanze ist)')
    expect(described('ja', 'type:fire -game:scarlet')).toBe('次の条件のポケモン：タイプがほのお かつ スカーレットに登場しない')
    // An `and` or a `not` that is not read game by game says so.
    expect(described('en', 'game:sword game:scarlet type:fire')).toBe('A Pokémon that is in Sword AND is in Scarlet AND has the Fire type (each in its own games)')
    expect(described('en', 'gen:2 (type:fire | not obtain:catchable)')).toBe('A Pokémon that is in Generation II AND (has the Fire type OR is NOT catchable (in any of those games))')
    expect(described('en', 'not region:johto')).toBe('A Pokémon that is NOT found in Johto (in any game)')
    expect(described('en', 'game:scarlet not region:kanto')).toBe('A Pokémon that is in Scarlet AND is NOT found in Kanto (in any game)')
    expect(described('en', 'game:scarlet region:kanto')).toBe('A Pokémon that is in Scarlet AND is found in Kanto (each in its own games)')
    expect(described('en', 'not type:fairy')).toBe('A Pokémon that does NOT have the Fairy type')
    expect(described('en', 'catchable:scarlet -catchable:violet')).toBe('A Pokémon that is catchable in Scarlet AND is NOT catchable in Violet')
    expect(described('de', 'gen:2 not obtain:catchable')).toBe('Ein Pokémon, das in Generation II vorkommt UND nicht fangbar ist (in keinem dieser Spiele)')
    // Every wording has its counterpart in every language.
    for (const names of Object.values(translations)) expect(Object.keys(DESCRIPTIONS).filter((key) => !(`describe:${key}` in names))).toEqual([])
  })

  test('every species and type has a name in every language', () => {
    const species = new Set(dataset.bundle.forms.map((form) => form.species))
    for (const names of Object.values(translations)) {
      expect([...species].filter((slug) => !(`species:${slug}` in names))).toEqual([])
      expect(Object.keys(names).filter((key) => key.startsWith('type:'))).toHaveLength(18)
    }
  })

  test('names are read in their language', () => {
    const read = (language: Exclude<Language, 'en'>, text: string) => {
      const { expr, diagnostics } = parse(text, buildNameTable(dataset, translations[language]))
      expect(diagnostics).toEqual([])
      return print(expr!)
    }
    expect(read('ja', 'フシギダネ ほのお | ふゆう')).toBe('(species:bulbasaur & type:fire) | ability:levitate')
    expect(read('fr', 'Dracaufeu Fée lévitation')).toBe('species:charizard & type:fairy & ability:levitate')
    expect(read('de', 'Glurak Charizard type:fire')).toBe('species:charizard & species:charizard & type:fire')
    expect(read('ko', '이상해씨')).toBe('species:bulbasaur')
    expect(read('zh-Hans', '喷火龙')).toBe('species:charizard')
    expect(read('zh-Hant', '噴火龍')).toBe('species:charizard')
    expect(read('es', 'game:red Rojo')).toBe('game:red & game:red')
    expect(read('it', 'Levitazione')).toBe('ability:levitate')
    expect(read('fr', 'Lance-Flammes Bourg Palette')).toBe('move:flamethrower & place:kanto/pallet-town')
    expect(read('ja', 'かえんほうしゃ')).toBe('move:flamethrower')
    expect(read('de', 'evolves with Wasserstein')).toBe('evolves-with:water-stone')
  })

  test('canonical text is read back in every language', () => {
    for (const names of Object.values(translations)) {
      const table = buildNameTable(dataset, names)
      for (const { term } of table.entries) expect(parse(print(term), table)).toMatchObject({ expr: term, diagnostics: [] })
    }
  })
})
