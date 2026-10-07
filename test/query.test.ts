import { beforeAll, describe, expect, test } from 'vitest'
import { buildDataset, type Dataset } from '../src/data/dataset.ts'
import { validateBundle } from '../src/data/validate.ts'
import { createEngine } from '../src/engine/engine.ts'
import { ATTRIBUTES, COMPARATORS, type Expr } from '../src/engine/expr.ts'
import { formsOf } from '../src/engine/pairset.ts'
import { buildNameTable, normalize, type NameTable } from '../src/query/names.ts'
import { parse } from '../src/query/parser.ts'
import { print } from '../src/query/printer.ts'
import { committedDataset } from './data.ts'
import { tinyBundle } from './fixture.ts'

test('normalize', () => {
  expect(['Mr. Mime', "Farfetch'd", 'Ho-Oh', 'Type: Null', 'Flabébé', 'Nidoran♀', '  Water   1 ', 'rattata/alolan'].map(normalize))
    .toEqual(['mr mime', 'farfetchd', 'ho oh', 'type null', 'flabebe', 'nidoran f', 'water 1', 'rattata alolan'])
})

describe('a small bundle', () => {
  const names = buildNameTable(buildDataset(validateBundle(tinyBundle())))
  // The expression of a query that must have no problems.
  function expr(text: string): Expr | null {
    const result = parse(text, names)
    expect(result.diagnostics).toEqual([])
    return result.expr
  }
  const grass: Expr = { kind: 'type', type: 'grass' }
  const poison: Expr = { kind: 'type', type: 'poison' }
  const ruby: Expr = { kind: 'game', game: 'ruby' }
  const treecko: Expr = { kind: 'species', species: 'treecko' }

  test('names select terms', () => {
    expect(expr('poison')).toEqual(poison)
    expect(expr('Overgrow')).toEqual({ kind: 'ability', ability: 'overgrow' })
    expect(expr('hidden:chlorophyll')).toEqual({ kind: 'ability', ability: 'chlorophyll', hidden: true })
    expect(expr('regular:"Overgrow"')).toEqual({ kind: 'ability', ability: 'overgrow', hidden: false })
    expect(expr('Monster')).toEqual({ kind: 'eggGroup', group: 'monster' })
    expect(expr('egg:grass')).toEqual({ kind: 'eggGroup', group: 'grass' })
    expect(expr('TYPE:Grass')).toEqual(grass)
    expect(expr('Red Japan')).toEqual({ kind: 'game', game: 'red-japan' })
    expect(expr('red')).toEqual({ kind: 'game', game: 'red' })
    expect(expr('Generation III')).toEqual({ kind: 'generation', generation: 3 })
    expect(expr('gen 1')).toEqual({ kind: 'generation', generation: 1 })
    expect(expr('gen:ii')).toEqual({ kind: 'generation', generation: 2 })
    expect(expr('introduced:1')).toEqual({ kind: 'introduced', generation: 1 })
    expect(expr('Introduced in Gen III poison')).toEqual({ kind: 'and', args: [{ kind: 'introduced', generation: 3 }, poison] })
    expect(expr('introduced <= 2')).toEqual({ kind: 'compare', comparator: '<=', left: { kind: 'attribute', attribute: 'introduced' }, right: { kind: 'number', value: 2 } })
    expect(expr('catchable')).toEqual({ kind: 'obtain', status: 'catchable' })
    expect(expr('"Treecko"')).toEqual(treecko)
    expect(expr('form:bulbasaur/none')).toEqual({ kind: 'form', species: 'bulbasaur', form: 'none' })
  })

  test('operators and precedence', () => {
    expect(expr('poison ruby')).toEqual({ kind: 'and', args: [poison, ruby] })
    expect(expr('poison red japan treecko')).toEqual({ kind: 'and', args: [poison, { kind: 'game', game: 'red-japan' }, treecko] })
    expect(expr('poison | ruby treecko')).toEqual({ kind: 'or', args: [poison, { kind: 'and', args: [ruby, treecko] }] })
    expect(expr('(poison or ruby) and treecko')).toEqual({ kind: 'and', args: [{ kind: 'or', args: [poison, ruby] }, treecko] })
    expect(expr('not poison ruby')).toEqual({ kind: 'and', args: [{ kind: 'not', arg: poison }, ruby] })
    expect(expr('!(poison, ruby)')).toEqual({ kind: 'not', arg: { kind: 'and', args: [poison, ruby] } })
    expect(expr('-poison')).toEqual({ kind: 'not', arg: poison })
    expect(expr('((treecko))')).toEqual(treecko)
    expect(expr('')).toBeNull()
  })

  test('comparisons', () => {
    expect(expr('bst>=600')).toEqual({ kind: 'compare', comparator: '>=', left: { kind: 'attribute', attribute: 'bst' }, right: { kind: 'number', value: 600 } })
    expect(expr('Speed > attack')).toEqual({ kind: 'compare', comparator: '>', left: { kind: 'attribute', attribute: 'spe' }, right: { kind: 'attribute', attribute: 'atk' } })
    expect(expr('poison 0.5 < weight ruby')).toEqual({
      kind: 'and',
      args: [poison, { kind: 'compare', comparator: '<', left: { kind: 'number', value: 0.5 }, right: { kind: 'attribute', attribute: 'weight' } }, ruby],
    })
    expect(expr('catchRate == 45')).toEqual({ kind: 'compare', comparator: '=', left: { kind: 'attribute', attribute: 'catchRate' }, right: { kind: 'number', value: 45 } })
  })

  test('a name shared with an egg group means the type or species', () => {
    expect(expr('grass')).toEqual(grass)
    expect(expr('ruby Dragon')).toEqual({ kind: 'and', args: [ruby, { kind: 'type', type: 'dragon' }] })
    expect(expr('egg:dragon')).toEqual({ kind: 'eggGroup', group: 'dragon' })
    expect(expr('monster')).toEqual({ kind: 'eggGroup', group: 'monster' })
  })

  test('an ambiguous name is reported with what it could mean', () => {
    const twoMeanings = { ...names, find: (name: string) => (name === 'ivy' ? [poison, treecko] : names.find(name)) }
    expect(parse('ruby ivy', twoMeanings)).toEqual({
      expr: ruby,
      leaves: [{ start: 0, end: 4, expr: ruby }],
      diagnostics: [{ start: 5, end: 8, message: '"ivy" is ambiguous', candidates: ['type:poison', 'species:treecko'] }],
    })
  })

  test('the filters read are listed with their places', () => {
    expect(parse('poison (bst >= 600 | mew) "Treecko"', names).leaves).toEqual([
      { start: 0, end: 6, expr: poison },
      { start: 8, end: 18, expr: { kind: 'compare', comparator: '>=', left: { kind: 'attribute', attribute: 'bst' }, right: { kind: 'number', value: 600 } } },
      { start: 26, end: 35, expr: treecko },
    ])
  })

  test('problems leave the rest of the query standing', () => {
    const problems = (text: string) => {
      const { expr: parsed, diagnostics } = parse(text, names)
      return [parsed && print(parsed), ...diagnostics.map((d) => `${d.start}-${d.end} ${d.message}`)]
    }
    expect(problems('poison &')).toEqual(['type:poison', '7-8 expected a filter after "&"'])
    expect(problems('poison or')).toEqual(['type:poison', '7-9 expected a filter after "or"'])
    expect(problems('| poison')).toEqual(['type:poison', '0-1 expected a filter before "or"'])
    expect(problems('poison not')).toEqual(['type:poison', '7-10 expected a filter after "not"'])
    expect(problems('poison mew ruby')).toEqual(['type:poison & game:ruby', '7-10 unknown name "mew"'])
    expect(problems('not mew')).toEqual([null, '4-7 unknown name "mew"'])
    expect(problems('ability:levitate')).toEqual([null, '0-16 unknown ability "levitate"'])
    expect(problems('colour:"red"')).toEqual([null, '0-12 unknown prefix "colour"'])
    expect(problems('"mew two"')).toEqual([null, '0-9 unknown name "mew two"'])
    expect(problems('(poison ruby')).toEqual(['type:poison & game:ruby', '0-1 missing closing parenthesis'])
    expect(problems('poison) ruby')).toEqual(['type:poison & game:ruby', '6-7 unmatched closing parenthesis'])
    expect(problems('bst >')).toEqual([null, '4-5 expected a number or an attribute after ">"'])
    expect(problems('> 5 ruby')).toEqual(['game:ruby', '0-1 expected a number or an attribute before ">"'])
    expect(problems('poison > 5')).toEqual([null, '0-6 expected a number or an attribute, got "poison"'])
    expect(problems('"poison')).toEqual(['type:poison', '0-7 missing closing quote'])
  })

  test('print writes canonical text', () => {
    expect(print(expr('(poison or Generation III) and not (treecko, bst>=600) -speed<attack')!))
      .toBe('(type:poison | gen:3) & !(species:treecko & bst >= 600) & !(spe < atk)')
    expect(print({ kind: 'and', args: [poison] })).toBe('type:poison')
    expect(() => print({ kind: 'or', args: [] })).toThrow('cannot print an "or" without arguments')
  })
})

describe('the committed data', () => {
  let dataset: Dataset
  let names: NameTable
  beforeAll(async () => {
    dataset = await committedDataset()
    names = buildNameTable(dataset)
  })
  // The `species/form` of the forms matching a query that must have no problems.
  function matches(text: string): string[] {
    const { expr, diagnostics } = parse(text, names)
    expect(diagnostics).toEqual([])
    const { forms } = dataset.bundle
    return formsOf(createEngine(dataset).evaluate(expr!)).map((id) => `${forms[id]!.species}/${forms[id]!.form}`)
  }

  test('every term reads back from its canonical text', () => {
    for (const { term } of names.entries) expect(parse(print(term), names)).toMatchObject({ expr: term, diagnostics: [] })
  })

  test('every name selects its term, unless another kind of term has the name too', () => {
    const shadowed = new Map<string, string>()
    for (const { term, names: termNames } of names.entries) {
      for (const name of termNames) {
        // A normalized name loses its hyphens, and "Trick-or-Treat" would read as two names and an operator.
        if (/\b(and|or|not)\b/.test(name)) continue
        const { expr, diagnostics } = parse(name, names)
        if (expr === null) expect(diagnostics[0]?.candidates).toContain(print(term))
        else if (expr.kind !== term.kind) shadowed.set(name, `${print(term)} is ${print(expr)}`)
        else expect(expr).toEqual(term)
      }
    }
    expect([shadowed.get('fairy'), shadowed.get('ditto'), shadowed.get('psychic'), shadowed.get('surf'), shadowed.get('sandstorm'), shadowed.get('rock smash')])
      .toEqual(['egg:fairy is type:fairy', 'egg:ditto is species:ditto', 'move:psychic is type:psychic', 'method:surf is move:surf', 'weather:sandstorm is move:sandstorm', 'method:rock-smash is move:rock-smash'])
  })

  test('random expressions read back from their canonical text', () => {
    // mulberry32
    let state = 20261005
    const random = () => {
      state = (state + 0x6d2b79f5) | 0
      let t = Math.imul(state ^ (state >>> 15), 1 | state)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    const pick = <T,>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!
    const operand = () => (random() < 0.5 ? { kind: 'number' as const, value: Math.floor(random() * 2000) / 10 - 20 } : { kind: 'attribute' as const, attribute: pick(ATTRIBUTES) })
    function generate(depth: number): Expr {
      const roll = random()
      if (depth === 0 || roll < 0.35) return pick(names.entries).term
      if (roll < 0.5) return { kind: 'compare', comparator: pick(COMPARATORS), left: operand(), right: operand() }
      if (roll < 0.65) return { kind: 'not', arg: generate(depth - 1) }
      return { kind: roll < 0.85 ? 'and' : 'or', args: Array.from({ length: 2 + Math.floor(random() * 3) }, () => generate(depth - 1)) }
    }
    for (let i = 0; i < 300; i++) {
      const expr = generate(4)
      expect(parse(print(expr), names)).toMatchObject({ expr, diagnostics: [] })
    }
  })

  test('names with punctuation', () => {
    expect(matches('Type: Null')).toEqual(['type-null/none'])
    expect(matches("farfetch'd galarian")).toEqual(['farfetch-d/galarian'])
    expect(matches('Mr. Mime | Ho-Oh | porygon-z | Nidoran♀ | flabebe').length).toBeGreaterThanOrEqual(5)
    expect(matches('"Mega X Charizard" or charizard mega y')).toEqual(['charizard/mega-x', 'charizard/mega-y'])
  })

  test('queries mean what the engine tests establish', () => {
    expect(matches('type:fairy game:black')).toEqual([])
    expect(matches('type:ground levitate')).toEqual(['vibrava/none', 'flygon/none', 'baltoy/none', 'claydol/none'])
    expect(matches('type:dragon AND Gen I')).toEqual(['dratini/none', 'dragonair/none', 'dragonite/none'])
    expect(matches('gen 3 & type:water')).toHaveLength(79)
    expect(matches('red blue, game:red')).toHaveLength(151)
    expect(matches('NOT type:fire, scarlet, bst >= 720').every((name) => name.startsWith('arceus/'))).toBe(true)
    expect(matches('hidden:friend guard')).toContain('clefairy/none')
    expect(matches('fairy black')).toEqual([])
    expect(matches('ultrabeast')).toHaveLength(11)
    expect(matches('mega species:charizard')).toEqual(['charizard/mega-x', 'charizard/mega-y'])
    expect(matches('tag:mega').every((name) => /\/mega/.test(name))).toBe(true)
    expect(matches('Generation >= 5 type:fairy species:clefairy')).toEqual(['clefairy/none'])
    expect(matches('gen<6 type:fairy')).toEqual([])
    expect(matches('gen >= 8 gen <= 8 species:pikachu')).toEqual(matches('gen 8 species:pikachu'))
    // Ultra Necrozma is the one Legendary form that no game from Generation VIII on has.
    expect(matches('not generation >= 8 legendary')).toEqual(['necrozma/ultra'])
    expect(matches('paradox')).toEqual(expect.arrayContaining(['great-tusk/none', 'iron-crown/none', 'raging-bolt/none']))
    expect(matches('pseudolegendary').filter((name) => name.endsWith('/none'))).toEqual(
      ['dragonite/none', 'tyranitar/none', 'salamence/none', 'metagross/none', 'garchomp/none', 'hydreigon/none', 'goodra/none', 'kommo-o/none', 'dragapult/none', 'baxcalibur/none'])
    expect(matches('legendary & mythical')).toEqual([])
    expect(matches('Legendary gen 1')).toEqual(['articuno/none', 'zapdos/none', 'moltres/none', 'mewtwo/none'])
    expect(matches('tag:mythical introduced:1')).toEqual(['mew/none'])
    expect(matches('introduced:1 AND type:fairy')).toEqual(['clefairy/none', 'clefable/none', 'jigglypuff/none', 'wigglytuff/none', 'mr-mime/none'])
    expect(matches('ditto')).toEqual(['ditto/none'])
    expect(matches('unown question | "Unown Exclamation"')).toEqual(['unown/exclamation', 'unown/question'])
  }, 30_000)
})
