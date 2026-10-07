import { expect, test } from 'vitest'
import { lex, type Token } from './lexer.ts'

// Tokens in brief: words as their text (quoted ones in quotes, after any prefix), the rest as the operator.
function brief(text: string): string[] {
  return lex(text).tokens.map((token: Token) =>
    token.kind === 'word' ? (token.quoted ? `${token.prefix === undefined ? '' : `${token.prefix}:`}"${token.text}"` : token.text)
      : token.kind === 'op' ? `<${token.op}>` : `<${token.comparator}>`)
}

test('operators have word and symbol spellings', () => {
  expect(brief('a AND b and c & d && e, f')).toEqual(['a', '<and>', 'b', '<and>', 'c', '<and>', 'd', '<and>', 'e', '<and>', 'f'])
  expect(brief('a OR b | c || d')).toEqual(['a', '<or>', 'b', '<or>', 'c', '<or>', 'd'])
  expect(brief('not a !b -c (d)')).toEqual(['<not>', 'a', '<not>', 'b', '<not>', 'c', '<(>', 'd', '<)>'])
  expect(brief('a<1 b<=2 c=3 d==4 e!=5 f>=6 g>7')).toEqual(
    ['a', '<<>', '1', 'b', '<<=>', '2', 'c', '<=>', '3', 'd', '<=>', '4', 'e', '<!=>', '5', 'f', '<>=>', '6', 'g', '<>>', '7'])
})

test('words keep the punctuation of names', () => {
  expect(brief("Ho-Oh Farfetch'd Mr. Mime Type: Null form:rattata/alolan")).toEqual(['Ho-Oh', "Farfetch'd", 'Mr.', 'Mime', 'Type:', 'Null', 'form:rattata/alolan'])
  expect(brief('10,000,000 volt, priority > -1')).toEqual(['10,000,000', 'volt', '<and>', 'priority', '<>>', '-1'])
  expect(brief('android notice')).toEqual(['android', 'notice'])
})

test('quotes make one word of anything', () => {
  expect(brief('"a and (b)" ability:"Cute Charm" x')).toEqual(['"a and (b)"', 'ability:"Cute Charm"', 'x'])
  expect(lex('a "b c').diagnostics).toEqual([{ start: 2, end: 6, message: 'missing closing quote' }])
  expect(brief('a "b c')).toEqual(['a', '"b c"'])
})

test('tokens record where they are', () => {
  expect(lex(' ab  >= "c d"').tokens.map(({ start, end }) => [start, end])).toEqual([[1, 3], [5, 7], [8, 13]])
})
