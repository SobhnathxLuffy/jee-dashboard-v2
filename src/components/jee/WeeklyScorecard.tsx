"use client";

import { useMemo, useState } from "react";
import {
  Calendar,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Clock,
  Layers,
  Sparkles,
  BookOpen,
  ArrowRight,
  Flame,
  Timer,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SectionCard, StatCard } from "./shared";
import { CountUp } from "./motion";
import { useLive } from "@/lib/idb";
import {
  addDays,
  fmtSecs,
  todayStr,
  type ErrorTag,
  type ResponseRecord,
  type Subject,
  type TestRecord,
  type TimeLogEntry,
  type AnkiLogEntry,
  type RetryQueueItem,
} from "@/lib/types";
import { getMondayOfWeek } from "@/lib/timelog";
import type { NavController } from "./App";

const TAG_DETAILS: Record<ErrorTag, { label: string; desc: string; color: string }> = {
  C: { label: "Concept gap", desc: "Didn't understand core concept", color: "text-red-700 bg-red-50 border-red-200 dark:text-red-300 dark:bg-red-500/10 dark:border-red-500/30" },
  F: { label: "Formula recall", desc: "Knew idea, forgot formula", color: "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-500/10 dark:border-amber-500/30" },
  A: { label: "Accuracy / Slip", desc: "Calculation, sign or misread error", color: "text-orange-700 bg-orange-50 border-orange-200 dark:text-orange-300 dark:bg-orange-500/10 dark:border-orange-500/30" },
  R: { label: "Revision lapse", desc: "Memory faded over time", color: "text-sky-700 bg-sky-50 border-sky-200 dark:text-sky-300 dark:bg-sky-500/10 dark:border-sky-500/30" },
  T: { label: "Time pressure", desc: "Forced error / rushed strategy", color: "text-violet-700 bg-violet-50 border-violet-200 dark:text-violet-300 dark:bg-violet-500/10 dark:border-violet-500/30" },
  G: { label: "Blind guess", desc: "Negative marks leakage", color: "text-stone-700 bg-stone-100 border-stone-300 dark:text-stone-300 dark:bg-stone-500/15 dark:border-stone-500/30" },
};

export function WeeklyScorecard({ nav }: { nav: NavController }) {
  const timelog = useLive("timelog");
  const ankiLog = useLive("anki_log");
  const retryQueue = useLive("retry_queue");
  const tests = useLive("tests");
  const responses = useLive("responses");

  // Selected week offset: 0 = current week (Mon-Sun), -1 = previous week
  const [weekOffset, setWeekOffset] = useState<number>(0);

  const today = todayStr();
  const currentMonday = getMondayOfWeek(today);

  // Compute Monday & Sunday for selected week
  const weekStart = useMemo(() => addDays(currentMonday, weekOffset * 7), [currentMonday, weekOffset]);
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);
  const prevWeekStart = useMemo(() => addDays(weekStart, -7), [weekStart]);
  const prevWeekEnd = useMemo(() => addDays(weekStart, -1), [weekStart]);

  // Filter logs for this week and prior week
  const weekLogs = useMemo(
    () => timelog.filter((l) => l.date >= weekStart && l.date <= weekEnd),
    [timelog, weekStart, weekEnd]
  );

  const weekAnki = useMemo(
    () => ankiLog.filter((a) => a.date >= weekStart && a.date <= weekEnd && a.done),
    [ankiLog, weekStart, weekEnd]
  );

  const weekTests = useMemo(
    () => tests.filter((t) => t.date >= weekStart && t.date <= weekEnd),
    [tests, weekStart, weekEnd]
  );

  const prevWeekTests = useMemo(
    () => tests.filter((t) => t.date >= prevWeekStart && t.date <= prevWeekEnd),
    [tests, prevWeekStart, prevWeekEnd]
  );

  // Weekly Hours: Planned vs Actual
  // Standard planned defaults: JEE 6h/day = 42h, Other ~10h = 52h weekly
  const plannedWeeklyHours = 42; // JEE focus target
  const actualJeeMinutes = useMemo(
    () => weekLogs.filter((l) => l.category === "JEE").reduce((sum, l) => sum + (l.minutes || 0), 0),
    [weekLogs]
  );
  const actualTotalMinutes = useMemo(
    () => weekLogs.reduce((sum, l) => sum + (l.minutes || 0), 0),
    [weekLogs]
  );

  const actualJeeHours = actualJeeMinutes / 60;
  const actualTotalHours = actualTotalMinutes / 60;

  // JEE breakdown by activity
  const jeeByActivity = useMemo(() => {
    const map: Record<string, number> = {
      "new learning": 0,
      problems: 0,
      recall: 0,
      revision: 0,
      mock: 0,
    };
    for (const l of weekLogs) {
      if (l.category === "JEE") {
        const act = l.activity?.toLowerCase() || "problems";
        if (act in map) map[act] += l.minutes || 0;
        // logTestTime writes activity "full_mock" for completed tests
        else if (act === "full_mock") map.mock += l.minutes || 0;
        else map.problems += l.minutes || 0;
      }
    }
    return map;
  }, [weekLogs]);

  // JEE breakdown by subject
  const jeeBySubject = useMemo(() => {
    const map: Record<Subject, number> = {
      Physics: 0,
      Chemistry: 0,
      Mathematics: 0,
    };
    for (const l of weekLogs) {
      if (l.category === "JEE" && l.subject && l.subject in map) {
        map[l.subject] += l.minutes || 0;
      }
    }
    return map;
  }, [weekLogs]);

  // Recall checks count (from timelog activity "recall" / note contains recall/explain)
  const recallChecksDone = useMemo(() => {
    return weekLogs.filter(
      (l) =>
        l.activity === "recall" ||
        l.note?.toLowerCase().includes("recall") ||
        l.note?.toLowerCase().includes("explain")
    ).length;
  }, [weekLogs]);

  // Retry queue items mastered this week (stage-3 items are retained with mastered_at)
  const retryQueueCleared = useMemo(() => {
    return retryQueue.filter(
      (q) => q.stage >= 3 && q.mastered_at && q.mastered_at >= weekStart && q.mastered_at <= weekEnd
    ).length;
  }, [retryQueue, weekStart, weekEnd]);

  // Accuracy Change: Current Week vs Previous Week
  const accuracyCurrentWeek = useMemo(() => {
    const scored = weekTests.filter((t) => t.score !== null);
    if (!scored.length) return null;
    const totalScore = scored.reduce((sum, t) => sum + (t.score ?? 0), 0);
    const totalMax = scored.reduce((sum, t) => sum + Math.max(1, t.max_score), 0);
    return Math.round((totalScore / totalMax) * 100);
  }, [weekTests]);

  const accuracyPrevWeek = useMemo(() => {
    const scored = prevWeekTests.filter((t) => t.score !== null);
    if (!scored.length) return null;
    const totalScore = scored.reduce((sum, t) => sum + (t.score ?? 0), 0);
    const totalMax = scored.reduce((sum, t) => sum + Math.max(1, t.max_score), 0);
    return Math.round((totalScore / totalMax) * 100);
  }, [prevWeekTests]);

  const accuracyDelta = useMemo(() => {
    if (accuracyCurrentWeek === null || accuracyPrevWeek === null) return null;
    return accuracyCurrentWeek - accuracyPrevWeek;
  }, [accuracyCurrentWeek, accuracyPrevWeek]);

  // 3-test rolling average (across all scored tests up to selected week)
  const rolling3TestAvg = useMemo(() => {
    const scoredTests = tests
      .filter((t): t is TestRecord & { score: number } => t.score !== null && t.date <= weekEnd)
      .sort((a, b) => b.created_at - a.created_at)
      .slice(0, 3);

    if (scoredTests.length === 0) return null;
    const avgPct =
      scoredTests.reduce((sum, t) => sum + (t.score / Math.max(1, t.max_score)) * 100, 0) /
      scoredTests.length;
    return Math.round(avgPct);
  }, [tests, weekEnd]);

  // Responses in this week
  const weekResponses = useMemo(() => {
    const testIds = new Set(weekTests.map((t) => t.id));
    return responses.filter((r) => testIds.has(r.test_id));
  }, [responses, weekTests]);

  // Top Error Tag this week
  const topErrorTag = useMemo(() => {
    const tagCounts: Partial<Record<ErrorTag, number>> = {};
    for (const r of weekResponses) {
      if (r.error_tag) {
        tagCounts[r.error_tag] = (tagCounts[r.error_tag] || 0) + 1;
      }
    }
    const entries = Object.entries(tagCounts) as [ErrorTag, number][];
    if (entries.length === 0) return null;
    entries.sort((a, b) => b[1] - a[1]);
    const totalTagged = entries.reduce((s, e) => s + e[1], 0);
    const [tag, count] = entries[0];
    const pct = Math.round((count / totalTagged) * 100);
    return { tag, count, pct, detail: TAG_DETAILS[tag] };
  }, [weekResponses]);

  // Top 3 Wrong Chapters this week
  const top3WrongChapters = useMemo(() => {
    const wrongMap: Record<string, { subject: Subject; chapter: string; wrongs: number }> = {};
    for (const r of weekResponses) {
      if (r.attempted && r.correct === false) {
        const key = `${r.subject}::${r.chapter}`;
        if (!wrongMap[key]) {
          wrongMap[key] = { subject: r.subject, chapter: r.chapter, wrongs: 0 };
        }
        wrongMap[key].wrongs += 1;
      }
    }
    return Object.values(wrongMap)
      .sort((a, b) => b.wrongs - a.wrongs)
      .slice(0, 3);
  }, [weekResponses]);

  // Difficulty & Time Flags in week's questions
  const flaggedQuestions = useMemo(() => {
    const flagged: {
      response: ResponseRecord;
      type: "slow" | "rushed" | "struggle";
      label: string;
    }[] = [];

    for (const r of weekResponses) {
      if (!r.attempted) continue;
      const thresholdSlow = r.type === "numerical" ? 240 : 150;

      if (r.time_spent > thresholdSlow) {
        flagged.push({
          response: r,
          type: r.correct === false ? "struggle" : "slow",
          label: r.correct === false ? "Struggle trap" : `Slow (${fmtSecs(r.time_spent)})`,
        });
      } else if (r.time_spent < 30 && r.correct === false) {
        flagged.push({
          response: r,
          type: "rushed",
          label: `Rushed (<30s)`,
        });
      }
    }

    return flagged.slice(0, 10);
  }, [weekResponses]);

  return (
    <SectionCard
      title="Weekly Scorecard"
      subtitle={`Performance, planned vs actual study hours, and review velocity (${weekStart} to ${weekEnd})`}
      action={
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs px-2.5"
            onClick={() => setWeekOffset((o) => o - 1)}
          >
            ← Prev Week
          </Button>
          <Button
            size="sm"
            variant={weekOffset === 0 ? "default" : "outline"}
            className="h-7 text-xs px-2.5"
            onClick={() => setWeekOffset(0)}
            disabled={weekOffset === 0}
          >
            Current Week
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs px-2.5"
            onClick={() => setWeekOffset((o) => o + 1)}
            disabled={weekOffset >= 0}
          >
            Next →
          </Button>
        </div>
      }
    >
      {/* Top Key Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {/* Planned vs Actual */}
        <div className="p-3.5 rounded-xl border border-border bg-card/60 space-y-1.5 flex flex-col justify-between">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Planned vs Actual
          </span>
          <div>
            <div className="text-xl font-bold font-mono tabular-nums text-foreground">
              {actualJeeHours.toFixed(1)}h
              <span className="text-xs text-muted-foreground font-normal ml-1">
                / {plannedWeeklyHours}h
              </span>
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {actualJeeHours >= plannedWeeklyHours ? (
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                  ✓ Target hit
                </span>
              ) : (
                <span>{Math.round((actualJeeHours / plannedWeeklyHours) * 100)}% completed</span>
              )}
              {actualTotalHours > actualJeeHours && ` · ${actualTotalHours.toFixed(1)}h total`}
            </div>
          </div>
          {/* Progress bar */}
          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full transition-all duration-300",
                actualJeeHours >= plannedWeeklyHours
                  ? "bg-emerald-600 dark:bg-emerald-400"
                  : "bg-amber-500"
              )}
              style={{
                width: `${Math.min(100, Math.round((actualJeeHours / plannedWeeklyHours) * 100))}%`,
              }}
            />
          </div>
        </div>

        {/* 3-Test Rolling Average */}
        <div className="p-3.5 rounded-xl border border-border bg-card/60 space-y-1.5 flex flex-col justify-between">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            3-Test Rolling Avg
          </span>
          <div>
            <div className="text-xl font-bold font-mono tabular-nums text-foreground">
              {rolling3TestAvg !== null ? `${rolling3TestAvg}%` : "—"}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              across last 3 scored tests
            </div>
          </div>
          <div className="text-[10px] text-muted-foreground">
            {rolling3TestAvg !== null && rolling3TestAvg >= 70 ? (
              <Badge variant="outline" className="border-emerald-300 text-emerald-700 dark:text-emerald-400 text-[10px] py-0">
                Gate passed (≥70%)
              </Badge>
            ) : rolling3TestAvg !== null ? (
              <Badge variant="outline" className="border-amber-300 text-amber-700 dark:text-amber-400 text-[10px] py-0">
                Building foundation
              </Badge>
            ) : (
              "Take 3 tests to unlock"
            )}
          </div>
        </div>

        {/* Accuracy Change */}
        <div className="p-3.5 rounded-xl border border-border bg-card/60 space-y-1.5 flex flex-col justify-between">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Accuracy Change
          </span>
          <div>
            <div className="text-xl font-bold font-mono tabular-nums flex items-center gap-1.5">
              {accuracyCurrentWeek !== null ? `${accuracyCurrentWeek}%` : "—"}
              {accuracyDelta !== null && (
                <span
                  className={cn(
                    "text-xs font-semibold px-1.5 py-0.5 rounded flex items-center",
                    accuracyDelta >= 0
                      ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                      : "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400"
                  )}
                >
                  {accuracyDelta >= 0 ? "+" : ""}
                  {accuracyDelta}%
                </span>
              )}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {accuracyPrevWeek !== null
                ? `vs ${accuracyPrevWeek}% prev week`
                : "No tests prev week"}
            </div>
          </div>
          <div className="text-[10px] text-muted-foreground">
            {weekTests.length} tests logged
          </div>
        </div>

        {/* Anki Days */}
        <div className="p-3.5 rounded-xl border border-border bg-card/60 space-y-1.5 flex flex-col justify-between">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Anki Days Done
          </span>
          <div>
            <div className="text-xl font-bold font-mono tabular-nums text-foreground flex items-center gap-1.5">
              {weekAnki.length}/7
              <span className="text-xs text-muted-foreground font-normal">days</span>
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {weekAnki.length === 7 ? "Flawless streak 🔥" : "Daily flashcard review"}
            </div>
          </div>
          <div className="flex gap-1">
            {[0, 1, 2, 3, 4, 5, 6].map((dayOffset) => {
              const dayStr = addDays(weekStart, dayOffset);
              const isDone = weekAnki.some((a) => a.date === dayStr);
              return (
                <div
                  key={dayOffset}
                  className={cn(
                    "h-2 flex-1 rounded-sm",
                    isDone
                      ? "bg-emerald-500"
                      : dayStr <= today
                      ? "bg-muted-foreground/30"
                      : "bg-muted"
                  )}
                  title={`${dayStr}: ${isDone ? "Done" : "Missed / Future"}`}
                />
              );
            })}
          </div>
        </div>

        {/* Recall Checks Done */}
        <div className="p-3.5 rounded-xl border border-border bg-card/60 space-y-1.5 flex flex-col justify-between">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Recall Checks
          </span>
          <div>
            <div className="text-xl font-bold font-mono tabular-nums text-foreground">
              {recallChecksDone}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              5m recall / 10m explain
            </div>
          </div>
          <div className="text-[10px] text-muted-foreground">
            Active paper retrieval
          </div>
        </div>

        {/* Retry Queue Cleared */}
        <div className="p-3.5 rounded-xl border border-border bg-card/60 space-y-1.5 flex flex-col justify-between">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Retries Cleared
          </span>
          <div>
            <div className="text-xl font-bold font-mono tabular-nums text-foreground">
              {retryQueueCleared}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              mastered (stage 3)
            </div>
          </div>
          <div className="text-[10px] text-muted-foreground">
            C/F/A mistakes cured
          </div>
        </div>
      </div>

      {/* Breakdown Row: JEE Hours Split + Error Insights */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* JEE Activities breakdown */}
        <div className="p-4 rounded-xl border border-border bg-card space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              JEE Activity Allocation
            </span>
            <span className="text-xs font-mono text-muted-foreground">
              {actualJeeHours.toFixed(1)}h total
            </span>
          </div>

          <div className="space-y-2 text-xs">
            {(
              [
                { act: "problems", label: "Problems / CBT", color: "bg-emerald-500" },
                { act: "new learning", label: "New Learning", color: "bg-blue-500" },
                { act: "recall", label: "Recall Checks", color: "bg-amber-500" },
                { act: "revision", label: "Revision", color: "bg-purple-500" },
                { act: "mock", label: "Full Mocks", color: "bg-rose-500" },
              ] as const
            ).map(({ act, label, color }) => {
              const mins = jeeByActivity[act] || 0;
              const hrs = mins / 60;
              const pct = actualJeeMinutes > 0 ? Math.round((mins / actualJeeMinutes) * 100) : 0;
              return (
                <div key={act} className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-foreground">{label}</span>
                    <span className="font-mono text-muted-foreground">
                      {hrs.toFixed(1)}h ({pct}%)
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn("h-full transition-all duration-300", color)}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Subject split */}
          <div className="pt-2 border-t border-border/60 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Subject split:</span>
            <div className="flex items-center gap-2 font-mono">
              <span>P: {(jeeBySubject.Physics / 60).toFixed(1)}h</span>
              <span>·</span>
              <span>C: {(jeeBySubject.Chemistry / 60).toFixed(1)}h</span>
              <span>·</span>
              <span>M: {(jeeBySubject.Mathematics / 60).toFixed(1)}h</span>
            </div>
          </div>
        </div>

        {/* Top Error Tag & Diagnostic */}
        <div className="p-4 rounded-xl border border-border bg-card space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              Top Error Tag Diagnostic
            </span>
            {topErrorTag && (
              <Badge variant="outline" className={cn("text-[10px]", topErrorTag.detail.color)}>
                Tag {topErrorTag.tag} ({topErrorTag.pct}%)
              </Badge>
            )}
          </div>

          {topErrorTag ? (
            <div className="space-y-3">
              <div className="p-3 rounded-lg border bg-muted/30 space-y-1 text-xs">
                <div className="font-semibold text-foreground flex items-center gap-1.5">
                  <span>{topErrorTag.detail.label}</span>
                  <span className="text-muted-foreground font-normal">
                    — {topErrorTag.count} wrong answers
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {topErrorTag.detail.desc}
                </p>
              </div>

              <div className="text-[11px] text-muted-foreground space-y-1">
                <span className="font-medium text-foreground block">Prescription:</span>
                {topErrorTag.tag === "C" ? (
                  <p>
                    Concept gaps require returning to the textbook or paper theory notes. Do not spam questions; review chapter derivation first.
                  </p>
                ) : topErrorTag.tag === "F" ? (
                  <p>
                    Formula slips leak free marks. Add formula flashcards to Anki and run a 5-minute blank-paper recall drill tonight.
                  </p>
                ) : topErrorTag.tag === "A" ? (
                  <p>
                    Calculation and accuracy slips happen under rushing. Write each step explicitly on scrap paper; verify signs before bubbling.
                  </p>
                ) : (
                  <p>
                    Review your spaced retry queue items to eliminate repeated slips on these concepts.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="h-32 grid place-items-center text-xs text-muted-foreground text-center">
              No tagged errors this week. Take tests and tag your wrong answers in the review tab.
            </div>
          )}
        </div>

        {/* Top 3 Wrong Chapters */}
        <div className="p-4 rounded-xl border border-border bg-card space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-red-500" />
              Top 3 Wrong Chapters
            </span>
            <span className="text-[10px] text-muted-foreground">High-priority repairs</span>
          </div>

          {top3WrongChapters.length > 0 ? (
            <div className="space-y-2">
              {top3WrongChapters.map((item, idx) => (
                <div
                  key={`${item.subject}::${item.chapter}`}
                  className="p-2.5 rounded-lg border border-red-200/70 dark:border-red-500/25 bg-red-50/30 dark:bg-red-500/5 flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-foreground truncate flex items-center gap-1">
                      <span className="text-muted-foreground font-mono text-[10px]">#{idx + 1}</span>
                      <span>{item.chapter}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {item.subject} · <strong className="text-red-600 dark:text-red-400">{item.wrongs} wrong</strong>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-[10px] shrink-0 border-red-300 dark:border-red-500/40 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-500/10"
                    onClick={() => nav.toTestCreate({ subject: item.subject, chapter: item.chapter })}
                  >
                    ⚡ Test
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-32 grid place-items-center text-xs text-muted-foreground text-center">
              Clean run! No repeated chapter mistakes logged this week.
            </div>
          )}
        </div>
      </div>

      {/* Difficulty & Time Flags Section */}
      {flaggedQuestions.length > 0 && (
        <div className="mt-6 pt-5 border-t border-border/60 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Timer className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <h4 className="text-xs font-bold text-foreground">Difficulty & Time Traps Detected</h4>
              <Badge variant="outline" className="text-[10px] border-purple-300 text-purple-700 dark:text-purple-300">
                {flaggedQuestions.length} flagged
              </Badge>
            </div>
            <span className="text-[11px] text-muted-foreground">
              Questions exceeding time thresholds (&gt;2.5m) or rushed errors (&lt;30s)
            </span>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {flaggedQuestions.map(({ response: r, type, label }) => (
              <div
                key={r.id}
                className={cn(
                  "p-2.5 rounded-lg border text-xs space-y-1 flex flex-col justify-between",
                  type === "struggle"
                    ? "border-red-200 bg-red-50/40 dark:border-red-500/30 dark:bg-red-500/5"
                    : type === "slow"
                    ? "border-amber-200 bg-amber-50/40 dark:border-amber-500/30 dark:bg-amber-500/5"
                    : "border-purple-200 bg-purple-50/40 dark:border-purple-500/30 dark:bg-purple-500/5"
                )}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-semibold text-foreground truncate">{r.chapter}</span>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[9px] py-0 px-1.5",
                      type === "struggle"
                        ? "border-red-300 text-red-700 dark:text-red-300"
                        : type === "slow"
                        ? "border-amber-300 text-amber-700 dark:text-amber-300"
                        : "border-purple-300 text-purple-700 dark:text-purple-300"
                    )}
                  >
                    {label}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground truncate">{r.question_snippet}</p>
                <div className="flex items-center justify-between pt-1 text-[10px] text-muted-foreground">
                  <span>Spent: {fmtSecs(r.time_spent)}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-5 px-1.5 text-[10px]"
                    onClick={() => nav.openResults(r.test_id)}
                  >
                    View in test →
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </SectionCard>
  );
}
