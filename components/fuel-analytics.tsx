"use client";

import { BarChart3, CircleAlert, Gauge, LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { money, priceMoney, number, integer, monthKey, monthTitle, monthAxisLabel, countNoun } from "@/lib/fuel-format";
import type { FuelEntry, MonthlyMetric, ConsumptionEstimate } from "@/lib/fuel-types";

const ANALYTICS_VISIBLE_MONTHS = 7;

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

function ChartEmpty() {
  return <p className="chart-empty">Дані з’являться після першої заправки.</p>;
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

export default function FuelAnalytics({ completeEntries, monthlyData, selectedMonth, setSelectedAnalyticsMonth, loading, loadError, hasSnapshot }: { completeEntries: FuelEntry[]; monthlyData: MonthlyMetric[]; selectedMonth: MonthlyMetric | null; setSelectedAnalyticsMonth: (month: string) => void; loading: boolean; loadError: string; hasSnapshot: boolean; }) {
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

  return (
          <section className="analytics-page">
            <div className="page-heading">
              <div><p className="eyebrow">ВАШІ ДАНІ</p><h1>Статистика</h1></div>
              <span className="record-count">{completeEntries.length} заправок</span>
            </div>
            {loadError ? (
              <div className="error-panel" role="alert"><CircleAlert size={18} /><span>{loadError}</span></div>
            ) : null}
            {loading ? (
              <div className="loading-state"><LoaderCircle className="spin" size={20} />Завантажую записи…</div>
            ) : loadError && !hasSnapshot ? null : completeEntries.length === 0 ? (
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
  );
}
