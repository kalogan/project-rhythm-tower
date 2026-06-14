import type { CSSProperties, ReactNode } from 'react';

/** Shared look + tiny control widgets for the preview tool's side panels. */
export const PANEL: CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  bottom: 0,
  width: 320,
  padding: '12px 14px',
  boxSizing: 'border-box',
  background: 'rgba(10,14,28,0.92)',
  borderRight: '1px solid rgba(255,255,255,0.08)',
  overflowY: 'auto',
  fontSize: 13,
  zIndex: 10,
};

export const MONO: CSSProperties = { fontFamily: 'ui-monospace, monospace' };

export function Section({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ textTransform: 'uppercase', letterSpacing: 1, opacity: 0.55, fontSize: 11, marginBottom: 6 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}): JSX.Element {
  return (
    <label style={{ display: 'block', marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', opacity: 0.85 }}>
        <span>{label}</span>
        <span style={MONO}>{Number.isInteger(step) ? value : value.toFixed(step < 0.01 ? 3 : 2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%' }}
      />
    </label>
  );
}

export function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}): JSX.Element {
  return (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
      <span style={{ opacity: 0.85 }}>{label}</span>
      <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ ...MONO, opacity: 0.7 }}>{value}</span>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      </span>
    </label>
  );
}

export function TabBar({
  tabs,
  active,
  onPick,
}: {
  tabs: readonly { id: string; label: string }[];
  active: string;
  onPick: (id: string) => void;
}): JSX.Element {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onPick(t.id)}
          style={{
            padding: '6px 10px',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.12)',
            background: active === t.id ? '#3b5bdb' : 'transparent',
            color: '#e6ecff',
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Btn({ onClick, children }: { onClick: () => void; children: ReactNode }): JSX.Element {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '7px 12px',
        borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.14)',
        background: 'rgba(255,255,255,0.06)',
        color: '#e6ecff',
        cursor: 'pointer',
        fontSize: 12,
      }}
    >
      {children}
    </button>
  );
}
