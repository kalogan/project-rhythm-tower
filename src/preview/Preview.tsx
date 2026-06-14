import { useState } from 'react';
import { TabBar } from './ui.js';
import { ThemesPanel } from './panels/ThemesPanel.js';
import { PropsPanel } from './panels/PropsPanel.js';
import { CuesPanel } from './panels/CuesPanel.js';
import { ChartsPanel } from './panels/ChartsPanel.js';
import { BossPanel } from './panels/BossPanel.js';

const TABS = [
  { id: 'themes', label: 'Themes' },
  { id: 'props', label: 'Props' },
  { id: 'cues', label: 'Cues & FX' },
  { id: 'charts', label: 'Charts' },
  { id: 'boss', label: 'Boss' },
] as const;

/**
 * The content inspector for Project Rhythm Tower. A client-side workbench (separate
 * Vite entry, deployed at /preview.html) to browse every band's backdrop + props,
 * read every cue kind + effect, and scrub generated charts — with live knobs and
 * JSON export to feed the content packs.
 */
export function Preview(): JSX.Element {
  const [tab, setTab] = useState<string>('themes');
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {tab === 'themes' && <ThemesPanel />}
      {tab === 'props' && <PropsPanel />}
      {tab === 'cues' && <CuesPanel />}
      {tab === 'charts' && <ChartsPanel />}
      {tab === 'boss' && <BossPanel />}

      {/* Top-centre tab bar, above every panel's own side controls. */}
      <div
        style={{
          position: 'absolute',
          top: 10,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 20,
          background: 'rgba(10,14,28,0.9)',
          padding: 6,
          borderRadius: 10,
          border: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        <TabBar tabs={TABS} active={tab} onPick={setTab} />
      </div>
    </div>
  );
}
