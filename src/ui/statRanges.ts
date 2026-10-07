/**
 * The least and the most that a base stat can come to at `level`, by the formula of
 * Generation III onward: with no IVs or EVs and a hindering nature, and with 31 IVs,
 * 252 EVs, and a helpful nature. `hp` says the stat is HP, which has a formula of its
 * own and is untouched by natures; a base HP of 1 (Shedinja's) is always 1 HP.
 */
export function statRange(base: number, level: number, hp: boolean): [min: number, max: number] {
  const stat = (iv: number, ev: number, nature: number) => {
    const core = Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100)
    if (hp) return base === 1 ? 1 : core + level + 10
    return Math.floor((core + 5) * nature)
  }
  return [stat(0, 0, 0.9), stat(31, 252, 1.1)]
}
