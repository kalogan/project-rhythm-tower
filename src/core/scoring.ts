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
  /** Weighted accuracy in [0, 1] (shown for flavour; no longer the clear gate). */
  readonly accuracy: number;
  /** Cleared = survived the floor (HP never hit 0). */
  readonly cleared: boolean;
  /** Deterministic point score (base per verdict + a rising combo bonus). */
  readonly points: number;
  /** Final HP after the verdict sequence (0..MAX_HP). */
  readonly hp: number;
  /** True if HP hit 0 at any point — a death. */
  readonly died: boolean;
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

/**
 * HP model: a continuous per-floor gauge. You start full; mistakes drain it and
 * successes heal a little (more on a longer combo). If it hits 0 you DIE — survival
 * to the floor's end (HP > 0) is what "clears" it now, not an accuracy threshold.
 */
export const MAX_HP = 100;

/** HP lost per bad verdict. Decoy-hits + wrong buttons are 'wrong'; broken/late holds are 'miss'. */
export const HP_DAMAGE: Readonly<Record<Verdict, number>> = {
  miss: 16,
  wrong: 20, // a decode error / decoy-hit stings more than a plain miss
  perfect: 0,
  good: 0,
  avoided: 0,
};

/** HP healed per good verdict (a combo bonus is added on top — see hpStateForVerdicts). */
export const HP_HEAL: Readonly<Record<Verdict, number>> = {
  perfect: 7,
  good: 4,
  avoided: 6,
  wrong: 0,
  miss: 0,
};

export interface HpState {
  readonly hp: number;
  readonly died: boolean;
}

/**
 * Run the HP gauge over an ordered verdict sequence. Successes heal (plus a bonus
 * that grows with the current combo); mistakes drain. Returns the final HP and whether
 * it ever hit 0 (a death — we stop there). Pure + deterministic.
 */
export function hpStateForVerdicts(verdicts: readonly (Verdict | null)[]): HpState {
  let hp = MAX_HP;
  let combo = 0;
  for (const v of verdicts) {
    if (v === null) continue;
    const success = v === 'perfect' || v === 'good' || v === 'avoided';
    if (success) {
      combo += 1;
      hp = Math.min(MAX_HP, hp + HP_HEAL[v] + Math.floor(combo / 4));
    } else {
      combo = 0;
      hp -= HP_DAMAGE[v];
      if (hp <= 0) return { hp: 0, died: true };
    }
  }
  return { hp, died: false };
}

export function scoreFloor(verdicts: readonly (Verdict | null)[], maxCombo: number): FloorScore {
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
  const { hp, died } = hpStateForVerdicts(verdicts);
  return {
    ...counts,
    totalCues: total,
    maxCombo,
    accuracy,
    cleared: !died, // survive = clear
    points: pointsForVerdicts(verdicts),
    hp,
    died,
  };
}
