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
}

export const VERDICT_WEIGHT: Readonly<Record<Verdict, number>> = {
  perfect: 1,
  good: 0.6,
  avoided: 1, // correctly ignoring a decoy is a full success
  wrong: 0,
  miss: 0,
};

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
  };
}
