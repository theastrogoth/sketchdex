import { expect, test } from 'vitest'
import { statRange } from './statRanges.ts'

test('stat ranges follow the games\' formula', () => {
  // Garchomp: 108 HP, 102 Speed.
  expect(statRange(102, 100, false)).toEqual([188, 333])
  expect(statRange(102, 50, false)).toEqual([96, 169])
  expect(statRange(108, 100, true)).toEqual([326, 420])
  expect(statRange(108, 50, true)).toEqual([168, 215])
  // Shedinja has 1 HP whatever its level.
  expect(statRange(1, 100, true)).toEqual([1, 1])
  // Blissey.
  expect(statRange(255, 100, true)).toEqual([620, 714])
})
