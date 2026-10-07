import { expect, test } from 'vitest'
import { typeMultiplier, withAbility } from './typechart.ts'

test('the chart of Generation VI onward', () => {
  expect(typeMultiplier(9, 'ice', ['dragon', 'flying'])).toBe(4)
  expect(typeMultiplier(9, 'ground', ['electric', 'flying'])).toBe(0)
  expect(typeMultiplier(9, 'fighting', ['fairy'])).toBe(0.5)
  expect(typeMultiplier(6, 'dark', ['steel'])).toBe(1)
  expect(typeMultiplier(9, 'normal', ['normal'])).toBe(1)
})

test('earlier generations differ', () => {
  expect(typeMultiplier(5, 'dark', ['steel'])).toBe(0.5)
  expect(typeMultiplier(2, 'ghost', ['steel', 'psychic'])).toBe(1)
  expect(typeMultiplier(1, 'ghost', ['psychic'])).toBe(0)
  expect(typeMultiplier(2, 'ghost', ['psychic'])).toBe(2)
  expect(typeMultiplier(1, 'bug', ['grass', 'poison'])).toBe(4)
  expect(typeMultiplier(2, 'bug', ['grass', 'poison'])).toBe(1)
  expect(typeMultiplier(1, 'poison', ['bug'])).toBe(2)
  expect(typeMultiplier(1, 'ice', ['fire'])).toBe(1)
  expect(typeMultiplier(2, 'ice', ['fire'])).toBe(0.5)
})

test('a generation has no multiplier for a type it lacks', () => {
  expect(typeMultiplier(1, 'dark', ['psychic'])).toBeNull()
  expect(typeMultiplier(1, 'steel', ['rock'])).toBeNull()
  expect(typeMultiplier(5, 'fairy', ['dragon'])).toBeNull()
  expect(typeMultiplier(2, 'steel', ['rock'])).toBe(2)
})

test('abilities change the multiplier', () => {
  expect(withAbility(9, 'levitate', 'ground', 2)).toBe(0)
  expect(withAbility(9, 'levitate', 'fire', 2)).toBe(2)
  expect(withAbility(9, 'thick-fat', 'ice', 2)).toBe(1)
  expect(withAbility(9, 'dry-skin', 'fire', 2)).toBe(2.5)
  expect(withAbility(9, 'dry-skin', 'water', 0.5)).toBe(0)
  expect(withAbility(9, 'solid-rock', 'water', 4)).toBe(3)
  expect(withAbility(9, 'solid-rock', 'fire', 0.5)).toBe(0.5)
  expect(withAbility(9, 'wonder-guard', 'water', 1)).toBe(0)
  expect(withAbility(9, 'wonder-guard', 'fire', 2)).toBe(2)
  expect(withAbility(4, 'lightning-rod', 'electric', 1)).toBe(1)
  expect(withAbility(5, 'lightning-rod', 'electric', 1)).toBe(0)
  expect(withAbility(9, 'overgrow', 'fire', 2)).toBe(2)
})
