import type { Expr, Operand, Term } from '../engine/expr.ts'

function printTerm(term: Term): string {
  switch (term.kind) {
    case 'type': return `type:${term.type}`
    case 'ability': return `${term.hidden === undefined ? 'ability' : term.hidden ? 'hidden' : 'regular'}:${term.ability}`
    case 'eggGroup': return `egg:${term.group}`
    case 'game': return `game:${term.game}`
    case 'generation': return `gen:${term.generation}`
    case 'introduced': return `introduced:${term.generation}`
    case 'versionGroup': return `vg:${term.versionGroup}`
    case 'obtain': return term.in ? `${term.status}:${print(term.in).replace(/^game:/, '').replace(':', '-')}` : `obtain:${term.status}`
    case 'matchup': return `${term.abilities === 'all' ? 'always-' : term.abilities === 'ignore' ? 'base-' : ''}${term.relation}:${term.type}`
    case 'evolution': return `is:${term.state}`
    case 'evolves': return 'item' in term ? `evolves-with:${term.item}` : 'move' in term ? `evolves-knowing:${term.move}` : `evolves:${'when' in term ? term.when : term.trigger}`
    case 'growth': return `growth:${term.rate}`
    case 'has': return `has:${term.what}`
    case 'held': return `holds:${term.item}`
    case 'tag': return `tag:${term.tag}`
    case 'gender': return `gender:${term.gender}`
    case 'species': return `species:${term.species}`
    case 'move': return `move:${term.move}`
    case 'moveType': return `movetype:${term.type}`
    case 'category': return `category:${term.category}`
    case 'flag': return `flag:${term.flag}`
    case 'learn': return `learn:${term.method}`
    case 'place': return `place:${term.place}`
    case 'region': return `region:${term.region}`
    case 'method': return `method:${term.method}`
    case 'time': return `${term.only ? 'only' : 'time'}:${term.time}`
    case 'season': return `${term.only ? 'only' : 'season'}:${term.season}`
    case 'weather': return `${term.only ? 'only' : 'weather'}:${term.weather}`
    case 'encounter': return `enc:${term.trait}`
    case 'form': return `form:${term.species}/${term.form}`
  }
}

const printOperand = (operand: Operand) =>
  operand.kind === 'number' ? String(operand.value) : operand.kind === 'matchup' ? `vs:${operand.type}` : operand.attribute.toLowerCase()

/** A group's opening, as written: `prevo` and `move` are written `prevo(` and `move(`. */
export const opening = (expr: Extract<Expr, { kind: 'kin' | 'in' | 'anygame' }>) => `${expr.kind === 'kin' ? expr.kinship : expr.kind === 'in' ? expr.scope : 'anygame'}(`

/**
 * The canonical text of `expr`, which `parse` reads back in any language as an equal
 * expression (or, for an `and` or `or` of one argument, as that argument). Throws
 * for an `and` or `or` without arguments, which has no text.
 */
export function print(expr: Expr): string {
  const nested = (arg: Expr) => (arg.kind === 'and' || arg.kind === 'or' ? `(${print(arg)})` : print(arg))
  switch (expr.kind) {
    case 'and':
    case 'or':
      if (expr.args.length === 0) throw new Error(`cannot print an "${expr.kind}" without arguments`)
      return expr.args.map(nested).join(expr.kind === 'and' ? ' & ' : ' | ')
    case 'not': return expr.arg.kind === 'compare' ? `!(${print(expr.arg)})` : `!${nested(expr.arg)}`
    case 'kin':
    case 'in':
    case 'anygame': return `${opening(expr)}${print(expr.arg)})`
    case 'compare': return `${printOperand(expr.left)} ${expr.comparator} ${printOperand(expr.right)}`
    default: return printTerm(expr)
  }
}
