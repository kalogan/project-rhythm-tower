# Swordfighter sprite atlas

The fighter at the hit point is a **sprite-sheet animation**. Right now the sheet is
**baked procedurally** as a placeholder (`bakeKnightAtlas()` in `spriteAtlas.ts`) — a
real sprite sheet, just generated, so it can be swapped for hand-drawn art with no
gameplay changes.

## Drop in real art

Provide an image whose frames match `KNIGHT_CLIPS` in [`clips.ts`](./clips.ts):

| clip      | frames | fps | loop | when it plays                       |
|-----------|:------:|:---:|:----:|-------------------------------------|
| `idle`    | 4      | 6   | yes  | resting between presses             |
| `attackX` | 5      | 20  | no   | press **X** (blue-tinted swing)     |
| `attackA` | 5      | 20  | no   | press **A** (green)                 |
| `attackB` | 5      | 20  | no   | press **B** (red)                   |
| `attackY` | 5      | 20  | no   | press **Y** (yellow)                |
| `miss`    | 4      | 14  | no   | a cue passes unhit (whiff/flinch)   |

Then build a `SpriteAtlas` from your image instead of calling `bakeKnightAtlas()`:

```ts
const atlas: SpriteAtlas = {
  source: yourImage,          // HTMLImageElement / canvas
  cell: 120,                  // per-frame cell size (px)
  frames: { idle: [...], attackX: [...], /* rect per frame: {x,y,w,h} */ },
};
new SpriteAnimator(atlas);
```

The frame is anchored at the fighter's **feet**, drawn facing the incoming cues
(rotated automatically: up in portrait, rightward in landscape). Keep the sword arc
in the upper half of the cell (cues arrive from "above" in sprite space).

## Notes
- Animation timing is a pure function of the floor clock (`frameAt`/`clipDone`), so the
  swing stays in sync with audio + judgment and is replayable.
- A connecting hit (perfect/good) spawns a cue-coloured shatter burst (`shatter.ts`);
  the placeholder tints each attack with its button's controller colour to reinforce
  the colour→button decode.
