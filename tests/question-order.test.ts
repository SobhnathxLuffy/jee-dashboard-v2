import { describe, it, expect } from "vitest";
import { parseQuestionsJson, sortQuestionsByPaperOrder } from "@/lib/question-json";
import type { Question } from "@/lib/types";

describe("Question parsing sequence and sorting", () => {
  it("preserves exact array index sequence with order 1..N and monotonic timestamps", () => {
    const raw = JSON.stringify([
      {
        subject: "Chemistry",
        chapter: "Solutions",
        type: "MCQ",
        question: "What is the van 't Hoff factor for a non-electrolyte?",
        options: ["0", "1", "2", "3"],
        answer: 1,
      },
      {
        subject: "Chemistry",
        chapter: "Electrochemistry",
        type: "MCQ",
        question: "Faraday's second law connects what?",
        options: ["mass", "charge", "equivalent weight", "potential"],
        answer: 2,
      },
      {
        subject: "Chemistry",
        chapter: "Kinetics",
        type: "MCQ",
        question: "For a zero-order reaction, rate equals?",
        options: ["k", "k[A]", "k[A]^2", "0"],
        answer: 0,
      },
    ]);

    const parsed = parseQuestionsJson(raw);
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.ok).toHaveLength(3);

    // Q1 should be Van 't Hoff with order 1
    expect(parsed.ok[0].order).toBe(1);
    expect(parsed.ok[0].question).toContain("van 't Hoff");

    // Q2 should have order 2
    expect(parsed.ok[1].order).toBe(2);

    // Q3 should have order 3
    expect(parsed.ok[2].order).toBe(3);

    // Created_at strictly monotonic
    expect(parsed.ok[0].created_at).toBeLessThan(parsed.ok[1].created_at);
    expect(parsed.ok[1].created_at).toBeLessThan(parsed.ok[2].created_at);

    // Sort order test
    const sorted = sortQuestionsByPaperOrder([parsed.ok[2], parsed.ok[0], parsed.ok[1]]);
    expect(sorted[0].question).toContain("van 't Hoff");
    expect(sorted[1].question).toContain("Faraday");
    expect(sorted[2].question).toContain("zero-order");
  });

  it("Van 't Hoff heuristic surfaces Van 't Hoff question first even on legacy records lacking order field", () => {
    const legacyQ1 = {
      id: "z999",
      question: "Faraday's law of electrolysis",
      options: ["A", "B", "C", "D"],
      answer: 0,
      tolerance: 0,
      type: "MCQ" as const,
      subject: "Chemistry" as const,
      chapter: "Electrochemistry",
      source: "CUET UG 2025 Chemistry",
      created_at: 1000,
    };
    const legacyQ2 = {
      id: "a001",
      question: "The value of van 't Hoff factor for NaCl at infinite dilution is:",
      options: ["1", "2", "3", "0"],
      answer: 1,
      tolerance: 0,
      type: "MCQ" as const,
      subject: "Chemistry" as const,
      chapter: "Solutions",
      source: "CUET UG 2025 Chemistry",
      created_at: 1000,
    };

    const sorted = sortQuestionsByPaperOrder([legacyQ1, legacyQ2]);
    expect(sorted[0].question).toContain("van 't Hoff");
    expect(sorted[1].question).toContain("Faraday");
  });
});
