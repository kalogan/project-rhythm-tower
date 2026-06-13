/**
 * Screen-feel effects for the cue layer (view-only, cosmetic): a flash, a camera
 * shake, and a blade slash arc. Each is a decaying scalar driven by the floor clock;
 * triggers take the max so a stronger hit always wins. No allocation in the hot path.
 */
export class Fx {
  flash = 0;
  flashColor = '#ffffff';
  shake = 0;
  private slashColor = '#ffffff';
  private slashAt = -10;

  flashHit(amount: number, color: string): void {
    if (amount > this.flash) {
      this.flash = amount;
      this.flashColor = color;
    }
  }

  shakeHit(amount: number): void {
    if (amount > this.shake) this.shake = amount;
  }

  slash(color: string, now: number): void {
    this.slashColor = color;
    this.slashAt = now;
  }

  decay(dt: number): void {
    this.flash *= Math.exp(-dt * 7);
    this.shake *= Math.exp(-dt * 14);
    if (this.flash < 0.01) this.flash = 0;
    if (this.shake < 0.05) this.shake = 0;
  }

  /** A small random screen offset for the current shake amount. */
  shakeOffset(): { x: number; y: number } {
    const a = this.shake;
    return { x: (Math.random() - 0.5) * 2 * a, y: (Math.random() - 0.5) * 2 * a };
  }

  /**
   * Draw the expanding blade slash at the strike point, facing the incoming cues
   * (`facing` rad: 0 = up). Fades over ~0.18s; no-op when stale.
   */
  drawSlash(ctx: CanvasRenderingContext2D, x: number, y: number, now: number, facing: number): void {
    const p = (now - this.slashAt) / 0.18;
    if (p < 0 || p > 1) return;
    const radius = 24 + p * 46;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(facing);
    ctx.globalAlpha = 1 - p;
    ctx.strokeStyle = this.slashColor;
    ctx.lineWidth = 9 * (1 - p);
    ctx.lineCap = 'round';
    ctx.beginPath();
    // A crescent across the front (top in sprite space).
    ctx.arc(0, 0, radius, -Math.PI * 0.85, -Math.PI * 0.15);
    ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** Full-screen flash overlay (drawn last, unaffected by shake). */
  drawFlash(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    if (this.flash <= 0) return;
    ctx.save();
    ctx.globalAlpha = Math.min(0.6, this.flash);
    ctx.fillStyle = this.flashColor;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}
