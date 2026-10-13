"use client";

import { useCallback, useEffect, useState } from "react";
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

export function FocusTimerModal({
  open,
  onOpenChange,
  initialMode = "50m",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMode?: "50m" | "5m";
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {open ? (
          <FocusTimerContent
            initialMode={initialMode}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function FocusTimerContent({
  initialMode,
  onClose,
}: {
  initialMode: "50m" | "5m";
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"50m" | "5m">(initialMode);
  const totalSeconds = mode === "50m" ? 50 * 60 : 5 * 60;
  const [secondsLeft, setSecondsLeft] = useState(totalSeconds);
  const [isRunning, setIsRunning] = useState(true);
  const [category, setCategory] = useState<TimeCategory>("JEE");
  const [activity, setActivity] = useState<string>("problems");
  const [subject, setSubject] = useState<Subject | "none">("none");
  const [showPromptConvert, setShowPromptConvert] = useState(false);

  const logTime = useCallback(
    async (minutes: number) => {
      const entry: TimeLogEntry = {
        id: uid(),
        category,
        activity,
        date: todayStr(),
        minutes,
        subject: subject !== "none" ? subject : undefined,
        note: `${mode === "5m" ? "5-minute spark" : "50-minute focus"} session`,
        created_at: Date.now(),
      };
      await put("timelog", entry);
      toast.success(`Logged ${minutes} min to ${category} (${activity})`);
      onClose();
    },
    [category, activity, subject, mode, onClose]
  );

  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setIsRunning(false);
          if (mode === "5m") {
            setShowPromptConvert(true);
          } else {
            toast.success("Focus session finished! Time logged.");
            void logTime(50);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, mode, logTime]);

  function convertTo50m() {
    setMode("50m");
    setSecondsLeft(45 * 60); // 45 remaining minutes
    setIsRunning(true);
    setShowPromptConvert(false);
    toast.success("Procrastination beaten! 45 min focus session started.");
  }

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-emerald-600" />
          {mode === "50m" ? "50-Minute Focus Session" : "Just 5 Minutes"}
        </DialogTitle>
        <DialogDescription>
          {mode === "50m"
            ? "Deep work sprint. Eliminate distractions until the timer ends."
            : "Too tired to start? Just commit to 5 minutes. You can stop or keep going."}
        </DialogDescription>
      </DialogHeader>

      {showPromptConvert ? (
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
              onClick={() => void logTime(5)}
            >
              Log 5m &amp; Stop
            </Button>
            <Button
              size="sm"
              className="text-xs bg-emerald-700 hover:bg-emerald-800 text-white"
              onClick={convertTo50m}
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
              {isRunning ? "Focusing..." : secondsLeft === 0 ? "Completed" : "Paused"}
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
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1"
              onClick={() => {
                setIsRunning(false);
                setSecondsLeft(mode === "50m" ? 50 * 60 : 5 * 60);
              }}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </Button>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={isRunning ? "secondary" : "default"}
                className="h-8 text-xs gap-1"
                onClick={() => setIsRunning(!isRunning)}
              >
                {isRunning ? (
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
                onClick={() => {
                  const elapsedMins = Math.max(1, Math.round((totalSeconds - secondsLeft) / 60));
                  void logTime(elapsedMins);
                }}
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
