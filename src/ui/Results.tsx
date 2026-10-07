import { useState } from 'react'
import { Virtuoso } from 'react-virtuoso'
import type { Translate } from '../i18n/ui.ts'
import type { ReadyData, Row } from '../worker/protocol.ts'
import { badgeUrl, spriteUrl } from './images.ts'
import { TYPE_COLORS } from './typecolors.ts'

const STAT_HEADERS = ['HP', 'Atk', 'Def', 'SpA', 'SpD', 'Spe']

/** What rows are ordered by: Pokédex number, name, base stat total, or the base stat of that index. */
type SortKey = 'dex' | 'name' | 'bst' | number
interface Sort {
  key: SortKey
  descending: boolean
}

const total = (stats: number[]) => stats.reduce((sum, stat) => sum + stat, 0)

function sorted(rows: Row[], { key, descending }: Sort, ready: ReadyData): Row[] {
  // Rows arrive in order of form id, which is Pokédex order.
  if (key === 'dex') return descending ? rows.toReversed() : rows
  const value = (row: Row) => (key === 'name' ? ready.forms[row.form]!.name : key === 'bst' ? total(row.stats) : row.stats[key]!)
  const sign = descending ? -1 : 1
  return rows.toSorted((a, b) => {
    const [x, y] = [value(a), value(b)]
    return sign * (typeof x === 'string' ? x.localeCompare(y as string) : x - (y as number)) || a.form - b.form
  })
}

function gamesOf({ lo, hi }: Row): number[] {
  const games: number[] = []
  for (let game = 0; game < 64; game++) {
    if (((game < 32 ? lo : hi) & (1 << (game & 31))) !== 0) games.push(game)
  }
  return games
}

function ResultRow({ row, ready, t, onSelect }: { row: Row; ready: ReadyData; t: Translate; onSelect(row: Row): void }) {
  const form = ready.forms[row.form]!
  const games = gamesOf(row).map((game) => ready.games[game]!.name)
  const image = spriteUrl(form)
  return (
    <div
      className="row row-result"
      role="button"
      tabIndex={0}
      onClick={() => onSelect(row)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(row)
        }
      }}
    >
      <span className="cell-art">
        {image !== null && <img src={image} alt="" width={48} height={48} loading="lazy" decoding="async" />}
        {form.badge !== null && form.sprite !== null && <img className="badge" src={badgeUrl(form.badge)} alt="" width={18} height={18} onError={(event) => { event.currentTarget.hidden = true }} />}
      </span>
      <span className="cell-name">
        <span className="dex">#{String(form.dex).padStart(4, '0')}</span> {form.name}
        {form.formName !== null && <span className="form-name"> {form.formName}</span>}
      </span>
      <span className="cell-types">
        {row.types.map((type) => <span key={type} className="type" style={{ background: TYPE_COLORS[type] }}>{ready.types[type]}</span>)}
      </span>
      <span className="cell-abilities">
        {row.abilities?.map(([ability, slot]) => (
          <span key={`${ability}-${slot}`} className={slot === ready.hiddenSlot ? 'ability ability-hidden' : 'ability'} title={slot === ready.hiddenSlot ? t('Hidden ability') : undefined}>
            {ready.abilities[ability]}
          </span>
        ))}
      </span>
      {row.stats.map((stat, i) => <span key={i} className="cell-stat">{stat}</span>)}
      <span className="cell-stat cell-bst">{total(row.stats)}</span>
      <span className="cell-games" title={games.join(', ')}>
        {games.length === 1 ? games[0] : t('{n} games', { n: games.length })}
        {row.varies && <span className="varies" title={t('Values shown are those of {game}; they differ among the matching games', { game: ready.games[row.game]!.name })}> *</span>}
      </span>
    </div>
  )
}

/** The forms matching the query, one per row, drawn only where the page is scrolled to. A row is selected by a click or Enter. */
export function Results({ rows, ready, t, onSelect }: { rows: Row[]; ready: ReadyData; t: Translate; onSelect(row: Row): void }) {
  const [sort, setSort] = useState<Sort>({ key: 'dex', descending: false })
  const header = (key: SortKey, label: string, className: string) => (
    <button
      type="button"
      className={`${className} sort`}
      aria-pressed={sort.key === key}
      onClick={() => setSort({ key, descending: sort.key === key ? !sort.descending : typeof key === 'number' || key === 'bst' })}
    >
      {label}{sort.key === key ? (sort.descending ? ' ▾' : ' ▴') : ''}
    </button>
  )
  return (
    <div className="results">
      <div className="row row-header">
        {header('dex', '#', 'cell-art')}
        {header('name', t('Pokémon'), 'cell-name')}
        <span className="cell-types">{t('Types')}</span>
        <span className="cell-abilities">{t('Abilities')}</span>
        {STAT_HEADERS.map((label, i) => header(i, t(label), 'cell-stat'))}
        {header('bst', t('BST'), 'cell-stat cell-bst')}
        <span className="cell-games">{t('Matches in')}</span>
      </div>
      <Virtuoso
        useWindowScroll
        data={sorted(rows, sort, ready)}
        computeItemKey={(_, row) => row.form}
        increaseViewportBy={400}
        itemContent={(_, row) => <ResultRow row={row} ready={ready} t={t} onSelect={onSelect} />}
      />
    </div>
  )
}
