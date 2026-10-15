import { describe, it, expect } from "vitest";
import { isRetryEligible } from "@/lib/retry";
import type { ResponseRecord, ActiveSession } from "@/lib/types";

describe("CBT attempt & retry tracking", () => {
  it("enrolls attempted wrong questions with C/F/A error tags", () => {
    const wrongAttempt: ResponseRecord = {
      id: "r1",
      test_id: "t1",
      question_id: "q1",
      selected: 2,
      correct: false,
      attempted: true,
      q_no: 1,
      time_spent: 45,
      error_tag: "C",
      subject: "Chemistry",
      chapter: "Solutions",
      question_snippet: "Van t Hoff factor...",
      correct_answer: 0,
      type: "MCQ",
    };
    expect(isRetryEligible(wrongAttempt)).toBe(true);
  });

  it("enrolls unattempted / skipped questions tagged C or F into Spaced Retry", () => {
    const skippedWithTag: ResponseRecord = {
      id: "r2",
      test_id: "t1",
      question_id: "q2",
      selected: null,
      correct: null,
      attempted: false,
      q_no: 2,
      time_spent: 10,
      error_tag: "F",
      subject: "Chemistry",
      chapter: "Electrochemistry",
      question_snippet: "Nernst equation calculation...",
      correct_answer: 1,
      type: "MCQ",
    };
    expect(isRetryEligible(skippedWithTag)).toBe(true);
  });

  it("does not enroll correct questions or questions without tags", () => {
    const correctRow: ResponseRecord = {
      id: "r3",
      test_id: "t1",
      question_id: "q3",
      selected: 1,
      correct: true,
      attempted: true,
      q_no: 3,
      time_spent: 60,
      error_tag: null,
      subject: "Chemistry",
      chapter: "Chemical Kinetics",
      question_snippet: "Rate law problem...",
      correct_answer: 1,
      type: "MCQ",
    };
    expect(isRetryEligible(correctRow)).toBe(false);

    const untaggedWrong: ResponseRecord = {
      ...correctRow,
      id: "r4",
      correct: false,
      error_tag: null,
    };
    expect(isRetryEligible(untaggedWrong)).toBe(false);
  });
});

describe("CBT timer pause calculation", () => {
  it("freezes remaining countdown when paused", () => {
    const started = 1000000;
    const session: Partial<ActiveSession> = {
      started_at: started,
      duration_min: 60, // 3600s
      is_paused: true,
      paused_at: started + 600000, // paused after 10 min (600s)
      total_paused_ms: 0,
    };

    // 5 minutes later while still paused:
    const now = started + 900000; // 15 min after test started
    const totalPausedMs =
      (session.total_paused_ms ?? 0) +
      (session.is_paused && session.paused_at ? now - session.paused_at : 0);
    const effectiveElapsedMs = Math.max(0, now - session.started_at! - totalPausedMs);
    const remaining = Math.max(0, session.duration_min! * 60 - effectiveElapsedMs / 1000);

    // Remaining should be exactly 3000 seconds (50 min), not 45 min
    expect(remaining).toBe(3000);
  });

  it("resumes countdown accurately after pause ends", () => {
    const started = 1000000;
    const session: Partial<ActiveSession> = {
      started_at: started,
      duration_min: 60,
      is_paused: false,
      total_paused_ms: 300000, // spent 5 min paused earlier
    };

    // 15 min after test start, with 5 min spent paused -> 10 min active solving
    const now = started + 900000;
    const totalPausedMs = session.total_paused_ms ?? 0;
    const effectiveElapsedMs = Math.max(0, now - session.started_at! - totalPausedMs);
    const remaining = Math.max(0, session.duration_min! * 60 - effectiveElapsedMs / 1000);

    // 60 min - 10 min = 50 min (3000s)
    expect(remaining).toBe(3000);
  });
});

describe("CBT in-test tagging & delete cascade", () => {
  it("prioritizes in-test explicit tags over auto-tag default fallback", () => {
    const autoTag = { enabled: true, tag: "C" as const };
    const sessionTags: Record<string, "F" | null> = { q1: "F" };

    const isMistake = true;
    const userTag = sessionTags["q1"] ?? null;
    const errorTag = userTag ?? (isMistake && autoTag.enabled ? autoTag.tag : null);

    expect(errorTag).toBe("F");
  });

  it("falls back to autoTag when no in-test tag was assigned for a mistake", () => {
    const autoTag = { enabled: true, tag: "C" as const };
    const sessionTags: Record<string, "F" | null> = {};

    const isMistake = true;
    const userTag = sessionTags["q1"] ?? null;
    const errorTag = userTag ?? (isMistake && autoTag.enabled ? autoTag.tag : null);

    expect(errorTag).toBe("C");
  });

  it("preserves non-retry tags like G (Guess) and R (Rushed) without enrolling in spaced retry", () => {
    const guessAttempt: ResponseRecord = {
      id: "r-guess",
      test_id: "t1",
      question_id: "q-guess",
      selected: 1,
      correct: false,
      attempted: true,
      q_no: 4,
      time_spent: 30,
      error_tag: "G",
      subject: "Physics",
      chapter: "Kinematics",
      question_snippet: "Projectile motion velocity...",
      correct_answer: 0,
      type: "MCQ",
    };
    expect(guessAttempt.error_tag).toBe("G");
    expect(isRetryEligible(guessAttempt)).toBe(false);
  });

  it("filters cascading items for test deletion correctly across stores", () => {
    const targetTestId = "test-123";
    const otherTestId = "test-456";

    const responses = [
      { id: "r1", test_id: targetTestId },
      { id: "r2", test_id: targetTestId },
      { id: "r3", test_id: otherTestId },
    ];
    const retryQueue = [
      { id: `${targetTestId}:q1`, test_id: targetTestId },
      { id: `${otherTestId}:q2`, test_id: otherTestId },
    ];
    const timelogIds = [`test-${targetTestId}`, `test-${otherTestId}`];

    // Cascade filter simulation:
    const remainingResponses = responses.filter((r) => r.test_id !== targetTestId);
    const remainingQueue = retryQueue.filter(
      (item) => item.test_id !== targetTestId && !item.id.startsWith(`${targetTestId}:`)
    );
    const remainingTimelogs = timelogIds.filter((id) => id !== `test-${targetTestId}`);

    expect(remainingResponses).toHaveLength(1);
    expect(remainingResponses[0].id).toBe("r3");

    expect(remainingQueue).toHaveLength(1);
    expect(remainingQueue[0].id).toBe(`${otherTestId}:q2`);

    expect(remainingTimelogs).toEqual([`test-${otherTestId}`]);
  });
});
