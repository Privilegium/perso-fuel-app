import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { fuelEntries } from "@/db/schema";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const [deleted] = await getDb()
      .delete(fuelEntries)
      .where(eq(fuelEntries.id, id))
      .returning({ id: fuelEntries.id });
    if (!deleted) return Response.json({ error: "Заправку не знайдено." }, { status: 404 });
    return Response.json({ deleted: true, id: deleted.id });
  } catch (error) {
    console.error("fuel delete error", error);
    return Response.json(
      { error: "Не вдалося видалити запис. Спробуйте ще раз." },
      { status: 503 },
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const payload = (await request.json()) as Record<string, unknown>;
    const set: Partial<typeof fuelEntries.$inferInsert> = {
      updatedAt: new Date().toISOString(),
    };

    if ("odometer" in payload) {
      const value =
        payload.odometer === null || payload.odometer === ""
          ? null
          : Number(payload.odometer);
      if (value !== null && (!Number.isFinite(value) || value < 0)) {
        return Response.json({ error: "Перевірте показник пробігу." }, { status: 400 });
      }
      set.odometer = value;
    }
    if ("unitPrice" in payload) {
      const value = Number(payload.unitPrice);
      if (!Number.isFinite(value) || value <= 0 || value > 20) {
        return Response.json({ error: "Перевірте ціну за літр." }, { status: 400 });
      }
      set.unitPrice = Math.round(value * 1000) / 1000;
    }
    if ("amount" in payload) {
      const value = Number(payload.amount);
      if (!Number.isFinite(value) || value <= 0 || value > 10000) {
        return Response.json({ error: "Перевірте суму оплати." }, { status: 400 });
      }
      set.amount = Math.round(value * 100) / 100;
    }
    if ("fillDate" in payload) {
      const value = typeof payload.fillDate === "string" ? payload.fillDate : "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return Response.json({ error: "Перевірте дату." }, { status: 400 });
      }
      set.fillDate = value;
    }
    if ("note" in payload) {
      set.note =
        typeof payload.note === "string" ? payload.note.trim().slice(0, 500) || null : null;
    }
    if (set.unitPrice !== undefined || set.amount !== undefined) {
      const [current] = await getDb()
        .select({ amount: fuelEntries.amount, unitPrice: fuelEntries.unitPrice })
        .from(fuelEntries)
        .where(eq(fuelEntries.id, id))
        .limit(1);
      const amount = set.amount ?? current?.amount;
      const unitPrice = set.unitPrice ?? current?.unitPrice;
      set.liters = amount != null && unitPrice ? amount / unitPrice : null;
    }

    const [entry] = await getDb()
      .update(fuelEntries)
      .set(set)
      .where(eq(fuelEntries.id, id))
      .returning();
    if (!entry) return Response.json({ error: "Заправку не знайдено." }, { status: 404 });
    return Response.json({ entry });
  } catch (error) {
    console.error("fuel edit error", error);
    return Response.json(
      { error: "Не вдалося оновити запис. Спробуйте ще раз." },
      { status: 503 },
    );
  }
}
