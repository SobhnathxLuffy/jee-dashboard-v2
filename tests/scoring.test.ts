import { describe, it, expect } from "vitest";
import { MARKS, marksFor } from "@/lib/scoring";

describe("MARKS constants", () => {
  it("uses the NTA scheme: +4 correct, -1 wrong, 0 unattempted", () => {
    expect(MARKS.CORRECT).toBe(4);
    expect(MARKS.WRONG).toBe(-1);
    expect(MARKS.UNATTEMPTED).toBe(0);
  });
});

describe("marksFor — unattempted", () => {
  it("returns 0 for unattempted non-bonus questions", () => {
    expect(marksFor(false, false, false)).toBe(0);
    expect(marksFor(false, null, false)).toBe(0);
    expect(marksFor(false, true, false)).toBe(0);
  });
});

describe("marksFor — bonus (dropped question)", () => {
  it("returns +4 for everyone, attempted or not (per JSDoc contract)", () => {
    // The contract: bonus → +4 for everyone, attempted or not.
    // This is the bug fix from Phase 2c — bonus must be checked BEFORE !attempted.
    expect(marksFor(false, false, true)).toBe(4);
    expect(marksFor(false, null, true)).toBe(4);
    expect(marksFor(false, true, true)).toBe(4);
  });

  it("returns +4 for attempted bonus questions regardless of correct/wrong", () => {
    expect(marksFor(true, true, true)).toBe(4);
    expect(marksFor(true, false, true)).toBe(4);
    expect(marksFor(true, null, true)).toBe(4);
  });
});

describe("marksFor — attempted non-bonus", () => {
  it("returns +4 for correct", () => {
    expect(marksFor(true, true, false)).toBe(4);
  });

  it("returns -1 for wrong (MCQ AND numerical — NTA Section B has negative marking)", () => {
    // Scoring is the same for MCQ and numerical per the project's NTA scheme.
    expect(marksFor(true, false, false)).toBe(-1);
  });

  it("returns 0 for pending self-mark (correct === null, key-later mode)", () => {
    expect(marksFor(true, null, false)).toBe(0);
  });
});

describe("marksFor — default bonus param", () => {
  it("defaults bonus to false", () => {
    expect(marksFor(true, true)).toBe(4);
    expect(marksFor(true, false)).toBe(-1);
    expect(marksFor(true, null)).toBe(0);
    expect(marksFor(false, false)).toBe(0);
  });
});

describe("marksFor — custom marking schemes", () => {
  it("scores CUET UG scheme (+5 / -1)", () => {
    const cuet = { correct: 5, wrong: -1 };
    expect(marksFor(true, true, false, cuet)).toBe(5);
    expect(marksFor(true, false, false, cuet)).toBe(-1);
    expect(marksFor(false, false, false, cuet)).toBe(0);
    expect(marksFor(false, false, true, cuet)).toBe(5);
  });

  it("scores BITSAT scheme (+3 / -1)", () => {
    const bitsat = { correct: 3, wrong: -1 };
    expect(marksFor(true, true, false, bitsat)).toBe(3);
    expect(marksFor(true, false, false, bitsat)).toBe(-1);
  });

  it("scores Practice zero-negative scheme (+4 / 0)", () => {
    const practice = { correct: 4, wrong: 0 };
    expect(marksFor(true, true, false, practice)).toBe(4);
    expect(marksFor(true, false, false, practice)).toBe(0);
  });
});
