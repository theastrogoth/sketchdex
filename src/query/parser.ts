import { TYPES, type TypeName } from '../data/schema.ts'
import { ATTRIBUTES, ENCOUNTER_ATTRIBUTES, KINSHIPS, MOVE_ATTRIBUTES, SCOPES, type Expr, type Operand, type Scope, type Term } from '../engine/expr.ts'
import { lex, type Diagnostic, type Token } from './lexer.ts'
import { PREFIXES, normalize, type NameTable } from './names.ts'
import { print } from './printer.ts'

export interface Leaf {
  start: number
  end: number
  expr: Term | Extract<Expr, { kind: 'compare' }>
}

export interface ParseResult {
  /** The expression for the parts of the query that could be read; `null` if there are none. */
  expr: Expr | null
  /** The names and comparisons that were read, in order, with where each is in the text. */
  leaves: Leaf[]
  diagnostics: Diagnostic[]
}

type Word = Extract<Token, { kind: 'word' }>

const attribute = (name: (typeof ATTRIBUTES)[number]): Operand => ({ kind: 'attribute', attribute: name })
/** The words an attribute is written by, each with the operand it stands for. */
export const ATTRIBUTE_NAMES: Record<string, Operand> = {
  ...Object.fromEntries(ATTRIBUTES.map((name) => [name.toLowerCase(), attribute(name)])),
  ...Object.fromEntries(MOVE_ATTRIBUTES.map((name) => [name.toLowerCase(), { kind: 'moveAttribute', attribute: name }])),
  ...Object.fromEntries(ENCOUNTER_ATTRIBUTES.map((name) => [name.toLowerCase(), { kind: 'encounterAttribute', attribute: name }])),
  attack: attribute('atk'), defense: attribute('def'), spatk: attribute('spa'), spdef: attribute('spd'), speed: attribute('spe'),
  total: attribute('bst'), exp: attribute('baseExp'), happiness: attribute('friendship'), gen: attribute('generation'), bp: { kind: 'moveAttribute', attribute: 'power' },
}

/**
 * Read a query against the names in `names`:
 *
 *     or      := and ("or" and)*
 *     and     := unary ("and"? unary)*
 *     unary   := "not" unary | "(" or ")" | group "(" or ")" | operand comparator operand | name
 *
 * `and`, `or`, and `not` may be written as words in any case or as `&` `&&` `,`,
 * `|` `||`, and `!` `-`. A group is `family`, `prevo`, `evo`, `move`, `encounter`, or `anygame`,
 * directly before its parenthesis: `prevo(type:fire)` is a form that evolves from a
 * Fire type, `move(fire physical)` one that learns a physical Fire move,
 * `anygame(levitate) anygame(type:fire)` one that has had both, in whatever games. Inside
 * `move(...)` and `encounter(...)`, a name means a filter on moves or encounters
 * where it could also mean one on Pokémon. A name is one or more words, optionally after a prefix
 * (`egg:fairy`) or in double quotes; the longest run of words that is a name is
 * taken as one. An operand is a number, an attribute such as `bst` (of a Pokémon),
 * `power` (of a move), or `level` (of an encounter), or the multiplier of attacks of
 * a type, `vs:fire`.
 *
 * `scope` says that the text is from inside such a group.
 *
 * Problems are reported as diagnostics and the affected part is left out, so a
 * query being typed yields the expression for what is complete.
 */
export function parse(text: string, names: NameTable, scope?: Scope): ParseResult {
  const { tokens, diagnostics } = lex(text)
  const leaves: Leaf[] = []
  // The `move(` and `encounter(` groups the parser is inside, innermost last.
  const scopes: Scope[] = scope === undefined ? [] : [scope]
  let pos = 0

  const peek = () => tokens[pos]
  const isOp = (token: Token | undefined, op: string) => token?.kind === 'op' && token.op === op
  const opens = (token: Token | undefined) => token?.kind === 'op' && token.op.endsWith('(')
  const report = (token: { start: number; end: number }, message: string, candidates?: string[]) => {
    diagnostics.push({ start: token.start, end: token.end, message, ...(candidates ? { candidates } : {}) })
  }
  const source = (token: Token) => text.slice(token.start, token.end)

  function or(): Expr | null {
    const args: Expr[] = []
    for (;;) {
      const before = pos
      const arg = and()
      if (arg) args.push(arg)
      const next = peek()
      // An operand that consumed nothing is missing; one that did has reported its own problems.
      if (pos === before) {
        const previous = tokens[pos - 1]
        if (isOp(previous, 'or')) report(previous!, 'expected a filter after "or"')
        else if (isOp(next, 'or')) report(next!, 'expected a filter before "or"')
      }
      if (!isOp(next, 'or')) break
      pos++
    }
    return args.length > 1 ? { kind: 'or', args } : (args[0] ?? null)
  }

  function and(): Expr | null {
    const args: Expr[] = []
    let dangling: Token | undefined
    for (;;) {
      const token = peek()
      if (!token || isOp(token, 'or') || isOp(token, ')')) break
      if (isOp(token, 'and')) {
        if (dangling || pos === 0 || opens(tokens[pos - 1]) || isOp(tokens[pos - 1], 'or')) report(token, `expected a filter before "${source(token)}"`)
        dangling = token
        pos++
        continue
      }
      dangling = undefined
      const arg = unary()
      if (arg) args.push(arg)
    }
    if (dangling) report(dangling, `expected a filter after "${source(dangling)}"`)
    return args.length > 1 ? { kind: 'and', args } : (args[0] ?? null)
  }

  function unary(): Expr | null {
    const token = peek()!
    if (isOp(token, 'not')) {
      pos++
      const next = peek()
      if (!next || isOp(next, 'and') || isOp(next, 'or') || isOp(next, ')')) {
        report(token, `expected a filter after "${source(token)}"`)
        return null
      }
      const arg = unary()
      return arg && { kind: 'not', arg }
    }
    if (opens(token)) {
      pos++
      const scope = SCOPES.find((name) => isOp(token, `${name}(`))
      if (scope) scopes.push(scope)
      const inner = or()
      if (scope) scopes.pop()
      if (isOp(peek(), ')')) pos++
      else report(token, 'missing closing parenthesis')
      const kinship = KINSHIPS.find((name) => isOp(token, `${name}(`))
      if (isOp(token, 'anygame(') && inner) return { kind: 'anygame', arg: inner }
      return kinship && inner ? { kind: 'kin', kinship, arg: inner } : scope && inner ? { kind: 'in', scope, arg: inner } : inner
    }
    if (token.kind === 'cmp') {
      pos++
      report(token, `expected a number or an attribute before "${source(token)}"`)
      if (peek()?.kind === 'word') pos++
      return null
    }
    if (token.kind === 'word' && tokens[pos + 1]?.kind === 'cmp') return comparison(token)
    return name(token as Word)
  }

  function operand(word: Word): Operand | null {
    if (!word.quoted && word.prefix === undefined) {
      const value = Number(word.text.replaceAll(',', ''))
      if (word.text !== '' && Number.isFinite(value)) return { kind: 'number', value }
      const named = ATTRIBUTE_NAMES[word.text.toLowerCase()]
      if (named) return named
      const type = /^vs:(.+)$/i.exec(word.text)?.[1]?.toLowerCase()
      if (TYPES.some((name) => name === type)) return { kind: 'matchup', type: type as TypeName }
    }
    report(word, `expected a number or an attribute, got "${source(word)}"`)
    return null
  }

  function comparison(leftWord: Word): Expr | null {
    const comparator = tokens[pos + 1] as Extract<Token, { kind: 'cmp' }>
    const rightWord = tokens[pos + 2]
    pos += 2
    const left = operand(leftWord)
    if (rightWord?.kind !== 'word') {
      report(comparator, `expected a number or an attribute after "${source(comparator)}"`)
      return null
    }
    pos++
    const right = operand(rightWord)
    if (!left || !right) return null
    const expr = { kind: 'compare' as const, comparator: comparator.comparator, left, right }
    leaves.push({ start: leftWord.start, end: rightWord.end, expr })
    return expr
  }

  // The unquoted words from `pos` on that may together form one name: those up to the
  // next operator, leaving out a word that is the left operand of a comparison.
  function run(): Word[] {
    const words: Word[] = []
    for (let i = pos; i < tokens.length && words.length < names.maxWords; i++) {
      const token = tokens[i]!
      if (token.kind !== 'word' || token.quoted || tokens[i + 1]?.kind === 'cmp') break
      words.push(token)
    }
    return words
  }

  function resolved(terms: Term[], span: { start: number; end: number }): Expr | null {
    const distinct = [...new Map(terms.map((term) => [print(term), term])).values()]
    if (distinct.length === 1) {
      leaves.push({ start: span.start, end: span.end, expr: distinct[0]! })
      return distinct[0]!
    }
    report(span, `"${text.slice(span.start, span.end)}" is ambiguous`, distinct.map(print))
    return null
  }

  function name(first: Word): Expr | null {
    if (first.quoted) {
      pos++
      if (first.prefix !== undefined && !Object.hasOwn(PREFIXES, first.prefix.toLowerCase())) {
        report(first, `unknown prefix "${first.prefix}"`)
        return null
      }
      const terms = names.find(normalize(first.text), first.prefix?.toLowerCase(), scopes.at(-1))
      if (terms.length === 0) report(first, `unknown name ${source(first)}`)
      return terms.length === 0 ? null : resolved(terms, first)
    }
    // Canonical text names its term outright, whatever else shares the name.
    const exact = names.exact(first.text.toLowerCase())
    if (exact) {
      pos++
      return resolved([exact], first)
    }
    const words = run()
    if (words.length === 0) words.push(first)
    const colon = first.text.indexOf(':')
    const prefix = colon > 0 && Object.hasOwn(PREFIXES, first.text.slice(0, colon).toLowerCase()) ? first.text.slice(0, colon).toLowerCase() : undefined
    // The longest run of words that is a name wins, read without a prefix if possible.
    for (const withPrefix of prefix === undefined ? [false] : [false, true]) {
      for (let count = words.length; count > 0; count--) {
        const texts = words.slice(0, count).map((word) => word.text)
        if (withPrefix) texts[0] = texts[0]!.slice(colon + 1)
        const terms = names.find(normalize(texts.join(' ')), withPrefix ? prefix : undefined, scopes.at(-1))
        if (terms.length > 0) {
          pos += count
          return resolved(terms, { start: first.start, end: words[count - 1]!.end })
        }
      }
    }
    pos++
    report(first, prefix === undefined ? `unknown name "${first.text}"` : `unknown ${[PREFIXES[prefix]!.kind, ...(PREFIXES[prefix]!.otherKinds ?? [])].join(' or ')} "${first.text.slice(colon + 1)}"`)
    return null
  }

  let expr = or()
  // Only a closing parenthesis can stop the top-level expression early.
  while (pos < tokens.length) {
    report(tokens[pos]!, 'unmatched closing parenthesis')
    pos++
    const rest = or()
    if (rest) expr = expr ? { kind: 'and', args: [expr, rest] } : rest
  }
  return { expr, leaves, diagnostics }
}
