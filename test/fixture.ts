import type { Bundle } from '../src/data/schema.ts'

/** A small bundle, built anew on each call. */
export function tinyBundle(): Bundle {
  return {
    meta: {
      games: [
        { slug: 'red-japan', versionGroup: 'red-green-japan', generation: 1, abilities: false, hiddenAbilities: false },
        { slug: 'red', versionGroup: 'red-blue', generation: 1, abilities: false, hiddenAbilities: false },
        { slug: 'gold', versionGroup: 'gold-silver', generation: 2, abilities: false, hiddenAbilities: false },
        { slug: 'ruby', versionGroup: 'ruby-sapphire', generation: 3, abilities: true, hiddenAbilities: false },
      ],
      gameSets: [[0, 1], [0], [2, 3], [3], [0, 1, 2, 3], [0, 1, 2]],
      abilities: [{ slug: 'overgrow', name: 'Overgrow' }, { slug: 'chlorophyll', name: 'Chlorophyll' }],
      statNames: ['HP', 'Attack', 'Defense', 'Sp. Atk', 'Sp. Def', 'Speed'],
      abilitySlots: ['Ability 1', 'Ability 2', 'Hidden'],
      obtainStatuses: ['Catchable', 'Transfer'],
      learnMethods: { L: 'levelup', M: 'tm' },
      omitted: { learners: 0 },
    },
    forms: [
      {
        species: 'bulbasaur', form: 'none', name: 'Bulbasaur', formName: null, nationalId: 1, classification: 'The Seed Pokémon',
        types: ['grass', 'poison'], abilities: [[0, 0], [1, 2]], baseStats: [45, 49, 49, 65, 65, 45], evYield: [0, 0, 0, 1, 0, 0],
        baseExp: 64, catchRate: 45, baseFriendship: 50, growthRate: 'Medium Slow', eggGroups: ['Grass', 'Monster'], eggCycles: 20,
        genderRatio: 87.5, height: 0.7, weight: 6.9, tags: [], heldItems: [], obtainability: [[0, 4]],
        history: { abilities: [[5, null]], baseStats: [[0, [45, 49, 49, 65, 65, 45]]] },
      },
      {
        species: 'treecko', form: 'none', name: 'Treecko', formName: null, nationalId: 252, classification: 'The Wood Gecko Pokémon',
        types: ['grass'], abilities: [[0, 0]], baseStats: [40, 45, 35, 65, 55, 70], evYield: [0, 0, 0, 0, 0, 1],
        baseExp: 62, catchRate: 45, baseFriendship: 50, growthRate: 'Medium Slow', eggGroups: ['Monster', 'Dragon'], eggCycles: 20,
        genderRatio: 87.5, height: 0.5, weight: 5, tags: ['mythical'], heldItems: [], obtainability: [[0, 3]], history: {},
      },
    ],
    moves: [
      { slug: 'default', name: 'Default', type: 'normal', category: 'physical', power: 40, accuracy: 100, pp: 35, priority: 0, description: null, flags: [], games: 4, history: {} },
      {
        slug: 'tackle', name: 'Tackle', type: 'normal', category: 'physical', power: 40, accuracy: 100, pp: 35, priority: 0,
        description: 'A full-body charge.', flags: ['makesContact'], games: 4, history: { power: [[5, 35]], accuracy: [[5, 95]] },
      },
      {
        slug: 'vine-whip', name: 'Vine Whip', type: 'grass', category: 'physical', power: 45, accuracy: 100, pp: 25, priority: 0,
        description: null, flags: ['makesContact'], games: 4, history: { category: [[5, 'special']], power: [[5, 35]], pp: [[0, 10]] },
      },
    ],
    evolutions: [],
    learnsets: [{ 1: ['4L1'], 2: ['4L7', '3M'] }, { 1: ['3L1'] }],
    learners: [[], [[0, 4], [1, 3]], [[0, 4]]],
    places: [
      { region: 'kanto', slug: 'route-1', name: 'Route 1', regionName: 'Kanto', parent: null },
      { region: 'hoenn', slug: 'route-101', name: 'Route 101', regionName: 'Hoenn', parent: null },
      { region: 'hoenn', slug: 'route-101-tall-grass', name: 'Tall Grass', regionName: 'Hoenn', parent: 1 },
    ],
    placeForms: [[[0, 0]], [[1, 3]], [[1, 3]]],
    encounters: {
      strings: ['grass', 'walk', 'percent', 'max-raid-den', 'day'],
      encounters: {
        place: [0], form: [0], formInPlay: [false], method: [1], time: [null], seasons: [null], weather: [null], subTable: [null],
        conditions: [[]], minLevel: [2], maxLevel: [5], rate: [12.5], rateKind: [2], shinyLocked: [false], hiddenAbility: [false],
        heldItem: [null], alpha: [false], alphaChance: [null], games: [0],
      },
      spawners: {
        place: [2], form: [1], minLevel: [3], maxLevel: [4], rate: [null], rateKind: [2], times: [[4]], alpha: [false],
        alphaChance: [null], terrains: [null], weathers: [null], spawnerCount: [1], breakdown: [null], tables: [null], games: [3],
      },
      raids: {
        place: [1], form: [1], kind: [3], den: [7], gigantamax: [false], stars: [[1, 2]], minLevel: [15], maxLevel: [20], games: [3],
      },
    },
  }
}
