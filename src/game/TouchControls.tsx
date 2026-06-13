import { useState } from 'react';
import type { Button } from '../core/index.js';

/**
 * On-screen thumb controls for portrait/touch play. Split two-per-side so each
 * thumb covers two buttons. Buttons keep FIXED letters tinted with their controller
 * colors (X=blue, A=green, B=red, Y=yellow) — they ARE the gamepad. The decode skill
 * (which cue color maps to which button) stays meaningful and bites when the mapping
 * mutates in later bands.
 */
const BUTTON_COLOR: Readonly<Record<Button, string>> = {
  X: '#3b82f6',
  A: '#22c55e',
  B: '#ef4444',
  Y: '#eab308',
};

// Left thumb covers Y (top) / X (bottom); right thumb covers B (top) / A (bottom).
const LEFT: Button[] = ['Y', 'X'];
const RIGHT: Button[] = ['B', 'A'];

export function TouchControls({ onPress }: { onPress: (button: Button) => void }): JSX.Element {
  const [active, setActive] = useState<Button | null>(null);

  const press = (button: Button) => (e: React.PointerEvent) => {
    e.preventDefault();
    setActive(button);
    onPress(button);
  };
  const release = () => setActive(null);

  const pad = (button: Button): JSX.Element => (
    <button
      key={button}
      onPointerDown={press(button)}
      onPointerUp={release}
      onPointerLeave={release}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        width: 84,
        height: 84,
        borderRadius: '50%',
        border: '3px solid rgba(255,255,255,0.85)',
        background: BUTTON_COLOR[button],
        color: '#0b1020',
        fontSize: 30,
        fontWeight: 800,
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        pointerEvents: 'auto',
        opacity: active === button ? 0.65 : 1,
        transform: active === button ? 'scale(0.92)' : 'scale(1)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
      }}
    >
      {button}
    </button>
  );

  const cluster = (buttons: Button[], side: 'left' | 'right'): JSX.Element => {
    const style: React.CSSProperties = {
      position: 'absolute',
      bottom: 'calc(28px + env(safe-area-inset-bottom, 0px))',
      display: 'flex',
      flexDirection: 'column',
      gap: 18,
      pointerEvents: 'none',
    };
    if (side === 'left') style.left = 'calc(24px + env(safe-area-inset-left, 0px))';
    else style.right = 'calc(24px + env(safe-area-inset-right, 0px))';
    return (
      <div key={side} style={style}>
        {buttons.map(pad)}
      </div>
    );
  };

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', touchAction: 'none' }}>
      {cluster(LEFT, 'left')}
      {cluster(RIGHT, 'right')}
    </div>
  );
}
