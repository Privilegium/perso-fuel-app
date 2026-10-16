import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

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

export const serviceItems = sqliteTable("service_items", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  kind: text("kind").notNull(),
  intervalMonths: integer("interval_months"),
  intervalKm: integer("interval_km"),
  reminders: integer("reminders", { mode: "boolean" }).notNull().default(false),
});

export const serviceRecords = sqliteTable("service_records", {
  id: text("id").primaryKey(),
  serviceId: text("service_id").notNull().references(() => serviceItems.id),
  performedOn: text("performed_on").notNull(),
  odometer: real("odometer"),
  action: text("action").notNull(),
  note: text("note"),
  createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
}, table => [index("service_records_service_date_idx").on(table.serviceId, table.performedOn)]);

export const pushSubscriptions = sqliteTable("push_subscriptions", {
  id: text("id").primaryKey(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
});

export const reminderDeliveries = sqliteTable("reminder_deliveries", {
  id: text("id").primaryKey(),
  sentAt: text("sent_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
});
