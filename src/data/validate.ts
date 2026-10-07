import {
  array, boolean, fail, index, integer, nullable, number, object, oneOf, partial, record, string, tuple, unknown,
  type Check, type Path,
} from './check.ts'
import { MAX_GAMES } from './gamemask.ts'
import {
  BUNDLE_FILES, DEX_ENTRIES_FILE, EVOLUTION_TRIGGERS, IMAGES_FILE, MOVE_CATEGORIES, STAT_COUNT, TAGS, TYPES, parseLearnCode,
  type AbilityEntry, type Bundle, type DexEntry, type EncounterColumns, type Encounters, type Evolution, type Form, type FormGames,
  type Game, type Images, type Learnset, type Meta, type Move, type Named, type Overrides, type Place, type RaidColumns,
  type SpawnerColumns, type TypeName,
} from './schema.ts'

/** The parsed JSON of each bundle file, not yet checked. */
export type RawBundle = { [K in keyof Bundle]: unknown }

const named = object<Named>({ slug: string, name: string })

const metaShape = object<Meta>({
  games: array(object<Game>({ slug: string, versionGroup: string, generation: integer, abilities: boolean, hiddenAbilities: boolean })),
  gameSets: array(array(integer)),
  abilities: array(named),
  statNames: array(string, STAT_COUNT),
  abilitySlots: array(string),
  obtainStatuses: array(string),
  learnMethods: record(string, (key, path) => {
    if (!/^[A-Z]$/.test(key)) fail(path, 'keys that are single capital letters', key)
  }),
  omitted: record(integer),
})

function validateMeta(value: unknown): Meta {
  const file = BUNDLE_FILES.meta
  const meta = metaShape(value, [file])
  if (meta.games.length > MAX_GAMES) fail([file, 'games'], `at most ${MAX_GAMES} games`, meta.games.length)
  const game = index(meta.games.length)
  meta.gameSets.forEach((games, i) => {
    games.forEach((id, j) => {
      game(id, [file, 'gameSets', i, j])
      if (j > 0 && id <= games[j - 1]!) fail([file, 'gameSets', i], 'game ids in ascending order', games)
    })
  })
  unique(meta.games, (g) => g.slug, [file, 'games'])
  unique(meta.abilities, (a) => a.slug, [file, 'abilities'])
  return meta
}

function unique<T>(items: T[], key: (item: T) => string, path: Path): void {
  const seen = new Set<string>()
  items.forEach((item, i) => {
    const k = key(item)
    if (seen.has(k)) fail([...path, i], 'a key not used by an earlier item', k)
    seen.add(k)
  })
}

function lengthOf(value: unknown, file: string): number {
  return Array.isArray(value) ? value.length : fail([file], 'an array', value)
}

// Checks that the arrays of a column table have one length.
function columns<T extends { place: unknown[] }>(shape: Check<T>): Check<T> {
  return (value, path) => {
    const table = shape(value, path)
    for (const [name, column] of Object.entries(table)) {
      if ((column as unknown[]).length !== table.place.length) {
        fail([...path, name], `${table.place.length} rows, as in column place`, (column as unknown[]).length)
      }
    }
    return table
  }
}

/**
 * Check the parsed JSON of the bundle files against the schema, including that every
 * id refers to an existing item. Throws a `DataError` at the first violation.
 */
export function validateBundle(raw: RawBundle): Bundle {
  const meta = validateMeta(raw.meta)
  const formCount = lengthOf(raw.forms, BUNDLE_FILES.forms)
  const moveCount = lengthOf(raw.moves, BUNDLE_FILES.moves)
  const placeCount = lengthOf(raw.places, BUNDLE_FILES.places)

  const gameSet = index(meta.gameSets.length)
  const form = index(formCount)
  const place = index(placeCount)
  const formGames: Check<FormGames> = array(tuple<[number, number]>(form, gameSet))
  const overrides = <T>(item: Check<T>): Check<Overrides<T>> => array(tuple<[number, T]>(gameSet, item))

  const typeList = array(oneOf(TYPES))
  const types: Check<TypeName[]> = (value, path) => {
    const list = typeList(value, path)
    return list.length === 1 || (list.length === 2 && list[0] !== list[1]) ? list : fail(path, 'one or two distinct types', value)
  }
  const stats = array(integer, STAT_COUNT)
  const abilities = array(tuple<AbilityEntry>(index(meta.abilities.length), index(meta.abilitySlots.length)))

  const forms = array(object<Form>({
    species: string, form: string, name: string, formName: nullable(string), nationalId: integer, classification: string,
    types, abilities: nullable(abilities), baseStats: stats, evYield: stats, baseExp: integer, catchRate: integer,
    baseFriendship: nullable(integer), growthRate: string, eggGroups: nullable(array(string)), eggCycles: nullable(integer),
    genderRatio: nullable(number), height: number, weight: nullable(number), tags: array(oneOf(TAGS)), heldItems: array(tuple(string, number, integer)),
    obtainability: array(tuple<[number, number]>(index(meta.obtainStatuses.length), gameSet)),
    history: partial({
      types: overrides(types), baseStats: overrides(stats), abilities: overrides(nullable(abilities)),
      evYield: overrides(nullable(stats)), baseExp: overrides(integer), catchRate: overrides(integer),
    }),
  }))(raw.forms, [BUNDLE_FILES.forms])
  unique(forms, (f) => `${f.species}/${f.form}`, [BUNDLE_FILES.forms])
  // A game with two values for one field would make the field ambiguous there.
  function disjoint(history: Record<string, Overrides<unknown>>, path: Path) {
    for (const [field, entries] of Object.entries(history)) {
      const seen = new Set<number>()
      entries.forEach(([set], j) => {
        for (const game of meta.gameSets[set]!) {
          if (seen.has(game)) fail([...path, field, j, 0], 'a game set disjoint from the earlier ones', set)
          seen.add(game)
        }
      })
    }
  }
  forms.forEach((f, i) => disjoint(f.history, [BUNDLE_FILES.forms, i, 'history']))

  const moves = array(object<Move>({
    slug: string, name: string, type: oneOf(TYPES), category: oneOf(MOVE_CATEGORIES), power: integer, accuracy: integer,
    pp: nullable(integer), priority: integer, description: nullable(string), flags: array(string), games: gameSet,
    history: partial({
      type: overrides(oneOf(TYPES)), category: overrides(oneOf(MOVE_CATEGORIES)), power: overrides(integer),
      accuracy: overrides(integer), pp: overrides(nullable(integer)),
    }),
  }))(raw.moves, [BUNDLE_FILES.moves])
  unique(moves, (m) => m.slug, [BUNDLE_FILES.moves])
  moves.forEach((m, i) => disjoint(m.history, [BUNDLE_FILES.moves, i, 'history']))

  const evolutions = array(object<Evolution>({
    from: form, to: form, trigger: oneOf(EVOLUTION_TRIGGERS), level: nullable(integer), item: nullable(string),
    move: nullable(index(moveCount)), condition: nullable(string),
  }))(raw.evolutions, [BUNDLE_FILES.evolutions])

  const moveKey = (key: string, path: Path) => {
    if (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= moveCount) fail(path, `keys that are move ids in 0..${moveCount - 1}`, key)
  }
  const learnCode: Check<string> = (value, path) => {
    const code = parseLearnCode(string(value, path))
    if (!code || code.gameSet >= meta.gameSets.length || !Object.hasOwn(meta.learnMethods, code.method)) {
      fail(path, 'a learn code: game-set id, method letter, optional level', value)
    }
    return value as string
  }
  const learnsets = array<Learnset>(record(array(learnCode), moveKey), formCount)(raw.learnsets, [BUNDLE_FILES.learnsets])
  const learners = array(formGames, moveCount)(raw.learners, [BUNDLE_FILES.learners])

  const places = array(object<Place>({ region: string, slug: string, name: string, regionName: string, parent: nullable(place) }))(raw.places, [BUNDLE_FILES.places])
  unique(places, (p) => `${p.region}/${p.parent ?? ''}/${p.slug}`, [BUNDLE_FILES.places])
  places.forEach((p, i) => {
    if (p.parent !== null && places[p.parent]!.parent !== null) fail([BUNDLE_FILES.places, i, 'parent'], 'a place that is not itself a part of one', p.parent)
  })
  const placeForms = array(formGames, placeCount)(raw.placeForms, [BUNDLE_FILES.placeForms])

  const strings = array(string)(
    typeof raw.encounters === 'object' && raw.encounters !== null ? (raw.encounters as { strings?: unknown }).strings : undefined,
    [BUNDLE_FILES.encounters, 'strings'],
  )
  const text = index(strings.length)
  const encounters = object<Encounters>({
    strings: unknown as Check<string[]>,
    encounters: columns(object<EncounterColumns>({
      place: array(place), form: array(form), formInPlay: array(boolean), method: array(text),
      time: array(nullable(text)), seasons: array(nullable(array(text))), weather: array(nullable(text)), subTable: array(nullable(text)), conditions: array(array(text)),
      minLevel: array(integer), maxLevel: array(integer), rate: array(nullable(number)), rateKind: array(text),
      shinyLocked: array(boolean), hiddenAbility: array(boolean), heldItem: array(nullable(text)), alpha: array(boolean),
      alphaChance: array(nullable(number)), games: array(gameSet),
    })),
    spawners: columns(object<SpawnerColumns>({
      place: array(place), form: array(form), minLevel: array(integer), maxLevel: array(integer),
      rate: array(nullable(number)), rateKind: array(text), times: array(array(text)), alpha: array(boolean),
      alphaChance: array(nullable(number)), terrains: array(nullable(array(text))), weathers: array(nullable(array(text))),
      spawnerCount: array(integer), breakdown: array(nullable(array(unknown))), tables: array(nullable(array(unknown))),
      games: array(gameSet),
    })),
    raids: columns(object<RaidColumns>({
      place: array(place), form: array(form), kind: array(text), den: array(nullable(integer)), gigantamax: array(boolean),
      stars: array(array(integer)), minLevel: array(integer), maxLevel: array(integer), games: array(gameSet),
    })),
  })(raw.encounters, [BUNDLE_FILES.encounters])

  return { meta, forms, moves, evolutions, learnsets, learners, places, placeForms, encounters }
}

/** Check the parsed JSON of the Pokédex entries file: per form id, that form's entries. */
export function validateDexEntries(value: unknown, formCount: number): DexEntry[][] {
  return array(array(object<DexEntry>({ games: array(string), text: string })), formCount)(value, [DEX_ENTRIES_FILE])
}

/** Check the parsed JSON of the images file. */
export function validateImages(value: unknown, formCount: number): Images {
  const names = array(nullable(string), formCount)
  return object<Images>({ sprite: names, localSprite: names, badge: array(nullable(oneOf(['dynamax', 'mega'])), formCount), art: names, shinyArt: names, home: names, homeShiny: names })(value, [IMAGES_FILE])
}
