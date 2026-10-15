# Worklog — jee-dashboard-v2

---
Task ID: qa-1
Agent: Super Z (main agent)
Task: Full interactive QA of jee-dashboard-v2 + root-cause forensics of user's lost chemistry test data

Work Log:
- Cloned repo, installed deps, `npx tsc --noEmit` clean, dev server on :3000
- Forensically analyzed `jee-study-backup-2026-10-15.json` (user's real data):
  - Chem test 703ff8d7: score 61/250 recorded, but all 50 responses have selected=null,
    attempted=false, time_spent=56 (= duration*60/N fabrication formula), identical updated_at
  - 50 response tombstones written at the EXACT submit second (+26ms after record.created_at)
  - Timeline: questions imported 06:01 UTC, submit 07:10:44 UTC, timelog backfill 07:35:54,
    fabricated responses 07:36:20, backup exported 07:39:13
- Root causes identified:
  1. Double-submit race: two tabs/resumed sessions share kv `active-test-session`; both auto-submit
     at timer zero; submit #2's delResponsesByTest wipes submit #1's rows; if #2 dies mid-flight
     (tab close/reload during confetti window) → total data loss
  2. Results.tsx auto-recovery race: useLive("responses") starts []; effect fires when tests store
     loaded but responses not yet → fabricates fake "unattempted" rows even when real rows exist
- Interactive QA (agent-browser): imported user backup (291 items) — reproduced 0% accuracy +
  "All clear" retry queue; created fresh JSON paper (4 Physics Qs) → import OK; full CBT flow →
  results/score/tags/retry-queue OK in normal flow; PDF test flow OK; external log + mistake
  enrollment OK; focus timer + timelog OK; performance/syllabus/notes OK
- Reproduced double-submit race live with 2 tabs: 5 fresh response tombstones created

Stage Summary:
- QA_REPORT.md written (working vs broken vs missing)
- Fixes queued: atomic+idempotent submit, recovery-race gate, auto-tagging,
  weekly-scorecard bucketing, ghost timelog, UI overlaps

---
Task ID: 4-a
Agent: full-stack-developer
Task: Implement 5 pre-verified QA bug fixes (retry queue mastery retention, WeeklyScorecard bucketing/counting, SpacedRetryCard UX, ghost timelog cleanup, duplicated phase text)

Work Log:
- Baseline: `npx tsc --noEmit` clean; `npx vitest run` 41/41 pass; working tree clean before edits
- src/lib/types.ts (allowed exception): added optional `mastered_at?: string` to `RetryQueueItem`
- src/lib/retry.ts:
  - `recordRetryAttempt()`: on `nextStage >= 3` no longer `del`etes — now `put`s stage 3, `next_due: ""`, `last_reviewed`, `mastered_at: today` (mastered history retained)
  - `syncResponseToRetryQueue()`: restructured. (a) Re-tag of a mastered item (stage >= 3) reactivates it: put stage 0, next_due = testDate+1d, `mastered_at: undefined`. (b) Non-eligible response (R/T/G tag or correct+attempted) now deletes a stale non-mastered queue item instead of early-returning; mastered items deliberately kept as history so the weekly "Retries Cleared" metric can't regress
  - `groupRetryQueueForDisplay()`: due filter now `stage < 3 && next_due !== "" && next_due <= today` (empty-string next_due used to compare as <= today and leak mastered items as due)
- src/components/jee/WeeklyScorecard.tsx: (a) activity bucketing maps `full_mock` → "mock"/Full Mocks bucket instead of falling into problems; (b) "Retries Cleared" counts `stage >= 3 && mastered_at` within the card's Mon–Sun window (weekStart..weekEnd, matching its existing week logic) instead of `last_reviewed` which was always 0
- src/components/jee/SpacedRetryCard.tsx: (a) empty state adds "N queued · next due YYYY-MM-DD" hint computed from non-mastered items (min next_due) when nothing is due; (b) toasts now use card numbering: `Advanced to Stage X/3 (due in Nd)` (X = item.stage+2 = new persisted stage+1, verified to match `Stage {stage+1}/3`), struggle → `Back to Stage 1/3 — due tomorrow`; mastered toast reworded ("Cleared from the retry loop") since items are retained; also hardened `startAllDueSession` due filter to exclude stage-3/"" next_due items
- src/components/jee/ExternalLog.tsx: test delete now also `void del("timelog", \`test-${t.id}\`)` so the auto-created timelog (logTestTime/syncTestsToTimelog) doesn't linger and inflate Today's Focus
- Fix 5 deviation: "Broad syllabus syllabus" duplication is NOT in Dashboard.tsx — the milestone-phase text lives in `getPhaseGuidance()` in TargetExamsCard.tsx (rendered by Dashboard.tsx at line 327). Fixed there: "Broad syllabus coverage & first passes. Prioritize Tier 1 chapters."; other phase strings (Consolidate / Mock-only / Done) checked — no duplication
- Verification: `npx tsc --noEmit` → 0 errors; `npx vitest run` → 41/41 pass (no test changes needed — no test asserted delete-on-master; cbt-tracking tests only cover `isRetryEligible`); eslint on touched files → 0 errors (21 pre-existing unused-import warnings)
- Changes left uncommitted in working tree; nothing pushed

Stage Summary:
- Mastered retry items are retained with mastered_at, never resurface as due, and re-enroll on re-tag; retag-to-fixed retires stale items
- WeeklyScorecard now buckets full_mock minutes and counts weekly Retries Cleared correctly
- SpacedRetryCard shows queued-upcoming hint and toast/card stage numbering agree
- External test deletion cleans up its ghost timelog; phase guidance text de-duplicated

---
Task ID: 4-b
Agent: full-stack-developer
Task: New UI features — attempt classification (pure helper + Results badges/stat/bulk-tag) and Mistake auto-tagging settings card

Work Log:
- Baseline: `npx tsc --noEmit` clean; working tree already carried parallel agent 4-a's edits (retry.ts, types.ts, WeeklyScorecard, SpacedRetryCard, ExternalLog, TargetExamsCard) — untouched
- src/lib/scoring.ts (append-only, nothing existing changed):
  - New export `type AttemptClass = "perfect" | "overtime" | "wasted" | "rushed" | "skipped" | "ungraded"`
  - New export `IDEAL_TIME = { MCQ: 150, numerical: 240 }` (matches README slow-trap thresholds)
  - New pure `classifyAttempt({ attempted, correct, timeSpent, type, isPractice? })` with documented precedence: practice → ungraded; !attempted → skipped; correct===null (attempted) → ungraded; correct && t<=ideal → perfect; correct && t>ideal → overtime; wrong && t<=30 → rushed; wrong otherwise → wasted (Embibe model: every non-rushed wrong is wasted regardless of speed; overtime is correct-only). Unknown type strings fall back to the MCQ ideal
  - Deliberate precedence decision: "skipped" checked BEFORE "ungraded" because Player submit writes `correct: null` for every skipped row (tri-state rule) — checking ungraded first would make "skipped" unobservable; "pending = ungraded" means attempted-but-awaiting-mark
- src/components/jee/Results.tsx (additions only; auto-recovery effect and all existing logic untouched):
  - Per-question review rows: classification badge rendered next to the time display via classifyAttempt — ✅ Perfect (emerald), 🐢 +Xm over ideal (amber, actual seconds over IDEAL_TIME), ❌ Wasted Xm (red, timeSpent), ⚡ Rushed Xm (purple), Skipped — (muted); "ungraded" renders nothing (existing "pending" badge covers it). Existing ⏱️ Slow / ⚡ Rushed / Struggle trap flags left as-is
  - Stats row: new "Attempt quality" StatCard (grid re-balanced grid-cols-2 → md:grid-cols-3 lg:grid-cols-6 for the 6th card) showing `P## / O## / W##` with hint "perfect / overtime / wasted"; computed in a new `quality` useMemo over `rows` (typed Record<AttemptClass, number>)
  - Bulk action "Tag all N wrong / skipped as C / F / A" under the untagged-prompt banner: new `mistakeRows` useMemo (rows where !attempted || correct===false, whole test, filters deliberately ignored) + `tagAllMistakes(tag)` which reuses the existing `tagResponse(r, tag)` per row (sequential, keeps retry-queue sync identical), skips rows already carrying that same tag, toasts "Tagged N mistakes" (or info when nothing left to tag)
- src/components/jee/SettingsDialog.tsx:
  - New "Mistake auto-tagging" section card below the tab panels, cloned from the Time Targets card pattern (p-3 border rounded-lg bg-card, text-xs title, text-[11px] sub-copy)
  - Switch "Auto-tag wrong & skipped questions" (default on via DEFAULT_AUTO_TAG) + Select for default tag (C - Concept gap / F - Formula recall / A - Accuracy slip)
  - Wired to existing getAutoTagConfig()/saveAutoTagConfig(): loads in its own effect on dialog open (existing tab-settings loader untouched), saves immediately on change with success toast "Mistake auto-tagging saved" (error toast on failure)
- tests/classify.test.ts (new): 11 cases / 10 blocks following tests/scoring.test.ts style — IDEAL_TIME thresholds, practice→ungraded, pending→ungraded, skipped-over-ungraded precedence (documented in-test), perfect boundary (=ideal), overtime boundary (ideal+1), numerical 240s boundary, rushed ≤30s boundary, wasted 31s..ideal and >ideal (never overtime), unknown-type MCQ fallback
- Verification: `npx tsc --noEmit` → 0 errors; `npx vitest run` → 7 files / 52 tests pass (incl. 11 new); `bun run lint` → 0 errors (pre-existing warnings only; none introduced)
- No npm dependencies added; changes left uncommitted in working tree; nothing pushed

Stage Summary:
- Every Results row now shows an Embibe-style attempt-quality classification next to its time, with the ideal-time thresholds shared via one pure helper (classifyAttempt/IDEAL_TIME) that future retry heuristics can reuse
- One-click "tag all mistakes as C/F/A" bulk fix + an ATTEMPT QUALITY P/O/W StatCard make error-tagging and time-quality visible at a glance
- Auto-tag at submit is now user-controllable (on/off + default tag) from Settings, persisted via the existing AutoTagConfig kv store
