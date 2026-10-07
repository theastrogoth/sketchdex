import { TYPES, type TypeName } from '../data/schema.ts'

// Damage multipliers by attacking and defending type, per generation, and the
// abilities that change them. Neither is in the data files.

type Matchups = Partial<Record<TypeName, number>>

/** The chart of Generation VI onward: per attacking type, the defending types it does not hit for 1. */
const CHART: Record<TypeName, Matchups> = {
  normal: { rock: 0.5, steel: 0.5, ghost: 0 },
  fire: { grass: 2, ice: 2, bug: 2, steel: 2, fire: 0.5, water: 0.5, rock: 0.5, dragon: 0.5 },
  water: { fire: 2, ground: 2, rock: 2, water: 0.5, grass: 0.5, dragon: 0.5 },
  electric: { water: 2, flying: 2, electric: 0.5, grass: 0.5, dragon: 0.5, ground: 0 },
  grass: { water: 2, ground: 2, rock: 2, fire: 0.5, grass: 0.5, poison: 0.5, flying: 0.5, bug: 0.5, dragon: 0.5, steel: 0.5 },
  ice: { grass: 2, ground: 2, flying: 2, dragon: 2, fire: 0.5, water: 0.5, ice: 0.5, steel: 0.5 },
  fighting: { normal: 2, ice: 2, rock: 2, dark: 2, steel: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, fairy: 0.5, ghost: 0 },
  poison: { grass: 2, fairy: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0 },
  ground: { fire: 2, electric: 2, poison: 2, rock: 2, steel: 2, grass: 0.5, bug: 0.5, flying: 0 },
  flying: { grass: 2, fighting: 2, bug: 2, electric: 0.5, rock: 0.5, steel: 0.5 },
  psychic: { fighting: 2, poison: 2, psychic: 0.5, steel: 0.5, dark: 0 },
  bug: { grass: 2, psychic: 2, dark: 2, fire: 0.5, fighting: 0.5, poison: 0.5, flying: 0.5, ghost: 0.5, steel: 0.5, fairy: 0.5 },
  rock: { fire: 2, ice: 2, flying: 2, bug: 2, fighting: 0.5, ground: 0.5, steel: 0.5 },
  ghost: { psychic: 2, ghost: 2, dark: 0.5, normal: 0 },
  dragon: { dragon: 2, steel: 0.5, fairy: 0 },
  dark: { psychic: 2, ghost: 2, fighting: 0.5, dark: 0.5, fairy: 0.5 },
  steel: { ice: 2, rock: 2, fairy: 2, fire: 0.5, water: 0.5, electric: 0.5, steel: 0.5 },
  fairy: { fighting: 2, dragon: 2, dark: 2, fire: 0.5, poison: 0.5, steel: 0.5 },
}

/** Where the chart of Generations II to V differs: Steel resisted Ghost and Dark. */
const BEFORE_VI: Partial<Record<TypeName, Matchups>> = { ghost: { steel: 0.5 }, dark: { steel: 0.5 } }

/** Where the chart of Generation I differs from that of Generations II to V. */
const IN_I: Partial<Record<TypeName, Matchups>> = { bug: { poison: 2 }, poison: { bug: 2 }, ghost: { psychic: 0 }, ice: { fire: 1 } }

/** The generation that introduced a type, for those not in Generation I. */
const TYPE_SINCE: Partial<Record<TypeName, number>> = { dark: 2, steel: 2, fairy: 6 }

/**
 * The multiplier of an attack of type `attacking` on a Pokémon of the types
 * `defending` in a game of `generation`, by types alone; `null` if the generation
 * has no such attacking type.
 */
export function typeMultiplier(generation: number, attacking: TypeName, defending: readonly TypeName[]): number | null {
  if ((TYPE_SINCE[attacking] ?? 1) > generation) return null
  let multiplier = 1
  for (const type of defending) {
    multiplier *= (generation === 1 ? IN_I[attacking]?.[type] : undefined)
      ?? (generation < 6 ? BEFORE_VI[attacking]?.[type] : undefined)
      ?? CHART[attacking][type] ?? 1
  }
  return multiplier
}

/** How an ability changes the multiplier of attacks of some types, from generation `since` on. */
interface AbilityEffect {
  types: readonly TypeName[]
  apply(multiplier: number): number
  since?: number
}

const immune = (...types: TypeName[]): AbilityEffect => ({ types, apply: () => 0 })
const scaled = (factor: number, ...types: TypeName[]): AbilityEffect => ({ types, apply: (multiplier) => multiplier * factor })
const softened: AbilityEffect = { types: TYPES, apply: (multiplier) => (multiplier > 1 ? multiplier * 0.75 : multiplier) }

/** By ability slug. Effects that depend on the move rather than its type (Fluffy and contact, Soundproof) are left out. */
const ABILITY_EFFECTS: Record<string, AbilityEffect[]> = {
  'levitate': [immune('ground')],
  'earth-eater': [immune('ground')],
  'flash-fire': [immune('fire')],
  'well-baked-body': [immune('fire')],
  'water-absorb': [immune('water')],
  'volt-absorb': [immune('electric')],
  'motor-drive': [immune('electric')],
  'sap-sipper': [immune('grass')],
  'dry-skin': [immune('water'), scaled(1.25, 'fire')],
  // Before Generation V these only redirected moves in double battles.
  'lightning-rod': [{ ...immune('electric'), since: 5 }],
  'storm-drain': [{ ...immune('water'), since: 5 }],
  'wonder-guard': [{ types: TYPES, apply: (multiplier) => (multiplier > 1 ? multiplier : 0) }],
  'thick-fat': [scaled(0.5, 'fire', 'ice')],
  'heatproof': [scaled(0.5, 'fire')],
  'water-bubble': [scaled(0.5, 'fire')],
  'purifying-salt': [scaled(0.5, 'ghost')],
  'fluffy': [scaled(2, 'fire')],
  'filter': [softened],
  'solid-rock': [softened],
  'prism-armor': [softened],
}

/** `multiplier`, the multiplier by types alone, as changed by the ability with slug `ability`. */
export function withAbility(generation: number, ability: string, attacking: TypeName, multiplier: number): number {
  for (const effect of ABILITY_EFFECTS[ability] ?? []) {
    if ((effect.since ?? 1) <= generation && effect.types.includes(attacking)) multiplier = effect.apply(multiplier)
  }
  return multiplier
}
