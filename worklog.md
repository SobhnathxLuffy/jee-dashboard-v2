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
