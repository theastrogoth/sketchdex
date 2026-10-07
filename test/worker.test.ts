import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { beforeAll, describe, expect, test } from 'vitest'
import { buildDataset } from '../src/data/dataset.ts'
import { validateBundle, validateImages } from '../src/data/validate.ts'
import { buildNameTable } from '../src/query/names.ts'
import { suggest } from '../src/query/suggest.ts'
import { tokensToText, type Suggestion } from '../src/query/tokens.ts'
import { createHandler, type Handler } from '../src/worker/handler.ts'
import { artCandidates, assignImages } from '../scripts/images.ts'
import { readData } from '../scripts/read-data.ts'
import { committedDataset } from './data.ts'
import { tinyBundle } from './fixture.ts'

const labels = (tokens: Suggestion[]) => tokens.map((token) => (token.kind === 'op' ? token.op : `${token.group}: ${token.label}`))

describe('a small bundle', () => {
  const dataset = buildDataset(validateBundle(tinyBundle()))
  const names = buildNameTable(dataset)
  const handler = createHandler(dataset, { sprite: ['0001_00', null], localSprite: [null, '0252-none'], badge: [null, null], art: ['bulbasaur', null], shinyArt: [null, null], home: [null, null], homeShiny: [null, null] })
  const ask = <K extends 'parse' | 'query' | 'suggest'>(kind: K, text: string) => handler.answer({ id: 0, kind, text })

  test('describes the data to the page', () => {
    expect(handler.ready().forms).toEqual([
      { name: 'Bulbasaur', formName: null, dex: 1, sprite: '0001_00', localSprite: null, badge: null, art: 'bulbasaur', shinyArt: null, home: null, homeShiny: null },
      { name: 'Treecko', formName: null, dex: 252, sprite: null, localSprite: '0252-none', badge: null, art: null, shinyArt: null, home: null, homeShiny: null },
    ])
    expect(handler.ready().games[0]).toEqual({ slug: 'red-japan', name: 'Red Japan', inGroup: 'Red Japan', generation: 1, group: 0 })
    expect(handler.ready().groups).toEqual([
      { name: 'Red Japan', games: [0], base: 0 }, { name: 'Red', games: [1], base: 1 }, { name: 'Gold', games: [2], base: 2 }, { name: 'Ruby', games: [3], base: 3 },
    ])
    expect(handler.ready().abilities).toEqual(['Overgrow', 'Chlorophyll'])
    expect(handler.ready().hiddenSlot).toBe(2)
  })

  test('a query is read into tokens that write it back', () => {
    const { tokens, diagnostics } = ask('parse', 'Grass and (hidden:chlorophyll OR not gen iii), bst >= 300 mew')
    expect(labels(tokens)).toEqual(['Type: Grass', 'and', '(', 'Hidden ability: Chlorophyll', 'or', 'not', 'Generation: Generation III', ')', 'and', 'Comparison: BST ≥ 300'])
    expect(tokens[0]).toEqual({ kind: 'leaf', text: 'type:grass', label: 'Grass', group: 'Type', type: 'grass' })
    expect(diagnostics.map((d) => d.message)).toEqual(['unknown name "mew"'])
    const { text, spans } = tokensToText(tokens)
    expect(text).toBe('type:grass & ( hidden:chlorophyll | ! gen:3 ) & bst >= 300')
    expect(spans.slice(0, 3)).toEqual([[0, 10], [11, 12], [13, 14]])
    expect(labels(ask('parse', text).tokens)).toEqual(labels(tokens))
  })

  test('rows carry the values of the newest game matched in', () => {
    expect(ask('query', 'type:grass').rows).toEqual([
      { form: 0, lo: 0b1111, hi: 0, game: 3, varies: true, types: ['grass', 'poison'], abilities: [[0, 0], [1, 2]], stats: [45, 49, 49, 65, 65, 45] },
      { form: 1, lo: 0b1000, hi: 0, game: 3, varies: false, types: ['grass'], abilities: [[0, 0]], stats: [40, 45, 35, 65, 55, 70] },
    ])
    expect(ask('query', 'bulbasaur gen 2').rows).toMatchObject([{ form: 0, lo: 0b100, game: 2, abilities: null, varies: false }])
  })

  test('an empty query matches everything, and problems come with the rest', () => {
    expect(ask('query', '').rows.map((row) => row.form)).toEqual([0, 1])
    const { rows, diagnostics } = ask('query', 'treecko mew')
    expect(rows.map((row) => row.form)).toEqual([1])
    expect(diagnostics).toEqual([{ start: 8, end: 11, message: 'unknown name "mew"' }])
  })

  test('suggestions rank names by how they match', () => {
    expect(labels(suggest('gr', names))).toEqual([
      'Type: Grass', 'Type: Ground', 'Egg group: Grass', 'Move type: Grass', 'Move type: Ground', 'Growth rate: Medium Slow', 'Location: Route 101: Tall Grass (Hoenn)',
      'Ability: Overgrow', 'Weak to: Grass', 'Resists: Grass', 'Immune to: Grass', 'Neutral to: Grass', 'Weak to: Ground', 'Resists: Ground',
      'Immune to: Ground', 'Neutral to: Ground',
    ])
    expect(labels(suggest('RED', names))).toEqual(['Game: Red', 'Game: Red Japan'])
    expect(labels(suggest('egg:', names))).toEqual(['Egg group: Grass', 'Egg group: Monster', 'Egg group: Dragon'])
    expect(labels(suggest('hidden:chl', names))).toEqual(['Hidden ability: Chlorophyll'])
    expect(labels(suggest('gen:2', names))).toEqual(['Generation: Generation II'])
    expect(labels(suggest('gen 3', names))).toEqual(['Generation: Generation III', 'Introduced in: Generation III'])
    expect(labels(suggest('intro', names))).toEqual(['Compare Pokémon: Introduced in gen ≥ …', 'Introduced in: Generation I', 'Introduced in: Generation III'])
    expect(labels(suggest('speed>atk', names))).toEqual(['Comparison: Spe > Atk'])
    expect(suggest('pow', names)).toEqual([{ kind: 'hint', draft: 'power >= ', label: 'Power ≥ …', group: 'Compare moves' }])
    expect(labels(suggest('bp', names))).toEqual(['Compare moves: Power ≥ …'])
    expect(labels(suggest('bp <', names))).toEqual(['Compare moves: Power < …'])
    expect(labels(suggest('s', names)).filter((label) => label.startsWith('Compare'))).toEqual([
      'Compare Pokémon: SpA ≥ …', 'Compare Pokémon: SpD ≥ …', 'Compare Pokémon: Spe ≥ …', 'Compare Pokémon: Stage ≥ …', 'Compare encounters: Stars ≥ …',
    ])
    expect(labels(suggest('acc', names, 'encounter'))).toEqual([])
    expect(labels(suggest('le', names, 'encounter'))).toEqual(['Compare encounters: Level ≥ …'])
    expect(labels(suggest('le', names, 'move'))[0]).toBe('Compare moves: Learned at level ≥ …')
    expect(suggest('  ', names)).toEqual([])
    expect(suggest('zzz', names)).toEqual([])
  })
})

describe('the committed data', () => {
  let handler: Handler
  beforeAll(async () => {
    const dir = join(import.meta.dirname, '../public/data')
    const dataset = await committedDataset()
    handler = createHandler(dataset, validateImages(JSON.parse(await readFile(join(dir, 'images.json'), 'utf8')), dataset.bundle.forms.length))
  })

  test('suggestions put the closest names first', () => {
    const first = (text: string, count: number) => labels(handler.answer({ id: 0, kind: 'suggest', text })).slice(0, count)
    expect(first('fairy', 2)).toEqual(['Type: Fairy', 'Egg group: Fairy'])
    expect(first('levi', 1)).toEqual(['Ability: Levitate'])
    expect(first('char', 3)).toEqual(['Pokémon: Charmander', 'Pokémon: Charmeleon', 'Pokémon: Charizard'])
    expect(first('mega char', 2)).toEqual(['Form: Charizard (Mega X)', 'Form: Charizard (Mega Y)'])
    expect(first('scarlet', 1)).toEqual(['Game: Scarlet'])
    expect(first('fair', 3)).toEqual(['Type: Fairy', 'Ability: Fairy Aura', 'Form: Arceus (Fairy)'])
  })

  test('every form but the newest in-battle forms has an image', async () => {
    const { bundle } = await readData(join(import.meta.dirname, '../public/data'))
    const info = handler.ready().forms
    const without = bundle.forms.filter((_, id) => info[id]!.sprite === null && info[id]!.art === null)
    expect(without.every((form) => /^(mega|gigantamax|eternamax)/.test(form.form))).toBe(true)
    expect(without.length).toBeLessThan(60)
    const sprite = (species: string, form: string) => info[bundle.forms.findIndex((f) => f.species === species && f.form === form)]!.sprite
    expect(sprite('charizard', 'mega-y')).toBe('0006_02')
    expect(sprite('slowbro', 'galarian')).toBe('0080_02')
    expect(sprite('pikachu', 'world-cap')).toBe('0025_09')
    expect(sprite('pikachu', 'belle')).toBe('0025_00')
    expect(sprite('darmanitan', 'zen-mode')).toBe('0555_02')
    expect(sprite('greninja', 'mega')).toBeNull()
    expect(sprite('unown', 'question')).toBe('0201_27')
    expect(sprite('silvally', 'fire')).toBe('0773_00')
    expect(sprite('archaludon', 'none')).toBeNull()
  })

  test('a form is described in full, with what the query selects marked', async () => {
    const query = 'species:eevee kanto level <= 30 move(normal learn:levelup bp >= 60) firered'
    const row = handler.answer({ id: 0, kind: 'query', text: query }).rows[0]!
    const ready = handler.ready()
    const { bundle } = await committedDataset()
    const detail = handler.detail({ id: 0, kind: 'detail', text: query, form: row.form, lo: row.lo, hi: row.hi }, ready.forms.map(() => [{ games: ['FireRed'], text: 'An entry.' }]))
    const name = (id: number) => ready.forms[id]!.name
    expect(detail.classification).toBe('The Evolution Pokémon')
    expect(detail.facts).toEqual(expect.arrayContaining([
      { label: 'Height', value: '0.3 m' }, { label: 'Weight', value: '6.5 kg' }, { label: 'Gender', value: '87.5% ♂, 12.5% ♀' },
      { label: 'Egg groups', value: 'Field' }, { label: 'Catch rate', value: '45' },
    ]))
    expect(detail.facts.find((fact) => fact.label === 'EV yield')!.value).toMatch(/^1 Sp/)
    // The whole line, from its first form, with how each form is reached.
    expect(name(detail.evolution!.form)).toBe('Eevee')
    expect(detail.evolution).toMatchObject({ how: null, current: true })
    expect(detail.evolution!.into.map((stage) => [name(stage.form), stage.how]).slice(0, 4))
      .toEqual([['Vaporeon', 'Use Water Stone'], ['Jolteon', 'Use Thunder Stone'], ['Flareon', 'Use Fire Stone'], ['Espeon', 'Level up with high friendship (during the day)']])
    const lineOf = (species: string, form = 'none') => {
      const id = bundle.forms.findIndex((f) => f.species === species && f.form === form)
      const flat = (stage: NonNullable<typeof detail.evolution>): string[] => [`${name(stage.form)}${stage.current ? '*' : ''}`, ...stage.into.flatMap(flat)]
      const line = handler.detail({ id: 0, kind: 'detail', text: '', form: id, lo: 1, hi: 0 }, []).evolution
      return line && flat(line)
    }
    expect(lineOf('charmander')).toEqual(['Charmander*', 'Charmeleon', 'Charizard'])
    expect(lineOf('charizard')).toEqual(['Charmander', 'Charmeleon', 'Charizard*'])
    expect(lineOf('charizard', 'mega-x')).toEqual(['Charmander', 'Charmeleon', 'Charizard*'])
    expect(lineOf('silcoon')).toEqual(['Wurmple', 'Silcoon*', 'Beautifly', 'Cascoon', 'Dustox'])
    expect(lineOf('tauros')).toBeNull()

    // Every group of games Eevee is in, in order of release.
    const groupNames = detail.groups.map((group) => ready.groups[group.group]!.name)
    expect(groupNames.slice(0, 3)).toEqual(['Red & Blue', 'Yellow', 'Gold & Silver'])
    expect(groupNames).toEqual(expect.arrayContaining(['FireRed & LeafGreen', 'Scarlet & Violet', 'The Crown Tundra']))
    const fireRed = detail.groups[groupNames.indexOf('FireRed & LeafGreen')]!
    expect(fireRed.encounters).toContainEqual(
      { place: 'Celadon City', region: 'Kanto', method: 'Gift', levels: '25', rate: null, conditions: [], games: ready.groups[fireRed.group]!.games, matches: false, slots: [] })
    // Its learnset there, by level first, with the moves the query asks for marked.
    expect(fireRed.moves.slice(0, 3).map((move) => [move.name, move.how[0]])).toEqual([['Helping Hand', 'Lv. 1'], ['Tackle', 'Lv. 1'], ['Tail Whip', 'Lv. 1']])
    expect(fireRed.moves.filter((move) => move.matches).map((move) => move.name)).toEqual(['Take Down'])
    expect(fireRed.moves.find((move) => move.name === 'Shadow Ball')).toMatchObject({ type: 'ghost', category: 'physical', power: 80, accuracy: 100, how: ['TM'] })
    // The query does not select moves in games it does not match in.
    expect(detail.groups[0]!.moves.some((move) => move.matches)).toBe(false)

    const surfed = 'species:tentacool surfing level >= 40 red'
    const tentacool = handler.answer({ id: 0, kind: 'query', text: surfed }).rows[0]!
    const redBlue = handler.detail({ id: 0, kind: 'detail', text: surfed, form: tentacool.form, lo: tentacool.lo, hi: tentacool.hi }, []).groups[0]!
    expect(redBlue.encounters.some((encounter) => encounter.matches)).toBe(true)
    expect(redBlue.encounters.filter((encounter) => encounter.matches).every((encounter) => encounter.method === 'Surf')).toBe(true)
    expect(redBlue.encounters.some((encounter) => !encounter.matches)).toBe(true)
    // The slots of one table are one encounter: their levels together and their rates summed.
    const table = redBlue.encounters.find((encounter) => encounter.slots.length > 1)!
    const bounds = (levels: string) => levels.split('–').map(Number)
    expect(bounds(table.levels)[0]).toBe(Math.min(...table.slots.map((slot) => bounds(slot.levels)[0]!)))
    expect(bounds(table.levels).at(-1)).toBe(Math.max(...table.slots.map((slot) => bounds(slot.levels).at(-1)!)))
    expect(parseFloat(table.rate!)).toBeCloseTo(table.slots.reduce((sum, slot) => sum + parseFloat(slot.rate!), 0))
    expect(table.matches).toBe(table.slots.some((slot) => slot.matches))

    expect(detail.dexEntries).toEqual([{ games: ['FireRed'], text: 'An entry.' }])
    expect(() => handler.detail({ id: 0, kind: 'detail', text: '' }, [])).toThrow('no form undefined')
  })

  test('a row shows the newest game matched in that has abilities', () => {
    const { rows } = handler.answer({ id: 0, kind: 'query', text: 'species:charmeleon' })
    const games = handler.ready().games
    expect(rows).toHaveLength(1)
    expect(games[63 - Math.clz32(rows[0]!.hi)]!.slug).toBe('mega-dimension')
    expect(games[rows[0]!.game]!.slug).toBe('the-indigo-disk-violet')
    expect(rows[0]!.abilities).not.toBeNull()
    const old = handler.answer({ id: 0, kind: 'query', text: 'species:charmeleon gen 2' }).rows[0]!
    expect([games[old.game]!.slug, old.abilities]).toEqual(['crystal', null])
  })
})

test('artwork names follow the files, not the slugs', () => {
  // After the name a file downloaded for this app has, which is the slugs themselves.
  const own = (species: string, form = 'none') => artCandidates({ species, form }).own
  expect(own('bulbasaur')).toEqual(['bulbasaur', 'bulbasaur', 'bulbasaur', 'bulbasaur', 'bulbasaur'])
  expect(own('rattata', 'alolan').slice(0, 2)).toEqual(['rattata-alolan', 'rattata-alola'])
  expect(own('charizard', 'gigantamax')[1]).toBe('charizard-gmax')
  expect(own('tauros', 'paldean-aqua-breed')[1]).toBe('tauros-paldea-aqua')
  expect(own('darmanitan', 'galarian-zen-mode')[1]).toBe('darmanitan-galar-zen')
  expect(own('urshifu', 'gigantamax-rapid-strike-style')[1]).toBe('urshifu-rapid-strike-gmax')
  expect(own('zygarde', 'fifty-percent')[1]).toBe('zygarde-50')
  expect(own('great-tusk')).toContain('great_tusk')
  expect(own('farfetch-d')).toContain("farfetch'd")
  expect(own('farfetch-d', 'galarian')[1]).toBe('farfetchd-galar')
  // A form that looks like its species may be shown by the species' images, which are its first form's.
  expect(artCandidates({ species: 'scatterbug', form: 'polar' }, 'icy-snow')).toMatchObject({ species: expect.arrayContaining(['scatterbug-icy-snow']), sameLook: true })
  expect(artCandidates({ species: 'unown', form: 'c' }, 'a').sameLook).toBe(false)

  const forms = [
    { species: 'unown', form: 'a', nationalId: 201 }, { species: 'unown', form: 'b', nationalId: 201 },
    { species: 'clefable', form: 'none', nationalId: 36 }, { species: 'clefable', form: 'mega', nationalId: 36 },
    { species: 'mr-mime', form: 'none', nationalId: 122 }, { species: 'mr-mime', form: 'galarian', nationalId: 122 },
    { species: 'eevee', form: 'none', nationalId: 133 }, { species: 'eevee', form: 'partner', nationalId: 133 },
    { species: 'eevee', form: 'gigantamax', nationalId: 133 }, { species: 'mr-mime', form: 'gigantamax-galarian', nationalId: 122 },
    { species: 'skarmory', form: 'none', nationalId: 227 }, { species: 'skarmory', form: 'mega', nationalId: 227 },
  ]
  const images = assignImages(forms, {
    sprites: new Set(['0201_00', '0201_01', '0036_00', '0122_00', '0122_01', '0133_00', '0227_00']),
    localSprites: new Set(['0227-mega']),
    art: new Set(['unown-a', 'clefable', 'mr_mime-galar', 'clefable-mega', 'eevee']),
    shinyArt: new Set(['unown-a', 'eevee', 'mr-mime']),
    home: new Set(['unown-a', 'unown-b', 'eevee', 'eevee-gigantamax']),
    homeShiny: new Set(['unown-b']),
  })
  expect(images).toEqual({
    // Mega Clefable and the Gigantamax forms are shown by another form's sprite; Mega Skarmory has a sprite here.
    sprite: ['0201_00', '0201_01', '0036_00', '0036_00', '0122_00', '0122_01', '0133_00', '0133_00', '0133_00', '0122_01', '0227_00', null],
    localSprite: [null, null, null, null, null, null, null, null, null, null, null, '0227-mega'],
    badge: [null, null, null, 'mega', null, null, null, null, 'dynamax', 'dynamax', null, null],
    // Unown B is not shown by Unown A's images; the partner Eevee, which looks like any Eevee, is shown by Eevee's.
    art: ['unown-a', null, 'clefable', 'clefable-mega', null, 'mr_mime-galar', 'eevee', 'eevee', null, null, null, null],
    shinyArt: ['unown-a', null, null, null, 'mr-mime', null, 'eevee', 'eevee', null, null, null, null],
    home: ['unown-a', 'unown-b', null, null, null, null, 'eevee', 'eevee', 'eevee-gigantamax', null, null, null],
    homeShiny: [null, 'unown-b', null, null, null, null, null, null, null, null, null, null],
  })
})

test('the moves learned in a DLC are with those of the games it extends', async () => {
  const dataset = await committedDataset()
  const handler = createHandler(dataset, { sprite: [], localSprite: [], badge: [], art: [], shinyArt: [], home: [], homeShiny: [] })
  const { groups } = handler.ready()
  const named = (name: string) => groups.findIndex((group) => group.name === name)
  expect(groups.filter((group, id) => group.base !== id).map((group) => [group.name, groups[group.base]!.name])).toEqual([
    ['The Isle Of Armor', 'Sword & Shield'], ['The Crown Tundra', 'Sword & Shield'], ['The Teal Mask', 'Scarlet & Violet'],
    ['The Indigo Disk', 'Scarlet & Violet'], ['Mega Dimension', 'Legends: Z-A'],
  ])
  const detailOf = (species: string) =>
    handler.detail({ id: 0, kind: 'detail', text: '', form: dataset.bundle.forms.findIndex((form) => form.species === species && form.form === 'none'), lo: 1, hi: 0 }, []).groups
  const eevee = detailOf('eevee')
  expect(eevee.find(({ group }) => group === named('The Crown Tundra'))!.moves).toEqual([])
  expect(eevee.find(({ group }) => group === named('Sword & Shield'))!.moves.length).toBeGreaterThan(20)
})

test('a game of a DLC is named within its group by the game it extends', async () => {
  const dataset = await committedDataset()
  const games = createHandler(dataset, { sprite: [], localSprite: [], badge: [], art: [], shinyArt: [], home: [], homeShiny: [] }).ready().games
  expect(games.find((game) => game.slug === 'the-crown-tundra-shield')).toMatchObject({ name: 'The Crown Tundra Shield', inGroup: 'Shield' })
  // Encounters that are there for certain have no rate, however many there are at a place.
  const gyarados = dataset.bundle.forms.findIndex((form) => form.species === 'gyarados' && form.form === 'none')
  const scarlet = dataset.bundle.meta.games.findIndex((game) => game.slug === 'scarlet')
  const paldea = createHandler(dataset, { sprite: [], localSprite: [], badge: [], art: [], shinyArt: [], home: [], homeShiny: [] })
    .detail({ id: 0, kind: 'detail', text: '', form: gyarados, lo: 0, hi: 1 << (scarlet - 32) }, []).groups.flatMap((group) => group.encounters)
  const fixed = paldea.filter((encounter) => encounter.place === 'Casseroya Lake' && encounter.method === 'Static')
  expect(fixed.length).toBeGreaterThan(0)
  expect(fixed.flatMap((encounter) => [encounter.rate, ...encounter.slots.map((slot) => slot.rate)])).toEqual(fixed.flatMap((encounter) => [null, ...encounter.slots.map(() => null)]))
  // A species of one gender is given that one alone.
  const handler = createHandler(dataset, { sprite: [], localSprite: [], badge: [], art: [], shinyArt: [], home: [], homeShiny: [] })
  const gender = (species: string) => handler.detail({ id: 0, kind: 'detail', text: '', form: dataset.bundle.forms.findIndex((form) => form.species === species), lo: 1, hi: 0 }, [])
    .facts.find((fact) => fact.label === 'Gender')!.value
  expect([gender('chansey'), gender('tauros'), gender('magnemite')]).toEqual(['100% ♀', '100% ♂', 'Genderless'])
  expect(games.find((game) => game.slug === 'shield')).toMatchObject({ name: 'Shield', inGroup: 'Shield' })
})

test('the rates of an encounter never add up to more than all', { timeout: 120_000 }, async () => {
  const dataset = await committedDataset()
  // Tables and conditions are kept apart, and overworld spawns are not added.
  const handlerAll = createHandler(dataset, { sprite: [], localSprite: [], badge: [], art: [], shinyArt: [], home: [], homeShiny: [] })
  const over = dataset.bundle.forms.flatMap((form, id) => handlerAll.detail({ id: 0, kind: 'detail', text: '', form: id, lo: 1, hi: 0 }, []).groups
    .flatMap((group) => group.encounters.filter((encounter) => encounter.rate !== null && Math.max(...encounter.rate.split('–').map(parseFloat)) > 100.5)
      .map((encounter) => `${form.species} ${encounter.place} ${encounter.method} ${encounter.rate} ${encounter.conditions.join(',')}`)))
  expect(over).toEqual([])
})

test('encounters that differ only in the time of day are shown as one', async () => {
  const dataset = await committedDataset()
  const handler = createHandler(dataset, { sprite: [], localSprite: [], badge: [], art: [], shinyArt: [], home: [], homeShiny: [] })
  const poliwag = dataset.bundle.forms.findIndex((form) => form.species === 'poliwag')
  const detail = handler.detail({ id: 0, kind: 'detail', text: '', form: poliwag, lo: 1, hi: 0 }, [])
  const hgss = detail.groups.find((group) => handler.ready().groups[group.group]!.name === 'HeartGold & SoulSilver')!.encounters
  // No two rows are the same but for their times, and a row at every time the games have names none.
  const times = ['Morning', 'Day', 'Night']
  const timeless = hgss.map((row) => JSON.stringify({ ...row, conditions: row.conditions.filter((condition) => !times.includes(condition)), matches: undefined }))
  expect(new Set(timeless).size).toBe(timeless.length)
  expect(hgss.some((row) => times.every((time) => row.conditions.includes(time)))).toBe(false)
  // What differs by time keeps its times, in the order of the day.
  const pikachu = dataset.bundle.forms.findIndex((form) => form.species === 'pikachu' && form.form === 'none')
  const forest = handler.detail({ id: 0, kind: 'detail', text: '', form: pikachu, lo: 1, hi: 0 }, []).groups
    .find((group) => handler.ready().groups[group.group]!.name === 'HeartGold & SoulSilver')!.encounters.filter((row) => row.place === 'Viridian Forest')
  expect(forest.map((row) => row.conditions).filter((conditions) => conditions.every((condition) => times.includes(condition)))).toEqual([['Morning', 'Day'], ['Night']])
})

test('encounters that differ only in season, or only in weather, are shown as one', { timeout: 60_000 }, async () => {
  const dataset = await committedDataset()
  const handler = createHandler(dataset, { sprite: [], localSprite: [], badge: [], art: [], shinyArt: [], home: [], homeShiny: [] })
  const encountersOf = (species: string) => handler.detail({ id: 0, kind: 'detail', text: '', form: dataset.bundle.forms.findIndex((form) => form.species === species), lo: 1, hi: 0 }, [])
    .groups.map((group) => ({ name: handler.ready().groups[group.group]!.name, rows: group.encounters }))
  // Whatever the conditions of a kind are called, rows that are the same but for them are one row.
  const kinds = [['Spring', 'Summer', 'Autumn', 'Winter'], ['Normal Weather', 'Cloudy', 'Rain', 'Thunderstorm', 'Intense Sun', 'Snow', 'Snowstorm', 'Sandstorm', 'Fog', 'Sunny', 'Drought', 'Rainstorm']]
  for (const species of ['deerling', 'patrat', 'rookidee', 'wooloo', 'vanillite', 'starly', 'tentacool']) {
    for (const { rows } of encountersOf(species)) {
      for (const kind of kinds) {
        const without = rows.map((row) => JSON.stringify({ ...row, conditions: row.conditions.filter((condition) => !kind.includes(condition)), matches: undefined }))
        expect(new Set(without).size, species).toBe(without.length)
      }
    }
  }
  // Patrat is on Route 1 of Unova in every season alike: no season is named.
  const route1 = encountersOf('patrat').find((group) => group.name === 'Black & White')!.rows.filter((row) => row.place === 'Route 1')
  expect(route1.length).toBeGreaterThan(0)
  expect(route1.flatMap((row) => row.conditions).filter((condition) => kinds[0]!.includes(condition))).toEqual([])
})
