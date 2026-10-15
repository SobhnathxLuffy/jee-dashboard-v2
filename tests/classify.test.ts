import { describe, it, expect } from "vitest";
import { classifyAttempt, IDEAL_TIME } from "@/lib/scoring";

describe("IDEAL_TIME constants", () => {
  it("matches the README slow-trap thresholds (MCQ 150s, numerical 240s)", () => {
    expect(IDEAL_TIME.MCQ).toBe(150);
    expect(IDEAL_TIME.numerical).toBe(240);
  });
});

describe("classifyAttempt — ungraded", () => {
  it("practice attempts are ungraded even when correct and fast", () => {
    expect(
      classifyAttempt({
        attempted: true,
        correct: true,
        timeSpent: 60,
        type: "MCQ",
        isPractice: true,
      })
    ).toBe("ungraded");
  });

  it("attempted but pending self-mark (correct === null) is ungraded", () => {
    expect(
      classifyAttempt({ attempted: true, correct: null, timeSpent: 200, type: "MCQ" })
    ).toBe("ungraded");
  });
});

describe("classifyAttempt — skipped", () => {
  it("unattempted is skipped even though Player stores correct: null for skips", () => {
    // Precedence contract: !attempted wins over the pending bucket. Player
    // submit writes correct: null for every skipped row (tri-state rule), so
    // if ungraded were checked first, "skipped" would never be observable.
    expect(
      classifyAttempt({ attempted: false, correct: null, timeSpent: 0, type: "MCQ" })
    ).toBe("skipped");
    expect(
      classifyAttempt({ attempted: false, correct: false, timeSpent: 45, type: "numerical" })
    ).toBe("skipped");
  });
});

describe("classifyAttempt — correct answers", () => {
  it("correct within the ideal time is perfect (boundary: exactly ideal)", () => {
    expect(
      classifyAttempt({ attempted: true, correct: true, timeSpent: 150, type: "MCQ" })
    ).toBe("perfect");
    expect(
      classifyAttempt({ attempted: true, correct: true, timeSpent: 90, type: "MCQ" })
    ).toBe("perfect");
  });

  it("correct over the ideal time is overtime (boundary: ideal + 1s)", () => {
    expect(
      classifyAttempt({ attempted: true, correct: true, timeSpent: 151, type: "MCQ" })
    ).toBe("overtime");
    expect(
      classifyAttempt({ attempted: true, correct: true, timeSpent: 241, type: "numerical" })
    ).toBe("overtime");
  });

  it("numerical gets the looser 240s ideal (exactly 240s is still perfect)", () => {
    expect(
      classifyAttempt({ attempted: true, correct: true, timeSpent: 240, type: "numerical" })
    ).toBe("perfect");
  });
});

describe("classifyAttempt — wrong answers (Embibe model)", () => {
  it("wrong within 30s is rushed (boundary: exactly 30s is rushed)", () => {
    expect(
      classifyAttempt({ attempted: true, correct: false, timeSpent: 12, type: "MCQ" })
    ).toBe("rushed");
    expect(
      classifyAttempt({ attempted: true, correct: false, timeSpent: 30, type: "numerical" })
    ).toBe("rushed");
  });

  it("wrong between 30s and ideal is wasted — not rushed, never perfect", () => {
    expect(
      classifyAttempt({ attempted: true, correct: false, timeSpent: 31, type: "MCQ" })
    ).toBe("wasted");
    expect(
      classifyAttempt({ attempted: true, correct: false, timeSpent: 150, type: "MCQ" })
    ).toBe("wasted");
  });

  it("wrong over the ideal time is still wasted (a wrong attempt never becomes overtime)", () => {
    expect(
      classifyAttempt({ attempted: true, correct: false, timeSpent: 400, type: "MCQ" })
    ).toBe("wasted");
    expect(
      classifyAttempt({ attempted: true, correct: false, timeSpent: 600, type: "numerical" })
    ).toBe("wasted");
  });
});

describe("classifyAttempt — unknown question types", () => {
  it("falls back to the MCQ ideal for unknown type strings", () => {
    expect(
      classifyAttempt({ attempted: true, correct: true, timeSpent: 150, type: "matrix" })
    ).toBe("perfect");
    expect(
      classifyAttempt({ attempted: true, correct: true, timeSpent: 151, type: "matrix" })
    ).toBe("overtime");
  });
});
