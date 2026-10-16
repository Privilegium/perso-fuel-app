"use client";

import { MapPin, Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";

type MapEntry = {
  id: string;
  fillDate: string | null;
  amount: number | null;
  unitPrice: number | null;
  latitude: number | null;
  longitude: number | null;
  note: string | null;
};

const euro = new Intl.NumberFormat("uk-UA", { style: "currency", currency: "EUR" });
const TILE = 256;
const MAX_LATITUDE = 85.05112878;

function mercator(lat: number, lon: number, zoom: number) {
  const boundedLatitude = Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, lat));
  const scale = TILE * Math.pow(2, zoom);
  const sin = Math.sin((boundedLatitude * Math.PI) / 180);
  return {
    x: ((lon + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

function fittingZoom(points: MapEntry[], width: number, height: number) {
  if (points.length === 0) return 3;
  if (points.length === 1) return 14;
  const normalized = points.map((point) => {
    const value = mercator(point.latitude!, point.longitude!, 0);
    return { x: value.x / TILE, y: value.y / TILE };
  });
  const spanX = Math.max(...normalized.map((item) => item.x)) - Math.min(...normalized.map((item) => item.x));
  const spanY = Math.max(...normalized.map((item) => item.y)) - Math.min(...normalized.map((item) => item.y));
  if (spanX < 0.000001 && spanY < 0.000001) return 14;
  const availableWidth = Math.max(120, width * 0.72);
  const availableHeight = Math.max(120, height * 0.72);
  const zoomX = spanX > 0 ? Math.floor(Math.log2(availableWidth / (TILE * spanX))) : 19;
  const zoomY = spanY > 0 ? Math.floor(Math.log2(availableHeight / (TILE * spanY))) : 19;
  return Math.max(3, Math.min(15, zoomX, zoomY));
}

function displayDate(value: string | null) {
  if (!value) return "Дата відсутня";
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(value + "T12:00:00"));
}

export default function FuelMap({
  entries,
  onAdd,
}: {
  entries: MapEntry[];
  onAdd: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; x: number; y: number; panX: number; panY: number } | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [zoomOffset, setZoomOffset] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const points = useMemo(
    () => entries.filter((entry) => entry.latitude != null && entry.longitude != null),
    [entries],
  );

  useEffect(() => {
    if (!host.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((items) => {
      const rect = items[0]?.contentRect;
      if (rect && rect.width > 0 && rect.height > 0) {
        setSize((current) => current.width === rect.width && current.height === rect.height
          ? current : { width: rect.width, height: rect.height });
      }
    });
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);

  const center = points.length
    ? {
        latitude: points.reduce((sum, point) => sum + point.latitude!, 0) / points.length,
        longitude: points.reduce((sum, point) => sum + point.longitude!, 0) / points.length,
      }
    : { latitude: 0, longitude: 0 };
  const baseZoom = fittingZoom(points, size.width, size.height);
  const zoom = Math.max(3, Math.min(18, baseZoom + zoomOffset));
  const centerWorld = mercator(center.latitude, center.longitude, zoom);
  const minX = Math.floor((centerWorld.x - size.width / 2 - pan.x) / TILE);
  const maxX = Math.floor((centerWorld.x + size.width / 2 - pan.x) / TILE);
  const minY = Math.floor((centerWorld.y - size.height / 2 - pan.y) / TILE);
  const maxY = Math.floor((centerWorld.y + size.height / 2 - pan.y) / TILE);
  const worldTileCount = Math.pow(2, zoom);
  const tiles: Array<{ key: string; url: string; left: number; top: number }> = [];

  for (let tileY = minY; size.width > 0 && size.height > 0 && tileY <= maxY; tileY += 1) {
    if (tileY < 0 || tileY >= worldTileCount) continue;
    for (let tileX = minX; tileX <= maxX; tileX += 1) {
      const wrappedX = ((tileX % worldTileCount) + worldTileCount) % worldTileCount;
      tiles.push({
        key: zoom + "/" + wrappedX + "/" + tileY,
        url: "https://tile.openstreetmap.org/" + zoom + "/" + wrappedX + "/" + tileY + ".png",
        left: tileX * TILE - centerWorld.x + size.width / 2 + pan.x,
        top: tileY * TILE - centerWorld.y + size.height / 2 + pan.y,
      });
    }
  }

  const markerPositions = points.map((point) => {
    const world = mercator(point.latitude!, point.longitude!, zoom);
    return {
      point,
      left: world.x - centerWorld.x + size.width / 2 + pan.x,
      top: world.y - centerWorld.y + size.height / 2 + pan.y,
    };
  });
  const selected = points.find((point) => point.id === selectedId) ?? null;

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button, a")) return;
    drag.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      panX: pan.x,
      panY: pan.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    if (!start || start.pointerId !== event.pointerId) return;
    setPan({
      x: start.panX + event.clientX - start.x,
      y: start.panY + event.clientY - start.y,
    });
  };
  const onPointerEnd = () => { drag.current = null; };

  if (points.length === 0) {
    return (
      <div className="map-empty">
        <div className="map-empty-mark"><MapPin size={23} /></div>
        <h2>Тут будуть місця заправок</h2>
        <p>Під час наступного запису натисніть «Додати місце». Геолокація не потрібна для звичайного збереження.</p>
        <button className="map-add-link" type="button" onClick={onAdd}><Plus size={16} />Записати заправку</button>
      </div>
    );
  }

  return (
    <>
      <div
        ref={host}
        className="fuel-map-canvas"
        role="application"
        aria-label="Мапа збережених місць заправок"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        <div className="map-layer" aria-hidden="true">
          {tiles.map((tile) => (
            // OSM's raster tile layer is already optimized and must be fetched directly from its tile host.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={tile.key}
              src={tile.url}
              className="map-tile"
              alt=""
              width={TILE}
              height={TILE}
              decoding="async"
              draggable={false}
              style={{ left: tile.left, top: tile.top }}
            />
          ))}
        </div>
        <div className="map-markers">
          {markerPositions.map(({ point, left, top }) => (
            <button
              key={point.id}
              type="button"
              className={selectedId === point.id ? "map-marker map-marker-selected" : "map-marker"}
              style={{ left, top }}
              aria-label={"Заправка " + displayDate(point.fillDate) + (point.amount == null ? "" : ", " + euro.format(point.amount))}
              onClick={() => setSelectedId((current) => current === point.id ? null : point.id)}
            >
              <span><i>⛽</i></span>
            </button>
          ))}
        </div>
        {selected ? (
          <div className="map-popup">
            <button className="map-popup-close" type="button" aria-label="Закрити" onClick={() => setSelectedId(null)}><X size={14} /></button>
            <strong>{displayDate(selected.fillDate)}</strong>
            {selected.amount != null ? <span>{euro.format(selected.amount)}</span> : null}
            {selected.unitPrice != null ? <small>{euro.format(selected.unitPrice)} / л</small> : null}
            {selected.note ? <small>{selected.note}</small> : null}
          </div>
        ) : null}
        <div className="map-zoom-control">
          <button type="button" aria-label="Збільшити мапу" onClick={() => setZoomOffset((value) => Math.min(value + 1, 18 - baseZoom))}>+</button>
          <button type="button" aria-label="Зменшити мапу" onClick={() => setZoomOffset((value) => Math.max(value - 1, 3 - baseZoom))}>−</button>
        </div>
        <span className="map-attribution"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a></span>
      </div>
      <div className="map-footer">
        <span>{points.length} {points.length === 1 ? "місце" : "місць"} збережено · потягніть, щоб пересунути</span>
        <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noreferrer">Повідомити про помилку на мапі</a>
      </div>
    </>
  );
}
