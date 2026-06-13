/**
 * Cue-shatter particles: when a swing connects, the struck cue bursts into shards in
 * its own color. A fixed pre-allocated pool (hot-path discipline: no per-frame
 * allocation) — spawning reuses dead slots, the update mutates in place.
 */
const MAX = 120;

interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  ttl: number;
  size: number;
  color: string;
}

export class ShatterField {
  private readonly pool: Particle[] = Array.from({ length: MAX }, () => ({
    active: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 0,
    ttl: 1,
    size: 0,
    color: '#fff',
  }));
  private seed = 1;

  /** Deterministic local jitter (no Math.random — keeps the view replayable). */
  private rand(): number {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  burst(x: number, y: number, color: string, count = 14): void {
    let spawned = 0;
    for (let i = 0; i < this.pool.length && spawned < count; i++) {
      const p = this.pool[i]!;
      if (p.active) continue;
      const ang = this.rand() * Math.PI * 2;
      const spd = 80 + this.rand() * 220;
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(ang) * spd;
      p.vy = Math.sin(ang) * spd;
      p.life = 0;
      p.ttl = 0.35 + this.rand() * 0.35;
      p.size = 3 + this.rand() * 5;
      p.color = color;
      spawned++;
    }
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.life += dt;
      if (p.life >= p.ttl) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 520 * dt; // gravity
      p.vx *= 0.96;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.pool) {
      if (!p.active) continue;
      ctx.globalAlpha = 1 - p.life / p.ttl;
      ctx.fillStyle = p.color;
      const s = p.size * (1 - p.life / p.ttl);
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }
}
