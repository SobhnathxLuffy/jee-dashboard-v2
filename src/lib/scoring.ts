// ─── Scoring config — the single source of truth for +4 / −1 / 0 ─────────────
// Every scoring site (Player, Results, analytics, future key-later self-mark)
// must derive its marks from here. JEE Main: MCQ and numerical alike.

export const MARKS = { CORRECT: 4, WRONG: -1, UNATTEMPTED: 0 } as const;

/**
 * Marks for one question under the NTA scheme.
 * - bonus (dropped question) → +4 for everyone, attempted or not
 * - unattempted → 0 (even when a key exists)
 * - correct === null (pending self-mark, key-later mode) → 0 until marked
 * - correct → +4 ; wrong → −1 (MCQ and numerical alike)
 *
 * Bonus is checked FIRST so unattempted bonus questions still award +4.
 */
export function marksFor(
  attempted: boolean,
  correct: boolean | null,
  bonus = false
): number {
  if (bonus) return MARKS.CORRECT;
  if (!attempted) return MARKS.UNATTEMPTED;
  return correct === true ? MARKS.CORRECT : correct === false ? MARKS.WRONG : MARKS.UNATTEMPTED;
}
