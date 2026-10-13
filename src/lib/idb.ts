// ─── IndexedDB wrapper — the entire "backend" of the app ────────────────────
import { useEffect, useState } from "react";
import type {
  ActiveSession,
  AiCacheRecord,
  AiUsageRecord,
  AnkiLogEntry,
  CalEventRecord,
  DailyLog,
  FormulaEntry,
  PaperRecord,
  Question,
  ResponseRecord,
  RetryQueueItem,
  TrialRecord,
  SyllabusRow,
  Task,
  TestRecord,
  TimeLogEntry,
} from "./types";

const DB_NAME_BASE = "jee-study-app";
// v5: adds "ai_cache" and "ai_usage"
// v6: adds "sync_tombstones"
// v7: adds "timelog" (category time tracking) and "anki_log" (daily Anki review check-in)
// v8: adds "retry_queue" (spaced retry queue for C/F/A tagged mistakes)
// v9: adds "trials" (active study & skill experiments)
const DB_VERSION = 9;

const DB_DEVICE = (() => {
  if (typeof window === "undefined") return null;
  try {
    const d = new URLSearchParams(window.location.search).get("device");
    return d && /^[a-z0-9-]{1,24}$/i.test(d) ? d.toLowerCase() : null;
  } catch {
    return null;
  }
})();

const DB_NAME = DB_DEVICE ? `${DB_NAME_BASE}-${DB_DEVICE}` : DB_NAME_BASE;

/** Identity of THIS device's database — sync cursors are namespaced with it. */
export const DB_DEVICE_ID = DB_DEVICE;

export const STORES = [
  "questions",
  "tests",
  "responses",
  "syllabus",
  "formula",
  "daily_log",
  "kv",
  "papers",
  "tasks",
  "cal_events",
  "ai_cache",
  "ai_usage",
  "sync_tombstones",
  "timelog",
  "anki_log",
  "retry_queue",
  "trials",
] as const;

export type StoreName = (typeof STORES)[number];

export const SYNCED_STORES = [
  "questions",
  "tests",
  "responses",
  "syllabus",
  "formula",
  "daily_log",
  "tasks",
  "cal_events",
  "papers",
  "timelog",
  "anki_log",
  "retry_queue",
  "trials",
] as const;

type SyncedStore = (typeof SYNCED_STORES)[number];

export function isSyncedStore(s: StoreName): s is SyncedStore {
  return (SYNCED_STORES as readonly string[]).includes(s);
}

/** Delete marker — replayed by the sync engine so deletes propagate. */
export interface TombstoneRow {
  key: string; // `${store}:${id}`
  store: SyncedStore;
  id: string;
  deleted_at: number; // epoch ms — doubles as the row's updated_at upstream
}

interface KVRow {
  key: string;
  value: unknown;
}

type StoreValueMap = {
  questions: Question;
  tests: TestRecord;
  responses: ResponseRecord;
  syllabus: SyllabusRow;
  formula: FormulaEntry;
  daily_log: DailyLog;
  kv: KVRow;
  papers: PaperRecord;
  tasks: Task;
  cal_events: CalEventRecord;
  ai_cache: AiCacheRecord;
  ai_usage: AiUsageRecord;
  sync_tombstones: TombstoneRow;
  timelog: TimeLogEntry;
  anki_log: AnkiLogEntry;
  retry_queue: RetryQueueItem;
  trials: TrialRecord;
};

let dbPromise: Promise<IDBDatabase> | null = null;

// internal write-event hub: listeners run on write/delete/clear
const listeners = new Set<(store: StoreName) => void>();

function notify(store: StoreName) {
  for (const fn of listeners) {
    try {
      fn(store);
    } catch {
      // never let a subscriber error break an IDB callback
    }
  }
}

export function subscribeToStore(fn: (store: StoreName) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getDB(): Promise<IDBDatabase> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("IndexedDB is only available in the browser"));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = req.result;
        const tx = (e.currentTarget as IDBOpenDBRequest).transaction;
        for (const s of STORES) {
          if (!db.objectStoreNames.contains(s)) {
            const os = db.createObjectStore(s, {
              keyPath: s === "kv" ? "key" : "id",
            });
            if (s === "responses") {
              os.createIndex("by_test", "test_id", { unique: false });
              os.createIndex("by_question", "question_id", { unique: false });
            }
            if (s === "questions") {
              os.createIndex("by_subject", "subject", { unique: false });
              os.createIndex("by_chapter", "chapter", { unique: false });
            }
            if (s === "tasks") {
              os.createIndex("by_scheduled", "scheduled_date", { unique: false });
              os.createIndex("by_status", "status", { unique: false });
            }
            if (s === "cal_events") {
              os.createIndex("by_calendar", "calendar_id", { unique: false });
              os.createIndex("by_start", "start_time", { unique: false });
            }
          }
        }
        // upgrade from v5: ensure ai_cache / ai_usage exist if DB opened from older version
        if (!db.objectStoreNames.contains("ai_cache")) {
          db.createObjectStore("ai_cache", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("ai_usage")) {
          db.createObjectStore("ai_usage", { keyPath: "id" });
        }
        // upgrade from v5 -> v6: ensure sync_tombstones exists
        if (!db.objectStoreNames.contains("sync_tombstones")) {
          db.createObjectStore("sync_tombstones", { keyPath: "key" });
        }
        // upgrade from v6 -> v7: ensure timelog / anki_log exist
        if (!db.objectStoreNames.contains("timelog")) {
          db.createObjectStore("timelog", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("anki_log")) {
          db.createObjectStore("anki_log", { keyPath: "id" });
        }
        // upgrade from v7 -> v8: ensure retry_queue exists
        if (!db.objectStoreNames.contains("retry_queue")) {
          db.createObjectStore("retry_queue", { keyPath: "id" });
        }
        // upgrade from v8 -> v9: ensure trials exists
        if (!db.objectStoreNames.contains("trials")) {
          db.createObjectStore("trials", { keyPath: "id" });
        }
        // upgrade from v3: add "created_at" index to tests if missing
        if (db.objectStoreNames.contains("tests") && tx) {
          const testStore = tx.objectStore("tests");
          if (!testStore.indexNames.contains("by_created")) {
            testStore.createIndex("by_created", "created_at", { unique: false });
          }
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        // If another tab is upgrading the DB, close this connection so the
        // upgrade can proceed. Tell the user to reload.
        db.onversionchange = () => {
          db.close();
          // Dynamic import to avoid coupling idb.ts to the UI layer.
          import("sonner").then(({ toast }) => {
            toast("App updated — reload this tab", { duration: 10000 });
          }).catch(() => {});
        };
        resolve(db);
      };
      req.onerror = () => reject(req.error);
      // If this tab's open request is blocked by another tab holding the DB,
      // reject with a clear message so the caller can surface it.
      req.onblocked = () => {
        reject(new Error("Database upgrade blocked — close other tabs of this app and reload."));
      };
    });
  }
  return dbPromise;
}

/** Reset DB connection so subsequent calls re-open the database. Useful in tests/resets. */
export function resetDBPromise(): void {
  dbPromise = null;
}

// ─── CRUD primitives ────────────────────────────────────────────────────────
export async function get<K extends StoreName>(
  store: K,
  id: string
): Promise<StoreValueMap[K] | undefined> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const os = tx.objectStore(store);
    const req = os.get(id);
    req.onsuccess = () => resolve(req.result as StoreValueMap[K] | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function getAll<K extends StoreName>(store: K): Promise<StoreValueMap[K][]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const os = tx.objectStore(store);
    const req = os.getAll();
    req.onsuccess = () => resolve((req.result as StoreValueMap[K][]) || []);
    req.onerror = () => reject(req.error);
  });
}

export async function put<K extends StoreName>(
  store: K,
  value: StoreValueMap[K]
): Promise<void> {
  const db = await getDB();
  // Stamp updated_at automatically on synced stores if not already stamped
  // within the last 100ms (preserves remote stamps during sync pull).
  if (isSyncedStore(store) && typeof value === "object" && value !== null) {
    const rec = value as { updated_at?: number };
    if (!rec.updated_at || Date.now() - rec.updated_at > 100) {
      rec.updated_at = Date.now();
    }
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const os = tx.objectStore(store);
    const req = os.put(value);
    req.onsuccess = () => {
      notify(store);
      resolve();
    };
    req.onerror = () => reject(req.error);
  });
}

export async function bulkPut<K extends StoreName>(
  store: K,
  values: StoreValueMap[K][]
): Promise<void> {
  if (values.length === 0) return;
  const db = await getDB();
  const now = Date.now();
  if (isSyncedStore(store)) {
    for (const v of values) {
      if (typeof v === "object" && v !== null) {
        const rec = v as { updated_at?: number };
        if (!rec.updated_at) rec.updated_at = now;
      }
    }
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const os = tx.objectStore(store);
    for (const v of values) {
      os.put(v);
    }
    tx.oncomplete = () => {
      notify(store);
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function del<K extends StoreName>(store: K, id: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      isSyncedStore(store) ? [store, "sync_tombstones"] : [store],
      "readwrite"
    );
    const os = tx.objectStore(store);
    os.delete(id);
    if (isSyncedStore(store)) {
      const tombstones = tx.objectStore("sync_tombstones");
      const row: TombstoneRow = {
        key: `${store}:${id}`,
        store,
        id,
        deleted_at: Date.now(),
      };
      tombstones.put(row);
    }
    tx.oncomplete = () => {
      notify(store);
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Delete all responses for a given test_id (used before re-submitting a test
 * so a resubmit can't duplicate response rows). Writes tombstones for sync.
 */
export async function delResponsesByTest(testId: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["responses", "sync_tombstones"], "readwrite");
    const os = tx.objectStore("responses");
    const tombstones = tx.objectStore("sync_tombstones");
    const req = os.getAll();
    req.onsuccess = () => {
      const rows = req.result as ResponseRecord[];
      const now = Date.now();
      for (const r of rows) {
        if (r.test_id === testId) {
          os.delete(r.id);
          tombstones.put({
            key: `responses:${r.id}`,
            store: "responses",
            id: r.id,
            deleted_at: now,
          } as TombstoneRow);
        }
      }
    };
    tx.oncomplete = () => {
      notify("responses");
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function wipeAll(): Promise<void> {
  for (const s of STORES) {
    await clear(s);
  }
}

export async function clear<K extends StoreName>(store: K): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const os = tx.objectStore(store);
    const req = os.clear();
    req.onsuccess = () => {
      notify(store);
      resolve();
    };
    req.onerror = () => reject(req.error);
  });
}

// ─── Key-value helpers ──────────────────────────────────────────────────────
export async function kvGet<T>(key: string): Promise<T | undefined> {
  const row = await get("kv", key);
  return row ? (row.value as T) : undefined;
}

export async function kvSet<T>(key: string, value: T): Promise<void> {
  await put("kv", { key, value });
}

export async function kvDel(key: string): Promise<void> {
  await del("kv", key);
}

// ─── Session persistence (for in-progress tests) ────────────────────────────
const ACTIVE_SESSION_KEY = "active-test-session";

export async function saveSession(session: ActiveSession): Promise<void> {
  await kvSet(ACTIVE_SESSION_KEY, session);
}

export async function loadSession(): Promise<ActiveSession | undefined> {
  return kvGet<ActiveSession>(ACTIVE_SESSION_KEY);
}

export async function clearSession(): Promise<void> {
  await kvDel(ACTIVE_SESSION_KEY);
}

// ─── React hooks for live updates ───────────────────────────────────────────
/**
 * Hook that returns live store data and auto-re-renders whenever any write/delete/clear
 * happens against this store.
 */
export function useLive<K extends StoreName>(store: K): StoreValueMap[K][] {
  const [data, setData] = useState<StoreValueMap[K][]>([]);

  useEffect(() => {
    let mounted = true;
    const reload = () => {
      void getAll(store).then((res) => {
        if (mounted) setData(res);
      });
    };
    reload();
    const unsub = subscribeToStore((s) => {
      if (s === store) reload();
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, [store]);

  return data;
}

/**
 * A monotonically increasing version number that increments on any write across any store.
 * Useful for components like Dashboard that depend on derived cross-store analytics.
 */
export function useDataVersion(): number {
  const [ver, setVer] = useState(0);
  useEffect(() => {
    return subscribeToStore(() => setVer((v) => v + 1));
  }, []);
  return ver;
}
