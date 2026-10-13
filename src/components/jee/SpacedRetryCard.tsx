"use client";

import { useMemo, useState } from "react";
import { Zap, CheckCircle2, RotateCcw, AlertTriangle, ArrowRight, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useLive, getAll, put } from "@/lib/idb";
import {
  todayStr,
  uid,
  type ActiveSession,
  type Question,
  type RetryQueueItem,
  type Subject,
} from "@/lib/types";
import { groupRetryQueueForDisplay, recordRetryAttempt } from "@/lib/retry";
import type { NavController } from "./App";

const TAG_LABELS: Record<string, { label: string; color: string }> = {
  C: { label: "Concept gap", color: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-200 dark:border-red-500/30" },
  F: { label: "Formula", color: "bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-500/30" },
  A: { label: "Accuracy slip", color: "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-500/30" },
};

export function SpacedRetryCard({ nav }: { nav: NavController }) {
  const retryItems = useLive("retry_queue");
  const [actingId, setActingId] = useState<string | null>(null);

  const { groups, totalDueCount } = useMemo(() => {
    return groupRetryQueueForDisplay(retryItems, 15);
  }, [retryItems]);

  async function handleMarkSolved(item: RetryQueueItem, correct: boolean) {
    setActingId(item.id);
    try {
      await recordRetryAttempt(item.id, correct);
      if (correct) {
        toast.success(
          item.stage >= 2
            ? "Mastered! Removed from retry queue."
            : `Advanced to stage ${item.stage + 2} (${item.stage === 0 ? "due in 3d" : "due in 7d"})`
        );
      } else {
        toast.info("Reset to stage 1 (due tomorrow). Spaced repetition will reinforce it.");
      }
    } finally {
      setActingId(null);
    }
  }

  async function startAllDueSession() {
    const dueQuestionIds = retryItems
      .filter((x) => x.next_due <= todayStr())
      .map((x) => x.question_id);

    if (dueQuestionIds.length === 0) {
      toast.info("No retry questions due today!");
      return;
    }

    // Check how many exist in the question bank
    const allBank = await getAll("questions");
    const bankIds = new Set(allBank.map((q) => q.id));
    const validCbtIds = dueQuestionIds.filter((id) => bankIds.has(id));

    if (validCbtIds.length > 0) {
      const session: ActiveSession = {
        key: "active",
        test_id: uid(),
        mode: "cbt",
        test_type: "chapter",
        name: `Spaced Retry — ${validCbtIds.length} Due Mistakes`,
        subject_order: ["Physics", "Chemistry", "Mathematics"],
        question_ids: validCbtIds,
        duration_min: Math.max(5, validCbtIds.length * 2),
        started_at: Date.now(),
        answers: {},
        marked: [],
        current: 0,
        q_times: {},
        q_entered_at: Date.now(),
        is_practice: true, // practice mode with instant reveal
      };
      nav.startSession(session);
    } else {
      toast.info("Due items are from PDF papers — drill them directly or review notes.");
    }
  }

  async function startChapterDrill(chapter: string, subject: string, questionIds: string[]) {
    const allBank = await getAll("questions");
    const bankIds = new Set(allBank.map((q) => q.id));
    const validCbtIds = questionIds.filter((id) => bankIds.has(id));

    if (validCbtIds.length > 0) {
      const session: ActiveSession = {
        key: "active",
        test_id: uid(),
        mode: "cbt",
        test_type: "chapter",
        name: `Drill: ${chapter} (${validCbtIds.length} Qs)`,
        subject_order: [subject as Subject],
        question_ids: validCbtIds,
        duration_min: Math.max(5, validCbtIds.length * 2),
        started_at: Date.now(),
        answers: {},
        marked: [],
        current: 0,
        q_times: {},
        q_entered_at: Date.now(),
        is_practice: true,
      };
      nav.startSession(session);
    } else {
      nav.toTestCreate({ subject, chapter });
    }
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-4 sm:p-5 card-shadow space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400 grid place-items-center">
            <RotateCcw className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-foreground">Spaced Retry Queue</h2>
              {totalDueCount > 0 ? (
                <Badge className="bg-orange-500 text-white text-[10px] px-1.5 py-0 h-4 border-0">
                  {totalDueCount} due
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] text-muted-foreground border-border h-4 px-1.5 py-0">
                  All clear
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Concepts (C), Formulas (F), and Accuracy (A) errors revisited at 1d, 3d, 7d intervals.
            </p>
          </div>
        </div>

        {totalDueCount > 0 && (
          <Button
            size="sm"
            onClick={startAllDueSession}
            className="h-8 text-xs gap-1.5 bg-orange-600 hover:bg-orange-700 text-white"
          >
            <Play className="w-3.5 h-3.5" />
            Start Due Retry ({totalDueCount})
          </Button>
        )}
      </div>

      {groups.length === 0 ? (
        <div className="py-8 text-center border border-dashed border-border rounded-xl bg-muted/20">
          <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500 mb-2 opacity-80" />
          <p className="text-xs font-semibold text-foreground">Queue clear for today</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Every test mistake tagged C, F, or A automatically enters the 1d-3d-7d spaced loop.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {groups.map((g, i) => {
            if (g.type === "drill") {
              return (
                <div
                  key={`drill-${g.subject}-${g.chapter}-${i}`}
                  className="p-3 rounded-xl border border-orange-200 dark:border-orange-500/30 bg-orange-50/50 dark:bg-orange-500/10 flex items-center justify-between gap-3 flex-wrap"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full bg-orange-500 shrink-0" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-orange-950 dark:text-orange-200">
                          ⚡ Chapter Drill: {g.chapter}
                        </span>
                        <Badge variant="outline" className="text-[10px] border-orange-300 dark:border-orange-500/40 text-orange-800 dark:text-orange-300">
                          {g.items.length} mistakes accumulated
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate">
                        High error concentration (&ge;5) collapsed into a focused drill.
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="h-7 text-xs gap-1 bg-orange-600 hover:bg-orange-700 text-white shrink-0"
                    onClick={() => startChapterDrill(g.chapter, g.subject, g.questionIds)}
                  >
                    Drill Chapter
                    <ArrowRight className="w-3 h-3" />
                  </Button>
                </div>
              );
            }

            const item = g.item;
            const tagInfo = TAG_LABELS[item.error_tag] ?? {
              label: item.error_tag,
              color: "bg-muted text-muted-foreground",
            };

            return (
              <div
                key={item.id}
                className="p-2.5 rounded-lg border border-border bg-card/60 hover:bg-accent/40 transition-colors flex items-center justify-between gap-3 text-xs"
              >
                <div className="min-w-0 flex items-center gap-2">
                  <Badge variant="outline" className={`text-[10px] border ${tagInfo.color} font-mono shrink-0`}>
                    {item.error_tag}
                  </Badge>
                  <div className="min-w-0">
                    <span className="font-semibold text-foreground mr-1.5">{item.chapter}</span>
                    <span className="text-muted-foreground text-[11px]">
                      Stage {item.stage + 1}/3 ({item.stage === 0 ? "1d" : item.stage === 1 ? "3d" : "7d"})
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-[11px] text-muted-foreground hover:text-red-600"
                    disabled={actingId === item.id}
                    onClick={() => void handleMarkSolved(item, false)}
                    title="Still struggling? Reset to 1d"
                  >
                    Struggled
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950 border-emerald-200 dark:border-emerald-800"
                    disabled={actingId === item.id}
                    onClick={() => void handleMarkSolved(item, true)}
                  >
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Solved
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
