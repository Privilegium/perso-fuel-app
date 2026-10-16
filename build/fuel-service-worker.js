/* Generated with the exact launch graph by pwa-vite-plugin.ts. No runtime dependencies. */
const VERSION = __FUEL_VERSION__;
const CORE = __FUEL_CORE_ASSETS__;
const SHELL = `fuel-log-shell-${VERSION}`;
const ASSETS = `fuel-log-assets-${VERSION}`;
const JOURNAL = "fuel-log-journal-v1";
const CORE_URLS = new Set(CORE.map(path => new URL(path, self.location.origin).href));
const ROOT = new URL("/", self.location.origin).href;

async function broadcast(type, except) {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of clients) if (client.id !== except) client.postMessage({ type });
}

async function clearPrivateCaches() {
  for (const name of await caches.keys()) if (name.startsWith("fuel-log-")) await caches.delete(name);
  await broadcast("FUEL_SESSION_CLEARED");
}

async function storeShell(response) {
    if (!response.ok || response.redirected) throw new Error("Cannot cache an unauthenticated launch");
    const html = await response.clone().text();
    if (!html.includes('data-fuel-app="journal"')) throw new Error("Not the fuel journal shell");
    // An atomic deploy can race this request. Never install HTML referring to
    // a different build's JS/CSS; leave the existing worker and cache intact.
    const linked = [...html.matchAll(/(?:src|href)="([^\"]+)"/g)]
      .map(match => new URL(match[1], ROOT).href)
      .filter(url => url.includes("/_next/static/") && /\.(js|css)$/.test(url));
    if (linked.some(url => !CORE_URLS.has(url))) throw new Error("Launch build changed during installation");
    try {
      const assets = await caches.open(ASSETS);
      await assets.addAll(CORE);
      await (await caches.open(SHELL)).put(ROOT, response);
    } catch (error) {
      await Promise.all([caches.delete(ASSETS), caches.delete(SHELL)]);
      throw error;
    }
}

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    await storeShell(await fetch(ROOT, { cache: "no-cache", credentials: "same-origin" }));
    // No skipWaiting: never replace the code underneath an open, unsaved form.
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if ((name.startsWith("fuel-log-assets-") || name.startsWith("fuel-log-shell-")) && name !== ASSETS && name !== SHELL) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // OSM tiles follow their own HTTP policy, without bulk caching.
  if (url.pathname === "/signout-with-chatgpt") {
    event.respondWith((async () => { await clearPrivateCaches(); return fetch(request); })());
    return;
  }
  if (url.pathname.startsWith("/api/")) {
    // Data/mutations are never served from a SW cache or queued for replay.
    event.respondWith((async () => {
      const response = await fetch(request);
      if (response.status === 401 || response.status === 403 || response.redirected || (response.ok && response.headers.get("content-type")?.includes("text/html"))) {
        await clearPrivateCaches();
      } else if (request.method !== "GET" && response.ok) {
        await caches.delete(JOURNAL);
        await broadcast("FUEL_JOURNAL_CHANGED", event.clientId);
      }
      return response;
    })());
    return;
  }
  if (request.method !== "GET") return;
  if (request.mode === "navigate" && url.pathname === "/" && !url.search) {
    event.respondWith((async () => {
      const cached = await (await caches.open(SHELL)).match(ROOT);
      if (cached) return cached;
      const response = await fetch(request);
      // Recover after storage eviction/sign-in without holding up navigation.
      event.waitUntil(storeShell(response.clone()).catch(() => {}));
      return response;
    })());
    return;
  }
  if (url.pathname.startsWith("/_next/static/") || CORE_URLS.has(url.href)) {
    event.respondWith((async () => {
      const cache = await caches.open(ASSETS);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok && !response.redirected && response.type === "basic") {
        await cache.put(request, response.clone());
        const optional = (await cache.keys()).filter(key => !CORE_URLS.has(key.url));
        for (const key of optional.slice(0, Math.max(0, optional.length - 32))) await cache.delete(key);
      }
      return response;
    })());
  }
});
