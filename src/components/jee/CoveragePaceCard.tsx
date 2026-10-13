"use client";

import { useEffect, useMemo, useState } from "react";
import { Compass, AlertTriangle, CheckCircle2, Calendar, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { kvGet, kvSet, useDataVersion, useLive } from "@/lib/idb";
import { addDays, todayStr, type SyllabusRow } from "@/lib/types";

const DEFAULT_COVERAGE_TARGET_DAYS = 60;

function daysUntil(fromStr: string, toStr: string): number {
  const a = new Date(`${fromStr}T12:00:00`).getTime();
  const b = new Date(`${toStr}T12:00:00`).getTime();
  return Math.ceil((b - a) / 86400000);
}

export function CoveragePaceCard() {
  const syllabus = useLive("syllabus");
  const dataVersion = useDataVersion();
  const today = todayStr();

  const [targetDate, setTargetDate] = useState<string>(() => addDays(todayStr(), DEFAULT_COVERAGE_TARGET_DAYS));
  const [editingDate, setEditingDate] = useState(false);
  const [tempDate, setTempDate] = useState("");

  useEffect(() => {
    void kvGet<string>("coverage-target-date").then((d) => {
      if (d) setTargetDate(d);
    });
  }, [dataVersion]);

  async function saveTargetDate() {
    if (!tempDate) return;
    await kvSet("coverage-target-date", tempDate);
    setTargetDate(tempDate);
    setEditingDate(false);
    toast.success(`Coverage target date updated to ${tempDate}`);
  }

  const daysLeft = Math.max(1, daysUntil(today, targetDate));
  const weeksLeft = Math.max(0.5, daysLeft / 7);

  // Group chapters by Tier 1, 2, 3
  const metrics = useMemo(() => {
    const isCompleted = (s: SyllabusRow) =>
      s.status === "70% Gate Passed" || s.status === "Maintenance" || s.status === "PYQs Done";

    const byTier = {
      1: { total: 0, done: 0 },
      2: { total: 0, done: 0 },
      3: { total: 0, done: 0 },
    };

    for (const r of syllabus) {
      const tier = r.tier in byTier ? (r.tier as 1 | 2 | 3) : 2;
      byTier[tier].total += 1;
      if (isCompleted(r)) {
        byTier[tier].done += 1;
      }
    }

    const t1Remaining = Math.max(0, byTier[1].total - byTier[1].done);
    const t2Remaining = Math.max(0, byTier[2].total - byTier[2].done);
    const t3Remaining = Math.max(0, byTier[3].total - byTier[3].done);
    const totalRemaining = t1Remaining + t2Remaining + t3Remaining;
    const totalDone = byTier[1].done + byTier[2].done + byTier[3].done;
    const totalChapters = syllabus.length || 1;

    const neededOverall = parseFloat((totalRemaining / weeksLeft).toFixed(1));
    const neededT1 = parseFloat((t1Remaining / weeksLeft).toFixed(1));
    const neededT2 = parseFloat((t2Remaining / weeksLeft).toFixed(1));
    const neededT3 = parseFloat((t3Remaining / weeksLeft).toFixed(1));

    // Approximate actual pace based on completed chapters / elapsed time
    // If just starting, assume a baseline based on done chapters
    const actualPaceOverall = parseFloat(Math.max(0, (totalDone / Math.max(1, 12 - weeksLeft))).toFixed(1));
    const actualPaceT1 = parseFloat(Math.max(0, (byTier[1].done / Math.max(1, 12 - weeksLeft))).toFixed(1));

    const isBehind = totalRemaining > 0 && actualPaceOverall < neededOverall;
    const isT1AtRisk = t1Remaining > 0 && actualPaceT1 < neededT1;

    return {
      byTier,
      totalRemaining,
      totalDone,
      totalChapters,
      neededOverall,
      neededT1,
      neededT2,
      neededT3,
      actualPaceOverall,
      actualPaceT1,
      isBehind,
      isT1AtRisk,
    };
  }, [syllabus, weeksLeft]);

  return (
    <div className="bg-card border border-border rounded-2xl p-4 sm:p-5 card-shadow space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary grid place-items-center">
            <Compass className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-foreground">Metalearning Coverage Pace</h2>
              {metrics.isBehind ? (
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">
                  Behind Pace
                </Badge>
              ) : (
                <Badge className="bg-emerald-600 text-white text-[10px] px-1.5 py-0 h-4 border-0">
                  On Pace
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Target first-pass completion by {targetDate} ({daysLeft}d / ~{weeksLeft.toFixed(1)} wks left).
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {editingDate ? (
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                value={tempDate}
                onChange={(e) => setTempDate(e.target.value)}
                className="h-7 text-xs w-36"
              />
              <Button size="sm" className="h-7 text-xs px-2" onClick={saveTargetDate}>
                Save
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs px-1.5" onClick={() => setEditingDate(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1 border-border text-muted-foreground hover:text-foreground"
              onClick={() => {
                setTempDate(targetDate);
                setEditingDate(true);
              }}
            >
              <Calendar className="w-3.5 h-3.5" />
              Target: {targetDate}
            </Button>
          )}
        </div>
      </div>

      {/* Warning Alert if behind */}
      {metrics.isBehind && (
        <div className="p-3 rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-semibold">
              Behind target completion pace! Need {metrics.neededOverall} ch/week (Tier 1: {metrics.neededT1} ch/wk).
            </p>
            <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80">
              {metrics.isT1AtRisk
                ? "Tier 1 chapters deliver ~30% of each subject. Prioritize completing Tier-1 first pass before moving down-tier."
                : "Keep focused sprints on high-weightage chapters to lock in the 70% accuracy gate."}
            </p>
          </div>
        </div>
      )}

      {/* Tier breakdown cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {([1, 2, 3] as const).map((tier) => {
          const t = metrics.byTier[tier];
          const pct = t.total > 0 ? Math.round((t.done / t.total) * 100) : 0;
          const needed = tier === 1 ? metrics.neededT1 : tier === 2 ? metrics.neededT2 : metrics.neededT3;
          return (
            <div
              key={tier}
              className="p-3 rounded-xl border border-border bg-card/60 space-y-2 text-xs"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-foreground">Tier {tier}</span>
                <span className="text-muted-foreground text-[11px] font-mono tabular-nums">
                  {t.done}/{t.total} ({pct}%)
                </span>
              </div>
              <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-600 dark:bg-emerald-400 transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
                <span>Needed pace:</span>
                <span className="font-mono font-medium text-foreground">
                  {needed} ch/wk
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
