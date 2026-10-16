import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { financeExports } from "@/db/schema";
import { deliverExpense, FinanceConflict, type FuelExpense } from "@/lib/finance-export";

export async function syncFuelExpense(id: string) {
  const db = getDb();
  const [row] = await db.select().from(financeExports).where(eq(financeExports.fuelId, id)).limit(1);
  if (!row) return { status: "unlinked" as const };
  if (row.status === "synced" || row.status === "conflict") return { status: row.status, message: row.message };
  const token = (env as unknown as { FINANCE_HUB_SERVICE_TOKEN?: string }).FINANCE_HUB_SERVICE_TOKEN;
  let status = "pending", message = "Передачу ще не підтверджено. Спробуйте повторити.";
  if (token) {
    try { await deliverExpense(JSON.parse(row.payload) as FuelExpense, token); status = "synced"; message = "Витрату записано у Finance HUB."; }
    catch (error) {
      // Never return or log upstream responses/credentials/private ledger data.
      if (error instanceof FinanceConflict) { status = "conflict"; message = error.message; }
    }
  } else message = "З’єднання з Finance HUB ще не налаштовано.";
  // A concurrent success must never be downgraded by an uncertain response.
  await db.update(financeExports).set({ status, message }).where(
    and(eq(financeExports.fuelId, id), eq(financeExports.status, "pending")),
  );
  const [latest] = await db.select({ status: financeExports.status, message: financeExports.message }).from(financeExports).where(eq(financeExports.fuelId, id));
  return latest;
}
