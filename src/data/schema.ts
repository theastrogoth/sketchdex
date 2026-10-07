// The shape of the data files in `public/data`. Conventions shared by all of them:
//
// - Every id is a 0-based position in an array: a form id indexes `forms`, a move id
//   `moves`, a place id `places`, and game, game-set, and ability ids the arrays of
//   those names in `meta`.
// - A game set is a sorted array of game ids. A fact that holds in several games is
//   stored once with a game-set id.
// - Base stats and EV yields are ordered as `meta.statNames`.

export const TYPES = [
  'normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground',
  'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy',
] as const
export type TypeName = (typeof TYPES)[number]

export const MOVE_CATEGORIES = ['physical', 'special', 'status'] as const
export type MoveCategory = (typeof MOVE_CATEGORIES)[number]

/** Groupings of forms. All but `mega`, for Mega Evolutions, are of whole species; a Pokémon is `legendary` or `mythical`, not both. */
export const TAGS = ['legendary', 'mythical', 'pseudo-legendary', 'ultra-beast', 'paradox', 'mega'] as const
export type Tag = (typeof TAGS)[number]

export const STAT_COUNT = 6

/** The file each part of the bundle is stored in. */
export const BUNDLE_FILES = {
  meta: 'meta.json',
  forms: 'forms.json',
  moves: 'moves.json',
  evolutions: 'evolutions.json',
  learnsets: 'learnsets.json',
  learners: 'learners.json',
  places: 'places.json',
  placeForms: 'place_forms.json',
  encounters: 'encounters.json',
} as const
export const DEX_ENTRIES_FILE = 'dex_entries.json'
export const IMAGES_FILE = 'images.json'

export interface Game {
  slug: string
  versionGroup: string
  generation: number
  /** Whether Pokémon have abilities in this game. */
  abilities: boolean
  hiddenAbilities: boolean
}

export interface Named {
  slug: string
  name: string
}

export interface Meta {
  games: Game[]
  gameSets: number[][]
  abilities: Named[]
  statNames: string[]
  abilitySlots: string[]
  obtainStatuses: string[]
  /** Learn method by the letter that stands for it in a learn code. */
  learnMethods: Record<string, string>
  /** Per table, the number of upstream rows left out of the bundle. */
  omitted: Record<string, number>
}

export type AbilityEntry = [ability: number, slot: number]
/** The values a field takes in the games where it differs from the current one. */
export type Overrides<T> = [gameSet: number, value: T][]

/** The fields of a form whose value depends on the game. `null` means the games have no such thing. */
export interface VersionedFields {
  types: TypeName[]
  baseStats: number[]
  abilities: AbilityEntry[] | null
  evYield: number[] | null
  baseExp: number
  catchRate: number
}
export type VersionedField = keyof VersionedFields

export interface Form {
  species: string
  /** `"none"` for a species' base form. */
  form: string
  name: string
  formName: string | null
  nationalId: number
  classification: string
  types: TypeName[]
  abilities: AbilityEntry[] | null
  baseStats: number[]
  evYield: number[]
  baseExp: number
  catchRate: number
  baseFriendship: number | null
  growthRate: string
  eggGroups: string[] | null
  eggCycles: number | null
  /** Percent male; `null` for genderless. */
  genderRatio: number | null
  /** Meters. */
  height: number
  /** Kilograms. */
  weight: number | null
  tags: Tag[]
  /** The items a wild one may hold: the item's name, the chance in percent, and the games. */
  heldItems: [item: string, rate: number, gameSet: number][]
  obtainability: [status: number, gameSet: number][]
  history: { [K in VersionedField]?: Overrides<VersionedFields[K]> }
}

/** The fields of a move whose value depends on the game. */
export interface VersionedMoveFields {
  type: TypeName
  category: MoveCategory
  /** 0 for moves without a fixed power. */
  power: number
  /** Percent; 101 for moves that never miss. */
  accuracy: number
  pp: number | null
}
export type VersionedMoveField = keyof VersionedMoveFields

/** A move, with its values in the latest main-series games. */
export interface Move extends VersionedMoveFields {
  slug: string
  name: string
  priority: number
  description: string | null
  flags: string[]
  /** The game set the move exists in. */
  games: number
  history: { [K in VersionedMoveField]?: Overrides<VersionedMoveFields[K]> }
}

export const EVOLUTION_TRIGGERS = ['level', 'item', 'trade', 'friendship', 'move', 'hold', 'other'] as const

/** One step of evolution, of the form `from` into the form `to`. */
export interface Evolution {
  from: number
  to: number
  /**
   * What brings it about: levelling up (`level`, and `friendship`, `move`, or `hold`
   * when that takes high friendship, knowing a move, or holding an item), using an
   * `item` on the Pokémon, a `trade`, or something `other`.
   */
  trigger: (typeof EVOLUTION_TRIGGERS)[number]
  /** The level needed, if one is. */
  level: number | null
  /** The name of the item used or held. */
  item: string | null
  /** The id of the move that must be known. */
  move: number | null
  /** What else is needed, in words. */
  condition: string | null
}

/** A location, or a part of one that has encounters of its own. */
export interface Place {
  region: string
  slug: string
  name: string
  regionName: string
  /** For a part of a location, the id of the location. */
  parent: number | null
}

/** Per move id, a form's learn codes; see `parseLearnCode`. */
export type Learnset = Record<string, string[]>
export type FormGames = [form: number, gameSet: number][]

// The encounter tables are column arrays with one row per slot and game set. `place`
// is the most specific place the row is for. Columns holding text store positions in
// `Encounters.strings`.
export interface EncounterColumns {
  place: number[]
  form: number[]
  /** Whether the form is only determined in play, `form` being the species' default. */
  formInPlay: boolean[]
  method: number[]
  time: (number | null)[]
  /** The seasons the encounter is tied to; `null` if to none. */
  seasons: (number[] | null)[]
  weather: (number | null)[]
  subTable: (number | null)[]
  conditions: number[][]
  minLevel: number[]
  maxLevel: number[]
  rate: (number | null)[]
  rateKind: number[]
  shinyLocked: boolean[]
  hiddenAbility: boolean[]
  heldItem: (number | null)[]
  alpha: boolean[]
  /** Percent chance of meeting an alpha. */
  alphaChance: (number | null)[]
  games: number[]
}

export interface SpawnerColumns {
  place: number[]
  form: number[]
  minLevel: number[]
  maxLevel: number[]
  rate: (number | null)[]
  rateKind: number[]
  times: number[][]
  alpha: boolean[]
  alphaChance: (number | null)[]
  terrains: (number[] | null)[]
  weathers: (number[] | null)[]
  spawnerCount: number[]
  /** The spawner's share of spawns per terrain, as the source site gives it. */
  breakdown: (unknown[] | null)[]
  /** The spawner's chances per spawn table, as the source site gives them. */
  tables: (unknown[] | null)[]
  games: number[]
}

export interface RaidColumns {
  place: number[]
  form: number[]
  kind: number[]
  den: (number | null)[]
  gigantamax: boolean[]
  stars: number[][]
  minLevel: number[]
  maxLevel: number[]
  games: number[]
}

export interface Encounters {
  strings: string[]
  encounters: EncounterColumns
  spawners: SpawnerColumns
  raids: RaidColumns
}

export interface Bundle {
  meta: Meta
  forms: Form[]
  moves: Move[]
  evolutions: Evolution[]
  /** Per form id. */
  learnsets: Learnset[]
  /** Per move id, the forms that learn the move by any method. */
  learners: FormGames[]
  places: Place[]
  /** Per place id, the forms encountered there by any means, a location's including those of its parts. */
  placeForms: FormGames[]
  encounters: Encounters
}

export interface DexEntry {
  games: string[]
  text: string
}

export interface LearnCode {
  gameSet: number
  /** A key of `Meta.learnMethods`. */
  method: string
  level: number | null
}

/**
 * Parse a learn code: a game-set id, a method letter, and optionally a level, as in
 * `"12L15"`. Returns `null` if `code` does not have that form.
 */
export function parseLearnCode(code: string): LearnCode | null {
  const match = /^(\d+)([A-Z])(\d*)$/.exec(code)
  if (!match) return null
  return { gameSet: Number(match[1]), method: match[2]!, level: match[3] ? Number(match[3]) : null }
}

/**
 * The image files of each form: each array is per form id, with `null` where the
 * form has no such image.
 */
export interface Images {
  /** The name of a box sprite in `public/images/box`, `<name>.jpg`. */
  sprite: (string | null)[]
  /** The name of a sprite in `public/images/sprites`, `<name>.png`, to be used rather than `sprite`. */
  localSprite: (string | null)[]
  /** Set where `sprite` is that of another form of the species, for want of one of the form's own: what to mark it with. */
  badge: ('dynamax' | 'mega' | null)[]
  /** The names of the artwork in `public/images/art` and `public/images/shiny`, `<name>.webp`. */
  art: (string | null)[]
  shinyArt: (string | null)[]
  /** Pokémon HOME's renders, regular and shiny. */
  home: (string | null)[]
  homeShiny: (string | null)[]
}
