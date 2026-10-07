import { existsIn, type Dataset, type Version } from '../data/dataset.ts'
import type { Evolution, Form, Game, TypeName, VersionedField, VersionedFields } from '../data/schema.ts'
import { COMBINED_GROUPS, COMPARE, QueryError, slugify } from './common.ts'
import { grouped, type Domain } from './domain.ts'
import { createEncounterDomain, type Encounter } from './encounters.ts'
import type { Attribute, Comparator, EvolutionTime, Expr, MonTerm, Operand, Relation, Scope } from './expr.ts'
import { createMoveDomain, type Learned } from './moves.ts'
import { addGames, difference, emptyPairs, hasPair, intersection, union, type PairSet } from './pairset.ts'
import { typeMultiplier, withAbility } from './typechart.ts'

export { QueryError, slugify }

/**
 * How an `and` or a `not` is read where it is not game by game: an `and` whose conditions are `each` to
 * hold in games of their own; a `not` of what holds in none of `those` games named around it, or in none of
 * `any` game.
 */
export type Reading = 'each' | 'those' | 'any'

export interface Engine {
  dataset: Dataset
  /** The reading of each `and` and `not` of `expr` that is not game by game (`Expr`). */
  readings(expr: Expr): Map<Expr, Reading>
  /**
   * The (form, game) pairs satisfying `expr`. Only pairs of a form with a game it is
   * present in are ever included, so `not` means "present, and not ..."; see `Expr`
   * for what it means of games.
   */
  evaluate(expr: Expr): PairSet
  /**
   * What makes `form` satisfy `expr` in the games `games` (one form's mask of a
   * `PairSet`): its encounters that the query's conditions on encounters select, or
   * all of them if it has none, and the ways it learns the moves that its conditions
   * on moves select. Conditions under a `not`, or about a form's relatives, select
   * nothing. With `null` for `expr`, all of the form's encounters and moves there.
   */
  explain(expr: Expr | null, form: number, games: PairSet): { encounters: Encounter[]; learned: Learned[] }
}

const STAT_ATTRIBUTES = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const satisfies Attribute[]
// What the condition of an evolution says when it happens only at such a time.
const EVOLUTION_TIME_WORDS: Record<EvolutionTime, RegExp> = { night: /\bnight\b|full moon/i, day: /\bday\b/i, rain: /\brain\b/i }
const EV_ATTRIBUTES = ['evHp', 'evAtk', 'evDef', 'evSpA', 'evSpD', 'evSpe'] as const satisfies Attribute[]

/** The version groups that are DLC, by the version group of the game they extend. */
export const DLC_BASE: Record<string, string> = {
  'the-isle-of-armor': 'sword-shield', 'the-crown-tundra': 'sword-shield', 'the-teal-mask': 'scarlet-violet',
  'the-indigo-disk': 'scarlet-violet', 'mega-dimension': 'legends-z-a',
}

/**
 * The statuses of a form that is `obtainable` in a game: had within the game itself, in whatever way. Not
 * those of a form that can only be brought in from elsewhere, by transfer or from an event.
 */
export const OBTAINABLE_STATUSES = ['catchable', 'gift', 'trade', 'obtainable', 'breed', 'evolve', 'mega-evolution']

const RELATION: Record<Relation, (multiplier: number) => boolean> = {
  weak: (m) => m > 1,
  resists: (m) => m > 0 && m < 1,
  immune: (m) => m === 0,
  neutral: (m) => m === 1,
}

function idsBy<T>(items: readonly T[], key: (item: T) => string): Map<string, number> {
  return new Map(items.map((item, id) => [key(item), id]))
}

export function createEngine(dataset: Dataset): Engine {
  const { bundle, exists, introduced, versions, gameSetMasks } = dataset
  const { meta, forms } = bundle
  const abilityIds = idsBy(meta.abilities, (a) => a.slug)
  const gameIds = idsBy(meta.games, (g) => g.slug)
  const statusIds = idsBy(meta.obtainStatuses, slugify)
  const formIds = idsBy(forms, (f) => `${f.species}/${f.form}`)
  const species = new Set(forms.map((f) => f.species))
  const eggGroups = new Set(forms.flatMap((f) => (f.eggGroups ?? []).map(slugify)))
  const hiddenSlot = meta.abilitySlots.indexOf('Hidden')
  const { evolvesFrom, evolvesInto, family } = dataset
  const growthRates = new Set(forms.map((form) => slugify(form.growthRate)))
  const evolutionItems = new Set(bundle.evolutions.flatMap((evolution) => (evolution.item === null ? [] : [slugify(evolution.item)])))

  // The forms reached from `form` by one or more steps along `steps`.
  function reachable(form: number, steps: number[][]): number[] {
    const found = new Set<number>()
    const visit = (from: number) => steps[from]!.forEach((to) => {
      if (!found.has(to)) {
        found.add(to)
        visit(to)
      }
    })
    visit(form)
    return [...found]
  }
  const kin = {
    family: forms.map((_, form) => forms.flatMap((_other, other) => (family[other] === family[form] ? [other] : []))),
    prevo: forms.map((_, form) => reachable(form, evolvesFrom)),
    evo: forms.map((_, form) => reachable(form, evolvesInto)),
  }

  // Whether a relative counts for a form in a game is not simply whether it is in the
  // game: a DLC's list, or a game with a short list such as Champions, has Charizard
  // without Charmander. Per form id, the mask of the games in which it counts:
  //
  // - As a pre-evolution, in every game from its first on. Pikachu is a basic Pokémon
  //   only before Pichu existed.
  // - As an evolution, in the games it is present in and those that share a world
  //   with them (a game and its DLCs). Scyther cannot evolve where there is no Scizor.
  const firstGame = forms.map((_, id) => meta.games.findIndex((_game, game) => existsIn(dataset, id, game)))
  const world = (game: Game) => DLC_BASE[game.versionGroup] ?? game.versionGroup
  const asPrevo = emptyPairs(forms.length)
  const asEvo = emptyPairs(forms.length)
  forms.forEach((_, id) => {
    const worlds = new Set(meta.games.filter((_game, game) => existsIn(dataset, id, game)).map(world))
    meta.games.forEach((game, gameId) => {
      const bit = 1 << (gameId & 31)
      if (firstGame[id]! >= 0 && gameId >= firstGame[id]!) asPrevo[2 * id + (gameId >>> 5)] = asPrevo[2 * id + (gameId >>> 5)]! | bit
      if (worlds.has(world(game))) asEvo[2 * id + (gameId >>> 5)] = asEvo[2 * id + (gameId >>> 5)]! | bit
    })
  })

  // Each form in the games where one of `others(form)` counts, according to `counts`.
  function presentWith(others: (form: number) => number[], counts: PairSet, keep: (form: number, other: number) => boolean = () => true): PairSet {
    const set = emptyPairs(forms.length)
    for (let id = 0; id < forms.length; id++) {
      for (const other of others(id)) {
        if (keep(id, other)) addGames(set, id, exists[2 * id]! & counts[2 * other]!, exists[2 * id + 1]! & counts[2 * other + 1]!)
      }
    }
    return set
  }

  // Form `id`'s place in its line in `game`: 1 more than that of its pre-evolutions that existed by then.
  function stage(id: number, game: number): number {
    return 1 + Math.max(0, ...evolvesFrom[id]!.filter((from) => hasPair(asPrevo, from, game)).map((from) => stage(from, game)))
  }

  function lookup(ids: Map<string, number>, slug: string, what: string): number {
    const id = ids.get(slug)
    if (id === undefined) throw new QueryError(`unknown ${what} "${slug}"`)
    return id
  }

  // Each form selected by `test`, in every game it is present in.
  function formsWhere(test: (form: Form, id: number) => boolean): PairSet {
    const set = emptyPairs(forms.length)
    forms.forEach((form, id) => {
      if (test(form, id)) addGames(set, id, exists[2 * id]!, exists[2 * id + 1]!)
    })
    return set
  }

  // Each form in the games where its value of `field` passes `test`.
  function versionsWhere<K extends VersionedField>(field: K, test: (value: VersionedFields[K]) => boolean): PairSet {
    const set = emptyPairs(forms.length)
    versions[field].forEach((formVersions, id) => {
      for (const version of formVersions) {
        if (test(version.value)) addGames(set, id, version.lo, version.hi)
      }
    })
    return set
  }

  // Every form present in a game selected by `test`, paired with those games.
  function gamesWhere(test: (game: Game, id: number) => boolean, what: string): PairSet {
    let lo = 0
    let hi = 0
    meta.games.forEach((game, id) => {
      if (!test(game, id)) return
      if (id < 32) lo |= 1 << id
      else hi |= 1 << (id - 32)
    })
    if (lo === 0 && hi === 0) throw new QueryError(`unknown ${what}`)
    const set = emptyPairs(forms.length)
    for (let id = 0; id < forms.length; id++) addGames(set, id, exists[2 * id]! & lo, exists[2 * id + 1]! & hi)
    return set
  }

  const generationMasks = [...new Set(meta.games.map((game) => game.generation))].map((generation) => {
    let lo = 0
    let hi = 0
    meta.games.forEach((game, id) => {
      if (game.generation !== generation) return
      if (id < 32) lo |= 1 << id
      else hi |= 1 << (id - 32)
    })
    return { generation, lo, hi }
  })

  // The games of form `id` split so that its types, its abilities (as slugs), and the
  // generation are the same throughout each part.
  interface Defender { lo: number; hi: number; generation: number; types: TypeName[]; abilities: string[] | null }
  const defenderCache: Defender[][] = []
  function defenders(id: number): Defender[] {
    return defenderCache[id] ??= versions.types[id]!.flatMap((types) =>
      versions.abilities[id]!.flatMap((abilities) =>
        generationMasks.flatMap(({ generation, lo, hi }) => {
          const part = { lo: types.lo & abilities.lo & lo, hi: types.hi & abilities.hi & hi }
          if (part.lo === 0 && part.hi === 0) return []
          const slugs = abilities.value && abilities.value.map(([ability]) => meta.abilities[ability]!.slug)
          return [{ ...part, generation, types: types.value, abilities: slugs }]
        })))
  }

  // The multipliers of attacks of type `attacking` on `defender`: one per ability, or
  // the one by types alone if it has no abilities or they are ignored; none if the
  // generation has no such type.
  function multipliers(defender: Defender, attacking: TypeName, ignoreAbilities: boolean): number[] {
    const base = typeMultiplier(defender.generation, attacking, defender.types)
    if (base === null) return []
    if (ignoreAbilities || defender.abilities === null) return [base]
    return defender.abilities.map((ability) => withAbility(defender.generation, ability, attacking, base))
  }

  // A DLC is played in the game it extends: what is met in that game, or in an earlier DLC of it, is met
  // by who plays the DLC, wherever the form is in the DLC at all. Per game, the games it takes in so.
  const within = meta.games.map((game, id) => {
    const base = DLC_BASE[game.versionGroup]
    if (base === undefined) return []
    const version = (other: Game) => game.slug.endsWith(`-${other.slug}`) || meta.games.filter((g) => g.versionGroup === other.versionGroup).length === 1
    return meta.games.flatMap((other, otherId) => {
      if (otherId >= id) return []
      if (other.versionGroup === base) return version(other) ? [otherId] : []
      // An earlier DLC of the same game, of the same version: its slug differs only in the DLC's name.
      return DLC_BASE[other.versionGroup] === base && other.slug.slice(other.versionGroup.length) === game.slug.slice(game.versionGroup.length) ? [otherId] : []
    })
  })
  function inWorld(set: PairSet): PairSet {
    const spread = set.slice()
    for (let id = 0; id < forms.length; id++) {
      within.forEach((games, game) => {
        if (games.some((other) => hasPair(set, id, other)) && existsIn(dataset, id, game)) addGames(spread, id, game < 32 ? 1 << game : 0, game < 32 ? 0 : 1 << (game - 32))
      })
    }
    return spread
  }
  const encounters = createEncounterDomain(dataset)
  const domains = { move: createMoveDomain(dataset), encounter: { ...encounters, lift: (parts: Expr[]) => inWorld(encounters.lift(parts)) } } satisfies Record<Scope, Domain>
  const domainOf = (expr: Expr): Domain | undefined => Object.values(domains).find((domain) => domain.owns(expr))

  const terms: { [K in MonTerm['kind']]: (term: Extract<MonTerm, { kind: K }>) => PairSet } = {
    type: ({ type }) => versionsWhere('types', (types) => types.includes(type)),
    ability: ({ ability, hidden }) => {
      const id = lookup(abilityIds, ability, 'ability')
      if (hidden !== undefined && hiddenSlot < 0) throw new QueryError('the data does not mark hidden abilities')
      return versionsWhere('abilities', (abilities) =>
        abilities !== null && abilities.some(([a, slot]) => a === id && (hidden === undefined || hidden === (slot === hiddenSlot))))
    },
    eggGroup: ({ group }) => {
      if (!eggGroups.has(group)) throw new QueryError(`unknown egg group "${group}"`)
      return formsWhere((form) => form.eggGroups !== null && form.eggGroups.some((g) => slugify(g) === group))
    },
    game: ({ game }) => {
      const id = lookup(gameIds, game, 'game')
      return gamesWhere((_, i) => i === id, `game "${game}"`)
    },
    generation: ({ generation }) => gamesWhere((game) => game.generation === generation, `generation ${generation}`),
    introduced: ({ generation }) => {
      if (!introduced.includes(generation)) throw new QueryError(`no form was introduced in generation ${generation}`)
      return formsWhere((_, id) => introduced[id] === generation)
    },
    versionGroup: ({ versionGroup }) => {
      const groups = COMBINED_GROUPS[versionGroup] ?? [versionGroup]
      return gamesWhere((game) => groups.includes(game.versionGroup), `version group "${versionGroup}"`)
    },
    obtain: (term) => {
      const { status } = term
      if (term.in) return intersection(terms.obtain({ kind: 'obtain', status }), evaluate(term.in))
      const ids = status === 'obtainable'
        ? new Set(OBTAINABLE_STATUSES.flatMap((slug) => statusIds.get(slug) ?? []))
        : new Set([lookup(statusIds, status, 'obtainability status')])
      const set = emptyPairs(forms.length)
      forms.forEach((form, formId) => {
        for (const [s, gameSet] of form.obtainability) {
          if (ids.has(s)) addGames(set, formId, gameSetMasks[2 * gameSet]!, gameSetMasks[2 * gameSet + 1]!)
        }
      })
      return set
    },
    matchup: ({ relation, type, abilities }) => {
      const set = emptyPairs(forms.length)
      for (let id = 0; id < forms.length; id++) {
        for (const defender of defenders(id)) {
          const values = multipliers(defender, type, abilities === 'ignore')
          if (values.length > 0 && (abilities === 'all' ? values.every(RELATION[relation]) : values.some(RELATION[relation]))) {
            addGames(set, id, defender.lo, defender.hi)
          }
        }
      }
      return set
    },
    evolution: ({ state }) => {
      const forward = state === 'nfe' || state === 'fully-evolved'
      const related = presentWith((id) => (forward ? evolvesInto : evolvesFrom)[id]!, forward ? asEvo : asPrevo)
      return state === 'nfe' || state === 'evolved' ? related : difference(exists, related)
    },
    evolves: (term) => {
      if ('item' in term && !evolutionItems.has(term.item)) throw new QueryError(`unknown evolution item "${term.item}"`)
      const takes = (step: Evolution): boolean => {
        if ('item' in term) return step.item !== null && slugify(step.item) === term.item
        if ('move' in term) return step.move !== null && bundle.moves[step.move]!.slug === term.move
        if ('when' in term) return step.condition !== null && EVOLUTION_TIME_WORDS[term.when].test(step.condition)
        // Any evolution that takes an item is one by item: used, held on levelling up, or held in a trade.
        return term.trigger === 'item' ? step.item !== null || step.trigger === 'item' : step.trigger === term.trigger
      }
      const steps = new Set(bundle.evolutions
        .filter(takes)
        .map((step) => `${step.from}>${step.to}`))
      return presentWith((id) => evolvesInto[id]!, asEvo, (id, to) => steps.has(`${id}>${to}`))
    },
    tag: ({ tag }) => formsWhere((form) => form.tags.includes(tag)),
    held: (term) => {
      const set = domains.encounter.lift([term])
      forms.forEach((form, id) => {
        for (const [item, , gameSet] of form.heldItems) {
          if (slugify(item) === term.item) addGames(set, id, exists[2 * id]! & gameSetMasks[2 * gameSet]!, exists[2 * id + 1]! & gameSetMasks[2 * gameSet + 1]!)
        }
      })
      if (set.every((games) => games === 0)) throw new QueryError(`no Pokémon is met holding "${term.item}"`)
      return set
    },
    growth: ({ rate }) => {
      if (!growthRates.has(rate)) throw new QueryError(`unknown growth rate "${rate}"`)
      return formsWhere((form) => slugify(form.growthRate) === rate)
    },
    has: ({ what }) => {
      if (what === 'held-item') {
        const set = emptyPairs(forms.length)
        forms.forEach((form, id) => {
          for (const [, , gameSet] of form.heldItems) addGames(set, id, exists[2 * id]! & gameSetMasks[2 * gameSet]!, exists[2 * id + 1]! & gameSetMasks[2 * gameSet + 1]!)
        })
        return set
      }
      if (hiddenSlot < 0) throw new QueryError('the data does not mark hidden abilities')
      return versionsWhere('abilities', (abilities) => abilities !== null && abilities.some(([, slot]) => slot === hiddenSlot))
    },
    gender: ({ gender }) => formsWhere(({ genderRatio }) => genderRatio === (gender === 'genderless' ? null : gender === 'male-only' ? 100 : 0)),
    species: ({ species: slug }) => {
      if (!species.has(slug)) throw new QueryError(`unknown species "${slug}"`)
      return formsWhere((form) => form.species === slug)
    },
    form: ({ species: slug, form }) => {
      const id = lookup(formIds, `${slug}/${form}`, 'form')
      return formsWhere((_, i) => i === id)
    },
  }

  // The values of `operand` for form `id`, with the games each holds in. A matchup has
  // a value per ability, so its games repeat.
  function operandVersions(operand: Operand, id: number): Version<number | null>[] {
    if (operand.kind === 'matchup') {
      return defenders(id).flatMap((defender) => multipliers(defender, operand.type, false).map((value) => ({ lo: defender.lo, hi: defender.hi, value })))
    }
    const everywhere = (value: number | null) => [{ lo: exists[2 * id]!, hi: exists[2 * id + 1]!, value }]
    const mapped = <K extends VersionedField>(field: K, value: (v: VersionedFields[K]) => number | null) =>
      versions[field][id]!.map((version) => ({ lo: version.lo, hi: version.hi, value: value(version.value) }))
    if (operand.kind === 'number') return everywhere(operand.value)
    if (operand.kind !== 'attribute') throw new QueryError('a comparison cannot mix what Pokémon, moves, and encounters have')
    const form = forms[id]!
    const { attribute } = operand
    switch (attribute) {
      case 'hp': case 'atk': case 'def': case 'spa': case 'spd': case 'spe': {
        const stat = STAT_ATTRIBUTES.indexOf(attribute)
        return mapped('baseStats', (stats) => stats[stat]!)
      }
      case 'evHp': case 'evAtk': case 'evDef': case 'evSpA': case 'evSpD': case 'evSpe': {
        const stat = EV_ATTRIBUTES.indexOf(attribute)
        return mapped('evYield', (yields) => yields?.[stat] ?? null)
      }
      case 'types': return mapped('types', (types) => types.length)
      case 'abilities': return mapped('abilities', (abilities) => (abilities === null ? null : new Set(abilities.map(([ability]) => ability)).size))
      case 'male': return everywhere(form.genderRatio)
      case 'female': return everywhere(form.genderRatio === null ? null : 100 - form.genderRatio)
      case 'bst': return mapped('baseStats', (stats) => stats.reduce((sum, stat) => sum + stat, 0))
      case 'catchRate': return mapped('catchRate', (rate) => rate)
      case 'baseExp': return mapped('baseExp', (exp) => exp)
      case 'height': return everywhere(form.height)
      case 'weight': return everywhere(form.weight)
      case 'friendship': return everywhere(form.baseFriendship)
      case 'eggCycles': return everywhere(form.eggCycles)
      case 'dex': return everywhere(form.nationalId)
      case 'introduced': return everywhere(introduced[id]!)
      case 'generation': return generationMasks.map(({ generation, lo, hi }) => ({ lo: exists[2 * id]! & lo, hi: exists[2 * id + 1]! & hi, value: generation }))
      case 'stage': {
        // Grouped by value over the games the form is present in.
        const masks = new Map<number, { lo: number; hi: number }>()
        meta.games.forEach((_, game) => {
          if (!existsIn(dataset, id, game)) return
          const value = stage(id, game)
          const mask = masks.get(value) ?? { lo: 0, hi: 0 }
          if (game < 32) mask.lo |= 1 << game
          else mask.hi |= 1 << (game - 32)
          masks.set(value, mask)
        })
        return [...masks].map(([value, mask]) => ({ ...mask, value }))
      }
      // One value per evolution by level, so the games repeat.
      case 'evoLevel': return bundle.evolutions.flatMap((step) => (step.from === id && step.level !== null
        ? [{ lo: exists[2 * id]! & asEvo[2 * step.to]!, hi: exists[2 * id + 1]! & asEvo[2 * step.to + 1]!, value: step.level }] : []))
    }
  }

  function compare(comparator: Comparator, left: Operand, right: Operand): PairSet {
    const holds = COMPARE[comparator]
    const set = emptyPairs(forms.length)
    for (let id = 0; id < forms.length; id++) {
      const rights = operandVersions(right, id)
      for (const l of operandVersions(left, id)) {
        for (const r of rights) {
          if (l.value !== null && r.value !== null && holds(l.value, r.value)) addGames(set, id, l.lo & r.lo, l.hi & r.hi)
        }
      }
    }
    return set
  }

  // Conditions are of three sorts, by which `and` and `not` are read (`Expr`): those that name games, those
  // that say where, how, or whether a form is to be had, and those that say what the form is.

  // Whether `expr` only says which games, and nothing about the forms in them.
  const ofGames = (operand: Operand) => operand.kind === 'number' || (operand.kind === 'attribute' && operand.attribute === 'generation')
  const selectsGames = (expr: Expr): boolean => expr.kind === 'game' || expr.kind === 'generation' || expr.kind === 'versionGroup'
    || (expr.kind === 'compare' && ofGames(expr.left) && ofGames(expr.right))
    || ((expr.kind === 'and' || expr.kind === 'or') && expr.args.length > 0 && expr.args.every(selectsGames))

  // Whether all that `expr` says is what the form is: nothing of games, nor of where or whether it is to be had.
  function ofTheForm(expr: Expr): boolean {
    switch (expr.kind) {
      case 'and': case 'or': return expr.args.every(ofTheForm)
      case 'not': case 'kin': case 'anygame': return ofTheForm(expr.arg)
      case 'in': return expr.scope !== 'encounter' && ofTheForm(expr.arg)
      case 'obtain': case 'held': return false
      default: return !selectsGames(expr) && !domains.encounter.owns(expr)
    }
  }

  type Games = [lo: number, hi: number]
  const EVERY_GAME: Games = [0xffffffff, 0xffffffff]
  const both = ([lo, hi]: Games, [otherLo, otherHi]: Games): Games => [lo & otherLo, hi & otherHi]

  // The games that `expr` can hold in, going by the games it names: `EVERY_GAME` itself if it names none.
  function gamesOf(expr: Expr): Games {
    if (expr.kind === 'and' || expr.kind === 'or') {
      const bounds = expr.args.map(gamesOf).filter((bound) => bound !== EVERY_GAME)
      if (bounds.length === 0 || (expr.kind === 'or' && bounds.length < expr.args.length)) return EVERY_GAME
      return bounds.reduce((games, bound) => (expr.kind === 'and' ? both(games, bound) : [games[0] | bound[0], games[1] | bound[1]]))
    }
    if (expr.kind === 'in') return gamesOf(expr.arg)
    if (expr.kind === 'obtain' && expr.in) return gamesOf(expr.in)
    if (!selectsGames(expr)) return EVERY_GAME
    const set = evaluate(expr, EVERY_GAME)
    let [lo, hi] = [0, 0]
    for (let id = 0; id < forms.length; id++) {
      lo |= set[2 * id]!
      hi |= set[2 * id + 1]!
    }
    return [lo, hi]
  }

  // The region that `expr` is about, if it is about one: that of a region or a place, or of conditions that are all of one.
  function regionOf(expr: Expr): string | undefined {
    if (expr.kind === 'region') return expr.region
    if (expr.kind === 'place') return expr.place.slice(0, expr.place.indexOf('/'))
    if (expr.kind === 'in') return regionOf(expr.arg)
    if (expr.kind !== 'and' && expr.kind !== 'or') return undefined
    const regions = expr.args.map(regionOf)
    const named = new Set(regions.filter((region) => region !== undefined))
    return named.size === 1 && (expr.kind === 'and' || !regions.includes(undefined)) ? regions.find((region) => region !== undefined) : undefined
  }

  // The forms that are in every one of `sets`, in the games of any of them.
  function inEach(sets: PairSet[]): PairSet {
    const all = sets.reduce(union, emptyPairs(forms.length))
    return formsWhere((_, id) => sets.every((set) => set[2 * id] !== 0 || set[2 * id + 1] !== 0)).map((games, word) => games & all[word]!)
  }

  // The pairs that all of `args` hold of, in one game. `scope` is the games that the conditions around them name.
  function together(args: Expr[], scope: Games): PairSet {
    // Conditions on moves, and on encounters, that can be about one of them are taken together.
    const own = args.filter((arg) => !domainOf(arg)).map((arg) => evaluate(arg, scope))
    const lifted = Object.values(domains).flatMap((d) => grouped(d, args.filter(d.owns)).map(d.lift))
    return [...own, ...lifted].reduce(intersection, exists)
  }

  // The games that have encounters in a region: the region's own world.
  const regionGames = new Map<string, Games>()
  function gamesIn(region: string): Games {
    let games = regionGames.get(region)
    if (!games) {
      const set = domains.encounter.lift([{ kind: 'region', region }])
      games = [0, 0]
      for (let id = 0; id < forms.length; id++) games = [games[0] | set[2 * id]!, games[1] | set[2 * id + 1]!]
      regionGames.set(region, games)
    }
    return games
  }
  // The games of the regions that `expr` is about, all told; `EVERY_GAME` itself if it is about none.
  function reachOf(expr: Expr): Games {
    if (expr.kind === 'region') return gamesIn(expr.region)
    if (expr.kind === 'place') return gamesIn(expr.place.slice(0, expr.place.indexOf('/')))
    if (expr.kind === 'in' || expr.kind === 'not' || expr.kind === 'kin') return reachOf(expr.arg)
    if (expr.kind !== 'and' && expr.kind !== 'or') return EVERY_GAME
    const reaches = expr.args.map(reachOf).filter((reach) => reach !== EVERY_GAME)
    return reaches.length === 0 ? EVERY_GAME : reaches.reduce((games, reach) => [games[0] | reach[0], games[1] | reach[1]])
  }
  const overlap = (a: Games, b: Games) => (a[0] & b[0]) !== 0 || (a[1] & b[1]) !== 0

  // `and`: conditions hold in one game, but for those that name worlds that cannot be one: games with none in
  // common, different regions, or games and a region that is in none of them. Those are each to hold, with
  // the conditions that name no world. Here, the groups of the conditions that name worlds that can be one,
  // each with the games it names, and the conditions that name none.
  function worlds(args: Expr[]): { groups: { args: Expr[]; games: Games }[]; anywhere: Expr[] } {
    // `reach` is the games a group can be in at all: those it names, that its region is in.
    const groups: { args: Expr[]; games: Games; reach: Games; region: string | undefined }[] = []
    const anywhere: Expr[] = []
    for (const arg of args) {
      const [games, region] = [gamesOf(arg), regionOf(arg)]
      if (games === EVERY_GAME && region === undefined) {
        anywhere.push(arg)
        continue
      }
      const reach = region === undefined ? games : both(games, gamesIn(region))
      const group = groups.find((other) => overlap(other.reach, reach) && (region === undefined || other.region === undefined || other.region === region))
      if (group) Object.assign(group, { args: [...group.args, arg], games: both(group.games, games), reach: both(group.reach, reach), region: group.region ?? region })
      else groups.push({ args: [arg], games, reach, region })
    }
    return { groups, anywhere }
  }
  function all(args: Expr[], scope: Games): PairSet {
    const { groups, anywhere } = worlds(args)
    if (groups.length < 2) return together(args, both(scope, groups[0]?.games ?? EVERY_GAME))
    return inEach(groups.map((group) => together([...group.args, ...anywhere], both(scope, group.games))))
  }

  // `not`: of what a form is, the games in which it is not so. Of anything else it says something of the
  // form: that the condition holds of it in none of the games in question (`inQuestion`).
  function none(arg: Expr, scope: Games): PairSet {
    const holds = evaluate(arg, scope)
    if (ofTheForm(arg)) return difference(exists, holds)
    const [lo, hi] = inQuestion(arg, scope)
    return formsWhere((_, id) => (holds[2 * id]! & lo) === 0 && (holds[2 * id + 1]! & hi) === 0)
  }
  // The games that a `not` of `arg` is about: those that `arg` names; or else those named around it (`scope`),
  // unless `arg` is about regions that are in none of them, which are a world of their own; or else all.
  function inQuestion(arg: Expr, scope: Games): Games {
    if (gamesOf(arg) !== EVERY_GAME) return EVERY_GAME
    return overlap(reachOf(arg), scope) ? scope : EVERY_GAME
  }

  function evaluate(expr: Expr, scope: Games = EVERY_GAME): PairSet {
    const domain = domainOf(expr)
    if (domain) return domain.lift([expr])
    switch (expr.kind) {
      case 'and': return all(expr.args, scope)
      case 'or': return expr.args.map((arg) => evaluate(arg, scope)).reduce(union, emptyPairs(forms.length))
      case 'not': return none(expr.arg, scope)
      case 'in': return domains[expr.scope].lift(expr.arg.kind === 'and' ? expr.arg.args : [expr.arg])
      case 'anygame': {
        const matching = evaluate(expr.arg)
        return formsWhere((_, id) => matching[2 * id] !== 0 || matching[2 * id + 1] !== 0)
      }
      case 'kin': {
        // A relative satisfies `arg` in the same game. But where `arg` names a world, games or a region,
        // that the game is not of, the relative is of that world in games of its own: what evolves into
        // something caught in Scarlet does so in Violet too.
        const matching = evaluate(expr.arg, scope)
        const named = gamesOf(expr.arg)
        const [lo, hi] = named !== EVERY_GAME ? named : reachOf(expr.arg)
        const apart = named !== EVERY_GAME || reachOf(expr.arg) !== EVERY_GAME
        const set = emptyPairs(forms.length)
        for (let id = 0; id < forms.length; id++) {
          for (const other of kin[expr.kinship][id]!) {
            addGames(set, id, exists[2 * id]! & matching[2 * other]!, exists[2 * id + 1]! & matching[2 * other + 1]!)
            if (apart && (matching[2 * other] !== 0 || matching[2 * other + 1] !== 0)) addGames(set, id, exists[2 * id]! & ~lo, exists[2 * id + 1]! & ~hi)
          }
        }
        return set
      }
      case 'compare': return compare(expr.comparator, expr.left, expr.right)
      default: return (terms[expr.kind as MonTerm['kind']] as (term: Expr) => PairSet)(expr)
    }
  }

  // How the `and`s and `not`s of `expr` are read, as `evaluate` reads them.
  function readings(expr: Expr): Map<Expr, Reading> {
    const found = new Map<Expr, Reading>()
    const everyGame = ([lo, hi]: Games) => (lo >>> 0) === 0xffffffff && (hi >>> 0) === 0xffffffff
    const read = (node: Expr, scope: Games): void => {
      if (domainOf(node)) return
      switch (node.kind) {
        case 'and': {
          const { groups, anywhere } = worlds(node.args)
          if (groups.length > 1) found.set(node, 'each')
          for (const group of groups) group.args.forEach((arg) => read(arg, both(scope, group.games)))
          // Among several groups, a condition that names no world is read with each: any of them tells how.
          anywhere.forEach((arg) => read(arg, both(scope, groups[0]?.games ?? EVERY_GAME)))
          break
        }
        case 'or': node.args.forEach((arg) => read(arg, scope)); break
        case 'not':
          if (!ofTheForm(node.arg) && gamesOf(node.arg) === EVERY_GAME) found.set(node, everyGame(inQuestion(node.arg, scope)) ? 'any' : 'those')
          read(node.arg, scope)
          break
        case 'kin': read(node.arg, scope); break
        case 'anygame': read(node.arg, EVERY_GAME); break
        default:
      }
    }
    read(expr, EVERY_GAME)
    return found
  }

  // The groups of conditions on moves, or on encounters, that `expr` lifts as `evaluate` does.
  function groups(expr: Expr, scope: Scope): Expr[][] {
    const domain: Domain = domains[scope]
    if (domain.owns(expr)) return [[expr]]
    switch (expr.kind) {
      case 'and': return [...grouped(domain, expr.args.filter(domain.owns)), ...expr.args.filter((arg) => !domainOf(arg)).flatMap((arg) => groups(arg, scope))]
      case 'or': return expr.args.flatMap((arg) => groups(arg, scope))
      case 'in': return expr.scope === scope ? [expr.arg.kind === 'and' ? expr.arg.args : [expr.arg]] : []
      case 'anygame': return groups(expr.arg, scope)
      default: return []
    }
  }

  function explain(expr: Expr | null, form: number, games: PairSet) {
    const about = (scope: Scope) => (expr === null ? [] : groups(expr, scope))
    const encounterGroups = about('encounter')
    const distinct = <T>(items: T[]) => [...new Map(items.map((item) => [JSON.stringify(item), item])).values()]
    return {
      encounters: distinct((encounterGroups.length === 0 ? [[]] : encounterGroups).flatMap((parts) => domains.encounter.encountersOf(parts, form, games))),
      learned: distinct((expr === null ? [[]] : about('move')).flatMap((parts) => domains.move.learnedBy(parts, form, games))),
    }
  }

  return { dataset, evaluate: (expr) => evaluate(expr), explain, readings }
}
