/** Queries to try, by the section of the help that they illustrate. */
export const HELP_EXAMPLES = {
  basics: ['fire', 'levitate scarlet', 'species:eevee'],
  composing: ['water or ice', 'gen 3 & (surfing | fishing)', 'immune to ground -type:flying -levitate', 'Paldea East Province & (Fake Tears | Acid Spray) & (type:flying | Levitate)'],
  games: ['sword scarlet', 'catchable:firered catchable:leafgreen', 'catchable:scarlet -catchable:violet', 'not gen 8', 'paldea kanto type:fire', 'gen 2 not catchable', 'scarlet not kanto', 'anygame(levitate) anygame(weak to ground)'],
  prefixes: ['type:fairy', 'egg:fairy', 'move:surf', 'method:surf', 'hidden:intimidate', 'introduced:1 type:fairy'],
  numbers: ['bst >= 600', 'spe > atk', 'is:nfe bst >= 500 scarlet', 'evspe >= 2 gen 5', 'male < 50 types = 1', 'vs:ice >= 4'],
  details: ['legendary genderless', 'has:hidden-ability growth:slow', 'weak:fire resists:steel', 'always-immune:ground', 'holds:lucky-egg black', 'has:held-item violet'],
  moves: ['move(physical & grass & bp > 70) type:water', 'move(belly drum level up)', 'gen 3 move(belly drum level up) (egg:dragon or egg:monster)', 'move(priority > 0 movetype:fighting)', 'learn:tm movetype:ice'],
  encounters: ['encounter(surfing level >= 40) region:hoenn', 'only at night gen 4', 'only in rain', 'only in winter', 'tera raid stars = 6', 'encounter(max raid den stars <= 2)', 'encounter(holds:rare-candy)'],
  families: ['prevo(species:eevee) type:water', 'evo(species:vaporeon) evolves with water stone', 'evo(type:dragon) -type:dragon', 'family(move:surf) basic', 'evolves:trade gold', 'evolves at night', 'stage = 3 fully evolved'],
} as const
