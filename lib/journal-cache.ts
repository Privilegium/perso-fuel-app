import type { FuelEntry } from "./fuel-types";

export const JOURNAL_CACHE = "fuel-log-journal-v1";
const JOURNAL_URL = "/api/fuel";
let writes: Promise<unknown> = Promise.resolve();

type LaunchRequest = {
  snapshot: Promise<{ entries: unknown; etag: string | null } | null>;
  response: Promise<Response>;
  controller: AbortController;
};
declare global {
  interface Window { __fuelLaunch?: LaunchRequest }
}

export function takeLaunchRequest() {
  const launch = window.__fuelLaunch;
  delete window.__fuelLaunch;
  return launch;
}

// Keep the snapshot off the synchronous localStorage/hydration path. D1 is
// authoritative; this device-local cache only accelerates reads and offline use.
export function isFuelEntries(value: unknown): value is FuelEntry[] {
  return Array.isArray(value) && value.every((entry) => {
    if (!entry || typeof entry !== "object" || typeof entry.id !== "string") return false;
    if (entry.fillDate !== null && (typeof entry.fillDate !== "string"
      || !/^\d{4}-\d{2}-\d{2}$/.test(entry.fillDate)
      || Number.isNaN(Date.parse(entry.fillDate + "T12:00:00")))) return false;
    if (entry.note !== null && typeof entry.note !== "string") return false;
    return ["unitPrice", "amount", "liters", "odometer", "latitude", "longitude", "locationAccuracy"]
      .every((key) => entry[key] === null || (typeof entry[key] === "number" && Number.isFinite(entry[key])));
  });
}

export async function readJournalSnapshot() {
  try {
    if (window.__fuelLaunch) {
      const saved = await window.__fuelLaunch.snapshot;
      return saved && isFuelEntries(saved.entries) ? { entries: saved.entries, etag: saved.etag } : null;
    }
    if (!("caches" in globalThis)) return null;
    const response = await (await caches.open(JOURNAL_CACHE)).match(JOURNAL_URL);
    if (!response) return null;
    const data = await response.json() as { entries?: unknown };
    if (!isFuelEntries(data.entries)) return null;
    return { entries: data.entries, etag: response.headers.get("etag") };
  } catch {
    // Safari private mode, quota pressure, and cache eviction must not break launch.
    return null;
  }
}

export function writeJournalSnapshot(entries: FuelEntry[], etag: string | null = null) {
  writes = writes.catch(() => {}).then(async () => {
    if (!("caches" in globalThis)) return;
    const headers = new Headers({ "content-type": "application/json" });
    if (etag) headers.set("etag", etag);
    await (await caches.open(JOURNAL_CACHE)).put(JOURNAL_URL, new Response(JSON.stringify({ entries }), { headers }));
  });
  return writes.catch(() => {});
}

export function clearJournalSnapshot() {
  writes = writes.catch(() => {}).then(async () => {
    if ("caches" in globalThis) await caches.delete(JOURNAL_CACHE);
  });
  return writes.catch(() => {});
}
