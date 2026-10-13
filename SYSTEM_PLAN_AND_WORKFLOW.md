# System Plan & Workflow Architecture

## 1. Initial State & Problem Statement

When work started on this repository, the application had rich foundations (CBT player, NTA scoring rules, PDF parsing, syllabus tracking), but had accumulated:
- Dead cloud-sync and mock authentication code.
- Unused AI chat and token usage trackers.
- Obsolete Google Calendar sync and mobile Android/Capacitor files.
- Lack of active learning loops (spaced repetition, blank-paper recall check, Feynman explain timers, and practice mode).
- No structured weekly review scorecard or difficulty/time trap detection.
- No empirical experiment tracking to test daily routines.

### Core Ground Rules
- Run `npx tsc --noEmit`, `npx eslint src`, and `npm run build` after each phase — all must pass with exit code 0.
- Make exactly one git commit per phase.
- Never rename or delete IndexedDB stores (preserve unused stores in schema so all existing user data survives). Bump DB version whenever adding stores.
- Export/import in the Data tab must keep working and include every new store.
- Every action takes at most 2 taps; no mandatory typing.
- Every number shown must point to an action.
- Content (derivations, formulas, solutions) stays on paper; app manages timers, self-ratings, and analytics.

---

## 2. Phase-by-Phase Execution Summary

### Phase 0: Architecture & Codebase Pruning
- **Cleaned**: Removed dead Cloud Sync UI, AI chat routes, Google Calendar sync, and Android artifacts.
- **Preserved**: All IndexedDB stores remained registered in `idb.ts` to ensure full backwards compatibility with existing backups.
- **Commit**: `b75284e`

### Phase 1: Time, Deadlines & Daily Anki Check-in
- **Database**: Bumped `DB_VERSION` to 7; added `timelog` and `anki_log` stores.
- **Exam Countdowns**: Nearest target exam countdown chip (`JEE Main: ~90d`) in `Header.tsx` with popover editor.
- **Focus Timer**: 50-minute Pomodoro timer, "Just 5 min" start button, and quick manual time logger.
- **Daily Time Allocation**: 5-category breakdown (`JEE`, `Money`, `Branding`, `Polymathy`, `Entertainment`) with streak tracking.
- **Anki Check-in**: 1-tap "Mark Done" daily flashcard check-in with minute buckets (`<15m`, `15–30m`, `30–45m`, `45m+`).
- **Backup Reminder**: Header warning badge if last JSON backup is older than 7 days.
- **Commit**: `5656e1c`

### Phase 2: The Learning Loop & Spaced Retries
- **Database**: Bumped `DB_VERSION` to 8; added `retry_queue` store with live count in `DataView.tsx`.
- **Spaced Repetition Engine** (`src/lib/retry.ts`):
  - Enrolls questions tagged with `C` (Concept gap), `F` (Formula recall), or `A` (Accuracy slip) during test review.
  - Interval ladder: Stage 0 (1 day) $\rightarrow$ Stage 1 (3 days) $\rightarrow$ Stage 2 (7 days) $\rightarrow$ Stage 3 (Mastered).
  - Relapses reset to Stage 0 on struggle.
  - Chapter Drill Clustering: $\ge 5$ errors in the same chapter trigger an urgent chapter drill badge.
- **Spaced Retry Card**: Placed on `Dashboard.tsx` with 1-tap "Start Due Retry" CBT session.
- **Recall Check & Explain Mode** (`RecallCheckModal.tsx`):
  - 5-minute blank-paper Recall Check timer with paper self-ratings.
  - 10-minute Explain Mode timer with Feynman stuck-point logging.
  - Wired into `Syllabus.tsx` rows and `Dashboard.tsx` revision due badges.
- **Coverage Pace Card** (`CoveragePaceCard.tsx`): Real-time pacing monitor on Syllabus tracking chapters/week needed vs. actual for Tier 1, 2, and 3 chapters.
- **Practice Mode**: Added toggle in `TestCreate.tsx` and `Player.tsx` header for instant answer reveal (+4 / -1 / 0) and step-by-step explanations.
- **Commit**: `3920af4`

### Phase 3: Weekly Review & Diagnostics
- **Weekly Scorecard** (`WeeklyScorecard.tsx`): Pinned to the top of `Performance.tsx`.
  - Planned vs. actual study hours.
  - 3-test rolling average percentage.
  - Week-over-week accuracy change ($\Delta\%$).
  - Anki 7-day consistency grid.
  - JEE activity allocation (`problems`, `new learning`, `recall`, `revision`, `mock`) and subject breakdown.
  - Top error tag diagnostic (`C`, `F`, `A`, `R`, `T`, `G`) with specific remedial guidance.
  - Top 3 wrong chapters with 1-tap test creation buttons.
- **Difficulty & Time Flags**:
  - `⏱️ Slow`: $>150$s MCQ / $>240$s Numerical.
  - `⚡ Rushed`: $<30$s wrong attempt.
  - `Struggle Trap`: $>180$s wrong attempt.
  - Displayed in `Performance.tsx` and `Results.tsx`.
- **Commit**: `bfa85c5`

### Phase 4: Chapter Types, Struggle Timer & Empirical Trials
- **Database**: Bumped `DB_VERSION` to 9; added `trials` store.
- **Chapter Types in Syllabus**:
  - Categorization into `Concepts` (violet), `Facts` (sky), and `Procedures` (amber).
  - 1-tap cycling badge in table and mobile cards.
- **10-Minute Struggle Drill** in `Results.tsx`:
  - Countdown timer for mistakes or unattempted questions.
  - Locks and masks the solution/key until paper attempt is completed.
  - Auto-logs focus time to `timelog`.
- **Controlled Experiments Card** (`ExperimentsCard.tsx`):
  - Enforces max 1 active study test, max 2 active skill trials (Polymathy).
  - Complete hypothesis tracking with duration, metric, and conclusive result line.
- **Commit**: `6ca29dd`

---

## 3. Daily User Workflow

```
[Start Day]
    │
    ▼
[Header & Dashboard]
    ├── Check exam countdown (JEE Main ~90d)
    ├── Tap Anki "Mark Done" (1 tap)
    └── View Spaced Retry Queue & Amber Queue
    │
    ▼
[Deep Work Session]
    ├── Tap ⏱️ -> Start 50m Focus Timer (or "Just 5 min")
    ├── Open New CBT / PDF Test (Practice Mode optional)
    └── Solve questions on paper; enter answers in player
    │
    ▼
[Test Review & Active Repair]
    ├── Open completed test in Review tab
    ├── Tag mistakes with C, F, or A (Auto-enrolled into Spaced Retry)
    └── For difficult mistakes: Tap "10m Struggle Drill" (locks key until solved on paper)
    │
    ▼
[Syllabus & Recall Drills]
    ├── Open Syllabus -> check Coverage Pace Card
    ├── Cycle Chapter Type (Concepts / Facts / Procedures)
    └── Tap "Recall" (5m blank-paper retrieval) or "Explain" (10m Feynman technique)
    │
    ▼
[Weekly Scorecard (Sunday)]
    ├── Open Performance tab -> Review Weekly Scorecard
    ├── Compare Planned vs Actual hours & 3-Test rolling average
    └── Check Top Error Tag Diagnostic & drill Top 3 Wrong Chapters
```
