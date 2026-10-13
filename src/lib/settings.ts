import { kvGet, kvSet } from "./idb";
import type { AnkiLimits, TargetExam, TimeTargets } from "./types";

export const DEFAULT_TARGET_EXAMS: TargetExam[] = [
  { id: "jee-main-1", name: "JEE Main Session 1", date: "2027-01-24" },
  { id: "jee-main-2", name: "JEE Main Session 2", date: "2027-04-06" },
  { id: "jee-adv", name: "JEE Advanced", date: "2027-05-23" },
];

export const DEFAULT_TIME_TARGETS: TimeTargets = {
  jeeDailyMinutes: 360,
  moneyDailyMinutes: 120,
  brandingDailyMinutes: 60,
  polymathyWeeklyMinutes: 210,
};

export const DEFAULT_ANKI_LIMITS: AnkiLimits = {
  newCardsPerDay: 15,
  reviewCapMinutes: 20,
  reminderTime: "18:00",
};

export async function getTargetExams(): Promise<TargetExam[]> {
  try {
    const exams = await kvGet<TargetExam[]>("target-exams");
    if (Array.isArray(exams) && exams.length > 0) return exams;
    // fallback check for legacy target-exam-date key
    const legacy = await kvGet<string>("target-exam-date");
    if (legacy && /^\d{4}-\d{2}-\d{2}$/.test(legacy)) {
      return [{ id: "legacy-1", name: "Target Exam", date: legacy }];
    }
  } catch {
    // fallback to defaults
  }
  return DEFAULT_TARGET_EXAMS;
}

export async function saveTargetExams(exams: TargetExam[]): Promise<void> {
  await kvSet("target-exams", exams);
  if (exams.length > 0) {
    await kvSet("target-exam-date", exams[0].date);
  }
}

export async function getTimeTargets(): Promise<TimeTargets> {
  try {
    const t = await kvGet<TimeTargets>("time-targets");
    if (t && typeof t.jeeDailyMinutes === "number") {
      return { ...DEFAULT_TIME_TARGETS, ...t };
    }
  } catch {
    // fallback
  }
  return DEFAULT_TIME_TARGETS;
}

export async function saveTimeTargets(targets: TimeTargets): Promise<void> {
  await kvSet("time-targets", targets);
}

export async function getAnkiLimits(): Promise<AnkiLimits> {
  try {
    const l = await kvGet<AnkiLimits>("anki-limits");
    if (l && typeof l.newCardsPerDay === "number") {
      return { ...DEFAULT_ANKI_LIMITS, ...l };
    }
  } catch {
    // fallback
  }
  return DEFAULT_ANKI_LIMITS;
}

export async function saveAnkiLimits(limits: AnkiLimits): Promise<void> {
  await kvSet("anki-limits", limits);
}
