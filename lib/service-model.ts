import type { FuelEntry } from "./fuel-types";

export type ServiceItem = {
  id: string; title: string; kind: string; intervalMonths: number | null;
  intervalKm: number | null; reminders: boolean;
};
export type ServiceRecord = {
  id: string; serviceId: string; performedOn: string; odometer: number | null;
  action: "replacement" | "inspection"; note: string | null; createdAt: string;
};
export type ServiceData = { items: ServiceItem[]; records: ServiceRecord[] };
export const DEFAULT_SERVICES: ServiceItem[] = [
  { id: "oil", title: "Заміна масла", kind: "oil", intervalMonths: 12, intervalKm: 12000, reminders: false },
  { id: "oil-filter", title: "Масляний фільтр", kind: "oil-filter", intervalMonths: 12, intervalKm: 12000, reminders: false },
  { id: "air-filter", title: "Повітряний фільтр", kind: "filter", intervalMonths: 24, intervalKm: null, reminders: false },
  { id: "cabin-filter", title: "Салонний фільтр", kind: "cabin", intervalMonths: 24, intervalKm: null, reminders: false },
  { id: "fuel-filter", title: "Паливний фільтр", kind: "filter", intervalMonths: null, intervalKm: null, reminders: false },
  { id: "wipers", title: "Двірники", kind: "wipers", intervalMonths: 24, intervalKm: null, reminders: false },
  { id: "tires", title: "Шини", kind: "inspection", intervalMonths: 6, intervalKm: null, reminders: false },
  { id: "brakes", title: "Гальмівні колодки", kind: "inspection", intervalMonths: 6, intervalKm: null, reminders: false },
];
export function mergeServices(items: ServiceItem[]) {
  const stored = new Map(items.map(item => [item.id, item]));
  return [...DEFAULT_SERVICES.map(item => stored.get(item.id) ?? item), ...items.filter(item => !DEFAULT_SERVICES.some(base => base.id === item.id))];
}
export function localDay(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
export function parisDay(now = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function addMonths(day: string, months: number) {
  const [year, month, date] = day.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(date, last));
  return target.toISOString().slice(0, 10);
}
export function currentMileage(entries: FuelEntry[]) {
  return [...entries].filter(entry => entry.fillDate && entry.odometer != null)
    .sort((a, b) => (b.fillDate ?? "").localeCompare(a.fillDate ?? ""))[0] ?? null;
}
export function recordsFor(item: ServiceItem, records: ServiceRecord[]) {
  const id = item.kind === "oil-filter" ? "oil" : item.id;
  return records.filter(record => record.serviceId === id)
    .sort((a, b) => b.performedOn.localeCompare(a.performedOn) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}
export function serviceStatus(item: ServiceItem, records: ServiceRecord[], mileage: number | null, today = localDay()) {
  const latest = recordsFor(item, records)[0] ?? null;
  const oil = item.kind === "oil" || item.kind === "oil-filter";
  const inspection = item.kind === "inspection" || item.kind === "wipers";
  const months = item.kind === "wipers" && latest?.action === "inspection" ? 12 : item.intervalMonths;
  const dueDate = latest && months ? addMonths(latest.performedOn, months) : null;
  const recommendedDate = latest && item.kind === "cabin" ? addMonths(latest.performedOn, 12) : dueDate;
  const distance = latest?.odometer != null && mileage != null && mileage >= latest.odometer ? mileage - latest.odometer : null;
  const limit = oil ? 12000 : item.intervalKm;
  const recommendedKm = oil ? 10000 : limit;
  let level: "neutral" | "good" | "warning" | "overdue" = latest && (dueDate || limit) ? "good" : "neutral";
  if (latest && ((dueDate && today >= dueDate) || (distance != null && limit && distance >= limit))) level = "overdue";
  else if (latest && ((recommendedDate && today >= recommendedDate) || (distance != null && recommendedKm && distance >= recommendedKm))) level = "warning";
  const label = !latest ? "Немає даних" : level === "overdue" ? (inspection ? "Час перевірити" : "Потрібна заміна") : level === "warning" ? "Запланувати заміну" : level === "good" ? "У нормі" : "Дату збережено";
  const reason = level === "overdue" && dueDate && today >= dueDate ? "date" : distance != null && recommendedKm && distance >= recommendedKm ? "distance" : null;
  return { latest, dueDate, recommendedDate, distance, limit, recommendedKm, level, label, reason, inspection,
    remainingKm: distance != null && limit ? Math.max(0, limit - distance) : null,
    percent: distance != null && limit ? Math.min(100, Math.max(0, distance / limit * 100)) : 0,
    // One notice per service cycle and severity; a new record starts a new cycle.
    reminderKey: latest ? `${item.id}:${latest.id}:${level}` : null,
  };
}
