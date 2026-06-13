import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  LatheGeometry,
  Mesh,
  SphereGeometry,
  TorusGeometry,
  Vector2,
} from 'three';
import { makePrng } from '../core/prng.js';
import { flatMat, emissiveMat } from '../art/palette.js';
import { jitterVerts } from '../art/geo.js';

/**
 * The Moonlit Belfry prop kit — bespoke, deterministic geometry generators for the
 * capstone HOLD band. RESHAPED + RECOLORED, never borrowed from a sibling: where the
 * Atrium is box+cylinder+octa, the Spire is cone+tetra, the Verdant is sphere+dodec+
 * torus, and the Summit is a riven cone-crag, the Belfry is a LATHED BELL OF REVOLUTION
 * hung under a TORUS-ARCH yoke — a heavy, round-shouldered suspended bell, a silhouette
 * none of the others share. The band's surface is cool MOON-SILVER stone lit by a single
 * warm BRONZE chime-glow.
 *
 * Contract: (seed) => Object3D, base-pivot (+Y up), faceted low-poly, emissive where it
 * should bloom. Biome-LOCAL palette tokens live here so they can't leak.
 */
const BELFRY = {
  night: 0x1a2230,
  moonStone: 0x5a7a96,
  moonSilver: 0xcfe6f5,
  bellBronze: 0xe9c98a,
} as const;

/** A low-poly bell profile (radius, height) revolved into a bell of revolution. */
function bellProfile(): Vector2[] {
  // From the crown (top) down to the flared lip — a classic bell silhouette.
  return [
    new Vector2(0.0, 1.5), // closed crown
    new Vector2(0.28, 1.46),
    new Vector2(0.42, 1.28),
    new Vector2(0.5, 1.0),
    new Vector2(0.56, 0.7),
    new Vector2(0.66, 0.36),
    new Vector2(0.86, 0.1), // flared lip
    new Vector2(0.92, 0.0), // lip rim
    new Vector2(0.62, 0.0), // inner rim (hollow mouth)
  ];
}

/**
 * The hero landmark you orient by: the Great Moon-Bell — a lathed silver-bronze bell of
 * revolution slung from a torus-arch yoke between two faceted moonstone posts on a low
 * plinth, its lip catching a warm bronze chime-glow. Round-shouldered + hanging, pivoted
 * at its base — distinct from every sibling's needle/crag/pod/lantern.
 */
export function belfryBell(seed: number): Group {
  const prng = makePrng(seed);
  const group = new Group();

  // Low moonstone plinth.
  const plinth = new Mesh(
    jitterVerts(new BoxGeometry(2.6, 0.8, 2.6), prng, 0.05),
    flatMat(BELFRY.moonStone),
  );
  plinth.position.y = 0.4;
  group.add(plinth);

  // Two posts framing the bell.
  for (const sx of [-1, 1] as const) {
    const post = new Mesh(
      jitterVerts(new BoxGeometry(0.34, 4.2, 0.34), prng, 0.04),
      flatMat(BELFRY.night),
    );
    post.position.set(sx * 1.1, 0.8 + 2.1, 0);
    group.add(post);
  }

  // The torus-arch YOKE spanning the posts — the bell hangs from its crown.
  const yoke = new Mesh(
    new TorusGeometry(1.1, 0.16, 6, 12, Math.PI),
    flatMat(BELFRY.moonSilver),
  );
  yoke.position.y = 0.8 + 4.0;
  group.add(yoke);

  // The bell itself: a lathed bronze-silver bell of revolution, hung beneath the yoke.
  const bell = new Mesh(
    new LatheGeometry(bellProfile(), 10),
    emissiveMat(BELFRY.moonSilver, BELFRY.bellBronze, 1.3),
  );
  bell.scale.setScalar(1.3 + prng.range(0, 0.1));
  bell.position.y = 0.8 + 1.6;
  group.add(bell);

  // The clapper: a small bronze sphere glowing inside the bell's mouth (the chime).
  const clapper = new Mesh(
    new SphereGeometry(0.22, 6, 5),
    emissiveMat(BELFRY.bellBronze, BELFRY.bellBronze, 2.6),
  );
  clapper.position.y = 0.8 + 1.5;
  group.add(clapper);

  return group;
}

/**
 * A field tile: a small votive hand-bell on a slim moonstone stand — a tiny lathed bell
 * under a thin arch hook, glowing faintly bronze. Echoes the hero's bell-of-revolution
 * motif in miniature, distinct from the Atrium's capped pillar, the Spire's shard, the
 * Verdant's planter, and the Summit's slab.
 */
export function belfryChime(seed: number): Group {
  const prng = makePrng(seed);
  const group = new Group();

  // Slim moonstone stand.
  const stand = new Mesh(
    new CylinderGeometry(0.16, 0.26, 1.4 + prng.range(0, 0.6), 6),
    flatMat(BELFRY.moonStone),
  );
  stand.position.y = 0.7;
  group.add(stand);

  // A thin hook arch over the stand.
  const hook = new Mesh(
    new TorusGeometry(0.34, 0.05, 5, 8, Math.PI),
    flatMat(BELFRY.moonSilver),
  );
  hook.position.y = 1.5;
  group.add(hook);

  // A small lathed bell hung from the hook, faintly chiming bronze.
  const bell = new Mesh(
    new LatheGeometry(bellProfile(), 8),
    emissiveMat(BELFRY.moonSilver, BELFRY.bellBronze, 1.0),
  );
  bell.scale.setScalar(0.42);
  bell.position.y = 1.1;
  group.add(bell);

  return group;
}
