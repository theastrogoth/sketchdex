import { record, string } from '../data/check.ts'
import { buildDataset } from '../data/dataset.ts'
import { BUNDLE_FILES, DEX_ENTRIES_FILE, IMAGES_FILE, type Bundle, type DexEntry } from '../data/schema.ts'
import { validateBundle, validateDexEntries, validateImages, type RawBundle } from '../data/validate.ts'
import { QueryError } from '../engine/common.ts'
import { isLanguage, translationsFile } from '../i18n/languages.ts'
import { createHandler, type Handler } from './handler.ts'
import type { Answers, Request, WorkerMessage } from './protocol.ts'

// Loads the data, then answers the page's requests.

const scope = self as unknown as {
  postMessage(message: WorkerMessage): void
  onmessage: ((event: MessageEvent<Request>) => void) | null
}

async function fetchJson(name: string): Promise<unknown> {
  const url = new URL(`${import.meta.env.BASE_URL}data/${name}`, self.location.origin)
  const response = await fetch(url)
  if (!response.ok) throw new Error(`cannot load ${url}: ${response.status} ${response.statusText}`)
  return response.json()
}

async function load(): Promise<Handler> {
  const keys = Object.keys(BUNDLE_FILES) as (keyof Bundle)[]
  const [images, ...parts] = await Promise.all([IMAGES_FILE, ...keys.map((key) => BUNDLE_FILES[key])].map(fetchJson))
  const bundle = validateBundle(Object.fromEntries(keys.map((key, i) => [key, parts[i]])) as RawBundle)
  return createHandler(buildDataset(bundle), validateImages(images, bundle.forms.length))
}

// A refused query is the user's to fix, and reads better without the error's name.
const message = (error: unknown) => (error instanceof QueryError ? error.message : error instanceof Error ? `${error.name}: ${error.message}` : String(error))

// Requests are answered one at a time, in the order they arrive.
let queue: Promise<unknown> = Promise.resolve()

// The Pokédex entries, which are large and only shown on request, are loaded when first asked for.
let dexEntries: Promise<DexEntry[][]> | undefined

async function answer(handler: Handler, request: Request): Promise<Answers[keyof Answers]> {
  if (request.kind === 'detail') {
    dexEntries ??= fetchJson(DEX_ENTRIES_FILE).then((entries) => validateDexEntries(entries, handler.ready().forms.length))
    return handler.detail(request, await dexEntries)
  }
  if (request.kind !== 'language') return handler.answer(request as Request & { kind: Exclude<keyof Answers, 'language' | 'detail'> })
  if (!isLanguage(request.text)) throw new Error(`unknown language "${request.text}"`)
  const translations = request.text === 'en' ? {} : record(string)(await fetchJson(translationsFile(request.text)), [translationsFile(request.text)])
  handler.setLanguage(request.text, translations)
  return handler.ready()
}

const handler = load()
handler.then(
  (loaded) => scope.postMessage({ kind: 'ready', data: loaded.ready() }),
  (error: unknown) => scope.postMessage({ kind: 'failed', message: message(error) }),
)

scope.onmessage = ({ data: request }) => {
  queue = queue.then(async () => {
    try {
      scope.postMessage({ kind: 'answer', id: request.id, answer: await answer(await handler, request) })
    } catch (error) {
      scope.postMessage({ kind: 'error', id: request.id, message: message(error) })
    }
  })
}
