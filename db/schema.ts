import { sql } from "drizzle-orm";
import { index, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const fuelEntries = sqliteTable(
  "fuel_entries",
  {
    id: text("id").primaryKey(),
    sourceNotionId: text("source_notion_id").unique(),
    sourceNotionUrl: text("source_notion_url"),
    fillDate: text("fill_date"),
    unitPrice: real("unit_price"),
    amount: real("amount"),
    liters: real("liters"),
    odometer: real("odometer"),
    latitude: real("latitude"),
    longitude: real("longitude"),
    locationAccuracy: real("location_accuracy"),
    note: text("note"),
    legacyStatus: text("legacy_status"),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
  },
  (table) => [index("fuel_entries_fill_date_idx").on(table.fillDate)],
);
