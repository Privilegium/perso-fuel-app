# PWA launch audit — 16 October 2026

Site: https://fuel-log-sviat.opryshkosm.chatgpt.site/

Baseline source: `653876affce69745042f744e8f96a8ac142ebe7e` (Sites version 13).

## Findings and targeted fixes

- The manifest and Apple touch icon already supported installation, but there was no service worker. Added stable manifest `id` and `lang`; retained the existing name, icons, scope, standalone display, theme and safe-area UI.
- Live signed-in browser inspection found manifest requests returning `401`: manifests require an explicit `crossorigin="use-credentials"` even on the same origin when they are private. Added the credentialed link without widening site access.
- Every launch waited for hydration and a fresh journal download. The single journal request now starts in the document head while React downloads. A validated, asynchronous Cache API snapshot renders immediately after hydration; the request revalidates in the background.
- Added conditional ETag responses (`304`) and private cache headers. Removed internal creation/update timestamps from the read payload; database fields and records remain intact. ETags reduce transfer, not the underlying D1 read.
- Saves/edits/deletes now update the UI and snapshot from the authoritative mutation response instead of downloading the journal again. Abort/generation checks prevent an older in-flight read from undoing a newer mutation. Other open tabs are notified by the worker.
- Maps, analytics/consumption calculations and the entry form are separate on-demand chunks. Shared icons are grouped to avoid many tiny requests. The form preloads on button intent. No framework or dependencies were replaced.
- Map tiles wait for the actual canvas dimensions, avoiding a speculative desktop-sized tile grid on mobile. Only visible tiles are requested; OSM tiles are not bulk-downloaded or put in the service-worker cache.
- Added a build-derived service worker with a pinned HTML/JS/CSS launch cache and bounded, on-demand feature chunks. Repeat navigation and core assets are cache-first. API calls, mutations, sign-in/callback responses, import navigation and third-party resources are not served from this cache.
- New workers wait for old tabs to close; they do not force reloads or replace code underneath an unsaved form. Installation verifies that the HTML and assets belong to the same build. Activation cleans old shell/asset caches but retains the journal. Missing caches after storage eviction or a later successful sign-in are rebuilt.
- Sign-out and explicit access denial clear device-local private caches. Transient server errors retain readable history. Offline writes are not queued or reported as saved; connection failures keep the entered form values visible.

## Measurement method

Three cold/repeat pairs, using the same local **production** build/worker setup and unchanged 49-row local test database. The local database includes two historical blank rows; the live database was not modified by the audit. Browser plugin unavailable; used the existing bundled Playwright/Chromium, with no added dependencies.

Profile: 390 × 844 CSS pixels, mobile/touch, DPR 3, Ukrainian locale, 4× CPU slowdown, configured 120 ms network latency and 1.6 Mbps download. A cold run uses a new browser context with empty site storage/cache. A repeat run closes the page and creates a new page in the same context. Times start at navigation; they **exclude iOS/Web.app process startup** and do not measure Cloudflare isolate cold starts. The local server was warm in both cases.

History readiness is the first rendered history row, recorded by a MutationObserver injected before document scripts. Paints come from PerformanceObserver/Performance APIs. Values below are medians, not physical-iPhone Safari benchmarks.

| Metric | Before | After |
| --- | ---: | ---: |
| Cold navigation → history | 1,477 ms | 1,337 ms (9.5% faster) |
| Repeat navigation → history | 543 ms | 275 ms (49.4% faster) |
| Cold first contentful/largest paint | 684 ms | 708 ms |
| Repeat first contentful paint | 224 ms | 104 ms |
| Repeat largest contentful paint | 228 ms | 104 ms |
| Initial page module, uncompressed | 45,812 B | 19,631 B |
| Total initial JavaScript, decoded | 446,248 B | 425,226 B |
| Cold resource response count | 18 | 19 |
| Journal GETs on launch | 1 full response | 1 conditional response |
| Unchanged repeat journal response | `200` with body | `304`, no body (all three runs) |
| Full journal GET immediately after mutation | 1 | 0 |
| Journal payload, local fixture | 23,408 B | 19,586 B |
| Offline reload | Browser error | Saved history opens |

The extra cold resource is a small shared formatter chunk. Cold first paint remains approximately 0.7 seconds and did not improve; the existing framework is the main remaining JavaScript cost. The measured improvement is primarily earlier useful data and faster repeat launches. Warm shell/JS/CSS responses come from the service worker, but the background API revalidation and worker update check can still use the network. Resource Timing's zero transfer size for worker-served responses must **not** be interpreted as zero total network activity.

## Verification

- Production build, TypeScript check, ESLint and `npm run test:pwa` pass.
- Nine dependency-free Node regression tests cover cache-first offline reads, waiting updates, version cleanup, rejecting auth/mismatched HTML, atomic failed installation, mutation invalidation, sign-out/access-denial cleanup, transient errors, eviction/sign-in recovery and bounded optional chunks.
- Seventeen browser checks pass: show all; analytics/month selection; active-tab reload; four-step create; optional mileage; synthetic geolocation; no opening autofocus; edit/delete; no redundant mutation GET; snapshot invalidation; offline history/visited analytics; failed-save input retention with no replay; server/auth failures; theme metadata; safe waiting updates; next-launch activation; zero uncaught errors; exact restoration of original local data after disposable-record cleanup.
- The normal mobile first viewport is **pixel-identical** to baseline (1170 × 2532 device pixels, zero differing channels). Desktop and mobile screenshots were inspected. The existing desktop date/amount column wrapping at 1280 px remains outside this performance change; its table markup and CSS were preserved.
- No database schema changes, migrations, production test writes, dependency additions or style changes.
- Production verification in the user's normal signed-in Chrome session confirmed an activated/running worker and an offline reload displaying all 48 live records (five shown initially). The temporary API-header verification method could not authenticate the browser's service-worker registration request; it was not used as evidence against the real signed-in flow. The offline setting was restored after testing.

## iPhone/Home Screen behavior and limits

Open the existing Home Screen app once while online to seed its own offline cache. Safari and a Home Screen app do not necessarily share local storage. Reinstallation is not required. Cached history can be read offline; previously opened feature chunks also work offline. A feature never opened online and uncached map tiles still require connectivity. Saves/deletes require a server connection; there is no background write queue.

Persistent storage is requested when running standalone, where supported. This is a performance/offline cache, not the primary database: WebKit can evict browser storage, and all cache operations tolerate disabled, missing or corrupt storage. Cloud D1 remains authoritative. Physical-device Safari/Web.app timing and OS process-launch overhead remain unmeasured.

Sources checked during the audit:

- [WebKit: Storage policy, eviction and persistent-storage heuristics](https://webkit.org/blog/14403/updates-to-storage-policy/)
- [WebKit: Safari 17.2 Home Screen cookie/storage behavior](https://webkit.org/blog/14787/webkit-features-in-safari-17-2/)
- [WebKit: Safari 26 Home Screen apps and service workers](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)
- [MDN: PWA caching strategies](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Caching)
- [MDN: Service-worker install/update lifecycle](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers)
- [MDN: Cache-Control and immutable hashed resources](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control)
- [MDN: Credentialed manifests, including same-origin requests](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/crossorigin)
