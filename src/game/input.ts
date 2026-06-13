import type { Button } from '../core/cue.js';

/**
 * Input source: keyboard + gamepad → button presses, timestamped with the audio
 * clock so judgment stays sample-accurate. Keyboard uses an IJKL "diamond" that
 * mirrors the face-button layout (I=top=Y, J=left=X, K=bottom=A, L=right=B).
 */
export const KEY_TO_BUTTON: Readonly<Record<string, Button>> = {
  KeyI: 'Y',
  KeyJ: 'X',
  KeyK: 'A',
  KeyL: 'B',
};

/** Standard Gamepad button index → face button (A=0, B=1, X=2, Y=3). */
const PAD_INDEX_TO_BUTTON: Readonly<Record<number, Button>> = {
  0: 'A',
  1: 'B',
  2: 'X',
  3: 'Y',
};

export interface InputSource {
  pollGamepad(): void;
  dispose(): void;
}

/**
 * @param getTimeSec returns the current audio time (the master clock)
 * @param onPress called on each rising-edge press with (button, audioTimeSec)
 * @param onRelease OPTIONAL — called on each falling-edge release (button, audioTimeSec).
 *   Needed only by HOLD cues (an early release breaks the hold). Existing callers that
 *   pass no `onRelease` are unaffected.
 */
export function createInput(
  getTimeSec: () => number,
  onPress: (button: Button, timeSec: number) => void,
  onRelease?: (button: Button, timeSec: number) => void,
): InputSource {
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    const button = KEY_TO_BUTTON[e.code];
    if (button) {
      e.preventDefault();
      onPress(button, getTimeSec());
    }
  };
  const onKeyUp = (e: KeyboardEvent): void => {
    const button = KEY_TO_BUTTON[e.code];
    if (button) {
      e.preventDefault();
      onRelease?.(button, getTimeSec());
    }
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  // Gamepad has no events for button-down/up; we poll and detect rising + falling edges.
  const prevPressed = new Map<number, boolean>();

  return {
    pollGamepad: () => {
      const pads = navigator.getGamepads?.() ?? [];
      for (const pad of pads) {
        if (!pad) continue;
        for (const indexStr of Object.keys(PAD_INDEX_TO_BUTTON)) {
          const index = Number(indexStr);
          const pressed = pad.buttons[index]?.pressed ?? false;
          const key = pad.index * 100 + index;
          const was = prevPressed.get(key) ?? false;
          if (pressed && !was) {
            onPress(PAD_INDEX_TO_BUTTON[index] as Button, getTimeSec());
          } else if (!pressed && was) {
            onRelease?.(PAD_INDEX_TO_BUTTON[index] as Button, getTimeSec());
          }
          prevPressed.set(key, pressed);
        }
      }
    },
    dispose: () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    },
  };
}
