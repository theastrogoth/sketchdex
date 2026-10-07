import { join } from 'node:path'
import { buildDataset, type Dataset } from '../src/data/dataset.ts'
import { readData } from '../scripts/read-data.ts'

let dataset: Promise<Dataset> | undefined

/** The dataset of the committed data files, read once per test file. */
export function committedDataset(): Promise<Dataset> {
  dataset ??= readData(join(import.meta.dirname, '../public/data')).then(({ bundle }) => buildDataset(bundle))
  return dataset
}
