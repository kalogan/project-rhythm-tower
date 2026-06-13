/**
 * A tiny top-N leaderboard persisted to localStorage. The merge logic is pure (and
 * unit-tested); the load/save wrap it with guarded localStorage access so it degrades
 * gracefully where storage is unavailable (private mode, SSR, tests).
 */
export interface ScoreEntry {
  readonly points: number;
  readonly floorName: string;
  readonly accuracy: number; // 0..1
  readonly cleared: boolean;
  readonly at: number; // epoch ms
}

export const LEADERBOARD_SIZE = 3;
const STORAGE_KEY = 'rhythm-tower:leaderboard:v1';

/** Insert an entry and return the top N, sorted by points desc (ties: newer first). Pure. */
export function mergeTop(board: readonly ScoreEntry[], entry: ScoreEntry, size = LEADERBOARD_SIZE): ScoreEntry[] {
  return [...board, entry]
    .sort((a, b) => b.points - a.points || b.at - a.at)
    .slice(0, size);
}

export function loadLeaderboard(): ScoreEntry[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is ScoreEntry =>
        typeof e === 'object' && e !== null && typeof (e as ScoreEntry).points === 'number',
    );
  } catch {
    return [];
  }
}

/** Record a score, persist the trimmed top N, and return the new board. */
export function recordScore(entry: ScoreEntry): ScoreEntry[] {
  const next = mergeTop(loadLeaderboard(), entry);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — keep the in-memory board for this session */
  }
  return next;
}
