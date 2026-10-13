"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw, Check, Clock, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { put } from "@/lib/idb";
import {
  JEE_ACTIVITIES,
  TIME_CATEGORIES,
  todayStr,
  uid,
  type Subject,
  type TimeCategory,
  type TimeLogEntry,
} from "@/lib/types";
import {
  closeFocusTimerModal,
  useFocusTimer,
  useFocusTimerModalState,
} from "./useFocusTimer";

/**
 * Singleton modal driven by the external store in useFocusTimer.ts.
 * Opens from two places: the TodayCard "50m / 5m" buttons and the App header
 * chip. While a timer is running, outside-click/Esc is intercepted so the
 * session cannot be lost; the user must explicitly Log Done or Reset.
 */
export function FocusTimerModal() {
  const { open, mode } = useFocusTimerModalState();
  // Latest isRunning flag, kept in a ref so the Dialog's onOpenChange handler
  // (which fires synchronously) can read it without re-running the hook.
  const runningRef = useRef(false);

  const handleOpenChange = (next: boolean) => {
    if (!next && runningRef.current) {
      // Block outside-click/Esc while a timer is running.
      return;
    }
    if (!next) closeFocusTimerModal();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md" showCloseButton={false}>
        {open ? (
          <FocusTimerContent initialMode={mode} runningRef={runningRef} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function FocusTimerContent({
  initialMode,
  runningRef,
}: {
  initialMode: "50m" | "5m";
  runningRef: React.MutableRefObject<boolean>;
}) {
  const timer = useFocusTimer(initialMode);

  // Mirror isRunning into the ref so the parent Dialog can block close-while-running.
  // The ref is stable so listing it in deps is safe and satisfies exhaustive-deps.
  useEffect(() => {
    runningRef.current = timer.isRunning;
  }, [timer.isRunning, runningRef]);

  const mins = Math.floor(timer.secondsLeft / 60);
  const secs = timer.secondsLeft % 60;

  async function handleLogDone() {
    await timer.logDone();
    closeFocusTimerModal();
  }

  function handleReset() {
    timer.reset();
    closeFocusTimerModal();
  }

  async function handleLogFive() {
    await timer.logFive();
    closeFocusTimerModal();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-emerald-600" />
          {timer.mode === "50m" ? "50-Minute Focus Session" : "Just 5 Minutes"}
        </DialogTitle>
        <DialogDescription>
          {timer.mode === "50m"
            ? "Deep work sprint. Eliminate distractions until the timer ends."
            : "Too tired to start? Just commit to 5 minutes. You can stop or keep going."}
        </DialogDescription>
      </DialogHeader>

      {timer.showPromptConvert ? (
        <div className="p-4 rounded-xl border border-emerald-300 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10 space-y-3 text-center">
          <div className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
            5 minutes completed! The hardest part is over.
          </div>
          <p className="text-xs text-muted-foreground">
            Do you want to ride the momentum and finish a full 50-minute session (+45 min), or log your 5 minutes and stop?
          </p>
          <div className="flex justify-center gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => void handleLogFive()}
            >
              Log 5m &amp; Stop
            </Button>
            <Button
              size="sm"
              className="text-xs bg-emerald-700 hover:bg-emerald-800 text-white"
              onClick={timer.convertTo50m}
            >
              Keep Going (+45m)
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-5 py-2">
          {/* Countdown display */}
          <div className="text-center py-4 bg-muted/40 rounded-2xl border border-border">
            <div className="text-6xl font-mono font-bold tracking-tight text-foreground tabular-nums">
              {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
            </div>
            <div className="text-xs text-muted-foreground mt-2 flex items-center justify-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              {timer.isRunning
                ? "Focusing..."
                : timer.secondsLeft === 0
                  ? "Completed"
                  : "Paused"}
            </div>
          </div>

          {/* Category and Activity selection */}
          <div className="space-y-3 text-xs">
            <div className="space-y-1.5">
              <label className="font-semibold text-foreground">Category</label>
              <div className="flex flex-wrap gap-1.5">
                {TIME_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => timer.setCategory(cat)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      timer.category === cat
                        ? "bg-primary text-primary-foreground"
                        : "border border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {timer.category === "JEE" && (
              <>
                <div className="space-y-1.5">
                  <label className="font-semibold text-foreground">JEE Activity</label>
                  <div className="flex flex-wrap gap-1.5">
                    {JEE_ACTIVITIES.map((act) => (
                      <button
                        key={act}
                        type="button"
                        onClick={() => timer.setActivity(act)}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                          timer.activity === act
                            ? "bg-emerald-700 text-white dark:bg-emerald-600"
                            : "border border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                        }`}
                      >
                        {act}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold text-foreground">Subject (Optional)</label>
                  <div className="flex gap-1.5">
                    {(["none", "Physics", "Chemistry", "Mathematics"] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => timer.setSubject(s)}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                          timer.subject === s
                            ? "bg-stone-800 text-white dark:bg-stone-200 dark:text-stone-900"
                            : "border border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                        }`}
                      >
                        {s === "none" ? "General" : s}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1"
              onClick={handleReset}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </Button>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={timer.isRunning ? "secondary" : "default"}
                className="h-8 text-xs gap-1"
                onClick={() => (timer.paused ? timer.resume() : timer.pause())}
              >
                {timer.isRunning ? (
                  <>
                    <Pause className="w-3.5 h-3.5" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    Resume
                  </>
                )}
              </Button>

              <Button
                size="sm"
                className="h-8 text-xs gap-1 bg-emerald-700 hover:bg-emerald-800 text-white"
                onClick={() => void handleLogDone()}
              >
                <Check className="w-3.5 h-3.5" />
                Log Done
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function ManualTimeModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [minutes, setMinutes] = useState("30");
  const [category, setCategory] = useState<TimeCategory>("JEE");
  const [activity, setActivity] = useState<string>("problems");
  const [subject, setSubject] = useState<Subject | "none">("none");
  const [note, setNote] = useState("");

  const presets = [15, 30, 45, 60, 90, 120];

  async function handleSave() {
    const mins = parseInt(minutes, 10);
    if (isNaN(mins) || mins <= 0) {
      toast.error("Please enter valid minutes");
      return;
    }

    const entry: TimeLogEntry = {
      id: uid(),
      category,
      activity,
      date: todayStr(),
      minutes: mins,
      subject: subject !== "none" ? subject : undefined,
      note: note.trim() || undefined,
      created_at: Date.now(),
    };

    await put("timelog", entry);
    toast.success(`Logged ${mins} min to ${category}`);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-emerald-600" />
            Log Focus Time
          </DialogTitle>
          <DialogDescription>
            Quick 2-tap time logging. No mandatory typing required.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          {/* Quick preset chips */}
          <div className="space-y-1.5">
            <label className="font-semibold text-foreground">Duration (Minutes)</label>
            <div className="flex flex-wrap gap-1.5">
              {presets.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setMinutes(String(p))}
                  className={`px-3 py-1 rounded-md text-xs font-mono font-medium transition-colors ${
                    minutes === String(p)
                      ? "bg-primary text-primary-foreground"
                      : "border border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  {p}m
                </button>
              ))}
            </div>
            <Input
              type="number"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              className="h-8 text-xs font-mono mt-1"
              placeholder="Or type minutes..."
              min="1"
            />
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <label className="font-semibold text-foreground">Category</label>
            <div className="flex flex-wrap gap-1.5">
              {TIME_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    category === cat
                      ? "bg-primary text-primary-foreground"
                      : "border border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* JEE Activity */}
          {category === "JEE" && (
            <>
              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">JEE Activity</label>
                <div className="flex flex-wrap gap-1.5">
                  {JEE_ACTIVITIES.map((act) => (
                    <button
                      key={act}
                      type="button"
                      onClick={() => setActivity(act)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                        activity === act
                          ? "bg-emerald-700 text-white dark:bg-emerald-600"
                          : "border border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                      }`}
                    >
                      {act}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">Subject (Optional)</label>
                <div className="flex gap-1.5">
                  {(["none", "Physics", "Chemistry", "Mathematics"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSubject(s)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                        subject === s
                          ? "bg-stone-800 text-white dark:bg-stone-200 dark:text-stone-900"
                          : "border border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                      }`}
                    >
                      {s === "none" ? "General" : s}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <label className="font-semibold text-foreground">Note (Optional)</label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Mechanics pyq, Anki, landing page..."
              className="h-8 text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs bg-emerald-700 hover:bg-emerald-800 text-white"
              onClick={handleSave}
            >
              Log Time
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
export { ManualTimeModal as ManualTimeLogModal };
