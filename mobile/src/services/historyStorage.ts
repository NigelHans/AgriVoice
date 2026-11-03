/**
 * History storage — the saved questions and answers, kept on the device in AsyncStorage.
 *
 * Format (unchanged): `agrivoice_history` holds a JSON array of HistoryEntry, oldest first.
 * Storage is only ever written by an append, an explicit delete or an explicit clear,
 * and never when the saved value cannot be read, so unreadable data is not overwritten.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { HistoryEntry } from "../types";

const HISTORY_KEY = "agrivoice_history";

/** The saved value exists but is not a readable list. Callers must not write over it. */
export class HistoryReadError extends Error {}

// Writes run one after another, so an append and a delete can't overwrite each other
let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
}

// The stored array exactly as saved, including items the app can't display
async function readStored(): Promise<unknown[]> {
  const raw = await AsyncStorage.getItem(HISTORY_KEY);
  if (raw === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new HistoryReadError("Saved history is not valid JSON");
  }
  if (!Array.isArray(parsed)) throw new HistoryReadError("Saved history is not a list");
  return parsed;
}

// Display id for an item at `index`; items saved without an id get one in memory only
function displayId(item: Record<string, unknown>, index: number): string {
  return typeof item.id === "string" && item.id ? item.id : `index-${index}`;
}

/** Entries to display, oldest first. Throws HistoryReadError or a storage error. */
export async function loadHistory(): Promise<HistoryEntry[]> {
  const stored = await readStored();
  const entries: HistoryEntry[] = [];
  stored.forEach((value, index) => {
    if (typeof value !== "object" || value === null) return;
    const item = value as Record<string, unknown>;
    const transcript = typeof item.transcript === "string" ? item.transcript : "";
    const reply = typeof item.reply === "string" ? item.reply : "";
    if (!transcript && !reply) return;   // skipped for display, left untouched in storage
    entries.push({
      id: displayId(item, index),
      timestamp: typeof item.timestamp === "string" ? item.timestamp : "",
      transcript,
      reply,
      language: typeof item.language === "string" ? item.language : "",
    });
  });
  return entries;
}

/** Adds one entry at the end. Does nothing to storage if the saved value is unreadable. */
export function appendHistory(entry: Pick<HistoryEntry, "transcript" | "reply" | "language">): Promise<void> {
  return serialized(async () => {
    const stored = await readStored();
    stored.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      ...entry,
    });
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(stored));
  });
}

/**
 * Removes the one entry with this display id, re-reading storage first so entries
 * saved in the meantime are kept. Returns false if the entry was already gone.
 */
export function deleteHistoryEntry(id: string): Promise<boolean> {
  return serialized(async () => {
    const stored = await readStored();
    const index = stored.findIndex(
      (value, i) => typeof value === "object" && value !== null && displayId(value as Record<string, unknown>, i) === id
    );
    if (index === -1) return false;
    stored.splice(index, 1);
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(stored));
    return true;
  });
}

/** Deletes all saved history, including unreadable data. Only call after the user confirms. */
export function clearHistory(): Promise<void> {
  return serialized(() => AsyncStorage.removeItem(HISTORY_KEY));
}
