import type { AbilityEntry, TypeName } from '../data/schema.ts'
import type { Scope } from '../engine/expr.ts'
import type { Language } from '../i18n/languages.ts'
import type { Diagnostic } from '../query/lexer.ts'
import type { QueryToken, Suggestion } from '../query/tokens.ts'

// What the page and the engine worker say to each other.

/** What the page shows of a form whatever the game. */
export interface FormInfo {
  name: string
  formName: string | null
  dex: number
  /** The form's image files (see `Images`), `null` where it has none. */
  sprite: string | null
  localSprite: string | null
  badge: 'dynamax' | 'mega' | null
  art: string | null
  shinyArt: string | null
  home: string | null
  homeShiny: string | null
}

export interface GameInfo {
  slug: string
  name: string
  /** Its name among the games of its group: for a DLC's game, that of the game it extends ("Shield"). */
  inGroup: string
  generation: number
  /** The id of the game's group in `ReadyData.groups`. */
  group: number
}

/** The games released together: a version group. */
export interface GroupInfo {
  /** "Scarlet & Violet"; for a DLC, its own name. */
  name: string
  games: number[]
  /** The id of the group whose games its games extend, for a DLC; its own otherwise. */
  base: number
}

/** What the page shows of the data, named in one language. All arrays are indexed by id. */
export interface ReadyData {
  language: Language
  forms: FormInfo[]
  games: GameInfo[]
  /** In order of release. */
  groups: GroupInfo[]
  /** Ability names. */
  abilities: string[]
  types: Record<TypeName, string>
  statNames: string[]
  /** The ability slot of hidden abilities, or -1 if the data has none. */
  hiddenSlot: number
}

/**
 * A form matching a query, with its values in one of the games it matches in: the
 * newest in which it has abilities, or the newest if it has them in none.
 */
export interface Row {
  form: number
  /** The mask of the games the form matches in. */
  lo: number
  hi: number
  /** The game the values are from. */
  game: number
  types: TypeName[]
  abilities: AbilityEntry[] | null
  stats: number[]
  /** Whether the types, abilities, or stats differ among the games matched in. */
  varies: boolean
}

/**
 * The encounters with a form at one place, by one method, under the same conditions,
 * in the same games: often several slots of one encounter table.
 */
export interface EncounterDetail {
  /** The place, without its region, which is `region`. */
  place: string
  region: string
  method: string
  /** The times, seasons, and weathers they are tied to, and what else there is to say of them. */
  conditions: string[]
  /** The games of the group they are in. */
  games: number[]
  /** The levels of all the slots together, and the sum of their rates. */
  levels: string
  rate: string | null
  /** Whether a slot is among the encounters that the query's conditions on encounters select. */
  matches: boolean
  /** The slots, if there are several. */
  slots: { levels: string; rate: string | null; matches: boolean }[]
}

export interface MoveDetail {
  name: string
  /** The move's values in the group's games. */
  type: TypeName
  category: string
  power: number
  accuracy: number
  /** The ways it is learned: "Level up 12", "TM". */
  how: string[]
  /** Whether it is among the moves that the query's conditions on moves select. */
  matches: boolean
}

/** A form in an evolutionary line, with the forms it evolves into. */
export interface EvolutionStage {
  form: number
  /** How its pre-evolution becomes it; `null` for the first of the line. */
  how: string | null
  /** Whether it is the form described or, if that is not in the line (a Mega Evolution), the form of its species that is. */
  current: boolean
  into: EvolutionStage[]
}

/** What there is to show of one form beyond its row. */
export interface Detail {
  form: number
  /** "The Seed Pokémon". */
  classification: string
  /** What else is known of the form, as English labels with values, in the game given: height, weight, egg groups, ... */
  facts: { label: string; value: string }[]
  /** Its evolutionary line, from the earliest form; `null` if it neither evolves nor is evolved into. */
  evolution: EvolutionStage | null
  /**
   * Per group of games, in order of release, that the form is present in or that a DLC with the form extends:
   * its encounters there, and the moves it learns. A DLC's games share the learnsets of the games they extend,
   * so the moves learned in them are with that group's, and a DLC's own group has none.
   */
  groups: { group: number; encounters: EncounterDetail[]; moves: MoveDetail[] }[]
  dexEntries: { games: string[]; text: string }[]
}

export interface Parsed {
  tokens: QueryToken[]
  diagnostics: Diagnostic[]
}

export interface Matches {
  diagnostics: Diagnostic[]
  /** The query in words, in the interface's language; `null` if it has no filters. */
  description: string | null
  /** In order of form id. */
  rows: Row[]
}

/** The requests the worker answers, by `kind`, each with the query text it is about. */
export interface Answers {
  /** Read a query into tokens. */
  parse: Parsed
  /** Evaluate a query; an empty one matches every form. */
  query: Matches
  /** List what the text being typed could be completing. */
  suggest: Suggestion[]
  /** Switch to the language named by the text, for names typed and shown from then on. */
  language: ReadyData
  /** Describe the form `form`, which matches the query in the games of the mask (`lo`, `hi`), with its values in `game`. */
  detail: Detail
}

export interface Request {
  id: number
  kind: keyof Answers
  text: string
  /** For `parse` and `suggest`: the kind of group the text is inside, if any. */
  scope?: Scope
  /** For `detail`: the form, the mask of the games it matches the query in, and the game to give its values in. */
  form?: number
  lo?: number
  hi?: number
  game?: number
}

/** What a request holds besides its kind and text. */
export type RequestOptions = Omit<Request, 'id' | 'kind' | 'text'>

export type WorkerMessage =
  /** The data is loaded; names are in English until a `language` request. */
  | { kind: 'ready'; data: ReadyData }
  /** The data could not be loaded. */
  | { kind: 'failed'; message: string }
  | { kind: 'answer'; id: number; answer: Answers[keyof Answers] }
  | { kind: 'error'; id: number; message: string }
