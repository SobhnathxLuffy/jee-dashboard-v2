"use client";

// ─── App shell: navigation + north-star header + view switching ─────────────
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import { useTheme } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LayoutDashboard,
  FilePlus2,
  FileText,
  FolderOpen,
  ClipboardList,
  Library,
  ChartLine,
  ListTree,
  Database,
  Sun,
  Moon,
  Monitor,
  Check,
  Settings,
  BookMarked,
  type LucideIcon,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { PwaRegister } from "./PwaRegister";
import { TutorialOverlay, useTutorial } from "./Tutorial";
import { cn } from "@/lib/utils";
import { EASE } from "./motion";
import {
  clearSession,
  getAll,
  kvDel,
  kvGet,
  kvSet,
  loadSession,
  bulkPut,
  useDataVersion,
  useLive,
} from "@/lib/idb";
import { SYLLABUS_SEED } from "@/lib/syllabus-seed";
import type { ActiveSession, PaperRecord, TargetExam } from "@/lib/types";
import { todayStr } from "@/lib/types";
import { northStar } from "@/lib/analytics";
import { getTargetExams } from "@/lib/settings";
import { SettingsDialog } from "./SettingsDialog";

import { DashboardView } from "./Dashboard";
import { QuestionBankView } from "./QuestionBank";
import { TestCreateView, type TestCreatePrefill } from "./TestCreate";
import { PlayerView } from "./Player";
import { ResultsView } from "./Results";
import { PdfImportView } from "./PdfImport";
import { PapersView } from "./Papers";
import { PerformanceView } from "./Performance";
import { ExternalLogView } from "./ExternalLog";
import { SyllabusView } from "./Syllabus";
import { NotesView } from "./NotesView";
import { DataView } from "./DataView";
import { FocusTimerModal } from "./FocusTimer";
import { useFocusTimerChip, openFocusTimerModal, promptEndedFocusTimerOnMount } from "./useFocusTimer";

export type ViewName =
  | "dashboard"
  | "test"
  | "pdf"
  | "papers"
  | "external"
  | "bank"
  | "performance"
  | "syllabus"
  | "notes"
  | "data"
  | "player"
  | "results";

const NAV: { id: ViewName; label: string; icon: LucideIcon }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "test", label: "New CBT", icon: FilePlus2 },
  { id: "pdf", label: "PDF Test", icon: FileText },
  { id: "papers", label: "Papers", icon: FolderOpen },
  { id: "external", label: "Log External", icon: ClipboardList },
  { id: "bank", label: "Question Bank", icon: Library },
  { id: "performance", label: "Performance", icon: ChartLine },
  { id: "syllabus", label: "Syllabus", icon: ListTree },
  { id: "notes", label: "Notes", icon: BookMarked },
  { id: "data", label: "Data", icon: Database },
];

const NAV_GROUPS: ViewName[][] = [
  ["dashboard"],
  ["test", "pdf", "papers", "external"],
  ["bank", "performance", "syllabus", "notes"],
  ["data"],
];

// every legal view name — used to validate a restored deep link
const ALL_VIEWS: ViewName[] = [...NAV.map((n) => n.id), "player", "results"];

export interface NavController {
  go: (v: ViewName) => void;
  openResults: (testId: string) => void;
  toResults: (testId: string) => void;
  startSession: (s: ActiveSession, pdfBlob?: Blob | null) => void;
  /** open TestCreate with an optional subject/chapter preselected (action-linked analytics) */
  toTestCreate: (prefill?: TestCreatePrefill) => void;
  /** open PDF Test pre-loaded with a stored paper (no re-upload) */
  importPaper: (p: PaperRecord) => void;
}

export function AppRoot() {
  const [view, setView] = useState<ViewName>(() => {
    if (typeof window === "undefined") return "dashboard";
    const h = window.location.hash.replace(/^#/, "");
    return ALL_VIEWS.includes(h as ViewName) ? (h as ViewName) : "dashboard";
  });
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [resumable, setResumable] = useState<ActiveSession | null>(null);
  const [resultsTestId, setResultsTestId] = useState<string | null>(null);
  const [testPrefill, setTestPrefill] = useState<TestCreatePrefill | undefined>(undefined);
  const [paperForImport, setPaperForImport] = useState<PaperRecord | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [activePdfBlob, setActivePdfBlob] = useState<Blob | null>(null);

  const tests = useLive("tests");
  const responses = useLive("responses");
  const dataVersion = useDataVersion();

  // seed syllabus on very first open
  useEffect(() => {
    void (async () => {
      const seeded = await kvGet<string>("syllabus_seeded_v1");
      if (seeded) return;
      const existing = await getAll("syllabus");
      if (existing.length === 0) {
        await bulkPut("syllabus", SYLLABUS_SEED);
      }
      await kvSet("syllabus_seeded_v1", "true");
    })();
  }, []);

  // Tutorial: show on first launch (kv flag tutorial-seen-v1)
  const tutorial = useTutorial();
  const tutorialAutoStartedRef = useRef(false);
  useEffect(() => {
    if (tutorial.ready && tutorial.shouldShowOnLaunch && !tutorialAutoStartedRef.current) {
      tutorialAutoStartedRef.current = true;
      tutorial.start();
    }
  }, [tutorial.ready, tutorial.shouldShowOnLaunch, tutorial]);

  // Phase 3: on app open, if a stored focus timer already ended, ask the user
  // whether to log N minutes (capped at the target) or discard.
  useEffect(() => {
    promptEndedFocusTimerOnMount();
  }, []);

  // check for an active (in-progress) session to resume or discard
  useEffect(() => {
    void loadSession().then((s) => {
      if (s) setResumable(s);
    });
  }, [view]);

  // hash-based navigation so reload restores the active tab, and back button works
  const applyView = useCallback((next: ViewName) => {
    setView(next);
    const targetHash = `#${next}`;
    if (window.location.hash !== targetHash) {
      window.location.hash = targetHash;
    }
  }, []);

  useEffect(() => {
    const parse = (): ViewName => {
      const h = window.location.hash.replace(/^#/, "");
      return ALL_VIEWS.includes(h as ViewName) ? (h as ViewName) : "dashboard";
    };
    const onHash = () => setView(parse());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = useCallback(
    (v: ViewName) => {
      if (session && v !== "player") {
        toast.info("A test is in progress — switch back via 'Resume' banner anytime");
      }
      applyView(v);
    },
    [session, applyView]
  );

  const openResults = useCallback(
    (testId: string) => {
      setResultsTestId(testId);
      applyView("results");
    },
    [applyView]
  );

  const startSession = useCallback(
    (s: ActiveSession, pdfBlob?: Blob | null) => {
      setActivePdfBlob(pdfBlob ?? null);
      setSession(s);
      setResumable(null);
      applyView("player");
    },
    [applyView]
  );

  const resume = useCallback(() => {
    if (!resumable) return;
    setSession(resumable);
    setResumable(null);
    applyView("player");
  }, [resumable, applyView]);

  const discardSession = useCallback(async () => {
    await clearSession();
    await kvDel("active-test-paper-blob");
    setResumable(null);
    setSession(null);
    setActivePdfBlob(null);
    toast.success("Discarded unfinished test");
  }, []);

  const finishSession = useCallback(
    async (testId: string) => {
      // Clean up the persisted session + cached PDF blob so the "paused test"
      // banner can't reappear after submit. A resubmit must not duplicate responses.
      if (testId) {
        try {
          const { delResponsesByTest } = await import("@/lib/idb");
          await delResponsesByTest(testId);
        } catch {
          /* non-fatal — bulkPut below will still overwrite by id */
        }
      }
      await clearSession();
      await kvDel("active-test-paper-blob");
      setResumable(null);
      setActivePdfBlob(null);
      setSession(null);
      if (testId) openResults(testId);
    },
    [openResults]
  );

  const toTestCreate = useCallback(
    (p?: TestCreatePrefill) => {
      setTestPrefill(p);
      applyView("test");
    },
    [applyView]
  );

  const importPaper = useCallback(
    (p: PaperRecord) => {
      setPaperForImport(p);
      applyView("pdf");
    },
    [applyView]
  );

  const star = northStar(tests, responses);
  const nav: NavController = { go, openResults, toResults: openResults, startSession, toTestCreate, importPaper };

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen flex flex-col bg-background">
        <PwaRegister />
        <Toaster position="bottom-right" />
        <TutorialOverlay />
        <header className="bg-background/85 backdrop-blur-md border-b border-border sticky top-0 z-30">
          <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-primary text-primary-foreground grid place-items-center font-black text-sm shrink-0">
                JEE
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-foreground leading-tight truncate">JEE Study App</div>
                <div className="text-[11px] text-muted-foreground leading-tight truncate hidden sm:block">
                  local-first · all data stays yours
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1 shrink-0">
              <FocusTimerChip />
              <CountdownChip />
              <ThemeToggle />
              <HeaderSettingsButton />
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground font-medium hidden sm:block">
                  Correct under time
                </div>
                <div className="font-mono tabular-nums text-xl font-bold text-primary tracking-tight leading-none">
                  {star}
                </div>
              </div>
            </div>
          </div>
          <nav className="max-w-7xl mx-auto px-4 pb-2 flex gap-1 overflow-x-auto" aria-label="Main">
            {NAV_GROUPS.map((group, gi) => (
              <div key={gi} className="flex items-center gap-1">
                {gi > 0 ? <span className="mx-1.5 h-5 w-px bg-border shrink-0" aria-hidden="true" /> : null}
                {group.map((id) => {
                  const n = NAV.find((x) => x.id === id)!;
                  const Icon = n.icon;
                  const active = view === n.id;
                  return (
                    <button
                      key={n.id}
                      onClick={() => go(n.id)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "press relative px-2.5 py-1.5 rounded-full text-[13px] whitespace-nowrap flex items-center gap-1.5",
                        active
                          ? "text-primary-foreground font-medium"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground"
                      )}
                    >
                      {active ? (
                        <motion.span
                          layoutId="nav-pill"
                          className="absolute inset-0 rounded-full bg-primary"
                          transition={{ type: "spring", stiffness: 550, damping: 42 }}
                          aria-hidden="true"
                        />
                      ) : null}
                      <Icon
                        className={cn("relative z-10 w-3.5 h-3.5 shrink-0", active ? "opacity-100" : "opacity-70")}
                        strokeWidth={active ? 2 : 1.5}
                        aria-hidden="true"
                      />
                      <span className="relative z-10">{n.label}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
        </header>

        {resumable && !session ? (
          <div className="bg-amber-50 border-b border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/25">
            <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
              <div className="text-sm text-amber-800 dark:text-amber-300">
                <Badge className="bg-amber-500 hover:bg-amber-500 text-white border-0 mr-2">
                  paused test
                </Badge>
                “{resumable.name}” is still open — the clock never stopped.
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={resume} className="bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-500 dark:hover:bg-emerald-600 dark:text-emerald-950">
                  Resume
                </Button>
                <Button size="sm" variant="outline" onClick={() => setConfirmDiscard(true)}>
                  Discard
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        <main className="flex-1 w-full max-w-7xl mx-auto px-4 py-6">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: EASE }}
            >
              {view === "dashboard" ? <DashboardView nav={nav} /> : null}
              {view === "bank" ? <QuestionBankView nav={nav} /> : null}
              {view === "notes" ? <NotesView nav={nav} /> : null}
              {view === "test" ? (
                <TestCreateView
                  key={testPrefill ? `t-${testPrefill.subject}:${testPrefill.chapter}` : "t-blank"}
                  nav={nav}
                  prefill={testPrefill}
                />
              ) : null}
              {view === "player" && session ? (
                <PlayerView
                  session={session}
                  pdfBlob={activePdfBlob}
                  onPersist={setSession}
                  onFinish={finishSession}
                />
              ) : null}
              {view === "results" && resultsTestId ? (
                <ResultsView testId={resultsTestId} nav={nav} />
              ) : null}
              {view === "pdf" ? (
                <PdfImportView
                  key={paperForImport ? `pdf-${paperForImport.id}` : "pdf-blank"}
                  nav={nav}
                  initialPaper={paperForImport ?? undefined}
                />
              ) : null}
              {view === "papers" ? <PapersView nav={nav} /> : null}
              {view === "performance" ? <PerformanceView nav={nav} /> : null}
              {view === "external" ? <ExternalLogView nav={nav} /> : null}
              {view === "syllabus" ? <SyllabusView /> : null}
              {view === "data" ? <DataView /> : null}
            </motion.div>
          </AnimatePresence>
        </main>

        <footer className="mt-auto bg-card border-t border-border">
          <div className="max-w-7xl mx-auto px-4 py-3 text-[11px] text-muted-foreground/80 flex justify-between gap-2 flex-wrap">
            <span>
              The app follows the plan — never the reverse. Building stopped at MVP; studying wins.
            </span>
            <span>Every test logged &amp; tagged within 24h, or it didn&apos;t happen.</span>
          </div>
        </footer>

        <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Discard “{resumable?.name ?? "this test"}”?</AlertDialogTitle>
              <AlertDialogDescription>
                The timer will keep this attempt only as a record — answers are lost.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep solving</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 text-white hover:bg-red-700"
                onClick={() => {
                  setConfirmDiscard(false);
                  void discardSession();
                }}
              >
                Discard
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <FocusTimerModal />
      </div>
    </MotionConfig>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const current = mounted ? (theme ?? "system") : "system";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="press rounded-full border border-border bg-card p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          aria-label="Toggle theme"
        >
          <span className="relative block w-4 h-4">
            <Sun
              className="w-4 h-4 transition-all duration-300 rotate-0 scale-100 dark:-rotate-90 dark:scale-0"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <Moon
              className="absolute inset-0 w-4 h-4 transition-all duration-300 -rotate-90 scale-0 dark:rotate-0 dark:scale-100"
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        {([
          ["light", "Light", Sun],
          ["dark", "Dark", Moon],
          ["system", "System", Monitor],
        ] as const).map(([id, label, Icon]) => (
          <DropdownMenuItem key={id} onClick={() => setTheme(id)} className="gap-2">
            <Icon className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
            {label}
            {current === id ? <Check className="w-3.5 h-3.5 ml-auto text-primary" aria-hidden="true" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function HeaderSettingsButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-foreground"
        onClick={() => setOpen(true)}
        aria-label="Settings"
      >
        <Settings className="w-4 h-4" />
      </Button>
      <SettingsDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

function daysUntil(fromStr: string, toStr: string): number {
  const a = new Date(`${fromStr}T12:00:00`).getTime();
  const b = new Date(`${toStr}T12:00:00`).getTime();
  return Math.ceil((b - a) / 86400000);
}

function CountdownChip() {
  const [exams, setExams] = useState<TargetExam[]>([]);
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const dataVersion = useDataVersion();

  useEffect(() => {
    let alive = true;
    void getTargetExams().then((e) => {
      if (alive) setExams(e);
    });
    return () => {
      alive = false;
    };
  }, [dataVersion, settingsOpen]);

  const today = todayStr();
  const upcoming = exams
    .filter((e) => daysUntil(today, e.date) >= 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const nearest = upcoming[0] ?? exams[0];

  if (!nearest) return null;

  const n = daysUntil(today, nearest.date);
  const label =
    n > 0
      ? `${n}d · ${nearest.name}`
      : n === 0
        ? `0d · ${nearest.name} (Today!)`
        : `${-n}d ago · ${nearest.name}`;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            className="press rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors whitespace-nowrap tabular-nums hidden sm:inline-flex items-center gap-1.5"
            aria-label={`Exam countdown: ${label}. View and edit target exams.`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            {label}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-3" align="end">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-border pb-1.5">
              <span className="text-xs font-semibold text-foreground">Target Exams</span>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-1.5 text-[11px] text-primary"
                onClick={() => {
                  setOpen(false);
                  setSettingsOpen(true);
                }}
              >
                Manage all
              </Button>
            </div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {exams.map((e) => {
                const days = daysUntil(today, e.date);
                return (
                  <div
                    key={e.id}
                    className="flex items-center justify-between text-xs py-1 border-b border-border/50 last:border-0"
                  >
                    <span className="font-medium truncate pr-2 text-foreground">{e.name}</span>
                    <span className="font-mono text-[11px] text-muted-foreground shrink-0">
                      {days >= 0 ? `${days}d left` : `${-days}d ago`}
                    </span>
                  </div>
                );
              })}
            </div>
            <Button
              size="sm"
              variant="outline"
              className="w-full h-7 text-xs"
              onClick={() => {
                setOpen(false);
                setSettingsOpen(true);
              }}
            >
              Edit Dates &amp; Targets
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}

/**
 * Phase 3: header chip that shows `● MM:SS` while a focus timer is active
 * (running or paused). Re-syncs every second from the persisted kv state —
 * the same source the modal uses — so it cannot drift. Clicking it reopens
 * the FocusTimerModal.
 */
function FocusTimerChip() {
  const chip = useFocusTimerChip();
  if (!chip) return null;
  const mins = Math.floor(chip.remaining / 60);
  const secs = chip.remaining % 60;
  const label = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return (
    <button
      type="button"
      onClick={() => openFocusTimerModal(chip.mode)}
      className="press rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors whitespace-nowrap tabular-nums hidden sm:inline-flex items-center gap-1.5"
      aria-label={`Focus timer ${chip.paused ? "paused" : "running"}: ${label} remaining. Click to open.`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          chip.paused ? "bg-amber-500" : "bg-emerald-500 animate-pulse"
        }`}
      />
      <span className="font-mono">{label}</span>
    </button>
  );
}
