import { getDb } from "@/db";
import { fuelEntries } from "@/db/schema";

type ImportRow = {
  source_notion_id?: string;
  source_notion_url?: string;
  date?: string | null;
  unit_price?: number | null;
  amount?: number | null;
  liters?: number | null;
  odometer?: number | null;
  note?: string | null;
  legacy_status?: string | null;
};

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { records?: ImportRow[] };
    if (!Array.isArray(payload.records) || payload.records.length > 200) {
      return Response.json({ error: "Файл імпорту має містити до 200 записів." }, { status: 400 });
    }

    const importedAt = new Date().toISOString();
    const entries = payload.records.map((row, index) => {
      const sourceNotionId = typeof row.source_notion_id === "string" ? row.source_notion_id : "";
      if (!sourceNotionId || sourceNotionId.length > 80) {
        throw new Error("У записі " + (index + 1) + " відсутній ідентифікатор Notion.");
      }
      const validDate = typeof row.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.date);
      const unitPrice = typeof row.unit_price === "number" && row.unit_price > 0 ? row.unit_price : null;
      const amount = typeof row.amount === "number" && row.amount > 0 ? row.amount : null;
      const liters =
        typeof row.liters === "number" && Number.isFinite(row.liters)
          ? row.liters
          : amount && unitPrice
            ? amount / unitPrice
            : null;

      return {
        id: "notion-" + sourceNotionId,
        sourceNotionId,
        sourceNotionUrl:
          typeof row.source_notion_url === "string" ? row.source_notion_url : null,
        fillDate: validDate ? row.date! : null,
        unitPrice,
        amount,
        liters,
        odometer:
          typeof row.odometer === "number" && Number.isFinite(row.odometer)
            ? row.odometer
            : null,
        note: typeof row.note === "string" ? row.note.slice(0, 500) || null : null,
        legacyStatus:
          typeof row.legacy_status === "string" ? row.legacy_status.slice(0, 80) : null,
        createdAt: importedAt,
        updatedAt: importedAt,
      };
    });

    const db = getDb();
    let inserted = 0;
    // D1 limits the number of bind variables in one statement; each row binds 12 values.
    for (let index = 0; index < entries.length; index += 7) {
      const result = await db
        .insert(fuelEntries)
        .values(entries.slice(index, index + 7))
        .onConflictDoNothing({ target: fuelEntries.sourceNotionId })
        .returning({ id: fuelEntries.id });
      inserted += result.length;
    }

    return Response.json({
      received: entries.length,
      inserted,
      alreadyImported: entries.length - inserted,
    });
  } catch (error) {
    console.error("fuel import error", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Не вдалося імпортувати записи." },
      { status: 400 },
    );
  }
}
