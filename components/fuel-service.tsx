"use client";

import { Bell, BellOff, Check, ChevronDown, ChevronRight, CircleAlert, CircleCheck, Disc3, Droplets, Filter, LoaderCircle, Pencil, Plus, Trash2, Wrench, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FuelEntry } from "@/lib/fuel-types";
import { integer, dateForDisplay } from "@/lib/fuel-format";
import { currentMileage, DEFAULT_SERVICES, localDay, recordsFor, serviceStatus, type ServiceData, type ServiceItem, type ServiceRecord } from "@/lib/service-model";
import { LaunchReady } from "@/components/launch-ready";
import { SERVICE_CACHE as CACHE, saveServiceSnapshot as saveSnapshot } from "@/lib/service-cache";

type RecordDraft = { item: ServiceItem; record?: ServiceRecord; action: "replacement" | "inspection" };
function validData(value: unknown): value is ServiceData {
  const data = value as ServiceData | null;
  return !!data && Array.isArray(data.items) && Array.isArray(data.records) &&
    data.items.every(item => typeof item.id === "string" && typeof item.title === "string") &&
    data.records.every(record => typeof record.id === "string" && typeof record.performedOn === "string");
}
function ServiceIcon({ item }: { item: ServiceItem }) {
  return item.kind === "oil" ? <Droplets size={23} /> : item.id.includes("filter") ? <Filter size={21} /> : item.kind === "inspection" ? <Disc3 size={22} /> : <Wrench size={21} />;
}
function policy(item: ServiceItem) {
  if (item.kind === "oil" || item.kind === "oil-filter") return "10 000 км — рекомендація · 12 000 км або 1 рік — межа. Що настане раніше.";
  if (item.kind === "wipers") return "Перша перевірка через 2 роки після встановлення, потім — щороку.";
  if (item.kind === "inspection") return "Перевірка кожні 6 місяців після встановлення або останньої перевірки.";
  if (item.kind === "cabin") return "Рекомендована заміна через 1 рік, граничний термін — 2 роки.";
  if (item.id === "air-filter") return "Заміна кожні 2 роки.";
  return [item.intervalMonths ? `Інтервал: ${item.intervalMonths} міс.` : "", item.intervalKm ? `${integer.format(item.intervalKm)} км` : ""].filter(Boolean).join(" або ") || "Додайте дату вручну. Інтервал заміни не встановлено.";
}

function ServiceSummary({ item, records, mileage, compact = false }: { item: ServiceItem; records: ServiceRecord[]; mileage: number | null; compact?: boolean }) {
  const status = serviceStatus(item, records, mileage);
  return <>
    <span className={"service-status status-" + status.level}>{status.level === "good" ? <CircleCheck size={14} /> : status.level === "warning" || status.level === "overdue" ? <CircleAlert size={14} /> : null}{status.label}</span>
    {!compact ? <>
      {item.kind === "oil" || item.intervalKm ? <div className="oil-progress-area">
        <div className="oil-track" role="progressbar" aria-label="Пробіг після заміни" aria-valuemin={0} aria-valuemax={status.limit ?? 12000} aria-valuenow={status.distance == null ? undefined : Math.min(status.distance, status.limit ?? 12000)} aria-valuetext={status.distance == null ? "Додайте пробіг заміни та актуальний пробіг" : `${integer.format(status.distance)} км від заміни`}>
          <span className={"oil-track-fill status-" + status.level} style={{ width: status.percent + "%" }} />
          {item.kind === "oil" ? <span className="oil-recommendation-mark" /> : null}
        </div>
        <div className="oil-distance"><div><strong>{status.distance == null ? "—" : integer.format(status.distance) + " км"}</strong><small>після заміни</small></div><div><strong>{status.remainingKm == null ? "—" : integer.format(status.remainingKm) + " км"}</strong><small>до межі {integer.format(status.limit ?? 12000)} км</small></div></div>
        {status.latest && status.distance == null ? <p className="service-hint">Для розрахунку потрібен пробіг під час заміни та в останній заправці. Актуальний пробіг має бути не меншим за пробіг заміни.</p> : null}
      </div> : null}
      <div className="service-date-pair"><div><small>{status.latest?.action === "inspection" ? "Остання перевірка" : "Остання заміна"}</small><strong>{status.latest ? dateForDisplay(status.latest.performedOn) : "Додайте перший запис"}</strong>{status.latest?.odometer != null ? <span>{integer.format(status.latest.odometer)} км</span> : null}</div><div><small>{status.inspection ? "Перевірити до" : "Замінити до"}</small><strong>{status.dueDate ? dateForDisplay(status.dueDate) : "—"}</strong></div></div>
      <p className="service-policy">{policy(item)}</p>
    </> : null}
  </>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const nodes = ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea,select,[tabindex="0"]');
      if (!nodes?.length) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", key);
    return () => { document.body.style.overflow = oldOverflow; document.removeEventListener("keydown", key); previous?.focus(); };
  }, [onClose]);
  return <div className="dialog-backdrop"><section ref={ref} className="fuel-dialog service-dialog" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}><header className="service-dialog-header"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Закрити"><X size={22} /></button></header>{children}</section></div>;
}

function RecordForm({ draft, onClose, onSave, busy, error }: { draft: RecordDraft; onClose: () => void; onSave: (data: Record<string, unknown>) => Promise<boolean>; busy: boolean; error: string }) {
  const [id] = useState(() => draft.record?.id ?? crypto.randomUUID());
  const [date, setDate] = useState(draft.record?.performedOn ?? localDay());
  const [odometer, setOdometer] = useState(draft.record?.odometer?.toString() ?? "");
  const [note, setNote] = useState(draft.record?.note ?? "");
  const [checked, setChecked] = useState(!!draft.record);
  return <Modal title={draft.action === "inspection" ? "Записати перевірку" : draft.record ? "Редагувати запис" : "Записати заміну"} onClose={onClose}>
    <p className="service-form-caption">{draft.item.title}</p>
    <form className="service-form" onSubmit={async event => { event.preventDefault(); if (await onSave({ action: "record", id, serviceId: draft.item.id, performedOn: date, odometer: odometer === "" ? null : Number(odometer), recordAction: draft.action, note })) onClose(); }}>
      <label className="field-label">Дата<input className="plain-input" type="date" required max={localDay()} value={date} onChange={event => setDate(event.target.value)} /></label>
      <label className="field-label">Пробіг, км <small>Для розрахунку кілометрів до наступної заміни</small><input className="plain-input" type="number" inputMode="numeric" min="0" max="10000000" step="1" placeholder="Необов’язково" value={odometer} onChange={event => setOdometer(event.target.value)} /></label>
      <label className="field-label">Примітка<textarea className="note-input" maxLength={500} placeholder="Масло, деталі, майстерня…" value={note} onChange={event => setNote(event.target.value)} /></label>
      {draft.action === "inspection" ? <label className="service-check"><input type="checkbox" required checked={checked} onChange={event => setChecked(event.target.checked)} />Перевірка пройдена</label> : null}
      {draft.item.id === "oil" ? <p className="service-hint">Масляний фільтр буде оновлено разом із маслом.</p> : null}
      {error ? <p role="alert" className="form-error">{error}</p> : null}
      <footer className="dialog-actions"><button type="button" className="button-secondary" onClick={onClose} disabled={busy}>Скасувати</button><button className="button-primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : <Check size={18} />}Зберегти</button></footer>
    </form>
  </Modal>;
}

function CreateService({ onClose, onSave, busy, error }: { onClose: () => void; onSave: (data: Record<string, unknown>) => Promise<boolean>; busy: boolean; error: string }) {
  const [id] = useState(() => crypto.randomUUID());
  const [title, setTitle] = useState("");
  const [months, setMonths] = useState("");
  const [km, setKm] = useState("");
  return <Modal title="Новий сервіс" onClose={onClose}><form className="service-form" onSubmit={async event => { event.preventDefault(); if (await onSave({ action: "create", id, title, intervalMonths: months ? Number(months) : null, intervalKm: km ? Number(km) : null })) onClose(); }}>
    <label className="field-label">Назва<input className="plain-input" required maxLength={80} placeholder="Наприклад, акумулятор" value={title} onChange={event => setTitle(event.target.value)} /></label>
    <p className="service-hint">Інтервали необов’язкові. Якщо вказані обидва — нагадаємо за тим, що настане раніше.</p>
    <label className="field-label">Кожні, місяців<input className="plain-input" type="number" inputMode="numeric" min="1" max="120" step="1" value={months} onChange={event => setMonths(event.target.value)} /></label>
    <label className="field-label">Кожні, кілометрів<input className="plain-input" type="number" inputMode="numeric" min="100" max="500000" step="1" value={km} onChange={event => setKm(event.target.value)} /></label>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    <footer className="dialog-actions"><button type="button" className="button-secondary" onClick={onClose}>Скасувати</button><button className="button-primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : <Plus size={18} />}Створити</button></footer>
  </form></Modal>;
}

export default function FuelService({ entries, journalLoading }: { entries: FuelEntry[]; journalLoading: boolean }) {
  const [data, setData] = useState<ServiceData | null>(null);
  const [settled, setSettled] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<RecordDraft | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [pushReady, setPushReady] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushInfo, setPushInfo] = useState("");
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const requestId = useRef(0);
  const saving = useRef(false);
  const mileageEntry = currentMileage(entries);
  const mileage = mileageEntry?.odometer ?? null;
  const closeDraft = useCallback(() => { if (!saving.current) { setDraft(null); setError(""); } }, []);
  const closeCreate = useCallback(() => { if (!saving.current) { setCreating(false); setError(""); } }, []);
  const closeDetail = useCallback(() => { if (!saving.current) { setSelected(null); setDeleting(null); setError(""); } }, []);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const id = ++requestId.current;
    try {
      const response = await fetch("/api/service", { cache: "no-store", signal });
      if (!response.ok || response.redirected || !response.headers.get("content-type")?.includes("json")) throw new Error("Не вдалося оновити сервіс. Перевірте з’єднання.");
      const result: unknown = await response.json();
      if (!validData(result)) throw new Error("Не вдалося прочитати сервіс.");
      if (id === requestId.current) { setData(result); setError(""); void saveSnapshot(result); }
    } catch (cause) {
      if (!signal?.aborted && id === requestId.current) setError(cause instanceof Error ? cause.message : "Не вдалося завантажити сервіс.");
    } finally { if (id === requestId.current && !signal?.aborted) setSettled(true); }
  }, []);
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    // Read a local snapshot first; server refresh never blocks repeat launches.
    void (async () => {
      try {
        const saved = await (await caches.open(CACHE)).match("/api/service");
        const cached: unknown = saved ? await saved.json() : null;
        if (alive && validData(cached)) { setData(cached); setSettled(true); }
      } catch { /* Cache availability is optional. */ }
      if (alive) void refresh(controller.signal);
    })();
    const online = () => { if (!document.hidden) void refresh(controller.signal); };
    const message = (event: MessageEvent) => {
      if (event.data?.type === "FUEL_SERVICE_CHANGED") online();
      if (event.data?.type === "FUEL_SESSION_CLEARED") { requestId.current++; setData(null); setSettled(true); setError("Увійдіть знову, щоб переглянути сервіс."); }
    };
    window.addEventListener("online", online);
    navigator.serviceWorker?.addEventListener("message", message);
    void fetch("/api/service/push", { signal: controller.signal }).then(response => response.json()).then(value => { const config = value as { configured?: boolean; publicKey?: string }; if (alive) setPublicKey(config.configured && typeof config.publicKey === "string" ? config.publicKey : null); }).catch(() => {});
    void navigator.serviceWorker?.getRegistration().then(reg => reg?.pushManager?.getSubscription()).then(sub => { if (alive) setPushReady(!!sub && Notification.permission === "granted"); }).catch(() => {});
    return () => { alive = false; controller.abort(); window.removeEventListener("online", online); navigator.serviceWorker?.removeEventListener("message", message); };
  }, [refresh]);
  const mutate = useCallback(async (payload: Record<string, unknown>) => {
    if (saving.current) return false;
    saving.current = true; requestId.current++;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/service", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok || !validData(result)) throw new Error(typeof (result as { error?: unknown })?.error === "string" ? (result as { error: string }).error : "Не вдалося зберегти сервіс.");
      setData(result); void saveSnapshot(result);
      // Mileage notices also run as soon as the app is opened/saved, in addition to the daily task.
      void fetch("/api/service/dispatch", { method: "POST" }).catch(() => {});
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не вдалося зберегти. Перевірте інтернет."); return false; }
    finally { saving.current = false; setBusy(false); }
  }, []);
  async function enablePush() {
    if (!("Notification" in window) || !("PushManager" in window)) {
      setPushInfo("На iPhone додайте сайт на домашній екран, відкрийте його звідти та ввімкніть сповіщення. Потрібна iOS 16.4 або новіша."); return;
    }
    if (!publicKey) { setPushInfo("Під’єднайтеся до інтернету й повторіть після оновлення сервісу."); return; }
    // Request permission synchronously from this click, before any await (iOS).
    const permission = Notification.requestPermission();
    setPushBusy(true); setPushInfo("");
    try {
      if (await permission !== "granted") throw new Error("Дозвіл не надано. Нагадування лишаться в «Сервісі»; дозвіл можна змінити в налаштуваннях iPhone.");
      const registration = await navigator.serviceWorker.ready;
      const decoded = atob(publicKey.replace(/-/g, "+").replace(/_/g, "/"));
      const key = Uint8Array.from(decoded, char => char.charCodeAt(0));
      const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      const response = await fetch("/api/service/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription.toJSON()) });
      if (!response.ok) throw new Error("Не вдалося зберегти підписку. Натисніть увімкнення ще раз.");
      setPushReady(true); setPushInfo("Готово. Увімкніть нагадування для потрібних сервісів нижче.");
      void fetch("/api/service/dispatch", { method: "POST" }).catch(() => {});
    } catch (cause) { setPushInfo(cause instanceof Error ? cause.message : "Не вдалося ввімкнути сповіщення."); }
    finally { setPushBusy(false); }
  }
  async function disablePush() {
    setPushBusy(true);
    try {
      const subscription = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
      if (subscription) {
        const response = await fetch("/api/service/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint }) });
        if (!response.ok) throw new Error();
        await subscription.unsubscribe();
      }
      setPushReady(false); setPushInfo("Сповіщення на цьому пристрої вимкнено.");
    } catch { setPushInfo("Не вдалося вимкнути. Перевірте інтернет і повторіть."); }
    finally { setPushBusy(false); }
  }
  const items = data?.items ?? DEFAULT_SERVICES;
  const records = data?.records ?? [];
  const oil = items.find(item => item.id === "oil")!;
  const selectedItem = items.find(item => item.id === selected);
  const selectedRecords = selectedItem ? recordsFor(selectedItem, records) : [];
  const openRecord = (item: ServiceItem, action: "replacement" | "inspection", record?: ServiceRecord) => { setError(""); setDraft({ item, action, record }); };
  const reminderControl = (item: ServiceItem) => <label className="service-check reminder-check"><input type="checkbox" checked={item.reminders} disabled={busy} onChange={event => void mutate({ action: "reminders", serviceId: item.id, enabled: event.target.checked })} /><Bell size={16} /><span>Нагадувати{!pushReady && item.reminders ? <small>У застосунку · push не ввімкнено</small> : null}</span></label>;
  return <section className="service-page">
    {settled && !journalLoading ? <LaunchReady /> : null}
    <div className="page-heading"><div><h1>Сервіс</h1><p className="service-mileage">Поточний пробіг <strong>{mileage == null ? "—" : integer.format(mileage) + " км"}</strong></p></div></div>
    {mileageEntry?.fillDate ? <p className="service-mileage-source">Із заправки за {dateForDisplay(mileageEntry.fillDate)}</p> : null}
    {error && !draft && !creating && !selected ? <div className="error-panel" role="alert"><CircleAlert size={18} /><span>{error}{data ? " Показано збережені дані." : ""}</span><button className="text-button" onClick={() => void refresh()}>Повторити</button></div> : null}
    {!settled ? <div className="loading-state"><LoaderCircle className="spin" size={20} />Завантажую сервіс…</div> : data ? <>
      <article className="oil-card">
        <div className="service-card-title"><span className="service-symbol"><ServiceIcon item={oil} /></span><h2>{oil.title}</h2><button className="icon-button" aria-label="Історія заміни масла" onClick={() => setSelected("oil")}><ChevronRight size={21} /></button></div>
        <ServiceSummary item={oil} records={records} mileage={mileage} />
        <div className="service-card-actions">{reminderControl(oil)}<button className="text-button" disabled={busy} onClick={() => openRecord(oil, "replacement")}><Plus size={17} />Записати заміну</button></div>
      </article>
      <div className="service-list">
        <button className="service-row" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(!filtersOpen)}><span className="service-symbol"><Filter size={22} /></span><span><strong>Фільтри</strong><small>Масляний, повітряний, салонний, паливний</small></span><ChevronDown size={20} className={filtersOpen ? "chevron-open" : ""} /></button>
        {filtersOpen ? <div className="filter-list">{items.filter(item => item.id.includes("filter")).map(item => <button key={item.id} className="filter-row" onClick={() => setSelected(item.id)}><span><strong>{item.title}</strong><small>{item.id === "oil-filter" ? "Разом із заміною масла" : recordsFor(item, records)[0] ? dateForDisplay(recordsFor(item, records)[0].performedOn) : "Додайте дату заміни"}</small></span><ServiceSummary item={item} records={records} mileage={mileage} compact /><ChevronRight size={17} /></button>)}</div> : null}
        {items.filter(item => !["oil", "oil-filter", "air-filter", "cabin-filter", "fuel-filter"].includes(item.id)).map(item => <button key={item.id} className="service-row" onClick={() => setSelected(item.id)}><span className="service-symbol"><ServiceIcon item={item} /></span><span><strong>{item.title}</strong><small>{recordsFor(item, records).length ? serviceStatus(item, records, mileage).label : "Додайте перший запис"}</small></span><span className={"service-dot status-" + serviceStatus(item, records, mileage).level} /><ChevronRight size={20} /></button>)}
      </div>
      <button className="add-service-button" onClick={() => { setError(""); setCreating(true); }}><Plus size={20} />Додати сервіс</button>
      <div className="push-settings"><span className="service-symbol">{pushReady ? <Bell size={21} /> : <BellOff size={21} />}</span><div><strong>Сповіщення на пристрої</strong><p>{pushReady ? "Увімкнено · перевіряємо щодня та після записів" : "Нагадаємо, навіть коли застосунок закритий"}</p></div><button className="text-button" disabled={pushBusy} onClick={() => void (pushReady ? disablePush() : enablePush())}>{pushBusy ? <LoaderCircle className="spin" size={18} /> : pushReady ? "Вимкнути" : "Увімкнути"}</button></div>
      {pushInfo ? <p className="service-hint" role="status">{pushInfo}</p> : null}
    </> : null}
    {selectedItem && !draft ? <Modal title={selectedItem.title} onClose={closeDetail}>
      <ServiceSummary item={selectedItem} records={records} mileage={mileage} />
      {reminderControl(selectedItem)}
      {selectedItem.kind === "oil-filter" ? <p className="service-hint">Дати й пробіг пов’язані з маслом. Запишіть заміну в картці «Заміна масла».</p> : <div className="service-detail-actions"><button className="button-primary" disabled={busy} onClick={() => openRecord(selectedItem, "replacement")}><Plus size={17} />{["wipers", "inspection"].includes(selectedItem.kind) ? "Записати встановлення" : "Записати заміну"}</button>{["wipers", "inspection", "custom"].includes(selectedItem.kind) ? <button className="button-secondary" disabled={busy} onClick={() => openRecord(selectedItem, "inspection")}><CircleCheck size={18} />Перевірка пройдена</button> : null}</div>}
      <h3 className="service-history-title">Історія робіт</h3>
      {!selectedRecords.length ? <p className="service-hint">Записів поки немає.</p> : <ul className="service-history">{selectedRecords.map(record => <li key={record.id}><div><strong>{dateForDisplay(record.performedOn)}</strong><span>{record.action === "inspection" ? "Перевірка" : "Заміна"}{record.odometer != null ? ` · ${integer.format(record.odometer)} км` : ""}</span>{record.note ? <p>{record.note}</p> : null}</div>{selectedItem.kind !== "oil-filter" ? <><button className="icon-button" aria-label="Редагувати сервісний запис" disabled={busy} onClick={() => openRecord(selectedItem, record.action, record)}><Pencil size={17} /></button><button className="icon-button" aria-label="Видалити сервісний запис" disabled={busy} onClick={() => setDeleting(record.id)}><Trash2 size={17} /></button></> : null}</li>)}</ul>}
      {selectedItem.kind === "custom" ? <button className="delete-entry-trigger" disabled={busy} onClick={() => setDeleting("service")}><Trash2 size={16} />Видалити цей сервіс</button> : null}
      {deleting ? <div className="delete-confirm"><strong>Видалити {deleting === "service" ? "сервіс і його історію" : "цей запис"}?</strong><div><button className="button-secondary" disabled={busy} onClick={() => setDeleting(null)}>Залишити</button><button className="button-danger" disabled={busy} onClick={async () => { if (await mutate({ action: deleting === "service" ? "delete-service" : "delete-record", serviceId: selectedItem.id, id: deleting })) { if (deleting === "service") setSelected(null); setDeleting(null); } }}>Видалити</button></div></div> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </Modal> : null}
    {draft ? <RecordForm key={draft.record?.id ?? draft.item.id + draft.action} draft={draft} onClose={closeDraft} onSave={mutate} busy={busy} error={error} /> : null}
    {creating ? <CreateService onClose={closeCreate} onSave={mutate} busy={busy} error={error} /> : null}
  </section>;
}
