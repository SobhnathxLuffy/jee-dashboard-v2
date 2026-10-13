import { describe, it, expect } from "vitest";
import {
  computeChapterHealth,
  subjectAccuracy,
  negativeMarksByTest,
} from "@/lib/analytics";
import type { ResponseRecord, TestRecord } from "@/lib/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function makeResponse(overrides: Partial<ResponseRecord> = {}): ResponseRecord {
  return {
    id: `r-${Math.random().toString(36).slice(2, 9)}`,
    test_id: "t1",
    question_id: `q-${Math.random().toString(36).slice(2, 9)}`,
    selected: null,
    correct: null,
    attempted: false,
    time_spent: 0,
    error_tag: null,
    subject: "Physics",
    chapter: "Kinematics",
    question_snippet: "",
    correct_answer: 0,
    type: "MCQ",
    ...overrides,
  };
}

function makeTest(overrides: Partial<TestRecord> = {}): TestRecord {
  return {
    id: "t1",
    date: "2026-01-01",
    created_at: 1700000000000,
    name: "Test 1",
    source: "in-app",
    type: "full",
    duration_min: 60,
    score: 20,
    max_score: 80,
    subject_scores: {},
    ...overrides,
  };
}

// ─── computeChapterHealth ────────────────────────────────────────────────────
describe("computeChapterHealth — pending self-marks (correct === null)", () => {
  it("excludes pending rows from attempted, correct, AND wrong counts", () => {
    const responses: ResponseRecord[] = [
      makeResponse({ attempted: true, correct: true }),   // correct
      makeResponse({ attempted: true, correct: false }),  // wrong
      makeResponse({ attempted: true, correct: null }),   // pending self-mark
    ];
    const health = computeChapterHealth(responses, [makeTest()]);
    const h = health.get("Physics::Kinematics");
    expect(h).toBeDefined();
    // Pending row must NOT be counted as wrong (the bug) nor as attempted.
    // After fix: attempted = 2 (correct + wrong), correct = 1, wrong = 1
    expect(h!.attempted).toBe(2);
    expect(h!.correct).toBe(1);
    expect(h!.wrong).toBe(1);
    expect(h!.accuracy).toBe(50);
  });

  it("skips unattempted rows", () => {
    const responses: ResponseRecord[] = [
      makeResponse({ attempted: false, correct: null }),
      makeResponse({ attempted: true, correct: true }),
    ];
    const health = computeChapterHealth(responses, [makeTest()]);
    const h = health.get("Physics::Kinematics")!;
    expect(h.attempted).toBe(1);
    expect(h.correct).toBe(1);
    expect(h.wrong).toBe(0);
  });

  it("handles all-pending rows without dividing by zero", () => {
    const responses: ResponseRecord[] = [
      makeResponse({ attempted: true, correct: null }),
      makeResponse({ attempted: true, correct: null }),
    ];
    const health = computeChapterHealth(responses, [makeTest()]);
    const h = health.get("Physics::Kinematics");
    // With all pending excluded, no chapter entry should exist OR it should be empty.
    // Current impl creates the entry on attempted=true; after fix pending should not enter.
    if (h) {
      expect(h.attempted).toBe(0);
    }
  });
});

describe("computeChapterHealth — accuracy colors", () => {
  it("assigns green for >=70%", () => {
    const responses = [
      makeResponse({ attempted: true, correct: true }),
      makeResponse({ attempted: true, correct: true }),
      makeResponse({ attempted: true, correct: true }),
      makeResponse({ attempted: true, correct: false }),
    ];
    const health = computeChapterHealth(responses, [makeTest()]);
    expect(health.get("Physics::Kinematics")!.color).toBe("green");
  });

  it("assigns amber for 40-69%", () => {
    const responses = [
      makeResponse({ attempted: true, correct: true }),
      makeResponse({ attempted: true, correct: false }),
    ];
    const health = computeChapterHealth(responses, [makeTest()]);
    expect(health.get("Physics::Kinematics")!.color).toBe("amber");
  });

  it("assigns red for <40%", () => {
    const responses = [
      makeResponse({ attempted: true, correct: true }),
      makeResponse({ attempted: true, correct: false }),
      makeResponse({ attempted: true, correct: false }),
      makeResponse({ attempted: true, correct: false }),
    ];
    const health = computeChapterHealth(responses, [makeTest()]);
    expect(health.get("Physics::Kinematics")!.color).toBe("red");
  });
});

// ─── subjectAccuracy ─────────────────────────────────────────────────────────
describe("subjectAccuracy — pending self-marks", () => {
  it("excludes pending rows from numerator AND denominator", () => {
    const responses: ResponseRecord[] = [
      makeResponse({ subject: "Physics", attempted: true, correct: true }),
      makeResponse({ subject: "Physics", attempted: true, correct: null }),  // pending
    ];
    const result = subjectAccuracy(responses);
    const physics = result.find((r) => r.subject === "Physics")!;
    // After fix: attempted = 1, correct = 1, accuracy = 100
    expect(physics.attempted).toBe(1);
    expect(physics.correct).toBe(1);
    expect(physics.accuracy).toBe(100);
  });

  it("does not count pending as wrong (the bug)", () => {
    const responses: ResponseRecord[] = [
      makeResponse({ subject: "Physics", attempted: true, correct: null }),
      makeResponse({ subject: "Physics", attempted: true, correct: null }),
      makeResponse({ subject: "Physics", attempted: true, correct: null }),
    ];
    const result = subjectAccuracy(responses);
    const physics = result.find((r) => r.subject === "Physics")!;
    // All pending → no data → 0 attempted, 0 correct, 0% (not 0/3 = 0%, but 0/0)
    expect(physics.attempted).toBe(0);
    expect(physics.correct).toBe(0);
    expect(physics.accuracy).toBe(0);
  });

  it("counts correct and wrong across multiple subjects", () => {
    const responses: ResponseRecord[] = [
      makeResponse({ subject: "Physics", attempted: true, correct: true }),
      makeResponse({ subject: "Physics", attempted: true, correct: false }),
      makeResponse({ subject: "Chemistry", attempted: true, correct: true }),
      makeResponse({ subject: "Chemistry", attempted: true, correct: true }),
    ];
    const result = subjectAccuracy(responses);
    const physics = result.find((r) => r.subject === "Physics")!;
    const chemistry = result.find((r) => r.subject === "Chemistry")!;
    expect(physics.accuracy).toBe(50);
    expect(chemistry.accuracy).toBe(100);
  });
});

// ─── negativeMarksByTest ─────────────────────────────────────────────────────
describe("negativeMarksByTest — pending self-marks", () => {
  it("does not count pending (correct === null) responses as wrong", () => {
    const test = makeTest({ id: "t1", score: 12, max_score: 20 });
    const responses: ResponseRecord[] = [
      makeResponse({ test_id: "t1", attempted: true, correct: true }),   // +4
      makeResponse({ test_id: "t1", attempted: true, correct: false }),  // -1
      makeResponse({ test_id: "t1", attempted: true, correct: null }),   // pending — must not count
    ];
    const result = negativeMarksByTest([test], responses);
    expect(result).toHaveLength(1);
    // After fix: wrong count = 1 (only the actually-wrong response)
    expect(result[0].lost).toBe(1);
    // ifSkipped = score + wrong = 12 + 1 = 13
    expect(result[0].ifSkipped).toBe(13);
  });

  it("computes ifSkipped correctly for external tests", () => {
    const test = makeTest({
      id: "t-ext",
      type: "external",
      score: 60,
      max_score: 300,
      external_meta: { attempts: 20, wrong: 5 },
    });
    const result = negativeMarksByTest([test], []);
    expect(result).toHaveLength(1);
    expect(result[0].lost).toBe(5);
    expect(result[0].ifSkipped).toBe(65); // 60 + 5
  });

  it("skips key-later tests (score === null)", () => {
    const test = makeTest({ id: "t-keylater", score: null, max_score: 80 });
    const result = negativeMarksByTest([test], []);
    expect(result).toHaveLength(0);
  });

  it("limits to last 12 tests", () => {
    const tests: TestRecord[] = [];
    for (let i = 0; i < 15; i++) {
      tests.push(makeTest({
        id: `t${i}`,
        created_at: 1700000000000 + i * 1000,
        score: 10 + i,
        max_score: 80,
      }));
    }
    const result = negativeMarksByTest(tests, []);
    expect(result).toHaveLength(12);
  });
});

// ─── Scoring invariant: MCQ and numerical both use -1 for wrong ─────────────
import { marksFor } from "@/lib/scoring";

describe("scoring invariant — MCQ and numerical both have negative marking", () => {
  it("marksFor returns -1 for wrong regardless of question type (per NTA Section B)", () => {
    // The project's scoring config treats MCQ and numerical alike.
    // This test guards against accidentally removing negative marking for numericals.
    expect(marksFor(true, false, false)).toBe(-1); // wrong = -1 for both types
    expect(marksFor(true, true, false)).toBe(4);   // correct = +4 for both types
  });
});
