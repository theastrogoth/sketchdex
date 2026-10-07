import { beforeAll, describe, expect, test } from 'vitest'
import { buildDataset, existsIn, valueIn, type Dataset } from '../src/data/dataset.ts'
import { gamesOf } from '../src/data/gamemask.ts'
import { validateBundle } from '../src/data/validate.ts'
import { committedDataset } from './data.ts'
import { tinyBundle } from './fixture.ts'

describe('a small bundle', () => {
  const dataset = buildDataset(validateBundle(tinyBundle()))
  const [redJapan, red, gold, ruby] = [0, 1, 2, 3]

  test('game sets become masks', () => {
    expect(dataset.bundle.meta.gameSets.map((_, set) => gamesOf(dataset.gameSetMasks, 2 * set))).toEqual(dataset.bundle.meta.gameSets)
  })

  test('a form is present where it is obtainable or has a learnset', () => {
    expect(gamesOf(dataset.exists, 0)).toEqual([redJapan, red, gold, ruby])
    expect(gamesOf(dataset.exists, 2)).toEqual([ruby])
    expect(existsIn(dataset, 1, gold)).toBe(false)
  })

  test('a versioned field resolves per game', () => {
    expect(valueIn(dataset, 'abilities', 0, gold)).toBeNull()
    expect(valueIn(dataset, 'abilities', 0, ruby)).toEqual([[0, 0], [1, 2]])
    expect(valueIn(dataset, 'types', 1, ruby)).toEqual(['grass'])
    expect(valueIn(dataset, 'types', 1, red)).toBeUndefined()
  })

  test('rejects history in games the form is not present in', () => {
    const bundle = tinyBundle()
    bundle.forms[1]!.history.catchRate = [[2, 50]]
    expect(() => buildDataset(bundle)).toThrow('forms.json[1].history.catchRate: game set 2 includes games outside those of the item')
  })
})

describe('the committed data', () => {
  let dataset: Dataset
  beforeAll(async () => {
    dataset = await committedDataset()
  })

  function game(slug: string): number {
    const id = dataset.bundle.meta.games.findIndex((g) => g.slug === slug)
    if (id < 0) throw new Error(`no game ${slug}`)
    return id
  }
  function form(species: string, name = 'none'): number {
    const id = dataset.bundle.forms.findIndex((f) => f.species === species && f.form === name)
    if (id < 0) throw new Error(`no form ${species}/${name}`)
    return id
  }
  const abilities = (formId: number, gameSlug: string) =>
    valueIn(dataset, 'abilities', formId, game(gameSlug))?.map(([ability, slot]) => [dataset.bundle.meta.abilities[ability]!.slug, slot])

  test('leaves out the Japanese Generation I games and the placeholder move', () => {
    const { games } = dataset.bundle.meta
    expect(games).toHaveLength(50)
    expect(games.map((g) => g.slug)).not.toContain('green')
    expect(dataset.bundle.moves.map((m) => m.slug)).not.toContain('default')
    expect(dataset.bundle.moves[0]!.slug).toBe('pound')
  })

  test('the versions of a field partition the games a form is present in', () => {
    for (const versions of Object.values(dataset.versions)) {
      versions.forEach((formVersions, id) => {
        let lo = 0
        let hi = 0
        for (const version of formVersions) {
          expect(version.lo & lo).toBe(0)
          expect(version.hi & hi).toBe(0)
          lo |= version.lo
          hi |= version.hi
        }
        expect([lo >>> 0, hi >>> 0]).toEqual([dataset.exists[2 * id], dataset.exists[2 * id + 1]])
      })
    }
  })

  test('types follow the games', () => {
    expect(valueIn(dataset, 'types', form('clefairy'), game('black'))).toEqual(['normal'])
    expect(valueIn(dataset, 'types', form('clefairy'), game('x'))).toEqual(['fairy'])
    expect(valueIn(dataset, 'types', form('magnemite'), game('red'))).toEqual(['electric'])
    expect(valueIn(dataset, 'types', form('magnemite'), game('gold'))).toEqual(['electric', 'steel'])
  })

  test('abilities follow the games', () => {
    const clefairy = form('clefairy')
    expect(valueIn(dataset, 'abilities', clefairy, game('crystal'))).toBeNull()
    expect(abilities(clefairy, 'emerald')).toEqual([['cute-charm', 0]])
    expect(abilities(clefairy, 'platinum')).toEqual([['cute-charm', 0], ['magic-guard', 1]])
    expect(abilities(clefairy, 'violet')).toEqual([['cute-charm', 0], ['magic-guard', 1], ['friend-guard', 2]])
  })

  test('Generation I base stats repeat the Special stat', () => {
    expect(valueIn(dataset, 'baseStats', form('clefairy'), game('yellow'))).toEqual([70, 45, 48, 60, 60, 35])
    expect(valueIn(dataset, 'baseStats', form('clefairy'), game('gold'))).toEqual([70, 45, 48, 60, 65, 35])
  })

  test('types follow the games in Colosseum and XD too', () => {
    expect(valueIn(dataset, 'types', form('clefairy'), game('colosseum'))).toEqual(['normal'])
    expect(valueIn(dataset, 'types', form('mr-mime'), game('xd'))).toEqual(['psychic'])
  })

  test('moves have values per game', () => {
    const { moves, meta } = dataset.bundle
    const move = (slug: string) => moves.findIndex((m) => m.slug === slug)
    const value = (field: 'type' | 'category' | 'power' | 'accuracy' | 'pp', slug: string, gameSlug: string) => {
      const bit = 1 << (game(gameSlug) & 31)
      return dataset.moveVersions[field][move(slug)]!.find((v) => ((game(gameSlug) < 32 ? v.lo : v.hi) & bit) !== 0)?.value
    }
    expect([value('type', 'bite', 'red'), value('type', 'bite', 'gold')]).toEqual(['normal', 'dark'])
    expect([value('category', 'bite', 'emerald'), value('category', 'bite', 'platinum')]).toEqual(['special', 'physical'])
    expect([value('power', 'tackle', 'platinum'), value('power', 'tackle', 'x'), value('power', 'tackle', 'sun')]).toEqual([35, 50, 40])
    expect([value('pp', 'recover', 'gold'), value('pp', 'recover', 'x'), value('pp', 'recover', 'scarlet'), value('pp', 'recover', 'champions')]).toEqual([20, 10, 5, 8])
    expect(value('type', 'moonblast', 'black')).toBeUndefined()
    expect(moves.every((m, id) => dataset.moveVersions.type[id]!.length > 0 || meta.gameSets[m.games]!.length === 0)).toBe(true)
  })

  test('places form a tree by region', () => {
    const { places } = dataset.bundle
    const place = (region: string, slug: string) => places.findIndex((p) => p.region === region && p.slug === slug)
    const south = place('paldea', 'south-province')
    expect(dataset.placeParts[south]!.map((id) => places[id]!.name)).toEqual(expect.arrayContaining(['South Province', 'Area One', 'Area Six']))
    expect(places[place('paldea', 'south-province-area-one')]!.parent).toBe(south)
    expect(new Set(places.map((p) => p.region))).toEqual(new Set(['kanto', 'sevii', 'johto', 'hoenn', 'sinnoh', 'unova', 'kalos', 'alola', 'galar', 'hisui', 'paldea', 'kitakami', 'terarium', 'lumiose']))
    expect(place('kitakami', 'oni-mountain')).toBeGreaterThan(-1)
    expect(place('terarium', 'savanna-biome')).toBeGreaterThan(-1)
  })

  test('a form is absent from games it is not in', () => {
    const mega = form('venusaur', 'mega')
    expect(existsIn(dataset, mega, game('x'))).toBe(true)
    expect(existsIn(dataset, mega, game('scarlet'))).toBe(false)
    expect(valueIn(dataset, 'types', mega, game('scarlet'))).toBeUndefined()
    expect(existsIn(dataset, form('treecko'), game('crystal'))).toBe(false)
  })
})
