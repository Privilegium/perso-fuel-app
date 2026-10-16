import type { ServiceData } from "@/lib/service-model";

export const SERVICE_CACHE = "fuel-log-service-v1";
let writes = Promise.resolve();
let epoch = 0;
export function saveServiceSnapshot(data: ServiceData) {
  const generation = epoch;
  writes = writes.catch(() => {}).then(async () => {
    if (generation !== epoch) return;
    const cache = await caches.open(SERVICE_CACHE);
    if (generation === epoch) await cache.put("/api/service", new Response(JSON.stringify(data)));
  }).catch(() => { /* Device storage is optional; D1 is authoritative. */ });
  return writes;
}
export async function clearServiceSnapshot() {
  epoch++;
  await writes;
  try { await caches.delete(SERVICE_CACHE); } catch { /* Unavailable storage is already empty. */ }
}
