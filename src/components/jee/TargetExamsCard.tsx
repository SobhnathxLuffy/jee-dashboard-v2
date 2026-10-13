"use client";

import { useEffect, useState } from "react";
import { Calendar, Edit2, AlertCircle, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionCard } from "./shared";
import { getTargetExams } from "@/lib/settings";
import { deriveExamPhase, todayStr, type ExamPhase, type TargetExam } from "@/lib/types";
import { SettingsDialog } from "./SettingsDialog";
import { useDataVersion } from "@/lib/idb";

export function TargetExamsCard() {
  const [exams, setExams] = useState<TargetExam[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const dataVersion = useDataVersion();

  useEffect(() => {
    void getTargetExams().then(setExams);
  }, [dataVersion, settingsOpen]);

  const todayMs = new Date(`${todayStr()}T12:00:00`).getTime();

  const sortedExams = [...exams].sort((a, b) => a.date.localeCompare(b.date));

  function getPhaseBadge(phase: ExamPhase) {
    switch (phase) {
      case "Cover":
        return (
          <Badge className="bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300 border-sky-300 dark:border-sky-800">
            Cover (&gt;12w)
          </Badge>
        );
      case "Consolidate":
        return (
          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300 dark:border-amber-800">
            Consolidate (4–12w)
          </Badge>
        );
      case "Mock-only":
        return (
          <Badge className="bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border-rose-300 dark:border-rose-800 font-semibold">
            Mock-only (&lt;4w)
          </Badge>
        );
      case "Done":
        return (
          <Badge variant="outline" className="text-muted-foreground">
            Completed
          </Badge>
        );
    }
  }

  function getPhaseGuidance(phase: ExamPhase) {
    switch (phase) {
      case "Cover":
        return "Broad syllabus syllabus coverage & first passes. Prioritize Tier 1 chapters.";
      case "Consolidate":
        return "Deep error analysis, weak-area drills, timed mixed tests & active recall.";
      case "Mock-only":
        return "Full-length 3-hour CBT mocks every 2–3 days. Strict review of error tags & stamina.";
      case "Done":
        return "Exam completed.";
    }
  }

  return (
    <div data-tutorial="target-exams">
    <SectionCard
      title="Target Exams & Deadlines"
      subtitle="Milestones derived automatically into strategic phases"
      action={
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1"
          onClick={() => setSettingsOpen(true)}
        >
          <Edit2 className="w-3 h-3" />
          Edit Dates
        </Button>
      }
    >
      <div className="space-y-3">
        {sortedExams.map((exam) => {
          const examMs = new Date(`${exam.date}T12:00:00`).getTime();
          const daysLeft = Math.ceil((examMs - todayMs) / 86400000);
          const phase = deriveExamPhase(daysLeft);

          return (
            <div
              key={exam.id}
              className="p-3 border border-border rounded-lg bg-card/60 hover:bg-card transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
            >
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-foreground">{exam.name}</span>
                  <span className="text-xs text-muted-foreground font-mono">({exam.date})</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {getPhaseGuidance(phase)}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {getPhaseBadge(phase)}
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-muted">
                  {daysLeft >= 0 ? `${daysLeft}d left` : "Ended"}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </SectionCard>
    </div>
  );
}
