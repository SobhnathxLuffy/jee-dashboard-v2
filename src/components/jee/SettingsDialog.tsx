"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Settings, Calendar, Clock, BookOpen } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  DEFAULT_ANKI_LIMITS,
  DEFAULT_TARGET_EXAMS,
  DEFAULT_TIME_TARGETS,
  getAnkiLimits,
  getTargetExams,
  getTimeTargets,
  saveAnkiLimits,
  saveTargetExams,
  saveTimeTargets,
} from "@/lib/settings";
import { deriveExamPhase, todayStr, uid, type AnkiLimits, type TargetExam, type TimeTargets } from "@/lib/types";

export function SettingsDialog({
  open,
  onOpenChange,
  trigger,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = open !== undefined;
  const show = isControlled ? open : internalOpen;
  const setShow = isControlled ? onOpenChange! : setInternalOpen;

  const [exams, setExams] = useState<TargetExam[]>(DEFAULT_TARGET_EXAMS);
  const [targets, setTargets] = useState<TimeTargets>(DEFAULT_TIME_TARGETS);
  const [anki, setAnki] = useState<AnkiLimits>(DEFAULT_ANKI_LIMITS);
  const [activeTab, setActiveTab] = useState<"exams" | "time" | "anki">("exams");

  useEffect(() => {
    if (show) {
      void Promise.all([getTargetExams(), getTimeTargets(), getAnkiLimits()]).then(
        ([e, t, a]) => {
          setExams(e);
          setTargets(t);
          setAnki(a);
        }
      );
    }
  }, [show]);

  async function handleSave() {
    try {
      await Promise.all([
        saveTargetExams(exams),
        saveTimeTargets(targets),
        saveAnkiLimits(anki),
      ]);
      toast.success("Settings saved");
      setShow(false);
    } catch (e) {
      toast.error(`Failed to save settings: ${String(e)}`);
    }
  }

  function addExam() {
    setExams([
      ...exams,
      { id: uid(), name: "New Exam", date: todayStr() },
    ]);
  }

  function removeExam(id: string) {
    if (exams.length <= 1) {
      toast.error("At least one target exam is required");
      return;
    }
    setExams(exams.filter((e) => e.id !== id));
  }

  function updateExam(id: string, patch: Partial<TargetExam>) {
    setExams(exams.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  return (
    <Dialog open={show} onOpenChange={setShow}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Settings className="w-5 h-5 text-primary" />
            Study & App Settings
          </DialogTitle>
          <DialogDescription>
            Configure your target exams, daily focus targets, and Anki flashcard rules.
          </DialogDescription>
        </DialogHeader>

        {/* Tab selection */}
        <div className="flex border-b border-border gap-2 pb-2">
          <button
            type="button"
            onClick={() => setActiveTab("exams")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === "exams"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            Target Exams
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("time")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === "time"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            Time Targets
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("anki")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === "anki"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            Anki Limits
          </button>
        </div>

        {/* Tab 1: Exams */}
        {activeTab === "exams" && (
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Nearest exam powers the header countdown chip and phase derivations.
              </span>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={addExam}>
                <Plus className="w-3.5 h-3.5" />
                Add Exam
              </Button>
            </div>
            <div className="space-y-2.5">
              {exams.map((exam) => {
                const a = new Date(`${todayStr()}T12:00:00`).getTime();
                const b = new Date(`${exam.date}T12:00:00`).getTime();
                const days = Math.ceil((b - a) / 86400000);
                const phase = deriveExamPhase(days);

                return (
                  <div
                    key={exam.id}
                    className="p-3 border border-border rounded-lg bg-card flex flex-col sm:flex-row sm:items-center gap-2 justify-between"
                  >
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Input
                        value={exam.name}
                        onChange={(e) => updateExam(exam.id, { name: e.target.value })}
                        placeholder="Exam Name"
                        className="h-8 text-xs font-medium"
                      />
                      <Input
                        type="date"
                        value={exam.date}
                        onChange={(e) => updateExam(exam.id, { date: e.target.value })}
                        className="h-8 text-xs tabular-nums"
                      />
                    </div>
                    <div className="flex items-center gap-2 justify-between sm:justify-end">
                      <Badge
                        variant="secondary"
                        className="text-[10px] font-mono whitespace-nowrap"
                      >
                        {days >= 0 ? `${days}d left · ${phase}` : "Completed"}
                      </Badge>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-red-600"
                        onClick={() => removeExam(exam.id)}
                        disabled={exams.length <= 1}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tab 2: Time Targets */}
        {activeTab === "time" && (
          <div className="space-y-4 py-2">
            <p className="text-xs text-muted-foreground">
              Set your daily focus targets in minutes. Progress appears in the Dashboard Today card.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-3 border border-border rounded-lg bg-card space-y-1.5">
                <div className="text-xs font-semibold text-foreground">JEE Daily Target</div>
                <div className="text-[11px] text-muted-foreground">Default: 360 min (6 hours)</div>
                <div className="flex items-center gap-2 pt-1">
                  <Input
                    type="number"
                    min={0}
                    step={30}
                    value={targets.jeeDailyMinutes}
                    onChange={(e) =>
                      setTargets({ ...targets, jeeDailyMinutes: Number(e.target.value) || 0 })
                    }
                    className="h-8 text-xs font-mono"
                  />
                  <span className="text-xs text-muted-foreground">min</span>
                </div>
              </div>

              <div className="p-3 border border-border rounded-lg bg-card space-y-1.5">
                <div className="text-xs font-semibold text-foreground">Money / Work Target</div>
                <div className="text-[11px] text-muted-foreground">Default: 120 min (2 hours)</div>
                <div className="flex items-center gap-2 pt-1">
                  <Input
                    type="number"
                    min={0}
                    step={15}
                    value={targets.moneyDailyMinutes}
                    onChange={(e) =>
                      setTargets({ ...targets, moneyDailyMinutes: Number(e.target.value) || 0 })
                    }
                    className="h-8 text-xs font-mono"
                  />
                  <span className="text-xs text-muted-foreground">min</span>
                </div>
              </div>

              <div className="p-3 border border-border rounded-lg bg-card space-y-1.5">
                <div className="text-xs font-semibold text-foreground">Personal Branding Target</div>
                <div className="text-[11px] text-muted-foreground">Default: 60 min (1 hour)</div>
                <div className="flex items-center gap-2 pt-1">
                  <Input
                    type="number"
                    min={0}
                    step={15}
                    value={targets.brandingDailyMinutes}
                    onChange={(e) =>
                      setTargets({ ...targets, brandingDailyMinutes: Number(e.target.value) || 0 })
                    }
                    className="h-8 text-xs font-mono"
                  />
                  <span className="text-xs text-muted-foreground">min</span>
                </div>
              </div>

              <div className="p-3 border border-border rounded-lg bg-card space-y-1.5">
                <div className="text-xs font-semibold text-foreground">Polymathy Weekly Target</div>
                <div className="text-[11px] text-muted-foreground">Default: 210 min (3.5 hrs/wk)</div>
                <div className="flex items-center gap-2 pt-1">
                  <Input
                    type="number"
                    min={0}
                    step={30}
                    value={targets.polymathyWeeklyMinutes}
                    onChange={(e) =>
                      setTargets({
                        ...targets,
                        polymathyWeeklyMinutes: Number(e.target.value) || 0,
                      })
                    }
                    className="h-8 text-xs font-mono"
                  />
                  <span className="text-xs text-muted-foreground">min</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Anki Limits */}
        {activeTab === "anki" && (
          <div className="space-y-4 py-2">
            <p className="text-xs text-muted-foreground">
              Configure flashcard workload caps and daily self-check reminders.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-3 border border-border rounded-lg bg-card space-y-1.5">
                <div className="text-xs font-semibold text-foreground">New Cards / Day</div>
                <div className="text-[11px] text-muted-foreground">Strict cap: default 15 cards</div>
                <div className="flex items-center gap-2 pt-1">
                  <Input
                    type="number"
                    min={0}
                    max={50}
                    value={anki.newCardsPerDay}
                    onChange={(e) =>
                      setAnki({ ...anki, newCardsPerDay: Number(e.target.value) || 0 })
                    }
                    className="h-8 text-xs font-mono"
                  />
                  <span className="text-xs text-muted-foreground">cards</span>
                </div>
              </div>

              <div className="p-3 border border-border rounded-lg bg-card space-y-1.5">
                <div className="text-xs font-semibold text-foreground">Review Cap</div>
                <div className="text-[11px] text-muted-foreground">Maximum daily time: default 20 min</div>
                <div className="flex items-center gap-2 pt-1">
                  <Input
                    type="number"
                    min={5}
                    max={60}
                    value={anki.reviewCapMinutes}
                    onChange={(e) =>
                      setAnki({ ...anki, reviewCapMinutes: Number(e.target.value) || 0 })
                    }
                    className="h-8 text-xs font-mono"
                  />
                  <span className="text-xs text-muted-foreground">min</span>
                </div>
              </div>

              <div className="p-3 border border-border rounded-lg bg-card space-y-1.5 sm:col-span-2">
                <div className="text-xs font-semibold text-foreground">Daily Reminder Time</div>
                <div className="text-[11px] text-muted-foreground">
                  Browser notification reminder for daily Anki check-in (default 18:00)
                </div>
                <div className="flex items-center gap-2 pt-1 max-w-xs">
                  <Input
                    type="time"
                    value={anki.reminderTime}
                    onChange={(e) => setAnki({ ...anki, reminderTime: e.target.value })}
                    className="h-8 text-xs font-mono"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={async () => {
                      if (!("Notification" in window)) {
                        toast.error("Browser does not support desktop notifications");
                        return;
                      }
                      const permission = await Notification.requestPermission();
                      if (permission === "granted") {
                        toast.success("Notifications enabled!");
                      } else {
                        toast.error(`Notification permission ${permission}`);
                      }
                    }}
                  >
                    Enable Notifications
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap justify-between gap-2 pt-3 border-t border-border">
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={() => {
                import("./Tutorial").then(({ startTutorial }) => startTutorial());
                setShow(false);
              }}
            >
              Replay tutorial
            </Button>
            <a
              href="/guide"
              className="inline-flex items-center justify-center h-8 px-3 text-xs rounded-md border border-border hover:bg-accent"
            >
              Open guide
            </a>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setShow(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs bg-emerald-700 hover:bg-emerald-800 text-white dark:bg-emerald-600"
              onClick={handleSave}
            >
              Save Changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
