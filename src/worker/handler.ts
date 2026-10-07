import { valueIn, type Dataset } from '../data/dataset.ts'
import { TYPES, type DexEntry, type Evolution, type Images } from '../data/schema.ts'
import type { Language, Translations } from '../i18n/languages.ts'
import { translator } from '../i18n/ui.ts'
import { SPAWN_METHOD, encounterVocabulary, weatherSlug, type Encounter } from '../engine/encounters.ts'
import { DLC_BASE, createEngine, slugify } from '../engine/engine.ts'
import type { Scope } from '../engine/expr.ts'
import { formsOf } from '../engine/pairset.ts'
import { buildNameTable, formName, gameName, groupName } from '../query/names.ts'
import { describe } from '../query/describe.ts'
import { parse } from '../query/parser.ts'
import { suggest } from '../query/suggest.ts'
import { tokensOf } from '../query/tokens.ts'
import type { Answers, Detail, EncounterDetail, EvolutionStage, MoveDetail, ReadyData, Request, Row } from './protocol.ts'

export interface Handler {
  /** What the page shows of the data, in the current language. */
  ready(): ReadyData
  /** Name everything in `language`, whose names are `translations`. */
  setLanguage(language: Language, translations: Translations): void
  answer<K extends Exclude<keyof Answers, 'language' | 'detail'>>(request: Request & { kind: K }): Answers[K]
  /** Describe a form as a match of a query; `dexEntries` are the Pokédex entries, per form id. */
  detail(request: Request, dexEntries: DexEntry[][]): Detail
}

const titleCase = (slug: string) => slug.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')

/** The worker's side of the protocol, for `dataset` and the image names `images`. Names are in English at first. */
// The ways of meeting a Pokémon whose rates are each of a group of spawners of its own, and so do not add up.
const SEPARATELY_RATED = new Set([SPAWN_METHOD, 'massive-mass-outbreak'])

// What an encounter depends on besides time, season, and weather, in words, by the data's slug for it.
function conditionName(slug: string): string {
  const named: Record<string, string> = {
    'story-progress-national-dex': 'After the National Pokédex', 'pokeradar': 'Poké Radar', 'swarm': 'Swarm',
    'radio-hoenn': 'Hoenn Sound on the radio', 'radio-sinnoh': 'Sinnoh Sound on the radio',
  }
  const [, kind, what] = /^(dual-slot|trophy-garden-daily|great-marsh-daily)-(.+)$/.exec(slug) ?? []
  if (kind === 'dual-slot') return `${gameName(what!)} in the GBA slot`
  if (kind !== undefined) return `${titleCase(kind.replace('-daily', ''))} daily: ${titleCase(what!)}`
  return named[slug] ?? titleCase(slug)
}

// The ways of meeting a Pokémon that is there for certain: given, traded, standing in its place, or roaming.
const FIXED_METHODS = new Set(['gift', 'in-game-trade', 'interact', 'roaming', 'island-scan'])

// The stats as the interface's text has them, in the data's order.
const STAT_ABBREVIATIONS = ['HP', 'Atk', 'Def', 'SpA', 'SpD', 'Spe']

export function createHandler(dataset: Dataset, images: Images): Handler {
  const { meta, forms } = dataset.bundle
  const engine = createEngine(dataset)
  let language: Language = 'en'
  let translations: Translations = {}
  let names = buildNameTable(dataset)

  const groupSlugs = [...new Set(meta.games.map((game) => game.versionGroup))]

  function ready(): ReadyData {
    const shown = (key: string, english: string) => translations[key] ?? english
    return {
      language,
      forms: forms.map((form, id) => ({
        name: shown(`species:${form.species}`, form.name),
        formName: form.form === 'none' ? null : shown(`form:${form.species}/${form.form}`, formName(form)),
        dex: form.nationalId,
        sprite: images.sprite[id] ?? null, localSprite: images.localSprite[id] ?? null, badge: images.badge[id] ?? null, art: images.art[id] ?? null, shinyArt: images.shinyArt[id] ?? null,
        home: images.home[id] ?? null, homeShiny: images.homeShiny[id] ?? null,
      })),
      games: meta.games.map(({ slug, generation, versionGroup }) => {
        const name = shown(`game:${slug}`, gameName(slug))
        // A DLC's game is told from the other by the game it extends.
        const base = slug.startsWith(`${versionGroup}-`) ? slug.slice(versionGroup.length + 1) : null
        return { slug, name, inGroup: base === null ? name : shown(`game:${base}`, gameName(base)), generation, group: groupSlugs.indexOf(versionGroup) }
      }),
      groups: groupSlugs.map((group) => {
        const games = meta.games.flatMap((game, id) => (game.versionGroup === group ? [id] : []))
        return { name: groupName(group, games.map((id) => meta.games[id]!.slug), (slug) => shown(`game:${slug}`, gameName(slug))), games, base: groupSlugs.indexOf(DLC_BASE[group] ?? group) }
      }),
      abilities: meta.abilities.map((ability) => shown(`ability:${ability.slug}`, ability.name)),
      types: Object.fromEntries(TYPES.map((type) => [type, shown(`type:${type}`, titleCase(type))])) as ReadyData['types'],
      statNames: meta.statNames,
      hiddenSlot: meta.abilitySlots.indexOf('Hidden'),
    }
  }

  function setLanguage(to: Language, toNames: Translations) {
    language = to
    translations = toNames
    names = buildNameTable(dataset, translations)
  }
  function row(form: number, lo: number, hi: number): Row {
    const newest = (l: number, h: number) => (h !== 0 ? 63 - Math.clz32(h) : l !== 0 ? 31 - Math.clz32(l) : -1)
    // Some games have no abilities (Legends: Z-A among the newest), which would leave the row without any.
    const withAbilities = dataset.versions.abilities[form]!
      .map((version) => (version.value === null ? -1 : newest(version.lo & lo, version.hi & hi)))
    const game = Math.max(...withAbilities) >= 0 ? Math.max(...withAbilities) : newest(lo, hi)
    const differing = (['types', 'abilities', 'baseStats'] as const).some((field) =>
      dataset.versions[field][form]!.filter((version) => (version.lo & lo) !== 0 || (version.hi & hi) !== 0).length > 1)
    return {
      form, lo, hi, game, varies: differing,
      types: valueIn(dataset, 'types', form, game)!,
      abilities: valueIn(dataset, 'abilities', form, game)!,
      stats: valueIn(dataset, 'baseStats', form, game)!,
    }
  }

  const answers: { [K in Exclude<keyof Answers, 'language' | 'detail'>]: (text: string, scope?: Scope) => Answers[K] } = {
    parse(text, scope) {
      const parsed = parse(text, names, scope)
      return { tokens: tokensOf(text, parsed, names, translator(language)), diagnostics: parsed.diagnostics }
    },
    query(text) {
      const parsed = parse(text, names)
      const { expr, diagnostics } = parsed
      const pairs = engine.evaluate(expr ?? { kind: 'and', args: [] })
      const t = translator(language)
      return { diagnostics, description: describe(expr, expr === null ? new Map() : engine.readings(expr), names, translations, t), rows: formsOf(pairs).map((form) => row(form, pairs[2 * form]!, pairs[2 * form + 1]!)) }
    },
    suggest: (text, scope) => suggest(text, names, scope, undefined, translator(language)),
  }
  function answer<K extends Exclude<keyof Answers, 'language' | 'detail'>>(request: Request & { kind: K }): Answers[K] {
    return answers[request.kind](request.text, request.scope)
  }
  const gamesOfMask = (lo: number, hi: number) => meta.games.flatMap((_, game) => ((((game < 32 ? lo : hi) >>> (game & 31)) & 1) === 1 ? [game] : []))
  // The times of day in the order of the day, and those that each game has encounters tied to.
  const timeOrder = ['morning', 'day', 'evening', 'night'].filter((time) => encounterVocabulary(dataset).times.includes(time))
  const gameTimes = meta.games.map(() => new Set<string>())
  {
    const { strings, encounters, spawners } = dataset.bundle.encounters
    const note = (time: number | null, gameSet: number) => {
      if (time !== null) meta.gameSets[gameSet]!.forEach((game) => gameTimes[game]!.add(strings[time]!))
    }
    encounters.time.forEach((time, row) => note(time, encounters.games[row]!))
    spawners.times.forEach((times, row) => times.forEach((time) => note(time, spawners.games[row]!)))
  }
  // Likewise the seasons of each game, and the weathers of each place in each game.
  const seasonOrder = ['spring', 'summer', 'autumn', 'winter']
  const gameSeasons = meta.games.map(() => new Set<string>())
  const placeWeathers = new Map<number, Set<string>[]>()
  {
    const { strings, encounters, spawners } = dataset.bundle.encounters
    encounters.seasons.forEach((seasons, row) => seasons?.forEach((season) => meta.gameSets[encounters.games[row]!]!.forEach((game) => gameSeasons[game]!.add(strings[season]!))))
    const note = (place: number, weather: number | null, gameSet: number) => {
      if (weather === null) return
      if (!placeWeathers.has(place)) placeWeathers.set(place, meta.games.map(() => new Set()))
      meta.gameSets[gameSet]!.forEach((game) => placeWeathers.get(place)![game]!.add(weatherSlug(strings[weather]!)))
    }
    encounters.weather.forEach((weather, row) => note(encounters.place[row]!, weather, encounters.games[row]!))
    spawners.weathers.forEach((weathers, row) => weathers?.forEach((weather) => note(spawners.place[row]!, weather, spawners.games[row]!)))
  }
  const placeKeys = dataset.bundle.places.map((p) => (p.parent === null ? `${p.region}/${p.slug}` : `${p.region}/${dataset.bundle.places[p.parent]!.slug}/${p.slug}`))

  // How an evolution comes about, in words.
  function how(step: Evolution): string {
    const t = translator(language)
    const move = step.move === null ? '' : names.display({ kind: 'move', move: dataset.bundle.moves[step.move]!.slug })
    const item = step.item === null ? '' : names.display({ kind: 'evolves', item: slugify(step.item) })
    const condition = step.condition && (translations[`condition:${step.condition}`] ?? step.condition)
    const by = {
      level: step.level === null ? t('Level up') : t('Lv. {level}', { level: step.level }), item: t('Use {item}', { item }),
      trade: step.item === null ? t('Trade') : t('Trade holding {item}', { item }), friendship: t('Level up with high friendship'),
      move: t('Level up knowing {move}', { move }), hold: t('Level up holding {item}', { item }), other: condition ?? t('Special'),
    }[step.trigger]
    return condition !== null && step.trigger !== 'other' ? `${by} (${condition})` : by
  }

  function detail(request: Request, dexEntries: DexEntry[][]): Detail {
    const { form, lo = 0, hi = 0 } = request
    if (form === undefined || forms[form] === undefined) throw new Error(`no form ${form}`)
    const { expr } = parse(request.text, names)
    const t = translator(language)
    const valueIn = <T>(versions: { lo: number; hi: number; value: T }[], game: number) =>
      versions.find((version) => (((game < 32 ? version.lo : version.hi) >>> (game & 31)) & 1) === 1)?.value

    // What an encounter shares with the other slots of its table.
    const describe = (encounter: Encounter) => {
      const region = names.display({ kind: 'region', region: dataset.bundle.places[encounter.place]!.region })
      const place = names.display({ kind: 'place', place: placeKeys[encounter.place]! })
      // A place is named with its region after it, in brackets.
      if (!place.endsWith(` (${region})`)) throw new Error(`the place "${place}" is not named with its region, "${region}"`)
      return describeIn(encounter, place.slice(0, -region.length - 3), region)
    }
    const describeIn = (encounter: Encounter, place: string, region: string) => ({
      place, region,
      method: names.display({ kind: 'method', method: encounter.method }),
      // The times of day, the seasons, and the weathers it is tied to, apart from the other conditions:
      // encounters that differ in one of these alone are shown as one.
      times: encounter.times, seasons: encounter.seasons, weathers: encounter.weathers, placeId: encounter.place,
      conditions: [
        ...encounter.traits.map((trait) => names.display({ kind: 'encounter', trait })),
        ...(encounter.held === null ? [] : [`${names.display({ kind: 'held', item: encounter.held })} (held)`]),
        // That it is an alpha is already among its traits.
        ...encounter.conditions.filter((condition) => condition !== 'alpha').map(conditionName),
        // A table with a name of its own (a room, a floor) is told by it.
        ...(encounter.table === null || /^table-/.test(encounter.table) ? [] : [titleCase(encounter.table)]),
        ...(encounter.stars ? [`${encounter.stars.join('/')}★`] : []),
      ],
      games: gamesOfMask(encounter.lo, encounter.hi),
    })
    const levels = (min: number, max: number) => (min === max ? String(min) : `${min}–${max}`)
    const percent = (rate: number | null) => (rate === null ? null : `${Math.round(rate * 100) / 100}%`)
    const slotKey = (encounter: Encounter) => JSON.stringify([encounter.place, encounter.method, encounter.minLevel, encounter.maxLevel, encounter.rate,
      encounter.times, encounter.seasons, encounter.weathers, encounter.traits, encounter.stars])

    const groups = groupSlugs.flatMap((slug, group): Detail['groups'] => {
      // Those of the games of the version groups given that the form is present in.
      const presentIn = (inGroups: (versionGroup: string) => boolean) => {
        let [groupLo, groupHi] = [0, 0]
        meta.games.forEach((game, id) => {
          if (!inGroups(game.versionGroup)) return
          if (id < 32) groupLo |= 1 << id
          else groupHi |= 1 << (id - 32)
        })
        return Uint32Array.of(groupLo & dataset.exists[2 * form]!, groupHi & dataset.exists[2 * form + 1]!)
      }
      const present = presentIn((versionGroup) => versionGroup === slug)
      // The games whose learnsets are shown with the group's: its own and those of its DLC. None, for a DLC.
      const learning = presentIn((versionGroup) => (DLC_BASE[versionGroup] ?? versionGroup) === slug)
      if (learning[0] === 0 && learning[1] === 0 && present[0] === 0 && present[1] === 0) return []
      // Everything of the form in the games given, and what of it the query selects in the games it matches in.
      const explained = (games: Uint32Array) => ({
        all: engine.explain(null, form, games),
        selected: expr === null ? { encounters: [], learned: [] } : engine.explain(expr, form, Uint32Array.of(games[0]! & lo, games[1]! & hi)),
      })
      const { all, selected } = explained(present)
      const learned = learning[0] === present[0] && learning[1] === present[1] ? { all, selected } : explained(learning)
      const encounterGroups = expr !== null && selected.encounters.length < all.encounters.length
      const selectedEncounters = new Set(selected.encounters.map(slotKey))
      const selectedMoves = new Set(learned.selected.learned.map((way) => way.move))

      // The slots of one table are shown as one encounter, which opens into them.
      const tables = new Map<string, { shared: ReturnType<typeof describe>; slots: Encounter[] }>()
      for (const encounter of all.encounters) {
        const shared = describe(encounter)
        // Rates add up within one table, not across the tables of a place.
        const text = JSON.stringify([shared, encounter.table])
        const table = tables.get(text)
        if (table) table.slots.push(encounter)
        else tables.set(text, { shared, slots: [encounter] })
      }
      // By region, in the order the regions first come in.
      const regions = [...new Set([...tables.values()].map(({ shared }) => shared.region))]
      const rows = [...tables.values()].sort((a, b) => regions.indexOf(a.shared.region) - regions.indexOf(b.shared.region)).map(({ shared, slots }) => {
        const matching = slots.map((slot) => encounterGroups && selectedEncounters.has(slotKey(slot)))
        // An encounter that is always there is not a matter of chance: the data gives each 100%, which do not add up.
        const fixed = FIXED_METHODS.has(slots[0]!.method)
        const rates = fixed ? [] : slots.flatMap((slot) => (slot.rate === null ? [] : [slot.rate]))
        // Overworld spawns and outbreaks are rated per group of spawners, each on its own: the lowest and the highest are given.
        const apart = SEPARATELY_RATED.has(slots[0]!.method)
        const total = rates.length === 0 ? null : apart
          ? [...new Set([Math.min(...rates), Math.max(...rates)])].map((rate) => Math.round(rate * 100) / 100).join('–') + '%'
          : percent(rates.reduce((sum, rate) => sum + rate, 0))
        return {
          ...shared,
          levels: levels(Math.min(...slots.map((slot) => slot.minLevel)), Math.max(...slots.map((slot) => slot.maxLevel))),
          rate: total,
          matches: matching.some(Boolean),
          slots: slots.length === 1 ? [] : slots.map((slot, i) => ({ levels: levels(slot.minLevel, slot.maxLevel), rate: fixed ? null : percent(slot.rate), matches: matching[i]! })),
        }
      })
      // Encounters that are the same at several times of day are one, at those times; likewise of seasons, and
      // of weathers. At all the times or seasons that the games have, or all the weathers that the place has
      // in them, it is at none in particular.
      const mergedOn = (rows: Row[], what: 'times' | 'seasons' | 'weathers'): Row[] => {
        const merged = new Map<string, Row>()
        for (const row of rows) {
          const key = JSON.stringify({ ...row, [what]: undefined, matches: undefined, slots: row.slots.map((slot) => [slot.levels, slot.rate]) })
          const same = merged.get(key)
          if (!same) merged.set(key, { ...row, slots: row.slots.map((slot) => ({ ...slot })) })
          else {
            same[what] = same[what] === null || row[what] === null ? null : [...new Set([...same[what], ...row[what]])]
            same.matches ||= row.matches
            same.slots.forEach((slot, i) => { slot.matches ||= row.slots[i]!.matches })
          }
        }
        return [...merged.values()]
      }
      type Row = (typeof rows)[number]
      const shown = (tied: string[] | null, all: Set<string>, order: string[], name: (slug: string) => string) =>
        (tied === null || (all.size > 0 && [...all].every((slug) => tied.includes(slug))) ? [] : [...tied].sort((a, b) => order.indexOf(a) - order.indexOf(b)).map(name))
      const inGroup = <T>(per: (game: number) => Iterable<T>, games: number[]) => new Set(games.flatMap((game) => [...per(game)]))
      const encounters = mergedOn(mergedOn(mergedOn(rows, 'times'), 'seasons'), 'weathers').map(({ times, seasons, weathers, placeId, conditions, ...row }): EncounterDetail => ({
        ...row,
        conditions: [
          ...shown(times, inGroup((game) => gameTimes[game]!, row.games), timeOrder, (time) => names.display({ kind: 'time', time })),
          ...shown(seasons, inGroup((game) => gameSeasons[game]!, row.games), seasonOrder, (season) => names.display({ kind: 'season', season })),
          ...shown(weathers, inGroup((game) => [...(placeWeathers.get(placeId)?.[game] ?? [])].filter((weather) => weather !== 'all-weather'), row.games), [], (weather) => names.display({ kind: 'weather', weather })),
          ...conditions,
        ],
      }))

      const latest = gamesOfMask(learning[0]!, learning[1]!).at(-1)
      const moves = new Map<number, MoveDetail & { level: number }>()
      for (const way of learned.all.learned) {
        if (latest === undefined) throw new Error(`a move is learned in none of the games of "${slug}"`)
        const move = dataset.bundle.moves[way.move]!
        const entry = moves.get(way.move) ?? {
          name: names.display({ kind: 'move', move: move.slug }), type: valueIn(dataset.moveVersions.type[way.move]!, latest) ?? move.type,
          category: valueIn(dataset.moveVersions.category[way.move]!, latest) ?? move.category,
          power: valueIn(dataset.moveVersions.power[way.move]!, latest) ?? move.power,
          accuracy: valueIn(dataset.moveVersions.accuracy[way.move]!, latest) ?? move.accuracy,
          how: [], matches: selectedMoves.has(way.move), level: Infinity,
        }
        const method = names.display({ kind: 'learn', method: way.method })
        // A move learned at a level is so by levelling up, which goes without saying.
        const learned = way.level === null ? method : way.method === 'levelup' ? t('Lv. {level}', { level: way.level }) : `${method} ${way.level}`
        entry.how = [...new Set([...entry.how, learned])]
        if (way.method === 'levelup') entry.level = Math.min(entry.level, way.level ?? 0)
        moves.set(way.move, entry)
      }
      // Moves learned by level come first, in the order they are learned.
      const ordered = [...moves.values()].sort((a, b) => (a.level === b.level ? a.name.localeCompare(b.name) : a.level - b.level))
      return [{ group, encounters, moves: ordered.map(({ level: _level, ...move }) => move) }]
    })

    const record = forms[form]!
    const game = request.game ?? (hi !== 0 ? 63 - Math.clz32(hi) : 31 - Math.clz32(lo))
    const evYield = valueIn(dataset.versions.evYield[form]!, game)
    const fact = (label: string, value: string | number | null | undefined) => (value === null || value === undefined || value === '' ? [] : [{ label, value: String(value) }])
    const facts = [
      ...fact('Height', `${record.height} m`),
      ...fact('Weight', record.weight === null ? null : `${record.weight} kg`),
      ...fact('Gender', record.genderRatio === null ? t('Genderless')
        : [[record.genderRatio, '♂'] as const, [100 - record.genderRatio, '♀'] as const].filter(([share]) => share > 0).map(([share, sign]) => `${share}% ${sign}`).join(', ')),
      ...fact('Egg groups', record.eggGroups?.map((group) => names.display({ kind: 'eggGroup', group: slugify(group) })).join(', ')),
      ...fact('Egg cycles', record.eggCycles),
      ...fact('Catch rate', valueIn(dataset.versions.catchRate[form]!, game)),
      ...fact('Base friendship', record.baseFriendship),
      ...fact('Base experience', valueIn(dataset.versions.baseExp[form]!, game)),
      ...fact('Growth rate', names.display({ kind: 'growth', rate: slugify(record.growthRate) })),
      ...fact('Wild held items', record.heldItems.filter(([, , gameSet]) => gamesOfMask(dataset.gameSetMasks[2 * gameSet]!, dataset.gameSetMasks[2 * gameSet + 1]!).includes(game))
        .map(([item, rate]) => `${names.display({ kind: 'held', item: slugify(item) })} (${rate}%)`).join(', ')),
      ...fact('EV yield', evYield?.flatMap((amount, stat) => (amount > 0 ? [`${amount} ${t(STAT_ABBREVIATIONS[stat]!)}`] : [])).join(', ')),
    ]

    // The line from its earliest form: a form outside it stands where the first form of its species does.
    let root = form
    const visited = new Set([root])
    for (let from = dataset.evolvesFrom[root]![0]; from !== undefined && !visited.has(from); from = dataset.evolvesFrom[from]![0]) visited.add(root = from)
    const inLine = (id: number, seen = new Set<number>()): boolean =>
      id === form || (!seen.has(id) && dataset.evolvesInto[id]!.some((to) => inLine(to, seen.add(id))))
    const stands = inLine(root) ? form : forms.findIndex((other) => other.species === record.species)
    const stage = (id: number, step: Evolution | null, seen: Set<number>): EvolutionStage => ({
      form: id, how: step && how(step), current: id === stands,
      into: seen.has(id) ? [] : dataset.bundle.evolutions.filter((next) => next.from === id).map((next) => stage(next.to, next, new Set([...seen, id]))),
    })
    const line = stage(root, null, new Set())

    return {
      form,
      classification: translations[`category:${record.species}`] ?? record.classification,
      facts,
      evolution: line.into.length === 0 ? null : line,
      groups,
      dexEntries: dexEntries[form] ?? [],
    }
  }

  return { ready, setLanguage, answer, detail }
}
