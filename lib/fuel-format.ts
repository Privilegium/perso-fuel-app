export const money = new Intl.NumberFormat("uk-UA", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});
export const priceMoney = new Intl.NumberFormat("uk-UA", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 3,
});
export const number = new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 1 });
export const integer = new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 });

export function dateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

export function dateForDisplay(value: string | null, options: Intl.DateTimeFormatOptions = {}) {
  if (!value) return "Дата відсутня";
  const date = new Date(value + "T12:00:00");
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...options,
  }).format(date);
}

export function monthKey(date: Date) {
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0");
}

export function monthTitle(key: string, year = false) {
  const [y, m] = key.split("-").map(Number);
  const date = new Date(y, m - 1, 1, 12);
  return new Intl.DateTimeFormat("uk-UA", {
    month: "long",
    ...(year ? { year: "numeric" } : {}),
  }).format(date);
}

export function monthShort(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("uk-UA", { month: "short" }).format(new Date(y, m - 1, 1, 12));
}

export function monthAxisLabel(key: string) {
  const label = monthShort(key).replace(/\.$/, "");
  return key.endsWith("-01") ? label + " ’" + key.slice(2, 4) : label;
}

export function countNoun(count: number, one: string, few: string, many: string) {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

export function asNumber(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

