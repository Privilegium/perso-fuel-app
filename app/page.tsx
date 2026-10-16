"use client";

import { BarChart3, Check, ChevronDown, ChevronRight, CircleAlert, Fuel, Gauge, List, LoaderCircle, MapPin, MapPinned, Moon, Pencil, Plus, Sun } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, lazy, Suspense } from "react";
import { FeatureBoundary, FeatureLoading } from "@/components/feature-boundary";
import { money, priceMoney, number, integer, dateForDisplay, monthKey, monthTitle, monthShort } from "@/lib/fuel-format";
import type { FuelEntry, Tab, Theme, FormMode, MonthlyMetric, JournalChange } from "@/lib/fuel-types";
import { readJournalSnapshot, writeJournalSnapshot, clearJournalSnapshot, isFuelEntries, takeLaunchRequest } from "@/lib/journal-cache";

import { startPwa } from "@/lib/pwa";

const loadDialog = () => import("@/components/fuel-dialog");
const FuelDialog = lazy(loadDialog);
const FuelMap = lazy(() => import("@/components/fuel-map"));
const FuelAnalytics = lazy(() => import("@/components/fuel-analytics"));

const HISTORY_PAGE_SIZE = 5;
const ACTIVE_TAB_STORAGE_KEY = "fuel-log-active-tab";
const ACTIVE_TAB_CHANGE_EVENT = "fuel-log-active-tab-change";
const THEME_STORAGE_KEY = "fuel-log-theme";
const THEME_CHANGE_EVENT = "fuel-log-theme-change";

function getActiveTabSnapshot(): Tab {
  if (typeof window === "undefined") return "fills";
  const stored = window.sessionStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
  return stored === "analytics" || stored === "map" ? stored : "fills";
}

function subscribeToActiveTab(onChange: () => void) {
  const listener = () => onChange();
  window.addEventListener(ACTIVE_TAB_CHANGE_EVENT, listener);
  return () => window.removeEventListener(ACTIVE_TAB_CHANGE_EVENT, listener);
}

function getServerActiveTabSnapshot(): Tab {
  return "fills";
}

function getThemeSnapshot(): Theme {
  if (typeof window === "undefined") return "dark";
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark";
  } catch {
    return document.documentElement.dataset.theme === "light" ? "light" : "dark";
  }
}

function subscribeToTheme(onChange: () => void) {
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, onChange);
}

function getServerThemeSnapshot(): Theme {
  return "dark";
}

function SmallBars({ values }: { values: Array<{ month: string; amount: number }> }) {
  const width = 218;
  const height = 54;
  const inset = 4;
  const max = Math.max(1, ...values.map((item) => item.amount));
  const gap = 6;
  const barWidth = (width - inset * 2 - gap * Math.max(0, values.length - 1)) / Math.max(1, values.length);

  return (
    <div className="sparkline-wrap" aria-label="Витрати за останні місяці">
      <svg viewBox={"0 0 " + width + " " + height} role="img">
        {values.map((item, index) => {
          const barHeight = Math.max(3, (item.amount / max) * (height - 7));
          const x = inset + index * (barWidth + gap);
          const y = height - barHeight;
          return (
            <rect
              key={item.month}
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              rx="3"
              className={index === values.length - 1 ? "spark-bar spark-bar-current" : "spark-bar"}
            >
              <title>{monthTitle(item.month, true) + ": " + money.format(item.amount)}</title>
            </rect>
          );
        })}
      </svg>
      <div className="sparkline-months">
        {values.map((item) => <span key={item.month}>{monthShort(item.month)}</span>)}
      </div>
    </div>
  );
}

function FuelTable({
  entries,
  onEdit,
}: {
  entries: FuelEntry[];
  onEdit: (entry: FuelEntry) => void;
}) {
  if (!entries.length) {
    return (
      <div className="empty-state">
        <div className="empty-icon"><Fuel size={22} /></div>
        <h3>Записів поки немає</h3>
        <p>Натисніть плюс після заправки — дата й основні дані збережуться в журналі.</p>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table className="fuel-table">
        <thead>
          <tr>
            <th scope="col">Заправка</th>
            <th scope="col">Ціна / л</th>
            <th scope="col">Об’єм</th>
            <th scope="col">Пробіг</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const complete = entry.fillDate && entry.unitPrice != null && entry.amount != null;
            return (
              <tr key={entry.id} className={!complete ? "incomplete-row" : undefined}>
                <td className="fill-date-cell">
                  <div className="date-cell-copy">
                    <span className="cell-label">Дата</span>
                    <span className="date-line">
                      <time dateTime={entry.fillDate ?? undefined}>{dateForDisplay(entry.fillDate)}</time>
                      <button
                        className="row-edit"
                        type="button"
                        aria-label={"Редагувати запис за " + dateForDisplay(entry.fillDate)}
                        onClick={() => onEdit(entry)}
                      >
                        <Pencil size={13} />
                      </button>
                    </span>
                    {entry.note ? <span className="row-note">{entry.note}</span> : null}
                    {!complete ? <span className="incomplete-label">Неповний запис</span> : null}
                  </div>
                  {entry.amount != null ? (
                    <strong className="header-amount" aria-label={"Сплачено " + money.format(entry.amount)}>
                      {money.format(entry.amount)}
                    </strong>
                  ) : null}
                </td>
                <td>
                  <span className="cell-label">Ціна / л</span>
                  {entry.unitPrice == null ? "—" : priceMoney.format(entry.unitPrice)}
                </td>
                <td>
                  <span className="cell-label">Об’єм</span>
                  <span className="table-volume">{entry.liters == null ? "—" : number.format(entry.liters) + " л"}</span>
                </td>
                <td>
                  <span className="cell-label">Пробіг</span>
                  {entry.odometer == null ? "—" : integer.format(entry.odometer) + " км"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function BottomNavigation({ active, onSelect }: { active: Tab; onSelect: (tab: Tab) => void }) {
  const items: Array<{ id: Tab; label: string; icon: typeof List }> = [
    { id: "fills", label: "Заправки", icon: List },
    { id: "analytics", label: "Статистика", icon: BarChart3 },
    { id: "map", label: "Мапа", icon: MapPinned },
  ];
  return (
    <nav className="bottom-nav" aria-label="Головна навігація">
      {items.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          className={active === id ? "nav-item nav-active" : "nav-item"}
          aria-current={active === id ? "page" : undefined}
          onClick={() => onSelect(id)}
        >
          <Icon size={20} strokeWidth={active === id ? 2.3 : 1.8} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

export default function Home() {
  const [entries, setEntries] = useState<FuelEntry[]>([]);
  const tab = useSyncExternalStore(subscribeToActiveTab, getActiveTabSnapshot, getServerActiveTabSnapshot);
  const setTab = useCallback((nextTab: Tab) => {
    window.sessionStorage.setItem(ACTIVE_TAB_STORAGE_KEY, nextTab);
    window.dispatchEvent(new Event(ACTIVE_TAB_CHANGE_EVENT));
  }, []);
  const theme = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, getServerThemeSnapshot);
  const [visibleEntryCount, setVisibleEntryCount] = useState(HISTORY_PAGE_SIZE);
  const [selectedAnalyticsMonth, setSelectedAnalyticsMonth] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [dialog, setDialog] = useState<{ mode: FormMode; entry: FuelEntry | null } | null>(null);
  const [toast, setToast] = useState("");
  const [hasSnapshot, setHasSnapshot] = useState(false);
  const journal = useRef<FuelEntry[]>([]);
  const snapshotAvailable = useRef(false);
  const etag = useRef<string | null>(null);
  const lastSync = useRef(0);
  const generation = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);

  const toggleTheme = useCallback(() => {
    const nextTheme: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      "content",
      nextTheme === "dark" ? "#111913" : "#f5f7f5",
    );
    document
      .querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
      ?.setAttribute("content", nextTheme === "dark" ? "black-translucent" : "default");
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // The current page still switches even if the browser blocks persistent storage.
    }
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }, [theme]);

  const refresh = useCallback(() => {
    if (inFlight.current) return inFlight.current;
    const requestGeneration = ++generation.current;
    const launch = takeLaunchRequest();
    const controller = launch?.controller ?? new AbortController();
    activeRequest.current = controller;
    const task = (async () => {
      const timeout = window.setTimeout(() => controller.abort(), 10000);
      try {
        if (!navigator.onLine) throw new Error("Немає з’єднання з інтернетом.");
        let response = await (launch?.response ?? fetch("/api/fuel", {
          cache: "no-store",
          headers: etag.current ? { "If-None-Match": etag.current } : {},
          signal: controller.signal,
        }));
        if (requestGeneration !== generation.current) return;
        const sessionEnded = response.status === 401 || response.status === 403 || response.redirected
          || (response.ok && response.headers.get("content-type")?.includes("text/html"));
        if (sessionEnded) {
          await clearJournalSnapshot();
          journal.current = [];
          snapshotAvailable.current = false;
          etag.current = null;
          setEntries([]);
          setHasSnapshot(false);
          throw new Error("Сеанс завершився. Під’єднайтеся до інтернету та увійдіть знову.");
        }
        if (response.status === 304 && snapshotAvailable.current) {
          lastSync.current = Date.now();
          setLoadError("");
          return;
        }
        // Ignore corrupt/obsolete local snapshots even if an early conditional
        // request was accepted. Recover once with an unconditional network read.
        if (response.status === 304) response = await fetch("/api/fuel", { cache: "no-store", signal: controller.signal });
        const result = (await response.json()) as { entries?: unknown; error?: string };
        if (!response.ok || !isFuelEntries(result.entries)) throw new Error(result.error || "Не вдалося завантажити журнал.");
        if (requestGeneration !== generation.current) return;
        journal.current = result.entries;
        snapshotAvailable.current = true;
        etag.current = response.headers.get("etag");
        lastSync.current = Date.now();
        setEntries(result.entries);
        setHasSnapshot(true);
        setLoadError("");
        void writeJournalSnapshot(result.entries, etag.current);
      } catch (error) {
        if (requestGeneration !== generation.current) return;
        setLoadError(snapshotAvailable.current
          ? "Не вдалося оновити дані. Показано збережену історію. Оновлю після підключення."
          : error instanceof Error && error.name !== "AbortError" ? error.message : "Не вдалося під’єднатися. Спробуйте ще раз.");
      } finally {
        window.clearTimeout(timeout);
        if (requestGeneration === generation.current) setLoading(false);
      }
    })();
    inFlight.current = task;
    void task.finally(() => {
      if (inFlight.current === task) inFlight.current = null;
      if (activeRequest.current === controller) activeRequest.current = null;
    });
    return task;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void readJournalSnapshot().then((saved) => {
      if (cancelled) return;
      if (saved) {
        journal.current = saved.entries;
        snapshotAvailable.current = true;
        etag.current = saved.etag;
        setEntries(saved.entries);
        setHasSnapshot(true);
        setLoading(false);
      }
      void refresh();
    });
    const resume = () => {
      if (!document.hidden && Date.now() - lastSync.current > 60000) void refresh();
    };
    const online = () => { void refresh(); };
    const message = (event: MessageEvent) => {
      if (event.data?.type === "FUEL_SESSION_CLEARED") {
        generation.current += 1;
        activeRequest.current?.abort();
        inFlight.current = null;
        journal.current = [];
        snapshotAvailable.current = false;
        etag.current = null;
        setEntries([]);
        setHasSnapshot(false);
        setLoading(false);
        setLoadError("Сеанс завершився. Під’єднайтеся до інтернету та увійдіть знову.");
        void clearJournalSnapshot();
      } else if (event.data?.type === "FUEL_JOURNAL_CHANGED") {
        lastSync.current = 0;
        etag.current = null;
        resume();
      }
    };
    window.addEventListener("online", online);
    window.addEventListener("pageshow", resume);
    document.addEventListener("visibilitychange", resume);
    navigator.serviceWorker?.addEventListener("message", message);
    return () => {
      cancelled = true;
      generation.current += 1;
      activeRequest.current?.abort();
      inFlight.current = null;
      window.removeEventListener("online", online);
      window.removeEventListener("pageshow", resume);
      document.removeEventListener("visibilitychange", resume);
      navigator.serviceWorker?.removeEventListener("message", message);
    };
  }, [refresh]);
  useEffect(startPwa, []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const orderedEntries = useMemo(
    () => [...entries].sort((a, b) => (b.fillDate ?? "").localeCompare(a.fillDate ?? "")),
    [entries],
  );
  const completeEntries = useMemo(
    () => orderedEntries.filter((item) => item.fillDate && item.unitPrice != null && item.amount != null),
    [orderedEntries],
  );
  const latest = completeEntries[0] ?? null;
  const lastPrice = latest?.unitPrice ?? null;
  const thisMonth = monthKey(new Date());
  const monthEntries = completeEntries.filter((item) => item.fillDate?.slice(0, 7) === thisMonth);
  const monthSpend = monthEntries.reduce((sum, item) => sum + (item.amount ?? 0), 0);

  const monthlyData = useMemo(() => {
    const grouped = new Map<string, { month: string; amount: number; prices: number[]; liters: number }>();
    for (const entry of completeEntries) {
      if (!entry.fillDate || entry.amount == null || entry.unitPrice == null) continue;
      const key = entry.fillDate.slice(0, 7);
      const value = grouped.get(key) ?? { month: key, amount: 0, prices: [], liters: 0 };
      value.amount += entry.amount;
      value.prices.push(entry.unitPrice);
      value.liters += entry.liters ?? entry.amount / entry.unitPrice;
      grouped.set(key, value);
    }
    if (!grouped.size) return [];

    const sortedMonths = Array.from(grouped.keys()).sort();
    const firstMonth = sortedMonths[0];
    const lastRecordedMonth = sortedMonths[sortedMonths.length - 1] ?? thisMonth;
    const lastMonth = lastRecordedMonth > thisMonth ? lastRecordedMonth : thisMonth;
    const [firstYear, firstNumber] = firstMonth.split("-").map(Number);
    const cursor = new Date(firstYear, firstNumber - 1, 1, 12);
    const timeline: MonthlyMetric[] = [];

    while (monthKey(cursor) <= lastMonth) {
      const key = monthKey(cursor);
      const item = grouped.get(key);
      const prices = item?.prices ?? [];
      timeline.push({
        month: key,
        amount: item?.amount ?? 0,
        price: prices.length ? prices.reduce((sum, price) => sum + price, 0) / prices.length : null,
        priceMin: prices.length ? Math.min(...prices) : null,
        priceMax: prices.length ? Math.max(...prices) : null,
        fillCount: prices.length,
        liters: item?.liters ?? 0,
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return timeline;
  }, [completeEntries, thisMonth]);

  const defaultSelectedMonth = [...monthlyData].reverse().find((item) => item.fillCount > 0)?.month ?? thisMonth;
  const selectedMonth = monthlyData.find((item) => item.month === selectedAnalyticsMonth)
    ?? monthlyData.find((item) => item.month === defaultSelectedMonth)
    ?? null;

  const currentMonthLabel = monthTitle(thisMonth);

  const onSaved = (message: string, change: JournalChange) => {
    // Use the authoritative mutation response; avoid a second full-history GET.
    generation.current += 1;
    activeRequest.current?.abort();
    inFlight.current = null;
    const next = "entry" in change
      ? [change.entry, ...journal.current.filter((item) => item.id !== change.entry.id)]
      : journal.current.filter((item) => item.id !== change.deletedId);
    journal.current = next;
    snapshotAvailable.current = true;
    etag.current = null;
    lastSync.current = Date.now();
    setEntries(next);
    setHasSnapshot(true);
    setLoading(false);
    setLoadError("");
    setVisibleEntryCount(HISTORY_PAGE_SIZE);
    setDialog(null);
    setToast(message);
    void writeJournalSnapshot(next);
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark"><Fuel size={19} strokeWidth={2.2} /></span>
          <span>МОЄ ПАЛЬНЕ</span>
        </div>
        <button
          className={theme === "dark" ? "theme-switch theme-switch-dark" : "theme-switch"}
          type="button"
          role="switch"
          aria-checked={theme === "dark"}
          aria-label={theme === "dark" ? "Темна тема увімкнена" : "Світла тема увімкнена"}
          title={theme === "dark" ? "Перемкнути на світлу тему" : "Перемкнути на темну тему"}
          onClick={toggleTheme}
        >
          <span className="theme-switch-track" aria-hidden="true">
            <Sun className="theme-switch-sun" size={15} />
            <Moon className="theme-switch-moon" size={15} />
            <span className="theme-switch-thumb" />
          </span>
        </button>
      </header>

      <div className="content-shell">
        {tab === "fills" && (
          <>
            <div className="page-heading">
              <div>
                <p className="eyebrow">ВАШ ЖУРНАЛ</p>
                <h1>Заправки</h1>
              </div>
              <span className="record-count">{entries.length} записів</span>
            </div>

            <section className="overview-band" aria-label="Поточні підсумки">
              <div className="overview-main">
                <div className="overview-copy">
                  <span className="overview-label">ВИТРАТИ · {currentMonthLabel.toLocaleUpperCase("uk-UA")}</span>
                  <strong className="overview-total">{money.format(monthSpend)}</strong>
                  <span className="overview-caption">
                    {monthEntries.length} {monthEntries.length === 1 ? "заправка" : "заправок"}
                  </span>
                </div>
                <SmallBars values={monthlyData.slice(-6)} />
              </div>
              <div className="overview-latest">
                <span className="latest-symbol"><Gauge size={18} /></span>
                <span className="latest-copy">
                  <small>Остання ціна за літр</small>
                  <strong>{lastPrice == null ? "—" : priceMoney.format(lastPrice)}</strong>
                </span>
                <span className="latest-date">{latest ? dateForDisplay(latest.fillDate, { day: "2-digit", month: "short" }) : ""}</span>
              </div>
            </section>

            <section className="history-section">
              <div className="section-heading">
                <div>
                  <h2>Історія</h2>
                  <p>{entries.length} записів · показано {Math.min(visibleEntryCount, entries.length)}</p>
                </div>
                <button className="text-button" type="button" onClick={() => setTab("analytics")}>
                  Статистика <ChevronRight size={15} />
                </button>
              </div>
              {loadError ? (
                <div className="error-panel" role="alert">
                  <CircleAlert size={18} />
                  <span>{loadError}</span>
                  <button className="text-button" type="button" onClick={() => void refresh()}>Спробувати знову</button>
                </div>
              ) : null}
              {loading ? (
                <div className="loading-state"><LoaderCircle className="spin" size={20} />Завантажую записи…</div>
              ) : !loadError || hasSnapshot ? (
                <>
                  <FuelTable
                    entries={orderedEntries.slice(0, visibleEntryCount)}
                    onEdit={(entry) => setDialog({ mode: "edit", entry })}
                  />
                  {visibleEntryCount < orderedEntries.length ? (
                    <div className="history-pagination">
                      <button
                        className="pagination-button"
                        type="button"
                        onClick={() => setVisibleEntryCount(orderedEntries.length)}
                      >
                        Показати всі заправки
                        <ChevronDown size={17} />
                      </button>
                      <span>Показано {Math.min(visibleEntryCount, orderedEntries.length)} із {orderedEntries.length}</span>
                    </div>
                  ) : null}
                </>
              ) : null}
            </section>
          </>
        )}

        {tab === "analytics" && (
          <FeatureBoundary>
            <Suspense fallback={<FeatureLoading />}>
              <FuelAnalytics completeEntries={completeEntries} monthlyData={monthlyData} selectedMonth={selectedMonth} setSelectedAnalyticsMonth={setSelectedAnalyticsMonth} loading={loading} loadError={loadError} hasSnapshot={hasSnapshot} />
            </Suspense>
          </FeatureBoundary>
        )}

        {tab === "map" && (
          <section className="map-page">
            <div className="page-heading">
              <div><p className="eyebrow">ВАША ІСТОРІЯ</p><h1>Мапа</h1></div>
              <span className="record-count">{entries.filter((item) => item.latitude != null && item.longitude != null).length} місць</span>
            </div>
            <p className="map-intro">Точки з’являються, коли ви додаєте геолокацію під час запису заправки.</p>
            {loadError ? (
              <div className="error-panel" role="alert"><CircleAlert size={18} /><span>{loadError}</span></div>
            ) : null}
            {loading ? (
              <div className="loading-state"><LoaderCircle className="spin" size={20} />Завантажую записи…</div>
            ) : !loadError || hasSnapshot ? (
              <FeatureBoundary><Suspense fallback={<FeatureLoading />}><FuelMap
                key={entries
                  .filter((item) => item.latitude != null && item.longitude != null)
                  .map((item) => item.id + ":" + item.latitude + "," + item.longitude)
                  .join("|")}
                entries={entries}
                onAdd={() => setDialog({ mode: "new", entry: null })}
              /></Suspense></FeatureBoundary>
            ) : null}
            <p className="map-privacy"><MapPin size={15} /> Місце зберігається лише для записів, де ви надали доступ до геолокації.</p>
          </section>
        )}
      </div>

      <button className="fab" type="button" onPointerDown={() => { void loadDialog().catch(() => {}); }} onFocus={() => { void loadDialog().catch(() => {}); }} onClick={() => setDialog({ mode: "new", entry: null })} aria-label="Додати заправку">
        <Plus size={25} strokeWidth={2.2} />
      </button>
      <BottomNavigation active={tab} onSelect={setTab} />

      {dialog ? (
        <FeatureBoundary onClose={() => setDialog(null)}><Suspense fallback={<FeatureLoading modal onClose={() => setDialog(null)} />}><FuelDialog
          key={dialog.mode + (dialog.entry?.id ?? "new")}
          mode={dialog.mode}
          entry={dialog.entry}
          lastPrice={lastPrice}
          onClose={() => setDialog(null)}
          onSaved={onSaved}
        /></Suspense></FeatureBoundary>
      ) : null}
      <div className={toast ? "toast toast-visible" : "toast"} role="status" aria-live="polite">{toast ? <><Check size={17} />{toast}</> : null}</div>
    </main>
  );
}
