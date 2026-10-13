import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  TUTORIAL_SEEN_KEY,
  isTutorialSeen,
  markTutorialSeen,
  startTutorial,
  dismissTutorial,
  TUTORIAL_STEPS,
} from "@/components/jee/Tutorial";

describe("Tutorial State and Dismissal", () => {
  beforeEach(() => {
    // Reset localStorage mock
    const store: Record<string, string> = {};
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
      clear: () => {
        for (const k in store) delete store[k];
      },
    });
    dismissTutorial();
    localStorage.removeItem(TUTORIAL_SEEN_KEY);
  });

  it("identifies unseen tutorial on fresh install", () => {
    expect(isTutorialSeen()).toBe(false);
  });

  it("marks tutorial seen synchronously and in storage", () => {
    markTutorialSeen();
    expect(isTutorialSeen()).toBe(true);
    expect(localStorage.getItem(TUTORIAL_SEEN_KEY)).toBe("1");
  });

  it("starts tutorial at step 0 and dismisses cleanly", () => {
    startTutorial();
    // After start, dismiss should mark seen and reset
    dismissTutorial();
    expect(isTutorialSeen()).toBe(true);
    expect(localStorage.getItem(TUTORIAL_SEEN_KEY)).toBe("1");
  });

  it("contains all 10 planned tutorial steps with unique IDs", () => {
    expect(TUTORIAL_STEPS.length).toBe(10);
    const ids = new Set(TUTORIAL_STEPS.map((s) => s.id));
    expect(ids.size).toBe(10);
  });
});
