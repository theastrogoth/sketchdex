import { expect, test } from 'vitest'
import { array, index, integer, nullable, number, object, oneOf, partial, record, string, tuple } from './check.ts'

const point = object<{ x: number; label: string | null }>({ x: integer, label: nullable(string) })

test('a check returns the value it accepts', () => {
  const value = { x: 1, label: null }
  expect(point(value, ['f.json'])).toBe(value)
  expect(array(tuple<[number, string]>(index(3), oneOf(['a', 'b'])))([[2, 'b']], ['f.json'])).toEqual([[2, 'b']])
  expect(partial<{ x: number; y: number }>({ x: number, y: number })({ y: 0.5 }, ['f.json'])).toEqual({ y: 0.5 })
})

test('an error names the location, the expectation, and the value', () => {
  expect(() => array(point)([{ x: 1, label: null }, { x: 1.5, label: null }], ['f.json'])).toThrow('f.json[1].x: expected an integer, got 1.5')
  expect(() => record(array(index(3)))({ a: [0, 3] }, ['f.json', 'rows'])).toThrow('f.json.rows.a[1]: expected an integer in 0..2, got 3')
  expect(() => number(Infinity, ['f.json'])).toThrow('f.json: expected a finite number, got null')
  expect(() => oneOf(['a', 'b'])('c', ['f.json'])).toThrow('f.json: expected one of a, b, got "c"')
  expect(() => array(integer, 2)([1], ['f.json'])).toThrow('f.json: expected an array of length 2, got [1]')
})

test('an object must have exactly the keys of its shape', () => {
  expect(() => point({ x: 1 }, ['f.json'])).toThrow('f.json: expected the key label, got ["x"]')
  expect(() => point({ x: 1, label: null, y: 2 }, ['f.json'])).toThrow('f.json: expected only the keys x, label, got "y"')
  expect(() => partial<{ x: number }>({ x: number })({ y: 2 }, ['f.json'])).toThrow('f.json: expected only the keys x, got "y"')
  expect(() => point([1, null], ['f.json'])).toThrow('f.json: expected an object, got [1,null]')
})
