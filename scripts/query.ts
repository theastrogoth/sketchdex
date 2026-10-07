import { join, resolve } from 'node:path'
import { buildDataset } from '../src/data/dataset.ts'
import { gamesOf } from '../src/data/gamemask.ts'
import { createEngine } from '../src/engine/engine.ts'
import { formsOf } from '../src/engine/pairset.ts'
import { buildNameTable } from '../src/query/names.ts'
import { parse } from '../src/query/parser.ts'
import { print } from '../src/query/printer.ts'
import { readData } from './read-data.ts'

// Prints the forms matching a query, each with the games it matches in:
//
//     npm run q -- "gen 3 & type:water & bst >= 500"

const query = process.argv.slice(2).join(' ')
const dataset = buildDataset((await readData(join(resolve(import.meta.dirname, '..'), 'public/data'))).bundle)
const { expr, diagnostics } = parse(query, buildNameTable(dataset))

if (diagnostics.length > 0) {
  for (const { start, end, message, candidates } of diagnostics) {
    console.error(query)
    console.error(' '.repeat(start) + '^'.repeat(Math.max(1, end - start)))
    console.error(candidates ? `${message}: ${candidates.join(', ')}` : message)
  }
  process.exit(1)
}
if (!expr) {
  console.error('usage: npm run q -- "<query>"')
  process.exit(1)
}

const { forms, meta } = dataset.bundle
const pairs = createEngine(dataset).evaluate(expr)
const matches = formsOf(pairs)
console.log(`${print(expr)}\n${matches.length} forms`)
for (const id of matches) {
  const form = forms[id]!
  const games = gamesOf(pairs, 2 * id)
  const name = form.form === 'none' ? form.name : `${form.name} (${form.formName ?? form.form})`
  console.log(`${name.padEnd(36)} ${games.length === meta.games.length ? 'all games' : games.map((g) => meta.games[g]!.slug).join(' ')}`)
}
