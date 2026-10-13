"use client";

import { useEffect, useMemo, useState } from "react";
import {
  FlaskConical,
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  Award,
  AlertCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { SectionCard } from "./shared";
import { cn } from "@/lib/utils";
import { put, del, useLive } from "@/lib/idb";
import { addDays, todayStr, uid, type TrialRecord } from "@/lib/types";

export function ExperimentsCard() {
  const trials = useLive("trials");
  const today = todayStr();
  // Stable "now" for render-pure date math (Date.now() is impure in render per react-hooks/purity)
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const [createOpen, setCreateOpen] = useState(false);
  const [concludeTarget, setConcludeTarget] = useState<TrialRecord | null>(null);
  const [resultLine, setResultLine] = useState("");

  // New trial form state
  const [trialType, setTrialType] = useState<"study" | "skill">("study");
  const [hypothesis, setHypothesis] = useState("");
  const [metric, setMetric] = useState("");
  const [durationDays, setDurationDays] = useState<number>(7);

  // Active trials
  const activeStudyTrials = useMemo(
    () => trials.filter((t) => t.type === "study" && t.status === "active"),
    [trials]
  );
  const activeSkillTrials = useMemo(
    () => trials.filter((t) => t.type === "skill" && t.status === "active"),
    [trials]
  );
  const concludedTrials = useMemo(
    () => trials.filter((t) => t.status !== "active").sort((a, b) => b.created_at - a.created_at),
    [trials]
  );

  const canAddStudy = activeStudyTrials.length < 1;
  const canAddSkill = activeSkillTrials.length < 2;

  async function handleCreateTrial() {
    const hyp = hypothesis.trim();
    const met = metric.trim();
    if (!hyp) {
      toast.error("Please provide a hypothesis");
      return;
    }

    if (trialType === "study" && !canAddStudy) {
      toast.error("Max 1 active study test allowed at a time. Conclude current test first.");
      return;
    }
    if (trialType === "skill" && !canAddSkill) {
      toast.error("Max 2 active skill trials allowed at a time. Conclude an active trial first.");
      return;
    }

    const startDate = today;
    const endDate = addDays(today, durationDays);

    const newTrial: TrialRecord = {
      id: uid(),
      type: trialType,
      hypothesis: hyp,
      metric: met || (trialType === "study" ? "Accuracy % gate" : "Daily minutes logged"),
      startDate,
      endDate,
      status: "active",
      created_at: Date.now(),
    };

    await put("trials", newTrial);
    toast.success(`Started new ${trialType} trial!`);
    setCreateOpen(false);
    setHypothesis("");
    setMetric("");
  }

  async function handleConclude(status: "concluded" | "abandoned") {
    if (!concludeTarget) return;
    const patch: Partial<TrialRecord> = {
      status,
      resultLine: resultLine.trim() || (status === "concluded" ? "Hypothesis supported" : "Abandoned"),
      updated_at: Date.now(),
    };

    await put("trials", { ...concludeTarget, ...patch });
    toast.success(status === "concluded" ? "Trial concluded and logged!" : "Trial marked abandoned");
    setConcludeTarget(null);
    setResultLine("");
  }

  return (
    <div data-tutorial="experiments">
    <SectionCard
      title="Experiments & Skill Trials"
      subtitle="Run controlled tests on your routine: max 1 study test, max 2 skill trials (linked to Polymathy)"
      action={
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs gap-1.5"
          onClick={() => setCreateOpen(true)}
          disabled={!canAddStudy && !canAddSkill}
        >
          <Plus className="w-3.5 h-3.5" />
          New Trial
        </Button>
      }
    >
      <div className="grid md:grid-cols-2 gap-4">
        {/* Active Study Experiment (Max 1) */}
        <div className="p-4 rounded-xl border border-border bg-card space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <FlaskConical className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              Active Study Test ({activeStudyTrials.length}/1)
            </span>
            <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-800 dark:border-emerald-500/40 dark:text-emerald-300">
              JEE Method
            </Badge>
          </div>

          {activeStudyTrials.length === 0 ? (
            <div className="p-6 border border-dashed rounded-lg text-center space-y-2">
              <p className="text-xs text-muted-foreground">
                No active study experiment running.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => {
                  setTrialType("study");
                  setHypothesis("10m Explain Mode on Tier 1 chapters improves accuracy above 70%");
                  setMetric("Test accuracy %");
                  setCreateOpen(true);
                }}
              >
                + Start Study Experiment
              </Button>
            </div>
          ) : (
            activeStudyTrials.map((t) => {
              const daysLeft = Math.max(
                0,
                Math.ceil((new Date(`${t.endDate}T12:00:00`).getTime() - nowMs) / 86400000)
              );
              return (
                <div
                  key={t.id}
                  className="p-3.5 rounded-lg border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/30 dark:bg-emerald-500/5 space-y-2 text-xs"
                >
                  <div className="font-semibold text-foreground text-sm">
                    {t.hypothesis}
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground text-[11px]">
                    <span>Metric: <strong className="text-foreground">{t.metric}</strong></span>
                    <span className="font-mono">{daysLeft} days left</span>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-emerald-200/60 dark:border-emerald-500/20 text-[10px] text-muted-foreground">
                    <span>{t.startDate} → {t.endDate}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-[10px] border-emerald-300 dark:border-emerald-600 text-emerald-800 dark:text-emerald-300"
                      onClick={() => setConcludeTarget(t)}
                    >
                      Conclude
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Active Skill Trials (Max 2) */}
        <div className="p-4 rounded-xl border border-border bg-card space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
              Active Skill Trials ({activeSkillTrials.length}/2)
            </span>
            <Badge variant="outline" className="text-[10px] border-purple-300 text-purple-800 dark:border-purple-500/40 dark:text-purple-300">
              Polymathy (3.5h/wk)
            </Badge>
          </div>

          {activeSkillTrials.length === 0 ? (
            <div className="p-6 border border-dashed rounded-lg text-center space-y-2">
              <p className="text-xs text-muted-foreground">
                No active skill trials running.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => {
                  setTrialType("skill");
                  setHypothesis("30m daily coding / prompt engineering projects");
                  setMetric("Weekly polymathy timelog ≥ 210m");
                  setCreateOpen(true);
                }}
              >
                + Start Skill Trial
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {activeSkillTrials.map((t) => {
                const daysLeft = Math.max(
                  0,
                  Math.ceil((new Date(`${t.endDate}T12:00:00`).getTime() - nowMs) / 86400000)
                );
                return (
                  <div
                    key={t.id}
                    className="p-3 rounded-lg border border-purple-200 dark:border-purple-500/30 bg-purple-50/30 dark:bg-purple-500/5 space-y-1.5 text-xs"
                  >
                    <div className="font-medium text-foreground">
                      {t.hypothesis}
                    </div>
                    <div className="flex items-center justify-between text-muted-foreground text-[11px]">
                      <span>Metric: <strong className="text-foreground">{t.metric}</strong></span>
                      <span className="font-mono">{daysLeft} days left</span>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-purple-200/60 dark:border-purple-500/20 text-[10px] text-muted-foreground">
                      <span>{t.startDate} → {t.endDate}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-[10px] border-purple-300 dark:border-purple-600 text-purple-800 dark:text-purple-300"
                        onClick={() => setConcludeTarget(t)}
                      >
                        Conclude
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* History of concluded trials */}
      {concludedTrials.length > 0 && (
        <div className="mt-4 pt-4 border-t border-border/60">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-muted-foreground">
              Trial History ({concludedTrials.length})
            </span>
          </div>
          <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
            {concludedTrials.map((t) => (
              <div
                key={t.id}
                className="p-2 rounded-md border border-border/70 bg-muted/20 text-xs flex items-center justify-between gap-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-foreground truncate">{t.hypothesis}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {t.type} · Result: {t.resultLine || "Completed"}
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[9px] py-0",
                    t.status === "concluded"
                      ? "border-emerald-300 text-emerald-700 dark:text-emerald-300"
                      : "border-stone-300 text-muted-foreground"
                  )}
                >
                  {t.status}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Start New Experiment</DialogTitle>
            <DialogDescription>
              Test an empirical hypothesis about your preparation or polymathy skill building.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-2 text-xs">
            <div className="space-y-1">
              <label className="font-medium text-foreground">Type</label>
              <Select
                value={trialType}
                onValueChange={(v) => setTrialType(v as "study" | "skill")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="study" disabled={!canAddStudy}>
                    Study Experiment (Max 1 active)
                  </SelectItem>
                  <SelectItem value="skill" disabled={!canAddSkill}>
                    Skill Trial (Polymathy, max 2 active)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="font-medium text-foreground">Hypothesis</label>
              <Input
                value={hypothesis}
                onChange={(e) => setHypothesis(e.target.value)}
                placeholder="e.g., Doing 5m recall check before test raises score by 15%"
              />
            </div>

            <div className="space-y-1">
              <label className="font-medium text-foreground">Metric to Measure</label>
              <Input
                value={metric}
                onChange={(e) => setMetric(e.target.value)}
                placeholder="e.g., Chapter test accuracy % or Weekly timelog minutes"
              />
            </div>

            <div className="space-y-1">
              <label className="font-medium text-foreground">Duration</label>
              <Select
                value={String(durationDays)}
                onValueChange={(v) => setDurationDays(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 Days (1 Week Sprint)</SelectItem>
                  <SelectItem value="14">14 Days (2 Weeks)</SelectItem>
                  <SelectItem value="21">21 Days (3 Weeks)</SelectItem>
                  <SelectItem value="30">30 Days (1 Month)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleCreateTrial}>
              Start Trial
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Conclude Dialog */}
      <Dialog open={Boolean(concludeTarget)} onOpenChange={(o) => !o && setConcludeTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Conclude Experiment</DialogTitle>
            <DialogDescription>
              Record the outcome of your hypothesis test to lock in your empirical findings.
            </DialogDescription>
          </DialogHeader>

          {concludeTarget && (
            <div className="space-y-3 py-2 text-xs">
              <div className="p-2.5 rounded bg-muted text-foreground">
                <strong>Hypothesis:</strong> {concludeTarget.hypothesis}
              </div>

              <div className="space-y-1">
                <label className="font-medium text-foreground">Result Line (Summary)</label>
                <Input
                  value={resultLine}
                  onChange={(e) => setResultLine(e.target.value)}
                  placeholder="e.g., Accuracy increased from 58% to 73% — Keep routine"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              className="text-stone-600"
              onClick={() => void handleConclude("abandoned")}
            >
              Abandon
            </Button>
            <Button size="sm" onClick={() => void handleConclude("concluded")}>
              Conclude (Keep Result)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
    </div>
  );
}
