import type { Dataset } from '../data/dataset.ts'
import { COMPARE, QueryError } from './common.ts'
import type { Domain } from './domain.ts'
import type { Comparator, EncounterAttribute, Expr } from './expr.ts'
import { addGames, difference, emptyPairs, intersection, union, type PairSet } from './pairset.ts'

/** Methods that stand for several of the data's, by slug. */
export const METHOD_GROUPS: Record<string, string[]> = {
  surfing: ['surf', 'safari-surf', 'rippling-water-surf', 'sharpedo-surf'],
  fishing: ['fishing', 'old-rod', 'good-rod', 'super-rod', 'safari-old-rod', 'safari-good-rod', 'safari-super-rod', 'rippling-water-fishing', 'feebas-tile-fishing'],
  walking: ['walk', 'safari-walk', 'dark-grass', 'shaking-spot', 'swarm-grass', 'random-encounter'],
  raid: ['max-raid-den', 'tera-raid', 'dynamax-adventure'],
}
/**
 * Weathers of the data that are filtered on under another's slug: Sword and Shield's
 * names for the weathers that Legends: Arceus has too, and two weathers that the data
 * has for single encounters.
 */
export const WEATHER_MERGES: Record<string, string> = {
  'raining': 'rain', 'overcast': 'cloudy', 'snowing': 'snow', 'heavy-fog': 'fog',
  'snowstorm-abomasnow-on-the-hammerlocke-hills': 'snowstorm', 'sandstorm-diggersby-in-the-rolling-fields': 'sandstorm',
}
/** The slug that a weather of the data is filtered on and shown under (`WEATHER_MERGES`). */
export const weatherSlug = (slug: string) => WEATHER_MERGES[slug] ?? slug

/** The weather slug of encounters that happen in every weather of a place that has weather. */
const ALL_WEATHER = 'all-weather'
/** The method given to overworld spawns, which the data lists apart from encounter tables. */
export const SPAWN_METHOD = 'overworld'

const FLAG = { 'alpha': 1, 'shiny-locked': 2, 'hidden-ability': 4, 'gigantamax': 8 } as const
// In a mask of times or weathers, every bit: not tied to any.
const ANY = 0xffffffff

const usesAttribute = (expr: Expr) => expr.kind === 'compare' && [expr.left, expr.right].some((o) => o.kind === 'encounterAttribute')

/** The method, time, season, weather, and held item slugs of the encounters in `dataset`, for naming them. */
export function encounterVocabulary(dataset: Dataset): { methods: string[]; times: string[]; seasons: string[]; weathers: string[]; held: string[] } {
  const { strings, encounters, spawners, raids } = dataset.bundle.encounters
  const distinct = (ids: Iterable<number | null>) => [...new Set([...ids].flatMap((id) => (id === null ? [] : [strings[id]!])))]
  return {
    methods: [...new Set([...distinct(encounters.method), SPAWN_METHOD, ...distinct(raids.kind), ...Object.keys(METHOD_GROUPS)])],
    times: distinct([...encounters.time, ...spawners.times.flat()]),
    seasons: distinct(encounters.seasons.flatMap((seasons) => seasons ?? [])),
    held: distinct(encounters.heldItem),
    weathers: [...new Set(distinct([...encounters.weather, ...spawners.weathers.flatMap((weathers) => weathers ?? [])]).map(weatherSlug))],
  }
}

/** One way of encountering a form, as the data has it. */
export interface Encounter {
  /** A place id. */
  place: number
  method: string
  minLevel: number
  maxLevel: number
  /** In percent, if known. */
  rate: number | null
  /** The times of day, the seasons, and the weathers it is tied to; `null` if to none. */
  times: string[] | null
  seasons: string[] | null
  weathers: string[] | null
  traits: (keyof typeof FLAG)[]
  /** The item the Pokémon holds, a slug, if it holds one. */
  held: string | null
  /** What else it depends on, as slugs: a radio station, a swarm, ... */
  conditions: string[]
  /** Which of a place's encounter tables it is in, a slug, where the place has several for one method. */
  table: string | null
  /** For a raid, its star ratings. */
  stars: number[] | null
  /** The mask of the games it is in. */
  lo: number
  hi: number
}

export interface EncounterDomain extends Domain {
  /** The encounters of `form` that satisfy all of `parts`, in games of `games` (one form's mask of a `PairSet`). */
  encountersOf(parts: Expr[], form: number, games: PairSet): Encounter[]
}

/**
 * Conditions on encounters. The rows of the data's three tables (encounter slots,
 * overworld spawns, raids) are numbered through.
 */
export function createEncounterDomain(dataset: Dataset): EncounterDomain {
  const { places, forms, encounters: { strings, encounters, spawners, raids } } = dataset.bundle
  const { gameSetMasks, placeParts } = dataset
  const vocabulary = encounterVocabulary(dataset)
  const count = encounters.place.length + spawners.place.length + raids.place.length

  const place = Int32Array.from([...encounters.place, ...spawners.place, ...raids.place])
  const form = Int32Array.from([...encounters.form, ...spawners.form, ...raids.form])
  const games = Int32Array.from([...encounters.games, ...spawners.games, ...raids.games])
  const minLevel = Int32Array.from([...encounters.minLevel, ...spawners.minLevel, ...raids.minLevel])
  const maxLevel = Int32Array.from([...encounters.maxLevel, ...spawners.maxLevel, ...raids.maxLevel])
  // Rates in percent; NaN where there is none, or it is not a percentage.
  const percent = strings.indexOf('percent')
  const rate = Float64Array.from([
    ...encounters.rate.map((r, i) => (r !== null && encounters.rateKind[i] === percent ? r : NaN)),
    ...spawners.rate.map((r, i) => (r !== null && spawners.rateKind[i] === percent ? r : NaN)),
    ...raids.place.map(() => NaN),
  ])
  const methodIds = new Map(vocabulary.methods.map((slug, id) => [slug, id]))
  const method = Int32Array.from([
    ...encounters.method.map((id) => methodIds.get(strings[id]!)!),
    ...spawners.place.map(() => methodIds.get(SPAWN_METHOD)!),
    ...raids.kind.map((id) => methodIds.get(strings[id]!)!),
  ])
  // Bit masks over `vocabulary.times`, `vocabulary.seasons`, and `vocabulary.weathers`.
  const mask = (slugs: string[], ids: (number | null)[] | null) =>
    (ids === null || ids.every((id) => id === null) ? ANY : ids.reduce<number>((bits, id) => bits | (1 << slugs.indexOf(weatherSlug(strings[id!]!))), 0))
  const times = Uint32Array.from([
    ...encounters.time.map((id) => mask(vocabulary.times, [id])),
    ...spawners.times.map((ids) => mask(vocabulary.times, ids)),
    ...raids.place.map(() => ANY),
  ])
  const seasons = Uint32Array.from([
    ...encounters.seasons.map((ids) => mask(vocabulary.seasons, ids)),
    ...spawners.place.map(() => ANY),
    ...raids.place.map(() => ANY),
  ])
  const weathers = Uint32Array.from([
    ...encounters.weather.map((id) => mask(vocabulary.weathers, [id])),
    ...spawners.weathers.map((ids) => mask(vocabulary.weathers, ids)),
    ...raids.place.map(() => ANY),
  ])
  const flags = Uint8Array.from([
    ...encounters.place.map((_, i) => (encounters.alpha[i] ? FLAG.alpha : 0) | (encounters.shinyLocked[i] ? FLAG['shiny-locked'] : 0) | (encounters.hiddenAbility[i] ? FLAG['hidden-ability'] : 0)),
    ...spawners.alpha.map((alpha) => (alpha ? FLAG.alpha : 0)),
    ...raids.gigantamax.map((gigantamax) => (gigantamax ? FLAG.gigantamax : 0)),
  ])
  // Positions in `strings` of the items held; -1 where none is.
  const held = Int32Array.from([...encounters.heldItem.map((id) => id ?? -1), ...spawners.place.map(() => -1), ...raids.place.map(() => -1)])
  // Raid rows only: the star ratings, as bits.
  const raidsFrom = count - raids.place.length
  const stars = raids.stars.map((ratings) => ratings.reduce((bits, star) => bits | (1 << star), 0))

  const placeIds = new Map(places.map((p, id) => [p.parent === null ? `${p.region}/${p.slug}` : `${p.region}/${places[p.parent]!.slug}/${p.slug}`, id]))
  const regions = new Set(places.map((p) => p.region))

  // A set of encounters holds, per row, the mask of the games in which the row is in
  // the set, laid out as a `PairSet` is for forms: a row can match in only some of its games.
  const rowGames = new Uint32Array(2 * count)
  for (let row = 0; row < count; row++) rowGames.set(gameSetMasks.subarray(2 * games[row]!, 2 * games[row]! + 2), 2 * row)

  function rowsWhere(test: (row: number) => boolean): PairSet {
    const set = new Uint32Array(2 * count)
    for (let row = 0; row < count; row++) {
      if (test(row)) addGames(set, row, rowGames[2 * row]!, rowGames[2 * row + 1]!)
    }
    return set
  }

  // The games that have times of day, or seasons: those with an encounter tied to
  // one. Elsewhere an encounter tied to no time is not one that happens at night.
  function gamesWith(conditions: Uint32Array): [lo: number, hi: number] {
    const mask: [number, number] = [0, 0]
    for (let row = 0; row < count; row++) {
      if (conditions[row] === ANY) continue
      mask[0] |= rowGames[2 * row]!
      mask[1] |= rowGames[2 * row + 1]!
    }
    return mask
  }
  const timed = gamesWith(times)
  const seasoned = gamesWith(seasons)

  // Per row, the games in which the row's form is found at the row's place under the
  // row's condition (its time, or its weather, as a mask in `conditions`) alone,
  // whatever the method. An encounter tied to no condition is one under every
  // condition, in the games where `applies` says there are any.
  function sole(conditions: Uint32Array, applies: (game: number) => boolean): PairSet {
    const gameCount = dataset.bundle.meta.games.length
    // Per place and form, the conditions of its encounters in each game, as a mask.
    const found = new Map<number, Uint32Array>()
    const key = (row: number) => place[row]! * forms.length + form[row]!
    const inGame = (row: number, game: number) => ((rowGames[2 * row + (game >>> 5)]! >>> (game & 31)) & 1) === 1
    for (let row = 0; row < count; row++) {
      let byGame = found.get(key(row))
      if (!byGame) found.set(key(row), byGame = new Uint32Array(gameCount))
      for (let game = 0; game < gameCount; game++) {
        if (inGame(row, game) && applies(game)) byGame[game] = byGame[game]! | conditions[row]!
      }
    }
    const set = new Uint32Array(2 * count)
    for (let row = 0; row < count; row++) {
      const byGame = found.get(key(row))!
      for (let game = 0; game < gameCount; game++) {
        if (inGame(row, game) && byGame[game] === conditions[row] && conditions[row] !== ANY) set[2 * row + (game >>> 5)] = set[2 * row + (game >>> 5)]! | (1 << (game & 31))
      }
    }
    return set
  }
  const soles = new Map<Uint32Array, PairSet>()
  function soleOf(conditions: Uint32Array, among?: [lo: number, hi: number]): PairSet {
    let set = soles.get(conditions)
    if (!set) soles.set(conditions, set = sole(conditions, (game) => among === undefined || ((among[game >>> 5]! >>> (game & 31)) & 1) === 1))
    return set
  }

  // The encounters at a time of day, or in a season, named by `slug`: those tied to
  // it and, in the games that have such conditions, those tied to none, which
  // happen under all of them. With `only`, see `sole`.
  function under(what: string, slug: string, slugs: string[], conditions: Uint32Array, among: [lo: number, hi: number], only: boolean | undefined): PairSet {
    if (!slugs.includes(slug)) throw new QueryError(`unknown ${what} "${slug}"`)
    const bit = 1 << slugs.indexOf(slug)
    if (only) return intersection(soleOf(conditions, among), rowsWhere((row) => conditions[row] === bit))
    const set = new Uint32Array(2 * count)
    for (let row = 0; row < count; row++) {
      if (conditions[row] === ANY) addGames(set, row, rowGames[2 * row]! & among[0], rowGames[2 * row + 1]! & among[1])
      else if ((conditions[row]! & bit) !== 0) addGames(set, row, rowGames[2 * row]!, rowGames[2 * row + 1]!)
    }
    return set
  }

  // Whether some value of the attribute, for row `row`, stands in `comparator` to `n`.
  function holds(attribute: EncounterAttribute, comparator: Comparator, n: number, row: number): boolean {
    if (attribute === 'rate') return COMPARE[comparator](rate[row]!, n)
    if (attribute === 'stars') {
      if (row < raidsFrom) return false
      for (let star = 1; star < 32; star++) {
        if ((stars[row - raidsFrom]! & (1 << star)) !== 0 && COMPARE[comparator](star, n)) return true
      }
      return false
    }
    // A level range has such a level if one of its ends does or, for equality, if it spans the number.
    const [min, max] = [minLevel[row]!, maxLevel[row]!]
    return comparator === '=' ? min <= n && n <= max : COMPARE[comparator](min, n) || COMPARE[comparator](max, n)
  }
  const FLIPPED: Record<Comparator, Comparator> = { '<': '>', '<=': '>=', '=': '=', '!=': '!=', '>=': '<=', '>': '<' }

  function evaluate(expr: Expr): PairSet {
    switch (expr.kind) {
      case 'and': return expr.args.map(evaluate).reduce(intersection, rowGames)
      case 'or': return expr.args.map(evaluate).reduce(union, new Uint32Array(2 * count))
      case 'not': return difference(rowGames, evaluate(expr.arg))
      case 'place': {
        const id = placeIds.get(expr.place)
        if (id === undefined) throw new QueryError(`unknown place "${expr.place}"`)
        const parts = new Set(placeParts[id])
        return rowsWhere((row) => parts.has(place[row]!))
      }
      case 'region':
        if (!regions.has(expr.region)) throw new QueryError(`unknown region "${expr.region}"`)
        return rowsWhere((row) => places[place[row]!]!.region === expr.region)
      case 'method': {
        const ids = new Set((METHOD_GROUPS[expr.method] ?? [expr.method]).map((slug) => methodIds.get(slug)))
        if (ids.has(undefined)) throw new QueryError(`unknown encounter method "${expr.method}"`)
        return rowsWhere((row) => ids.has(method[row]!))
      }
      case 'time': return under('time', expr.time, vocabulary.times, times, timed, expr.only)
      case 'season': return under('season', expr.season, vocabulary.seasons, seasons, seasoned, expr.only)
      case 'weather': {
        if (!vocabulary.weathers.includes(expr.weather)) throw new QueryError(`unknown weather "${expr.weather}"`)
        // Weather is a matter of the place, not the game, so an encounter tied to none does not count.
        const bit = 1 << vocabulary.weathers.indexOf(expr.weather)
        if (expr.only) return intersection(soleOf(weathers), rowsWhere((row) => weathers[row] === bit))
        const bits = bit | (vocabulary.weathers.includes(ALL_WEATHER) ? 1 << vocabulary.weathers.indexOf(ALL_WEATHER) : 0)
        return rowsWhere((row) => weathers[row] !== ANY && (weathers[row]! & bits) !== 0)
      }
      case 'encounter': return rowsWhere((row) => (flags[row]! & FLAG[expr.trait]) !== 0)
      case 'held': {
        const id = strings.indexOf(expr.item)
        return rowsWhere((row) => id >= 0 && held[row] === id)
      }
      case 'compare': {
        const [attribute, number, comparator] = expr.left.kind === 'encounterAttribute'
          ? [expr.left, expr.right, expr.comparator] : [expr.right, expr.left, FLIPPED[expr.comparator]]
        if (attribute.kind !== 'encounterAttribute' || number.kind !== 'number') throw new QueryError('what an encounter has can only be compared with a number')
        return rowsWhere((row) => holds(attribute.attribute, comparator, number.value, row))
      }
      default: throw new QueryError('a filter on Pokémon cannot be among the filters on one encounter')
    }
  }

  return {
    owns: (expr) => expr.kind === 'place' || expr.kind === 'region' || expr.kind === 'method' || expr.kind === 'time' || expr.kind === 'season' || expr.kind === 'weather'
      || expr.kind === 'encounter' || usesAttribute(expr),
    attribute: (expr) => (expr.kind === 'encounter' ? `trait:${expr.trait}` : expr.kind === 'compare' ? null : expr.kind),
    lift(parts) {
      const rows = parts.map(evaluate).reduce(intersection, rowGames)
      const set = emptyPairs(forms.length)
      for (let row = 0; row < count; row++) addGames(set, form[row]!, rows[2 * row]!, rows[2 * row + 1]!)
      return set
    },
    encountersOf(parts, of, in_) {
      const rows = parts.map(evaluate).reduce(intersection, rowGames)
      const named = (slugs: string[], bits: number) => (bits === ANY ? null : slugs.filter((_, i) => (bits & (1 << i)) !== 0))
      const found: Encounter[] = []
      for (let row = 0; row < count; row++) {
        if (form[row] !== of) continue
        const lo = rows[2 * row]! & in_[0]!
        const hi = rows[2 * row + 1]! & in_[1]!
        if (lo === 0 && hi === 0) continue
        found.push({
          place: place[row]!, method: vocabulary.methods[method[row]!]!, minLevel: minLevel[row]!, maxLevel: maxLevel[row]!,
          rate: Number.isNaN(rate[row]!) ? null : rate[row]!, times: named(vocabulary.times, times[row]!), seasons: named(vocabulary.seasons, seasons[row]!), weathers: named(vocabulary.weathers, weathers[row]!),
          traits: (Object.keys(FLAG) as (keyof typeof FLAG)[]).filter((trait) => (flags[row]! & FLAG[trait]) !== 0),
          held: held[row] === -1 ? null : strings[held[row]!]!,
          conditions: row < encounters.conditions.length ? encounters.conditions[row]!.map((id) => strings[id]!) : [],
          table: row < encounters.subTable.length && encounters.subTable[row] !== null ? strings[encounters.subTable[row]!]! : null,
          stars: row < raidsFrom ? null : [1, 2, 3, 4, 5, 6, 7].filter((star) => (stars[row - raidsFrom]! & (1 << star)) !== 0),
          lo, hi,
        })
      }
      return found
    },
  }
}
