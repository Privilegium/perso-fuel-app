import { desc, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { fuelEntries } from "@/db/schema";

function errorResponse(error: unknown) {
  console.error("fuel API error", error);
  const message = error instanceof Error ? error.message : "";
  const friendly =
    message.includes("no such table") || message.includes("fuel_entries")
      ? "База ще готується. Оновіть сторінку за хвилину."
      : "Не вдалося зберегти дані. Спробуйте ще раз.";
  return Response.json({ error: friendly }, { status: 503 });
}

export async function GET(request: Request) {
  try {
    const db = getDb();
    const rows = await db
      .select({
        id: fuelEntries.id,
        sourceNotionId: fuelEntries.sourceNotionId,
        fillDate: fuelEntries.fillDate,
        unitPrice: fuelEntries.unitPrice,
        amount: fuelEntries.amount,
        liters: fuelEntries.liters,
        odometer: fuelEntries.odometer,
        latitude: fuelEntries.latitude,
        longitude: fuelEntries.longitude,
        locationAccuracy: fuelEntries.locationAccuracy,
        note: fuelEntries.note,
      })
      .from(fuelEntries)
      .orderBy(
        sql.raw("case when fill_date is null then 1 else 0 end"),
        desc(fuelEntries.fillDate),
        desc(fuelEntries.createdAt),
      );
    const body = JSON.stringify({ entries: rows });
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
    const etag = '"' + Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("") + '"';
    const headers = { "content-type": "application/json", "cache-control": "private, no-cache", etag, vary: "Cookie" };
    if (request.headers.get("if-none-match")?.split(",").map((value) => value.trim()).some((value) => value === etag || value === "W/" + etag || value === "*")) {
      return new Response(null, { status: 304, headers });
    }
    return new Response(body, { headers });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const unitPrice = Number(payload.unitPrice);
    const amount = Number(payload.amount);
    const fillDate = typeof payload.fillDate === "string" ? payload.fillDate : "";
    const odometer =
      payload.odometer === null || payload.odometer === "" || payload.odometer === undefined
        ? null
        : Number(payload.odometer);
    const latitude =
      payload.latitude === null || payload.latitude === undefined
        ? null
        : Number(payload.latitude);
    const longitude =
      payload.longitude === null || payload.longitude === undefined
        ? null
        : Number(payload.longitude);
    const locationAccuracy =
      payload.locationAccuracy === null || payload.locationAccuracy === undefined
        ? null
        : Number(payload.locationAccuracy);
    const note = typeof payload.note === "string" ? payload.note.trim().slice(0, 500) : "";

    if (!Number.isFinite(unitPrice) || unitPrice <= 0 || unitPrice > 20) {
      return Response.json({ error: "Перевірте ціну за літр." }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount <= 0 || amount > 10000) {
      return Response.json({ error: "Перевірте суму оплати." }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fillDate)) {
      return Response.json({ error: "Не вдалося визначити дату запису." }, { status: 400 });
    }
    if (odometer !== null && (!Number.isFinite(odometer) || odometer < 0)) {
      return Response.json({ error: "Перевірте показник пробігу." }, { status: 400 });
    }
    if (
      (latitude === null) !== (longitude === null) ||
      (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) ||
      (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180))
    ) {
      return Response.json({ error: "Координати місця некоректні." }, { status: 400 });
    }

    const db = getDb();
    const [entry] = await db
      .insert(fuelEntries)
      .values({
        id: crypto.randomUUID(),
        fillDate,
        unitPrice: Math.round(unitPrice * 1000) / 1000,
        amount: Math.round(amount * 100) / 100,
        liters: amount / unitPrice,
        odometer,
        latitude,
        longitude,
        locationAccuracy,
        note: note || null,
      })
      .returning();
    return Response.json({ entry }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
