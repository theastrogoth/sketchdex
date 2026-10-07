import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { SCOPES, type Scope } from '../engine/expr.ts'
import type { Translate } from '../i18n/ui.ts'
import type { Op, QueryToken, Suggestion } from '../query/tokens.ts'
import type { Answers, RequestOptions } from '../worker/protocol.ts'
import { TYPE_COLORS } from './typecolors.ts'

interface Props {
  tokens: QueryToken[]
  /** Per token, whether the query has a problem there. */
  flagged: boolean[]
  onChange(tokens: QueryToken[]): void
  ask<K extends keyof Answers>(kind: K, text: string, options?: RequestOptions): Promise<Answers[K]>
  t: Translate
}

// A group such as "Weak to (every ability)", in the interface's language.
// Groups whose name says nothing that the filter's own does not: "Legendary", "BST > 500".
const UNLABELED = new Set(['Tag', 'Comparison'])

function groupLabel(group: string, t: Translate): string {
  if (UNLABELED.has(group)) return ''
  const [, base, mode] = /^(.*?)(?: \((.*)\))?$/.exec(group)!
  return mode === undefined ? t(base!) : `${t(base!)} (${t(mode)})`
}

// Characters that, typed on their own, add an operator.
const SYMBOLS: Record<string, Op> = { '(': '(', ')': ')', '&': 'and', ',': 'and', '|': 'or', '!': 'not' }
const OP_LABELS: Record<Op, string> = {
  'and': 'AND', 'or': 'OR', 'not': 'NOT', '(': '(', ')': ')', 'family(': 'FAMILY OF (', 'prevo(': 'EVOLVES FROM (', 'evo(': 'EVOLVES INTO (',
  'move(': 'LEARNS A MOVE (', 'encounter(': 'ENCOUNTERED (', 'anygame(': 'IN ANY GAME (',
}

// The `move(` or `encounter(` group that a filter added after `tokens` would be in, if any.
function openScope(tokens: QueryToken[]): Scope | undefined {
  const open: (Scope | undefined)[] = []
  for (const token of tokens) {
    if (token.kind !== 'op') continue
    if (token.op === ')') open.pop()
    else if (token.op.endsWith('(')) open.push(SCOPES.find((scope) => token.op === `${scope}(`))
  }
  return open.findLast((scope) => scope !== undefined)
}

function Chip({ token, flagged, onRemove, t }: { token: QueryToken; flagged: boolean; onRemove(): void; t: Translate }) {
  const label = token.kind === 'op' ? t(OP_LABELS[token.op]) : token.label
  const color = token.kind === 'leaf' && token.type ? TYPE_COLORS[token.type] : undefined
  return (
    <span className={`chip chip-${token.kind}${flagged ? ' chip-flagged' : ''}`} style={color ? { background: color, borderColor: color, color: '#fff' } : undefined}>
      {token.kind === 'leaf' && !color && groupLabel(token.group, t) !== '' && <span className="chip-group">{groupLabel(token.group, t)}</span>}
      <span>{label}</span>
      <button type="button" className="chip-remove" aria-label={t('Remove {label}', { label })} onMouseDown={(event) => event.preventDefault()} onClick={onRemove}>×</button>
    </span>
  )
}

/**
 * The query as a row of chips with a text field among them. Typing lists matching
 * filters; Enter adds the highlighted one, or reads what was typed as a whole query.
 */
export function QueryInput({ tokens, flagged, onChange, ask, t }: Props) {
  // The number of tokens before the text field; `null` keeps it after the last one.
  const [caret, setCaret] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [active, setActive] = useState(0)
  const [problem, setProblem] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const latestRequest = useRef(0)
  const refocus = useRef(false)
  const listId = useId()
  const at = caret === null ? tokens.length : Math.min(caret, tokens.length)
  const scope = openScope(tokens.slice(0, at))

  // Moving the field among the chips moves its element, which drops the focus.
  useEffect(() => {
    if (refocus.current) input.current?.focus()
    refocus.current = false
  })

  function clearDraft() {
    latestRequest.current++
    setDraft('')
    setSuggestions([])
    setProblem(null)
  }

  function moveTo(position: number, count: number) {
    refocus.current = true
    setCaret(position >= count ? null : position)
  }

  function insert(added: QueryToken[]) {
    onChange([...tokens.slice(0, at), ...added, ...tokens.slice(at)])
    moveTo(at + added.length, tokens.length + added.length)
    clearDraft()
  }

  function remove(index: number) {
    onChange(tokens.filter((_, i) => i !== index))
    moveTo(index < at ? at - 1 : at, tokens.length - 1)
  }

  function type(value: string) {
    const symbol = SYMBOLS[value.trim()]
    const keyword = /^(and|or|not)\s$/i.exec(value) ?? /^((?:family|prevo|evo|move|encounter|anygame)\()$/i.exec(value)
    if (symbol !== undefined || keyword) {
      insert([{ kind: 'op', op: symbol ?? (keyword![1]!.toLowerCase() as Op) }])
      return
    }
    setDraft(value)
    setProblem(null)
    const request = ++latestRequest.current
    void ask('suggest', value, { scope }).then((list) => {
      if (request !== latestRequest.current) return
      setSuggestions(list)
      setActive(0)
    })
  }

  function accept() {
    const suggestion = suggestions[active]
    if (suggestion?.kind === 'hint') {
      // A hint is the start of a comparison, to go on typing from.
      refocus.current = true
      type(suggestion.draft)
    } else if (suggestion) {
      insert([suggestion])
    } else if (draft.trim() !== '') {
      void ask('parse', draft, { scope }).then(({ tokens: read, diagnostics }) => {
        if (diagnostics.length === 0 && read.length > 0) insert(read)
        else setProblem(diagnostics[0]?.message ?? t('nothing to add'))
      })
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const handled = () => event.preventDefault()
    if (event.key === 'Enter' || (event.key === 'Tab' && suggestions.length > 0)) {
      handled()
      accept()
    } else if (event.key === 'ArrowDown' && suggestions.length > 0) {
      handled()
      setActive((active + 1) % suggestions.length)
    } else if (event.key === 'ArrowUp' && suggestions.length > 0) {
      handled()
      setActive((active + suggestions.length - 1) % suggestions.length)
    } else if (event.key === 'Escape') {
      setSuggestions([])
    } else if (draft === '') {
      if (event.key === 'Backspace' && at > 0) remove(at - 1)
      else if (event.key === 'Delete' && at < tokens.length) remove(at)
      else if (event.key === 'ArrowLeft' && at > 0) moveTo(at - 1, tokens.length)
      else if (event.key === 'ArrowRight' && at < tokens.length) moveTo(at + 1, tokens.length)
    }
  }

  const chip = (token: QueryToken, index: number) => (
    <Chip key={index} token={token} flagged={flagged[index] ?? false} onRemove={() => remove(index)} t={t} />
  )
  return (
    <div className="query">
      <div className="query-field" onClick={() => input.current?.focus()}>
        {tokens.slice(0, at).map(chip)}
        <input
          key="input"
          ref={input}
          className="query-text"
          role="combobox"
          aria-label={t('Add a filter')}
          aria-expanded={suggestions.length > 0}
          aria-controls={listId}
          aria-activedescendant={suggestions.length > 0 ? `${listId}-${active}` : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          autoFocus
          placeholder={tokens.length === 0 ? t('Type a Pokémon, type, ability, game… or a whole query') : ''}
          value={draft}
          onChange={(event) => type(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => setSuggestions([])}
        />
        {tokens.slice(at).map((token, i) => chip(token, at + i))}
        {(tokens.length > 0 || draft !== '') && (
          <button
            type="button"
            className="query-clear"
            aria-label={t('Clear all filters')}
            title={t('Clear all filters')}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onChange([])
              moveTo(0, 0)
              clearDraft()
            }}
          >
            <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><path d="M2 2 8 8M8 2 2 8" /></svg>
          </button>
        )}
      </div>
      <ul className="suggestions" id={listId} role="listbox" hidden={suggestions.length === 0}>
        {suggestions.map((suggestion, i) => (
          <li
            key={suggestion.kind === 'leaf' ? suggestion.text : suggestion.kind === 'op' ? suggestion.op : suggestion.draft}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === active}
            className={i === active ? 'suggestion suggestion-active' : 'suggestion'}
            onMouseDown={(event) => {
              event.preventDefault()
              if (suggestion.kind === 'hint') type(suggestion.draft)
              else insert([suggestion])
            }}
          >
            <span className="suggestion-group">{suggestion.kind === 'op' ? t('Group') : groupLabel(suggestion.group, t)}</span>
            {suggestion.kind === 'op' ? `${t(OP_LABELS[suggestion.op])} … )` : suggestion.label}
          </li>
        ))}
      </ul>
      {problem !== null && <p className="problem" role="alert">{problem}</p>}
    </div>
  )
}

