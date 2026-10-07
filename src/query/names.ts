import type { Dataset } from '../data/dataset.ts'
import { TYPES } from '../data/schema.ts'
import { COMBINED_GROUPS } from '../engine/common.ts'
import { slugify } from '../engine/engine.ts'
import { EVOLUTION_TRIGGERS, MOVE_CATEGORIES, TAGS, type Tag } from '../data/schema.ts'
import { WEATHER_MERGES, encounterVocabulary } from '../engine/encounters.ts'
import { flagSlug } from '../engine/moves.ts'
import { ENCOUNTER_TRAITS, EVOLUTION_STATES, EVOLUTION_TIMES, GENDERS, RELATIONS, type EvolutionState, type EvolutionTime, type Gender, type GameTerm, type Relation, type Scope, type Term } from '../engine/expr.ts'
import type { Translations } from '../i18n/languages.ts'
import { print } from './printer.ts'

/**
 * The form in which names are compared: lower case, without diacritics, apostrophes,
 * or periods, and with one space for each run of other punctuation.
 */
export function normalize(text: string): string {
  return text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/♀/g, ' f ').replace(/♂/g, ' m ').replace(/['’.]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

export interface NameEntry {
  term: Term
  /** The name to show for the term. */
  display: string
  /** Normalized names that select the term on their own. */
  names: string[]
  /** Normalized names that select the term only after a prefix, as in `gen:3`. */
  prefixedNames: string[]
  /** Normalized names that select the term inside a `move(...)` or `encounter(...)` group, whichever the term belongs in. */
  scopedNames: string[]
}

interface Prefix {
  kind: Term['kind']
  /** More kinds the prefix is for, if it is for several. */
  otherKinds?: Term['kind'][]
  /** Which terms of the kind the prefix is for; all of them if absent. */
  accepts?(term: Term): boolean
  /** Changes the term that the name alone would select. */
  adjust?(term: Term): Term
}

/**
 * The ways of being available in a game that are filters, and prefixes too, as in
 * `catchable:scarlet`, with their English names and what else they are typed by. That
 * a Pokémon is a gift is not among them: it is a way of meeting it (`method:gift`).
 * `obtainable` is every way of having a Pokémon within the game (`OBTAINABLE_STATUSES`).
 */
export const OBTAIN_NAMES: Record<string, string[]> = {
  'catchable': ['Catchable'], 'trade': ['Received in a trade', 'trade'], 'obtainable': ['Obtainable'],
  'breed': ['By breeding', 'breed'], 'evolve': ['By evolving', 'evolve'], 'mega-evolution': ['By Mega Evolution', 'mega evolution'],
  'event': ['From an event', 'event'], 'transfer': ['By transfer', 'transfer'], 'unknown': ['Unknown'],
}
export const OBTAIN_STATUSES = Object.keys(OBTAIN_NAMES)

/** Prefixes that restrict a name to one kind of term, as in `egg:fairy`. */
export const PREFIXES: Record<string, Prefix> = {
  // `weak:fire` and so on; `always-weak:fire` for every ability, `base-weak:fire` for types alone.
  ...Object.fromEntries(RELATIONS.flatMap((relation) => {
    const accepts = (term: Term) => term.kind === 'matchup' && term.relation === relation
    return [
      [relation, { kind: 'matchup', accepts }],
      [`always-${relation}`, { kind: 'matchup', accepts, adjust: (term: Term) => ({ ...term, abilities: 'all' }) }],
      [`base-${relation}`, { kind: 'matchup', accepts, adjust: (term: Term) => ({ ...term, abilities: 'ignore' }) }],
    ] satisfies [string, Prefix][]
  })),
  type: { kind: 'type' },
  ability: { kind: 'ability' },
  hidden: { kind: 'ability', adjust: (term) => ({ ...term, hidden: true }) },
  regular: { kind: 'ability', adjust: (term) => ({ ...term, hidden: false }) },
  egg: { kind: 'eggGroup' },
  'tag': { kind: 'tag' },
  'gender': { kind: 'gender' },
  'is': { kind: 'evolution' },
  'evolves': { kind: 'evolves', accepts: (term) => 'trigger' in term || 'when' in term },
  'evolves-knowing': { kind: 'evolves', accepts: (term) => 'move' in term },
  'growth': { kind: 'growth' },
  'has': { kind: 'has' },
  'evolves-with': { kind: 'evolves', accepts: (term) => 'item' in term },
  game: { kind: 'game' },
  gen: { kind: 'generation' },
  introduced: { kind: 'introduced' },
  vg: { kind: 'versionGroup' },
  obtain: { kind: 'obtain', accepts: (term) => term.kind === 'obtain' && term.in === undefined },
  // `catchable:scarlet` and so on: available in that way in the game, or in the games named.
  ...Object.fromEntries(OBTAIN_STATUSES.map((status) => [status, { kind: 'obtain', accepts: (term: Term) => term.kind === 'obtain' && term.in !== undefined && term.status === status }] satisfies [string, Prefix])),
  move: { kind: 'move' },
  movetype: { kind: 'moveType' },
  category: { kind: 'category' },
  flag: { kind: 'flag' },
  learn: { kind: 'learn' },
  place: { kind: 'place' },
  region: { kind: 'region' },
  method: { kind: 'method' },
  time: { kind: 'time', accepts: (term) => term.kind === 'time' && !term.only },
  only: { kind: 'time', otherKinds: ['season', 'weather'], accepts: (term) => (term.kind === 'time' || term.kind === 'season' || term.kind === 'weather') && term.only === true },
  season: { kind: 'season', accepts: (term) => term.kind === 'season' && !term.only },
  weather: { kind: 'weather', accepts: (term) => term.kind === 'weather' && !term.only },
  enc: { kind: 'encounter' },
  holds: { kind: 'held' },
  species: { kind: 'species' },
  form: { kind: 'form' },
}

export interface NameTable {
  entries: NameEntry[]
  /** The name to show for `term`. */
  display(term: Term): string
  /** The term with the canonical text `text` (as `print` writes it), if there is one. */
  exact(text: string): Term | undefined
  /** The most words (separated by spaces) in a normalized name. */
  maxWords: number
  /**
   * The terms `name` (normalized) can stand for. With `prefix`, those of that prefix's
   * kind only. Without, those of the kinds that come first in `PRECEDENCE`: a name
   * shared by a type and a move means the type. Inside a group of `scope`, a name
   * that the group's kind of filter has for itself means that.
   */
  find(name: string, prefix?: string, scope?: Scope): Term[]
}

const MOVE_KINDS: Term['kind'][] = ['move', 'moveType', 'category', 'flag', 'learn']
const ENCOUNTER_KINDS: Term['kind'][] = ['place', 'region', 'method', 'time', 'season', 'weather', 'encounter', 'held']
/**
 * Which kinds of term a bare name means when it could mean several: those of the
 * first list here that has one. Filters on Pokémon come before filters on moves and
 * encounters, and last come the kinds whose names are mostly also something else's:
 * egg groups (Fairy, Ditto), encounter methods (Surf, Flying), and weathers (Sandstorm).
 */
const PRECEDENCE: Term['kind'][][] = [[], ['move', 'moveType', 'category', 'flag', 'learn', 'place', 'region', 'time', 'season', 'encounter'], ['eggGroup', 'method', 'weather']]
/** The kind of group a term belongs in, if it is a filter on moves or on encounters. */
export const scopeOf = (term: Term): Scope | undefined =>
  (MOVE_KINDS.includes(term.kind) ? 'move' : ENCOUNTER_KINDS.includes(term.kind) ? 'encounter' : undefined)

const precedence = (term: Term) => Math.max(0, PRECEDENCE.findIndex((kinds) => kinds.includes(term.kind)))

const LEARN_NAMES: Record<string, string[]> = {
  levelup: ['Level up', 'by level up', 'by level'], tm: ['TM', 'by tm'], tr: ['TR', 'by tr'], egg: ['Egg move', 'by egg', 'by breeding'],
  tutor: ['Tutor', 'by tutor'], evolve: ['On evolving', 'on evolution'], reminder: ['Move reminder', 'by move reminder'],
  event: ['Event', 'by event'], purify: ['Purification', 'by purification'], form: ['Form change', 'by form change'],
  zcrystal: ['Z-Crystal', 'with a z crystal', 'z move'], dynamax: ['Dynamax', 'when dynamaxed', 'max move'],
}
/** Encounter methods whose names are not their slugs in title case. */
const METHOD_NAMES: Record<string, string> = { 'sos': 'SOS', 'dexnav': 'DexNav', 'poke-pelago': 'Poké Pelago', 'in-game-trade': 'In-game trade', 'interact': 'Static' }

// Per tag, the name shown and then others it is typed by.
const TAG_NAMES: Record<Tag, string[]> = {
  'legendary': ['Legendary'], 'mythical': ['Mythical'], 'pseudo-legendary': ['Pseudo-Legendary', 'pseudolegendary', 'pseudo'],
  'ultra-beast': ['Ultra Beast', 'ultrabeast', 'ub'], 'paradox': ['Paradox', 'paradox pokemon'], 'mega': ['Mega Evolution', 'mega', 'mega evolved'],
}

const TRAIT_NAMES: Record<(typeof ENCOUNTER_TRAITS)[number], string[]> = {
  'alpha': ['Alpha'], 'shiny-locked': ['Shiny locked'], 'hidden-ability': ['Hidden Ability encounter'], 'gigantamax': ['Gigantamax raid'],
}

// Per gender, the name shown and then others it is typed by.
const GENDER_NAMES: Record<Gender, string[]> = {
  'male-only': ['100% ♂', 'always male', 'male only', 'all male'], 'female-only': ['100% ♀', 'always female', 'female only', 'all female'], 'genderless': ['Genderless', 'no gender'],
}

const RELATION_PHRASES: Record<Relation, string> = { weak: 'weak to', resists: 'resists', immune: 'immune to', neutral: 'neutral to' }

// Per state, the name shown and then others it is typed by. "Not fully evolved" cannot be typed: `not` is an operator.
const EVOLUTION_STATE_NAMES: Record<EvolutionState, string[]> = {
  'nfe': ['Can evolve', 'nfe'], 'fully-evolved': ['Fully evolved', 'final stage'],
  'basic': ['Basic', 'unevolved', 'first stage'], 'evolved': ['Evolved'],
}
// Per time, the name shown and then others it is typed by after "evolves".
const EVOLUTION_TIME_NAMES: Record<EvolutionTime, string[]> = { night: ['at night', 'by night'], day: ['during the day', 'by day'], rain: ['in rain', 'during rain'] }
const TRIGGER_NAMES: Record<(typeof EVOLUTION_TRIGGERS)[number], string> = {
  level: 'by level', item: 'by item', trade: 'by trade', friendship: 'by friendship', move: 'by move', hold: 'by held item', other: 'by other means',
}

/** English names of games that are not their slugs in title case. */
const GAME_NAMES: Record<string, string> = {
  'firered': 'FireRed', 'leafgreen': 'LeafGreen', 'heartgold': 'HeartGold', 'soulsilver': 'SoulSilver', 'xd': 'XD',
  'lets-go-pikachu': 'Let’s Go, Pikachu!', 'lets-go-eevee': 'Let’s Go, Eevee!', 'legends-arceus': 'Legends: Arceus', 'legends-z-a': 'Legends: Z-A',
}
/** The English name of a form on its own: the data's, with a gender in brackets ("Mega (Male)") as its sign. */
export const formName = (form: { form: string; formName: string | null }) =>
  (form.formName ?? titleCase(form.form)).replace(/ \((Male|Female)\)$/, (_, gender: string) => (gender === 'Male' ? ' ♂' : ' ♀'))

/** The English name of the game, or of the DLC, with the slug `slug`. */
export const gameName = (slug: string) => GAME_NAMES[slug] ?? titleCase(slug)

/** What games and version groups are written as for short, by slug. */
const GAME_ABBREVIATIONS: Record<string, string[]> = {
  'red-blue': ['rb'], 'gold-silver': ['gs'], 'ruby-sapphire': ['rs'], 'firered-leafgreen': ['frlg'], 'diamond-pearl': ['dp'],
  'heartgold-soulsilver': ['hgss'], 'black-white': ['bw'], 'black-2-white-2': ['b2w2', 'bw2'], 'x-y': ['xy'], 'omega-ruby-alpha-sapphire': ['oras'],
  'sun-moon': ['sm'], 'ultra-sun-ultra-moon': ['usum'], 'lets-go-pikachu-lets-go-eevee': ['lgpe'], 'sword-shield': ['swsh'],
  'brilliant-diamond-shining-pearl': ['bdsp'], 'scarlet-violet': ['sv'], 'legends-arceus': ['la', 'pla'], 'legends-z-a': ['lza', 'za'],
}

/**
 * The name of a group of games: those of its games, as `name` gives them, joined
 * ("FireRed & LeafGreen"), or a DLC's own name, which its games' names repeat.
 */
export function groupName(group: string, games: string[], name: (game: string) => string): string {
  if (games.length > 1 && games.every((game) => game.startsWith(group))) return gameName(group)
  const names = games.map(name)
  return names.length < 3 ? names.join(' & ') : `${names.slice(0, -1).join(', ')} & ${names.at(-1)}`
}

const ROMAN = ['', 'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii']
const titleCase = (slug: string) => slug.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')

/**
 * The names by which the terms of `dataset` can be written in a query: the English
 * ones and those of `translations`, which are also the names shown.
 */
export function buildNameTable(dataset: Dataset, translations: Translations = {}): NameTable {
  const { meta, forms } = dataset.bundle
  const entries: NameEntry[] = []
  function add(term: Term, display: string, names: string[], prefixedNames: string[] = [], scopedNames: string[] = []) {
    const distinct = (list: string[]) => [...new Set(list.map(normalize))].filter((name) => name !== '')
    entries.push({ term, display, names: distinct(names), prefixedNames: distinct(prefixedNames), scopedNames: distinct(scopedNames) })
  }

  // The name to show for what `key` names, which is `english` unless translated.
  const shown = (key: string, english: string) => translations[key] ?? english

  for (const type of TYPES) {
    const name = shown(`type:${type}`, titleCase(type))
    add({ kind: 'type', type }, name, [type, name])
    for (const relation of RELATIONS) {
      const phrase = RELATION_PHRASES[relation]
      add({ kind: 'matchup', relation, type }, name, [`${phrase} ${type}`, `${relation} ${type}`, `${phrase} ${name}`], [type, name])
    }
  }
  for (const type of TYPES) {
    const name = shown(`type:${type}`, titleCase(type))
    add({ kind: 'moveType', type }, name, [`${type} move`, `${type} type move`, `${name} move`], [type, name], [type, name])
  }
  for (const category of MOVE_CATEGORIES) add({ kind: 'category', category }, titleCase(category), [category, `${category} move`], [category])
  for (const flag of new Set(dataset.bundle.moves.flatMap((move) => move.flags.map(flagSlug)))) {
    add({ kind: 'flag', flag }, titleCase(flag), [`${flag} move`], [flag], [flag])
  }
  for (const method of Object.values(meta.learnMethods)) {
    const [english, ...others] = LEARN_NAMES[method] ?? [titleCase(method)]
    const display = shown(`learn:${method}`, english!)
    add({ kind: 'learn', method }, display, [...others, display], [method, english!, display])
  }
  for (const { slug, name } of dataset.bundle.moves) add({ kind: 'move', move: slug }, shown(`move:${slug}`, name), [name, slug, shown(`move:${slug}`, name)])

  const { places } = dataset.bundle
  const regionNames = new Map(places.map((place) => [place.region, shown(`region:${place.region}`, place.regionName)]))
  for (const [region, regionName] of regionNames) add({ kind: 'region', region }, regionName, [regionName, places.find((place) => place.region === region)!.regionName], [region])
  for (const place of places) {
    const parent = place.parent === null ? null : places[place.parent]!
    const regionName = regionNames.get(place.region)!
    // The names of parts of locations are not translated.
    const located = (name: string) => shown(`place:${place.region}/${(parent ?? place).slug}`, name)
    if (parent === null) {
      const key = `${place.region}/${place.slug}`
      const name = located(place.name)
      add({ kind: 'place', place: key }, `${name} (${regionName})`, [place.name, `${place.regionName} ${place.name}`, name, `${regionName} ${name}`], [key])
    } else {
      const key = `${place.region}/${parent.slug}/${place.slug}`
      const [english, name] = [`${parent.name} ${place.name}`, `${located(parent.name)} ${place.name}`]
      add({ kind: 'place', place: key }, `${located(parent.name)}: ${place.name} (${regionName})`, [english, `${place.regionName} ${english}`, name, `${regionName} ${name}`], [key])
    }
  }
  const vocabulary = encounterVocabulary(dataset)
  for (const method of vocabulary.methods) {
    const name = shown(`method:${method}`, METHOD_NAMES[method] ?? titleCase(method))
    const english = METHOD_NAMES[method] ?? titleCase(method)
    add({ kind: 'method', method }, name, [method, english], [method, english, name], [method, english, name])
  }
  for (const time of vocabulary.times) {
    const name = shown(`time:${time}`, titleCase(time))
    add({ kind: 'time', time }, name, [time, `at ${time}`, name], [time, name])
    add({ kind: 'time', time, only: true }, name, [`only at ${time}`, `only ${time}`, `${time} only`], [time, name])
  }
  for (const season of vocabulary.seasons) {
    const name = shown(`season:${season}`, titleCase(season))
    add({ kind: 'season', season }, name, [season, `in ${season}`, name], [season, name])
    add({ kind: 'season', season, only: true }, name, [`only in ${season}`, `only ${season}`, `${season} only`], [season, name])
  }
  for (const weather of vocabulary.weathers) {
    // A weather is also typed by the names of those merged into it.
    const typed = [weather, ...Object.keys(WEATHER_MERGES).filter((merged) => WEATHER_MERGES[merged] === weather)]
    const name = shown(`weather:${weather}`, titleCase(weather))
    add({ kind: 'weather', weather }, name, [...typed, name], [...typed, name], [...typed, name])
    add({ kind: 'weather', weather, only: true }, name, typed.flatMap((typedName) => [`only in ${typedName}`, `only ${typedName}`, `${typedName} only`]), [...typed, name])
  }
  for (const trait of ENCOUNTER_TRAITS) {
    const name = shown(`trait:${trait}`, TRAIT_NAMES[trait][0]!)
    add({ kind: 'encounter', trait }, name, [...TRAIT_NAMES[trait], name], [trait, name], [trait, name])
  }

  for (const { slug, name } of meta.abilities) add({ kind: 'ability', ability: slug }, shown(`ability:${slug}`, name), [name, slug, shown(`ability:${slug}`, name)])
  for (const group of new Set(forms.flatMap((f) => f.eggGroups ?? []))) {
    const slug = slugify(group)
    add({ kind: 'eggGroup', group: slug }, shown(`egg:${slug}`, group), [group, shown(`egg:${slug}`, group)])
  }
  // A value of a fixed set, named in English by `english` and those after it, is also named as translated.
  const fixed = (key: string, [english, ...others]: string[]) => {
    const name = shown(key, english!)
    return { name, typed: [english!, ...others, name] }
  }
  // `obtainable` is a filter whether or not the data has a status of that name.
  const statuses = [...meta.obtainStatuses, ...(meta.obtainStatuses.some((status) => slugify(status) === 'obtainable') ? [] : ['Obtainable'])]
    .filter((status) => Object.hasOwn(OBTAIN_NAMES, slugify(status)))
  for (const status of statuses) {
    const { name, typed } = fixed(`obtain:${slugify(status)}`, OBTAIN_NAMES[slugify(status)]!)
    add({ kind: 'obtain', status: slugify(status) }, name, [...typed, status], [slugify(status), name])
  }
  for (const tag of TAGS) {
    const { name, typed } = fixed(`tag:${tag}`, TAG_NAMES[tag])
    add({ kind: 'tag', tag }, name, typed, [tag, name])
  }
  for (const gender of GENDERS) {
    const { name, typed } = fixed(`gender:${gender}`, GENDER_NAMES[gender])
    add({ kind: 'gender', gender }, name, typed, [gender, name])
  }
  for (const state of EVOLUTION_STATES) {
    const { name, typed } = fixed(`state:${state}`, EVOLUTION_STATE_NAMES[state])
    add({ kind: 'evolution', state }, name, typed, [state, name])
  }
  for (const trigger of EVOLUTION_TRIGGERS) {
    const name = shown(`trigger:${trigger}`, TRIGGER_NAMES[trigger])
    add({ kind: 'evolves', trigger }, name, [`evolves ${TRIGGER_NAMES[trigger]}`], [trigger, TRIGGER_NAMES[trigger], name])
  }
  for (const when of EVOLUTION_TIMES) {
    const typed = EVOLUTION_TIME_NAMES[when]
    const name = shown(`when:${when}`, typed[0]!)
    add({ kind: 'evolves', when }, name, typed.map((english) => `evolves ${english}`), [when, ...typed, name])
  }
  for (const id of new Set(dataset.bundle.evolutions.flatMap((evolution) => evolution.move ?? []))) {
    const move = dataset.bundle.moves[id]!
    const name = shown(`move:${move.slug}`, move.name)
    add({ kind: 'evolves', move: move.slug }, name, [`evolves knowing ${move.name}`, `evolves knowing ${name}`], [move.name, move.slug, name])
  }
  for (const rate of new Set(forms.map((form) => form.growthRate))) {
    const { name, typed } = fixed(`growth:${slugify(rate)}`, [rate, `${rate} growth`, `${rate} growth rate`])
    add({ kind: 'growth', rate: slugify(rate) }, name, typed, [slugify(rate), rate, name])
  }
  add({ kind: 'has', what: 'held-item' }, shown('has:held-item', 'Wild held item'), [shown('has:held-item', 'Wild held item'), 'has a held item', 'has held item', 'holds an item', 'holding an item', 'wild held item'], ['held-item', 'held item', 'item'])
  add({ kind: 'has', what: 'hidden-ability' }, shown('has:hidden-ability', 'Hidden ability'), [shown('has:hidden-ability', 'Hidden ability'), 'has a hidden ability', 'has hidden ability'], ['hidden-ability', 'hidden ability', 'hidden'])
  // Items held in the wild have their names; those of encounters only their slugs.
  const held = new Map([...vocabulary.held.map((item) => [item, titleCase(item)] as const), ...forms.flatMap((form) => form.heldItems.map(([item]) => [slugify(item), item] as const))])
  for (const [item, english] of held) {
    const name = shown(`item:${item}`, english)
    add({ kind: 'held', item }, name, [`holding ${english}`, `holds ${english}`, `holding ${name}`, `holds ${name}`], [item, english, name], [english, name])
  }
  for (const item of new Set(dataset.bundle.evolutions.flatMap((evolution) => evolution.item ?? []))) {
    const name = shown(`item:${slugify(item)}`, item)
    add({ kind: 'evolves', item: slugify(item) }, name, [`evolves with ${item}`, `evolves with ${name}`], [item, slugify(item), name])
  }

  const shownGame = (slug: string) => shown(`game:${slug}`, gameName(slug))
  for (const { slug } of meta.games) add({ kind: 'game', game: slug }, shownGame(slug), [slug, gameName(slug), shownGame(slug), ...(GAME_ABBREVIATIONS[slug] ?? [])])
  for (const generation of new Set(meta.games.map((g) => g.generation))) {
    const numerals = [String(generation), ROMAN[generation] ?? String(generation)]
    add({ kind: 'generation', generation }, `Generation ${numerals[1]!.toUpperCase()}`,
      numerals.flatMap((n) => [`gen ${n}`, `generation ${n}`]), numerals)
    // Not every generation of games introduced forms: Colosseum alone would not have.
    if (dataset.introduced.includes(generation)) {
      add({ kind: 'introduced', generation }, `Generation ${numerals[1]!.toUpperCase()}`,
        numerals.flatMap((n) => [`introduced in gen ${n}`, `introduced in generation ${n}`, `introduced gen ${n}`, `introduced in ${n}`]), numerals)
    }
  }
  // A version group of one game selects the same pairs as that game.
  const groupGames = new Map<string, string[]>()
  for (const game of meta.games) groupGames.set(game.versionGroup, [...(groupGames.get(game.versionGroup) ?? []), game.slug])
  const groupNames = (group: string, games: string[]) => [...new Set([gameName, shownGame].map((name) => groupName(group, games, name)))]
  for (const [versionGroup, games] of groupGames) {
    if (games.length === 1) continue
    const names = groupNames(versionGroup, games)
    add({ kind: 'versionGroup', versionGroup }, names.at(-1)!, [versionGroup, titleCase(versionGroup), ...names, ...(GAME_ABBREVIATIONS[versionGroup] ?? [])])
  }
  for (const [abbreviation, groups] of Object.entries(COMBINED_GROUPS)) {
    if (!groups.every((group) => groupGames.has(group))) continue
    const names = groupNames(abbreviation, groups.flatMap((group) => groupGames.get(group)!))
    add({ kind: 'versionGroup', versionGroup: abbreviation }, names.at(-1)!, [abbreviation, ...names])
  }

  // Available in some way in a game, or in the games of a generation or a group: named as the games are, after the prefix.
  const selectors = entries.filter((entry) => entry.term.kind === 'game' || entry.term.kind === 'generation' || entry.term.kind === 'versionGroup')
  for (const status of statuses.map(slugify)) {
    // Also by "catchable in Scarlet", in so many words.
    const ways = [status, OBTAIN_NAMES[status]![0]!]
    for (const entry of selectors) {
      const term: Term = { kind: 'obtain', status, in: entry.term as GameTerm }
      add(term, entry.display, ways.flatMap((way) => entry.names.map((name) => `${way} in ${name}`)), [print(term).slice(status.length + 1), ...entry.names, ...entry.prefixedNames])
    }
  }

  const species = new Map<string, string>()
  for (const form of forms) {
    species.set(form.species, form.name)
    const id = `${form.species}/${form.form}`
    const name = shown(`species:${form.species}`, form.name)
    if (form.form === 'none') {
      add({ kind: 'form', species: form.species, form: form.form }, name, [], [id])
    } else {
      const english = formName(form)
      const shownName = shown(`form:${id}`, english)
      // A form name of punctuation alone (Unown's "!") is typed as its slug.
      const typed = (label: string) => (normalize(label) === '' ? titleCase(form.form) : label)
      add({ kind: 'form', species: form.species, form: form.form }, `${name} (${shownName})`,
        [`${form.name} ${typed(english)}`, `${typed(english)} ${form.name}`, id, `${name} ${typed(shownName)}`, `${typed(shownName)} ${name}`])
    }
  }
  for (const [slug, name] of species) add({ kind: 'species', species: slug }, shown(`species:${slug}`, name), [name, slug, shown(`species:${slug}`, name)])

  const bare = new Map<string, Term[]>()
  const byKind = new Map<string, Term[]>()
  const scoped = new Map<string, Term[]>()
  const scopedOnly = new Map<string, Term[]>()
  const index = (map: Map<string, Term[]>, key: string, term: Term) => {
    const terms = map.get(key)
    if (terms) terms.push(term)
    else map.set(key, [term])
  }
  let maxWords = 1
  for (const { term, names, prefixedNames, scopedNames } of entries) {
    for (const name of names) index(bare, name, term)
    const scope = scopeOf(term)
    // A name the term has anywhere comes before one it has only inside the group: in `move(bite)`, the move, not the flag.
    for (const name of scope ? names : []) index(scoped, `${scope}:${name}`, term)
    for (const name of scope ? scopedNames.filter((scopedName) => !names.includes(scopedName)) : []) index(scopedOnly, `${scope}:${name}`, term)
    for (const name of [...names, ...prefixedNames]) {
      index(byKind, `${term.kind}:${name}`, term)
      maxWords = Math.max(maxWords, name.split(' ').length)
    }
  }

  function find(name: string, prefix?: string, scope?: Scope): Term[] {
    if (prefix === undefined) {
      const inScope = scope === undefined ? undefined : (scoped.get(`${scope}:${name}`) ?? scopedOnly.get(`${scope}:${name}`))
      if (inScope) return inScope
      const terms = bare.get(name) ?? []
      const first = Math.min(...terms.map(precedence))
      return terms.filter((term) => precedence(term) === first)
    }
    const { kind, otherKinds = [], accepts, adjust } = PREFIXES[prefix]!
    const terms = [kind, ...otherKinds].flatMap((k) => byKind.get(`${k}:${name}`) ?? []).filter((term) => accepts?.(term) ?? true)
    return adjust ? terms.map(adjust) : terms
  }
  const displays = new Map(entries.map((entry) => [print(entry.term), entry.display]))
  function display(term: Term): string {
    const plain = term.kind === 'ability' ? { kind: term.kind, ability: term.ability }
      : term.kind === 'matchup' ? { kind: term.kind, relation: term.relation, type: term.type } : term
    const name = displays.get(print(plain))
    if (name === undefined) throw new Error(`no name for ${print(term)}`)
    return name
  }
  const canonical = new Map(entries.map((entry) => [print(entry.term), entry.term]))
  return { entries, display, exact: (text) => canonical.get(text), maxWords, find }
}
