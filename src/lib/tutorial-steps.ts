// Tutorial step content — shared between the TutorialOverlay (client) and the
// Guide page (server). This file has no "use client" directive so it can be
// imported from both server and client components.

export interface TutorialStep {
  id: string;
  title: string;
  body: string;
  /** CSS selector for the element to highlight, or null for centered card. */
  targetSelector: string | null;
  /** Hint shown when the target element isn't mounted. */
  fallbackHint: string;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "deadlines",
    title: "Your deadlines",
    body: "Set your JEE and board exam dates in Settings. The app counts down weeks and shifts your phase from Cover → Consolidate → Mock-only.",
    targetSelector: '[data-tutorial="target-exams"]',
    fallbackHint: "Open the Dashboard tab to see your target exams.",
  },
  {
    id: "today",
    title: "Today card",
    body: "Plan tonight for tomorrow. Set weekly hour targets, start a 50-min focus sprint or a 'just 5 minutes' spark, and log time by activity type.",
    targetSelector: '[data-tutorial="today-card"]',
    fallbackHint: "Open the Dashboard tab to see the Today card.",
  },
  {
    id: "coverage",
    title: "Coverage pace",
    body: "Track how many syllabus chapters you've covered versus the weeks left. Stay on pace to finish before mocks.",
    targetSelector: '[data-tutorial="coverage-pace"]',
    fallbackHint: "Open the Syllabus tab to see coverage pace.",
  },
  {
    id: "syllabus",
    title: "Syllabus + Recall check",
    body: "Mark each chapter's status. Use Recall check to self-test a chapter before marking it done.",
    targetSelector: '[data-tutorial="syllabus"]',
    fallbackHint: "Open the Syllabus tab to see the chapter tracker.",
  },
  {
    id: "tests",
    title: "Take tests",
    body: "New CBT builds a test from your question bank. PDF Test lets you attempt a paper and mark it later. Papers keeps your imported PDFs.",
    targetSelector: '[data-tutorial="test-create"]',
    fallbackHint: "Open the New CBT tab (or PDF Test / Papers) to see test creation.",
  },
  {
    id: "mistakes",
    title: "Review your mistakes",
    body: "After each test, tag every wrong answer: C (Concept), F (Formula), A (Algebra-calc), R (Read wrong), T (Time), G (Guess). Each tag tells you what to fix.",
    targetSelector: '[data-tutorial="results-tags"]',
    fallbackHint: "Finish a test, then open its Review screen to tag your mistakes.",
  },
  {
    id: "retry",
    title: "Spaced retry",
    body: "Questions tagged C, F, or A enter the retry queue. Mark each 'Got it' or 'Still wrong' — the schedule is +1d, +3d, +7d.",
    targetSelector: '[data-tutorial="spaced-retry"]',
    fallbackHint: "Open the Dashboard tab to see the Spaced Retry queue.",
  },
  {
    id: "anki",
    title: "Anki check-in",
    body: "Anki runs on your phone. Use this check-in to log that you finished your daily reviews and new cards.",
    targetSelector: '[data-tutorial="anki-checkin"]',
    fallbackHint: "Open the Dashboard tab to see the Anki check-in row.",
  },
  {
    id: "weekly",
    title: "Weekly scorecard + experiments",
    body: "Every week, review your hours, accuracy, and retry progress. Run small experiments (study/skill) to find what works for you.",
    targetSelector: '[data-tutorial="experiments"]',
    fallbackHint: "Open the Dashboard tab to see Experiments. The Weekly Scorecard lives on the Performance tab.",
  },
  {
    id: "backup",
    title: "Back up your data",
    body: "Everything is stored locally in your browser. Export a backup JSON from the Data tab every week so you never lose your progress.",
    targetSelector: '[data-tutorial="data-export"]',
    fallbackHint: "Open the Data tab to see the backup buttons.",
  },
];
