import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { financeExports, fuelEntries } from "@/db/schema";
import { after } from "next/server";
import { fuelExpense } from "@/lib/finance-export";
import { syncFuelExpense } from "@/lib/finance-sync";

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

    const id = typeof payload.id === "string" ? payload.id : crypto.randomUUID();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return Response.json({ error: "Некоректний ідентифікатор запису." }, { status: 400 });
    if (payload.financeAccount !== undefined && request.headers.get("origin") !== new URL(request.url).origin) return new Response(null, { status: 403 });
    const values = {
        id,
        fillDate,
        unitPrice: Math.round(unitPrice * 1000) / 1000,
        amount: Math.round(amount * 100) / 100,
        liters: amount / unitPrice,
        odometer,
        latitude,
        longitude,
        locationAccuracy,
        note: note || null,
    };
    let expense;
    try { expense = payload.financeAccount === undefined ? null : fuelExpense(values, payload.financeAccount, payload.financeNativeAmount); }
    catch (error) { return Response.json({ error: (error as Error).message }, { status: 400 }); }
    const db = getDb();
    const [previous] = await db.select().from(fuelEntries).where(eq(fuelEntries.id, id)).limit(1);
    const [previousExport] = previous ? await db.select().from(financeExports).where(eq(financeExports.fuelId, id)).limit(1) : [];
    if (previous && (Object.entries(values).some(([key, value]) => previous[key as keyof typeof previous] !== value) ||
      (previousExport?.payload ?? null) !== (expense ? JSON.stringify(expense) : null))) {
      return Response.json({ error: "Цю заправку вже збережено. Закрийте форму й перевірте запис в історії." }, { status: 409 });
    }
    const insert = db.insert(fuelEntries).values(values).onConflictDoNothing();
    // D1 batch is atomic: a fuel row and its finance intent are saved together.
    if (expense) await db.batch([insert, db.insert(financeExports).values({ fuelId: id, payload: JSON.stringify(expense) }).onConflictDoNothing()]);
    else await insert;
    const [entry] = await db.select().from(fuelEntries).where(eq(fuelEntries.id, id)).limit(1);
    const [storedExport] = expense ? await db.select().from(financeExports).where(eq(financeExports.fuelId, id)).limit(1) : [];
    if (!entry || Object.entries(values).some(([key, value]) => entry[key as keyof typeof entry] !== value) ||
      (storedExport?.payload ?? null) !== (expense ? JSON.stringify(expense) : null)) {
      return Response.json({ error: "Цю заправку вже збережено з іншими даними. Перевірте історію." }, { status: 409 });
    }
    const finance = expense ? await syncFuelExpense(id).catch(() => ({ status: "pending", message: "Заправка збережена. Повторіть передачу з редагування запису." })) : null;
    after(async () => { await (await import("@/lib/service-push")).dispatchServiceReminders(); });
    return Response.json({ entry, finance }, { status: previous ? 200 : 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
