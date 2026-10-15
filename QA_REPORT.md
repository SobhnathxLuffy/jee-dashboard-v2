# QA Report — jee-dashboard-v2 (Interactive Test Pass)

**Date:** 2026-10-15 · **Method:** Backup forensics + live browser automation (every nav tab exercised) · **Build:** Next.js 16.1.3 dev, DB v10

---

## 0. FIX STATUS (updated after the fix pass — all pushed to main)

| Bug | Status | Commit |
|---|---|---|
| 1. Double-submit destroys responses | ✅ **FIXED** — idempotency guard (re-submit of a saved test is a no-op) + atomic single-transaction submit; live 2-tab race re-test: **0 tombstones, data intact** | 2737e4e |
| 2. Auto-recovery fabricates rows over real data | ✅ **FIXED** — authoritative DB re-check before fabricating + `recovered` flag + warning toast | 2737e4e |
| 3. Non-atomic submit | ✅ **FIXED** — `submitTestRecord()` (delete+insert+record in one IDB tx) | 2737e4e |
| 4. No auto-tagging → empty retry queue | ✅ **FIXED** — submit-time auto-tag (C default, configurable in Settings) + automatic retry-queue enrollment + bulk "Tag all N wrong" in review; re-test: queue 4→7→11 without any manual tagging | 2737e4e, b6c7dfb |
| 5. Session cleared too late (resumable window) | ✅ **FIXED** — session cleared before confetti | 2737e4e |
| 6. Full Mocks mis-bucketed | ✅ **FIXED** — `full_mock` mapped to mock bucket (1.1h/24% → 4.3h/72%) | b6c7dfb |
| 7. Retries Cleared always 0 | ✅ **FIXED** — mastered items retained (stage 3 + mastered_at), counted weekly | b6c7dfb |
| 8. Ghost timelog on test delete | ✅ **FIXED** — `test-*` entry deleted with the test | b6c7dfb |
| 9. is_practice not persisted | ✅ **FIXED** — persisted on TestRecord | 2737e4e |
| 10. Submit button hidden behind header | ✅ **FIXED** — floating Submit FAB with live answered count | 2737e4e |
| 11. "Broad syllabus syllabus" dup text | ✅ **FIXED** (in TargetExamsCard where it lives) | b6c7dfb |
| 12. Toast off-by-one | ✅ **FIXED** — toast matches card numbering | b6c7dfb |
| 13. No feedback for queued items | ✅ **FIXED** — "N queued · next due DATE" line | b6c7dfb |
| 14. Unattempted rows `correct:false` | ✅ **FIXED** — tri-state `correct:null`; MARK IT self-mark now limited to key-later/recovered rows | 2737e4e, b6c7dfb |

**Also added:** per-question attempt classification (Perfect / Overtime / Wasted / Rushed / Skipped) with an ATTEMPT QUALITY summary card — the top-ranked missing feature from the competitor analysis. Cross-tab live sync via BroadcastChannel (useLive no longer tab-local — a second tab updating timelog/retry now refreshes the first instantly).

**Quality gates at final push:** `tsc --noEmit` 0 errors · 52/52 vitest tests (11 new) · `next build` green · all flows re-verified live in the browser (normal CBT, 2-tab race, fresh-profile backup import, PDF, external, timer, settings).

**Note on your lost Chemistry data:** the 50 real responses are unrecoverable — the backup's tombstones store only IDs, not payloads. The app now makes this class of loss impossible. Your score (61/250) survives on the test record; per-question answers for that one test cannot be reconstructed.

---

## 1. Verdict

The app **works in the happy path** — a clean, uninterrupted CBT taken in a single tab produces correct scores, full per-question review, working error tags and a functioning spaced-retry queue. **But the submit pipeline can silently destroy a completed test's data**, and the Results page then fabricates fake "unattempted" rows that masquerade as your real attempt. This is exactly what happened to the CUET Chemistry paper in the shipped backup, and it is reproduced and confirmed below.

---

## 2. Forensics of the lost Chemistry test (from your backup JSON)

| Time (UTC) | Event | Evidence |
|---|---|---|
| 06:01 | 50 Chem questions imported | question tombstones 05:59–06:00, `created_at` 06:01 |
| 07:10:44.004 | Test submitted — **score 61/250 computed** (13 correct +5, 4 wrong −1) | `tests[703ff8d7].created_at` |
| 07:10:44.030 | **50 real responses DELETED** (tombstoned) by a second, overlapping submit | 50 `responses:*` tombstones, +26 ms after record stamp |
| 07:35:54 | timelog backfill ran on Dashboard visit | `timelog.test-703ff8d7.updated_at` |
| 07:36:20 | Results auto-recovery fabricated 50 fake rows (all `selected:null`, `time_spent:56` = 47×60/50) | response `updated_at` identical ×50 |
| 07:39:13 | Backup exported (the broken state) | `_meta.exported_at` |

**Root cause chain (2 independent bugs):**

1. **Double-submit race (data destruction).** The active session lives in shared IndexedDB kv, so **two tabs** (or PWA + browser, or a resume after reload) can hold the *same* session. Both timers hit zero together → both auto-submit. Submit #2 starts with `delResponsesByTest()` — wiping submit #1's saved answers. Submit #2 then died before writing its own rows (tab closed during the multi-hundred-ms submit window) → **all 50 real responses gone forever**. Live reproduction with 2 tabs created 5 fresh tombstones exactly the same way.
2. **Results auto-recovery race (fake data).** When Results opened, `useLive("responses")` had *not yet loaded* (starts `[]`), while the tiny `tests` store had. The recovery guard `responses.some(...)` ran against an **empty-but-not-really-empty** array → it bulk-wrote 50 fabricated "unattempted" placeholder rows on top of the loss. Your dashboard then showed **0% accuracy, 0 attempted, no tagging possible, empty retry queue** — even though you scored 61.

---

## 3. What WORKS as expected (verified live)

- ✅ Backup import/export (291 items round-trip), JSON question import (4-question paper: type/tolerance/chapter/order preserved, merged 50→54)
- ✅ CBT creation: chapter/mixed/manual pick, marking schemes (+4/−1 …), duration, strict order toggle
- ✅ Player: NTA palette, per-question timing, keyboard shortcuts (1-4/Enter/←/M/C), mark-for-review, auto-submit at zero
- ✅ Scoring math: 2×4 − 2×1 = 6/20 exact; subject chips correct; negatives shown
- ✅ Results (normal flow): score ring, accuracy, attempt rate, per-question review (your answer vs key), time flags (⚡ Rushed), 10m struggle drill, C/F/A/R/T/G tagging → retry_queue rows created (verified in IndexedDB)
- ✅ PDF test: upload → page render → answer-key entry → player → scored results → key-later replace flow
- ✅ External log: full/subject mocks, per-question mistake tagging → "Enrolled 1 conceptual/formula mistakes" → retry queue
- ✅ Focus timer: 5-min start/pause/"Log Done" → timelog row; Today's Focus shows JEE 1h52m/6h correctly
- ✅ North-star counter increments on correct answers (21→23→24 live)
- ✅ Syllabus tracker (65 chapters, amber-first repair queue picked up Chemical Kinetics 50%)
- ✅ Notes, Question Bank CRUD, Papers library (PDF stored), tutorial, theme, PWA manifest, service worker
- ✅ `tsc --noEmit` clean; no console errors in any flow

## 4. What is BROKEN

| # | Severity | Bug | Proof |
|---|---|---|---|
| 1 | **CRITICAL** | Double-submit destroys responses (see §2.1) | 50 tombstones in your backup; 5 fresh ones in live 2-tab repro |
| 2 | **CRITICAL** | Results auto-recovery fabricates rows when responses store hasn't loaded (see §2.2); fallback stamps `subject:"Chemistry"` on every fake row | Your backup: all 50 rows with `time_spent:56`, `updated_at` identical |
| 3 | **CRITICAL** | Submit is non-atomic: delete → write → write are 3 separate IDB transactions; any interruption = half-written state | Code order in Player.tsx L409-411 |
| 4 | **HIGH** | No auto-tagging: retry queue fills only via manual per-question clicks; skip tagging → queue stays empty forever (your complaint) | Backup: `retry_queue: 0` despite 4 wrong + 46 unattempted |
| 5 | **HIGH** | Session cleared only *after* confetti dynamic-import + several awaits → reload in that window leaves a submitted test "resumable" → resume instantly re-submits (remaining ≤ 0 fires on mount) | App.tsx finishSession; Player auto-submit effect |
| 6 | **MED** | Weekly scorecard buckets `full_mock` activity into "Problems / CBT"; the two 60-min CUET mocks never appear under "Full Mocks" | Live: Full Mocks showed only 1.1 h from focus sessions |
| 7 | **MED** | "Retries Cleared" metric always 0 — mastered items are deleted at stage 3, never counted | retry.ts deletes at stage 3; scorecard filters stage ≥ 3 |
| 8 | **MED** | Deleting a test leaves its ghost `test-*` timelog entry inflating Today's Focus forever | ExternalLog.tsx del("tests") has no timelog cleanup |
| 9 | **MED** | `is_practice` not persisted on TestRecord (practice tests later scored/counted as graded) | Player.tsx record construction |
| 10 | **LOW** | Submit button overlaps/hidden behind north-star counter at ~1280 px | Screenshot 04-submit-covered.png |
| 11 | **LOW** | Dashboard: "Broad syllabus **syllabus** coverage" duplicated words | Dashboard target chips |
| 12 | **LOW** | SpacedRetryCard toast says "Advanced to stage N+2" (off-by-one vs card's "Stage N+1/3") | SpacedRetryCard.tsx |
| 13 | **LOW** | Freshly tagged items invisible until due tomorrow with zero feedback ("All clear" right after tagging) → feels broken | Dashboard after tagging |
| 14 | **LOW** | Unattempted rows stored with `correct:false` instead of `null` (tri-state pollution) | Player.tsx `let correct = false` |

## 5. Missing vs. leading JEE apps (Embibe / NTA Abhyas / Marks / Testbook)

Top feasible, local-first-friendly gaps (priority order):

1. **Attempt classification per question** (Perfect / Overtime / Wasted — Embibe's killer metric; derivable from existing `time_spent` data)
2. **Speed-vs-accuracy quadrant per chapter** ("fast but wrong" = concept gap, "slow but right" = speed drill)
3. **PYQ metadata layer** (year/exam/shift fields on questions + filters — content stays user-imported)
4. **Required-pace calculator** wired to exam countdown (chapters/week + mocks/week needed)
5. **Auto-tagging of wrong answers** into the retry loop ( closes the biggest loop gap)
6. Chapter weakness heatmap (accuracy × attempts × recency)

Deliberately avoided (per local-first philosophy): peer leaderboards, fake percentile predictions, video lectures, streak-shaming.

---

## 6. Fix plan (shipped in this branch)

- **F1** Atomic + idempotent submit: single-IDB-transaction submit; "already submitted" guard; session cleared *before* celebration; submitting flag in kv to make reload-during-submit safe
- **F2** Recovery-race gate: recovery only runs after the responses store is confirmed loaded; fake-row detection & skip; no more fabricated data on healthy tests
- **F3** Auto-tagging: wrong answers auto-tagged (default C) at submit with one-tap re-tag in review; bulk "tag all wrong" action; retry card shows "N queued for tomorrow" feedback
- **F4** Scorecard: map `full_mock` → Full Mocks bucket; count mastered retries via review history
- **F5** Ghost timelog cleanup on test delete; `is_practice` persisted; unattempted → `correct: null`
- **F6** UI: submit button z-order/overlap, duplicated text, toast off-by-one
- **F7** NEW: per-question attempt classification (Perfect / Overtime / Wasted) on Results
