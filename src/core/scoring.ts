import type { Verdict } from './judgment.js';

/**
 * Tally resolved verdicts into a floor result. Cozy clear rule: clear the floor by
 * weighted accuracy, not perfection — a few misses still let you ascend.
 */
export interface FloorScore {
  readonly perfect: number;
  readonly good: number;
  readonly wrong: number;
  readonly miss: number;
  readonly avoided: number;
  readonly totalCues: number;
  readonly maxCombo: number;
  /** Weighted accuracy in [0, 1]. */
  readonly accuracy: number;
  readonly cleared: boolean;
  /** Deterministic point score (base per verdict + a rising combo bonus). */
  readonly points: number;
}

export const VERDICT_WEIGHT: Readonly<Record<Verdict, number>> = {
  perfect: 1,
  good: 0.6,
  avoided: 1, // correctly ignoring a decoy is a full success
  wrong: 0,
  miss: 0,
};

/** Base points per resolved verdict (a hit/dodge scores; a miss/wrong scores nothing). */
export const VERDICT_POINTS: Readonly<Record<Verdict, number>> = {
  perfect: 100,
  good: 60,
  avoided: 80, // dodging a decoy
  wrong: 0,
  miss: 0,
};

/** Extra points added per step of the current success streak (rewards combos). */
export const COMBO_BONUS = 10;

/**
 * Deterministic point total for an ordered verdict sequence: each success adds its
 * base points plus a bonus that grows with the current combo streak; a miss or wrong
 * breaks the streak. Pure — same sequence always yields the same score. Used both for
 * the live HUD (partial verdicts) and the final result.
 */
export function pointsForVerdicts(verdicts: readonly (Verdict | null)[]): number {
  let points = 0;
  let combo = 0;
  for (const v of verdicts) {
    if (v === null) continue;
    const success = v === 'perfect' || v === 'good' || v === 'avoided';
    if (success) {
      combo += 1;
      points += VERDICT_POINTS[v] + (combo - 1) * COMBO_BONUS;
    } else {
      combo = 0;
    }
  }
  return points;
}

export const DEFAULT_CLEAR_THRESHOLD = 0.7;

export function scoreFloor(
  verdicts: readonly (Verdict | null)[],
  maxCombo: number,
  clearThreshold: number = DEFAULT_CLEAR_THRESHOLD,
): FloorScore {
  const counts = { perfect: 0, good: 0, wrong: 0, miss: 0, avoided: 0 };
  let weight = 0;
  let total = 0;
  for (const v of verdicts) {
    if (v === null) continue;
    counts[v] += 1;
    weight += VERDICT_WEIGHT[v];
    total += 1;
  }
  const accuracy = total === 0 ? 1 : weight / total;
  return {
    ...counts,
    totalCues: total,
    maxCombo,
    accuracy,
    cleared: accuracy >= clearThreshold,
    points: pointsForVerdicts(verdicts),
  };
}
