import type { Form, Images } from '../src/data/schema.ts'

// Names of image files. Artwork (`public/images/art/<name>.webp`, and `shiny`) made
// from the Tera Raid Builder's follows Pokémon Showdown's naming rather than the
// bundle's slugs. Box sprites (`public/images/box/<name>.jpg`), which are the Tera
// Raid Builder's, are named `<Pokédex number>_<form index>`, as in `0006_01` for Mega Charizard X.

/** Species whose file names are not their slug with `-` or `_` between words. */
const SPECIES_NAMES: Record<string, string> = { 'farfetch-d': 'farfetchd', 'sirfetch-d': 'sirfetchd' }

/** Words of a form slug and what the file names have in their place. */
const FORM_WORDS: [RegExp, string][] = [
  [/alolan/, 'alola'], [/galarian/, 'galar'], [/hisuian/, 'hisui'], [/paldean/, 'paldea'], [/gigantamax/, 'gmax'],
  [/-(size|cloak|sea|breed|mode|style|mask|trim|drive|plumage|forme|face|rider|percent)$/, ''],
  [/^(red|orange|yellow|green|blue|indigo|violet)-meteor$/, 'meteor'],
  [/^poke-ball$/, 'pokeball'], [/^ph-d$/, 'phd'], [/^kanto-cap$/, 'original'], [/-cap$/, ''],
  [/^female$/, 'f'], [/^male$/, 'm'], [/^sunshine$/, 'sunny'], [/^fifty$/, '50'], [/^ten$/, '10'],
  [/^family-of-three$/, '3'], [/^three-segment$/, '3'], [/^full-belly$/, 'full'], [/^crowned-(sword|shield)$/, 'crowned'],
  [/^hero-of-many-battles$/, 'hero'], [/^gmax-rapid-strike$/, 'rapid-strike-gmax'], [/^gmax-single-strike$/, 'gmax'],
  [/^galar-standard$/, 'galar'],
]

/** Forms that look unlike their species' base form, and so are not shown by its artwork. */
const DISTINCT_FORM = /^(mega|gigantamax|primal|eternamax)/

/** Forms that look like their species' first form in every color, and so may be shown by its images. */
const SAME_LOOK = /^(scatterbug|spewpa)\/|^minior\/.*-meteor$|^(rockruff\/own-tempo|greninja\/battle-bond|eevee\/partner|pikachu\/partner|arceus\/legend|sinistea\/antique|polteageist\/antique|poltchageist\/artisan|sinistcha\/masterpiece)$/

/**
 * The image file names to try for `form`, best first: the form's own (`own`), and
 * those of its species (`species`), which serve a form that looks like its
 * species' first (`sameLook`). Images downloaded for this app are named by the
 * slugs themselves, `<species>-<form>` or, for a plain form, `<species>`, and come before artwork made from the Tera
 * Raid Builder's; `first` is the slug of the species' first form.
 */
export function artCandidates(form: Pick<Form, 'species' | 'form'>, first = 'none'): { own: string[]; species: string[]; sameLook: boolean } {
  const species = SPECIES_NAMES[form.species] ?? form.species
  const name = (slug: string) => (slug === 'none' ? form.species : `${form.species}-${slug}`)
  const bases = [name(first), species, species.replaceAll('-', '_'), form.species.replace('-d', "'d")]
  if (form.form === first || form.form === 'none') return { own: [name(form.form), ...bases], species: [], sameLook: false }
  const suffix = FORM_WORDS.reduce((slug, [pattern, replacement]) => slug.replace(pattern, replacement), form.form)
  const own = [`${form.species}-${form.form}`, ...bases.slice(1).flatMap((base) => (suffix === '' ? [] : [`${base}-${suffix}`]))]
  return { own, species: bases, sameLook: !DISTINCT_FORM.test(form.form) && SAME_LOOK.test(`${form.species}/${form.form}`) }
}

/**
 * Sprite form indexes of the species whose forms are not numbered in the bundle's
 * order: per species and form, the index, or `null` for a form without a sprite. A
 * form of these species that is not listed is shown by the sprite of index 0.
 */
const SPRITE_INDEXES: Record<string, Record<string, number | null>> = {
  pikachu: {
    'none': 0, 'kanto-cap': 1, 'hoenn-cap': 2, 'sinnoh-cap': 3, 'unova-cap': 4, 'kalos-cap': 5, 'alola-cap': 6,
    'partner-cap': 7, 'partner': 8, 'world-cap': 9,
  },
  darmanitan: { 'standard-mode': 0, 'galarian-standard-mode': 1, 'zen-mode': 2, 'galarian-zen-mode': 3 },
  // Index 2 is Ash-Greninja.
  greninja: { 'none': 0, 'battle-bond': 1, 'mega': null },
  // Indexes 1 to 8 are the other creams.
  alcremie: { 'vanilla-cream-strawberry': 0, 'gigantamax': null },
  // Index 1 looks like index 0.
  eternatus: { 'none': 0, 'eternamax': null },
  zygarde: { 'fifty-percent': 0, 'ten-percent': 1, 'complete': null, 'mega': null },
  ursaluna: { 'none': 0, 'bloodmoon': null },
}

/**
 * The sprite file name for `form`, the `position`-th (from 0) of its species' forms,
 * among `spriteNames`; `null` if it has none. A form's index is its position, except
 * as `SPRITE_INDEXES` says; a form without a sprite of its own is shown by that of
 * index 0, unless it looks unlike the base form.
 */
export function spriteName(form: Pick<Form, 'species' | 'form' | 'nationalId'>, position: number, spriteNames: Set<string>): string | null {
  const name = (index: number) => `${String(form.nationalId).padStart(4, '0')}_${String(index).padStart(2, '0')}`
  const indexes = SPRITE_INDEXES[form.species]
  const index = indexes ? indexes[form.form] : position
  if (index === null) return null
  if (index !== undefined && spriteNames.has(name(index))) return name(index)
  return !DISTINCT_FORM.test(form.form) && spriteNames.has(name(0)) ? name(0) : null
}

const GIGANTAMAX = /^gigantamax-?/

/** The file names, without extensions, that the images of forms are chosen among. */
export interface ImageNames {
  /** Box sprites of the Tera Raid Builder. */
  sprites: Set<string>
  /** Sprites, artwork, shiny artwork, and Pokémon HOME's renders, regular and shiny, in `public/images`. */
  localSprites: Set<string>
  art: Set<string>
  shinyArt: Set<string>
  home: Set<string>
  homeShiny: Set<string>
}

/**
 * The images of each form. A sprite in `public/images/sprites` is named
 * `<Pokédex number>-<form>`. There are no box sprites of Gigantamax forms, nor of
 * some Mega Evolutions, which get the sprite of the form they are forms of, and a
 * badge (artwork follows `artCandidates`): the form named by the rest of the slug
 * (`gigantamax-rapid-strike-style`, `mega-droopy`), or else the species' first.
 */
export function assignImages(forms: Pick<Form, 'species' | 'form' | 'nationalId'>[], names: ImageNames): Images {
  const firsts = new Map<string, string>()
  for (const form of forms) {
    if (!firsts.has(form.species)) firsts.set(form.species, form.form)
  }
  const candidates = forms.map((form) => artCandidates(form, firsts.get(form.species)))
  // An image must be the form's own, or that of a form it looks like.
  const choose = (among: Set<string>) =>
    candidates.map(({ own, species, sameLook }) => [...own, ...(sameLook ? species : [])].find((name) => among.has(name)) ?? null)
  const [art, shinyArt, home, homeShiny] = [choose(names.art), choose(names.shinyArt), choose(names.home), choose(names.homeShiny)]
  const seen = new Map<string, number>()
  const own = forms.map((form) => {
    const position = seen.get(form.species) ?? 0
    seen.set(form.species, position + 1)
    return spriteName(form, position, names.sprites)
  })
  const localSprite = forms.map((form) => {
    const name = `${String(form.nationalId).padStart(4, '0')}-${form.form}`
    return names.localSprites.has(name) ? name : null
  })
  const badge = forms.map((form, id): Images['badge'][number] =>
    (GIGANTAMAX.test(form.form) ? 'dynamax' : form.form.startsWith('mega') && own[id] === null && localSprite[id] === null ? 'mega' : null))
  const sprite = forms.map((form, id) => {
    if (badge[id] === null) return own[id]!
    // The form it is a form of: the one named by the rest of its slug (`mega-droopy`), or else the species' first.
    const base = form.form.replace(/^(gigantamax|mega)-?/, '')
    const named = forms.findIndex((other) => other.species === form.species && other.form === base)
    const from = named >= 0 ? named : forms.findIndex((other) => other.species === form.species)
    return { sprite: own[from] ?? null, localSprite: localSprite[from] ?? null }
  })
  return {
    sprite: sprite.map((from) => (typeof from === 'string' || from === null ? from : from.sprite)),
    localSprite: sprite.map((from, id) => (typeof from === 'string' || from === null ? localSprite[id]! : from.localSprite)),
    badge, art, shinyArt, home, homeShiny,
  }
}
