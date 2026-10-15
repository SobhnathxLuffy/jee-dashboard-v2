"use client";

// ─── Test creation: pick chapters, source papers, or manual questions ──────
// Supports configurable marking schemes (JEE Main +4/-1, CUET +5/-1, BITSAT +3/-1,
// Adv, custom), test mode explanations, 1-click paper selection, and select-all.
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { NavController } from "./App";
import { EmptyNote, PageTitle, SectionCard, SubjectDot } from "./shared";
import { useLive } from "@/lib/idb";
import {
  SUBJECTS,
  uid,
  type ActiveSession,
  type Question,
  type Subject,
  type TestType,
} from "@/lib/types";
import { PRESET_MARKING_SCHEMES } from "@/lib/scoring";
import { cleanSource } from "./QuestionBank";
import { BookOpen, CheckSquare, Layers, Sparkles } from "lucide-react";

export interface TestCreatePrefill {
  subject?: string;
  chapter?: string;
  questionIds?: string[];
  name?: string;
  source?: string;
  marksCorrect?: number;
  marksWrong?: number;
  durationMin?: number;
}

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function normalizeChapter(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s*\(.*?\)/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function TestCreateView({
  nav,
  prefill,
}: {
  nav: NavController;
  prefill?: TestCreatePrefill;
}) {
  const questions = useLive("questions");
  const syllabus = useLive("syllabus");

  const [pickMode, setPickMode] = useState<"chapters" | "source" | "manual">(() => {
    if (prefill?.questionIds && prefill.questionIds.length > 0) return "manual";
    if (prefill?.source) return "source";
    return "chapters";
  });

  const [testType, setTestType] = useState<TestType>(() => {
    if (prefill?.name?.toLowerCase().includes("mock") || prefill?.source?.toLowerCase().includes("mock")) {
      return "full";
    }
    return "chapter";
  });

  const [name, setName] = useState(() => prefill?.name ?? "");
  const [duration, setDuration] = useState(() =>
    prefill?.durationMin
      ? String(prefill.durationMin)
      : prefill?.questionIds?.length
        ? String(Math.max(10, prefill.questionIds.length))
        : "10"
  );
  const [shuffle, setShuffle] = useState(false);
  const [isPractice, setIsPractice] = useState(false);

  // Marking scheme
  const [schemePreset, setSchemePreset] = useState<string>(() => {
    if (prefill?.marksCorrect === 5) return "cuet";
    if (prefill?.marksCorrect === 3) return "bitsat";
    if (
      prefill?.source?.toLowerCase().includes("cuet") ||
      prefill?.name?.toLowerCase().includes("cuet")
    ) {
      return "cuet";
    }
    return "jee-main";
  });
  const [marksCorrect, setMarksCorrect] = useState<string>(() => {
    if (prefill?.marksCorrect !== undefined) return String(prefill.marksCorrect);
    if (
      prefill?.source?.toLowerCase().includes("cuet") ||
      prefill?.name?.toLowerCase().includes("cuet")
    ) {
      return "5";
    }
    return "4";
  });
  const [marksWrong, setMarksWrong] = useState<string>(() => {
    if (prefill?.marksWrong !== undefined) return String(Math.abs(prefill.marksWrong));
    return "1";
  });

  function handleSchemePresetChange(presetId: string) {
    setSchemePreset(presetId);
    const p = PRESET_MARKING_SCHEMES.find((x) => x.id === presetId);
    if (p && presetId !== "custom") {
      setMarksCorrect(String(p.scheme.correct));
      setMarksWrong(String(Math.abs(p.scheme.wrong)));
    }
  }

  // Chapters mode
  const [activeSubject, setActiveSubject] = useState<Subject>(() => {
    const p = prefill?.subject as Subject | undefined;
    return p && SUBJECTS.includes(p) ? p : "Physics";
  });
  const [picked, setPicked] = useState<Record<Subject, string[]>>(() => {
    const init: Record<Subject, string[]> = {
      Physics: [],
      Chemistry: [],
      Mathematics: [],
    };
    const p = prefill?.subject as Subject | undefined;
    if (p && SUBJECTS.includes(p) && prefill?.chapter) init[p] = [prefill.chapter];
    return init;
  });
  const [perChapter, setPerChapter] = useState("5");
  const [allQuestionsInChapter, setAllQuestionsInChapter] = useState(false);

  // Source / Paper mode
  const [selectedSource, setSelectedSource] = useState<string | null>(() =>
    prefill?.source ? cleanSource(prefill.source) : null
  );

  // Manual mode
  const [selected, setSelected] = useState<string[]>(() => prefill?.questionIds ?? []);
  const [fSubject, setFSubject] = useState<string>("all");
  const [fChapter, setFChapter] = useState<string>("all");
  const [fSource, setFSource] = useState<string>("all");
  const [fSearch, setFSearch] = useState("");

  // All distinct chapters for subject (combines syllabus + bank questions to prevent missing items)
  const chaptersOf = useMemo(() => {
    const m = new Map<Subject, string[]>();
    for (const s of SUBJECTS) {
      const set = new Set<string>();
      for (const r of syllabus.filter((x) => x.subject === s)) {
        set.add(r.chapter);
      }
      for (const q of questions.filter((x) => x.subject === s)) {
        if (q.chapter) set.add(q.chapter);
      }
      m.set(s, Array.from(set));
    }
    return m;
  }, [syllabus, questions]);

  // Robust bank mapping with fuzzy normalization
  const bankByChapter = useMemo(() => {
    const m = new Map<string, Question[]>();
    for (const q of questions) {
      const exactKey = `${q.subject}::${q.chapter}`;
      if (!m.has(exactKey)) m.set(exactKey, []);
      m.get(exactKey)!.push(q);

      const normKey = `${q.subject}::norm::${normalizeChapter(q.chapter)}`;
      if (!m.has(normKey)) m.set(normKey, []);
      m.get(normKey)!.push(q);
    }
    return m;
  }, [questions]);

  // Papers / Sources list with question counts and subject info
  const sourcePapers = useMemo(() => {
    const map = new Map<
      string,
      { source: string; questions: Question[]; subjects: Set<Subject>; chapters: Set<string> }
    >();
    for (const q of questions) {
      const src = cleanSource(q.source);
      if (!map.has(src)) {
        map.set(src, {
          source: src,
          questions: [],
          subjects: new Set(),
          chapters: new Set(),
        });
      }
      const entry = map.get(src)!;
      entry.questions.push(q);
      entry.subjects.add(q.subject);
      entry.chapters.add(q.chapter);
    }
    return Array.from(map.values()).sort((a, b) => b.questions.length - a.questions.length);
  }, [questions]);

  /** The exact paper that "Start test" will run */
  const orderedIds = useMemo(() => {
    let ids: string[] = [];
    if (pickMode === "manual") {
      ids = [...selected];
    } else if (pickMode === "source") {
      if (selectedSource) {
        const paper = sourcePapers.find((p) => p.source === selectedSource);
        if (paper) ids = paper.questions.map((q) => q.id);
      }
    } else {
      for (const subj of SUBJECTS) {
        for (const ch of picked[subj]) {
          let pool = bankByChapter.get(`${subj}::${ch}`) ?? [];
          if (pool.length === 0) {
            pool = bankByChapter.get(`${subj}::norm::${normalizeChapter(ch)}`) ?? [];
          }
          if (pool.length === 0) {
            // broader match
            const normTarget = normalizeChapter(ch);
            pool = questions.filter(
              (q) =>
                q.subject === subj &&
                (normalizeChapter(q.chapter).includes(normTarget) ||
                  normTarget.includes(normalizeChapter(q.chapter)))
            );
          }
          const uniquePool = Array.from(new Set(pool.map((q) => q.id)))
            .map((id) => questions.find((q) => q.id === id)!)
            .filter(Boolean);

          const mcq = uniquePool.filter((q) => q.type === "MCQ");
          const num = uniquePool.filter((q) => q.type === "numerical");
          const mixed: Question[] = [];
          let i = 0;
          while (mixed.length < uniquePool.length) {
            if (i < mcq.length) mixed.push(mcq[i]);
            if (i < num.length) mixed.push(num[i]);
            i += 1;
            if (i > uniquePool.length) break;
          }
          const cap = allQuestionsInChapter ? mixed.length : Number(perChapter) || 5;
          ids.push(...mixed.slice(0, cap).map((q) => q.id));
        }
      }
    }

    // Order by subject P -> C -> M; shuffle (when on) mixes within subject
    const byIdMap = new Map(questions.map((q) => [q.id, q] as const));
    const ordered: string[] = [];
    for (const subj of SUBJECTS) {
      const group = ids.filter((id) => byIdMap.get(id)?.subject === subj);
      if (shuffle) shuffleInPlace(group);
      ordered.push(...group);
    }
    return ordered;
  }, [
    pickMode,
    selected,
    selectedSource,
    sourcePapers,
    picked,
    bankByChapter,
    questions,
    perChapter,
    allQuestionsInChapter,
    shuffle,
  ]);

  const totalPicked = orderedIds.length;
  const byId = useMemo(() => new Map(questions.map((q) => [q.id, q] as const)), [questions]);

  const suggestedDuration = useMemo(() => {
    if (testType === "full") return 180;
    const isCuet = schemePreset === "cuet" || name.toLowerCase().includes("cuet");
    const factor = isCuet ? 0.9 : 1.2;
    return Math.max(5, Math.round(totalPicked * factor));
  }, [testType, totalPicked, schemePreset, name]);

  function autoDuration() {
    setDuration(String(suggestedDuration));
    
  }

  // Filter pool for manual pick mode
  const manualPool = useMemo(() => {
    return questions
      .filter((q) => (fSubject === "all" ? true : q.subject === fSubject))
      .filter((q) => (fChapter === "all" ? true : q.chapter === fChapter))
      .filter((q) => (fSource === "all" ? true : cleanSource(q.source) === fSource))
      .filter((q) =>
        fSearch.trim() === ""
          ? true
          : q.question.toLowerCase().includes(fSearch.trim().toLowerCase())
      )
      .sort((a, b) => b.created_at - a.created_at);
  }, [questions, fSubject, fChapter, fSource, fSearch]);

  function selectAllFiltered() {
    const idsToAdd = manualPool.map((q) => q.id);
    setSelected((prev) => Array.from(new Set([...prev, ...idsToAdd])));
    toast.success(`Selected all ${idsToAdd.length} questions`);
  }

  function deselectAllFiltered() {
    const idsToRemove = new Set(manualPool.map((q) => q.id));
    setSelected((prev) => prev.filter((id) => !idsToRemove.has(id)));
    toast.info("Deselected filtered questions");
  }

  function pickSourcePaper(paper: (typeof sourcePapers)[0]) {
    setSelectedSource(paper.source);
    setName(paper.source.includes("Mock") ? paper.source : `${paper.source} Mock`);
    if (paper.source.toLowerCase().includes("cuet")) {
      handleSchemePresetChange("cuet");
      setDuration(String(Math.max(45, paper.questions.length)));
    } else {
      setDuration(String(Math.max(10, Math.round(paper.questions.length * 1.2))));
    }
    toast.success(`Selected paper: ${paper.source} (${paper.questions.length} Qs)`);
  }

  function toggleChapter(subj: Subject, ch: string) {
    setPicked((prev) => {
      const cur = prev[subj];
      const next = cur.includes(ch) ? cur.filter((c) => c !== ch) : [...cur, ch];
      return { ...prev, [subj]: next };
    });
  }

  function clearAllChapters() {
    setPicked({ Physics: [], Chemistry: [], Mathematics: [] });
  }

  function buildSession() {
    const ids = orderedIds;
    if (ids.length === 0) {
      toast.error("Pick at least one question or chapter");
      return;
    }
    const mins = Math.max(1, Number(duration) || suggestedDuration);
    const cVal = Math.max(1, Number(marksCorrect) || 4);
    const wVal = Math.max(0, Number(marksWrong) || 0);

    const session: ActiveSession = {
      key: "active",
      test_id: uid(),
      mode: "cbt",
      test_type: testType,
      name:
        name.trim() ||
        (testType === "full"
          ? "Full mock"
          : selectedSource
            ? `${selectedSource} Mock`
            : `${testType === "chapter" ? "Chapter test" : "Test"} — ${ids.length} Qs`),
      subject_order: [...SUBJECTS].filter((s) =>
        ids.some((id) => byId.get(id)?.subject === s)
      ),
      question_ids: ids,
      duration_min: mins,
      is_practice: isPractice,
      marks_correct: cVal,
      marks_wrong: -wVal,
      started_at: Date.now(),
      answers: {},
      marked: [],
      current: 0,
      q_times: {},
      q_entered_at: Date.now(),
    };
    nav.startSession(session);
  }

  const pickedChapters = useMemo(
    () => [...picked.Physics, ...picked.Chemistry, ...picked.Mathematics],
    [picked]
  );

  const [showPreview, setShowPreview] = useState(false);
  const previewCount = Math.min(10, orderedIds.length);

  return (
    <div data-tutorial="test-create" className="space-y-6">
      <PageTitle
        title="New CBT Test"
        subtitle="Chapter tests, full papers, or imported mocks. Timer and marking schemes are fully customizable."
      />

      {/* Test mode explainer cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        <div
          onClick={() => setTestType("chapter")}
          className={cn(
            "p-3 rounded-xl border cursor-pointer transition-all",
            testType === "chapter"
              ? "border-amber-500 bg-amber-50/60 dark:bg-amber-950/25 ring-1 ring-amber-500/40"
              : "border-border bg-card hover:border-border/80"
          )}
        >
          <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
            <span>📘</span> Chapter Test
          </div>
          <div className="text-[11px] text-muted-foreground mt-1 leading-snug">
            Focused drill on 1–2 specific chapters. Best for mastering high-weightage topics.
          </div>
        </div>

        <div
          onClick={() => setTestType("mixed")}
          className={cn(
            "p-3 rounded-xl border cursor-pointer transition-all",
            testType === "mixed"
              ? "border-blue-500 bg-blue-50/60 dark:bg-blue-950/25 ring-1 ring-blue-500/40"
              : "border-border bg-card hover:border-border/80"
          )}
        >
          <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
            <span>🔀</span> Mixed Test
          </div>
          <div className="text-[11px] text-muted-foreground mt-1 leading-snug">
            Cross-chapter revision combining selected topics across one or multiple subjects.
          </div>
        </div>

        <div
          onClick={() => setTestType("part")}
          className={cn(
            "p-3 rounded-xl border cursor-pointer transition-all",
            testType === "part"
              ? "border-purple-500 bg-purple-50/60 dark:bg-purple-950/25 ring-1 ring-purple-500/40"
              : "border-border bg-card hover:border-border/80"
          )}
        >
          <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
            <span>📑</span> Part Syllabus
          </div>
          <div className="text-[11px] text-muted-foreground mt-1 leading-snug">
            Tests over an entire unit or class (e.g. Mechanics, Organic Chem, 11th Syllabus).
          </div>
        </div>

        <div
          onClick={() => setTestType("full")}
          className={cn(
            "p-3 rounded-xl border cursor-pointer transition-all",
            testType === "full"
              ? "border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/25 ring-1 ring-emerald-500/40"
              : "border-border bg-card hover:border-border/80"
          )}
        >
          <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
            <span>⏱️</span> Full Mock
          </div>
          <div className="text-[11px] text-muted-foreground mt-1 leading-snug">
            Full 3-hour exam simulation (75 Qs PCM in JEE format or full paper).
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <SectionCard title="Test setup & rules">
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Test type</Label>
                <Select
                  value={testType}
                  onValueChange={(v) => setTestType(v as TestType)}
                >
                  <SelectTrigger aria-label="Test type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="chapter">📘 Chapter test</SelectItem>
                    <SelectItem value="mixed">🔀 Mixed test</SelectItem>
                    <SelectItem value="part">📑 Part-syllabus</SelectItem>
                    <SelectItem value="full">⏱️ Full mock</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">Test Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. CUET Chemistry Drill / Electrostatics Speed Test"
                />
              </div>
            </div>

            {/* Marking scheme row */}
            <div className="mt-4 pt-3 border-t border-border/60">
              <div className="grid sm:grid-cols-3 gap-3 items-end">
                <div className="space-y-1.5">
                  <Label className="text-xs">Marking Scheme</Label>
                  <Select
                    value={schemePreset}
                    onValueChange={handleSchemePresetChange}
                  >
                    <SelectTrigger aria-label="Marking scheme">
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

                <div className="space-y-1.5">
                  <Label className="text-xs">Correct Answer (+Marks)</Label>
                  <Input
                    type="number"
                    value={marksCorrect}
                    onChange={(e) => {
                      setMarksCorrect(e.target.value);
                      setSchemePreset("custom");
                    }}
                    min={1}
                    max={20}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Wrong Answer (−Penalty)</Label>
                  <Input
                    type="number"
                    value={marksWrong}
                    onChange={(e) => {
                      setMarksWrong(e.target.value);
                      setSchemePreset("custom");
                    }}
                    min={0}
                    max={10}
                  />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1.5">
                Current score rule:{" "}
                <span className="font-semibold text-foreground">
                  +{marksCorrect} for correct, −{marksWrong} for incorrect, 0 for unattempted.
                </span>{" "}
                Max score for this test:{" "}
                <span className="font-mono font-semibold text-foreground">
                  {totalPicked * (Number(marksCorrect) || 4)}
                </span>
                .
              </p>
            </div>

            {/* Duration row */}
            <div className="flex items-end gap-3 mt-4 pt-3 border-t border-border/60 flex-wrap">
              <div className="space-y-1.5 w-36">
                <Label className="text-xs">Duration (minutes)</Label>
                <Input
                  value={duration}
                  onChange={(e) => {
                    setDuration(e.target.value);
                    
                  }}
                  inputMode="numeric"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={autoDuration}
                className="mb-0.5 text-xs"
              >
                Suggest {suggestedDuration} min
              </Button>
              <p className="text-xs text-muted-foreground/70 mb-1.5">
                {testType === "full"
                  ? "Standard mock = 180 min (3 hours)"
                  : `Suggested ~${suggestedDuration} min based on ${totalPicked} questions`}
              </p>
            </div>

            <div className="flex items-center gap-6 mt-3 pt-2 flex-wrap">
              <label
                htmlFor="shuffle-ids"
                className="flex items-center gap-2 cursor-pointer select-none"
              >
                <Checkbox
                  id="shuffle-ids"
                  checked={shuffle}
                  onCheckedChange={(v) => setShuffle(v === true)}
                  className="h-4 w-4"
                />
                <span className="text-xs text-muted-foreground">
                  Shuffle within subject (order always stays P → C → M)
                </span>
              </label>

              <label
                htmlFor="practice-mode"
                className="flex items-center gap-2 cursor-pointer select-none"
              >
                <Checkbox
                  id="practice-mode"
                  checked={isPractice}
                  onCheckedChange={(v) => setIsPractice(v === true)}
                  className="h-4 w-4"
                />
                <span className="text-xs font-medium text-emerald-800 dark:text-emerald-300">
                  Practice Mode{" "}
                  <span className="text-[11px] font-normal text-muted-foreground">
                    (Instant answer reveal)
                  </span>
                </span>
              </label>
            </div>
          </SectionCard>

          {/* Mode Switcher Tabs */}
          <div className="flex items-center gap-2 border-b border-border pb-2 flex-wrap">
            <button
              onClick={() => setPickMode("chapters")}
              className={cn(
                "px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5",
                pickMode === "chapters"
                  ? "bg-emerald-700 text-white dark:bg-emerald-500 dark:text-emerald-950"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              )}
            >
              <BookOpen className="h-3.5 w-3.5" />
              By Chapters
            </button>

            <button
              onClick={() => setPickMode("source")}
              className={cn(
                "px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5",
                pickMode === "source"
                  ? "bg-emerald-700 text-white dark:bg-emerald-500 dark:text-emerald-950"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              )}
            >
              <Layers className="h-3.5 w-3.5" />
              By Paper / Source ({sourcePapers.length})
            </button>

            <button
              onClick={() => setPickMode("manual")}
              className={cn(
                "px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5",
                pickMode === "manual"
                  ? "bg-emerald-700 text-white dark:bg-emerald-500 dark:text-emerald-950"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              )}
            >
              <CheckSquare className="h-3.5 w-3.5" />
              Manual Pick ({selected.length} selected)
            </button>
          </div>

          {/* PICK BY CHAPTERS */}
          {pickMode === "chapters" ? (
            <SectionCard
              title="Pick chapters"
              subtitle={`${pickedChapters.length} chapter${pickedChapters.length === 1 ? "" : "s"} selected`}
              action={
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={allQuestionsInChapter}
                      onChange={(e) => setAllQuestionsInChapter(e.target.checked)}
                      className="rounded border-border text-emerald-600 focus:ring-emerald-500"
                    />
                    Include all questions in chapter
                  </label>

                  {!allQuestionsInChapter ? (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <span>Questions per chapter:</span>
                      <Input
                        value={perChapter}
                        onChange={(e) => setPerChapter(e.target.value)}
                        className="w-14 h-7 text-xs font-mono"
                        inputMode="numeric"
                      />
                    </div>
                  ) : null}

                  {pickedChapters.length > 0 ? (
                    <Button variant="ghost" size="sm" onClick={clearAllChapters} className="text-xs h-7">
                      Clear
                    </Button>
                  ) : null}
                </div>
              }
            >
              <div className="flex gap-2 mb-3">
                {SUBJECTS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setActiveSubject(s)}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-xs transition-colors",
                      activeSubject === s
                        ? "bg-emerald-700 dark:bg-emerald-500 text-white dark:text-emerald-950 font-medium"
                        : "bg-muted text-muted-foreground hover:bg-accent"
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 max-h-72 overflow-y-auto p-1">
                {(chaptersOf.get(activeSubject) ?? []).map((ch) => {
                  const on = picked[activeSubject].includes(ch);
                  let pool = bankByChapter.get(`${activeSubject}::${ch}`) ?? [];
                  if (pool.length === 0) {
                    pool = bankByChapter.get(`${activeSubject}::norm::${normalizeChapter(ch)}`) ?? [];
                  }
                  const count = pool.length;
                  return (
                    <button
                      key={ch}
                      onClick={() => toggleChapter(activeSubject, ch)}
                      disabled={count === 0 && !on}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-xs border transition-colors",
                        on
                          ? "bg-emerald-700 dark:bg-emerald-500 text-white dark:text-emerald-950 border-emerald-700 dark:border-emerald-500"
                          : count === 0
                            ? "border-border/60 text-muted-foreground/50 cursor-not-allowed"
                            : "border-border text-muted-foreground hover:border-emerald-500 dark:hover:border-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-400 bg-card"
                      )}
                    >
                      {ch} <span className="opacity-60 font-mono">({count})</span>
                    </button>
                  );
                })}
              </div>
              {pickedChapters.length > 0 ? (
                <div className="mt-3 pt-3 border-t border-border/60 flex flex-wrap gap-1.5">
                  {pickedChapters.map((ch) => (
                    <Badge
                      key={ch}
                      variant="outline"
                      className="border-emerald-300 dark:border-emerald-500/40 text-emerald-800 dark:text-emerald-300 text-xs"
                    >
                      {ch}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </SectionCard>
          ) : null}

          {/* PICK BY SOURCE / PAPER */}
          {pickMode === "source" ? (
            <SectionCard
              title="Pick by imported paper or source"
              subtitle="Select a whole test or imported JSON set in 1 click"
            >
              {sourcePapers.length === 0 ? (
                <EmptyNote>
                  No sources found in question bank. Import a JSON paper from the Question Bank tab first.
                </EmptyNote>
              ) : (
                <div className="grid sm:grid-cols-2 gap-3 max-h-80 overflow-y-auto pr-1">
                  {sourcePapers.map((paper) => {
                    const isSelected = selectedSource === paper.source;
                    const isCuet = paper.source.toLowerCase().includes("cuet");
                    return (
                      <div
                        key={paper.source}
                        onClick={() => pickSourcePaper(paper)}
                        className={cn(
                          "p-3.5 rounded-xl border text-left cursor-pointer transition-all hover:shadow-sm",
                          isSelected
                            ? "border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/20 ring-1 ring-emerald-500"
                            : "border-border bg-card hover:border-emerald-500/50"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-semibold text-xs text-foreground line-clamp-1">
                            {paper.source}
                          </h4>
                          <Badge
                            className={cn(
                              "text-[10px] font-mono shrink-0",
                              isSelected
                                ? "bg-emerald-600 text-white"
                                : "bg-muted text-muted-foreground"
                            )}
                          >
                            {paper.questions.length} Qs
                          </Badge>
                        </div>

                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          {Array.from(paper.subjects).map((subj) => (
                            <div key={subj} className="flex items-center gap-1">
                              <SubjectDot subject={subj} />
                              <span className="text-[10px] text-muted-foreground font-medium">
                                {subj}
                              </span>
                            </div>
                          ))}
                          {isCuet ? (
                            <Badge
                              variant="outline"
                              className="text-[9px] border-amber-400 text-amber-700 dark:text-amber-300"
                            >
                              +5/−1 Scheme
                            </Badge>
                          ) : null}
                        </div>

                        <div className="text-[11px] text-muted-foreground/80 mt-2 line-clamp-1">
                          {Array.from(paper.chapters).slice(0, 3).join(", ")}
                          {paper.chapters.size > 3 ? ` +${paper.chapters.size - 3} more` : ""}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </SectionCard>
          ) : null}

          {/* MANUAL PICK */}
          {pickMode === "manual" ? (
            <SectionCard
              title="Manual question selection"
              subtitle={`${selected.length} selected of ${questions.length} total`}
              action={
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={selectAllFiltered}
                    className="text-xs h-7"
                    disabled={manualPool.length === 0}
                  >
                    Select All Filtered ({manualPool.length})
                  </Button>
                  {selected.length > 0 ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={deselectAllFiltered}
                      className="text-xs h-7 text-muted-foreground hover:text-foreground"
                    >
                      Deselect
                    </Button>
                  ) : null}
                </div>
              }
            >
              <div className="grid sm:grid-cols-3 gap-2 mb-3">
                <Select
                  value={fSubject}
                  onValueChange={(v) => {
                    setFSubject(v);
                    setFChapter("all");
                  }}
                >
                  <SelectTrigger aria-label="Filter subject">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All subjects</SelectItem>
                    {SUBJECTS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={fSource} onValueChange={setFSource}>
                  <SelectTrigger aria-label="Filter source">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    <SelectItem value="all">All sources ({questions.length})</SelectItem>
                    {sourcePapers.map((s) => (
                      <SelectItem key={s.source} value={s.source}>
                        {s.source} ({s.questions.length})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Input
                  value={fSearch}
                  onChange={(e) => setFSearch(e.target.value)}
                  placeholder="Search question text…"
                />
              </div>

              {manualPool.length === 0 ? (
                <EmptyNote>No questions match filters.</EmptyNote>
              ) : (
                <ul className="max-h-80 overflow-y-auto space-y-1.5 pr-1">
                  {manualPool.map((q) => {
                    const on = selected.includes(q.id);
                    return (
                      <li key={q.id}>
                        <button
                          onClick={() =>
                            setSelected((prev) =>
                              on ? prev.filter((id) => id !== q.id) : [...prev, q.id]
                            )
                          }
                          className={cn(
                            "w-full text-left p-2.5 rounded-lg border text-xs transition-colors flex items-start gap-2.5",
                            on
                              ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-500 text-foreground"
                              : "bg-card border-border hover:border-emerald-300 text-muted-foreground"
                          )}
                        >
                          <Checkbox checked={on} className="mt-0.5 pointer-events-none" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap mb-1">
                              <SubjectDot subject={q.subject} />
                              <span className="font-medium text-foreground">{q.subject}</span>
                              <span className="text-muted-foreground">• {q.chapter}</span>
                              <Badge variant="outline" className="text-[9px] py-0">
                                {q.type}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground/70 truncate max-w-[140px]">
                                {cleanSource(q.source)}
                              </span>
                            </div>
                            <p className="line-clamp-2 text-foreground/90 font-mono text-[11px]">
                              {q.question}
                            </p>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </SectionCard>
          ) : null}
        </div>

        {/* SIDEBAR: SUMMARY & START BUTTON */}
        <div className="space-y-6">
          <SectionCard title="Paper summary">
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Questions selected:</span>
                <span className="font-mono font-bold text-sm text-foreground">
                  {totalPicked}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Test Duration:</span>
                <span className="font-mono font-semibold text-foreground">
                  {duration || suggestedDuration} min
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Marking Scheme:</span>
                <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                  +{marksCorrect} / −{marksWrong}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Max Marks:</span>
                <span className="font-mono font-bold text-foreground">
                  {totalPicked * (Number(marksCorrect) || 4)}
                </span>
              </div>

              <div className="pt-2 border-t border-border/60">
                <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  Subject breakdown
                </div>
                <div className="space-y-1.5">
                  {SUBJECTS.map((s) => {
                    const count = orderedIds.filter(
                      (id) => byId.get(id)?.subject === s
                    ).length;
                    return (
                      <div key={s} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <SubjectDot subject={s} />
                          <span>{s}</span>
                        </div>
                        <span className="font-mono text-muted-foreground">{count} Qs</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3">
                <Button
                  onClick={buildSession}
                  disabled={totalPicked === 0}
                  className="w-full bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-500 dark:hover:bg-emerald-600 dark:text-emerald-950 font-semibold py-5 text-sm gap-2"
                >
                  <Sparkles className="h-4 w-4" />
                  Start CBT Test ({totalPicked} Qs)
                </Button>
              </div>

              {totalPicked > 0 ? (
                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={() => setShowPreview((v) => !v)}
                    className="text-xs text-muted-foreground hover:text-foreground underline"
                  >
                    {showPreview ? "Hide preview" : `Preview first ${previewCount} questions`}
                  </button>
                </div>
              ) : null}
            </div>
          </SectionCard>

          {showPreview && totalPicked > 0 ? (
            <SectionCard title={`Paper Preview (${previewCount} of ${totalPicked})`}>
              <ul className="space-y-3 text-xs max-h-72 overflow-y-auto pr-1">
                {orderedIds.slice(0, previewCount).map((id, idx) => {
                  const q = byId.get(id);
                  if (!q) return null;
                  return (
                    <li key={id} className="border-b border-border/60 pb-2">
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1">
                        <span className="font-bold text-foreground">Q{idx + 1}.</span>
                        <SubjectDot subject={q.subject} />
                        <span>{q.subject}</span>
                        <span>• {q.chapter}</span>
                        <Badge variant="outline" className="text-[9px] py-0">
                          {q.type}
                        </Badge>
                      </div>
                      <p className="font-mono text-[11px] text-foreground/90 line-clamp-2">
                        {q.question}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </SectionCard>
          ) : null}
        </div>
      </div>
    </div>
  );
}
