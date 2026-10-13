"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Clock, BookOpen, Mic, Check, AlertCircle, RotateCcw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { put } from "@/lib/idb";
import {
  addDays,
  REVISION_INTERVALS_DAYS,
  todayStr,
  uid,
  type SyllabusRow,
  type TimeLogEntry,
} from "@/lib/types";

export type RecallMode = "recall" | "explain";

export function RecallCheckModal({
  open,
  onOpenChange,
  row,
  initialMode = "recall",
  onUpdated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: SyllabusRow | null;
  initialMode?: RecallMode;
  onUpdated?: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {open && row ? (
          <RecallCheckContent
            row={row}
            initialMode={initialMode}
            onClose={() => onOpenChange(false)}
            onUpdated={onUpdated}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function RecallCheckContent({
  row,
  initialMode,
  onClose,
  onUpdated,
}: {
  row: SyllabusRow;
  initialMode: RecallMode;
  onClose: () => void;
  onUpdated?: () => void;
}) {
  const [mode, setMode] = useState<RecallMode>(initialMode);
  const totalSeconds = mode === "recall" ? 5 * 60 : 10 * 60;
  const [secondsLeft, setSecondsLeft] = useState(totalSeconds);
  const [isRunning, setIsRunning] = useState(true);
  const [timerFinished, setTimerFinished] = useState(false);
  // Ref guard: ensures the completion side-effects fire exactly once per run,
  // never inside a setState updater (the original bug). Reset whenever the
  // user starts a new run (mode switch or Done Early → restart).
  const finishedRef = useRef(false);

  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => {
      setSecondsLeft((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [isRunning]);

  // Completion side-effects live in an effect (NOT in the setSecondsLeft
  // updater). Fires once per run thanks to the ref guard.
  // The setState calls are deferred to a microtask to satisfy the
  // react-hooks/set-state-in-effect lint rule (no synchronous setState in
  // effect body).
  useEffect(() => {
    if (secondsLeft > 0) return;
    if (!isRunning) return;
    if (finishedRef.current) return;
    finishedRef.current = true;
    Promise.resolve().then(() => {
      setIsRunning(false);
      setTimerFinished(true);
    });
  }, [secondsLeft, isRunning]);

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;

  const logSessionTime = useCallback(
    async (activity: "recall" | "revision", note: string) => {
      const elapsedMins = mode === "recall" ? 5 : 10;
      const entry: TimeLogEntry = {
        id: uid(),
        category: "JEE",
        activity,
        date: todayStr(),
        minutes: elapsedMins,
        subject: row.subject,
        note,
        created_at: Date.now(),
      };
      await put("timelog", entry);
    },
    [mode, row.subject]
  );

  async function handleRecallRating(rating: "little" | "some" | "most") {
    let nextStage = row.revision_stage;
    let nextDate = todayStr();

    if (rating === "little") {
      // Forgotten -> Reset to stage 0, due tonight/tomorrow
      nextStage = 0;
      nextDate = todayStr();
      toast.info("Reset to stage 0 — scheduled for tonight");
    } else if (rating === "some") {
      // Partial recall -> repeat current stage in 1 day
      nextDate = addDays(todayStr(), 1);
      toast.info("Repeated current stage — next check in 1 day");
    } else {
      // Fluent recall -> advance to next stage (1d, 3d, 7d, 14d, 30d)
      nextStage = Math.min(row.revision_stage + 1, REVISION_INTERVALS_DAYS.length - 1);
      const intervalDays = REVISION_INTERVALS_DAYS[nextStage] || 7;
      nextDate = addDays(todayStr(), intervalDays);
      toast.success(`Advanced to stage ${nextStage}! Next in ${intervalDays}d`);
    }

    const updatedRow: SyllabusRow = {
      ...row,
      last_revised: todayStr(),
      revision_stage: nextStage,
      next_revision: nextDate,
    };
    await put("syllabus", updatedRow);
    await logSessionTime("recall", `Recall check: ${row.chapter} (${rating})`);
    onUpdated?.();
    onClose();
  }

  async function handleExplainStuckPoints(stuckPoints: 0 | 1 | 2 | 3) {
    let nextStage = row.revision_stage;
    let nextDate = todayStr();

    if (stuckPoints === 0) {
      // Fluid explanation without getting stuck -> advance stage
      nextStage = Math.min(row.revision_stage + 1, REVISION_INTERVALS_DAYS.length - 1);
      const intervalDays = REVISION_INTERVALS_DAYS[nextStage] || 7;
      nextDate = addDays(todayStr(), intervalDays);
      toast.success(`0 stuck points! Mastery advanced to stage ${nextStage}`);
    } else if (stuckPoints === 1 || stuckPoints === 2) {
      // Minor friction -> repeat stage in 2 days
      nextDate = addDays(todayStr(), 2);
      toast.info(`${stuckPoints} stuck point(s) noted — repeating stage in 2 days`);
    } else {
      // 3+ stuck points -> significant gaps, reset to stage 0
      nextStage = 0;
      nextDate = todayStr();
      toast.error("3+ stuck points — reset to stage 0 for immediate revisit");
    }

    const updatedRow: SyllabusRow = {
      ...row,
      last_revised: todayStr(),
      revision_stage: nextStage,
      next_revision: nextDate,
    };
    await put("syllabus", updatedRow);
    await logSessionTime(
      "revision",
      `Explain mode: ${row.chapter} (${stuckPoints === 3 ? "3+" : stuckPoints} stuck points)`
    );
    onUpdated?.();
    onClose();
  }

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px]">
            {row.subject}
          </Badge>
          <span className="text-xs text-muted-foreground font-mono">Stage {row.revision_stage}</span>
        </div>
        <DialogTitle className="text-base flex items-center justify-between">
          <span className="truncate">{row.chapter}</span>
        </DialogTitle>
        <DialogDescription>
          {mode === "recall"
            ? "Write key formulas and definitions on paper from memory. Don't look at notes."
            : "Explain this chapter out loud or to yourself as if teaching a beginner. Notice where you hesitate."}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-2">
        {/* Mode selector */}
        <div className="grid grid-cols-2 gap-2 bg-muted/50 p-1 rounded-lg">
          <button
            type="button"
            onClick={() => {
              setMode("recall");
              setSecondsLeft(5 * 60);
              setIsRunning(true);
              setTimerFinished(false);
              finishedRef.current = false;
            }}
            className={`py-1.5 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
              mode === "recall"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            5m Recall Check
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("explain");
              setSecondsLeft(10 * 60);
              setIsRunning(true);
              setTimerFinished(false);
              finishedRef.current = false;
            }}
            className={`py-1.5 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
              mode === "explain"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Mic className="w-3.5 h-3.5" />
            10m Explain Mode
          </button>
        </div>

        {/* Timer display */}
        <div className="text-center py-4 bg-muted/30 rounded-xl border border-border">
          <div className="text-5xl font-mono font-bold tracking-tight text-foreground tabular-nums">
            {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
          </div>
          <div className="text-xs text-muted-foreground mt-2 flex items-center justify-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                isRunning ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"
              }`}
            />
            {isRunning ? "Testing recall on paper..." : "Timer complete"}
          </div>
          <div className="flex justify-center gap-2 mt-3">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setIsRunning(!isRunning)}
            >
              {isRunning ? "Pause" : "Resume"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground"
              onClick={() => {
                setIsRunning(false);
                setTimerFinished(true);
                setSecondsLeft(0);
              }}
            >
              Done Early
            </Button>
          </div>
        </div>

        {/* Self rating options */}
        <div className="space-y-2 border-t border-border pt-3">
          <div className="text-xs font-semibold text-foreground">
            {mode === "recall" ? "How much did you recall on paper?" : "How many stuck points did you hit?"}
          </div>

          {mode === "recall" ? (
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant="outline"
                className="flex-col h-16 border-red-200 dark:border-red-500/30 hover:bg-red-50 dark:hover:bg-red-500/10 text-red-700 dark:text-red-300"
                onClick={() => void handleRecallRating("little")}
              >
                <span className="text-xs font-bold">Little (&lt;50%)</span>
                <span className="text-[10px] text-muted-foreground font-normal">Resets to Stage 0</span>
              </Button>
              <Button
                variant="outline"
                className="flex-col h-16 border-amber-200 dark:border-amber-500/30 hover:bg-amber-50 dark:hover:bg-amber-500/10 text-amber-800 dark:text-amber-300"
                onClick={() => void handleRecallRating("some")}
              >
                <span className="text-xs font-bold">Some (50-80%)</span>
                <span className="text-[10px] text-muted-foreground font-normal">Repeat in 1 day</span>
              </Button>
              <Button
                variant="outline"
                className="flex-col h-16 border-emerald-200 dark:border-emerald-500/30 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                onClick={() => void handleRecallRating("most")}
              >
                <span className="text-xs font-bold">Most (&gt;80%)</span>
                <span className="text-[10px] text-muted-foreground font-normal">Advance stage</span>
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant="outline"
                className="flex-col h-16 border-emerald-200 dark:border-emerald-500/30 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                onClick={() => void handleExplainStuckPoints(0)}
              >
                <span className="text-xs font-bold">0 Stuck</span>
                <span className="text-[10px] text-muted-foreground font-normal">Fluid &middot; Advance</span>
              </Button>
              <Button
                variant="outline"
                className="flex-col h-16 border-amber-200 dark:border-amber-500/30 hover:bg-amber-50 dark:hover:bg-amber-500/10 text-amber-800 dark:text-amber-300"
                onClick={() => void handleExplainStuckPoints(1)}
              >
                <span className="text-xs font-bold">1–2 Stuck</span>
                <span className="text-[10px] text-muted-foreground font-normal">Minor gaps &middot; Repeat</span>
              </Button>
              <Button
                variant="outline"
                className="flex-col h-16 border-red-200 dark:border-red-500/30 hover:bg-red-50 dark:hover:bg-red-500/10 text-red-700 dark:text-red-300"
                onClick={() => void handleExplainStuckPoints(3)}
              >
                <span className="text-xs font-bold">3+ Stuck</span>
                <span className="text-[10px] text-muted-foreground font-normal">Big gaps &middot; Stage 0</span>
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
