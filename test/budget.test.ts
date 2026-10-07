import { expect, test } from 'vitest'
import { createEngine } from '../src/engine/engine.ts'
import { buildNameTable } from '../src/query/names.ts'
import { parse } from '../src/query/parser.ts'
import { suggest } from '../src/query/suggest.ts'
import { committedDataset } from './data.ts'

// Limits on the time things take, several times what they take on a laptop, so that
// a change that makes typing sluggish fails here rather than being noticed later.

const QUERIES = [
  'Paldea East Province AND (Fake Tears OR Acid Spray) AND (type:flying OR Levitate)',
  'Gen III AND (Surfing OR Fishing)',
  'move(physical & grass & bp > 70) type:water',
  'prevo(surfing level >= 20) weak:fire is:nfe',
  'anygame(levitate) bst >= 500 -stage = 1',
]

function milliseconds(run: () => void, times = 1): number {
  const start = performance.now()
  for (let i = 0; i < times; i++) run()
  return (performance.now() - start) / times
}

test('starting up, querying, and suggesting stay fast', async () => {
  const dataset = await committedDataset()
  let engine!: ReturnType<typeof createEngine>
  let names!: ReturnType<typeof buildNameTable>
  expect(milliseconds(() => { engine = createEngine(dataset) })).toBeLessThan(1500)
  expect(milliseconds(() => { names = buildNameTable(dataset) })).toBeLessThan(1000)
  for (const query of QUERIES) {
    const { expr, diagnostics } = parse(query, names)
    expect(diagnostics).toEqual([])
    engine.evaluate(expr!)
    expect(milliseconds(() => engine.evaluate(parse(query, names).expr!), 5), query).toBeLessThan(60)
  }
  for (const typed of ['r', 'rou', 'paldea east', 'bp']) expect(milliseconds(() => suggest(typed, names), 5), typed).toBeLessThan(30)
})
