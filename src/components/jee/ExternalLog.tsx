"use client";

// ─── External test log ─── Abhyas / SATHEE / Allen / CUET data enters the system ──
// Supports full PCM mocks AND single-subject tests (Physics, Chemistry, Maths),
// customizable marking schemes (+4/-1, +5/-1 CUET, etc.), and per-question mistake
// logging with automatic spaced retry enrollment.
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { NavController } from "./App";
import { EmptyNote, PageTitle, SectionCard, StatCard } from "./shared";
import { useLive, put, del, bulkPut, getAll } from "@/lib/idb";
import {
  todayStr,
  uid,
  SUBJECTS,
  type TestRecord,
  type Subject,
  type ResponseRecord,
  type ErrorTag,
} from "@/lib/types";
import { PRESET_MARKING_SCHEMES } from "@/lib/scoring";
import { syncAllMistakesToRetryQueue } from "@/lib/retry";
import { Plus, Trash2, ArrowUpRight } from "lucide-react";

const SOURCES = ["Abhyas", "SATHEE", "Allen", "CUET Official", "NTA official", "Other"] as const;

const ERROR_TAG_INFO: Record<ErrorTag, { label: string; desc: string }> = {
  C: { label: "C - Conceptual", desc: "Concept gap / didn't know the principle" },
  F: { label: "F - Formula", desc: "Forgot formula or calculation step" },
  A: { label: "A - Silly Blunder", desc: "Misread prompt, sign blunder, rushed" },
  R: { label: "R - Review Later", desc: "Worth revisiting before exam" },
  T: { label: "T - Time Pressure", desc: "Ran out of time or panicked" },
  G: { label: "G - Guess", desc: "Educated or blind guess" },
};

interface MistakeRow {
  id: string;
  q_no: number;
  subject: Subject;
  chapter: string;
  status: "wrong" | "silly" | "unattempted" | "guess";
  tag: ErrorTag;
  note: string;
}

export function ExternalLogView({ nav }: { nav: NavController }) {
  const tests = useLive("tests");
  const syllabus = useLive("syllabus");

  const [date, setDate] = useState(todayStr());
  const [source, setSource] = useState<(typeof SOURCES)[number]>("Abhyas");
  const [sourceOther, setSourceOther] = useState("");
  const [scope, setScope] = useState<"full" | Subject>("full");

  // Marking scheme
  const [schemePreset, setSchemePreset] = useState("jee-main");
  const [marksCorrect, setMarksCorrect] = useState("4");
  const [marksWrong, setMarksWrong] = useState("1");

  const [duration, setDuration] = useState("180");
  const [maxScore, setMaxScore] = useState("300");
  const [score, setScore] = useState("");
  const [pScore, setPScore] = useState("");
  const [cScore, setCScore] = useState("");
  const [mScore, setMScore] = useState("");
  const [attempts, setAttempts] = useState("");
  const [wrong, setWrong] = useState("");
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Per-question mistake logging
  const [mistakes, setMistakes] = useState<MistakeRow[]>([]);
  const [showMistakes, setShowMistakes] = useState(false);

  const maxNum = Math.max(1, Number(maxScore) || 300);

  const external = useMemo(
    () =>
      tests
        .filter((t) => t.type === "external")
        .sort((a, b) => b.created_at - a.created_at),
    [tests]
  );

  const best = useMemo(() => {
    return external.reduce<TestRecord | null>((m, t) => {
      const s = t.score ?? 0;
      if (m === null || s > (m.score ?? 0)) return t;
      return m;
    }, null);
  }, [external]);

  function handleScopeChange(newScope: "full" | Subject) {
    setScope(newScope);
    if (newScope !== "full") {
      if (schemePreset === "cuet" || source === "CUET Official") {
        setMaxScore("250");
        setDuration("50");
      } else {
        setMaxScore("100");
        setDuration("60");
      }
    } else {
      setMaxScore("300");
      setDuration("180");
    }
  }

  function handleSourceChange(newSource: (typeof SOURCES)[number]) {
    setSource(newSource);
    if (newSource === "CUET Official") {
      setSchemePreset("cuet");
      setMarksCorrect("5");
      setMarksWrong("1");
      if (scope !== "full") {
        setMaxScore("250");
        setDuration("50");
      }
    }
  }

  function handleSchemePresetChange(presetId: string) {
    setSchemePreset(presetId);
    const p = PRESET_MARKING_SCHEMES.find((x) => x.id === presetId);
    if (p && presetId !== "custom") {
      setMarksCorrect(String(p.scheme.correct));
      setMarksWrong(String(Math.abs(p.scheme.wrong)));
    }
  }

  function addMistakeRow() {
    const nextQ = mistakes.length > 0 ? Math.max(...mistakes.map((m) => m.q_no)) + 1 : 1;
    const defaultSubj: Subject = scope === "full" ? "Physics" : scope;
    const defaultCh =
      syllabus.find((s) => s.subject === defaultSubj)?.chapter || "General";

    setMistakes((prev) => [
      ...prev,
      {
        id: uid(),
        q_no: nextQ,
        subject: defaultSubj,
        chapter: defaultCh,
        status: "wrong",
        tag: "C",
        note: "",
      },
    ]);
    setShowMistakes(true);
  }

  function removeMistakeRow(id: string) {
    setMistakes((prev) => prev.filter((m) => m.id !== id));
  }

  function updateMistakeRow(id: string, patch: Partial<MistakeRow>) {
    setMistakes((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }

  function resetForm() {
    setDate(todayStr());
    setSource("Abhyas");
    setSourceOther("");
    setScope("full");
    setSchemePreset("jee-main");
    setMarksCorrect("4");
    setMarksWrong("1");
    setDuration("180");
    setMaxScore("300");
    setScore("");
    setPScore("");
    setCScore("");
    setMScore("");
    setAttempts("");
    setWrong("");
    setName("");
    setMistakes([]);
    setShowMistakes(false);
  }

  async function startEdit(t: TestRecord) {
    setEditingId(t.id);
    setDate(t.date);
    const known = SOURCES.find((s) => s === t.source);
    if (known) {
      setSource(known);
      setSourceOther("");
    } else {
      setSource("Other");
      setSourceOther(t.source);
    }

    // Determine scope from subject_scores
    const hasP = t.subject_scores.Physics !== undefined;
    const hasC = t.subject_scores.Chemistry !== undefined;
    const hasM = t.subject_scores.Mathematics !== undefined;
    if (hasP && !hasC && !hasM) setScope("Physics");
    else if (!hasP && hasC && !hasM) setScope("Chemistry");
    else if (!hasP && !hasC && hasM) setScope("Mathematics");
    else setScope("full");

    setDuration(String(t.duration_min));
    setMaxScore(String(t.max_score));
    setScore(t.score === null ? "" : String(t.score));
    setPScore(t.subject_scores.Physics !== undefined ? String(t.subject_scores.Physics) : "");
    setCScore(t.subject_scores.Chemistry !== undefined ? String(t.subject_scores.Chemistry) : "");
    setMScore(t.subject_scores.Mathematics !== undefined ? String(t.subject_scores.Mathematics) : "");
    setAttempts(t.external_meta ? String(t.external_meta.attempts) : "");
    setWrong(t.external_meta ? String(t.external_meta.wrong) : "");
    setName(t.name);

    if (t.marks_correct !== undefined) {
      setMarksCorrect(String(t.marks_correct));
      setMarksWrong(String(Math.abs(t.marks_wrong ?? 1)));
      if (t.marks_correct === 5) setSchemePreset("cuet");
      else if (t.marks_correct === 3) setSchemePreset("bitsat");
      else if (t.marks_correct === 4 && (t.marks_wrong ?? -1) === -1) setSchemePreset("jee-main");
      else setSchemePreset("custom");
    }

    // Load any existing responses for this external test
    try {
      const allRes = await getAll("responses");
      const existingRes = allRes.filter((r) => r.test_id === t.id);
      if (existingRes.length > 0) {
        setMistakes(
          existingRes.map((r) => ({
            id: r.id,
            q_no: r.q_no || 1,
            subject: r.subject,
            chapter: r.chapter,
            status: r.correct === false ? "wrong" : !r.attempted ? "unattempted" : "silly",
            tag: r.error_tag || "C",
            note: r.note || "",
          }))
        );
        setShowMistakes(true);
      } else {
        setMistakes([]);
      }
    } catch {
      setMistakes([]);
    }
  }

  function cancelEdit() {
    setEditingId(null);
    resetForm();
  }

  async function save() {
    if (saving) return;
    const sc = Number(score);
    if (score.trim() === "" || Number.isNaN(sc)) {
      toast.error("Total score must be a number");
      return;
    }
    if (sc > maxNum) {
      toast.error(`Total score can't exceed the max (${maxNum})`);
      return;
    }

    let subjectScores: Partial<Record<Subject, number>> = {};

    if (scope === "full") {
      const ps = Number(pScore) || 0;
      const cs = Number(cScore) || 0;
      const ms = Number(mScore) || 0;
      subjectScores = { Physics: ps, Chemistry: cs, Mathematics: ms };
    } else {
      // Single subject test: only set this subject's score
      subjectScores = { [scope]: sc };
    }

    const att = attempts.trim() === "" ? undefined : Number(attempts);
    const wr = wrong.trim() === "" ? undefined : Number(wrong);
    if ((att !== undefined && Number.isNaN(att)) || (wr !== undefined && Number.isNaN(wr))) {
      toast.error("Attempts / wrong must be numbers");
      return;
    }

    const src = source === "Other" ? sourceOther.trim() || "Other" : source;
    const cVal = Math.max(1, Number(marksCorrect) || 4);
    const wVal = Math.max(0, Number(marksWrong) || 0);

    const testId = editingId || uid();
    const common = {
      date: date || todayStr(),
      name:
        name.trim() ||
        (scope === "full" ? `${src} full mock` : `${src} ${scope} Test`),
      source: src,
      type: "external" as const,
      duration_min: Number(duration) || (scope === "full" ? 180 : 60),
      score: sc,
      max_score: maxNum,
      subject_scores: subjectScores,
      marks_correct: cVal,
      marks_wrong: -wVal,
      external_meta:
        att !== undefined && wr !== undefined ? { attempts: att, wrong: wr } : undefined,
    };

    setSaving(true);
    try {
      if (editingId) {
        const existing = tests.find((t) => t.id === editingId);
        if (!existing) {
          toast.error("Entry no longer exists");
          cancelEdit();
          return;
        }
        await put("tests", { ...existing, ...common });
      } else {
        const record: TestRecord = { id: testId, created_at: Date.now(), ...common };
        await put("tests", record);
      }

      const { logTestTime } = await import("@/lib/timelog");
      await logTestTime(
        testId,
        common.name,
        common.duration_min,
        common.date,
        scope !== "full" ? (scope as Subject) : undefined
      );

      // Save any logged question mistakes as ResponseRecords
      if (mistakes.length > 0) {
        const responseRecords: ResponseRecord[] = mistakes.map((m) => ({
          id: m.id.startsWith("ext:") ? m.id : uid(),
          test_id: testId,
          question_id: `ext:${testId}:${m.q_no}`,
          selected: m.status === "wrong" ? "wrong" : null,
          correct: m.status === "guess" ? true : m.status === "unattempted" ? null : false,
          attempted: m.status !== "unattempted",
          q_no: m.q_no,
          time_spent: 0,
          error_tag: m.tag,
          note: m.note.trim() || undefined,
          subject: m.subject,
          chapter: m.chapter,
          question_snippet: `External Q${m.q_no} (${m.chapter})`,
          correct_answer: "",
          type: "MCQ",
        }));

        await bulkPut("responses", responseRecords);
        const retryCount = await syncAllMistakesToRetryQueue(responseRecords);
        if (retryCount > 0) {
          toast.success(
            `Enrolled ${retryCount} conceptual/formula mistakes into Spaced Retry queue!`
          );
        }
      }

      toast.success(editingId ? "External test updated" : "External test logged successfully");
      cancelEdit();
    } catch {
      toast.error("Could not save — please try again");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageTitle
        title="Log External Test"
        subtitle="Log full mocks or single-subject tests from Abhyas, CUET, Allen, or coaching. Record question mistakes to sync them directly to your spaced-repetition retry queue."
        right={
          <Button variant="outline" size="sm" onClick={() => nav.go("dashboard")}>
            ← Dashboard
          </Button>
        }
      />

      <div className="grid lg:grid-cols-5 gap-6">
        <SectionCard
          title={editingId ? "Edit external mock" : "Log external test"}
          subtitle={
            editingId
              ? "Updating entry — click Update test to save"
              : "Supports Full PCM and Single Subject (Physics, Chemistry, Maths)"
          }
          className="lg:col-span-2"
          action={
            editingId ? (
              <button
                type="button"
                onClick={cancelEdit}
                className="text-xs text-muted-foreground underline hover:text-foreground"
              >
                Cancel edit
              </button>
            ) : undefined
          }
        >
          <div className="space-y-4">
            {/* Scope selection */}
            <div className="space-y-1.5">
              <Label className="text-xs">Test Scope</Label>
              <div className="grid grid-cols-4 gap-1.5">
                <button
                  type="button"
                  onClick={() => handleScopeChange("full")}
                  className={cn(
                    "py-1.5 px-2 rounded-lg text-xs font-medium border text-center transition-colors",
                    scope === "full"
                      ? "bg-emerald-700 text-white border-emerald-700 dark:bg-emerald-500 dark:text-emerald-950"
                      : "bg-card border-border text-muted-foreground hover:bg-muted"
                  )}
                >
                  Full (PCM)
                </button>
                {SUBJECTS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleScopeChange(s)}
                    className={cn(
                      "py-1.5 px-2 rounded-lg text-xs font-medium border text-center transition-colors",
                      scope === s
                        ? "bg-emerald-700 text-white border-emerald-700 dark:bg-emerald-500 dark:text-emerald-950"
                        : "bg-card border-border text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Source</Label>
                <Select
                  value={source}
                  onValueChange={(v) => handleSourceChange(v as (typeof SOURCES)[number])}
                >
                  <SelectTrigger aria-label="Source">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SOURCES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {source === "Other" ? (
              <div className="space-y-1.5">
                <Label className="text-xs">Platform / Coaching Name</Label>
                <Input
                  value={sourceOther}
                  onChange={(e) => setSourceOther(e.target.value)}
                  placeholder="e.g. Physics Wallah, Resonance, MathonGo"
                />
              </div>
            ) : null}

            {/* Marking Scheme config */}
            <div className="grid grid-cols-3 gap-2 p-2.5 rounded-lg border border-border/70 bg-muted/20">
              <div className="space-y-1 col-span-3">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px]">Marking Scheme</Label>
                  <span className="text-[11px] font-mono text-emerald-700 dark:text-emerald-400">
                    +{marksCorrect} / −{marksWrong}
                  </span>
                </div>
                <Select value={schemePreset} onValueChange={handleSchemePresetChange}>
                  <SelectTrigger className="h-7 text-xs" aria-label="Marking scheme">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRESET_MARKING_SCHEMES.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Correct (+)</Label>
                <Input
                  type="number"
                  value={marksCorrect}
                  onChange={(e) => {
                    setMarksCorrect(e.target.value);
                    setSchemePreset("custom");
                  }}
                  className="h-7 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Wrong (−)</Label>
                <Input
                  type="number"
                  value={marksWrong}
                  onChange={(e) => {
                    setMarksWrong(e.target.value);
                    setSchemePreset("custom");
                  }}
                  className="h-7 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Duration (m)</Label>
                <Input
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  className="h-7 text-xs"
                  inputMode="numeric"
                />
              </div>
            </div>

            {/* Score inputs */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Max Marks</Label>
                <Input
                  value={maxScore}
                  onChange={(e) => setMaxScore(e.target.value)}
                  inputMode="numeric"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">
                  {scope === "full" ? "Total Score" : `${scope} Score`} / {maxNum}
                </Label>
                <Input
                  value={score}
                  onChange={(e) => {
                    setScore(e.target.value);
                    if (scope === "Physics") setPScore(e.target.value);
                    else if (scope === "Chemistry") setCScore(e.target.value);
                    else if (scope === "Mathematics") setMScore(e.target.value);
                  }}
                  inputMode="numeric"
                  placeholder="e.g. 180"
                />
              </div>
            </div>

            {scope === "full" ? (
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px]">Physics</Label>
                  <Input
                    value={pScore}
                    onChange={(e) => setPScore(e.target.value)}
                    inputMode="numeric"
                    placeholder="P score"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Chemistry</Label>
                  <Input
                    value={cScore}
                    onChange={(e) => setCScore(e.target.value)}
                    inputMode="numeric"
                    placeholder="C score"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Maths</Label>
                  <Input
                    value={mScore}
                    onChange={(e) => setMScore(e.target.value)}
                    inputMode="numeric"
                    placeholder="M score"
                  />
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Attempts (optional)</Label>
                <Input
                  value={attempts}
                  onChange={(e) => setAttempts(e.target.value)}
                  inputMode="numeric"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Wrong Count (optional)</Label>
                <Input
                  value={wrong}
                  onChange={(e) => setWrong(e.target.value)}
                  inputMode="numeric"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Test Title (optional)</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={
                  scope === "full"
                    ? "e.g. Abhyas Full Mock #7"
                    : `e.g. ${source} ${scope} Practice Drill`
                }
              />
            </div>

            {/* MISTAKE LOGGING ACCORDION */}
            <div className="border border-border/80 rounded-xl p-3 bg-card">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <span>🎯</span> Question Mistakes &amp; Situation Tagging
                  </h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Tag questions to send them to your Spaced Retry queue ({mistakes.length} added).
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addMistakeRow}
                  className="h-7 text-xs gap-1"
                >
                  <Plus className="h-3 w-3" />
                  Add Q
                </Button>
              </div>

              {showMistakes && mistakes.length > 0 ? (
                <div className="space-y-3 mt-3 pt-3 border-t border-border/60 max-h-64 overflow-y-auto pr-1">
                  {mistakes.map((m, idx) => (
                    <div
                      key={m.id}
                      className="p-2.5 rounded-lg border border-border bg-muted/20 space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-foreground">#{idx + 1}</span>
                          <div className="flex items-center gap-1">
                            <span className="text-muted-foreground">Q No:</span>
                            <Input
                              type="number"
                              value={m.q_no}
                              onChange={(e) =>
                                updateMistakeRow(m.id, { q_no: Number(e.target.value) || 1 })
                              }
                              className="w-14 h-6 text-xs p-1"
                            />
                          </div>

                          {scope === "full" ? (
                            <Select
                              value={m.subject}
                              onValueChange={(v) =>
                                updateMistakeRow(m.id, { subject: v as Subject })
                              }
                            >
                              <SelectTrigger className="h-6 text-xs w-24">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {SUBJECTS.map((s) => (
                                  <SelectItem key={s} value={s}>
                                    {s}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">
                              {m.subject}
                            </Badge>
                          )}
                        </div>

                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeMistakeRow(m.id)}
                          className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[10px] text-muted-foreground">Chapter</Label>
                          <Input
                            value={m.chapter}
                            onChange={(e) => updateMistakeRow(m.id, { chapter: e.target.value })}
                            placeholder="Chapter name"
                            className="h-6 text-xs"
                          />
                        </div>

                        <div>
                          <Label className="text-[10px] text-muted-foreground">
                            Error Tag (Retry sync)
                          </Label>
                          <Select
                            value={m.tag}
                            onValueChange={(v) => updateMistakeRow(m.id, { tag: v as ErrorTag })}
                          >
                            <SelectTrigger className="h-6 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(Object.keys(ERROR_TAG_INFO) as ErrorTag[]).map((tagKey) => (
                                <SelectItem key={tagKey} value={tagKey}>
                                  {ERROR_TAG_INFO[tagKey].label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div>
                        <Input
                          value={m.note}
                          onChange={(e) => updateMistakeRow(m.id, { note: e.target.value })}
                          placeholder="What went wrong? (e.g. Forgot standard electrode sign convention)"
                          className="h-6 text-xs"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <Button
              onClick={save}
              disabled={saving}
              className="w-full bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-500 dark:hover:bg-emerald-600 dark:text-emerald-950 font-semibold py-4"
            >
              {saving ? "Saving…" : editingId ? "Update Test Entry" : "Save External Test"}
            </Button>
          </div>
        </SectionCard>

        {/* LOGGED TESTS TABLE */}
        <div className="lg:col-span-3 space-y-6">
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Mocks logged" value={external.length} />
            <StatCard
              label="Best score"
              value={best && best.score !== null ? `${best.score}/${best.max_score}` : "—"}
              tone="good"
            />
          </div>

          <SectionCard title="Logged external tests">
            {external.length === 0 ? (
              <EmptyNote>
                No external tests yet. Log your CUET, Abhyas, or Allen mocks here to keep all your
                progress and spaced retry errors unified.
              </EmptyNote>
            ) : (
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground/70 uppercase">
                    <tr>
                      <th className="py-2 pr-3">Date</th>
                      <th className="py-2 pr-3">Source &amp; Scope</th>
                      <th className="py-2 pr-3 text-right">Score</th>
                      <th className="py-2 pr-3 text-right">Scheme</th>
                      <th className="py-2 pr-3 text-right">P</th>
                      <th className="py-2 pr-3 text-right">C</th>
                      <th className="py-2 pr-3 text-right">M</th>
                      <th className="py-2 pr-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {external.map((t) => {
                      const hasP = t.subject_scores.Physics !== undefined;
                      const hasC = t.subject_scores.Chemistry !== undefined;
                      const hasM = t.subject_scores.Mathematics !== undefined;
                      let scopeLabel = "PCM";
                      if (hasP && !hasC && !hasM) scopeLabel = "Physics";
                      else if (!hasP && hasC && !hasM) scopeLabel = "Chemistry";
                      else if (!hasP && !hasC && hasM) scopeLabel = "Maths";

                      return (
                        <tr
                          key={t.id}
                          className={cn(
                            "border-t border-border/60 hover:bg-muted/30 transition-colors",
                            editingId === t.id && "bg-emerald-50 dark:bg-emerald-500/10"
                          )}
                        >
                          <td className="py-2 pr-3 text-muted-foreground whitespace-nowrap text-xs">
                            {t.date}
                          </td>
                          <td className="py-2 pr-3">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-xs text-foreground">
                                {t.name}
                              </span>
                              <Badge
                                variant="outline"
                                className="text-[10px] border-border text-muted-foreground py-0"
                              >
                                {t.source}
                              </Badge>
                              <Badge
                                className={cn(
                                  "text-[10px] py-0 border-0 text-white",
                                  scopeLabel === "Chemistry"
                                    ? "bg-amber-600"
                                    : scopeLabel === "Physics"
                                      ? "bg-blue-600"
                                      : scopeLabel === "Maths"
                                        ? "bg-purple-600"
                                        : "bg-emerald-600"
                                )}
                              >
                                {scopeLabel}
                              </Badge>
                            </div>
                          </td>
                          <td className="py-2 pr-3 text-right font-semibold tabular-nums text-xs">
                            {t.score === null ? "pending" : t.score}
                            <span className="text-muted-foreground/70 font-normal">
                              /{t.max_score}
                            </span>
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums text-xs text-muted-foreground">
                            +{t.marks_correct ?? 4}/−{Math.abs(t.marks_wrong ?? 1)}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums text-xs text-muted-foreground">
                            {t.subject_scores.Physics ?? "—"}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums text-xs text-muted-foreground">
                            {t.subject_scores.Chemistry ?? "—"}
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums text-xs text-muted-foreground">
                            {t.subject_scores.Mathematics ?? "—"}
                          </td>
                          <td className="py-2 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-xs h-7 gap-1 text-emerald-700 dark:text-emerald-400 hover:text-emerald-800"
                                onClick={() => nav.toResults(t.id)}
                                title="Open Review & Mistakes"
                              >
                                Review
                                <ArrowUpRight className="h-3 w-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-xs h-7 text-muted-foreground hover:text-foreground"
                                onClick={() => {
                                  if (editingId === t.id) cancelEdit();
                                  else void startEdit(t);
                                }}
                              >
                                {editingId === t.id ? "Editing…" : "Edit"}
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-xs h-7 text-red-500 dark:text-red-400 hover:text-red-600"
                                  >
                                    Delete
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete this external test?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      &ldquo;{t.name}&rdquo; will be deleted. Any logged questions
                                      associated with it will remain or be unlinked.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      className="bg-red-600 hover:bg-red-700 text-white"
                                      onClick={() => {
                                        void del("tests", t.id);
                                        // remove the auto-created timelog entry so Today's Focus doesn't count a deleted test
                                        void del("timelog", `test-${t.id}`);
                                        if (editingId === t.id) cancelEdit();
                                        toast.success("Entry deleted");
                                      }}
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
