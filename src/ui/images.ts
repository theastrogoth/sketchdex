import type { FormInfo } from '../worker/protocol.ts'

const IMAGES_URL = `${import.meta.env.BASE_URL}images`

/** The kinds of large image a form may have, in the order they are offered: each a field of `FormInfo` and a folder of images. */
export const PICTURES = [
  { kind: 'art', folder: 'art', label: 'Artwork' },
  { kind: 'shinyArt', folder: 'shiny', label: 'Shiny artwork' },
  { kind: 'home', folder: 'home', label: 'HOME' },
  { kind: 'homeShiny', folder: 'home-shiny', label: 'Shiny HOME' },
] as const
export type Picture = (typeof PICTURES)[number]

/** The pictures that `form` has. */
export const picturesOf = (form: FormInfo) => PICTURES.filter(({ kind }) => form[kind] !== null)

/** The address of the picture of `form` of one kind, which it must have. */
export function pictureUrl(form: FormInfo, { kind, folder }: Picture): string {
  const name = form[kind]
  if (name === null) throw new Error(`${form.name} has no picture of kind ${kind}`)
  return `${IMAGES_URL}/${folder}/${encodeURIComponent(name)}.webp`
}

/** The address of a form's sprite, a small file, or of its first picture if it has no sprite; `null` if it has neither. */
export function spriteUrl(form: FormInfo): string | null {
  if (form.localSprite !== null) return `${IMAGES_URL}/sprites/${form.localSprite}.png`
  if (form.sprite !== null) return `${IMAGES_URL}/box/${form.sprite}.jpg`
  const first = picturesOf(form)[0]
  return first ? pictureUrl(form, first) : null
}

/** The address of the mark put on a sprite that is another form's (`FormInfo.badge`). */
export const badgeUrl = (badge: 'dynamax' | 'mega') => `${import.meta.env.BASE_URL}${badge}.png`
