"use client";

import {
  BarChart3,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Fuel,
  Gauge,
  List,
  LoaderCircle,
  MapPin,
  MapPinned,
  Moon,
  Pencil,
  Plus,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import FuelMap from "@/components/fuel-map";

type FuelEntry = {
  id: string;
  sourceNotionId: string | null;
  fillDate: string | null;
  unitPrice: number | null;
  amount: number | null;
  liters: number | null;
  odometer: number | null;
  latitude: number | null;
  longitude: number | null;
  locationAccuracy: number | null;
  note: string | null;
};

type Tab = "fills" | "analytics" | "map";
type Theme = "light" | "dark";
type FormMode = "new" | "edit";
type MonthlyMetric = {
  month: string;
  amount: number;
  price: number | null;
  priceMin: number | null;
  priceMax: number | null;
  fillCount: number;
  liters: number;
};
type ConsumptionEstimate = {
  litersPer100Km: number;
  eurosPer100Km: number;
  intervalCount: number;
};
const HISTORY_PAGE_SIZE = 5;
const ANALYTICS_VISIBLE_MONTHS = 7;
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

const money = new Intl.NumberFormat("uk-UA", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});
const priceMoney = new Intl.NumberFormat("uk-UA", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 3,
});
const number = new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 });

function dateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

function dateForDisplay(value: string | null, options: Intl.DateTimeFormatOptions = {}) {
  if (!value) return "Дата відсутня";
  const date = new Date(value + "T12:00:00");
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...options,
  }).format(date);
}

function monthKey(date: Date) {
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0");
}

function monthTitle(key: string, year = false) {
  const [y, m] = key.split("-").map(Number);
  const date = new Date(y, m - 1, 1, 12);
  return new Intl.DateTimeFormat("uk-UA", {
    month: "long",
    ...(year ? { year: "numeric" } : {}),
  }).format(date);
}

function monthShort(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("uk-UA", { month: "short" }).format(new Date(y, m - 1, 1, 12));
}

function monthAxisLabel(key: string) {
  const label = monthShort(key).replace(/\.$/, "");
  return key.endsWith("-01") ? label + " ’" + key.slice(2, 4) : label;
}

function countNoun(count: number, one: string, few: string, many: string) {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

function useChartViewportWidth(containerRef: { current: HTMLDivElement | null }, itemCount: number) {
  const [viewportWidth, setViewportWidth] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () => setViewportWidth(container.clientWidth);
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    measure();
    return () => observer.disconnect();
  }, [containerRef]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || viewportWidth === 0) return;
    container.scrollLeft = container.scrollWidth;
  }, [containerRef, itemCount, viewportWidth]);

  return viewportWidth;
}

function asNumber(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function ChartEmpty() {
  return <p className="chart-empty">Дані з’являться після першої заправки.</p>;
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

function MonthlyBarChart({
  values,
  selectedMonth,
  onSelectMonth,
}: {
  values: MonthlyMetric[];
  selectedMonth: string | null;
  onSelectMonth: (month: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const viewportWidth = useChartViewportWidth(scrollRef, values.length);
  if (!values.length) return <ChartEmpty />;
  const plotViewportWidth = viewportWidth || 320;
  const height = 250;
  const axisWidth = 38;
  const top = 16;
  const bottom = 42;
  const visibleSlots = Math.min(ANALYTICS_VISIBLE_MONTHS, values.length);
  const step = plotViewportWidth / visibleSlots;
  const width = step * values.length;
  const chartHeight = height - top - bottom;
  const max = Math.max(10, ...values.map((item) => item.amount));
  const ticks = [0, 0.5, 1];
  const currentMonth = monthKey(new Date());
  const bars = values.map((item, index) => {
    const barHeight = item.amount === 0 ? 0 : Math.max(2, (item.amount / max) * chartHeight);
    return {
      ...item,
      x: index * step + step * 0.22,
      y: top + chartHeight - barHeight,
      width: step * 0.56,
      height: barHeight,
    };
  });

  return (
    <div className="chart-track">
      <svg className="chart-y-axis" width={axisWidth} height={height} viewBox={"0 0 " + axisWidth + " " + height} aria-hidden="true">
        {ticks.map((fraction) => {
          const y = top + chartHeight * fraction;
          const value = max * (1 - fraction);
          return (
            <text key={fraction} x={axisWidth - 4} y={y + 4} className="chart-axis" textAnchor="end">
                {integer.format(value)}
            </text>
          );
        })}
      </svg>
      <div className="chart-scroll" ref={scrollRef}>
        <svg className="data-chart" width={width} height={height} viewBox={"0 0 " + width + " " + height} role="group" aria-label="Витрати на пальне за місяцями. Натисніть місяць, щоб обрати його.">
          {values.map((item, index) => item.month === selectedMonth ? (
            <rect
              key={item.month}
              x={index * step + 4}
              y={top - 7}
              width={Math.max(1, step - 8)}
              height={height - top + 1}
              rx="8"
              className="chart-selection-band"
              aria-hidden="true"
            />
          ) : null)}
          {ticks.map((fraction) => {
            const y = top + chartHeight * fraction;
            return <line key={fraction} x1="0" x2={width} y1={y} y2={y} className="chart-grid" />;
          })}
          {bars.map((bar) => (
            <g key={bar.month}>
              <rect
                x={bar.x}
                y={bar.y}
                width={bar.width}
                height={Math.max(bar.height, 1)}
                rx="5"
                className={bar.month === currentMonth ? "chart-bar chart-bar-current" : "chart-bar"}
              >
                <title>{monthTitle(bar.month, true) + ": " + money.format(bar.amount)}</title>
              </rect>
              <text
                x={bar.x + bar.width / 2}
                y={height - 13}
                className={`${bar.month === currentMonth ? "chart-axis chart-axis-current" : "chart-axis"}${bar.month === selectedMonth ? " chart-axis-selected" : ""}`}
                textAnchor="middle"
              >
                {monthAxisLabel(bar.month)}
              </text>
            </g>
          ))}
          {values.map((item, index) => (
            <rect
              key={item.month}
              x={index * step}
              y="0"
              width={step}
              height={height}
              fill="transparent"
              className="chart-hit-area"
              role="button"
              tabIndex={0}
              aria-pressed={item.month === selectedMonth}
              aria-label={`${monthTitle(item.month, true)}: витрати ${money.format(item.amount)}. Обрати місяць.`}
              onClick={() => onSelectMonth(item.month)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectMonth(item.month);
                }
              }}
            />
          ))}
        </svg>
      </div>
    </div>
  );
}

function MonthlyPriceChart({
  values,
  selectedMonth,
  onSelectMonth,
}: {
  values: MonthlyMetric[];
  selectedMonth: string | null;
  onSelectMonth: (month: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const viewportWidth = useChartViewportWidth(scrollRef, values.length);
  if (!values.length) return <ChartEmpty />;
  const prices = values.flatMap((item) => item.price == null ? [] : [item.price]);
  if (!prices.length) return <ChartEmpty />;
  const currentMonth = monthKey(new Date());
  const plotViewportWidth = viewportWidth || 318;
  const height = 230;
  const axisWidth = 42;
  const top = 17;
  const bottom = 42;
  const visibleSlots = Math.min(ANALYTICS_VISIBLE_MONTHS, values.length);
  const step = plotViewportWidth / visibleSlots;
  const width = step * values.length;
  const chartHeight = height - top - bottom;
  const min = Math.floor(Math.min(...prices) * 10) / 10;
  const max = Math.ceil(Math.max(...prices) * 10) / 10;
  const range = Math.max(0.1, max - min);
  const points = values.flatMap((item, index) => item.price == null ? [] : [{
    ...item,
    x: index * step + step / 2,
    y: top + chartHeight - ((item.price - min) / range) * chartHeight,
    value: item.price,
  }]);

  return (
    <div className="chart-track">
      <svg className="chart-y-axis" width={axisWidth} height={height} viewBox={"0 0 " + axisWidth + " " + height} aria-hidden="true">
        <text x={axisWidth - 4} y={top + 4} className="chart-axis" textAnchor="end">{max.toFixed(1)}</text>
        <text x={axisWidth - 4} y={top + chartHeight + 4} className="chart-axis" textAnchor="end">{min.toFixed(1)}</text>
      </svg>
      <div className="chart-scroll" ref={scrollRef}>
        <svg className="data-chart" width={width} height={height} viewBox={"0 0 " + width + " " + height} role="group" aria-label="Середня ціна одного літра за місяцями. Натисніть місяць, щоб обрати його.">
          {values.map((item, index) => item.month === selectedMonth ? (
            <rect
              key={item.month}
              x={index * step + 4}
              y={top - 7}
              width={Math.max(1, step - 8)}
              height={height - top + 1}
              rx="8"
              className="chart-selection-band"
              aria-hidden="true"
            />
          ) : null)}
          <line x1="0" x2={width} y1={top + chartHeight} y2={top + chartHeight} className="chart-grid" />
          <line x1="0" x2={width} y1={top} y2={top} className="chart-grid" />
          {points.length > 1 && (
            <polyline points={points.map((point) => point.x + "," + point.y).join(" ")} className="chart-line" />
          )}
          {points.map((point) => (
            <g key={point.month}>
              <circle cx={point.x} cy={point.y} r="5" className="chart-point">
                <title>{monthTitle(point.month, true) + ": " + priceMoney.format(point.value) + "/л"}</title>
              </circle>
            </g>
          ))}
          {values.map((item, index) => (
            <text
              key={item.month}
              x={index * step + step / 2}
              y={height - 13}
              className={`${item.month === currentMonth ? "chart-axis chart-axis-current" : "chart-axis"}${item.month === selectedMonth ? " chart-axis-selected" : ""}`}
              textAnchor="middle"
            >
              {monthAxisLabel(item.month)}
            </text>
          ))}
          {values.map((item, index) => (
            <rect
              key={item.month}
              x={index * step}
              y="0"
              width={step}
              height={height}
              fill="transparent"
              className="chart-hit-area"
              role="button"
              tabIndex={0}
              aria-pressed={item.month === selectedMonth}
              aria-label={`${monthTitle(item.month, true)}: ${item.price == null ? "немає даних про ціну" : "середня ціна " + priceMoney.format(item.price) + " за літр"}. Обрати місяць.`}
              onClick={() => onSelectMonth(item.month)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectMonth(item.month);
                }
              }}
            />
          ))}
        </svg>
      </div>
    </div>
  );
}

function MonthDetailCard({ month }: { month: MonthlyMetric }) {
  const prices = month.fillCount > 1
    ? [
      { label: "Найнижча", value: month.priceMin },
      { label: "Середня", value: month.price },
      { label: "Найвища", value: month.priceMax },
    ]
    : [{ label: "Ціна за літр", value: month.price }];

  return (
    <section className="month-detail-card" aria-live="polite" aria-labelledby="selected-month-title">
      <div className="month-detail-heading">
        <div>
          <p className="eyebrow">ОБРАНИЙ МІСЯЦЬ</p>
          <h2 id="selected-month-title">{monthTitle(month.month, true)}</h2>
        </div>
        <div className="month-spend">
          <span>Витрати</span>
          <strong>{money.format(month.amount)}</strong>
        </div>
      </div>
      <p className="month-detail-meta">
        {month.fillCount} {countNoun(month.fillCount, "заправка", "заправки", "заправок")}
        <span aria-hidden="true"> · </span>
        {number.format(month.liters)} л придбано
      </p>
      {month.fillCount > 0 ? (
        <div className={month.fillCount > 1 ? "month-price-grid" : "month-price-grid month-price-single"}>
          {prices.map((item) => (
            <div className="month-price-stat" key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value == null ? "—" : priceMoney.format(item.value)}</strong>
              <small>/ л</small>
            </div>
          ))}
        </div>
      ) : (
        <p className="month-no-prices">За цей місяць заправок немає.</p>
      )}
    </section>
  );
}

function ConsumptionCard({ recent, all }: { recent: ConsumptionEstimate | null; all: ConsumptionEstimate | null }) {
  return (
    <section className="consumption-card" aria-labelledby="consumption-title">
      <div className="consumption-heading">
        <div>
          <p className="eyebrow">ОРІЄНТИР, НЕ ТОЧНИЙ ЗАМІР</p>
          <h2 id="consumption-title">Витрата пального</h2>
        </div>
        <span className="consumption-icon"><Gauge size={20} /></span>
      </div>
      {recent ? (
        <>
          <div className="consumption-main">
            <strong>≈ {number.format(recent.litersPer100Km)} <small>л / 100 км</small></strong>
            <span>
              {recent.intervalCount === 1
                ? "За останній інтервал пробігу"
                : `За останні ${recent.intervalCount} ${countNoun(recent.intervalCount, "інтервал", "інтервали", "інтервалів")} пробігу`}
            </span>
          </div>
          <div className="consumption-details">
            <div>
              <span>Витрати на 100 км</span>
              <strong>≈ {money.format(recent.eurosPer100Km)}</strong>
            </div>
            {all && all.intervalCount > recent.intervalCount ? (
              <div>
                <span>Уся історія · {all.intervalCount} {countNoun(all.intervalCount, "інтервал", "інтервали", "інтервалів")}</span>
                <strong>≈ {number.format(all.litersPer100Km)} л / 100 км</strong>
              </div>
            ) : null}
          </div>
          <p className="consumption-explanation">
            Формула: літри заправок між двома записами пробігу ÷ пройдені кілометри × 100. Якщо рівень бака на початку й наприкінці різний, оцінка може помітно змінитися.
          </p>
        </>
      ) : (
        <p className="consumption-explanation">
          Додайте пробіг щонайменше до двох заправок — тоді покажу приблизну витрату та її формулу.
        </p>
      )}
    </section>
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

function FuelDialog({
  mode,
  entry,
  lastPrice,
  onClose,
  onSaved,
}: {
  mode: FormMode;
  entry: FuelEntry | null;
  lastPrice: number | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [step, setStep] = useState(1);
  const [unitPrice, setUnitPrice] = useState(entry?.unitPrice?.toString() ?? lastPrice?.toString() ?? "");
  const [amount, setAmount] = useState(entry?.amount?.toString() ?? "");
  const [odometer, setOdometer] = useState(entry?.odometer?.toString() ?? "");
  const [note, setNote] = useState(entry?.note ?? "");
  const [fillDate, setFillDate] = useState(entry?.fillDate ?? dateKey());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const noteInput = useRef<HTMLTextAreaElement>(null);
  const [location, setLocation] = useState<{ latitude: number; longitude: number; accuracy: number } | null>(
    entry?.latitude != null && entry.longitude != null
      ? { latitude: entry.latitude, longitude: entry.longitude, accuracy: entry.locationAccuracy ?? 0 }
      : null,
  );
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
      if (event.key === "ArrowLeft" && step > 1) setStep((current) => current - 1);
    };
    window.addEventListener("keydown", onKey);
    document.body.classList.add("dialog-open");
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.classList.remove("dialog-open");
    };
  }, [onClose, saving, step]);

  const price = asNumber(unitPrice);
  const paid = asNumber(amount);
  const estimatedLiters = price && paid ? paid / price : null;

  const captureLocation = () => {
    setError("");
    if (!navigator.geolocation) {
      setError("Цей браузер не підтримує геолокацію.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
        setLocating(false);
      },
      (geoError) => {
        setLocating(false);
        setError(
          geoError.code === geoError.PERMISSION_DENIED
            ? "Доступ до геолокації не надано. Запис можна зберегти без місця."
            : "Не вдалося визначити місце. Спробуйте ще раз або збережіть без нього.",
        );
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  };

  const save = async (skipMileage = false) => {
    setError("");
    setSaving(true);
    try {
      const body =
        mode === "new"
          ? {
              fillDate: dateKey(),
              unitPrice: price,
              amount: paid,
              odometer: skipMileage ? null : asNumber(odometer),
              note,
              latitude: location?.latitude ?? null,
              longitude: location?.longitude ?? null,
              locationAccuracy: location?.accuracy ?? null,
            }
          : {
              fillDate: fillDate || undefined,
              unitPrice: unitPrice.trim() ? price : undefined,
              amount: amount.trim() ? paid : undefined,
              odometer: odometer.trim() ? asNumber(odometer) : null,
              note,
            };
      const response = await fetch(
        mode === "new" ? "/api/fuel" : "/api/fuel/" + encodeURIComponent(entry!.id),
        {
          method: mode === "new" ? "POST" : "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Не вдалося зберегти запис.");
      onSaved(mode === "new" ? "Заправку збережено" : "Зміни збережено");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не вдалося зберегти запис.");
      setSaving(false);
    }
  };

  const removeEntry = async () => {
    if (mode !== "edit" || !entry) return;
    setError("");
    setSaving(true);
    try {
      const response = await fetch("/api/fuel/" + encodeURIComponent(entry.id), { method: "DELETE" });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Не вдалося видалити запис.");
      onSaved("Запис видалено");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Не вдалося видалити запис.");
      setSaving(false);
    }
  };

  const next = () => {
    setError("");
    if (step === 1) {
      if (!note.trim()) {
        setError("Додайте короткий опис або виберіть один із варіантів.");
        return;
      }
      setStep(2);
      return;
    }
    if (step === 2) {
      if (!price || price <= 0) {
        setError("Введіть ціну одного літра.");
        return;
      }
      setStep(3);
      return;
    }
    if (step === 3) {
      if (!paid || paid <= 0) {
        setError("Введіть суму, яку ви сплатили.");
        return;
      }
      setStep(4);
    }
  };

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}>
      <section className="fuel-dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <div className="dialog-grabber" />
        <header className="dialog-header">
          <div>
            <p className="eyebrow">{mode === "new" ? "НОВИЙ ЗАПИС" : "ЖУРНАЛ ЗАПРАВОК"}</p>
            <h2 id="dialog-title">{mode === "new" ? "Записати заправку" : "Редагувати запис"}</h2>
          </div>
          <button className="icon-button dialog-close" type="button" aria-label="Закрити" onClick={onClose} disabled={saving}>
            <X size={19} />
          </button>
        </header>

        {mode === "new" ? (
          <>
            <div className="step-progress" aria-label={"Крок " + step + " з 4"}>
              {[1, 2, 3, 4].map((item) => <span key={item} className={item <= step ? "step-active" : ""} />)}
            </div>
            <p className="step-caption">
              КРОК {step} З 4 <span>{step === 1 ? "Опис" : step === 2 ? "Ціна за літр" : step === 3 ? "Оплата" : "Пробіг і місце"}</span>
              {step > 1 ? <button type="button" onClick={() => setStep((current) => current - 1)}><ChevronLeft size={13} />Назад</button> : null}
            </p>
            {step === 1 && (
              <div className="description-step">
                <label className="field-label" htmlFor="fill-description">
                  Що це була за заправка?
                  <textarea
                    ref={noteInput}
                    id="fill-description"
                    className="note-input description-input"
                    placeholder="Наприклад: планова, поїздка до Ансі"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    maxLength={120}
                  />
                  <small>Короткий опис залишиться в історії поруч із датою.</small>
                </label>
                <div className="quick-description" role="group" aria-label="Швидкий опис">
                  <span>Швидкий вибір</span>
                  {[
                    { label: "Планова", value: "Планова" },
                    { label: "Поїздка до", value: "Поїздка до " },
                  ].map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      className={note.trim() === item.value.trim() ? "quick-description-option selected" : "quick-description-option"}
                      onClick={() => {
                        setNote(item.value);
                        requestAnimationFrame(() => {
                          noteInput.current?.focus();
                          noteInput.current?.setSelectionRange(item.value.length, item.value.length);
                        });
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {step === 2 && (
              <label className="field-label" htmlFor="unit-price">
                Ціна одного літра
                <span className="input-shell">
                  <span className="input-prefix">€</span>
                  <input
                    id="unit-price"
                    autoFocus
                    type="number"
                    inputMode="decimal"
                    min="0.001"
                    step="0.001"
                    placeholder="1,85"
                    value={unitPrice}
                    onChange={(event) => setUnitPrice(event.target.value)}
                  />
                  <span className="input-suffix">/ л</span>
                </span>
                {lastPrice != null ? <small>Остання записана ціна — {priceMoney.format(lastPrice)} за літр</small> : null}
              </label>
            )}
            {step === 3 && (
              <label className="field-label" htmlFor="amount">
                Скільки ви сплатили
                <span className="input-shell">
                  <span className="input-prefix">€</span>
                  <input
                    id="amount"
                    autoFocus
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    step="0.01"
                    placeholder="50,00"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                  />
                </span>
                {estimatedLiters != null ? <small>Приблизно {number.format(estimatedLiters)} л</small> : null}
              </label>
            )}
            {step === 4 && (
              <div className="final-step-fields">
                <div className="automatic-date">
                  <CalendarIcon />
                  <span>Дата запису</span>
                  <strong>{dateForDisplay(dateKey())}</strong>
                  <small>Визначається автоматично</small>
                </div>
                <label className="field-label" htmlFor="odometer">
                  Пробіг автомобіля <span className="optional-word">необов’язково</span>
                  <span className="input-shell">
                    <input
                      id="odometer"
                      type="number"
                      inputMode="numeric"
                      min="0"
                      step="1"
                      placeholder="151 200"
                      value={odometer}
                      onChange={(event) => setOdometer(event.target.value)}
                    />
                    <span className="input-suffix">км</span>
                  </span>
                  <small>Можна додати пізніше з журналу.</small>
                </label>
                <button className={"location-choice " + (location ? "location-ready" : "")} type="button" onClick={captureLocation} disabled={locating}>
                  {locating ? <LoaderCircle className="spin" size={19} /> : location ? <Check size={19} /> : <MapPin size={19} />}
                  <span>
                    <strong>{locating ? "Визначаємо місце…" : location ? "Місце додано" : "Додати місце заправки"}</strong>
                    <small>{location ? "Координати буде збережено з записом" : "Необов’язково · запит з’явиться лише після натискання"}</small>
                  </span>
                  {!location && !locating ? <ChevronRight size={17} /> : null}
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="edit-fields">
            <label className="field-label" htmlFor="edit-date">
              Дата
              <input id="edit-date" className="plain-input" type="date" value={fillDate} onChange={(event) => setFillDate(event.target.value)} />
            </label>
            <label className="field-label" htmlFor="edit-price">
              Ціна одного літра
              <span className="input-shell"><span className="input-prefix">€</span><input id="edit-price" type="number" inputMode="decimal" min="0.001" step="0.001" value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} /></span>
            </label>
            <label className="field-label" htmlFor="edit-amount">
              Сплачено
              <span className="input-shell"><span className="input-prefix">€</span><input id="edit-amount" type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></span>
            </label>
            <label className="field-label" htmlFor="edit-odometer">
              Пробіг <span className="optional-word">необов’язково</span>
              <span className="input-shell"><input id="edit-odometer" type="number" inputMode="numeric" min="0" step="1" value={odometer} onChange={(event) => setOdometer(event.target.value)} /><span className="input-suffix">км</span></span>
            </label>
            <label className="field-label" htmlFor="edit-note">
              Опис заправки
              <textarea id="edit-note" className="note-input" placeholder="Додати нотатку" value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} />
            </label>
            <button className="delete-entry-trigger" type="button" onClick={() => setConfirmDelete(true)} disabled={saving}>
              <Trash2 size={16} />Видалити цей запис
            </button>
          </div>
        )}

        {mode === "edit" && confirmDelete ? (
          <div className="delete-confirm" role="alert">
            <strong>Видалити запис остаточно?</strong>
            <p>Запис буде видалено з бази сайту. Цю дію не можна скасувати.</p>
            <div>
              <button className="button-secondary" type="button" onClick={() => setConfirmDelete(false)} disabled={saving}>Залишити</button>
              <button className="button-danger" type="button" onClick={() => void removeEntry()} disabled={saving}>
                {saving ? <LoaderCircle className="spin" size={17} /> : <Trash2 size={16} />}Видалити остаточно
              </button>
            </div>
          </div>
        ) : null}

        {error ? <p className="form-error" role="alert"><CircleAlert size={16} />{error}</p> : null}

        <footer className="dialog-actions">
          {mode === "edit" ? (
            <>
              <button className="button-secondary" type="button" onClick={onClose} disabled={saving}>Скасувати</button>
              <button className="button-primary" type="button" onClick={() => void save()} disabled={saving}>
                {saving ? <LoaderCircle className="spin" size={18} /> : null}Зберегти зміни
              </button>
            </>
          ) : step < 4 ? (
            <>
              <span />
              <button className="button-primary" type="button" onClick={next}>Далі<ChevronRight size={17} /></button>
            </>
          ) : (
            <>
              {odometer.trim() ? (
                <button className="button-secondary skip-button" type="button" onClick={() => void save(true)} disabled={saving}>
                  {saving ? <LoaderCircle className="spin" size={18} /> : null}Без пробігу
                </button>
              ) : null}
              <button className="button-primary" type="button" onClick={() => void save()} disabled={saving}>
                {saving ? <LoaderCircle className="spin" size={18} /> : null}
                {odometer.trim() ? "Зберегти запис" : "Зберегти без пробігу"}
              </button>
            </>
          )}
        </footer>
      </section>
    </div>
  );
}

function CalendarIcon() {
  return <span className="calendar-glyph" aria-hidden="true">Д</span>;
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

  const refresh = useCallback(async () => {
    setLoadError("");
    try {
      const response = await fetch("/api/fuel", { cache: "no-store" });
      const result = (await response.json()) as { entries?: FuelEntry[]; error?: string };
      if (!response.ok) throw new Error(result.error || "Не вдалося завантажити журнал.");
      setEntries(Array.isArray(result.entries) ? result.entries : []);
      setVisibleEntryCount(HISTORY_PAGE_SIZE);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Не вдалося завантажити журнал.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);
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

  const consumptionEstimates = useMemo(() => {
    const chronological = [...completeEntries].sort((a, b) => {
      const dateOrder = (a.fillDate ?? "").localeCompare(b.fillDate ?? "");
      if (dateOrder !== 0) return dateOrder;
      if (a.odometer == null) return b.odometer == null ? 0 : 1;
      if (b.odometer == null) return -1;
      return a.odometer - b.odometer;
    });
    const litersPrefix = [0];
    const amountPrefix = [0];
    const odometerPoints: Array<{ index: number; value: number }> = [];

    chronological.forEach((entry, index) => {
      litersPrefix.push(litersPrefix[index] + (entry.liters ?? ((entry.amount ?? 0) / (entry.unitPrice || 1))));
      amountPrefix.push(amountPrefix[index] + (entry.amount ?? 0));
      if (entry.odometer != null && Number.isFinite(entry.odometer) && entry.odometer > 0) {
        odometerPoints.push({ index, value: entry.odometer });
      }
    });

    const intervals: Array<{ kilometers: number; liters: number; amount: number }> = [];
    for (let index = 1; index < odometerPoints.length; index += 1) {
      const previous = odometerPoints[index - 1];
      const current = odometerPoints[index];
      const kilometers = current.value - previous.value;
      const liters = litersPrefix[current.index + 1] - litersPrefix[previous.index + 1];
      const amount = amountPrefix[current.index + 1] - amountPrefix[previous.index + 1];
      if (kilometers > 0 && liters > 0) intervals.push({ kilometers, liters, amount });
    }

    const summarize = (items: typeof intervals): ConsumptionEstimate | null => {
      const kilometers = items.reduce((sum, item) => sum + item.kilometers, 0);
      if (!items.length || kilometers <= 0) return null;
      return {
        litersPer100Km: items.reduce((sum, item) => sum + item.liters, 0) / kilometers * 100,
        eurosPer100Km: items.reduce((sum, item) => sum + item.amount, 0) / kilometers * 100,
        intervalCount: items.length,
      };
    };
    return {
      recent: summarize(intervals.slice(-6)),
      all: summarize(intervals),
    };
  }, [completeEntries]);

  const totalSpend = completeEntries.reduce((sum, item) => sum + (item.amount ?? 0), 0);
  const totalLiters = completeEntries.reduce(
    (sum, item) => sum + (item.liters ?? ((item.amount ?? 0) / (item.unitPrice || 1))),
    0,
  );
  const odometerEntries = completeEntries
    .filter((item) => item.odometer != null)
    .sort((a, b) => (a.fillDate ?? "").localeCompare(b.fillDate ?? ""));
  const distanceSpan =
    odometerEntries.length > 1
      ? (odometerEntries[odometerEntries.length - 1].odometer ?? 0) - (odometerEntries[0].odometer ?? 0)
      : null;
  const currentMonthLabel = monthTitle(thisMonth);

  const onSaved = (message: string) => {
    setDialog(null);
    setToast(message);
    void refresh();
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
              ) : loading ? (
                <div className="loading-state"><LoaderCircle className="spin" size={20} />Завантажую записи…</div>
              ) : (
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
              )}
            </section>
          </>
        )}

        {tab === "analytics" && (
          <section className="analytics-page">
            <div className="page-heading">
              <div><p className="eyebrow">ВАШІ ДАНІ</p><h1>Статистика</h1></div>
              <span className="record-count">{completeEntries.length} заправок</span>
            </div>
            {loadError ? (
              <div className="error-panel" role="alert"><CircleAlert size={18} /><span>{loadError}</span></div>
            ) : loading ? (
              <div className="loading-state"><LoaderCircle className="spin" size={20} />Завантажую записи…</div>
            ) : completeEntries.length === 0 ? (
              <div className="empty-state analytics-empty"><div className="empty-icon"><BarChart3 size={22} /></div><h3>Поки немає даних</h3><p>Після перших заправок тут з’являться ваші витрати, ціна пального та пробіг.</p></div>
            ) : (
              <>
                <div className="metric-strip">
                  <div className="metric">
                    <span>Витрачено загалом</span>
                    <strong>{money.format(totalSpend)}</strong>
                  </div>
                  <div className="metric">
                    <span>Придбано приблизно</span>
                    <strong>{number.format(totalLiters)} <small>л</small></strong>
                  </div>
                  <div className="metric">
                    <span>Середній чек</span>
                    <strong>{money.format(totalSpend / completeEntries.length)}</strong>
                  </div>
                  {distanceSpan != null && distanceSpan >= 0 ? (
                    <div className="metric">
                      <span>Між крайніми записами пробігу</span>
                      <strong>{integer.format(distanceSpan)} <small>км</small></strong>
                    </div>
                  ) : null}
                </div>

                {selectedMonth ? <MonthDetailCard month={selectedMonth} /> : null}

                <section className="chart-section">
                  <div className="chart-heading">
                    <div><p className="eyebrow">ЗА МІСЯЦЯМИ</p><h2>Витрати</h2></div>
                    <span className="chart-unit">€</span>
                  </div>
                  <MonthlyBarChart
                    values={monthlyData}
                    selectedMonth={selectedMonth?.month ?? null}
                    onSelectMonth={setSelectedAnalyticsMonth}
                  />
                </section>

                <section className="chart-section price-section">
                  <div className="chart-heading">
                    <div><p className="eyebrow">СЕРЕДНЄ ЗА МІСЯЦЬ</p><h2>Ціна за літр</h2></div>
                    <span className="chart-unit">€/л</span>
                  </div>
                  <MonthlyPriceChart
                    values={monthlyData}
                    selectedMonth={selectedMonth?.month ?? null}
                    onSelectMonth={setSelectedAnalyticsMonth}
                  />
                </section>

                <p className="chart-scroll-hint">Торкніться місяця на графіку · поточний період праворуч · гортайте вліво до давніших</p>
                <ConsumptionCard recent={consumptionEstimates.recent} all={consumptionEstimates.all} />
              </>
            )}
          </section>
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
            ) : loading ? (
              <div className="loading-state"><LoaderCircle className="spin" size={20} />Завантажую записи…</div>
            ) : (
              <FuelMap
                key={entries
                  .filter((item) => item.latitude != null && item.longitude != null)
                  .map((item) => item.id + ":" + item.latitude + "," + item.longitude)
                  .join("|")}
                entries={entries}
                onAdd={() => setDialog({ mode: "new", entry: null })}
              />
            )}
            <p className="map-privacy"><MapPin size={15} /> Місце зберігається лише для записів, де ви надали доступ до геолокації.</p>
          </section>
        )}
      </div>

      <button className="fab" type="button" onClick={() => setDialog({ mode: "new", entry: null })} aria-label="Додати заправку">
        <Plus size={25} strokeWidth={2.2} />
      </button>
      <BottomNavigation active={tab} onSelect={setTab} />

      {dialog ? (
        <FuelDialog
          key={dialog.mode + (dialog.entry?.id ?? "new")}
          mode={dialog.mode}
          entry={dialog.entry}
          lastPrice={lastPrice}
          onClose={() => setDialog(null)}
          onSaved={onSaved}
        />
      ) : null}
      <div className={toast ? "toast toast-visible" : "toast"} role="status" aria-live="polite">{toast ? <><Check size={17} />{toast}</> : null}</div>
    </main>
  );
}
