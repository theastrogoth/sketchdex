import { useEffect, useRef, useState } from 'react'
import { LANGUAGES, isLanguage, type Language } from './i18n/languages.ts'
import { translator } from './i18n/ui.ts'
import { tokensToText, type QueryToken } from './query/tokens.ts'
import { DetailDialog } from './ui/DetailDialog.tsx'
import { HelpDialog } from './ui/HelpDialog.tsx'
import { QueryInput } from './ui/QueryInput.tsx'
import { Results } from './ui/Results.tsx'
import { createEngineClient } from './worker/client.ts'
import type { Detail, Matches, ReadyData, Row } from './worker/protocol.ts'

const client = createEngineClient()

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

function App() {
  const [ready, setReady] = useState<ReadyData | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  // `null` until the query in the address has been read.
  const [tokens, setTokens] = useState<QueryToken[] | null>(null)
  const [matches, setMatches] = useState<Matches | null>(null)
  // What is wrong with the query as a whole, if it cannot be evaluated.
  const [refusal, setRefusal] = useState<string | null>(null)
  const latestQuery = useRef(0)
  // The row shown in full, with what the worker has to add about it once that has arrived.
  const [selected, setSelected] = useState<{ row: Row; detail: Detail | null } | null>(null)
  const [help, setHelp] = useState(false)

  const fail = (error: unknown) => setFailure(errorMessage(error))

  useEffect(() => {
    const parameters = new URLSearchParams(location.search)
    const language = parameters.get('lang')
    // The worker answers in order, so the query is read with the language's names.
    const loaded = isLanguage(language) && language !== 'en' ? client.ask('language', language) : client.ready
    loaded.then(setReady, fail)
    client.ask('parse', parameters.get('q') ?? '').then((parsed) => setTokens(parsed.tokens), fail)
  }, [])

  function select(row: Row) {
    setSelected({ row, detail: null })
    client.ask('detail', text ?? '', { form: row.form, lo: row.lo, hi: row.hi, game: row.game }).then(
      (detail) => setSelected((current) => (current?.row === row ? { row, detail } : current)),
      fail,
    )
  }

  function runExample(example: string) {
    setHelp(false)
    client.ask('parse', example).then((parsed) => setTokens(parsed.tokens), fail)
  }

  function changeLanguage(language: Language) {
    const url = new URL(location.href)
    if (language === 'en') url.searchParams.delete('lang')
    else url.searchParams.set('lang', language)
    history.replaceState(null, '', url)
    client.ask('language', language).then(setReady, fail)
    // The chips are named again in the new language.
    if (text !== null) client.ask('parse', text).then((parsed) => setTokens(parsed.tokens), fail)
  }

  const query = tokens === null ? null : tokensToText(tokens)
  const text = query?.text ?? null
  useEffect(() => {
    if (text === null) return
    const url = new URL(location.href)
    if (text === '') url.searchParams.delete('q')
    else url.searchParams.set('q', text)
    history.replaceState(null, '', url)
    const request = ++latestQuery.current
    client.ask('query', text).then(
      (answer) => {
        if (request !== latestQuery.current) return
        setMatches(answer)
        setRefusal(null)
      },
      (error: unknown) => {
        if (request !== latestQuery.current) return
        setRefusal(errorMessage(error))
        // The rows of the last query that could be evaluated stay; its problems do not apply.
        setMatches((last) => last && { ...last, diagnostics: [] })
      },
    )
  }, [text])

  if (failure !== null) {
    return (
      <main>
        <h1><img className="logo" src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width={22} height={22} /> SketchDex</h1>
        <p className="problem" role="alert">{failure}</p>
      </main>
    )
  }
  const language = ready?.language ?? 'en'
  const t = translator(language)
  const diagnostics = matches?.diagnostics ?? []
  const flagged = (query?.spans ?? []).map(([start, end]) => diagnostics.some((d) => d.start < end && start < d.end))
  return (
    <main>
      <header className="top">
        <h1><img className="logo" src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width={22} height={22} /> SketchDex</h1>
        <span className="settings">
          <button type="button" className="help" onClick={() => setHelp(true)}>{t('Help')}</button>
          <select aria-label={t('Language')} value={language} onChange={(event) => changeLanguage(event.target.value as Language)}>
            {Object.entries(LANGUAGES).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
          </select>
        </span>
      </header>
      {tokens !== null && <QueryInput tokens={tokens} flagged={flagged} onChange={setTokens} ask={client.ask} t={t} />}
      {diagnostics.map((d, i) => <p key={i} className="problem" role="alert">{d.message}</p>)}
      {refusal !== null && <p className="problem" role="alert">{refusal}</p>}
      {ready === null || matches === null
        ? <p className="status">{t('Loading data…')}</p>
        : (
            <>
              {matches.description !== null && <p className="description">{matches.description}</p>}
              <p className="status">{matches.rows.length === 1 ? t('1 form') : t('{n} forms', { n: matches.rows.length })}</p>
              <Results rows={matches.rows} ready={ready} t={t} onSelect={select} />
            </>
          )}
      {selected !== null && ready !== null && (
        <DetailDialog key={selected.row.form} row={selected.row} detail={selected.detail} ready={ready} t={t} onClose={() => setSelected(null)} />
      )}
      {help && <HelpDialog t={t} onClose={() => setHelp(false)} onExample={runExample} />}
    </main>
  )
}

export default App
