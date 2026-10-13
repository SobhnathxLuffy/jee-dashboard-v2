"use client";

// ─── Phase 3: Focus timer persistence + external modal store ─────────────────
// The timer is persisted to kv ("focus-timer-active") so it survives tab-hide,
// device sleep, dialog close, and refresh. The remaining time is always
// derived from (startedAt, pausedMs, target) — never from a setInterval
// counter — so it cannot drift when the tab is hidden.
//
// Side-effects on completion (toast, logTime, kv clear) live in a useEffect
// guarded by a ref, NOT inside a setState updater — that was the original bug
// (double-fire under StrictMode / re-renders).

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { kvGet, kvSet, kvDel, put, subscribeToStore } from "@/lib/idb";
import {
  todayStr,
  uid,
  type Subject,
  type TimeCategory,
  type TimeLogEntry,
} from "@/lib/types";

export const FOCUS_TIMER_KEY = "focus-timer-active";
// Separate kv key holding the epoch-ms timestamp when the current pause began.
// Absent (or null) when the timer is running. Kept outside the FocusTimerState
// shape so the persisted object matches the Phase 3 spec exactly.
const FOCUS_TIMER_PAUSED_AT_KEY = "focus-timer-paused-at";

export interface FocusTimerState {
  startedAt: number;
  mode: "50m" | "5m";
  target: number; // total seconds (50*60 or 5*60)
  category: TimeCategory;
  activity: string;
  subject: Subject | "none";
  pausedMs: number; // accumulated completed pause ms (0 if never paused)
}

export function targetFor(mode: "50m" | "5m"): number {
  return mode === "50m" ? 50 * 60 : 5 * 60;
}

/**
 * Compute remaining seconds from the persisted state + the current wall clock.
 * If `pausedAt` is non-null, the in-progress pause is subtracted too so the
 * value stays frozen while the user is paused.
 */
export function remainingSeconds(
  state: FocusTimerState,
  nowMs: number,
  pausedAt: number | null
): number {
  const livePauseMs = pausedAt !== null ? Math.max(0, nowMs - pausedAt) : 0;
  const elapsed = Math.floor((nowMs - state.startedAt - state.pausedMs - livePauseMs) / 1000);
  return Math.max(0, state.target - elapsed);
}

// ─── External modal store ────────────────────────────────────────────────────
// Lets the App header chip and the TodayCard buttons open the same singleton
// FocusTimerModal without prop-drilling through Dashboard.
let modalOpen = false;
let modalMode: "50m" | "5m" = "50m";
const modalListeners = new Set<() => void>();
function emitModal(): void {
  for (const l of modalListeners) l();
}
function subscribeModal(cb: () => void): () => void {
  modalListeners.add(cb);
  return () => {
    modalListeners.delete(cb);
  };
}
function getModalOpen(): boolean {
  return modalOpen;
}
export function openFocusTimerModal(mode: "50m" | "5m" = "50m"): void {
  modalMode = mode;
  modalOpen = true;
  emitModal();
}
export function closeFocusTimerModal(): void {
  modalOpen = false;
  emitModal();
}
export function useFocusTimerModalState(): { open: boolean; mode: "50m" | "5m" } {
  const open = useSyncExternalStore(subscribeModal, getModalOpen, getModalOpen);
  const [mode, setMode] = useState<"50m" | "5m">(modalMode);
  useEffect(() => {
    const cb = () => setMode(modalMode);
    modalListeners.add(cb);
    return () => {
      modalListeners.delete(cb);
    };
  }, []);
  return { open, mode };
}

// ─── Logging helpers ─────────────────────────────────────────────────────────
async function logTimeEntry(s: FocusTimerState, minutes: number): Promise<void> {
  const entry: TimeLogEntry = {
    id: uid(),
    category: s.category,
    activity: s.activity,
    date: todayStr(),
    minutes,
    subject: s.subject !== "none" ? s.subject : undefined,
    note: `${s.mode === "5m" ? "5-minute spark" : "50-minute focus"} session`,
    created_at: Date.now(),
  };
  await put("timelog", entry);
  toast.success(`Logged ${minutes} min to ${s.category} (${s.activity})`);
}

/**
 * Log + clear the persisted timer ONLY if the kv entry still exists.
 * The kv-existence check makes this safe to call from multiple places
 * (modal completion effect, App mount toast) — only the first caller logs.
 */
async function logTimeIfPresent(minutes: number): Promise<void> {
  const stored = await kvGet<FocusTimerState>(FOCUS_TIMER_KEY);
  if (!stored) return;
  await logTimeEntry(stored, minutes);
  await kvDel(FOCUS_TIMER_KEY);
  await kvDel(FOCUS_TIMER_PAUSED_AT_KEY);
}

// ─── Chip hook (read-only, ticks every second) ───────────────────────────────
export function useFocusTimerChip(): {
  remaining: number;
  mode: "50m" | "5m";
  paused: boolean;
} | null {
  const [state, setState] = useState<FocusTimerState | undefined>(undefined);
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [s, p] = await Promise.all([
        kvGet<FocusTimerState>(FOCUS_TIMER_KEY),
        kvGet<number>(FOCUS_TIMER_PAUSED_AT_KEY),
      ]);
      if (!alive) return;
      setState(s);
      setPausedAt(p ?? null);
      setNow(Date.now());
    };
    void load();
    const unsub = subscribeToStore((store) => {
      if (store === "kv") void load();
    });
    return () => {
      alive = false;
      unsub();
    };
  }, []);

  useEffect(() => {
    if (!state) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [state]);

  if (!state) return null;
  return {
    remaining: remainingSeconds(state, now, pausedAt),
    mode: state.mode,
    paused: pausedAt !== null,
  };
}

// ─── The main hook used by FocusTimerContent ─────────────────────────────────
export function useFocusTimer(initialMode: "50m" | "5m") {
  const [state, setState] = useState<FocusTimerState | undefined>(undefined);
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(() => targetFor(initialMode));
  const [showPromptConvert, setShowPromptConvert] = useState(false);
  const [category, setCategory] = useState<TimeCategory>("JEE");
  const [activity, setActivity] = useState<string>("problems");
  const [subject, setSubject] = useState<Subject | "none">("none");
  const [mode, setMode] = useState<"50m" | "5m">(initialMode);

  // Refs: loggedRef guards completion side-effects (fires once).
  //       startedRef guards the auto-start on first mount.
  const loggedRef = useRef(false);
  const startedRef = useRef(false);

  // Hydrate from kv on mount. If no stored timer, auto-start a fresh one
  // with the default selections + the modal's initialMode.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const stored = await kvGet<FocusTimerState>(FOCUS_TIMER_KEY);
      const storedPausedAt = await kvGet<number>(FOCUS_TIMER_PAUSED_AT_KEY);
      if (!alive) return;
      if (stored) {
        setState(stored);
        setMode(stored.mode);
        setCategory(stored.category);
        setActivity(stored.activity);
        setSubject(stored.subject);
        setPausedAt(storedPausedAt ?? null);
        setSecondsLeft(remainingSeconds(stored, Date.now(), storedPausedAt ?? null));
        return;
      }
      if (startedRef.current) return;
      startedRef.current = true;
      const startedAt = Date.now();
      const newState: FocusTimerState = {
        startedAt,
        mode: initialMode,
        target: targetFor(initialMode),
        category: "JEE",
        activity: "problems",
        subject: "none",
        pausedMs: 0,
      };
      setState(newState);
      setMode(initialMode);
      setSecondsLeft(newState.target);
      await kvSet(FOCUS_TIMER_KEY, newState);
    })();
    return () => {
      alive = false;
    };
  }, [initialMode]);

  // 1s tick — only when running (state exists, not paused). The displayed
  // value is recomputed from the persisted state, so it cannot drift.
  useEffect(() => {
    if (!state || pausedAt !== null) return;
    const tick = () => setSecondsLeft(remainingSeconds(state, Date.now(), null));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [state, pausedAt]);

  // Re-sync on tab return (visibilitychange) and on mount.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      if (!state) return;
      setSecondsLeft(remainingSeconds(state, Date.now(), pausedAt));
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [state, pausedAt]);

  // Completion: side-effects in an effect, guarded by ref. NEVER in a setState
  // updater. Fires toast + logTime + kv-clear exactly once for 50m, or shows
  // the convert prompt for 5m (user must explicitly choose).
  // The setState calls are deferred to a microtask to satisfy the
  // react-hooks/set-state-in-effect lint rule (no synchronous setState in
  // effect body); the ref guard still ensures once-only firing.
  useEffect(() => {
    if (!state) return;
    if (secondsLeft > 0) return;
    if (loggedRef.current) return;
    loggedRef.current = true;
    const nowMs = Date.now();
    void kvSet(FOCUS_TIMER_PAUSED_AT_KEY, nowMs);
    if (state.mode === "5m") {
      Promise.resolve().then(() => {
        setPausedAt(nowMs);
        setShowPromptConvert(true);
      });
    } else {
      toast.success("Focus session finished! Time logged.");
      void logTimeIfPresent(Math.round(state.target / 60)).then(() => {
        setState(undefined);
        setPausedAt(null);
        // Auto-close the modal after a 50m session is logged (matches the
        // original logTime()->onClose() behavior).
        closeFocusTimerModal();
      });
    }
  }, [secondsLeft, state]);

  // ─── Actions ──────────────────────────────────────────────────────────────
  const start = useCallback(
    (m: "50m" | "5m") => {
      const startedAt = Date.now();
      const newState: FocusTimerState = {
        startedAt,
        mode: m,
        target: targetFor(m),
        category,
        activity,
        subject,
        pausedMs: 0,
      };
      loggedRef.current = false;
      setState(newState);
      setMode(m);
      setPausedAt(null);
      setShowPromptConvert(false);
      setSecondsLeft(newState.target);
      void kvSet(FOCUS_TIMER_KEY, newState);
      void kvDel(FOCUS_TIMER_PAUSED_AT_KEY);
    },
    [category, activity, subject]
  );

  const pause = useCallback(() => {
    if (!state || pausedAt !== null) return;
    const nowMs = Date.now();
    setPausedAt(nowMs);
    void kvSet(FOCUS_TIMER_PAUSED_AT_KEY, nowMs);
  }, [state, pausedAt]);

  const resume = useCallback(() => {
    if (!state || pausedAt === null) return;
    const nowMs = Date.now();
    const delta = nowMs - pausedAt;
    const newState = { ...state, pausedMs: state.pausedMs + delta };
    setState(newState);
    setPausedAt(null);
    setSecondsLeft(remainingSeconds(newState, nowMs, null));
    void kvSet(FOCUS_TIMER_KEY, newState);
    void kvDel(FOCUS_TIMER_PAUSED_AT_KEY);
  }, [state, pausedAt]);

  const reset = useCallback(() => {
    void kvDel(FOCUS_TIMER_KEY);
    void kvDel(FOCUS_TIMER_PAUSED_AT_KEY);
    setState(undefined);
    setPausedAt(null);
    setShowPromptConvert(false);
    loggedRef.current = false;
    setSecondsLeft(targetFor(mode));
  }, [mode]);

  const logDone = useCallback(async () => {
    if (!state) return;
    const elapsedSec = state.target - secondsLeft;
    const minutes = Math.max(1, Math.round(elapsedSec / 60));
    await logTimeEntry(state, minutes);
    await kvDel(FOCUS_TIMER_KEY);
    await kvDel(FOCUS_TIMER_PAUSED_AT_KEY);
    setState(undefined);
    setPausedAt(null);
    setShowPromptConvert(false);
    loggedRef.current = false;
    setSecondsLeft(targetFor(mode));
  }, [state, secondsLeft, mode]);

  const logFive = useCallback(async () => {
    if (!state) return;
    await logTimeEntry(state, 5);
    await kvDel(FOCUS_TIMER_KEY);
    await kvDel(FOCUS_TIMER_PAUSED_AT_KEY);
    setState(undefined);
    setPausedAt(null);
    setShowPromptConvert(false);
    loggedRef.current = false;
    setSecondsLeft(targetFor(mode));
  }, [state, mode]);

  const convertTo50m = useCallback(() => {
    // Start a NEW 50m timer that has 45min remaining right now (i.e. 5min
    // already elapsed). Backdate startedAt by 5min so the math works out.
    const startedAt = Date.now() - 5 * 60 * 1000;
    const newState: FocusTimerState = {
      startedAt,
      mode: "50m",
      target: 50 * 60,
      category,
      activity,
      subject,
      pausedMs: 0,
    };
    loggedRef.current = false;
    setState(newState);
    setMode("50m");
    setPausedAt(null);
    setShowPromptConvert(false);
    setSecondsLeft(45 * 60);
    void kvSet(FOCUS_TIMER_KEY, newState);
    void kvDel(FOCUS_TIMER_PAUSED_AT_KEY);
    toast.success("Procrastination beaten! 45 min focus session started.");
  }, [category, activity, subject]);

  // Mid-run tag edits persist to kv so they survive refresh.
  const updateCategory = useCallback(
    (c: TimeCategory) => {
      setCategory(c);
      setState((cur) => {
        if (!cur) return cur;
        const next = { ...cur, category: c };
        void kvSet(FOCUS_TIMER_KEY, next);
        return next;
      });
    },
    []
  );

  const updateActivity = useCallback(
    (a: string) => {
      setActivity(a);
      setState((cur) => {
        if (!cur) return cur;
        const next = { ...cur, activity: a };
        void kvSet(FOCUS_TIMER_KEY, next);
        return next;
      });
    },
    []
  );

  const updateSubject = useCallback(
    (s: Subject | "none") => {
      setSubject(s);
      setState((cur) => {
        if (!cur) return cur;
        const next = { ...cur, subject: s };
        void kvSet(FOCUS_TIMER_KEY, next);
        return next;
      });
    },
    []
  );

  return {
    state,
    mode,
    category,
    activity,
    subject,
    secondsLeft,
    isRunning: !!state && pausedAt === null,
    paused: pausedAt !== null,
    showPromptConvert,
    setCategory: updateCategory,
    setActivity: updateActivity,
    setSubject: updateSubject,
    start,
    pause,
    resume,
    reset,
    logDone,
    logFive,
    convertTo50m,
  };
}

// ─── App-mount helper: prompt to log an already-ended timer ──────────────────
export function promptEndedFocusTimerOnMount(): void {
  void (async () => {
    const stored = await kvGet<FocusTimerState>(FOCUS_TIMER_KEY);
    if (!stored) return;
    const pausedAt = await kvGet<number>(FOCUS_TIMER_PAUSED_AT_KEY);
    const rem = remainingSeconds(stored, Date.now(), pausedAt ?? null);
    if (rem > 0) return; // Still running — chip will show it
    // Ended — prompt. N is capped at the target.
    const minutes = Math.round(stored.target / 60);
    let handled = false;
    const handleLog = async () => {
      if (handled) return;
      handled = true;
      const fresh = await kvGet<FocusTimerState>(FOCUS_TIMER_KEY);
      if (!fresh) return; // Already logged elsewhere
      await logTimeEntry(fresh, minutes);
      await kvDel(FOCUS_TIMER_KEY);
      await kvDel(FOCUS_TIMER_PAUSED_AT_KEY);
    };
    const handleDecline = async () => {
      if (handled) return;
      handled = true;
      await kvDel(FOCUS_TIMER_KEY);
      await kvDel(FOCUS_TIMER_PAUSED_AT_KEY);
    };
    toast(`Focus timer ended. Log ${minutes} min to ${stored.category}?`, {
      action: { label: `Log ${minutes}m`, onClick: () => void handleLog() },
      onDismiss: () => void handleDecline(),
      duration: 60_000,
    });
  })();
}
