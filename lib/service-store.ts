import { desc, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { serviceItems, serviceRecords, fuelEntries } from "@/db/schema";
import { mergeServices, type ServiceRecord } from "@/lib/service-model";

export async function readServices() {
  const db = getDb();
  const [items, records] = await Promise.all([
    db.select().from(serviceItems),
    db.select().from(serviceRecords).orderBy(desc(serviceRecords.performedOn), desc(serviceRecords.createdAt)),
  ]);
  return { items: mergeServices(items), records: records as ServiceRecord[] };
}
export async function readCurrentMileage() {
  const [row] = await getDb().select({ odometer: fuelEntries.odometer }).from(fuelEntries)
    .where(sql`odometer is not null and fill_date is not null`)
    .orderBy(desc(fuelEntries.fillDate), desc(fuelEntries.createdAt)).limit(1);
  return row?.odometer ?? null;
}
