"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Flame,
  Clock,
  Play,
  Zap,
  Plus,
  CheckCircle2,
  Circle,
  AlertTriangle,
  Bell,
  Settings,
  BookOpen,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { SectionCard } from "./shared";
import { useDataVersion, useLive } from "@/lib/idb";
import {
  computeJeeStreak,
  getTodayMinutesByCategory,
  getWeeklyPolymathyMinutes,
  logAnkiCheckIn,
} from "@/lib/timelog";
import {
  getAnkiLimits,
  getTargetExams,
  getTimeTargets,
  DEFAULT_ANKI_LIMITS,
  DEFAULT_TIME_TARGETS,
} from "@/lib/settings";
import {
  todayStr,
  type AnkiLimits,
  type AnkiLogEntry,
  type AnkiMinutesBucket,
  type TimeTargets,
} from "@/lib/types";
import { ManualTimeLogModal } from "./FocusTimer";
import { openFocusTimerModal } from "./useFocusTimer";
import { SettingsDialog } from "./SettingsDialog";

export function TodayCard() {
  const timelogs = useLive("timelog");
  const ankiLogs = useLive("anki_log");
  const today = todayStr();
  const dataVersion = useDataVersion();

  const [targets, setTargets] = useState<TimeTargets>(DEFAULT_TIME_TARGETS);
  const [ankiLimits, setAnkiLimits] = useState<AnkiLimits>(DEFAULT_ANKI_LIMITS);
  const [daysToNearestExam, setDaysToNearestExam] = useState<number | null>(null);

  const [manualLogOpen, setManualLogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Load targets & nearest exam
  useEffect(() => {
    void Promise.all([getTimeTargets(), getAnkiLimits(), getTargetExams()]).then(
      ([t, a, exams]) => {
        setTargets(t);
        setAnkiLimits(a);

        const now = new Date(`${today}T12:00:00`).getTime();
        let minDays: number | null = null;
        for (const e of exams) {
          const dt = new Date(`${e.date}T12:00:00`).getTime();
          const d = Math.ceil((dt - now) / 86400000);
          if (d >= 0 && (minDays === null || d < minDays)) {
            minDays = d;
          }
        }
        setDaysToNearestExam(minDays);
      }
    );
  }, [dataVersion, today]);

  // Compute metrics
  const todayMinutes = useMemo(
    () => getTodayMinutesByCategory(timelogs, today),
    [timelogs, today]
  );
  const weeklyPolymathy = useMemo(
    () => getWeeklyPolymathyMinutes(timelogs, today),
    [timelogs, today]
  );
  const jeeStreak = useMemo(
    () => computeJeeStreak(timelogs, targets.jeeDailyMinutes, today),
    [timelogs, targets.jeeDailyMinutes, today]
  );

  const todayAnki = useMemo<AnkiLogEntry | undefined>(
    () => ankiLogs.find((l) => l.date === today),
    [ankiLogs, today]
  );

  // Anki notification check
  useEffect(() => {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    if (todayAnki?.done) return;

    const [targetH, targetM] = ankiLimits.reminderTime.split(":").map(Number);
    const now = new Date();
    const currentH = now.getHours();
    const currentM = now.getMinutes();

    // If within 5 minutes after reminder time
    if (
      currentH === targetH &&
      currentM >= targetM &&
      currentM < targetM + 5
    ) {
      const notifiedKey = `anki-notified-${today}`;
      if (!sessionStorage.getItem(notifiedKey)) {
        sessionStorage.setItem(notifiedKey, "true");
        new Notification("Anki Daily Check-In", {
          body: "Time for your 20-min daily recall review! Tap to check in.",
          icon: "/icon.png",
        });
      }
    }
  }, [ankiLimits.reminderTime, todayAnki?.done, today]);

  const reviewOnly = daysToNearestExam !== null && daysToNearestExam <= 21;

  async function toggleAnkiDone() {
    const isDone = !todayAnki?.done;
    await logAnkiCheckIn(today, isDone, isDone ? "<10" : undefined);
    if (isDone) {
      toast.success("Anki done! Select review time bucket below.");
    }
  }

  async function setAnkiBucket(bucket: AnkiMinutesBucket) {
    await logAnkiCheckIn(today, true, bucket);
    toast.success(`Logged ${bucket} min to JEE recall`);
  }

  function fmtHoursMins(m: number): string {
    const hrs = Math.floor(m / 60);
    const mins = m % 60;
    if (hrs === 0) return `${mins}m`;
    if (mins === 0) return `${hrs}h`;
    return `${hrs}h ${mins}m`;
  }

  return (
    <SectionCard
      title="Today's Focus & Activity"
      subtitle="Track deep work across goals and protect your daily streak"
      action={
        <div className="flex items-center gap-1.5">
          {jeeStreak > 0 && (
            <Badge className="bg-amber-500 hover:bg-amber-600 text-stone-950 font-bold gap-1 px-2 py-0.5">
              <Flame className="w-3.5 h-3.5 fill-current" />
              {jeeStreak} {jeeStreak === 1 ? "day" : "days"} streak
            </Badge>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={() => setSettingsOpen(true)}
            title="Edit targets"
          >
            <Settings className="w-3.5 h-3.5" />
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Quick action bar */}
        <div className="flex flex-wrap items-center gap-2 pb-1 border-b border-border">
          <Button
            size="sm"
            className="h-8 text-xs bg-emerald-700 hover:bg-emerald-800 text-white dark:bg-emerald-600 gap-1.5"
            onClick={() => openFocusTimerModal("50m")}
          >
            <Play className="w-3.5 h-3.5" />
            50m Focus Session
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs border-amber-300 text-amber-800 hover:bg-amber-50 dark:border-amber-500/40 dark:text-amber-300 dark:hover:bg-amber-500/10 gap-1.5"
            onClick={() => openFocusTimerModal("5m")}
          >
            <Zap className="w-3.5 h-3.5 text-amber-500" />
            Just 5 Min (Beat Procrastination)
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="h-8 text-xs gap-1.5"
            onClick={() => setManualLogOpen(true)}
          >
            <Plus className="w-3.5 h-3.5" />
            Log Minutes
          </Button>
        </div>

        {/* Progress categories */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          {/* JEE */}
          <div className="p-2.5 rounded-lg border border-border bg-card/60 space-y-1.5">
            <div className="flex justify-between items-center font-medium">
              <span className="flex items-center gap-1.5 text-foreground font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                JEE Preparation
              </span>
              <span className="font-mono text-muted-foreground">
                {fmtHoursMins(todayMinutes.JEE)} / {fmtHoursMins(targets.jeeDailyMinutes)}
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
              <div
                className="bg-emerald-600 h-full rounded-full transition-all duration-300"
                style={{
                  width: `${Math.min(
                    100,
                    Math.round((todayMinutes.JEE / (targets.jeeDailyMinutes || 1)) * 100)
                  )}%`,
                }}
              />
            </div>
          </div>

          {/* Money / Career */}
          <div className="p-2.5 rounded-lg border border-border bg-card/60 space-y-1.5">
            <div className="flex justify-between items-center font-medium">
              <span className="flex items-center gap-1.5 text-foreground font-semibold">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                Money / Work
              </span>
              <span className="font-mono text-muted-foreground">
                {fmtHoursMins(todayMinutes.Money)} / {fmtHoursMins(targets.moneyDailyMinutes)}
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
              <div
                className="bg-blue-600 h-full rounded-full transition-all duration-300"
                style={{
                  width: `${Math.min(
                    100,
                    Math.round((todayMinutes.Money / (targets.moneyDailyMinutes || 1)) * 100)
                  )}%`,
                }}
              />
            </div>
          </div>

          {/* Branding */}
          <div className="p-2.5 rounded-lg border border-border bg-card/60 space-y-1.5">
            <div className="flex justify-between items-center font-medium">
              <span className="flex items-center gap-1.5 text-foreground font-semibold">
                <span className="w-2 h-2 rounded-full bg-purple-500" />
                Branding &amp; Audience
              </span>
              <span className="font-mono text-muted-foreground">
                {fmtHoursMins(todayMinutes.Branding)} / {fmtHoursMins(targets.brandingDailyMinutes)}
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
              <div
                className="bg-purple-600 h-full rounded-full transition-all duration-300"
                style={{
                  width: `${Math.min(
                    100,
                    Math.round((todayMinutes.Branding / (targets.brandingDailyMinutes || 1)) * 100)
                  )}%`,
                }}
              />
            </div>
          </div>

          {/* Polymathy (Weekly) */}
          <div className="p-2.5 rounded-lg border border-border bg-card/60 space-y-1.5">
            <div className="flex justify-between items-center font-medium">
              <span className="flex items-center gap-1.5 text-foreground font-semibold">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                Polymathy (Weekly)
              </span>
              <span className="font-mono text-muted-foreground">
                {fmtHoursMins(weeklyPolymathy)} / {fmtHoursMins(targets.polymathyWeeklyMinutes)}
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
              <div
                className="bg-amber-500 h-full rounded-full transition-all duration-300"
                style={{
                  width: `${Math.min(
                    100,
                    Math.round(
                      (weeklyPolymathy / (targets.polymathyWeeklyMinutes || 1)) * 100
                    )
                  )}%`,
                }}
              />
            </div>
          </div>
        </div>

        {todayMinutes.Entertainment > 0 && (
          <div className="text-[11px] text-muted-foreground">
            Entertainment logged today: {fmtHoursMins(todayMinutes.Entertainment)}
          </div>
        )}

        {/* Anki Daily Check-In Row */}
        <div className="p-3 border border-border rounded-lg bg-card/80 space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleAnkiDone}
                className="flex items-center gap-2 text-sm font-semibold hover:opacity-80 transition-opacity text-foreground"
              >
                {todayAnki?.done ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Circle className="w-5 h-5 text-muted-foreground" />
                )}
                <span>Anki Daily Flashcards</span>
              </button>

              {reviewOnly ? (
                <Badge className="bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border-rose-300 text-[10px]">
                  Review Only Mode (Exam ≤ 21d)
                </Badge>
              ) : (
                <span className="text-[11px] text-muted-foreground">
                  Max {ankiLimits.newCardsPerDay} new cards · {ankiLimits.reviewCapMinutes}m cap
                </span>
              )}
            </div>

            {/* 2nd tap: Time bucket selection */}
            {todayAnki?.done && (
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[11px] text-muted-foreground">Time:</span>
                {(["<10", "10-20", "20+"] as const).map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => void setAnkiBucket(b)}
                    className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
                      todayAnki.minutes_bucket === b
                        ? "bg-emerald-700 text-white font-bold dark:bg-emerald-600"
                        : "border border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    {b}m
                  </button>
                ))}
              </div>
            )}
          </div>

          {reviewOnly && (
            <div className="flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/10 px-2.5 py-1 rounded border border-amber-200 dark:border-amber-500/20">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>
                Nearest exam is within 3 weeks. Do not add new flashcards. Focus strictly on review and CBT mocks.
              </span>
            </div>
          )}
        </div>
      </div>

      <ManualTimeLogModal
        open={manualLogOpen}
        onOpenChange={setManualLogOpen}
      />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </SectionCard>
  );
}
