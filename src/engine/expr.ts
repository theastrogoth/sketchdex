import type { Evolution, MoveCategory, Tag, TypeName } from '../data/schema.ts'

// A query as a tree. Entities are named by slug, so an expression means the same in
// every language and across rebuilds of the data.

/**
 * A condition on a move in one game. A form satisfies it in a game if it learns
 * such a move there.
 */
export type MoveTerm =
  | { kind: 'move'; move: string }
  | { kind: 'moveType'; type: TypeName }
  | { kind: 'category'; category: MoveCategory }
  /** Has the flag, named as in the data without `is` or `makes`, in slug form: `contact`, `sound`, `sheer-force`. */
  | { kind: 'flag'; flag: string }
  /** Not a condition on the move but on how it is learned: by the method named as in `Meta.learnMethods`. */
  | { kind: 'learn'; method: string }

export const ENCOUNTER_TRAITS = ['alpha', 'shiny-locked', 'hidden-ability', 'gigantamax'] as const

/**
 * A condition on one way of encountering a form: a slot of a wild encounter table,
 * an overworld spawn, or a raid. A form satisfies it in a game if it can be
 * encountered in such a way there.
 */
export type EncounterTerm =
  /** At the place, or a part of it. A place is named `<region>/<slug>`, a part of one `<region>/<location slug>/<slug>`. */
  | { kind: 'place'; place: string }
  | { kind: 'region'; region: string }
  /** By the method, or one of the methods of the group, with that slug (`METHOD_GROUPS`). */
  | { kind: 'method'; method: string }
  /**
   * At that time of day: tied to it or, in a game that has times of day, to none.
   * With `only`, tied to it, where the form is found at the same place at no other
   * time.
   */
  | { kind: 'time'; time: string; only?: true }
  /** In that season, as with `time`: Unova's wild Pokémon change with the seasons. */
  | { kind: 'season'; season: string; only?: true }
  /**
   * Tied to that weather, or to all the weathers of a place that has weather. With
   * `only`, tied to it alone, where the form is found at the same place in no other
   * weather, nor by an encounter that weather does not affect.
   */
  | { kind: 'weather'; weather: string; only?: true }
  | { kind: 'encounter'; trait: (typeof ENCOUNTER_TRAITS)[number] }

/**
 * A condition on a Pokémon form in one game. Slugs of egg groups and obtainability
 * statuses are their names in lower case with `-` for each run of other characters.
 */
/** A condition that only says which games. */
export type GameTerm =
  | { kind: 'game'; game: string }
  /** In a game of the generation. */
  | { kind: 'generation'; generation: number }
  /** In a game of the version group, or of those that an abbreviation of `COMBINED_GROUPS` joins. */
  | { kind: 'versionGroup'; versionGroup: string }

export type MonTerm =
  | { kind: 'type'; type: TypeName }
  /** Has the ability; with `hidden`, as a hidden (`true`) or regular (`false`) ability. */
  | { kind: 'ability'; ability: string; hidden?: boolean }
  | { kind: 'eggGroup'; group: string }
  | { kind: 'game'; game: string }
  /** In a game of the generation. */
  | { kind: 'generation'; generation: number }
  /** In any game, a form whose earliest game is of the generation. */
  | { kind: 'introduced'; generation: number }
  /** In a game of the version group, or of those that an abbreviation of `COMBINED_GROUPS` joins. */
  | { kind: 'versionGroup'; versionGroup: string }
  /**
   * Available in the game in the way `status` says (a slug: `catchable`, `gift`, ...).
   * With `in`, in one of those games, which the condition then names as `in` does.
   */
  | { kind: 'obtain'; status: string; in?: GameTerm }
  /**
   * Takes damage from attacks of the type in the way `relation` says, with one of its
   * abilities; with `abilities: 'all'`, with every one of them; with `'ignore'`, by
   * its types alone. Never holds in a game without the attacking type.
   */
  | { kind: 'matchup'; relation: Relation; type: TypeName; abilities?: 'all' | 'ignore' }
  /**
   * Where it stands in its evolutionary line in the game: has an evolution (`nfe`) or
   * none (`fully-evolved`), counting those present in the game or its DLCs; has a
   * pre-evolution (`evolved`) or none (`basic`), counting those that existed by then.
   */
  | { kind: 'evolution'; state: EvolutionState }
  /** Has an evolution, present in the game or its DLCs, that it reaches by the trigger or with the item (a slug of its name). */
  | { kind: 'evolves'; trigger: Evolution['trigger'] }
  | { kind: 'evolves'; item: string }
  /** Likewise, by an evolution that needs it to know the move (a slug), or that happens only at night, by day, or in rain. */
  | { kind: 'evolves'; move: string }
  | { kind: 'evolves'; when: EvolutionTime }
  /** Gains experience at the rate (a slug of its name). */
  | { kind: 'growth'; rate: string }
  /**
   * May hold the item (a slug of its name) when met in the game: in the wild, or in
   * an encounter that gives it one. Among the filters on one encounter
   * (`encounter(...)`), that encounter gives it.
   */
  | { kind: 'held'; item: string }
  /** Has a hidden ability in the game, or some item it may hold when met in the wild there. */
  | { kind: 'has'; what: 'hidden-ability' | 'held-item' }
  | { kind: 'tag'; tag: Tag }
  /** Is always of one gender, or of none. */
  | { kind: 'gender'; gender: Gender }
  /** Any form of the species. */
  | { kind: 'species'; species: string }
  | { kind: 'form'; species: string; form: string }

export type Term = MonTerm | MoveTerm | EncounterTerm

export const SCOPES = ['move', 'encounter'] as const
/** What the filters of a group are all about: one move, or one encounter. */
export type Scope = (typeof SCOPES)[number]

export const MOVE_ATTRIBUTES = ['power', 'accuracy', 'pp', 'priority', 'learnLevel'] as const
/** A number a move has; `learnLevel` is instead the level at which a form learns it. */
export type MoveAttribute = (typeof MOVE_ATTRIBUTES)[number]

export const ENCOUNTER_ATTRIBUTES = ['level', 'rate', 'stars'] as const
/** A number an encounter has: a level within its range, its rate in percent, a star rating of a raid. */
export type EncounterAttribute = (typeof ENCOUNTER_ATTRIBUTES)[number]

export const EVOLUTION_TIMES = ['night', 'day', 'rain'] as const
export type EvolutionTime = (typeof EVOLUTION_TIMES)[number]

export const GENDERS = ['male-only', 'female-only', 'genderless'] as const
export type Gender = (typeof GENDERS)[number]

export const EVOLUTION_STATES = ['nfe', 'fully-evolved', 'basic', 'evolved'] as const
export type EvolutionState = (typeof EVOLUTION_STATES)[number]

export const KINSHIPS = ['family', 'prevo', 'evo'] as const
/** Which forms a form is related to: all of its evolutionary family, those it evolves from, or those it evolves into, in any number of steps. */
export type Kinship = (typeof KINSHIPS)[number]

export const RELATIONS = ['weak', 'resists', 'immune', 'neutral'] as const
/** How a multiplier compares to 1: above it, between 0 and 1, 0, or equal to it. */
export type Relation = (typeof RELATIONS)[number]

export const ATTRIBUTES = [
  'hp', 'atk', 'def', 'spa', 'spd', 'spe', 'bst', 'height', 'weight', 'catchRate', 'baseExp', 'friendship', 'eggCycles', 'dex', 'introduced', 'stage', 'evoLevel', 'generation',
  'evHp', 'evAtk', 'evDef', 'evSpA', 'evSpD', 'evSpe', 'male', 'female', 'types', 'abilities',
] as const
/**
 * A number a form has: a base stat, their total (`bst`), the National Pokédex number
 * (`dex`), the generation of its earliest game (`introduced`), its place in its
 * evolutionary line among the forms that existed by the game (`stage`, from 1), the
 * level at which it evolves (`evoLevel`), the effort values of one stat that it
 * yields (`evHp` to `evSpe`), the percentage of it that is male or female (no
 * number for a genderless form, of which no comparison holds), how many types or
 * abilities it has (`types`, `abilities`), ... `generation` is the game's, not the
 * form's: `generation >= 5` is the form in the games from Generation V on.
 */
export type Attribute = (typeof ATTRIBUTES)[number]

export type Operand =
  | { kind: 'attribute'; attribute: Attribute }
  | { kind: 'number'; value: number }
  /** The multiplier of attacks of the type; a comparison holds if it does with one of the form's abilities. */
  | { kind: 'matchup'; type: TypeName }
  /** Makes the comparison a condition on a move, or on how it is learned. */
  | { kind: 'moveAttribute'; attribute: MoveAttribute }
  /** Makes the comparison a condition on an encounter; the other operand must be a number. */
  | { kind: 'encounterAttribute'; attribute: EncounterAttribute }

export const COMPARATORS = ['<', '<=', '=', '!=', '>=', '>'] as const
export type Comparator = (typeof COMPARATORS)[number]

export type Expr =
  /**
   * A form in a game where every one of `args` holds. But conditions that name
   * worlds that cannot be one are each to hold, with those that name no world: games
   * with none in common ("Sword and Scarlet"), different regions, a place being of
   * its region ("Paldea and Kanto", "Route 1 and Johto"), or games and a region
   * that is in none of them ("Scarlet and Kanto"). The form is then in the games of
   * all of them.
   */
  | { kind: 'and'; args: Expr[] }
  | { kind: 'or'; args: Expr[] }
  /**
   * If `arg` only says what a form is (its type, its moves, ...), a form in the games
   * it is present in where `arg` does not hold. Otherwise, where `arg` names games or
   * says where or whether the form is to be had, a form of which `arg` holds in none
   * of the games in question, in every game it is in. Those are the games that `arg`
   * names ("not Generation VIII", "not (catchable Violet)"), or else those named by
   * the conditions it is among, at whatever depth ("Generation II and not
   * catchable"), or else all ("not Johto", "not catchable"). A region that is in
   * none of the games named around it is not held to them ("Scarlet and not
   * Kanto" is of Kanto in any game).
   */
  | { kind: 'not'; arg: Expr }
  /**
   * A form with a relative, of the kind `kinship` says, that satisfies `arg` in the
   * same game; or, in a game outside the world that `arg` names (its games, or the
   * games of its regions), in any game.
   */
  | { kind: 'kin'; kinship: Kinship; arg: Expr }
  /** A form, in every game it is present in, that satisfies `arg` in some game. */
  | { kind: 'anygame'; arg: Expr }
  /**
   * A form that, in one game, learns one move, or can be encountered in one way,
   * that satisfies all of `arg`, which may hold only conditions on moves, or on
   * encounters.
   *
   * Outside such a group, conditions on moves that are joined by one `and` are about
   * one move too, except where that could never hold: a second named move, type, or
   * category is about another move. How a move is learned then applies to each of
   * the moves. The same goes for conditions on encounters.
   */
  | { kind: 'in'; scope: Scope; arg: Expr }
  /** False wherever an operand has no value, such as the weight of a form without one. */
  | { kind: 'compare'; comparator: Comparator; left: Operand; right: Operand }
  | Term
