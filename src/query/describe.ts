import type { Translations } from '../i18n/languages.ts'
import type { Translate } from '../i18n/ui.ts'
import type { Reading } from '../engine/engine.ts'
import type { Expr } from '../engine/expr.ts'
import { OBTAIN_STATUSES, type NameTable } from './names.ts'
import { leafToken } from './tokens.ts'

/**
 * How a filter reads after "A Pokémon that", by the group its token is in
 * (`QueryToken.group`, without what follows it in brackets); `{x}` stands for the
 * filter's name. A key ending in `/in` is for the filter among those of one move or
 * one encounter, which is then what the words are said of; one ending in `/not`
 * is for the filter after `not`. The openings of groups (`move(`) are here too.
 * A way of being available has a wording of its own, `Availability:<slug>`, which
 * `Availability in` puts with a game as `{status}`.
 * Other languages have theirs as `describe:<key>`.
 */
export const DESCRIPTIONS: Record<string, string> = {
  'intro': 'A Pokémon that {x}',
  // What is said after an `and` or a `not` that is not read game by game (`Reading`).
  'note:each': 'each in its own games', 'note:those': 'in any of those games', 'note:any': 'in any game',
  'Type': 'has the {x} type', 'Type/not': 'does NOT have the {x} type',
  'Ability': 'has the {x} ability', 'Ability/not': 'does NOT have the {x} ability',
  'Hidden ability': 'has {x} as its hidden ability', 'Hidden ability/not': 'does NOT have {x} as its hidden ability',
  'Regular ability': 'has {x} as a regular ability', 'Regular ability/not': 'does NOT have {x} as a regular ability',
  'Egg group': 'is in the {x} egg group', 'Egg group/not': 'is NOT in the {x} egg group',
  'Game': 'is in {x}', 'Game/not': 'is NOT in {x}',
  'Generation': 'is in {x}', 'Generation/not': 'is NOT in {x}',
  'Games': 'is in {x}', 'Games/not': 'is NOT in {x}',
  'Introduced in': 'was introduced in {x}', 'Introduced in/not': 'was NOT introduced in {x}',
  'Availability': 'has the availability: {x}', 'Availability/not': 'does NOT have the availability: {x}',
  'Availability in': '{status} in {x}',
  'Availability:catchable': 'is catchable', 'Availability:catchable/not': 'is NOT catchable',
  'Availability:gift': 'is received as a gift', 'Availability:gift/not': 'is NOT received as a gift',
  'Availability:trade': 'is received in a trade', 'Availability:trade/not': 'is NOT received in a trade',
  'Availability:obtainable': 'is normally obtainable', 'Availability:obtainable/not': 'is NOT normally obtainable',
  'Availability:breed': 'is obtained by breeding', 'Availability:breed/not': 'is NOT obtained by breeding',
  'Availability:evolve': 'is obtained by evolving', 'Availability:evolve/not': 'is NOT obtained by evolving',
  'Availability:mega-evolution': 'is obtained by Mega Evolution', 'Availability:mega-evolution/not': 'is NOT obtained by Mega Evolution',
  'Availability:event': 'is obtained from an event', 'Availability:event/not': 'is NOT obtained from an event',
  'Availability:transfer': 'is obtained by transfer', 'Availability:transfer/not': 'is NOT obtained by transfer',
  'Availability:unknown': 'has unknown availability', 'Availability:unknown/not': 'does NOT have unknown availability',
  'Pokémon': 'is {x}', 'Pokémon/not': 'is NOT {x}',
  'Form': 'is {x}', 'Form/not': 'is NOT {x}',
  'Evolution': 'is: {x}', 'Evolution/not': 'is NOT: {x}',
  'Tag': 'is: {x}', 'Tag/not': 'is NOT: {x}',
  'Gender': 'is {x}', 'Gender/not': 'is NOT {x}',
  'Growth rate': 'has the {x} growth rate', 'Growth rate/not': 'does NOT have the {x} growth rate',
  'Has': 'has: {x}', 'Has/not': 'does NOT have: {x}',
  'Comparison': 'has {x}', 'Comparison/not': 'does NOT have {x}',
  'Weak to': 'is weak to {x}', 'Weak to/not': 'is NOT weak to {x}',
  'Resists': 'resists {x}', 'Resists/not': 'does NOT resist {x}',
  'Immune to': 'is immune to {x}', 'Immune to/not': 'is NOT immune to {x}',
  'Neutral to': 'takes neutral damage from {x}', 'Neutral to/not': 'does NOT take neutral damage from {x}',
  'Evolves': 'evolves {x}', 'Evolves/not': 'does NOT evolve {x}',
  'Evolves with': 'evolves with {x}', 'Evolves with/not': 'does NOT evolve with {x}',
  'Evolves knowing': 'evolves knowing {x}', 'Evolves knowing/not': 'does NOT evolve knowing {x}',
  'Move': 'learns {x}', 'Move/not': 'does NOT learn {x}',
  'Move type': 'learns a {x}-type move', 'Move type/not': 'does NOT learn a {x}-type move',
  'Move category': 'learns a {x} move', 'Move category/not': 'does NOT learn a {x} move',
  'Move flag': 'learns a move with the flag {x}', 'Move flag/not': 'does NOT learn a move with the flag {x}',
  'Learned': 'learns a move by: {x}', 'Learned/not': 'does NOT learn a move by: {x}',
  'Move/in': 'is {x}', 'Move/in/not': 'is NOT {x}',
  'Move type/in': 'has the {x} type', 'Move type/in/not': 'does NOT have the {x} type',
  'Move category/in': 'is a {x} move', 'Move category/in/not': 'is NOT a {x} move',
  'Move flag/in': 'has the flag {x}', 'Move flag/in/not': 'does NOT have the flag {x}',
  'Learned/in': 'is learned by: {x}', 'Learned/in/not': 'is NOT learned by: {x}',
  'Location': 'is found in {x}', 'Location/not': 'is NOT found in {x}',
  'Region': 'is found in {x}', 'Region/not': 'is NOT found in {x}',
  'Method': 'is found by: {x}', 'Method/not': 'is NOT found by: {x}',
  'Time': 'is found at this time: {x}', 'Time/not': 'is NOT found at this time: {x}',
  'Season': 'is found in {x}', 'Season/not': 'is NOT found in {x}',
  'Weather': 'is found in this weather: {x}', 'Weather/not': 'is NOT found in this weather: {x}',
  'Encounter': 'has an encounter that is: {x}', 'Encounter/not': 'does NOT have an encounter that is: {x}',
  'Holding': 'may hold {x}', 'Holding/not': 'does NOT hold {x}',
  'Only at': 'is found only at this time: {x}', 'Only at/not': 'is NOT found only at this time: {x}',
  'Only in': 'is found only in: {x}', 'Only in/not': 'is NOT found only in: {x}',
  'Location/in': 'is in {x}', 'Location/in/not': 'is NOT in {x}',
  'Region/in': 'is in {x}', 'Region/in/not': 'is NOT in {x}',
  'Method/in': 'is by: {x}', 'Method/in/not': 'is NOT by: {x}',
  'Time/in': 'happens at this time: {x}', 'Time/in/not': 'does NOT happen at this time: {x}',
  'Season/in': 'happens in {x}', 'Season/in/not': 'does NOT happen in {x}',
  'Weather/in': 'happens in this weather: {x}', 'Weather/in/not': 'does NOT happen in this weather: {x}',
  'Encounter/in': 'is: {x}', 'Encounter/in/not': 'is NOT: {x}',
  'Holding/in': 'gives a Pokémon holding {x}', 'Holding/in/not': 'does NOT give a Pokémon holding {x}',
  'Only at/in': 'happens only at this time: {x}', 'Only at/in/not': 'does NOT happen only at this time: {x}',
  'Only in/in': 'happens only in: {x}', 'Only in/in/not': 'does NOT happen only in: {x}',
  'move(': 'learns a move that', 'move(/not': 'does NOT learn a move that',
  'encounter(': 'has an encounter that', 'encounter(/not': 'does NOT have an encounter that',
  'prevo(': 'evolves from a Pokémon that', 'prevo(/not': 'does NOT evolve from a Pokémon that',
  'evo(': 'evolves into a Pokémon that', 'evo(/not': 'does NOT evolve into a Pokémon that',
  'family(': 'has a relative that', 'family(/not': 'does NOT have a relative that',
  'anygame(': 'in some game', 'anygame(/not': 'in no game',
}

/**
 * `expr` in words: "A Pokémon that (has the Normal type OR has the Fire type)", with
 * what `readings` says of how its `and`s and `not`s are read. `names` has the names
 * of the filters, `translations` the wording of the language, and `t` its words for
 * the operators; `null` if there are no filters.
 */
export function describe(expr: Expr | null, readings: Map<Expr, Reading>, names: NameTable, translations: Translations, t: Translate): string | null {
  if (expr === null || (expr.kind === 'and' && expr.args.length === 0)) return null
  // A language's wording is all its own: English never fills in for a part of it.
  const translated = 'describe:intro' in translations
  const wording = (key: string) => (translated ? translations[`describe:${key}`] : DESCRIPTIONS[key])
  // What `key` reads as, after `not` if `negated`: by its own wording for that, or else after the word for "not".
  const phrase = (keys: string[], negated: boolean, fallback: string): string => {
    const found = (suffix: string) => keys.map((key) => wording(`${key}${suffix}`)).find((text) => text !== undefined)
    return negated ? found('/not') ?? `${t('NOT')} ${found('') ?? fallback}` : found('') ?? fallback
  }
  const noted = (text: string, node: Expr) => (readings.has(node) ? `${text} (${wording(`note:${readings.get(node)!}`)})` : text)

  // `node` in words: `inside` a group on one move or encounter, which the words are then said of; `negated`
  // if it comes after a `not`, whose note, if it has one, is that of `not`; and `bare` if nothing is beside
  // it, so that it needs no brackets.
  function words(node: Expr, inside: boolean, negated: Extract<Expr, { kind: 'not' }> | undefined, bare: boolean): string {
    const after = (text: string) => (negated ? noted(text, negated) : text)
    switch (node.kind) {
      case 'and': case 'or': {
        const joined = node.args.map((arg) => words(arg, inside, undefined, node.args.length === 1)).join(` ${t(node.kind === 'and' ? 'AND' : 'OR')} `)
        const text = noted(joined, node)
        if (negated) return after(`${t('NOT')} (${text})`)
        return bare ? text : `(${text})`
      }
      // Two in a row undo each other.
      case 'not': return negated ? words(node.arg, inside, undefined, bare) : words(node.arg, inside, node, bare)
      case 'in': return after(`${phrase([`${node.scope}(`], negated !== undefined, node.scope)} (${words(node.arg, true, undefined, true)})`)
      case 'kin': return after(`${phrase([`${node.kinship}(`], negated !== undefined, node.kinship)} (${words(node.arg, false, undefined, true)})`)
      case 'anygame': return after(`${phrase(['anygame('], negated !== undefined, 'anygame')} (${words(node.arg, false, undefined, true)})`)
      default: {
        const token = leafToken(node, names, t)
        if (token.kind !== 'leaf') throw new Error('a filter has no token')
        const [, group, mode] = /^(.*?)(?: \((.*)\))?$/.exec(token.group)!
        // Of a way of being available, the token's text has the slug: `obtain:catchable`, or `catchable:scarlet` for in a game.
        const [prefix, value] = token.text.split(':')
        const status = prefix === 'obtain' ? value! : OBTAIN_STATUSES.includes(prefix!) ? prefix! : undefined
        const text = status !== undefined && prefix !== 'obtain'
          ? wording('Availability in')!.replace('{status}', phrase([`Availability:${status}`], negated !== undefined, status)).replace('{x}', token.label)
          : phrase([...(status === undefined ? [] : [`Availability:${status}`]), ...(inside ? [`${group}/in`] : []), group!], negated !== undefined, `${t(group!)}: {x}`).replace('{x}', token.label)
        return after(mode === undefined ? text : `${text} (${t(mode)})`)
      }
    }
  }
  return wording('intro')!.replace('{x}', words(expr, false, undefined, true))
}
