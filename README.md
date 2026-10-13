# JEE Study System — Correct Under Time

A local-first, distraction-free preparation console for JEE Main & Advanced. **All data lives inside your browser (IndexedDB)** — zero cloud dependencies, zero account lock-in, zero mandatory typing, and 100% offline capability.

---

## 🎯 Core Philosophy & Ground Rules

1. **Local-First & Private**: Data never leaves your machine. Your tests, mistake logs, study hours, and notes live in browser IndexedDB with single-click JSON backup and restore.
2. **Paper-First Content**: Problem derivations, solution workings, and detailed notes stay on paper. The app manages timing, pacing, spaced repetition intervals, and self-ratings.
3. **2-Tap Maximum Rule**: Every frequent action takes at most 2 taps. No mandatory typing during study sessions or reviews.
4. **Actionable Numbers**: Every metric displayed points directly to a remedial action (e.g. Amber chapters link directly to 1-tap test creation, top wrong chapters launch immediate drills).
5. **Deterministic Scoring (No AI Hallucination)**: Exact symbol and numerical matching (+4 / -1 / 0) with configurable tolerance.

---

## 🚀 Key Features by Phase

### Phase 1: Deadlines, Focus Timers & Daily Consistency
- **Exam Countdown Chips**: Real-time days remaining countdown for JEE Main Session 1, Session 2, and JEE Advanced.
- **50-Minute Focus Timer & "Just 5 Min" Converter**: Low-friction Pomodoro timer to beat inertia, plus quick manual time logger.
- **5-Category Life Tracking**: Daily study and life balance tracking across:
  - `JEE` (Focus target: 6h/day / 42h/week)
  - `Money`
  - `Branding`
  - `Polymathy` (3.5h/week target)
  - `Entertainment`
- **Anki Flashcard Check-In**: 1-tap "Mark Done" daily check-in with 7-day consistency tracking and streak counters.
- **Weekly Backup Reminder**: Automated visual prompt if your last JSON backup is older than 7 days.

### Phase 2: The Learning Loop & Spaced Retries
- **Coverage Pace Monitor**: Pinned to the top of the Syllabus; calculates required chapters/week vs. actual completion rate across Tier 1, 2, and 3 chapters.
- **5-Minute Blank-Paper Recall Check**: Active retrieval timer with 1-tap paper self-ratings:
  - `Little` (0–40%) $\rightarrow$ resets to Stage 0
  - `Some` (40–70%) $\rightarrow$ repeats stage
  - `Most` (70%+) $\rightarrow$ advances to next stage
- **10-Minute Feynman Explain Mode**: Timer for verbally explaining concepts or teaching them aloud, with stuck-point tracking.
- **Spaced Retry Queue (`retry_queue` store)**:
  - Automatically captures questions tagged with `C` (Concept gap), `F` (Formula recall), or `A` (Accuracy / slip).
  - Progressive review intervals: Stage 0 (1 day) $\rightarrow$ Stage 1 (3 days) $\rightarrow$ Stage 2 (7 days) $\rightarrow$ Stage 3 (Mastered).
  - Relapses reset to Stage 0 upon struggle.
  - **Chapter Drill Clustering**: When $\ge 5$ errors accumulate in a chapter, they collapse into an urgent "⚡ Drill Chapter" item on the dashboard.
- **Practice Mode**: Instant answer reveal (+4 / -1 / 0) with full step-by-step explanations in CBT MCQ, Numerical, and PDF modes.

### Phase 3: Weekly Review & Performance Diagnostics
- **Weekly Scorecard** (top of Performance tab):
  - **Planned vs. Actual Hours**: Weekly target vs. logged time with visual progress indicators.
  - **3-Test Rolling Average**: Moving average score % across the last 3 scored tests (with $\ge 70\%$ mastery gate indicator).
  - **Accuracy Change**: Week-over-week $\Delta\%$ improvement comparison.
  - **Anki 7-Day Consistency Grid**: Visual dot display of daily flashcard completion.
  - **JEE Activity Allocation**: Hours and percentage breakdown across *problems*, *new learning*, *recall*, *revision*, and *full mocks*.
  - **Top Error Tag Diagnostic**: Automatically identifies your dominant mistake mode (`C`, `F`, `A`, `R`, `T`, `G`) and gives an actionable remedial prescription.
  - **Top 3 Wrong Chapters**: Highlights highest-error chapters with 1-tap shortcut buttons to launch targeted tests.
- **Difficulty & Time Traps**:
  - `⏱️ Slow`: Flags questions taking $>150$s (MCQ) or $>240$s (Numerical).
  - `⚡ Rushed`: Flags careless errors answered in $<30$s.
  - `Struggle Trap`: Flags questions taking $>180$s that resulted in negative marks.

### Phase 4: Empirical Optimization & Skill Trials
- **Chapter Type Categorization**:
  - Tags chapters as **`Concepts`** (violet), **`Facts`** (sky), or **`Procedures`** (amber).
  - 1-tap cycling badge directly in the Syllabus table.
- **10-Minute Struggle Drill**:
  - Countdown timer on wrong or unattempted questions in test review.
  - Locks and masks the solution/answer key until the student attempts it on scrap paper for up to 10 minutes.
  - Auto-logs focus time to `timelog`.
- **Controlled Experiments Card (`trials` store)**:
  - Enforces scientific rigor on your daily routine: **Max 1 active study test** and **Max 2 active skill trials** (Polymathy).
  - Track hypotheses, duration (7, 14, 21, 30 days), target metrics, and conclusive results.

---

## 🏗️ Technology Stack

- **Framework**: Next.js 16 (App Router, Turbopack, Standalone output)
- **Language**: TypeScript (strict configuration)
- **UI & Styling**: Tailwind CSS v4, Radix UI primitives, Lucide React, Framer Motion
- **Charts**: Recharts
- **Storage**: Browser IndexedDB (Version 9) via direct native wrapper (`idb.ts`)
- **PDF Engine**: pdfjs-dist (client-side rendering for authentic CBT papers)

---

## 💾 IndexedDB Storage Architecture (DB_VERSION = 9)

| Store | Purpose | Sync / Backup |
|---|---|---|
| `questions` | Question bank items (MCQ & Numerical) | Included |
| `tests` | Completed & scheduled test sessions | Included |
| `responses` | Question-level responses, timings, and error tags | Included |
| `syllabus` | 65 chapters with tier, status, notes, and revision dates | Included |
| `formula` | Quick-reference formula notebook | Included |
| `daily_log` | Legacy log entries | Included |
| `tasks` | Quick todos and action items | Included |
| `cal_events` | Calendar milestones | Included |
| `papers` | Uploaded test paper PDFs (stored locally) | Included |
| `timelog` | Category study logs (JEE, Money, Branding, Polymathy, Entertainment) | Included |
| `anki_log` | Daily Anki flashcard check-ins and minute buckets | Included |
| `retry_queue` | Spaced repetition queue for C/F/A error correction | Included |
| `trials` | Controlled study & skill experiments | Included |
| `kv` | Settings, target exam dates, time targets, active session | Preserved |

---

## 🚦 Getting Started

### 1. Installation
```bash
npm install
```

### 2. Development Server
```bash
npm run dev
```

### 3. Production Build & Start
```bash
npm run build
npm start
```
Open **`http://localhost:3000`** (or `http://localhost:3002` if configured).

> **Important**: Always use `localhost` instead of `127.0.0.1`. IndexedDB is isolated per origin.

---

## 🧪 Quality Verification

This codebase enforces strict quality gates:
```bash
npx tsc --noEmit    # TypeScript check (0 errors)
npx eslint src      # ESLint check (0 errors, 0 warnings)
npm run build       # Next.js production build verification
```
