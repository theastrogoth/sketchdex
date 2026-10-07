// A game mask is a set of games stored as bits in `MASK_WORDS` consecutive elements
// of a `Uint32Array`: game `g` is bit `g & 31` of word `g >>> 5`.

export const MASK_WORDS = 2
export const MAX_GAMES = 32 * MASK_WORDS

export function addGame(words: Uint32Array, offset: number, game: number): void {
  const i = offset + (game >>> 5)
  words[i] = words[i]! | (1 << (game & 31))
}

export function hasGame(words: Uint32Array, offset: number, game: number): boolean {
  return (words[offset + (game >>> 5)]! & (1 << (game & 31))) !== 0
}

/** The games of the mask at `offset`, in ascending order. */
export function gamesOf(words: Uint32Array, offset: number): number[] {
  const games: number[] = []
  for (let game = 0; game < MAX_GAMES; game++) {
    if (hasGame(words, offset, game)) games.push(game)
  }
  return games
}
