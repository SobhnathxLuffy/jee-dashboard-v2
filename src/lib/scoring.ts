// ─── Scoring config ─── the single source of truth for marks & penalties ─────────
// Every scoring site (Player, Results, analytics, future key-later self-mark)
// must derive its marks from here. Supports configurable schemes (JEE Main +4/-1,
// CUET +5/-1, BITSAT +3/-1, JEE Advanced, and custom schemes).
import type { MarkingScheme } from "./types";

export const MARKS = { CORRECT: 4, WRONG: -1, UNATTEMPTED: 0 } as const;

export const DEFAULT_MARKING_SCHEME: MarkingScheme = {
  correct: 4,
  wrong: -1,
};

export const PRESET_MARKING_SCHEMES: {
  id: string;
  label: string;
  scheme: MarkingScheme;
  description: string;
}[] = [
  {
    id: "jee-main",
    label: "JEE Main (+4, −1)",
    scheme: { correct: 4, wrong: -1 },
    description: "Standard NTA JEE Main pattern",
  },
  {
    id: "cuet",
    label: "CUET UG (+5, −1)",
    scheme: { correct: 5, wrong: -1 },
    description: "5 marks for correct, 1 mark deduction",
  },
  {
    id: "bitsat",
    label: "BITSAT (+3, −1)",
    scheme: { correct: 3, wrong: -1 },
    description: "3 marks for correct, 1 mark deduction",
  },
  {
    id: "jee-adv-1",
    label: "JEE Advanced (+3, −1)",
    scheme: { correct: 3, wrong: -1 },
    description: "Single correct MCQ / Numerical",
  },
  {
    id: "jee-adv-2",
    label: "JEE Advanced (+4, −2)",
    scheme: { correct: 4, wrong: -2 },
    description: "More negative penalty",
  },
  {
    id: "practice",
    label: "Practice / No Negative (+4, 0)",
    scheme: { correct: 4, wrong: 0 },
    description: "No deduction for wrong answers",
  },
  {
    id: "custom",
    label: "Custom Scheme",
    scheme: { correct: 4, wrong: -1 },
    description: "Define your own positive and negative marks",
  },
];

/**
 * Marks for one question under the given scheme (defaults to +4 / −1).
 * - bonus (dropped question) → +correct for everyone, attempted or not
 * - unattempted → 0 (even when a key exists)
 * - correct === null (pending self-mark, key-later mode) → 0 until marked
 * - correct → +correct ; wrong → −Math.abs(wrong)
 *
 * Bonus is checked FIRST so unattempted bonus questions still award full marks.
 */
export function marksFor(
  attempted: boolean,
  correct: boolean | null,
  bonus = false,
  scheme: MarkingScheme = DEFAULT_MARKING_SCHEME
): number {
  const cMarks = typeof scheme?.correct === "number" ? scheme.correct : 4;
  const wMarks = typeof scheme?.wrong === "number" ? (scheme.wrong === 0 ? 0 : -Math.abs(scheme.wrong)) : -1;
  if (bonus) return cMarks;
  if (!attempted) return 0;
  return correct === true ? cMarks : correct === false ? wMarks : 0;
}
