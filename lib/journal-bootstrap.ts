// Start the one journal request while the browser downloads/parses React, rather
// than waiting for hydration. Reuse the exact promise in the client store.
export const journalBootstrap = `if (location.pathname === "/") {
  const controller = new AbortController();
  const snapshot = (async () => {
    try {
      const response = await (await caches.open("fuel-log-journal-v1")).match("/api/fuel");
      if (!response) return null;
      const data = await response.json();
      return Array.isArray(data.entries) ? { entries: data.entries, etag: response.headers.get("etag") } : null;
    } catch { return null; }
  })();
  const response = snapshot.then(saved => {
    if (!navigator.onLine) throw new Error("offline");
    return fetch("/api/fuel", { cache: "no-store", headers: saved?.etag ? { "If-None-Match": saved.etag } : {}, signal: controller.signal });
  });
  response.catch(() => {});
  window.__fuelLaunch = { snapshot, response, controller };
}`;
