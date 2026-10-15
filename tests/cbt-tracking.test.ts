import { describe, it, expect } from "vitest";
import { isRetryEligible } from "@/lib/retry";
import type { ResponseRecord } from "@/lib/types";

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
