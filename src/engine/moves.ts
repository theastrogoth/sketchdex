import type { Dataset, Version } from '../data/dataset.ts'
import { parseLearnCode, type VersionedMoveField, type VersionedMoveFields } from '../data/schema.ts'
import type { Domain } from './domain.ts'
import { COMPARE, QueryError, slugify } from './common.ts'
import type { Expr, MoveAttribute, Operand } from './expr.ts'
import { addGames, difference, emptyPairs, intersection, union, type PairSet } from './pairset.ts'

/** The slug of a move flag: `makesContact` is `contact`, `isSheerForce` is `sheer-force`. */
export function flagSlug(flag: string): string {
  return slugify(flag.replace(/^(is|makes)/, '').replace(/([a-z])([A-Z])/g, '$1-$2'))
}

const usesAttribute = (expr: Expr, attribute?: MoveAttribute) => expr.kind === 'compare'
  && [expr.left, expr.right].some((o) => o.kind === 'moveAttribute' && (attribute === undefined || o.attribute === attribute))
// A condition on how a move is learned rather than on the move.
const isLink = (expr: Expr) => expr.kind === 'learn' || usesAttribute(expr, 'learnLevel')

/** One way a form learns a move. */
export interface Learned {
  /** A move id. */
  move: number
  method: string
  level: number | null
  /** The mask of the games in which it is learned this way. */
  lo: number
  hi: number
}

export interface MoveDomain extends Domain {
  /** The ways `form` learns moves that satisfy all of `parts`, in games of `games` (one form's mask of a `PairSet`). */
  learnedBy(parts: Expr[], form: number, games: PairSet): Learned[]
}

/**
 * Conditions on moves. Sets of moves are sets of (move, game) pairs, laid out as a
 * `PairSet` is for forms, as a move's type, category, power, accuracy, and PP depend
 * on the game.
 */
export function createMoveDomain(dataset: Dataset): MoveDomain {
  const { moves, forms, learnsets, meta } = dataset.bundle
  const { moveGames, moveVersions, gameSetMasks } = dataset
  const ids = new Map(moves.map((move, id) => [move.slug, id]))
  const flags = moves.map((move) => new Set(move.flags.map(flagSlug)))
  const allFlags = new Set(flags.flatMap((set) => [...set]))
  const methods = new Set(Object.values(meta.learnMethods))

  // Per form, each way it learns a move: the move, the games, the method, and the level if by level.
  let learned: { move: number; lo: number; hi: number; method: string; level: number | null }[][] | undefined
  function learnedMoves() {
    return learned ??= learnsets.map((learnset) => Object.entries(learnset).flatMap(([move, codes]) => codes.map((text) => {
      const code = parseLearnCode(text)!
      return { move: Number(move), lo: gameSetMasks[2 * code.gameSet]!, hi: gameSetMasks[2 * code.gameSet + 1]!, method: meta.learnMethods[code.method]!, level: code.level }
    })))
  }

  function movesWhere(test: (id: number) => boolean): PairSet {
    const set = emptyPairs(moves.length)
    for (let id = 0; id < moves.length; id++) {
      if (test(id)) addGames(set, id, moveGames[2 * id]!, moveGames[2 * id + 1]!)
    }
    return set
  }
  function versionsWhere<K extends VersionedMoveField>(field: K, test: (value: VersionedMoveFields[K]) => boolean): PairSet {
    const set = emptyPairs(moves.length)
    moveVersions[field].forEach((versions, id) => {
      for (const version of versions) {
        if (test(version.value)) addGames(set, id, version.lo, version.hi)
      }
    })
    return set
  }

  function operandVersions(operand: Operand, id: number): Version<number | null>[] {
    const everywhere = (value: number | null) => [{ lo: moveGames[2 * id]!, hi: moveGames[2 * id + 1]!, value }]
    if (operand.kind === 'number') return everywhere(operand.value)
    if (operand.kind !== 'moveAttribute') throw new QueryError('a comparison about a move can only involve numbers and what moves have')
    if (operand.attribute === 'priority') return everywhere(moves[id]!.priority)
    if (operand.attribute === 'learnLevel') throw new QueryError('the level a move is learned at can only be compared with a number')
    return moveVersions[operand.attribute][id]!
  }

  function evaluate(expr: Expr): PairSet {
    switch (expr.kind) {
      case 'and': return expr.args.map(evaluate).reduce(intersection, moveGames)
      case 'or': return expr.args.map(evaluate).reduce(union, emptyPairs(moves.length))
      case 'not': return difference(moveGames, evaluate(expr.arg))
      case 'move': {
        const id = ids.get(expr.move)
        if (id === undefined) throw new QueryError(`unknown move "${expr.move}"`)
        return movesWhere((move) => move === id)
      }
      case 'moveType': return versionsWhere('type', (type) => type === expr.type)
      case 'category': return versionsWhere('category', (category) => category === expr.category)
      case 'flag':
        if (!allFlags.has(expr.flag)) throw new QueryError(`unknown move flag "${expr.flag}"`)
        return movesWhere((move) => flags[move]!.has(expr.flag))
      case 'compare': {
        if (isLink(expr)) break
        const set = emptyPairs(moves.length)
        for (let id = 0; id < moves.length; id++) {
          const rights = operandVersions(expr.right, id)
          for (const l of operandVersions(expr.left, id)) {
            for (const r of rights) {
              if (l.value !== null && r.value !== null && COMPARE[expr.comparator](l.value, r.value)) addGames(set, id, l.lo & r.lo, l.hi & r.hi)
            }
          }
        }
        return set
      }
      case 'learn': break
      default: throw new QueryError('a filter on Pokémon cannot be among the filters on one move')
    }
    throw new QueryError('how a move is learned can only be joined to the filters on the move by "and"')
  }

  // Whether a way of learning a move passes the condition `link`.
  function passes(link: Expr, method: string, level: number | null): boolean {
    if (link.kind === 'learn') {
      if (!methods.has(link.method)) throw new QueryError(`unknown way of learning a move "${link.method}"`)
      return method === link.method
    }
    if (link.kind !== 'compare') return true
    const [attribute, number] = link.left.kind === 'number' ? [link.right, link.left] : [link.left, link.right]
    if (number.kind !== 'number' || attribute.kind !== 'moveAttribute') throw new QueryError('the level a move is learned at can only be compared with a number')
    if (level === null) return false
    return link.left.kind === 'number' ? COMPARE[link.comparator](number.value, level) : COMPARE[link.comparator](level, number.value)
  }

  return {
    owns: (expr) => expr.kind === 'move' || expr.kind === 'moveType' || expr.kind === 'category' || expr.kind === 'flag' || expr.kind === 'learn' || usesAttribute(expr),
    // How a move is learned applies to each move asked about: "Surf and Fly by TM" is both by TM.
    attribute: (expr) => (isLink(expr) ? '*' : expr.kind === 'move' ? '!' : expr.kind === 'moveType' || expr.kind === 'category' ? expr.kind
      : expr.kind === 'flag' ? `flag:${expr.flag}` : null),
    lift(parts) {
      const links = parts.filter(isLink)
      const matching = parts.filter((part) => !isLink(part)).map(evaluate).reduce(intersection, moveGames)
      const set = emptyPairs(forms.length)
      learnedMoves().forEach((ways, form) => {
        for (const way of ways) {
          const lo = way.lo & matching[2 * way.move]!
          const hi = way.hi & matching[2 * way.move + 1]!
          if ((lo !== 0 || hi !== 0) && links.every((link) => passes(link, way.method, way.level))) addGames(set, form, lo, hi)
        }
      })
      return set
    },
    learnedBy(parts, form, games) {
      const links = parts.filter(isLink)
      const matching = parts.filter((part) => !isLink(part)).map(evaluate).reduce(intersection, moveGames)
      return learnedMoves()[form]!.flatMap((way) => {
        const lo = way.lo & matching[2 * way.move]! & games[0]!
        const hi = way.hi & matching[2 * way.move + 1]! & games[1]!
        return (lo !== 0 || hi !== 0) && links.every((link) => passes(link, way.method, way.level)) ? [{ move: way.move, method: way.method, level: way.level, lo, hi }] : []
      })
    },
  }
}
