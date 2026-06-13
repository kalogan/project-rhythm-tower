/**
 * The core identity of the game: a CUE is a flashed COLOR you must DECODE into a
 * BUTTON and press on the beat. The decode (color -> button) is the skill, and the
 * mapping can MUTATE as you climb (the "mapping mutation" escalation axis).
 *
 * Default mapping mirrors the Xbox controller face-button colors, so the baseline
 * is half-learned reflex — which higher bands get to subvert.
 *   blue -> X, green -> A, red -> B, yellow -> Y
 */
export type CueColor = 'blue' | 'green' | 'red' | 'yellow';
export type Button = 'X' | 'A' | 'B' | 'Y';

export const CUE_COLORS: readonly CueColor[] = ['blue', 'green', 'red', 'yellow'] as const;
export const BUTTONS: readonly Button[] = ['X', 'A', 'B', 'Y'] as const;

/**
 * Cue kinds, by escalation band:
 *  - tap:    baseline — decode the color, press once in the window.
 *  - hold:   press and hold for `holdBeats`.
 *  - double: two colors flash; press both buttons in the window.
 *  - decoy:  a fake-out — do NOT press (pressing is a fault).
 */
export type CueKind = 'tap' | 'hold' | 'double' | 'decoy';

export interface Cue {
  readonly id: number;
  /** Beat index on the floor's grid when this cue must be hit. */
  readonly beat: number;
  readonly color: CueColor;
  readonly kind: CueKind;
  /** For 'double' cues: the second flashed color. */
  readonly color2?: CueColor;
  /** For 'hold' cues: how many beats to hold. */
  readonly holdBeats?: number;
}

export type ColorMapping = Readonly<Record<CueColor, Button>>;

export const DEFAULT_MAPPING: ColorMapping = {
  blue: 'X',
  green: 'A',
  red: 'B',
  yellow: 'Y',
};

/**
 * The button(s) the player must press for a cue under the active mapping.
 * Returns an empty array for a decoy (the correct action is to NOT press).
 */
export function expectedButtons(cue: Cue, mapping: ColorMapping): Button[] {
  if (cue.kind === 'decoy') return [];
  const out: Button[] = [mapping[cue.color]];
  if (cue.kind === 'double' && cue.color2) out.push(mapping[cue.color2]);
  return out;
}
