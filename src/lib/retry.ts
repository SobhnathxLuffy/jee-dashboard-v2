// ─── Spaced Retry Queue Engine ─────────────────────────────────────────────
// Questions tagged C (Concept), F (Formula), or A (Accuracy) on wrong or
// unattempted questions are scheduled for spaced retries:
// Stage 0: due in 1 day (+1d)
// Stage 1: due in 3 days (+3d)
// Stage 2: due in 7 days (+7d)
// Stage 3+: Mastered / Cleared
import {
  addDays,
  RETRY_INTERVALS_DAYS,
  todayStr,
  type ErrorTag,
  type ResponseRecord,
  type RetryQueueItem,
} from "./types";
import { bulkPut, del, getAll, put } from "./idb";

export const RETRY_ELIGIBLE_TAGS: readonly ErrorTag[] = ["C", "F", "A"] as const;

export function isRetryEligible(r: ResponseRecord): boolean {
  if (!r.error_tag) return false;
  if (!RETRY_ELIGIBLE_TAGS.includes(r.error_tag)) return false;
  // Wrong or unattempted
  return r.correct === false || !r.attempted;
}

/**
 * Ensures any response tagged with C, F, or A that hasn't yet entered the retry
 * queue gets enrolled with stage 0 (due tomorrow).
 */
export async function syncResponseToRetryQueue(
  response: ResponseRecord,
  testDate: string
): Promise<void> {
  const id = `${response.test_id}:${response.question_id}`;
  const existing = await getAll("retry_queue");
  const prior = existing.find((x) => x.id === id);

  if (!isRetryEligible(response)) {
    // Retag-to-fixed: an R/T/G tag or a now-correct answer retires a stale
    // active queue item (mastered items are kept as history)
    if (prior && prior.stage < 3) await del("retry_queue", id);
    return;
  }

  if (prior) {
    // Re-tagging a question that was already mastered re-enrolls it from stage 0
    if (prior.stage >= 3) {
      await put("retry_queue", {
        ...prior,
        stage: 0,
        next_due: addDays(testDate || todayStr(), RETRY_INTERVALS_DAYS[0]),
        mastered_at: undefined,
      });
    }
    return;
  }

  const item: RetryQueueItem = {
    id,
    test_id: response.test_id,
    question_id: response.question_id,
    subject: response.subject,
    chapter: response.chapter,
    error_tag: response.error_tag!,
    stage: 0,
    next_due: addDays(testDate || todayStr(), RETRY_INTERVALS_DAYS[0]),
    created_at: Date.now(),
  };
  await put("retry_queue", item);
}

/**
 * Scan all responses and enroll any missing eligible C/F/A mistakes into retry queue.
 */
export async function syncAllMistakesToRetryQueue(
  responses: ResponseRecord[]
): Promise<number> {
  const existing = await getAll("retry_queue");
  const existingIds = new Set(existing.map((x) => x.id));
  const newItems: RetryQueueItem[] = [];

  for (const r of responses) {
    if (!isRetryEligible(r)) continue;
    const id = `${r.test_id}:${r.question_id}`;
    if (existingIds.has(id)) continue;

    newItems.push({
      id,
      test_id: r.test_id,
      question_id: r.question_id,
      subject: r.subject,
      chapter: r.chapter,
      error_tag: r.error_tag!,
      stage: 0,
      next_due: addDays(todayStr(), RETRY_INTERVALS_DAYS[0]),
      created_at: Date.now(),
    });
    existingIds.add(id);
  }

  if (newItems.length > 0) {
    await bulkPut("retry_queue", newItems);
  }
  return newItems.length;
}

/**
 * Advance or reset retry stage after a retry attempt.
 */
export async function recordRetryAttempt(
  itemId: string,
  isCorrect: boolean
): Promise<void> {
  const existing = await getAll("retry_queue");
  const item = existing.find((x) => x.id === itemId);
  if (!item) return;

  const today = todayStr();
  if (isCorrect) {
    const nextStage = item.stage + 1;
    if (nextStage >= 3) {
      // Completed all 3 spaced intervals (1d, 3d, 7d) -> Mastered! Retained with
      // next_due "" so it never shows due (WeeklyScorecard counts mastered_at).
      await put("retry_queue", {
        ...item,
        stage: 3,
        next_due: "",
        last_reviewed: today,
        mastered_at: today,
      });
    } else {
      const nextDays = RETRY_INTERVALS_DAYS[nextStage] ?? 7;
      await put("retry_queue", {
        ...item,
        stage: nextStage,
        next_due: addDays(today, nextDays),
        last_reviewed: today,
      });
    }
  } else {
    // Relapse -> reset to stage 0, due tomorrow
    await put("retry_queue", {
      ...item,
      stage: 0,
      next_due: addDays(today, RETRY_INTERVALS_DAYS[0]),
      last_reviewed: today,
    });
  }
}

export type RetryCardGroup =
  | {
      type: "drill";
      chapter: string;
      subject: string;
      items: RetryQueueItem[];
      questionIds: string[];
    }
  | {
      type: "item";
      item: RetryQueueItem;
    };

/**
 * Formats the due queue for the Dashboard:
 * 1. Filter items where next_due <= today (mastered items — stage 3 / next_due "" — are never due)
 * 2. Collapse chapters with >= 5 items into chapter drill groups
 * 3. Cap final list at 10-15 entries
 */
export function groupRetryQueueForDisplay(
  items: RetryQueueItem[],
  cap = 15
): {
  groups: RetryCardGroup[];
  totalDueCount: number;
} {
  const today = todayStr();
  const dueItems = items.filter(
    (x) => x.stage < 3 && x.next_due !== "" && x.next_due <= today
  );

  // Group by chapter
  const byChapter = new Map<string, RetryQueueItem[]>();
  for (const item of dueItems) {
    const key = `${item.subject}::${item.chapter}`;
    if (!byChapter.has(key)) byChapter.set(key, []);
    byChapter.get(key)!.push(item);
  }

  const groups: RetryCardGroup[] = [];
  const handledItemIds = new Set<string>();

  // 1. Chapters with >= 5 items collapse to drill
  for (const [key, chItems] of byChapter.entries()) {
    if (chItems.length >= 5) {
      const parts = key.split("::");
      const subject = parts[0] ?? "Physics";
      const chapter = parts[1] ?? "";
      groups.push({
        type: "drill",
        chapter,
        subject,
        items: chItems,
        questionIds: chItems.map((x) => x.question_id),
      });
      for (const it of chItems) {
        handledItemIds.add(it.id);
      }
    }
  }

  // 2. Remaining individual items
  for (const item of dueItems) {
    if (!handledItemIds.has(item.id)) {
      groups.push({
        type: "item",
        item,
      });
    }
  }

  return {
    groups: groups.slice(0, cap),
    totalDueCount: dueItems.length,
  };
}
