import { DataError } from './check.ts'
import { MASK_WORDS, addGame, hasGame } from './gamemask.ts'
import {
  BUNDLE_FILES, parseLearnCode, type Bundle, type Overrides, type VersionedField, type VersionedFields, type VersionedMoveField,
  type VersionedMoveFields,
} from './schema.ts'

/** A value together with the mask (`lo`, `hi` words) of the games in which it holds. */
export interface Version<T> {
  lo: number
  hi: number
  value: T
}

/** A validated bundle with the structures derived from it at load. */
export interface Dataset {
  bundle: Bundle
  /** The game mask of each game set, `MASK_WORDS` words per game-set id. */
  gameSetMasks: Uint32Array
  /** Per form id, the mask of the games the form is present in. */
  exists: Uint32Array
  /** Per form id, the generation of the earliest game the form is present in. */
  introduced: number[]
  /**
   * Per versioned field and form id, the field's values with the games each holds in.
   * The masks of one form's versions are disjoint and together equal its `exists` mask.
   */
  versions: { [K in VersionedField]: Version<VersionedFields[K]>[][] }
  /** Per move id, the mask of the games the move exists in. */
  moveGames: Uint32Array
  /** As `versions`, per versioned field of moves and move id, partitioning the move's `moveGames` mask. */
  moveVersions: { [K in VersionedMoveField]: Version<VersionedMoveFields[K]>[][] }
  /**
   * Per form id, the forms it evolves from and into in one step. A form that is in no
   * evolution step and is not its species' first form (a Mega Evolution, a Pikachu in
   * a cap) evolves from what the first form does, and into nothing.
   */
  evolvesFrom: number[][]
  evolvesInto: number[][]
  /** Per form id, an id shared by the forms of its evolutionary family, which includes all forms of its species. */
  family: number[]
  /** Per place id, the place and its parts. */
  placeParts: number[][]
}

const VERSIONED_FIELDS = ['types', 'baseStats', 'abilities', 'evYield', 'baseExp', 'catchRate'] as const satisfies VersionedField[]
const VERSIONED_MOVE_FIELDS = ['type', 'category', 'power', 'accuracy', 'pp'] as const satisfies VersionedMoveField[]

export function buildDataset(bundle: Bundle): Dataset {
  const { meta, forms, moves, evolutions, learnsets, places } = bundle
  const gameSetMasks = new Uint32Array(MASK_WORDS * meta.gameSets.length)
  meta.gameSets.forEach((games, set) => {
    for (const game of games) addGame(gameSetMasks, MASK_WORDS * set, game)
  })

  // A form is present in the games where it has an obtainability status or a learnset.
  const exists = new Uint32Array(MASK_WORDS * forms.length)
  const addSet = (form: number, set: number) => {
    exists[2 * form] = exists[2 * form]! | gameSetMasks[2 * set]!
    exists[2 * form + 1] = exists[2 * form + 1]! | gameSetMasks[2 * set + 1]!
  }
  forms.forEach((f, form) => {
    for (const [, set] of f.obtainability) addSet(form, set)
    for (const codes of Object.values(learnsets[form]!)) {
      for (const code of codes) addSet(form, parseLearnCode(code)!.gameSet)
    }
  })

  const introduced = forms.map((_, form) =>
    Math.min(...meta.games.filter((_game, game) => hasGame(exists, MASK_WORDS * form, game)).map((game) => game.generation)))

  // The values of a field of item `id`, which is in the games of its mask in `present`:
  // `current` except in the games of `overrides`. `where` names the field in errors.
  function versionsOf<T>(present: Uint32Array, id: number, overrides: Overrides<T> | undefined, current: T, where: string): Version<T>[] {
    const result: Version<T>[] = []
    let lo = present[2 * id]!
    let hi = present[2 * id + 1]!
    for (const [set, value] of overrides ?? []) {
      const setLo = gameSetMasks[2 * set]!
      const setHi = gameSetMasks[2 * set + 1]!
      if ((setLo & ~lo) !== 0 || (setHi & ~hi) !== 0) throw new DataError(`${where}: game set ${set} includes games outside those of the item`)
      result.push({ lo: setLo, hi: setHi, value })
      lo = (lo & ~setLo) >>> 0
      hi = (hi & ~setHi) >>> 0
    }
    // The current value holds in the games no override covers.
    if (lo !== 0 || hi !== 0) result.push({ lo, hi, value: current })
    return result
  }
  const versions = Object.fromEntries(VERSIONED_FIELDS.map((field) =>
    [field, forms.map((f, form) => versionsOf<unknown>(exists, form, f.history[field], f[field], `${BUNDLE_FILES.forms}[${form}].history.${field}`))])) as Dataset['versions']

  const moveGames = new Uint32Array(MASK_WORDS * moves.length)
  moves.forEach((move, id) => moveGames.set(gameSetMasks.subarray(2 * move.games, 2 * move.games + 2), 2 * id))
  const moveVersions = Object.fromEntries(VERSIONED_MOVE_FIELDS.map((field) =>
    [field, moves.map((m, move) => versionsOf<unknown>(moveGames, move, m.history[field], m[field], `${BUNDLE_FILES.moves}[${move}].history.${field}`))])) as Dataset['moveVersions']

  const evolvesFrom: number[][] = forms.map(() => [])
  const evolvesInto: number[][] = forms.map(() => [])
  for (const { from, to } of evolutions) {
    evolvesInto[from]!.push(to)
    evolvesFrom[to]!.push(from)
  }
  const firstForm = new Map<string, number>()
  forms.forEach((f, form) => {
    if (!firstForm.has(f.species)) firstForm.set(f.species, form)
  })
  // Each family is named by the least form id in it.
  const family = forms.map((f) => firstForm.get(f.species)!)
  const familyOf = (form: number): number => (family[form] === form ? form : (family[form] = familyOf(family[form]!)))
  for (const { from, to } of evolutions) {
    const [a, b] = [familyOf(from), familyOf(to)]
    family[Math.max(a, b)] = Math.min(a, b)
  }
  forms.forEach((f, form) => {
    family[form] = familyOf(form)
    const first = firstForm.get(f.species)!
    if (form !== first && evolvesFrom[form]!.length === 0 && evolvesInto[form]!.length === 0) evolvesFrom[form] = evolvesFrom[first]!
  })

  const placeParts = places.map((_, place) => [place])
  places.forEach((place, id) => {
    if (place.parent !== null) placeParts[place.parent]!.push(id)
  })

  return { bundle, gameSetMasks, exists, introduced, versions, moveGames, moveVersions, evolvesFrom, evolvesInto, family, placeParts }
}

/** Whether form `form` is present in game `game`. */
export function existsIn(dataset: Dataset, form: number, game: number): boolean {
  return hasGame(dataset.exists, MASK_WORDS * form, game)
}

/**
 * The value of `field` for form `form` in game `game`: `undefined` if the form is not
 * present in the game, `null` if the game has no such thing (abilities in Gold, say).
 */
export function valueIn<K extends VersionedField>(dataset: Dataset, field: K, form: number, game: number): VersionedFields[K] | undefined {
  const bit = 1 << (game & 31)
  for (const version of dataset.versions[field][form]!) {
    if (((game < 32 ? version.lo : version.hi) & bit) !== 0) return version.value
  }
  return undefined
}
