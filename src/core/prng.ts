/**
 * Seeded, deterministic PRNG (Mulberry32). The single source of randomness in
 * the core. Same seed -> same stream, forever, on every machine. This is what
 * lets charts be generated deterministically and pinned by golden fixtures.
 *
 * NEVER use Math.random() anywhere in src/core (the arch-guard + eslint forbid it).
 */
export interface Prng {
  /** Next float in [0, 1). */
  next(): number;
  /** Integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
  /** Float in [min, max). */
  range(min: number, max: number): number;
  /** Deterministically pick one element. Throws on empty input. */
  pick<T>(items: readonly T[]): T;
  /** True with probability p (clamped to [0, 1]). */
  chance(p: number): boolean;
}

export function makePrng(seed: number): Prng {
  // Mulberry32 state. Coerce to a 32-bit unsigned integer.
  let a = seed >>> 0;

  const next = (): number => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (maxExclusive: number): number => Math.floor(next() * maxExclusive);

  return {
    next,
    int,
    range: (min, max) => min + next() * (max - min),
    pick: <T>(items: readonly T[]): T => {
      if (items.length === 0) throw new Error('prng.pick: empty array');
      return items[int(items.length)] as T;
    },
    chance: (p) => next() < Math.max(0, Math.min(1, p)),
  };
}
