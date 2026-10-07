import { KINSHIPS, SCOPES, type Comparator, type Kinship, type Scope } from '../engine/expr.ts'

/** A problem with part of a query's text, from offset `start` up to `end`. */
export interface Diagnostic {
  start: number
  end: number
  message: string
  /** For an ambiguous name, the canonical texts of what it could mean. */
  candidates?: string[]
}

export type Token = { start: number; end: number } & (
  /** Text naming something. `prefix` is set only for a quoted word written as `prefix:"..."`. */
  | { kind: 'word'; text: string; quoted: boolean; prefix?: string }
  /** `family(`, `move(`, and the like are a kinship or scope directly followed by an opening parenthesis. */
  | { kind: 'op'; op: '(' | ')' | 'and' | 'or' | 'not' | `${Kinship | Scope | 'anygame'}(` }
  | { kind: 'cmp'; comparator: Comparator }
)

const SYMBOLS: [string, Token extends infer T ? (T extends { kind: 'op' | 'cmp' } ? Omit<T, 'start' | 'end'> : never) : never][] = [
  ['&&', { kind: 'op', op: 'and' }], ['&', { kind: 'op', op: 'and' }], [',', { kind: 'op', op: 'and' }],
  ['||', { kind: 'op', op: 'or' }], ['|', { kind: 'op', op: 'or' }],
  ['!=', { kind: 'cmp', comparator: '!=' }], ['!', { kind: 'op', op: 'not' }],
  ['<=', { kind: 'cmp', comparator: '<=' }], ['>=', { kind: 'cmp', comparator: '>=' }],
  ['<', { kind: 'cmp', comparator: '<' }], ['>', { kind: 'cmp', comparator: '>' }],
  ['==', { kind: 'cmp', comparator: '=' }], ['=', { kind: 'cmp', comparator: '=' }],
  ['(', { kind: 'op', op: '(' }], [')', { kind: 'op', op: ')' }],
]
const KEYWORDS: Record<string, 'and' | 'or' | 'not'> = { and: 'and', or: 'or', not: 'not' }
const isDigit = (c: string | undefined) => c !== undefined && c >= '0' && c <= '9'

/**
 * Split a query into tokens. Words run up to white space or an operator character;
 * a comma between digits and anything between double quotes belong to the word.
 */
export function lex(text: string): { tokens: Token[]; diagnostics: Diagnostic[] } {
  const tokens: Token[] = []
  const diagnostics: Diagnostic[] = []
  let i = 0

  // Reads the quoted text whose opening quote is at `i`.
  function quoted(): string {
    const open = i
    const close = text.indexOf('"', open + 1)
    if (close < 0) {
      diagnostics.push({ start: open, end: text.length, message: 'missing closing quote' })
      i = text.length
      return text.slice(open + 1)
    }
    i = close + 1
    return text.slice(open + 1, close)
  }

  while (i < text.length) {
    const start = i
    const c = text[i]!
    if (/\s/.test(c)) {
      i++
      continue
    }
    if (c === '"') {
      tokens.push({ kind: 'word', text: quoted(), quoted: true, start, end: i })
      continue
    }
    const symbol = SYMBOLS.find(([s]) => text.startsWith(s, i))
    if (symbol) {
      i += symbol[0].length
      tokens.push({ ...symbol[1], start, end: i })
      continue
    }
    // A leading `-` negates, unless it starts a number.
    if (c === '-' && /[\p{L}(]/u.test(text[i + 1] ?? '')) {
      i++
      tokens.push({ kind: 'op', op: 'not', start, end: i })
      continue
    }
    while (i < text.length && !/[\s()&|!<>="]/.test(text[i]!) && (text[i] !== ',' || (isDigit(text[i - 1]) && isDigit(text[i + 1])))) i++
    const word = text.slice(start, i)
    const group = [...KINSHIPS, ...SCOPES, 'anygame' as const].find((name) => name === word.toLowerCase())
    if (text[i] === '(' && group) {
      i++
      tokens.push({ kind: 'op', op: `${group}(`, start, end: i })
    } else if (text[i] === '"' && word.endsWith(':')) {
      tokens.push({ kind: 'word', prefix: word.slice(0, -1), text: quoted(), quoted: true, start, end: i })
    } else if (Object.hasOwn(KEYWORDS, word.toLowerCase())) {
      tokens.push({ kind: 'op', op: KEYWORDS[word.toLowerCase()]!, start, end: i })
    } else {
      tokens.push({ kind: 'word', text: word, quoted: false, start, end: i })
    }
  }
  return { tokens, diagnostics }
}
