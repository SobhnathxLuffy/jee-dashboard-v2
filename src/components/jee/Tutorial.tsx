"use client";

// ─── Phase 5: In-app tutorial ──────────────────────────────────────────────
// Short, skippable, replayable. Runs on first launch (kv "tutorial-seen-v1"),
// can be replayed from Settings, and has a static Guide page at /guide.
//
// Design:
// - Module-level singleton store (mirrors the FocusTimer modal pattern) so any
//   component can call `startTutorial()` without prop-drilling.
// - `useTutorial()` reads localStorage + kv once on mount and exposes `shouldShowOnLaunch`.
// - `TutorialOverlay` is rendered once at the App root; it subscribes to the
//   store and only paints when active.
// - Spotlight = a fixed full-screen black overlay with a cut-out (box-shadow
//   trick) around the target element. If the target isn't mounted (user is on
//   a different tab) the card is centered instead.
// - Keyboard: Tab/Shift+Tab cycle Back → Next → Skip; Enter/Space activates;
//   Esc skips to the end. aria-modal + role="dialog" for screen readers.
// - On dismiss/skip/done: writes "tutorial-seen-v1" = "1" to localStorage + kv.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { kvGet, kvSet } from "@/lib/idb";
import { X } from "lucide-react";
import { TUTORIAL_STEPS, type TutorialStep } from "@/lib/tutorial-steps";

export const TUTORIAL_SEEN_KEY = "tutorial-seen-v1";

// Re-export so existing imports keep working.
export type { TutorialStep };
export { TUTORIAL_STEPS };

export function isTutorialSeen(): boolean {
  if (typeof window !== "undefined" || typeof localStorage !== "undefined") {
    try {
      if (typeof localStorage !== "undefined" && localStorage.getItem(TUTORIAL_SEEN_KEY) === "1") {
        return true;
      }
    } catch {
      /* ignore storage access restrictions */
    }
  }
  return false;
}

export function markTutorialSeen(): void {
  if (typeof window !== "undefined" || typeof localStorage !== "undefined") {
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(TUTORIAL_SEEN_KEY, "1");
      }
    } catch {
      /* ignore storage access restrictions */
    }
  }
  if (typeof window !== "undefined") {
    void kvSet(TUTORIAL_SEEN_KEY, "1").catch(() => {});
  }
}

// ─── Singleton store (mirrors the FocusTimer modal pattern) ──────────────────
let activeStep: number | null = null;
const listeners = new Set<() => void>();
function emit(): void {
  for (const l of listeners) l();
}
function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
function getActiveStep(): number | null {
  return activeStep;
}
export function startTutorial(): void {
  activeStep = 0;
  emit();
}
export function dismissTutorial(): void {
  activeStep = null;
  markTutorialSeen();
  emit();
}

/**
 * Reads the "tutorial-seen-v1" flag. Returns:
 * - `shouldShowOnLaunch` — true only once, on fresh first launch.
 * - `start()` — opens the tutorial at step 0.
 * - `dismiss()` — closes the tutorial and marks it seen permanently.
 */
export function useTutorial(): {
  shouldShowOnLaunch: boolean;
  ready: boolean;
  start: () => void;
  dismiss: () => void;
} {
  const [seen, setSeen] = useState<boolean>(() => isTutorialSeen());

  useEffect(() => {
    if (seen) return;
    let alive = true;
    kvGet<string>(TUTORIAL_SEEN_KEY)
      .then((v) => {
        if (!alive) return;
        const isSeen = v === "1";
        if (isSeen) {
          markTutorialSeen();
          setSeen(true);
        } else {
          setSeen(false);
        }
      })
      .catch(() => {
        if (alive) setSeen(false);
      });
    return () => {
      alive = false;
    };
  }, [seen]);

  // Sync if tutorial is dismissed from anywhere
  useEffect(() => {
    return subscribe(() => {
      if (activeStep === null && isTutorialSeen()) {
        setSeen(true);
      }
    });
  }, []);

  const start = useCallback(() => {
    startTutorial();
  }, []);

  const dismiss = useCallback(() => {
    setSeen(true);
    dismissTutorial();
  }, []);

  return {
    ready: true,
    shouldShowOnLaunch: !seen,
    start,
    dismiss,
  };
}

// ─── Overlay ─────────────────────────────────────────────────────────────────

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function getTargetRect(selector: string | null): Rect | null {
  if (!selector || typeof window === "undefined") return null;
  let el: Element | null = null;
  try {
    el = document.querySelector(selector);
  } catch {
    return null;
  }
  if (!el) return null;
  const r = el.getBoundingClientRect();
  // Treat zero-size or fully off-screen elements as "not mounted".
  if (r.width < 4 || r.height < 4) return null;
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

const PAD = 8; // px padding around the highlighted element
const CARD_W = 380;
const CARD_GUESS_H = 260; // rough height used for placement math

export function TutorialOverlay() {
  const step = useSyncExternalStore(subscribe, getActiveStep, getActiveStep);
  const open = step !== null;

  const [rect, setRect] = useState<Rect | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  const stepDef = open && step !== null ? TUTORIAL_STEPS[step] : null;

  // Recompute target rect whenever the step changes, the window resizes, or
  // the user scrolls. requestAnimationFrame batches the updates per frame.
  useEffect(() => {
    if (!open || !stepDef) {
      Promise.resolve().then(() => setRect(null));
      return;
    }
    let alive = true;
    const update = () => {
      if (!alive) return;
      const next = getTargetRect(stepDef.targetSelector);
      setRect(next);
    };
    update();
    const raf = window.requestAnimationFrame(update);
    const onResize = () => update();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      alive = false;
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [open, stepDef]);

  // Scroll the target into view (best-effort) when it first appears.
  useEffect(() => {
    if (!open || !stepDef || !rect) return;
    try {
      const el = document.querySelector(stepDef.targetSelector ?? "");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    } catch {
      /* ignore — selector might be null */
    }
  }, [open, stepDef, rect]);

  // Focus the Next button when the step changes so keyboard nav starts there.
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => {
      const next = cardRef.current?.querySelector<HTMLButtonElement>(
        '[data-tut-btn="next"]'
      );
      next?.focus();
    }, 30);
    return () => window.clearTimeout(id);
  }, [open, step]);

  const goNext = useCallback((e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (activeStep === null) return;
    if (activeStep >= TUTORIAL_STEPS.length - 1) {
      dismissTutorial();
      return;
    }
    activeStep = activeStep + 1;
    emit();
  }, []);

  const goBack = useCallback((e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (activeStep === null) return;
    if (activeStep > 0) {
      activeStep = activeStep - 1;
      emit();
    }
  }, []);

  const skip = useCallback((e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    dismissTutorial();
  }, []);

  // Keyboard: Esc = skip; ArrowRight/Enter = next; ArrowLeft = back; Tab cycles
  // between Back → Next → Skip (focus trap inside the card so the underlying
  // app never receives focus while the overlay is up).
  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        skip();
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goBack();
        return;
      }
      if (e.key === "Tab") {
        const card = cardRef.current;
        if (!card) return;
        const focusables = Array.from(
          card.querySelectorAll<HTMLButtonElement>("button:not([disabled])")
        );
        if (focusables.length === 0) return;
        const idx = focusables.findIndex((b) => b === document.activeElement);
        e.preventDefault();
        const nextIdx = e.shiftKey
          ? idx <= 0
            ? focusables.length - 1
            : idx - 1
          : idx < 0 || idx === focusables.length - 1
            ? 0
            : idx + 1;
        focusables[nextIdx]?.focus();
      }
    },
    [skip, goNext, goBack]
  );

  useEffect(() => {
    if (!open) return;
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onKeyDown]);

  if (!open || !stepDef || step === null) return null;

  const total = TUTORIAL_STEPS.length;
  const isLast = step === total - 1;
  const hasTarget = rect !== null;

  // Card position: if there's a target, anchor the card below it (or above if
  // not enough room). Otherwise center it on the screen.
  let cardStyle: React.CSSProperties;
  if (hasTarget && rect) {
    const gap = 16;
    const spaceBelow = window.innerHeight - (rect.top + rect.height) - gap;
    const spaceAbove = rect.top - gap;
    const placeBelow = spaceBelow >= CARD_GUESS_H || spaceBelow >= spaceAbove;
    const top = placeBelow
      ? rect.top + rect.height + gap
      : Math.max(16, rect.top - CARD_GUESS_H - gap);
    // Center horizontally against the target's midpoint, clamped to viewport.
    const centerX = rect.left + rect.width / 2;
    const left = Math.max(
      16,
      Math.min(window.innerWidth - CARD_W - 16, centerX - CARD_W / 2)
    );
    cardStyle = { top, left, width: CARD_W };
  } else {
    cardStyle = {
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: "min(92vw, 380px)",
    };
  }

  const btnBase =
    "inline-flex items-center justify-center rounded-md text-xs font-medium transition-colors h-8 px-3 disabled:opacity-50 disabled:pointer-events-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1 outline-none";

  return (
    <div
      aria-modal="true"
      role="dialog"
      aria-label={`Tutorial: ${stepDef.title}`}
      className="fixed inset-0 z-50 select-none"
    >
      {/* Backdrop & spotlight cut-out: clicking backdrop dismisses */}
      {hasTarget && rect ? (
        <div
          aria-hidden="true"
          onClick={skip}
          className="absolute inset-0 cursor-default"
        >
          <div
            className="absolute pointer-events-none"
            style={{
              left: rect.left - PAD,
              top: rect.top - PAD,
              width: rect.width + PAD * 2,
              height: rect.height + PAD * 2,
              borderRadius: 12,
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.65)",
              border: "2px solid var(--primary, #059669)",
              transition: "all 0.18s ease",
            }}
          />
        </div>
      ) : (
        <div
          aria-hidden="true"
          onClick={skip}
          className="absolute inset-0 bg-black/65 cursor-default"
        />
      )}

      {/* Card: pointer-events-auto ensures buttons and card are fully interactive */}
      <div
        ref={cardRef}
        style={cardStyle}
        className="absolute bg-card border border-border rounded-xl shadow-xl p-4 space-y-3 pointer-events-auto z-10 select-text"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground font-medium">
              Tutorial · {step + 1} of {total}
            </div>
            <h2 className="text-sm font-semibold text-foreground mt-0.5">
              {stepDef.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={skip}
            aria-label="Skip tutorial"
            data-tut-btn="close"
            className="min-w-[28px] min-h-[28px] flex items-center justify-center text-muted-foreground hover:text-foreground rounded-md -mt-1 -mr-1 cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-[13px] text-muted-foreground leading-relaxed">
          {stepDef.body}
        </p>

        {!hasTarget && stepDef.fallbackHint ? (
          <p className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-md px-2.5 py-1.5">
            {stepDef.fallbackHint}
          </p>
        ) : null}

        {/* Progress dots */}
        <div
          className="flex items-center gap-1.5"
          role="group"
          aria-label={`Step ${step + 1} of ${total}`}
        >
          {TUTORIAL_STEPS.map((s, i) => (
            <span
              key={s.id}
              aria-hidden="true"
              className={`h-1.5 rounded-full transition-all ${
                i === step
                  ? "w-4 bg-primary"
                  : i < step
                    ? "w-1.5 bg-primary/60"
                    : "w-1.5 bg-muted-foreground/30"
              }`}
            />
          ))}
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            type="button"
            data-tut-btn="back"
            className={`${btnBase} text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer`}
            onClick={goBack}
            disabled={step === 0}
          >
            Back
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-tut-btn="skip"
              className={`${btnBase} text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer`}
              onClick={skip}
            >
              Skip
            </button>
            <button
              type="button"
              data-tut-btn="next"
              className={`${btnBase} bg-emerald-700 hover:bg-emerald-800 text-white dark:bg-emerald-600 dark:hover:bg-emerald-700 cursor-pointer`}
              onClick={goNext}
            >
              {isLast ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
