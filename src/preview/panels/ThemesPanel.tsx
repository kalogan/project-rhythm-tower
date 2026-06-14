import { useEffect, useMemo, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { BufferAttribute, BufferGeometry, Color, Points, PointsMaterial } from 'three';
import { BANDS } from '../../content/packs.js';
import { resolveArtKit, lookColors } from '../../game/resolveArtKit.js';
import { buildTowerScene, type SceneColors } from '../../game/towerScene.js';
import { Orbit } from '../orbit.js';
import { Btn, ColorRow, MONO, PANEL, Section, Slider } from '../ui.js';

function TowerScene({ artKitId, colors, seed, scrollSpeed }: { artKitId: string; colors: SceneColors; seed: number; scrollSpeed: number }): JSX.Element {
  const kit = useMemo(() => resolveArtKit(artKitId), [artKitId]);
  const scene = useMemo(
    () => buildTowerScene(kit, colors, seed),
    [kit, colors.ground, colors.sky, colors.fog, colors.accent, seed],
  );
  useFrame((state, dt) => {
    const d = Math.min(dt, 0.05);
    for (const l of scene.layers) {
      l.group.position.y -= l.speed * scrollSpeed * d;
      if (l.group.position.y <= -l.period) l.group.position.y += l.period;
    }
    const t = state.clock.elapsedTime;
    scene.crown.position.y = scene.crownBaseY + Math.sin(t * 0.8) * 0.35;
    scene.crown.rotation.y = t * 0.25;
  });
  return (
    <>
      {scene.layers.map((l, i) => (
        <primitive key={i} object={l.group} />
      ))}
      <primitive object={scene.crown} />
    </>
  );
}

function Snow({ count, color }: { count: number; color: string }): JSX.Element {
  const HEIGHT = 30;
  const points = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 44;
      pos[i * 3 + 1] = Math.random() * HEIGHT;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 44 - 4;
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    return new Points(geo, new PointsMaterial({ color: new Color(color), size: 0.2, transparent: true, opacity: 0.85 }));
  }, [count, color]);
  useFrame((_, dt) => {
    const attr = points.geometry.getAttribute('position');
    const arr = attr.array as Float32Array;
    for (let i = 0; i < count; i++) {
      const j = i * 3 + 1;
      const y = (arr[j] ?? 0) - dt * 3;
      arr[j] = y < 0 ? y + HEIGHT : y;
    }
    attr.needsUpdate = true;
  });
  return <primitive object={points} />;
}

export function ThemesPanel(): JSX.Element {
  const [bandIdx, setBandIdx] = useState(0);
  const [seed, setSeed] = useState(7000);
  const [colors, setColors] = useState<SceneColors>(() => lookColors(BANDS[0]!.look));
  const [fogNear, setFogNear] = useState(14);
  const [fogFar, setFogFar] = useState(58);
  const [snow, setSnow] = useState(0);
  const [snowColor, setSnowColor] = useState('#ffffff');
  const [scrollSpeed, setScrollSpeed] = useState(1);
  const [copied, setCopied] = useState(false);

  const band = BANDS[bandIdx]!;

  // Reset the colour knobs to a band's authored look when you switch bands.
  useEffect(() => {
    setColors(lookColors(band.look));
    setCopied(false);
  }, [band]);

  const set = (k: keyof SceneColors) => (v: string) => setColors((c) => ({ ...c, [k]: v }));

  const exportLook = useMemo(
    () => ({
      landmark: band.look.landmark,
      palette: [colors.ground, ...band.look.palette.slice(1)],
      skyColor: colors.sky,
      fogColor: colors.fog,
      accent: colors.accent,
    }),
    [band, colors],
  );

  const copy = (): void => {
    void navigator.clipboard?.writeText(JSON.stringify({ look: exportLook }, null, 2));
    setCopied(true);
  };

  return (
    <>
      <Canvas camera={{ position: [0, 4, 16], fov: 55 }} dpr={[1, 1.5]} style={{ position: 'absolute', inset: 0 }}>
        <color attach="background" args={[colors.sky]} />
        <fog attach="fog" args={[colors.fog, fogNear, fogFar]} />
        <ambientLight intensity={0.85} />
        <directionalLight position={[6, 18, 8]} intensity={2.2} />
        <TowerScene artKitId={band.artKitId} colors={colors} seed={seed} scrollSpeed={scrollSpeed} />
        {snow > 0 && <Snow count={snow} color={snowColor} />}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.2, 0]}>
          <circleGeometry args={[26, 32]} />
          <meshStandardMaterial color={colors.ground} />
        </mesh>
        <Orbit target={[0, 6, 0]} />
      </Canvas>

      <div style={PANEL}>
        <div style={{ fontWeight: 700 }}>Themes · backdrops</div>
        <div style={{ opacity: 0.6, fontSize: 11, marginTop: 2 }}>orbit-drag · scroll-zoom · right-drag pan</div>

        <Section title="Band">
          <select
            value={bandIdx}
            onChange={(e) => setBandIdx(Number(e.target.value))}
            style={{ width: '100%', padding: 6, background: '#10162e', color: '#e6ecff', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6 }}
          >
            {BANDS.map((b, i) => (
              <option key={b.id} value={i}>
                {b.bandOrder}. {b.name} ({b.escalationAxis})
              </option>
            ))}
          </select>
          <div style={{ opacity: 0.6, fontSize: 11, marginTop: 4 }}>Landmark: {band.look.landmark}</div>
        </Section>

        <Section title="Seed">
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="number"
              value={seed}
              onChange={(e) => setSeed(Number(e.target.value))}
              style={{ flex: 1, padding: 6, background: '#10162e', color: '#e6ecff', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, ...MONO }}
            />
            <Btn onClick={() => setSeed(Math.floor(Math.random() * 99999))}>↻ Reroll</Btn>
          </div>
        </Section>

        <Section title="Palette">
          <ColorRow label="Sky" value={colors.sky} onChange={set('sky')} />
          <ColorRow label="Fog" value={colors.fog} onChange={set('fog')} />
          <ColorRow label="Ground" value={colors.ground} onChange={set('ground')} />
          <ColorRow label="Accent (glow)" value={colors.accent} onChange={set('accent')} />
        </Section>

        <Section title="Atmosphere">
          <Slider label="Fog near" value={fogNear} min={2} max={40} onChange={setFogNear} />
          <Slider label="Fog far" value={fogFar} min={20} max={120} onChange={setFogFar} />
          <Slider label="Scroll speed" value={scrollSpeed} min={0} max={3} step={0.1} onChange={setScrollSpeed} />
          <Slider label="Snow / motes" value={snow} min={0} max={600} step={20} onChange={setSnow} />
          {snow > 0 && <ColorRow label="Mote colour" value={snowColor} onChange={setSnowColor} />}
        </Section>

        <Section title="Export — paste into the band pack's `look`">
          <Btn onClick={copy}>{copied ? '✓ Copied JSON' : 'Copy look JSON'}</Btn>
          <pre style={{ ...MONO, fontSize: 11, marginTop: 8, whiteSpace: 'pre-wrap', opacity: 0.8 }}>
            {JSON.stringify({ look: exportLook }, null, 2)}
          </pre>
        </Section>
      </div>
    </>
  );
}
