import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { serviceItems, serviceRecords } from "@/db/schema";
import { DEFAULT_SERVICES, parisDay } from "@/lib/service-model";
import { readServices } from "@/lib/service-store";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(value + "T12:00:00Z");
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value && value <= parisDay();
}, "Перевірте дату: вона не може бути в майбутньому.");
const payloadSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("record"), serviceId: z.string().max(80), id: z.string().uuid(),
    performedOn: day, odometer: z.number().min(0).max(10000000).nullable(),
    recordAction: z.enum(["replacement", "inspection"]), note: z.string().max(500) }),
  z.object({ action: z.literal("reminders"), serviceId: z.string().max(80), enabled: z.boolean() }),
  z.object({ action: z.literal("create"), id: z.string().uuid(), title: z.string().trim().min(1).max(80),
    intervalMonths: z.number().int().min(1).max(120).nullable(), intervalKm: z.number().int().min(100).max(500000).nullable() }),
  z.object({ action: z.literal("delete-record"), serviceId: z.string().max(80), id: z.string().uuid() }),
  z.object({ action: z.literal("delete-service"), serviceId: z.string().uuid() }),
]);
const headers = { "cache-control": "private, no-store" };
export async function GET() {
  try { return Response.json(await readServices(), { headers }); }
  catch { return Response.json({ error: "Не вдалося завантажити сервіс." }, { status: 503, headers }); }
}
export async function POST(request: Request) {
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "Запит з іншого сайту відхилено." }, { status: 403, headers });
  try {
    const data = payloadSchema.parse(await request.json());
    const db = getDb();
    if (data.action === "create") {
      await db.insert(serviceItems).values({ id: data.id, title: data.title, kind: "custom", intervalMonths: data.intervalMonths, intervalKm: data.intervalKm }).onConflictDoNothing();
    } else {
      const builtIn = DEFAULT_SERVICES.find(item => item.id === data.serviceId);
      if (builtIn) await db.insert(serviceItems).values(builtIn).onConflictDoNothing();
      const [item] = await db.select().from(serviceItems).where(eq(serviceItems.id, data.serviceId)).limit(1);
      if (!item) return Response.json({ error: "Сервіс не знайдено." }, { status: 404, headers });
      if (data.action === "reminders") {
        await db.update(serviceItems).set({ reminders: data.enabled }).where(eq(serviceItems.id, data.serviceId));
      } else if (data.action === "record") {
        if (item.kind === "oil-filter") return Response.json({ error: "Масляний фільтр оновлюється разом із маслом." }, { status: 400, headers });
        if (data.recordAction === "inspection" && !["wipers", "inspection", "custom"].includes(item.kind)) return Response.json({ error: "Для цього сервісу запишіть заміну." }, { status: 400, headers });
        // Stable client ID makes retries safe without creating a second record.
        await db.insert(serviceRecords).values({ id: data.id, serviceId: item.id, performedOn: data.performedOn,
          odometer: data.odometer, action: data.recordAction, note: data.note.trim() || null, createdAt: new Date().toISOString() })
          .onConflictDoUpdate({ target: serviceRecords.id, set: { performedOn: data.performedOn, odometer: data.odometer, action: data.recordAction, note: data.note.trim() || null }, where: eq(serviceRecords.serviceId, item.id) });
      } else if (data.action === "delete-record") {
        await db.delete(serviceRecords).where(and(eq(serviceRecords.id, data.id), eq(serviceRecords.serviceId, item.id)));
      } else if (data.action === "delete-service") {
        await db.batch([db.delete(serviceRecords).where(eq(serviceRecords.serviceId, item.id)), db.delete(serviceItems).where(eq(serviceItems.id, item.id))]);
      }
    }
    return Response.json(await readServices(), { headers });
  } catch (error) {
    return Response.json({ error: error instanceof z.ZodError ? error.issues[0]?.message ?? "Перевірте поля." : "Не вдалося зберегти. Перевірте інтернет і повторіть." }, { status: error instanceof z.ZodError ? 400 : 503, headers });
  }
}
