import { Fragment, useState } from 'react'
import type { Translate } from '../i18n/ui.ts'
import type { Detail, EncounterDetail, EvolutionStage, ReadyData, Row } from '../worker/protocol.ts'
import { Dialog } from './Dialog.tsx'
import { type Picture, pictureUrl, picturesOf, spriteUrl } from './images.ts'
import { statRange } from './statRanges.ts'
import { TYPE_COLORS } from './typecolors.ts'

const STAT_HEADERS = ['HP', 'Atk', 'Def', 'SpA', 'SpD', 'Spe']
// The highest base stat there is, for scaling the bars and the plot.
const STAT_SCALE = 255

interface Props {
  row: Row
  /** `null` while it is being worked out. */
  detail: Detail | null
  ready: ReadyData
  t: Translate
  onClose(): void
}

/**
 * The six base stats as a hexagon: HP at the top, then clockwise Attack, Defense,
 * Speed, Sp. Def, and Sp. Atk, as the games draw it. A stat's distance from the
 * center goes with its square root, so that low stats are not lost at the center.
 */
function StatPlot({ stats, t }: { stats: number[]; t: Translate }) {
  const order = [0, 1, 2, 5, 4, 3]
  const radius = 70
  const point = (corner: number, scale: number) => {
    const angle = (Math.PI / 3) * corner - Math.PI / 2
    return [100 + radius * scale * Math.cos(angle), 92 + radius * scale * Math.sin(angle)] as const
  }
  const outline = (scale: (corner: number) => number) => order.map((_, corner) => point(corner, scale(corner)).join(',')).join(' ')
  return (
    <svg className="stat-plot" viewBox="0 0 200 184" width={200} height={184} role="img" aria-label={order.map((stat) => `${t(STAT_HEADERS[stat]!)} ${stats[stat]}`).join(', ')}>
      {[1, 2 / 3, 1 / 3].map((scale) => <polygon key={scale} className="stat-plot-grid" points={outline(() => scale)} />)}
      {order.map((_, corner) => <line key={corner} className="stat-plot-grid" x1={100} y1={92} x2={point(corner, 1)[0]} y2={point(corner, 1)[1]} />)}
      <polygon className="stat-plot-area" points={outline((corner) => Math.sqrt(Math.min(stats[order[corner]!]!, STAT_SCALE) / STAT_SCALE))} />
      {order.map((stat, corner) => {
        const [x, y] = point(corner, 1.2)
        return <text key={stat} className="stat-plot-label" x={x} y={y} textAnchor="middle" dominantBaseline="middle">{t(STAT_HEADERS[stat]!)}</text>
      })}
    </svg>
  )
}

/**
 * An evolutionary line as running text: a form, then after an arrow what it evolves
 * into, each with how in brackets, and the alternatives, if several, between slashes.
 */
function Stage({ stage, name }: { stage: EvolutionStage; name(form: number): string }) {
  return (
    <>
      {stage.how !== null && <span className="muted"> → ({stage.how}) </span>}
      {stage.current ? <strong>{name(stage.form)}</strong> : name(stage.form)}
      {stage.into.length > 1 && ' ['}
      {stage.into.map((next, i) => (
        <span key={next.form}>
          {i > 0 && <span className="muted"> /</span>}
          <Stage stage={next} name={name} />
        </span>
      ))}
      {stage.into.length > 1 && ' ]'}
    </>
  )
}

/** Which of the columns that may be empty a table of encounters has something in. */
interface EncounterColumns { rate: boolean; conditions: boolean; game: boolean }

function encounterColumns(encounters: EncounterDetail[], games: number[]): EncounterColumns {
  return {
    rate: encounters.some((encounter) => encounter.rate !== null || encounter.slots.some((slot) => slot.rate !== null)),
    conditions: encounters.some((encounter) => encounter.conditions.length > 0),
    game: encounters.some((encounter) => encounter.games.length !== games.length),
  }
}

/** The rows of one encounter: its own and, once it is opened, one per slot it is made of. */
function EncounterRows({ encounter, columns, games, ready }: { encounter: EncounterDetail; columns: EncounterColumns; games: number[]; ready: ReadyData }) {
  const [open, setOpen] = useState(false)
  const several = encounter.slots.length > 0
  return (
    <>
      <tr className={encounter.matches ? 'matches' : undefined}>
        <td>
          {several
            ? <button type="button" className="expand" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? '▾' : '▸'}</button>
            : <span className="expand" aria-hidden="true" />}
          {encounter.place}
        </td>
        <td>{encounter.method}</td>
        <td className="cell-stat">{encounter.levels}</td>
        {columns.rate && <td className="cell-stat">{encounter.rate ?? ''}</td>}
        {columns.conditions && <td>{encounter.conditions.join(', ')}</td>}
        {columns.game && <td className="muted">{encounter.games.length === games.length ? '' : encounter.games.map((id) => ready.games[id]!.inGroup).join(', ')}</td>}
      </tr>
      {open && encounter.slots.map((slot, i) => (
        <tr key={i} className={slot.matches ? 'slot matches' : 'slot'}>
          <td /><td />
          <td className="cell-stat">{slot.levels}</td>
          {columns.rate && <td className="cell-stat">{slot.rate ?? ''}</td>}
          {columns.conditions && <td />}{columns.game && <td />}
        </tr>
      ))}
    </>
  )
}

/** One form in full: its artwork, its values in the game its row shows, and where it is found and what it learns in each group of games. */
export function DetailDialog({ row, detail, ready, t, onClose }: Props) {
  // The kind of picture chosen; one that the form lacks gives way to the first it has.
  const [chosen, setChosen] = useState<Picture['kind']>('art')
  // The level that the range of each stat is given at.
  const [level, setLevel] = useState(50)
  const form = ready.forms[row.form]!
  const name = (id: number) => {
    const other = ready.forms[id]!
    return other.formName === null ? other.name : `${other.name} (${other.formName})`
  }
  const pictures = picturesOf(form)
  const picture = pictures.find(({ kind }) => kind === chosen) ?? pictures[0]
  const image = picture ? pictureUrl(form, picture) : spriteUrl(form)
  const shownGroup = ready.games[row.game]!.group
  return (
    <Dialog label={name(row.form)} onClose={onClose}>
      <header className="detail-header">
        <h2>
          <span className="dex">#{String(form.dex).padStart(4, '0')}</span> {form.name}
          {form.formName !== null && <span className="form-name"> {form.formName}</span>}
        </h2>
        <button type="button" className="dialog-close" aria-label={t('Close')} onClick={onClose}>×</button>
      </header>
      {detail !== null && <p className="classification">{detail.classification}</p>}
      <div className="detail-top">
        <div className="detail-values">
          <h3>{t('Types')}</h3>
          <p className="cell-types">
            {row.types.map((type) => <span key={type} className="type" style={{ background: TYPE_COLORS[type] }}>{ready.types[type]}</span>)}
          </p>
          <h3>{t('Abilities')}</h3>
          <p className="cell-abilities">
            {row.abilities === null ? '—' : row.abilities.map(([ability, slot]) => (
              <span key={`${ability}-${slot}`} className={slot === ready.hiddenSlot ? 'ability ability-hidden' : 'ability'} title={slot === ready.hiddenSlot ? t('Hidden ability') : undefined}>
                {ready.abilities[ability]}
              </span>
            ))}
          </p>
          {detail !== null && (
            <dl className="facts">
              {detail.facts.map((fact) => <div key={fact.label}><dt>{t(fact.label)}</dt><dd>{fact.value}</dd></div>)}
            </dl>
          )}
        </div>
        <div className="detail-art">
          {image !== null && <img src={image} alt="" width={240} height={240} />}
          {pictures.length > 1 && (
            <span className="toggle" role="group" aria-label={t('Picture')}>
              {pictures.map(({ kind, label }) => (
                <button key={kind} type="button" aria-pressed={kind === picture?.kind} onClick={() => setChosen(kind)}>{t(label)}</button>
              ))}
            </span>
          )}
        </div>
      </div>
      <section className="detail-stats">
        <div>
          <table className="stats">
            <thead>
              <tr>
                <th colSpan={3}>{t('Base stats')}</th>
                <th colSpan={2} className="stat-range">
                  <span className="toggle" role="group" aria-label={t('Level')}>
                    {[50, 100].map((choice) => (
                      <button key={choice} type="button" aria-pressed={level === choice} onClick={() => setLevel(choice)}>{t('Lv. {level}', { level: choice })}</button>
                    ))}
                  </span>
                </th>
              </tr>
              <tr>
                <th colSpan={3} />
                <th className="stat-range" title={t('With no IVs or EVs and a hindering nature')}>{t('Min')}</th>
                <th className="stat-range" title={t('With 31 IVs, 252 EVs, and a helpful nature')}>{t('Max')}</th>
              </tr>
            </thead>
            <tbody>
              {row.stats.map((stat, i) => (
                <tr key={i}>
                  <th scope="row">{t(STAT_HEADERS[i]!)}</th>
                  <td className="cell-stat">{stat}</td>
                  <td className="stat-bar"><span style={{ width: `${(100 * stat) / STAT_SCALE}%` }} /></td>
                  {statRange(stat, level, i === 0).map((value, column) => <td key={column} className="cell-stat stat-range">{value}</td>)}
                </tr>
              ))}
              <tr>
                <th scope="row">{t('BST')}</th>
                <td className="cell-stat cell-bst">{row.stats.reduce((sum, stat) => sum + stat, 0)}</td>
                <td colSpan={3} />
              </tr>
            </tbody>
          </table>
          <p className="status">{t('As in {game}', { game: ready.groups[shownGroup]!.name })}</p>
        </div>
        <StatPlot stats={row.stats} t={t} />
      </section>
      {detail === null ? <p className="status">{t('Loading data…')}</p> : (
        <>
          {detail.evolution !== null && (
            <section>
              <h3>{t('Evolution')}</h3>
              <p className="evolution"><Stage stage={detail.evolution} name={name} /></p>
            </section>
          )}
          <details className="detail-section">
            <summary>{t('Encounters')}</summary>
            {detail.groups.every((group) => group.encounters.length === 0) && <p className="status">—</p>}
            {detail.groups.filter((group) => group.encounters.length > 0).map(({ group, encounters }) => {
              const games = ready.groups[group]!.games
              const columns = encounterColumns(encounters, games)
              return (
                <details key={group} open={group === shownGroup}>
                  <summary>{ready.groups[group]!.name} <span className="muted">({encounters.length})</span></summary>
                  <table className="listing">
                    <thead>
                      <tr>
                        <th>{t('Location')}</th><th>{t('Method')}</th><th className="cell-stat">{t('Level')}</th>
                        {columns.rate && <th className="cell-stat">{t('Rate')}</th>}
                        {columns.conditions && <th>{t('Conditions')}</th>}
                        {columns.game && <th>{t('Game')}</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {encounters.map((encounter, i) => (
                        <Fragment key={i}>
                          {encounter.region !== encounters[i - 1]?.region && (
                            <tr className="region"><th colSpan={3 + Number(columns.rate) + Number(columns.conditions) + Number(columns.game)} scope="rowgroup">{encounter.region}</th></tr>
                          )}
                          <EncounterRows encounter={encounter} columns={columns} games={games} ready={ready} />
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </details>
              )
            })}
          </details>
          <details className="detail-section">
            <summary>{t('Moves')}</summary>
            {detail.groups.filter((group) => group.moves.length > 0).map(({ group, moves }) => (
              <details key={group} open={group === ready.groups[shownGroup]!.base}>
                <summary>{ready.groups[group]!.name} <span className="muted">({moves.length})</span></summary>
                <table className="listing">
                  <thead>
                    <tr>
                      <th>{t('Move')}</th><th>{t('Type')}</th><th>{t('Category')}</th><th className="cell-stat">{t('Power')}</th>
                      <th className="cell-stat">{t('Accuracy')}</th><th>{t('Learned')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {moves.map((move) => (
                      <tr key={move.name} className={move.matches ? 'matches' : undefined}>
                        <td>{move.name}</td>
                        <td><span className="type" style={{ background: TYPE_COLORS[move.type] }}>{ready.types[move.type]}</span></td>
                        <td className="category">{t(move.category.charAt(0).toUpperCase() + move.category.slice(1))}</td>
                        <td className="cell-stat">{move.power > 0 ? move.power : '—'}</td>
                        <td className="cell-stat">{move.accuracy > 100 || move.accuracy === 0 ? '—' : move.accuracy}</td>
                        <td>{move.how.join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            ))}
          </details>
          {detail.dexEntries.length > 0 && (
            <details className="detail-section">
              <summary>{t('Pokédex entries')}</summary>
              <table className="entries">
                <tbody>
                  {detail.dexEntries.map((entry, i) => <tr key={i}><th scope="row">{entry.games.join(', ')}</th><td>{entry.text}</td></tr>)}
                </tbody>
              </table>
            </details>
          )}
        </>
      )}
    </Dialog>
  )
}
