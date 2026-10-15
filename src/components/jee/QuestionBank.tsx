"use client";

// ─── Question Bank: manual entry (incl. numerical tolerance) + filterable list ──
// Sprint C/D: delete confirm with saved-test usage warning (C1), edit-in-place
// and optional question figures (D2).
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { NavController } from "./App";
import { EmptyNote, PageTitle, SectionCard, SubjectDot, TierBadge } from "./shared";
import { useLive, put, del, bulkPut, getAll } from "@/lib/idb";
import { fileToDataUrl } from "@/lib/image";
import { SUBJECTS, uid, type Question, type Subject } from "@/lib/types";
import { IMPORT_EXAMPLE, parseQuestionsJson, sortQuestionsByPaperOrder } from "@/lib/question-json";
import { FileDrop } from "./FileDrop";

const OPTION_LETTERS = ["A", "B", "C", "D"];

export function cleanSource(s?: string): string {
  if (!s) return "Unknown";
  return s
    .replace(/\s*\(Question ID:.*?\)/i, "")
    .replace(/\s*\(Q(uestion)?\s*#?\s*\d+.*?\)/i, "")
    .trim();
}


export function QuestionBankView({ nav }: { nav?: NavController }) {
  const questions = useLive("questions");
  const syllabus = useLive("syllabus");
  const tests = useLive("tests");

  const [filterSubject, setFilterSubject] = useState<string>("all");
  const [filterChapter, setFilterChapter] = useState<string>("all");
  const [filterTier, setFilterTier] = useState<string>("all");
  const [filterSource, setFilterSource] = useState<string>("all");
  const [search, setSearch] = useState("");

  const [subject, setSubject] = useState<Subject>("Physics");
  const [chapter, setChapter] = useState("");
  const [type, setType] = useState<"MCQ" | "numerical">("MCQ");
  const [text, setText] = useState("");
  const [options, setOptions] = useState<string[]>(["", "", "", ""]);
  const [answerIdx, setAnswerIdx] = useState<number>(0);
  const [numAnswer, setNumAnswer] = useState("");
  const [tolerance, setTolerance] = useState("");
  const [source, setSource] = useState("");
  const [image, setImage] = useState<string | null>(null);

  // D2a edit-in-place
  const [editingId, setEditingId] = useState<string | null>(null);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const [figOver, setFigOver] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const chaptersForSubject = useMemo(
    () =>
      syllabus
        .filter((s) => s.subject === subject)
        .map((s) => s.chapter)
        .sort(),
    [syllabus, subject]
  );

  const sourceOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const q of questions) {
      const src = cleanSource(q.source);
      counts.set(src, (counts.get(src) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [questions]);

  const tierOf = useMemo(() => {
    const m = new Map<string, 1 | 2 | 3>();
    syllabus.forEach((s) => m.set(`${s.subject}:${s.chapter}`, s.tier));
    return m;
  }, [syllabus]);

  const filtered = useMemo(() => {
    const filteredList = questions
      .filter((q) => (filterSubject === "all" ? true : q.subject === filterSubject))
      .filter((q) =>
        filterSubject !== "all" && filterChapter !== "all" ? q.chapter === filterChapter : true
      )
      .filter((q) => (filterSource === "all" ? true : cleanSource(q.source) === filterSource))
      .filter((q) => {
        if (filterTier === "all") return true;
        const t = tierOf.get(`${q.subject}:${q.chapter}`);
        return t !== undefined && String(t) === filterTier;
      })
      .filter((q) =>
        search.trim() === ""
          ? true
          : q.question.toLowerCase().includes(search.trim().toLowerCase())
      )
      ;
    if (filterSource !== "all") {
      return sortQuestionsByPaperOrder(filteredList);
    }
    return filteredList.sort((a, b) => b.created_at - a.created_at);
  }, [questions, filterSubject, filterChapter, filterTier, filterSource, search, tierOf]);


  function startTestWithFiltered() {
    if (!nav) return;
    if (filtered.length === 0) {
      toast.error("No questions in current filter");
      return;
    }
    const sortedQuestions = filterSource !== "all" ? filtered : sortQuestionsByPaperOrder(filtered);
    const ids = sortedQuestions.map((q: Question) => q.id);
    let testName = "Question Bank Practice";
    if (filterSource !== "all") testName = filterSource;
    else if (filterChapter !== "all") testName = `${filterChapter} Test`;
    else if (filterSubject !== "all") testName = `${filterSubject} Test`;

    const isCuet = testName.toLowerCase().includes("cuet");
    nav.toTestCreate({
      questionIds: ids,
      name: testName,
      source: filterSource !== "all" ? filterSource : undefined,
      subject: filterSubject !== "all" ? filterSubject : undefined,
      chapter: filterChapter !== "all" ? filterChapter : undefined,
      marksCorrect: isCuet ? 5 : 4,
      marksWrong: -1,
      durationMin: Math.max(10, Math.round(ids.length * (isCuet ? 0.9 : 1.2))),
    });
  }

  function resetForm() {
    setText("");
    setOptions(["", "", "", ""]);
    setAnswerIdx(0);
    setNumAnswer("");
    setTolerance("");
    setSource("");
    setImage(null);
    setEditingId(null);
  }

  function startEdit(q: Question) {
    setEditingId(q.id);
    setSubject(q.subject);
    setChapter(q.chapter);
    setType(q.type);
    setText(q.question);
    setOptions(q.type === "MCQ" && q.options.length === 4 ? [...q.options] : ["", "", "", ""]);
    setAnswerIdx(q.type === "MCQ" && typeof q.answer === "number" ? q.answer : 0);
    setNumAnswer(q.type === "numerical" ? String(q.answer) : "");
    setTolerance(q.type === "numerical" && q.tolerance ? String(q.tolerance) : "");
    setSource(q.source === "manual" ? "" : q.source);
    setImage(q.image ?? null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /** Shared validation + question build for add and edit. */
  function buildQuestion(): Omit<Question, "id" | "created_at"> | null {
    if (!text.trim()) {
      toast.error("Question text is empty");
      return null;
    }
    if (!chapter) {
      toast.error("Pick a chapter");
      return null;
    }
    if (type === "MCQ") {
      if (options.some((o) => !o.trim())) {
        toast.error("All 4 options are needed for an MCQ");
        return null;
      }
      return {
        question: text.trim(),
        options: options.map((o) => o.trim()),
        answer: answerIdx,
        tolerance: 0,
        type: "MCQ",
        subject,
        chapter,
        source: source.trim() || "manual",
        image: image ?? undefined,
      };
    }
    const ans = Number(numAnswer);
    if (numAnswer.trim() === "" || Number.isNaN(ans)) {
      toast.error("Numerical answer must be a number");
      return null;
    }
    return {
      question: text.trim(),
      options: [],
      answer: ans,
      tolerance: tolerance.trim() === "" ? 0 : Math.max(0, Number(tolerance) || 0),
      type: "numerical",
      subject,
      chapter,
      source: source.trim() || "manual",
      image: image ?? undefined,
    };
  }

  async function addQuestion() {
    const q = buildQuestion();
    if (!q) return;
    await put("questions", { ...q, id: uid(), created_at: Date.now() } as Question);
    toast.success(`Added to ${chapter}`);
    setText("");
    setOptions(["", "", "", ""]);
    setNumAnswer("");
    setTolerance("");
    setImage(null);
  }

  async function saveEdit() {
    const orig = editingId ? questions.find((q) => q.id === editingId) : undefined;
    if (!orig) {
      setEditingId(null);
      return;
    }
    const q = buildQuestion();
    if (!q) return;
    await put("questions", {
      ...orig, // same id + created_at preserved
      ...q,
      updated_at: Date.now(),
    } as Question);
    toast.success("Question updated");
    resetForm();
  }

  async function onImageFile(file: File) {
    try {
      setImage(await fileToDataUrl(file, 800));
      toast.success("Figure attached");
    } catch {
      toast.error("Could not read that image — try a JPG/PNG");
    }
  }

  // Bonus: paste an image from the clipboard anywhere inside the form
  function onFormPaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const it of items) {
      if (it.type.startsWith("image/")) {
        const f = it.getAsFile();
        if (f) {
          e.preventDefault();
          fileToDataUrl(f, 800)
            .then((dataUrl) => {
              setImage(dataUrl);
              toast.success("Figure attached from clipboard");
            })
            .catch(() => toast.error("Could not read the pasted image"));
        }
        return;
      }
    }
  }

  const chapterFilterOptions =
    filterSubject === "all"
      ? []
      : syllabus.filter((s) => s.subject === filterSubject).map((s) => s.chapter);

  return (
    <div className="space-y-6">
      <PageTitle
        title="Question Bank"
        subtitle="Manual entry lives here. Bank questions feed the CBT player; chapter names come from the syllabus seed."
        right={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setImportOpen((v) => !v)}>
              Import JSON
            </Button>
            <Badge variant="outline" className="border-border text-muted-foreground">
              {questions.length} questions
            </Badge>
          </div>
        }
      />

      {importOpen ? <JsonImportPanel onClose={() => setImportOpen(false)} nav={nav} /> : null}

      <div className="grid lg:grid-cols-5 gap-6">
        {/* entry / edit form */}
        <SectionCard
          title={editingId ? "Edit question" : "Add question"}
          subtitle={
            editingId
              ? "changes save to the same question — existing tests keep their own copy of the answer"
              : "numerical questions carry an optional tolerance (real JEE numericals often accept a range)"
          }
          className="lg:col-span-2"
        >
          <div className="space-y-3" onPaste={onFormPaste}>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Subject</Label>
                <Select
                  value={subject}
                  onValueChange={(v) => {
                    setSubject(v as Subject);
                    setChapter("");
                  }}
                >
                  <SelectTrigger aria-label="Subject"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SUBJECTS.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Chapter</Label>
                <Select value={chapter} onValueChange={setChapter}>
                  <SelectTrigger aria-label="Chapter">
                    <SelectValue placeholder="pick chapter" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {chaptersForSubject.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Type</Label>
                <Select
                  value={type}
                  onValueChange={(v) => setType(v as "MCQ" | "numerical")}
                >
                  <SelectTrigger aria-label="Type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MCQ">MCQ (+4 / −1)</SelectItem>
                    <SelectItem value="numerical">Numerical (+4 / −1)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Source</Label>
                <Input
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder="PYQ 2023 / coaching sheet…"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Question text</Label>
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={3}
                placeholder="Plain text is fine. Use x^2, CO₂ etc. — no LaTeX needed for MVP."
              />
            </div>

            {type === "MCQ" ? (
              <div className="space-y-2">
                <Label className="text-xs">Options — click the circle next to the correct one</Label>
                {options.map((o, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label={`Mark option ${OPTION_LETTERS[i]} correct`}
                      onClick={() => setAnswerIdx(i)}
                      className={`w-7 h-7 rounded-full grid place-items-center text-xs font-bold border transition-colors ${
                        answerIdx === i
                          ? "bg-emerald-700 dark:bg-emerald-500 text-white dark:text-emerald-950 border-emerald-700 dark:border-emerald-500"
                          : "bg-card text-muted-foreground border-border hover:border-emerald-500 dark:hover:border-emerald-400 dark:hover:border-emerald-500"
                      }`}
                    >
                      {OPTION_LETTERS[i]}
                    </button>
                    <Input
                      value={o}
                      onChange={(e) => {
                        const next = [...options];
                        next[i] = e.target.value;
                        setOptions(next);
                      }}
                      placeholder={`Option ${OPTION_LETTERS[i]}`}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Correct answer (number)</Label>
                  <Input
                    value={numAnswer}
                    onChange={(e) => setNumAnswer(e.target.value)}
                    inputMode="decimal"
                    placeholder="e.g. 2.5"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Tolerance ± (0 = exact)</Label>
                  <Input
                    value={tolerance}
                    onChange={(e) => setTolerance(e.target.value)}
                    inputMode="decimal"
                    placeholder="0"
                  />
                </div>
              </div>
            )}

            {/* D2b: optional figure — drop an image file right onto the tile */}
            <div
              className={cn(
                "space-y-1.5 rounded-lg p-1 -m-1 transition-colors",
                figOver && "bg-primary/5 ring-2 ring-primary/20"
              )}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes("Files")) {
                  e.preventDefault();
                  setFigOver(true);
                }
              }}
              onDragLeave={() => setFigOver(false)}
              onDrop={(e) => {
                const f = e.dataTransfer.files?.[0];
                if (f && f.type.startsWith("image/")) {
                  e.preventDefault();
                  setFigOver(false);
                  void onImageFile(f);
                }
              }}
            >
              <Label className="text-xs">Figure (optional)</Label>
              {image ? (
                <div className="flex items-center gap-2">
                  <img
                    src={image}
                    alt="Question figure preview"
                    className="h-16 max-w-[160px] object-contain rounded border border-border bg-white"
                  />
                  <div className="flex flex-col gap-1">
                    <Button type="button" variant="outline" size="sm" onClick={() => imageInputRef.current?.click()}>
                      Replace
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-red-500 dark:text-red-400 hover:text-red-600 hover:bg-red-50 dark:bg-red-500/10 dark:hover:bg-red-500/10"
                      onClick={() => setImage(null)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ) : (
                <Button type="button" variant="outline" size="sm" onClick={() => imageInputRef.current?.click()}>
                  📎 Attach figure
                </Button>
              )}
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = ""; // allow re-picking the same file
                  if (f) void onImageFile(f);
                }}
              />
              <p className="text-[11px] text-muted-foreground/70">
                Drop an image here, use the file picker, or Ctrl+V paste · downscaled to 800px
              </p>
            </div>

            {editingId ? (
              <div className="flex items-center gap-3">
                <Button onClick={() => void saveEdit()} className="flex-1 bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-500 dark:hover:bg-emerald-600 dark:text-emerald-950">
                  Save changes
                </Button>
                <button
                  type="button"
                  className="text-xs text-muted-foreground/70 underline hover:text-muted-foreground"
                  onClick={resetForm}
                >
                  Cancel edit
                </button>
              </div>
            ) : (
              <Button onClick={addQuestion} className="w-full bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-500 dark:hover:bg-emerald-600 dark:text-emerald-950">
                Add to bank
              </Button>
            )}
          </div>
        </SectionCard>

        {/* list */}
        <SectionCard
          title="Bank"
          subtitle={`${filtered.length} shown`}
          className="lg:col-span-3"
        >
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-2 mb-4">
            <Select
              value={filterSubject}
              onValueChange={(v) => {
                setFilterSubject(v);
                setFilterChapter("all");
              }}
            >
              <SelectTrigger aria-label="Filter subject"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All subjects</SelectItem>
                {SUBJECTS.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterChapter} onValueChange={setFilterChapter}>
              <SelectTrigger aria-label="Filter chapter"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">All chapters</SelectItem>
                {chapterFilterOptions.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterTier} onValueChange={setFilterTier}>
              <SelectTrigger aria-label="Filter tier"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tiers</SelectItem>
                <SelectItem value="1">Tier 1</SelectItem>
                <SelectItem value="2">Tier 2</SelectItem>
                <SelectItem value="3">Tier 3</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterSource} onValueChange={setFilterSource}>
              <SelectTrigger aria-label="Filter source"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">All sources ({questions.length})</SelectItem>
                {sourceOptions.map((s) => (
                  <SelectItem key={s.name} value={s.name}>
                    {s.name} ({s.count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search text…"
            />
          </div>

          {filtered.length > 0 && nav ? (
            <div className="flex items-center justify-between p-2 mb-3 bg-muted/40 rounded-lg border border-border flex-wrap gap-2">
              <span className="text-xs text-muted-foreground">
                Filtered: <strong className="text-foreground">{filtered.length}</strong> question{filtered.length === 1 ? "" : "s"}
              </span>
              <Button
                size="sm"
                onClick={startTestWithFiltered}
                className="bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-500 dark:hover:bg-emerald-600 dark:text-emerald-950 text-xs h-7 gap-1.5"
              >
                🚀 Start CBT Test with these {filtered.length} Qs
              </Button>
            </div>
          ) : null}

          {filtered.length === 0 ? (
            <EmptyNote>
              No questions match. Add some on the left, or load the demo set from the Data tab.
            </EmptyNote>
          ) : (
            <ul className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
              {filtered.map((q) => {
                const tier = tierOf.get(`${q.subject}:${q.chapter}`);
                const usedBy = tests.filter((t) => t.question_ids?.includes(q.id)).length;
                return (
                  <li
                    key={q.id}
                    className={cn(
                      "border rounded-lg p-3 hover:bg-accent/50 transition-colors",
                      editingId === q.id ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-500/10/40" : "border-border"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                          <SubjectDot subject={q.subject} />
                          <span className="text-xs text-muted-foreground">{q.chapter}</span>
                          {tier ? <TierBadge tier={tier} /> : null}
                          {q.order !== undefined ? (
                            <Badge className="text-[10px] bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 font-mono">
                              Q{q.order}
                            </Badge>
                          ) : null}
                          <Badge variant="outline" className="text-[10px] border-border text-muted-foreground">
                            {q.type === "MCQ" ? "MCQ" : "NUM"}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground/70">{q.source}</span>
                          {usedBy > 0 ? (
                            <Badge variant="outline" className="text-[10px] border-border text-muted-foreground/70">
                              in {usedBy} test{usedBy > 1 ? "s" : ""}
                            </Badge>
                          ) : null}
                        </div>
                        <p className="text-sm text-foreground">{q.question}</p>
                        {q.type === "MCQ" ? (
                          <p className="text-xs text-muted-foreground mt-1">
                            Correct:{" "}
                            <span className="text-sage-700 dark:text-sage-400 font-medium">
                              {OPTION_LETTERS[q.answer as number]} · {q.options[q.answer as number]}
                            </span>
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground mt-1">
                            Answer:{" "}
                            <span className="text-sage-700 dark:text-sage-400 font-medium">
                              {q.answer as number}
                              {q.tolerance ? ` ± ${q.tolerance}` : " (exact)"}
                            </span>
                          </p>
                        )}
                        {q.image ? (
                          <img
                            src={q.image}
                            alt={`Figure for: ${q.question.slice(0, 60)}`}
                            className="mt-1.5 max-h-24 max-w-full object-contain rounded border border-border bg-white"
                          />
                        ) : null}
                      </div>
                      <div className="flex flex-col gap-1 shrink-0 items-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-muted-foreground hover:text-foreground hover:bg-accent"
                          onClick={() => startEdit(q)}
                        >
                          Edit
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-500 dark:text-red-400 hover:text-red-600 hover:bg-red-50 dark:bg-red-500/10 dark:hover:bg-red-500/10"
                            >
                              Delete
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete this question?</AlertDialogTitle>
                              <AlertDialogDescription>
                                {usedBy > 0 ? (
                                  <span className="font-medium text-amber-700 dark:text-amber-300">
                                    Used by {usedBy} saved test{usedBy > 1 ? "s" : ""} — deleting
                                    will affect their review.{" "}
                                  </span>
                                ) : null}
                                “{q.question.slice(0, 120)}
                                {q.question.length > 120 ? "…" : ""}” — this can&apos;t be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-red-600 text-white hover:bg-red-700"
                                onClick={() => {
                                  del("questions", q.id);
                                  if (editingId === q.id) resetForm();
                                  toast.success("Question deleted");
                                }}
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

// ─── JSON bulk import ────────────────────────────────────────────────────────
// Parsing/validation lives in lib/question-json.ts — one canonical validator
// shared with the Question Bank.

function JsonImportPanel({ onClose, nav }: { onClose: () => void; nav?: NavController }) {
  const [importing, setImporting] = useState(false);
  const [raw, setRaw] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [replaceExisting, setReplaceExisting] = useState(true);
  const parsed = useMemo(() => (raw.trim() ? parseQuestionsJson(raw) : null), [raw]);

  async function cleanOldQuestionsIfNeeded() {
    if (!replaceExisting || !parsed || parsed.ok.length === 0) return;
    const targetSrc = cleanSource(parsed.ok[0].source);
    const existing = await getAll("questions");
    const toDelete = existing.filter((q: Question) => cleanSource(q.source) === targetSrc);
    for (const item of toDelete) {
      await del("questions", item.id);
    }
  }

  async function importAndStart() {
    if (!parsed || parsed.ok.length === 0 || importing) return;
    setImporting(true);
    try {
      await cleanOldQuestionsIfNeeded();
      await bulkPut("questions", parsed.ok);
      toast.success(`Imported ${parsed.ok.length} questions in sequence — opening test setup...`);
      onClose();
      if (nav) {
        const firstSrc = parsed.ok[0]?.source ? cleanSource(parsed.ok[0].source) : "Imported Paper";
        const isCuet = firstSrc.toLowerCase().includes("cuet");
        nav.toTestCreate({
          questionIds: parsed.ok.map((q) => q.id),
          name: firstSrc,
          source: firstSrc,
          marksCorrect: isCuet ? 5 : 4,
          marksWrong: -1,
          durationMin: Math.max(15, Math.round(parsed.ok.length * (isCuet ? 0.9 : 1.2))),
        });
      }
    } catch {
      toast.error("Failed to import questions");
    } finally {
      setImporting(false);
    }
  }

  async function importAll() {
    if (!parsed || parsed.ok.length === 0 || importing) return;
    setImporting(true);
    try {
      await cleanOldQuestionsIfNeeded();
      await bulkPut("questions", parsed.ok);
      toast.success(`Imported ${parsed.ok.length} question${parsed.ok.length === 1 ? "" : "s"} in sequence`);
      onClose();
    } catch {
      toast.error("Failed to import questions");
    } finally {
      setImporting(false);
    }
  }

  return (
    <SectionCard
      title="Import questions from JSON"
      subtitle="bulk-add questions with answers — drop a .json file or paste the contents"
      action={
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="grid lg:grid-cols-2 gap-5">
        <div className="space-y-3">
          <FileDrop
            accept=".json,application/json,text/plain"
            label={fileName ? `Loaded: ${fileName}` : "Drop your .json file here — or click to browse"}
            hint="UTF-8 JSON, up to a few thousand questions"
            onFiles={async (files) => {
              const f = files[0];
              try {
                const text = await f.text();
                setRaw(text);
                setFileName(f.name);
              } catch {
                toast.error("Could not read that file");
              }
            }}
          />
          <Textarea
            value={raw}
            onChange={(e) => {
              setRaw(e.target.value);
              setFileName(null);
            }}
            rows={8}
            placeholder='…or paste JSON here — e.g. [{"subject":"Physics","chapter":"Kinematics","type":"MCQ","question":"…","options":["…"],"answer":1}]'
            className="font-mono text-xs"
            aria-label="Paste JSON"
          />
          {parsed ? (
            <div className="text-sm space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className="bg-sage-600 dark:bg-sage-500 hover:bg-sage-600 dark:hover:bg-sage-500 text-white dark:text-sage-950 border-0">
                  {parsed.ok.length} valid
                </Badge>
                {parsed.errors.length > 0 ? (
                  <Badge variant="outline" className="border-red-300 text-red-700 dark:border-red-500/40 dark:text-red-300">
                    {parsed.errors.length} skipped
                  </Badge>
                ) : null}
                {parsed.ok.length > 0 ? (
                <div className="p-2.5 rounded-lg border border-border/80 bg-muted/30 text-xs space-y-1.5">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="font-semibold text-foreground">File Sequence Preview:</span>
                    <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 font-medium">
                      Exact 1..${parsed.ok.length} sequence
                    </span>
                  </div>
                  <div className="text-[11px] text-foreground truncate">
                    <span className="font-medium text-muted-foreground">Q1:</span> {parsed.ok[0]?.question}
                  </div>
                  {parsed.ok.length > 1 ? (
                    <div className="text-[11px] text-muted-foreground truncate">
                      <span className="font-medium">Q{parsed.ok.length}:</span> {parsed.ok[parsed.ok.length - 1]?.question}
                    </div>
                  ) : null}
                  <label className="flex items-center gap-2 pt-1 text-[11px] text-muted-foreground cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={replaceExisting}
                      onChange={(e) => setReplaceExisting(e.target.checked)}
                      className="rounded border-border text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>Clean replace previous questions from this source</span>
                  </label>
                </div>
              ) : null}
              {parsed.ok.length > 0 ? (
                  <>
                    <Button size="sm" variant="outline" onClick={() => void importAll()} disabled={importing}>
                      Import {parsed.ok.length} question{parsed.ok.length === 1 ? "" : "s"}
                    </Button>
                    {nav ? (
                      <Button
                        size="sm"
                        onClick={() => void importAndStart()}
                        disabled={importing}
                        className="bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-500 dark:hover:bg-emerald-600 dark:text-emerald-950 font-medium"
                      >
                        🚀 Import &amp; Start CBT Test ({parsed.ok.length} Qs)
                      </Button>
                    ) : null}
                  </>
                ) : null}
              </div>
              {parsed.errors.length > 0 ? (
                <ul className="text-xs text-red-600 dark:text-red-400 space-y-0.5 max-h-28 overflow-y-auto">
                  {parsed.errors.slice(0, 8).map((e, i) => (
                    <li key={i}>
                      {e.row === 0 ? "—" : `row ${e.row}`} · {e.msg}
                    </li>
                  ))}
                  {parsed.errors.length > 8 ? <li>…and {parsed.errors.length - 8} more</li> : null}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-foreground">Expected JSON shape</span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                navigator.clipboard
                  .writeText(IMPORT_EXAMPLE)
                  .then(() => toast.success("Example copied"))
                  .catch(() => toast.error("Copy failed — select the text manually"));
              }}
            >
              Copy example
            </Button>
          </div>
          <pre className="text-[11px] leading-4 font-mono bg-muted/60 border border-border rounded-lg p-3 overflow-x-auto">
{IMPORT_EXAMPLE}
          </pre>
          <ul className="text-[11px] text-muted-foreground space-y-1">
            <li>
              <code className="font-mono text-foreground">subject</code> — &quot;Physics&quot; / &quot;Chemistry&quot; /
              &quot;Mathematics&quot; (math/maths also accepted) · <span className="text-foreground">required</span>
            </li>
            <li>
              <code className="font-mono text-foreground">chapter</code> — any text; syllabus names auto-link where they
              match · <span className="text-foreground">required</span>
            </li>
            <li>
              <code className="font-mono text-foreground">type</code> — &quot;MCQ&quot; or &quot;numerical&quot; ·{" "}
              <span className="text-foreground">required</span>
            </li>
            <li>
              <code className="font-mono text-foreground">question</code> — the question text ·{" "}
              <span className="text-foreground">required</span>
            </li>
            <li>
              <code className="font-mono text-foreground">options</code> — array of 2-6 strings (MCQ only; 4 is standard)
            </li>
            <li>
              <code className="font-mono text-foreground">answer</code> — MCQ: <span className="font-medium">0-based option index (A=0, B=1, C=2, D=3)</span>,
              or a letter &quot;A&quot;-&quot;D&quot;, or exact option text · numerical: the number
            </li>
            <li>
              <code className="font-mono text-foreground">tolerance</code> — numerical only, optional (default 0 = exact
              match)
            </li>
          </ul>
        </div>
      </div>
    </SectionCard>
  );
}
