import { getAll, put, del } from "./idb";
import {
  todayStr,
  uid,
  type AnkiLogEntry,
  type AnkiMinutesBucket,
  type TimeCategory,
  type TimeLogEntry,
} from "./types";

export function getTodayMinutesByCategory(
  logs: TimeLogEntry[],
  date: string = todayStr()
): Record<TimeCategory, number> {
  const totals: Record<TimeCategory, number> = {
    JEE: 0,
    Money: 0,
    Branding: 0,
    Polymathy: 0,
    Entertainment: 0,
  };
  for (const log of logs) {
    if (log.date === date && log.category in totals) {
      totals[log.category] += log.minutes || 0;
    }
  }
  return totals;
}

/** Get the start date (Monday) of the week containing `dateStr` (YYYY-MM-DD) */
export function getMondayOfWeek(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
  d.setDate(diff);
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const dayOfMonth = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dayOfMonth}`;
}

export function getWeeklyPolymathyMinutes(
  logs: TimeLogEntry[],
  date: string = todayStr()
): number {
  const monday = getMondayOfWeek(date);
  let total = 0;
  for (const log of logs) {
    if (log.category === "Polymathy" && log.date >= monday && log.date <= date) {
      total += log.minutes || 0;
    }
  }
  return total;
}

export function computeJeeStreak(
  logs: TimeLogEntry[],
  dailyTargetMin: number,
  today: string = todayStr()
): number {
  const dayTotals = new Map<string, number>();
  for (const log of logs) {
    if (log.category === "JEE") {
      dayTotals.set(log.date, (dayTotals.get(log.date) || 0) + (log.minutes || 0));
    }
  }

  // Check if today meets target
  const todayTotal = dayTotals.get(today) || 0;
  const todayMet = todayTotal >= dailyTargetMin;

  let streak = 0;
  const d = new Date(`${today}T12:00:00`);

  if (!todayMet) {
    // If today is not yet met, check if yesterday was met to keep streak count alive
    d.setDate(d.getDate() - 1);
  }

  while (true) {
    const m = `${d.getMonth() + 1}`.padStart(2, "0");
    const dayOfMonth = `${d.getDate()}`.padStart(2, "0");
    const checkDate = `${d.getFullYear()}-${m}-${dayOfMonth}`;
    const total = dayTotals.get(checkDate) || 0;
    if (total >= dailyTargetMin) {
      streak += 1;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}

export const ANKI_BUCKET_MINUTES: Record<AnkiMinutesBucket, number> = {
  "<10": 10,
  "10-20": 15,
  "20+": 25,
};

export async function logAnkiCheckIn(
  date: string,
  done: boolean,
  bucket?: AnkiMinutesBucket
): Promise<void> {
  const ankiEntry: AnkiLogEntry = {
    id: date,
    date,
    done,
    minutes_bucket: done ? bucket : undefined,
  };
  await put("anki_log", ankiEntry);

  const ankiTimelogId = `anki-${date}`;
  if (done && bucket) {
    const minutes = ANKI_BUCKET_MINUTES[bucket];
    const timeEntry: TimeLogEntry = {
      id: ankiTimelogId,
      category: "JEE",
      activity: "recall",
      date,
      minutes,
      note: `Anki flashcards (${bucket} min)`,
    };
    await put("timelog", timeEntry);
  } else {
    // if undone or no bucket, remove the automatic timelog entry if it exists
    await del("timelog", ankiTimelogId).catch(() => {});
  }
}
