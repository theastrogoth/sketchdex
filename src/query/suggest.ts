import { translator, type Translate } from '../i18n/ui.ts'
import { KINSHIPS, SCOPES, type Scope, type Term } from '../engine/expr.ts'
import { OBTAIN_NAMES, OBTAIN_STATUSES, PREFIXES, normalize, scopeOf, type NameTable } from './names.ts'
import { ATTRIBUTE_NAMES, parse } from './parser.ts'
import { ATTRIBUTE_LABELS, leafToken, type Suggestion } from './tokens.ts'

const KIND_ORDER: Term['kind'][] = ['type', 'tag', 'gender', 'growth', 'has', 'matchup', 'species', 'ability', 'form', 'eggGroup', 'move', 'place', 'region',
  'game', 'generation', 'introduced', 'versionGroup', 'obtain', 'evolution', 'evolves', 'moveType', 'category', 'flag', 'learn', 'method',
  'time', 'season', 'weather', 'encounter', 'held']

// How well `name` answers `needle`: 0 if equal, 1 if it starts with it, 2 if one of its
// words does, 3 if it contains it, 4 if each word of `needle` is one of its words or,
// for the last, starts one ("paldea east" finds "paldea east province" before "east
// paldean sea"), 5 if each starts one of its words ("mega char" finds "charizard mega
// x"), and `undefined` otherwise.
function score(name: string, needle: string): number | undefined {
  if (name === needle) return 0
  if (name.startsWith(needle)) return 1
  if (name.includes(` ${needle}`)) return 2
  if (name.includes(needle)) return 3
  const words = name.split(' ')
  const parts = needle.split(' ')
  if (!parts.every((part) => words.some((word) => word.startsWith(part)))) return undefined
  return parts.slice(0, -1).every((part) => words.includes(part)) ? 4 : 5
}

const SCOPE_OPERANDS = { move: 'moveAttribute', encounter: 'encounterAttribute' } as const

// What else brings up the hint of a comparison: words for what it is asked of.
const HINT_WORDS: Partial<Record<string, string[]>> = { stars: ['raid', 'raid stars', 'tera raid', 'tera raid stars', 'max raid', 'max raid stars', 'dynamax raid'] }

// Hints for text that is the start of a comparison: the beginning of a word for
// something to compare, perhaps followed by a comparator but not yet by a number.
// `related` are those that the text only has to do with (`HINT_WORDS`).
function hints(typed: string, scope: Scope | undefined, t: Translate): { direct: Suggestion[]; related: Suggestion[] } {
  const match = /^([a-z]+(?: [a-z]+)*)\s*([<>=!]*)\s*$/i.exec(typed)
  if (!match) return { direct: [], related: [] }
  const [, word, comparator] = match
  const direct = new Map<string, Suggestion>()
  const related = new Map<string, Suggestion>()
  for (const [name, operand] of Object.entries(ATTRIBUTE_NAMES)) {
    if (operand.kind === 'number' || operand.kind === 'matchup') continue
    if (scope === undefined ? false : operand.kind !== SCOPE_OPERANDS[scope]) continue
    // With a comparator typed, the word is complete; without, it may be the start of one.
    const named = comparator === '' ? name.startsWith(word!.toLowerCase()) : name === word!.toLowerCase()
    const about = comparator === '' && word!.length >= 2 && (HINT_WORDS[name] ?? []).some((words) => words.startsWith(word!.toLowerCase()))
    if (!named && !about) continue
    const canonical = operand.attribute.toLowerCase()
    const group = operand.kind === 'attribute' ? 'Compare Pokémon' : operand.kind === 'moveAttribute' ? 'Compare moves' : 'Compare encounters'
    ;(named ? direct : related).set(canonical, { kind: 'hint', draft: `${canonical} ${comparator === '' ? '>=' : comparator} `, label: `${t(ATTRIBUTE_LABELS[operand.attribute])} ${comparator === '' ? '≥' : comparator} …`, group })
  }
  return { direct: [...direct.values()], related: [...related].filter(([canonical]) => !direct.has(canonical)).map(([, hint]) => hint) }
}

/**
 * The filters that the text being typed could be completing, best first: those with a
 * name containing it (after a prefix such as `egg:`, those of that kind only), and the
 * comparison it spells out, if any; and for the start of the name of something to
 * compare (`pow`, `speed`), a hint of the comparison to go on to; and for the start
 * of a group's name (`mov`), the group's opening. For text typed
 * inside a group of `scope`, only what belongs in such a group, by the names it has
 * there.
 */
export function suggest(text: string, names: NameTable, scope?: Scope, limit = 20, t: Translate = translator('en')): Suggestion[] {
  const typed = text.trim()
  if (typed === '') return []
  const colon = typed.indexOf(':')
  // "catchable in" goes on as `catchable:` does.
  const [, way, game] = /^(.+?)\s+in(?:\s+(.*))?$/i.exec(typed) ?? []
  const status = way === undefined ? undefined : OBTAIN_STATUSES.find((slug) => [slug, OBTAIN_NAMES[slug]![0]!].some((name) => normalize(name) === normalize(way)))
  const prefix = status ?? (colon > 0 && Object.hasOwn(PREFIXES, typed.slice(0, colon).toLowerCase()) ? typed.slice(0, colon).toLowerCase() : undefined)
  const needle = normalize(status !== undefined ? game ?? '' : prefix === undefined ? typed : typed.slice(colon + 1))
  if (needle === '' && prefix === undefined) return []

  const ranked: { term: Term; score: number }[] = []
  for (const entry of names.entries) {
    if (prefix !== undefined && ((entry.term.kind !== PREFIXES[prefix]!.kind && !PREFIXES[prefix]!.otherKinds?.includes(entry.term.kind)) || PREFIXES[prefix]!.accepts?.(entry.term) === false)) continue
    if (scope !== undefined && scopeOf(entry.term) !== scope) continue
    // The ways of being available in each game are offered after their prefix only: there is one per game otherwise.
    if (prefix === undefined && entry.term.kind === 'obtain' && entry.term.in !== undefined) continue
    let best: number | undefined
    for (const name of [...entry.names, ...(prefix === undefined ? [] : entry.prefixedNames), ...(scope === undefined ? [] : entry.scopedNames)]) {
      const s = needle === '' ? 5 : score(name, needle)
      if (s !== undefined && (best === undefined || s < best)) best = s
    }
    // A type's name alone brings up its matchups too, after everything else.
    if (best !== undefined) ranked.push({ term: entry.term, score: entry.term.kind === 'matchup' && best > 1 ? 6 : best })
  }
  // The sort is stable, so equal matches of a kind stay in the table's order (Pokédex order, for Pokémon).
  ranked.sort((a, b) => a.score - b.score || KIND_ORDER.indexOf(a.term.kind) - KIND_ORDER.indexOf(b.term.kind))

  const adjust = prefix === undefined ? undefined : PREFIXES[prefix]!.adjust
  const tokens: Suggestion[] = ranked.slice(0, limit).map(({ term }) => leafToken(adjust ? adjust(term) : term, names, t))
  const parsed = parse(typed, names, scope)
  if (parsed.expr?.kind === 'compare' && parsed.diagnostics.length === 0) return [leafToken(parsed.expr, names, t), ...tokens]
  // Groups are not nested in `move(` and `encounter(` groups, which hold filters of one kind.
  const groups = scope === undefined && typed.length >= 2
    ? [...SCOPES, ...KINSHIPS, 'anygame' as const].filter((name) => name.startsWith(typed.toLowerCase())).map((name): Suggestion => ({ kind: 'op', op: `${name}(` }))
    : []
  const { direct, related } = hints(typed, scope, t)
  // What the text only has to do with comes after the ways of meeting a Pokémon that it names.
  const methods = tokens.findIndex((token) => !(token.kind === 'leaf' && token.text.startsWith('method:')))
  const after = Math.max(1, methods < 0 ? tokens.length : methods)
  return [...groups, ...direct, ...tokens.slice(0, after), ...related, ...tokens.slice(after)]
}
