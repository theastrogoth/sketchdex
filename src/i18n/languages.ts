/** The languages of the interface, each with its own name. English names are in the data files; the rest are loaded on demand. */
export const LANGUAGES = {
  'en': 'English', 'ja': '日本語', 'fr': 'Français', 'es': 'Español', 'de': 'Deutsch', 'it': 'Italiano', 'ko': '한국어',
  'zh-Hant': '繁體中文', 'zh-Hans': '简体中文',
} as const
export type Language = keyof typeof LANGUAGES

export const isLanguage = (value: string | null): value is Language => value !== null && Object.hasOwn(LANGUAGES, value)

/**
 * Names in one language, by what they name: `species:<slug>`,
 * `category:<species slug>` ("Seed Pokémon"), `ability:<slug>`,
 * `type:<type>`, `game:<slug>`, `egg:<egg group slug>`, `move:<slug>`,
 * `region:<slug>`, `place:<region>/<slug>` (locations, not their parts),
 * `item:<slug of the English name>`, and `form:<species>/<form>` for the name of a
 * form on its own ("Alolan Form"); and, by their slugs, `learn:` (ways of learning a
 * move), `method:`, `time:`, `season:`, `weather:`, and `trait:` (of encounters), 
 * `condition:<English text>` (of evolutions), and the values of `tag:`, `gender:`,
 * `state:` (of evolution), `trigger:` and `when:` (ways of evolving), `growth:`,
 * `has:`, and `obtain:`; and the wording of a query's description, as `describe:<key>`
 * (`DESCRIPTIONS`). What has no entry keeps its English name.
 */
export type Translations = Record<string, string>

/** The file of a language's names, relative to the data directory. */
export const translationsFile = (language: Language) => `i18n/${language}.json`
