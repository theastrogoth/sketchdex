import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { BUNDLE_FILES, DEX_ENTRIES_FILE, type Bundle } from '../src/data/schema.ts'
import { validateBundle, validateDexEntries, type RawBundle } from '../src/data/validate.ts'

async function readJson(dir: string, name: string): Promise<unknown> {
  const file = join(dir, name)
  const text = await readFile(file, 'utf8').catch((cause: unknown) => {
    throw new Error(`cannot read bundle file ${file}`, { cause })
  })
  try {
    return JSON.parse(text)
  } catch (cause) {
    throw new Error(`bundle file ${file} is not valid JSON`, { cause })
  }
}

/** Read and validate the data files in `dir`. */
export async function readData(dir: string): Promise<{ bundle: Bundle; dexEntries: unknown }> {
  const keys = Object.keys(BUNDLE_FILES) as (keyof Bundle)[]
  const [dexEntries, ...parts] = await Promise.all([DEX_ENTRIES_FILE, ...keys.map((key) => BUNDLE_FILES[key])].map((name) => readJson(dir, name)))
  const bundle = validateBundle(Object.fromEntries(keys.map((key, i) => [key, parts[i]])) as RawBundle)
  return { bundle, dexEntries: validateDexEntries(dexEntries, bundle.forms.length) }
}
