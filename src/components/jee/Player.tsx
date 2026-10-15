"use client";

// ─── CBT / PDF test player — NTA palette, countdown, per-question timing ────
// Sprint B: keyboard shortcuts, Previous, NTA palette contrast, full-paper
// sections (paper numbering), PDF page nav/zoom/pins, timer stages,
// marksFor() scoring (bonus / multi-answer keys / tolerance) + key-later submit.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { EASE } from "./motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { ChevronLeft, ChevronRight, Minus, Plus, Pin, CheckCircle2, AlertCircle, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { clearSession, saveSession, useLive } from "@/lib/idb";
import { marksFor } from "@/lib/scoring";
import { getAutoTagConfig } from "@/lib/settings";
import {
  checkPdfAnswer,
  entryIsLetter,
  keyDisplay,
} from "@/lib/pdf-key";
import {
  ERROR_TAGS,
  SUBJECT_SHORT,
  todayStr,
  uid,
  type ActiveSession,
  type ErrorTag,
  type PdfSection,
  type Question,
  type ResponseRecord,
  type Subject,
  type TestRecord,
} from "@/lib/types";

const TAG_CLS: Record<ErrorTag, string> = {
  C: "bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 border-red-200 dark:border-red-500/30",
  F: "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30",
  A: "bg-orange-50 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-500/30",
  R: "bg-purple-50 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-500/30",
  T: "bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/30",
  G: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700",
};

const LETTERS = ["A", "B", "C", "D"];
const ZOOM_STEPS = [1.0, 1.4, 1.8, 2.2]; // − / + cycle through these (default 1.6)

type SlotInfo = {
  slot: string; // question id (cbt) or position "1".."N" (pdf) — answers/marked/q_times key
  no: number; // displayed number (cbt: position; pdf: paper number, e.g. 21..36)
  subject: Subject;
  chapter?: string; // pdf: owning section's chapter
};

/** A slot as submit needs it: persisted key + paper number + section identity. */
type SubmitSlot = { key: string; paperNo: number; subject: Subject; chapter: string };

/** pdf_meta.sections (always present after import/idb normalization); synthesize defensively. */
function sectionsOf(meta: NonNullable<ActiveSession["pdf_meta"]>): PdfSection[] {
  if (meta.sections && meta.sections.length > 0) return meta.sections;
  const firstQ = meta.first_q ?? 1;
  return [
    {
      subject: meta.subject,
      chapter: meta.chapter,
      first_q: firstQ,
      last_q: firstQ + meta.total_questions - 1,
      start_page: meta.start_page,
      end_page: meta.end_page,
    },
  ];
}

/** Paper-numbered slots from sections, in section order. key = persisted position "1".."N". */
function pdfSlotList(meta: NonNullable<ActiveSession["pdf_meta"]>): SubmitSlot[] {
  const out: SubmitSlot[] = [];
  for (const sec of sectionsOf(meta)) {
    for (let n = sec.first_q; n <= sec.last_q; n++) {
      out.push({ key: String(out.length + 1), paperNo: n, subject: sec.subject, chapter: sec.chapter });
    }
  }
  return out;
}

/** B4: pins win; else per-section even-split over the section's pages; else meta-level estimate. */
function pageForQuestion(s: ActiveSession, paperNo: number): number {
  const meta = s.pdf_meta;
  if (!meta) return 1;
  const pin = meta.page_pins?.[String(paperNo)];
  if (typeof pin === "number" && pin >= 1) return pin;
  const sec = sectionsOf(meta).find((x) => paperNo >= x.first_q && paperNo <= x.last_q);
  if (sec) {
    const pages = Math.max(1, sec.end_page - sec.start_page + 1);
    const perPage = Math.max(1, Math.ceil((sec.last_q - sec.first_q + 1) / pages));
    return sec.start_page + Math.floor((paperNo - sec.first_q) / perPage);
  }
  const pages = Math.max(1, meta.end_page - meta.start_page + 1);
  const perPage = Math.max(1, Math.ceil(Math.max(1, meta.total_questions) / pages));
  return meta.start_page + Math.floor((paperNo - (meta.first_q ?? 1)) / perPage);
}

// ── key-entry matching lives in @/lib/pdf-key (shared with PdfImport/Results) ─

function pdfKeyIsLetter(s: ActiveSession, paperNo: number): boolean {
  const entry = s.pdf_meta?.key.find((k) => k.no === paperNo);
  return entry !== undefined && entryIsLetter(entry);
}

export function PlayerView({
  session,
  pdfBlob,
  onPersist,
  onFinish,
}: {
  session: ActiveSession;
  pdfBlob: Blob | null;
  onPersist: (s: ActiveSession) => void;
  onFinish: (testId: string) => void;
}) {
  const questions = useLive("questions");
  const [now, setNow] = useState(Date.now());
  const [pdfPage, setPdfPage] = useState<HTMLCanvasElement | null>(null);
  const [pdfErr, setPdfErr] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [viewPage, setViewPage] = useState(1); // page currently shown in the panel
  const [pageInput, setPageInput] = useState("1");
  const [zoom, setZoom] = useState(1.6);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [isPracticeMode, setIsPracticeMode] = useState<boolean>(() => Boolean(session.is_practice));
  const submittingRef = useRef(false);
  const pdfDocRef = useRef<Awaited<ReturnType<typeof import("pdfjs-dist").getDocument>["promise"]> | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void; promise: Promise<unknown> } | null>(null);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const qMap = useMemo(
    () => new Map(questions.map((q) => [q.id, q] as const)),
    [questions]
  );

  const slots: SlotInfo[] = useMemo(() => {
    if (session.mode === "cbt") {
      const out: SlotInfo[] = [];
      let no = 1;
      for (const id of session.question_ids) {
        const q = qMap.get(id);
        out.push({ slot: id, no: no++, subject: q?.subject ?? "Physics" });
      }
      return out;
    }
    const meta = session.pdf_meta;
    if (!meta) return [];
    // B3: slots from sections — paper numbers first_q..last_q, subject/chapter per section
    return pdfSlotList(meta).map((sl) => ({
      slot: sl.key,
      no: sl.paperNo,
      subject: sl.subject,
      chapter: sl.chapter,
    }));
  }, [session, qMap]);

  const currentSlot = slots[Math.min(session.current, slots.length - 1)];

  // sections = subjects in order of appearance (P/C/M for full papers)
  const sections = useMemo(() => {
    const seen: Subject[] = [];
    for (const s of slots) {
      if (!seen.includes(s.subject)) seen.push(s.subject);
    }
    return seen;
  }, [slots]);

  const sectionRanges = useMemo(() => {
    return sections.map((subj) => {
      const idxs = slots.map((s, i) => (s.subject === subj ? i : -1)).filter((i) => i >= 0);
      return { subject: subj, start: idxs[0] ?? 0, end: idxs[idxs.length - 1] ?? 0 };
    });
  }, [sections, slots]);

  // ── timer ──
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const totalPausedMs =
    (session.total_paused_ms ?? 0) +
    (session.is_paused && session.paused_at ? now - session.paused_at : 0);
  const effectiveElapsedMs = Math.max(0, now - session.started_at - totalPausedMs);

  const remaining = Math.max(
    0,
    session.duration_min * 60 - effectiveElapsedMs / 1000
  );
  const mins = Math.floor(remaining / 60);
  const secs = Math.floor(remaining % 60);
  // B5 timer stages: ≤2 min red, ≤10 min amber, else normal
  const timeStage: "red" | "amber" | "normal" =
    remaining <= 120 ? "red" : remaining <= 600 ? "amber" : "normal";

  // ── per-question time accounting ──
  const commitTime = useCallback(
    (s: ActiveSession, nextIndex: number): ActiveSession => {
      const elapsed = (Date.now() - s.q_entered_at) / 1000;
      const curSlot = slots[s.current];
      const cur = curSlot ? curSlot.slot : (s.question_ids[s.current] ?? String(s.current + 1));
      return {
        ...s,
        q_times: { ...s.q_times, [cur]: (s.q_times[cur] ?? 0) + elapsed },
        current: nextIndex,
        q_entered_at: Date.now(),
      };
    },
    [slots]
  );

  const persist = useCallback(
    (s: ActiveSession) => {
      onPersist(s);
      void saveSession(s);
    },
    [onPersist]
  );

  const toggleTag = useCallback(
    (slot: string, tag: ErrorTag) => {
      const s = sessionRef.current;
      const currentTag = s.tags?.[slot];
      const newTag = currentTag === tag ? null : tag;
      persist({
        ...s,
        tags: { ...(s.tags ?? {}), [slot]: newTag },
      });
    },
    [persist]
  );

  const togglePause = useCallback(() => {
    const s = sessionRef.current;
    if (s.is_paused) {
      const addedPaused = s.paused_at ? Math.max(0, Date.now() - s.paused_at) : 0;
      persist({
        ...s,
        is_paused: false,
        paused_at: undefined,
        total_paused_ms: (s.total_paused_ms ?? 0) + addedPaused,
        q_entered_at: Date.now(),
      });
      toast.info("Test timer resumed");
    } else {
      const curSlot = slots[s.current];
      const cur = curSlot ? curSlot.slot : (s.question_ids[s.current] ?? String(s.current + 1));
      const elapsed = Math.max(0, (Date.now() - s.q_entered_at) / 1000);
      persist({
        ...s,
        is_paused: true,
        paused_at: Date.now(),
        q_times: { ...s.q_times, [cur]: (s.q_times[cur] ?? 0) + elapsed },
        q_entered_at: Date.now(),
      });
      toast.info("Test timer paused");
    }
  }, [persist, slots]);

  function goTo(index: number) {
    if (index < 0 || index >= slots.length) return;
    persist(commitTime(sessionRef.current, index));
  }

  function setAnswer(slot: string, value: number | string | null) {
    const s = sessionRef.current;
    persist({ ...s, answers: { ...s.answers, [slot]: value } });
  }

  function markAndNext() {
    const s = sessionRef.current;
    const curSlot = slots[s.current];
    const cur = curSlot ? curSlot.slot : (s.question_ids[s.current] ?? String(s.current + 1));
    const marked = s.marked.includes(cur) ? s.marked : [...s.marked, cur];
    const next = Math.min(s.current + 1, slots.length - 1);
    persist({ ...commitTime({ ...s, marked }, next), marked });
  }

  function saveAndNext() {
    const s = sessionRef.current;
    const next = Math.min(s.current + 1, slots.length - 1);
    persist(commitTime(s, next));
  }

  function clearResponse() {
    const s = sessionRef.current;
    if (!currentSlot) return;
    persist({
      ...s,
      answers: { ...s.answers, [currentSlot.slot]: null },
      marked: s.marked.filter((m) => m !== currentSlot.slot),
    });
  }

  // ── B1: keyboard shortcuts — one window handler, always-fresh via ref ──────
  const keyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyHandlerRef.current = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (
      t &&
      (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)
    ) {
      return;
    }
    // any open Radix dialog (submit confirm / abandon) owns the keyboard
    if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
    const s = sessionRef.current;
    if (!s) return;
    if (s.is_paused) {
      if (e.key === "p" || e.key === "P" || e.key === " ") {
        e.preventDefault();
        togglePause();
      }
      return;
    }
    if (e.key === "p" || e.key === "P") {
      e.preventDefault();
      togglePause();
      return;
    }
    const slot = currentSlot;
    if (!slot) return;
    const key = e.key;
    const isMcq =
      s.mode === "pdf" ? pdfKeyIsLetter(s, slot.no) : qMap.get(slot.slot)?.type === "MCQ";
    // 1-4 / a-d select the option (no auto-advance)
    if (isMcq && /^[1-4]$/.test(key)) {
      e.preventDefault();
      const i = Number(key) - 1;
      setAnswer(slot.slot, s.mode === "pdf" ? LETTERS[i] : i);
      return;
    }
    if (isMcq && /^[a-dA-D]$/.test(key)) {
      e.preventDefault();
      const i = key.toLowerCase().charCodeAt(0) - 97;
      setAnswer(slot.slot, s.mode === "pdf" ? LETTERS[i] : i);
      return;
    }
    if (key === "Enter") {
      e.preventDefault();
      saveAndNext();
      return;
    }
    if (key === "ArrowLeft") {
      e.preventDefault();
      goTo(s.current - 1);
      return;
    }
    if (key === "m" || key === "M") {
      e.preventDefault();
      markAndNext();
      return;
    }
    if (key === "c" || key === "C") {
      e.preventDefault();
      clearResponse();
      return;
    }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyHandlerRef.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  // ── submit ──
  const submit = useCallback(async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    const s = sessionRef.current;
    const idb = await import("@/lib/idb");

    // ── IDEMPOTENCY GUARD (data-destruction fix) ──
    // A second overlapping submit (two tabs on the same shared session, or a
    // resumed expired session after a reload) used to run
    // delResponsesByTest() and WIPE the first submit's saved answers — the
    // reported "CBT results empty, nothing tagged" bug. If this test record
    // already exists, the work is done: drop the stale session and open the
    // results instead of ever touching the saved rows.
    const alreadySaved = await idb.get("tests", s.test_id);
    if (alreadySaved) {
      await clearSession();
      onFinish(s.test_id);
      return;
    }

    // completion micro-interaction: one tasteful burst, brand palette
    // (research: canvas-confetti is the shipped ed-tech completion pattern)
    const celebrate = () => {
      import("canvas-confetti")
        .then(({ default: confetti }) => {
          confetti({
            particleCount: 90,
            spread: 70,
            startVelocity: 38,
            origin: { y: 0.7 },
            colors: ["#D97757", "#7C9A73", "#D4A27F", "#8B8577"],
          });
        })
        .catch(() => {});
    };
    // finalize last question's time
    const elapsed = s.is_paused ? 0 : (Date.now() - s.q_entered_at) / 1000;
    const curSlot = slots[s.current];
    const cur = curSlot ? curSlot.slot : (s.question_ids[s.current] ?? String(s.current + 1));
    const qTimes = { ...s.q_times, [cur]: (s.q_times[cur] ?? 0) + elapsed };

    const responses: ResponseRecord[] = [];
    let score = 0;
    const subjectScores: Record<Subject, number> = {
      Physics: 0,
      Chemistry: 0,
      Mathematics: 0,
    };

    if (s.mode === "cbt") {
      const allQs = await idb.getAll("questions");
      const fullQMap = new Map([...allQs.map((q) => [q.id, q] as const), ...qMap.entries()]);
      const scheme = { correct: s.marks_correct ?? 4, wrong: s.marks_wrong ?? -1 };
      // auto-tag config: wrong / skipped questions enter the spaced retry loop
      // automatically unless the user turned it off in Settings
      const autoTag = await getAutoTagConfig();
      let pos = 0;
      for (const id of s.question_ids) {
        pos += 1;
        const q = fullQMap.get(id);
        if (!q) continue;
        const raw = s.answers[id];
        const selected = raw === undefined || raw === "" || raw === null ? null : raw;
        const attempted = selected !== null;
        // tri-state: null = pending/none — unattempted rows must NOT read as
        // `correct: false` (that polluted accuracy & "wrong" filters)
        let correct: boolean | null = null;
        if (attempted) {
          if (q.type === "MCQ") correct = selected === q.answer;
          else {
            const u = Number(selected);
            correct =
              !Number.isNaN(u) &&
              Math.abs(u - Number(q.answer)) <= (q.tolerance || 0) + 1e-9;
          }
        }
        const marks = marksFor(attempted, correct, false, scheme);
        score += marks;
        subjectScores[q.subject] += marks;
        // Auto-tag: every wrong or skipped question gets the default error tag
        // (C by default) so the retry queue is populated without manual work.
        const isMistake = !attempted || correct === false;
        const userTag = s.tags?.[id] ?? null;
        const errorTag = userTag ?? (isMistake && autoTag.enabled && !s.is_practice ? autoTag.tag : null);
        responses.push({
          id: uid(),
          test_id: s.test_id,
          question_id: id,
          selected,
          correct,
          attempted,
          q_no: pos,
          time_spent: Math.round(qTimes[id] ?? 0),
          error_tag: errorTag,
          subject: q.subject,
          chapter: q.chapter,
          question_snippet: q.question.slice(0, 240),
          correct_answer: q.answer,
          type: q.type,
          options: q.options,
        });
      }
      const max = s.question_ids.length * scheme.correct;
      const record: TestRecord = {
        id: s.test_id,
        date: todayStr(),
        created_at: Date.now(),
        name: s.name,
        source: "in-app",
        type: s.test_type,
        duration_min: s.duration_min,
        score,
        max_score: max,
        subject_scores: subjectScores,
        question_ids: s.question_ids,
        marks_correct: scheme.correct,
        marks_wrong: scheme.wrong,
        is_practice: s.is_practice ?? false,
      };
      // ATOMIC write: delete-old + insert-new + record in ONE transaction —
      // a crash/tab-close mid-submit can no longer leave the test empty.
      await idb.submitTestRecord(s.test_id, responses, record);

      const { logTestTime } = await import("@/lib/timelog");
      const totalQSec = Object.values(qTimes).reduce((a, b) => a + (b || 0), 0);
      const elapsedMin = totalQSec > 30
        ? Math.max(1, Math.round(totalQSec / 60))
        : Math.max(1, Math.min(s.duration_min, Math.round((Date.now() - s.started_at) / 60000)));
      await logTestTime(
        s.test_id,
        s.name,
        elapsedMin,
        todayStr(),
        s.subject_order?.length === 1 ? s.subject_order[0] : undefined
      );

      // Enroll auto-tagged mistakes into the spaced retry queue right at
      // submit — the queue must fill even if the user never opens the review.
      try {
        const { syncAllMistakesToRetryQueue } = await import("@/lib/retry");
        await syncAllMistakesToRetryQueue(responses);
      } catch {
        // queue enrollment must never break a submitted test
      }

      // Finish FIRST (clears the persisted session + navigates to results),
      // confetti second — a reload during the celebration window can no longer
      // leave a submitted test looking "paused/resumable".
      onFinish(s.test_id);
      celebrate();
      return;
    }

    // PDF mode
    const meta = s.pdf_meta;
    if (!meta) {
      onFinish(s.test_id);
      return;
    }
    const scheme = { correct: s.marks_correct ?? 4, wrong: s.marks_wrong ?? -1 };
    const tol = meta.tolerance ?? 0;
    const keyLater = meta.key_later === true; // D4: no key → no scoring, self-mark in Results
    const keyByNo = new Map(meta.key.map((k) => [k.no, k] as const));

    for (const sl of pdfSlotList(meta)) {
      const raw = s.answers[sl.key];
      const selected =
        raw === undefined || raw === "" || raw === null ? null : String(raw);
      const attempted = selected !== null;
      const entry = keyByNo.get(sl.paperNo);
      const isBonus = entry?.bonus === true;
      let correct: boolean | null = null;
      if (!keyLater) {
        if (selected !== null && entry) {
          correct = checkPdfAnswer(entry, selected, tol);
        }
        // bonus (dropped question) counts as solved for everyone — persist it,
        // so review rows / retry candidates / analytics all agree with the score
        if (isBonus) correct = true; // bonus-fix-v2
        // bonus → +4 regardless (marksFor handles it); keyless-attempted → 0, never −1
        const marks = marksFor(attempted || isBonus, correct, isBonus, scheme);
        score += marks;
        subjectScores[sl.subject] += marks;
      }
      responses.push({
        id: uid(),
        test_id: s.test_id,
        question_id: `pdf:${s.test_id}:${sl.paperNo}`,
        selected: attempted ? selected : null,
        correct: keyLater ? null : correct,
        attempted,
        q_no: sl.paperNo,
        time_spent: Math.round(qTimes[sl.key] ?? 0),
        error_tag: s.tags?.[sl.key] ?? null,
        subject: sl.subject,
        chapter: sl.chapter,
        question_snippet: `PDF Q${sl.paperNo} (page ${pageForQuestion(s, sl.paperNo)})`,
        correct_answer: entry ? keyDisplay(entry) : "?",
        type: entry && entryIsLetter(entry) ? "MCQ" : "numerical",
        options: entry && entryIsLetter(entry) ? ["A", "B", "C", "D"] : [],
      });
    }
    const record: TestRecord = {
      id: s.test_id,
      date: todayStr(),
      created_at: Date.now(),
      name: s.name,
      source: "PDF",
      type: "pdf",
      duration_min: s.duration_min,
      score: keyLater ? null : score,
      max_score: meta.total_questions * scheme.correct,
      subject_scores: keyLater ? {} : subjectScores,
      pdf_meta: meta,
      marks_correct: scheme.correct,
      marks_wrong: scheme.wrong,
      is_practice: s.is_practice ?? false,
    };
    // ATOMIC write (same guarantee as the CBT branch)
    await idb.submitTestRecord(s.test_id, responses, record);

    const { logTestTime } = await import("@/lib/timelog");
    const totalQSec = Object.values(qTimes).reduce((a, b) => a + (b || 0), 0);
    const elapsedMin = totalQSec > 30
      ? Math.max(1, Math.round(totalQSec / 60))
      : Math.max(1, Math.min(s.duration_min, Math.round((Date.now() - s.started_at) / 60000)));
    await logTestTime(s.test_id, s.name, elapsedMin, todayStr());

    if (keyLater) {
      toast.info("Self-mark each question to compute your score.");
    }
    onFinish(s.test_id);
    celebrate();
  }, [qMap, onFinish, slots]);

  // auto-submit when the clock hits zero
  useEffect(() => {
    if (remaining <= 0 && !submittingRef.current && !session.is_paused) {
      void submit();
    }
  }, [remaining, submit, session.is_paused]);

  // warn before leaving with a live test
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, []);

  const curNo = currentSlot ? currentSlot.no : 1;

  // ── B4: the panel follows the question's page (pin-aware) ──
  useEffect(() => {
    setViewPage(pageForQuestion(sessionRef.current, curNo));
  }, [curNo, session.mode]);

  useEffect(() => {
    setPageInput(String(viewPage));
  }, [viewPage]);

  // ── pdf.js: load document once, render the viewed page at the chosen zoom ──
  useEffect(() => {
    let cancelled = false;
    if (session.mode !== "pdf" || !pdfBlob) {
      setPdfErr(session.mode === "pdf" ? "PDF file missing — discard the test and re-import." : null);
      return;
    }
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        if (!pdfDocRef.current) {
          const buf = await pdfBlob.arrayBuffer();
          pdfDocRef.current = await pdfjs.getDocument({ data: buf }).promise;
        }
        if (cancelled || !pdfDocRef.current) return;
        setNumPages(pdfDocRef.current.numPages);
        const pageNo = Math.min(Math.max(1, viewPage), pdfDocRef.current.numPages);
        const page = await pdfDocRef.current.getPage(pageNo);
        if (cancelled) return;
        const viewport = page.getViewport({ scale: zoom });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        renderTaskRef.current?.cancel();
        const task = page.render({ canvasContext: ctx, viewport });
        renderTaskRef.current = task;
        try {
          await task.promise;
        } catch (err) {
          if (cancelled) return; // superseded by a newer render — ignore
          throw err;
        }
        if (!cancelled) {
          setPdfPage(canvas);
          setPdfErr(null);
        }
      } catch (e) {
        if (!cancelled) setPdfErr(`PDF render failed: ${String(e)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session.mode, pdfBlob, viewPage, zoom]);

  if (slots.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">This test has no questions available.</p>
        <Button variant="outline" className="mt-4" onClick={() => onFinish("")}>
          Back
        </Button>
      </div>
    );
  }

  const curQ: Question | undefined =
    session.mode === "cbt" && currentSlot ? qMap.get(currentSlot.slot) : undefined;
  const selected = currentSlot ? session.answers[currentSlot.slot] : undefined;
  const isMarked = currentSlot ? session.marked.includes(currentSlot.slot) : false;
  const answeredCount = Object.values(session.answers).filter(
    (v) => v !== null && v !== undefined && v !== ""
  ).length;
  const keyLater = session.mode === "pdf" && session.pdf_meta?.key_later === true;
  const pinForCurrent = session.pdf_meta?.page_pins?.[String(curNo)];

  // active section derived from current question's subject
  const activeSection = currentSlot?.subject ?? sections[0];

  function sectionTabClick(subj: Subject) {
    const range = sectionRanges.find((r) => r.subject === subj);
    if (!range) return;
    // jump to the section's first unanswered question (its first question if all answered)
    let target = range.start;
    for (let i = range.start; i <= range.end; i++) {
      const a = slots[i] ? session.answers[slots[i].slot] : undefined;
      if (a === undefined || a === null || a === "") {
        target = i;
        break;
      }
    }
    goTo(target);
  }

  function commitPageJump() {
    const max = numPages ?? 1;
    const n = Math.round(Number(pageInput));
    if (!Number.isFinite(n) || n < 1) {
      setPageInput(String(viewPage));
      return;
    }
    setViewPage(Math.min(n, max));
  }

  function stepZoom(dir: 1 | -1) {
    setZoom((z) => {
      const sorted = [...ZOOM_STEPS].sort((a, b) => a - b);
      const next =
        dir > 0
          ? sorted.find((v) => v > z + 1e-9)
          : [...sorted].reverse().find((v) => v < z - 1e-9);
      return next ?? z;
    });
  }

  function pinCurrentPage() {
    const s = sessionRef.current;
    const meta = s.pdf_meta;
    if (!meta) return;
    const pins = { ...(meta.page_pins ?? {}) };
    pins[String(curNo)] = viewPage;
    persist({ ...s, pdf_meta: { ...meta, page_pins: pins } });
    toast.success(`Q${curNo} pinned to page ${viewPage}`);
  }

  return (
    <div className="space-y-4">
      {/* Floating submit — the in-header Submit scrolls behind the sticky app
          header on shorter viewports, which read as "can't submit". A compact
          always-reachable action keeps the exit one tap away. */}
      {!confirmOpen && !session.is_paused ? (
        <Button
          onClick={() => setConfirmOpen(true)}
          className="fixed bottom-4 right-4 z-40 shadow-lg bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-500 dark:hover:bg-emerald-600 dark:text-emerald-950"
          aria-label="Submit test"
        >
          <CheckCircle2 className="w-4 h-4 mr-1.5" aria-hidden="true" />
          Submit ({answeredCount}/{slots.length})
        </Button>
      ) : null}
      {/* header — the hairline under the clock drains away as time runs out */}
      <div
        className={cn(
          "bg-card card-shadow border rounded-xl px-4 pt-3 pb-3.5 flex items-center justify-between gap-3 flex-wrap relative overflow-hidden",
          timeStage === "red"
            ? "border-red-300 dark:border-red-500/40"
            : timeStage === "amber"
              ? "border-amber-300 dark:border-amber-500/40"
              : "border-border"
        )}
      >
        <div className="min-w-0">
          <div className="font-semibold text-foreground truncate">{session.name}</div>
          <div className="text-xs text-muted-foreground/70">
            {slots.length} questions ·{" "}
            {keyLater ? "key comes later — self-mark after submit" : "+4 / −1 / 0 · numericals included"}
          </div>
        </div>
        <div className="hidden md:block text-[11px] text-muted-foreground/70" aria-hidden="true">
          ⌨ 1-4 · Enter · ← · M · C
        </div>
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant={isPracticeMode ? "default" : "outline"}
            onClick={() => setIsPracticeMode(!isPracticeMode)}
            className={cn(
              "h-8 text-xs gap-1.5",
              isPracticeMode
                ? "bg-emerald-700 hover:bg-emerald-800 text-white dark:bg-emerald-600"
                : "text-muted-foreground"
            )}
          >
            <span className={cn("w-1.5 h-1.5 rounded-full", isPracticeMode ? "bg-white" : "bg-muted-foreground")} />
            Practice: {isPracticeMode ? "ON" : "OFF"}
          </Button>
          <div className="flex items-center gap-1.5">
            <div
              className={cn(
                "text-2xl font-black tabular-nums px-3.5 py-1.5 rounded-lg flex items-center gap-2",
                session.is_paused
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300 ring-2 ring-amber-400"
                  : timeStage === "red"
                    ? "bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400"
                    : timeStage === "amber"
                      ? "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                      : "bg-muted text-foreground"
              )}
              aria-live="polite"
            >
              {session.is_paused && <Pause className="w-4 h-4 animate-pulse shrink-0" />}
              <span>{String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}</span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={togglePause}
              className={cn(
                "h-10 px-3 gap-1.5 font-medium transition-colors",
                session.is_paused
                  ? "border-emerald-500 text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/15 hover:bg-emerald-100"
                  : "border-border text-foreground hover:bg-muted"
              )}
              title={session.is_paused ? "Resume test (or press P)" : "Pause test timer (or press P)"}
            >
              {session.is_paused ? (
                <>
                  <Play className="w-4 h-4 fill-current text-emerald-600 dark:text-emerald-400" />
                  <span>Resume</span>
                </>
              ) : (
                <>
                  <Pause className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <span>Pause</span>
                </>
              )}
            </Button>
          </div>
          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogTrigger asChild>
              <Button className="bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-500 dark:hover:bg-emerald-600 dark:text-emerald-950">Submit</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Submit test?</AlertDialogTitle>
                <AlertDialogDescription>
                  {answeredCount} answered · {slots.length - answeredCount} unattempted.{" "}
                  {keyLater
                    ? "There's no key yet — you'll self-mark every question in review."
                    : "After submit you tag every mistake — that's where the marks come back."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep solving</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-500 dark:hover:bg-emerald-600 dark:text-emerald-950"
                  onClick={() => void submit()}
                >
                  Submit &amp; analyze
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        {/* remaining-time bar — drains toward zero, recolors at the stages */}
        <div className="absolute inset-x-0 bottom-0 h-0.5" aria-hidden="true">
          <div
            className={cn(
              "h-full transition-[width] duration-500 ease-linear",
              timeStage === "red" ? "bg-red-500" : timeStage === "amber" ? "bg-amber-500" : "bg-sage-600 dark:bg-sage-500"
            )}
            style={{ width: `${Math.max(0, Math.min(100, (remaining / Math.max(1, session.duration_min * 60)) * 100))}%` }}
          />
        </div>
      </div>

      <div className="grid lg:grid-cols-4 gap-4">
        {/* main panel */}
        <div className="lg:col-span-3 bg-card border border-border card-shadow rounded-xl p-4 min-h-[420px] flex flex-col">
          {session.mode === "pdf" ? (
            <div className="flex-1 flex flex-col">
              <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="border-border text-muted-foreground">
                    PDF page {viewPage}
                    {numPages ? ` / ${numPages}` : ""}
                  </Badge>
                  {pinForCurrent ? (
                    <Badge variant="outline" className="border-purple-300 dark:border-purple-500/40 text-purple-700 dark:text-purple-300 gap-1">
                      <Pin className="w-3 h-3" aria-hidden="true" /> Q{curNo} → p{pinForCurrent}
                    </Badge>
                  ) : null}
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10 w-10 p-0"
                    onClick={() => setViewPage((v) => Math.max(1, v - 1))}
                    disabled={viewPage <= 1}
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Input
                    className="h-10 w-14 text-center"
                    value={pageInput}
                    onChange={(e) => setPageInput(e.target.value)}
                    onBlur={commitPageJump}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitPageJump();
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    inputMode="numeric"
                    aria-label="Jump to page"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10 w-10 p-0"
                    onClick={() => setViewPage((v) => Math.min(numPages ?? v + 1, v + 1))}
                    disabled={numPages !== null && viewPage >= numPages}
                    aria-label="Next page"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10 w-10 p-0"
                    onClick={() => stepZoom(-1)}
                    aria-label="Zoom out"
                  >
                    <Minus className="w-4 h-4" />
                  </Button>
                  <span
                    className="h-10 min-w-12 px-2 inline-flex items-center justify-center rounded-md border border-border bg-card text-xs font-medium tabular-nums text-muted-foreground"
                    aria-live="polite"
                  >
                    {zoom.toFixed(1)}×
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10 w-10 p-0"
                    onClick={() => stepZoom(1)}
                    aria-label="Zoom in"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10 px-3 gap-1.5"
                    onClick={pinCurrentPage}
                    aria-label={`Pin page ${viewPage} to question ${curNo}`}
                  >
                    <Pin className="w-4 h-4" aria-hidden="true" />
                    Pin Q{curNo} · p{viewPage}
                  </Button>
                </div>
              </div>
              {pdfErr ? (
                <div className="text-xs text-red-500 mb-2">{pdfErr}</div>
              ) : null}
              <div className="border border-border rounded-lg overflow-auto max-h-[420px] bg-muted">
                {pdfPage ? (
                  <canvas
                    className="w-full h-auto block"
                    ref={(node) => {
                      if (node && pdfPage) {
                        const ctx = node.getContext("2d");
                        if (ctx) {
                          node.width = pdfPage.width;
                          node.height = pdfPage.height;
                          ctx.drawImage(pdfPage, 0, 0);
                        }
                      }
                    }}
                  />
                ) : (
                  <div className="p-10 text-center text-sm text-muted-foreground/70">
                    {pdfErr ? pdfErr : "Rendering page…"}
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {session.mode === "pdf" && currentSlot ? (
            <div className="flex-1 flex flex-col mt-3">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-foreground">Q{currentSlot.no}</span>
                  <Badge variant="outline" className="text-[10px] border-border text-muted-foreground">
                    {pdfKeyIsLetter(session, currentSlot.no) ? "MCQ" : "NUMERICAL"}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] border-border text-muted-foreground">
                    {currentSlot.chapter ?? session.pdf_meta?.chapter}
                  </Badge>
                </div>
                <span className="text-xs text-muted-foreground/70">
                  time on this Q:{" "}
                  {Math.round(
                    (now - session.q_entered_at) / 1000 +
                      (session.q_times[currentSlot.slot] ?? 0)
                  )}
                  s
                </span>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Read the question from the paper above, then answer here:
              </p>
              {pdfKeyIsLetter(session, currentSlot.no) ? (
                <div className="flex gap-2">
                  {LETTERS.map((l) => (
                    <button
                      key={l}
                      onClick={() => setAnswer(currentSlot.slot, l)}
                      className={cn(
                        "press w-14 h-14 rounded-lg border text-lg font-bold transition-colors",
                        selected === l
                          ? "border-emerald-700 bg-emerald-50 text-emerald-800 dark:border-emerald-500 dark:bg-emerald-500/15 dark:text-emerald-300"
                          : "border-border hover:border-emerald-400 dark:hover:border-emerald-500 hover:bg-accent/50"
                      )}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="max-w-xs">
                  <p className="text-xs text-muted-foreground/70 mb-1.5">Your answer (number):</p>
                  <Input
                    value={typeof selected === "string" || typeof selected === "number" ? String(selected) : ""}
                    onChange={(e) => setAnswer(currentSlot.slot, e.target.value)}
                    inputMode="decimal"
                    placeholder="type the value"
                    aria-label="Your answer (number)"
                  />
                  <p className="text-[11px] text-muted-foreground/70 mt-2">
                    Numericals carry −1 for wrong entries — leave blank instead of guessing.
                  </p>
                </div>
              )}

              {isPracticeMode && selected !== null && selected !== undefined && selected !== "" && (() => {
                const keyEntry = session.pdf_meta?.key?.find((k) => k.no === currentSlot.no);
                if (!keyEntry) return null;
                const isCorrect = keyEntry.bonus || (typeof selected === "string" && (
                  (keyEntry.answers && keyEntry.answers.includes(selected.toUpperCase())) ||
                  keyEntry.answer.toUpperCase() === selected.toUpperCase() ||
                  (session.pdf_meta?.tolerance !== undefined &&
                    Math.abs(Number(selected) - Number(keyEntry.answer)) <= (session.pdf_meta.tolerance ?? 0))
                ));
                return (
                  <div className={cn(
                    "p-3 rounded-xl border mt-3 text-xs flex items-center gap-2 max-w-md",
                    isCorrect
                      ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/40 text-emerald-950 dark:text-emerald-200"
                      : "bg-red-50 dark:bg-red-500/10 border-red-300 dark:border-red-500/40 text-red-950 dark:text-red-200"
                  )}>
                    {isCorrect ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span className="font-bold">Correct! (+4)</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                        <span>Incorrect · Correct key is <strong>{keyEntry.answer || keyEntry.answers?.join(", ")}</strong></span>
                      </>
                    )}
                  </div>
                );
              })()}
            </div>
          ) : curQ ? (
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={session.current}
                initial={{ opacity: 0, x: 18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -14 }}
                transition={{ duration: 0.18, ease: EASE }}
                className="flex-1 flex flex-col"
              >
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-foreground">Q{currentSlot?.no}</span>
                    <Badge variant="outline" className="text-[10px] border-border text-muted-foreground">
                      {curQ.type === "numerical" ? "NUMERICAL" : "MCQ"}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] border-border text-muted-foreground">
                      {curQ.chapter}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground/70">
                    time on this Q: {Math.round(((now - session.q_entered_at) / 1000 + (session.q_times[currentSlot.slot] ?? 0)))}s
                  </span>
                </div>
                <p className="text-base text-foreground mb-5 leading-relaxed">{curQ.question}</p>

                {curQ.image ? (
                  <img
                    src={curQ.image}
                    alt={`Figure for question ${currentSlot?.no ?? ""}`}
                    className="max-h-64 rounded-lg border border-border bg-white mb-4"
                  />
                ) : null}

                {curQ.type === "MCQ" ? (
                  <div className="space-y-2">
                    {curQ.options.map((opt, i) => {
                      const isChosen = selected === i;
                      const isCorrect = Number(curQ.answer) === i;
                      const showPractice = isPracticeMode && selected !== null && selected !== undefined;
                      let extraBorder = "";
                      if (showPractice) {
                        if (isCorrect) {
                          extraBorder = "border-emerald-600 bg-emerald-50/80 dark:bg-emerald-500/20 text-emerald-950 dark:text-emerald-100 font-medium";
                        } else if (isChosen) {
                          extraBorder = "border-red-500 bg-red-50/80 dark:bg-red-500/20 text-red-950 dark:text-red-100 font-medium";
                        }
                      }
                      return (
                        <button
                          key={i}
                          onClick={() => setAnswer(currentSlot.slot, i)}
                          className={cn(
                            "press w-full text-left px-4 py-3 rounded-lg border text-sm transition-colors flex items-center gap-3",
                            extraBorder || (
                              selected === i
                                ? "border-emerald-700 bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-500/15 font-medium"
                                : "border-border hover:border-emerald-400 dark:hover:border-emerald-500 hover:bg-accent/50"
                            )
                          )}
                        >
                          <span
                            className={cn(
                              "w-6 h-6 rounded-full grid place-items-center text-xs font-bold border shrink-0",
                              showPractice && isCorrect
                                ? "bg-emerald-600 text-white border-emerald-600"
                                : showPractice && isChosen
                                  ? "bg-red-600 text-white border-red-600"
                                  : selected === i
                                    ? "bg-emerald-700 dark:bg-emerald-500 text-white dark:text-emerald-950 border-emerald-700 dark:border-emerald-500"
                                    : "border-border text-muted-foreground"
                            )}
                          >
                            {LETTERS[i]}
                          </span>
                          <span className="flex-1">{opt}</span>
                          {showPractice && isCorrect && (
                            <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">✓ Correct</span>
                          )}
                          {showPractice && isChosen && !isCorrect && (
                            <span className="text-[11px] font-semibold text-red-600 dark:text-red-400">✗ Incorrect</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="max-w-xs">
                    <p className="text-xs text-muted-foreground/70 mb-1.5">Your answer (number):</p>
                    <Input
                      value={typeof selected === "string" || typeof selected === "number" ? String(selected) : ""}
                      onChange={(e) => setAnswer(currentSlot.slot, e.target.value)}
                      inputMode="decimal"
                      placeholder="type the value"
                    />
                    <p className="text-[11px] text-muted-foreground/70 mt-2">
                      Exact match within the question&apos;s tolerance. Numericals carry −1 for wrong
                      entries — leave blank instead of guessing.
                    </p>
                  </div>
                )}

                {isPracticeMode && selected !== null && selected !== undefined && selected !== "" && (
                  <div
                    className={cn(
                      "p-3 rounded-xl border mt-4 text-xs space-y-2",
                      curQ.type === "MCQ"
                        ? Number(selected) === Number(curQ.answer)
                          ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/40 text-emerald-950 dark:text-emerald-200"
                          : "bg-red-50 dark:bg-red-500/10 border-red-300 dark:border-red-500/40 text-red-950 dark:text-red-200"
                        : Math.abs(Number(selected) - Number(curQ.answer)) <= (curQ.tolerance ?? 0)
                          ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/40 text-emerald-950 dark:text-emerald-200"
                          : "bg-red-50 dark:bg-red-500/10 border-red-300 dark:border-red-500/40 text-red-950 dark:text-red-200"
                    )}
                  >
                    <div className="flex items-center gap-2 font-bold">
                      {(curQ.type === "MCQ" ? Number(selected) === Number(curQ.answer) : Math.abs(Number(selected) - Number(curQ.answer)) <= (curQ.tolerance ?? 0)) ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <span>Correct (+4 marks)</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                          <span>
                            Incorrect (-1 mark) &middot; Correct Answer: {curQ.type === "MCQ" ? `Option ${LETTERS[Number(curQ.answer)] ?? curQ.answer}` : curQ.answer}
                          </span>
                        </>
                      )}
                    </div>
                    {curQ.explanation && (
                      <div className="pt-2 border-t border-current/15 text-[11px] leading-relaxed">
                        <span className="font-semibold block mb-0.5">Explanation:</span>
                        {curQ.explanation}
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          ) : (
            <div className="flex-1 grid place-items-center text-muted-foreground/70 text-sm">
              Question not found in the bank — it may have been deleted.
            </div>
          )}

          {/* In-test mistake / status tagging (applies to both CBT and PDF questions) */}
          {currentSlot && (
            <div className="flex items-center justify-between gap-2 pt-3 pb-1 border-t border-border/60 flex-wrap text-xs">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-semibold text-muted-foreground/80 uppercase tracking-wider">
                  Tag this Q:
                </span>
                <div className="flex items-center gap-1 flex-wrap">
                  {ERROR_TAGS.map((t) => {
                    const isSelected = session.tags?.[currentSlot.slot] === t.code;
                    return (
                      <button
                        key={t.code}
                        type="button"
                        onClick={() => toggleTag(currentSlot.slot, t.code)}
                        title={`${t.label}: ${t.hint}`}
                        className={cn(
                          "px-2 py-0.5 rounded text-[11px] font-semibold border transition-all cursor-pointer",
                          isSelected
                            ? TAG_CLS[t.code] + " ring-1 ring-offset-1 font-bold shadow-sm"
                            : "border-border text-muted-foreground hover:bg-muted"
                        )}
                      >
                        {t.code} · {t.label}
                      </button>
                    );
                  })}
                  {session.tags?.[currentSlot.slot] ? (
                    <button
                      type="button"
                      onClick={() => toggleTag(currentSlot.slot, session.tags![currentSlot.slot]!)}
                      className="text-[10px] text-muted-foreground/60 hover:text-muted-foreground underline ml-1"
                    >
                      clear
                    </button>
                  ) : null}
                </div>
              </div>
              {session.tags?.[currentSlot.slot] && (
                <span className="text-[11px] text-muted-foreground">
                  Tagged as <strong className="text-foreground">{session.tags[currentSlot.slot]} ({ERROR_TAGS.find((x) => x.code === session.tags![currentSlot.slot])?.label})</strong>
                </span>
              )}
            </div>
          )}

          {/* action bar */}
          <div className="flex flex-wrap gap-2 pt-4 mt-4 border-t border-border/60">
            <Button
              variant="ghost"
              size="sm"
              className="h-10 px-3"
              onClick={() => goTo(session.current - 1)}
              disabled={session.current <= 0}
              aria-label="Previous question"
            >
              ← Previous
            </Button>
            <Button variant="outline" size="sm" className="h-10 px-3" onClick={clearResponse}>
              Clear Response
            </Button>
            <div className="flex-1" />
            <Button
              variant="outline"
              size="sm"
              onClick={markAndNext}
              className="h-10 px-3 border-purple-300 dark:border-purple-500/40 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-500/10"
            >
              {isMarked ? "Marked ✓ ·" : "Mark for Review &"} Next
            </Button>
            <Button
              size="sm"
              onClick={saveAndNext}
              className="h-10 px-3 bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-500 dark:hover:bg-emerald-600 dark:text-emerald-950"
            >
              Save &amp; Next
            </Button>
          </div>
        </div>

        {/* Paused Overlay Modal */}
      {session.is_paused && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl p-6 sm:p-8 max-w-sm w-full shadow-2xl text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
              <Pause className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">Test Paused</h2>
              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                Timer and questions are paused. Take your break and press Resume when you are ready.
              </p>
            </div>
            <div className="text-3xl font-mono font-black tabular-nums py-2 text-foreground">
              {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
            </div>
            <Button
              size="lg"
              onClick={togglePause}
              className="w-full gap-2 bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-500 dark:hover:bg-emerald-600 dark:text-emerald-950 font-semibold text-base h-12"
            >
              <Play className="w-5 h-5 fill-current" /> Resume Test
            </Button>
          </div>
        </div>
      )}

      {/* palette rail */}
        <div className="bg-card border border-border card-shadow rounded-xl p-4">
          <div className="flex flex-wrap gap-1.5 mb-3">
            {sections.map((s) => {
              const count = slots.filter((x) => x.subject === s).length;
              return (
                <button
                  key={s}
                  onClick={() => sectionTabClick(s)}
                  className={cn(
                    "press px-3 py-1.5 rounded-md text-xs font-medium transition-colors min-h-[36px]",
                    activeSection === s
                      ? "bg-foreground text-background"
                      : "bg-muted text-muted-foreground hover:bg-accent"
                  )}
                >
                  {SUBJECT_SHORT[s]} ({count})
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-7 gap-1 mb-3 max-h-64 overflow-y-auto p-0.5 sm:gap-1.5">
            {slots.map((s, i) => {
              const ans = session.answers[s.slot];
              const answered = ans !== null && ans !== undefined && ans !== "";
              const marked = session.marked.includes(s.slot);
              const isCurrent = i === session.current;
              const tag = session.tags?.[s.slot];
              return (
                <button
                  key={s.slot}
                  onClick={() => goTo(i)}
                  className={cn(
                    "press h-10 w-10 sm:h-8 sm:w-8 rounded-md text-xs font-semibold border-2 transition-colors relative font-mono tabular-nums",
                    answered && marked
                      ? "bg-emerald-600 dark:bg-emerald-500 text-white dark:text-emerald-950 border-purple-600 dark:border-purple-400"
                      : answered
                        ? "bg-emerald-600 dark:bg-emerald-500 text-white dark:text-emerald-950 border-emerald-600 dark:border-emerald-500"
                        : marked
                          ? "bg-white dark:bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-600 dark:border-purple-400"
                          : "bg-white dark:bg-transparent text-stone-600 dark:text-muted-foreground border-stone-300 dark:border-border",
                    isCurrent && "ring-2 ring-amber-400 ring-offset-1 ring-offset-background"
                  )}
                  aria-label={`Question ${s.no}${answered ? ", answered" : ""}${marked ? ", marked" : ""}${tag ? `, tagged ${tag}` : ""}`}
                >
                  {s.no}
                  {tag ? (
                    <span
                      className={cn(
                        "absolute -top-1.5 -right-1 text-[8px] font-extrabold px-1 rounded shadow-sm border leading-none py-0.5",
                        TAG_CLS[tag]
                      )}
                    >
                      {tag}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="text-[11px] text-muted-foreground space-y-1.5 border-t border-border/60 pt-3">
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded bg-emerald-600 dark:bg-emerald-500 border-2 border-emerald-600 dark:border-emerald-500 inline-block" />{" "}
              Answered
            </div>
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded bg-white dark:bg-purple-500/15 border-2 border-purple-600 dark:border-purple-400 inline-block" />{" "}
              Marked for review
            </div>
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded bg-emerald-600 dark:bg-emerald-500 border-2 border-purple-600 dark:border-purple-400 inline-block" />{" "}
              Answered &amp; marked
            </div>
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded bg-white dark:bg-transparent border-2 border-stone-300 dark:border-border inline-block" /> Not
              answered
            </div>
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded bg-white dark:bg-transparent border-2 border-stone-300 dark:border-border ring-2 ring-amber-400 ring-offset-1 ring-offset-background inline-block" />{" "}
              Current
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-border/60 text-xs text-muted-foreground">
            <div className="flex justify-between">
              <span>Answered</span>
              <span className="font-semibold tabular-nums">{answeredCount}</span>
            </div>
            <div className="flex justify-between">
              <span>Marked</span>
              <span className="font-semibold tabular-nums">{session.marked.length}</span>
            </div>
          </div>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="w-full mt-3 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
              >
                Abandon test
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Abandon this test?</AlertDialogTitle>
                <AlertDialogDescription>
                  The attempt will be discarded. Nothing gets logged — no score, no tags.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep going</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-red-600 hover:bg-red-700"
                  onClick={() => onFinish("")}
                >
                  Abandon
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}
