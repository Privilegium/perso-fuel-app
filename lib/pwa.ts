export function startPwa() {
  if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return () => {};
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let idle: number | undefined;
  const register = () => {
    if (cancelled) return;
    void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).then(async () => {
      const standalone = window.matchMedia("(display-mode: standalone)").matches
        || (navigator as Navigator & { standalone?: boolean }).standalone;
      if (standalone && navigator.storage?.persist) await navigator.storage.persist();
    }).catch(() => { /* Online-only operation remains available if storage is disabled. */ });
  };
  const afterLoad = () => {
    if ("requestIdleCallback" in window) idle = window.requestIdleCallback(register, { timeout: 3000 });
    else timer = setTimeout(register, 1000);
  };
  if (document.readyState === "complete") afterLoad();
  else window.addEventListener("load", afterLoad, { once: true });
  return () => {
    cancelled = true;
    window.removeEventListener("load", afterLoad);
    if (timer) clearTimeout(timer);
    if (idle !== undefined) window.cancelIdleCallback(idle);
  };
}
