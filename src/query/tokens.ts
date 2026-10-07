import { translator, type Translate } from '../i18n/ui.ts'
import type { TypeName } from '../data/schema.ts'
import type { Attribute, EncounterAttribute, Expr, Kinship, MoveAttribute, Scope, Term } from '../engine/expr.ts'
import { lex } from './lexer.ts'
import type { NameTable } from './names.ts'
import type { ParseResult } from './parser.ts'
import { print } from './printer.ts'

/** An operator; `family(` and the like open a group, which `)` closes, of filters on a form's relatives. */
export type Op = 'and' | 'or' | 'not' | '(' | ')' | `${Kinship | Scope | 'anygame'}(`

/**
 * A piece of a query as the input shows it: an operator, or a filter with its
 * canonical text and the words that describe it to the user.
 */
export type QueryToken =
  | { kind: 'op'; op: Op }
  | { kind: 'leaf'; text: string; label: string; group: string; type?: TypeName }

/**
 * Something to offer while a filter is being typed: a filter or operator to add, or
 * a `hint`, which is the start of a comparison (`power `) to go on typing from.
 */
export type Suggestion = QueryToken | { kind: 'hint'; draft: string; label: string; group: string }

export const OP_TEXT: Record<Op, string> = {
  'and': '&', 'or': '|', 'not': '!', '(': '(', ')': ')', 'family(': 'family(', 'prevo(': 'prevo(', 'evo(': 'evo(', 'move(': 'move(', 'encounter(': 'encounter(', 'anygame(': 'anygame(',
}

const GROUPS: Record<Exclude<Term['kind'], 'matchup' | 'evolves'>, string> = {
  evolution: 'Evolution', tag: 'Tag', gender: 'Gender', growth: 'Growth rate', has: 'Has', held: 'Holding', move: 'Move', moveType: 'Move type', category: 'Move category', flag: 'Move flag', learn: 'Learned',
  place: 'Location', region: 'Region', method: 'Method', time: 'Time', season: 'Season', weather: 'Weather', encounter: 'Encounter',
  type: 'Type', ability: 'Ability', eggGroup: 'Egg group', game: 'Game', generation: 'Generation', introduced: 'Introduced in',
  versionGroup: 'Games', obtain: 'Availability', species: 'Pokémon', form: 'Form',
}
export const ATTRIBUTE_LABELS: Record<Attribute | MoveAttribute | EncounterAttribute, string> = {
  power: 'Power', accuracy: 'Accuracy', pp: 'PP', priority: 'Priority', learnLevel: 'Learned at level', level: 'Level', rate: 'Rate %', stars: 'Stars',
  hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe', bst: 'BST', height: 'Height', weight: 'Weight',
  catchRate: 'Catch rate', baseExp: 'Base exp', friendship: 'Friendship', eggCycles: 'Egg cycles', dex: 'Dex №', introduced: 'Introduced in gen', stage: 'Stage', evoLevel: 'Evolves at level', generation: 'Generation',
  evHp: 'HP EVs', evAtk: 'Atk EVs', evDef: 'Def EVs', evSpA: 'SpA EVs', evSpD: 'SpD EVs', evSpe: 'Spe EVs', male: 'Male %', female: 'Female %', types: 'Types', abilities: 'Abilities',
}
const ENGLISH = translator('en')
const RELATION_GROUPS = { weak: 'Weak to', resists: 'Resists', immune: 'Immune to', neutral: 'Neutral to' } as const

const COMPARATOR_LABELS = { '<': '<', '<=': '≤', '=': '=', '!=': '≠', '>=': '≥', '>': '>' } as const

/** The token for a filter, named as in `names`; `t` puts what a comparison compares in the interface's language. */
export function leafToken(expr: Term | Extract<Expr, { kind: 'compare' }>, names: NameTable, t: Translate = ENGLISH): QueryToken {
  const text = print(expr)
  if (expr.kind === 'compare') {
    const operand = (o: typeof expr.left) =>
      o.kind === 'number' ? String(o.value) : o.kind === 'matchup' ? t('damage from {type}', { type: names.display({ kind: 'type', type: o.type }) }) : t(ATTRIBUTE_LABELS[o.attribute])
    return { kind: 'leaf', text, label: `${operand(expr.left)} ${COMPARATOR_LABELS[expr.comparator]} ${operand(expr.right)}`, group: 'Comparison' }
  }
  if (expr.kind === 'matchup') {
    const mode = expr.abilities === 'all' ? ' (every ability)' : expr.abilities === 'ignore' ? ' (types alone)' : ''
    return { kind: 'leaf', text, label: names.display(expr), group: RELATION_GROUPS[expr.relation] + mode }
  }
  if ((expr.kind === 'time' || expr.kind === 'season' || expr.kind === 'weather') && expr.only) return { kind: 'leaf', text, label: names.display(expr), group: expr.kind === 'time' ? 'Only at' : 'Only in' }
  // Available in some way in a game: the way, as the filter of it alone is named, and the game.
  if (expr.kind === 'obtain' && expr.in) return { kind: 'leaf', text, label: names.display(expr), group: names.display({ kind: 'obtain', status: expr.status }) }
  if (expr.kind === 'evolves') return { kind: 'leaf', text, label: names.display(expr), group: 'item' in expr ? 'Evolves with' : 'move' in expr ? 'Evolves knowing' : 'Evolves' }
  const group = expr.kind === 'ability' && expr.hidden !== undefined ? (expr.hidden ? 'Hidden ability' : 'Regular ability') : GROUPS[expr.kind]
  return { kind: 'leaf', text, label: names.display(expr), group, ...(expr.kind === 'type' ? { type: expr.type } : {}) }
}

/** The tokens of the query `text` that `parsed` is the result of parsing: its operators and the filters that were read. */
export function tokensOf(text: string, parsed: ParseResult, names: NameTable, t?: Translate): QueryToken[] {
  const ops = lex(text).tokens.flatMap((token) => (token.kind === 'op' ? [{ start: token.start, token: { kind: 'op' as const, op: token.op } }] : []))
  const leaves = parsed.leaves.map((leaf) => ({ start: leaf.start, token: leafToken(leaf.expr, names, t) }))
  return [...ops, ...leaves].sort((a, b) => a.start - b.start).map(({ token }) => token)
}

/** The query text of `tokens`, and for each token where it is in that text. */
export function tokensToText(tokens: readonly QueryToken[]): { text: string; spans: [start: number, end: number][] } {
  let text = ''
  const spans = tokens.map((token): [number, number] => {
    if (text !== '') text += ' '
    const start = text.length
    text += token.kind === 'op' ? OP_TEXT[token.op] : token.text
    return [start, text.length]
  })
  return { text, spans }
}

