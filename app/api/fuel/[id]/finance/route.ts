import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { financeExports } from "@/db/schema";
import { syncFuelExpense } from "@/lib/finance-sync";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const [row] = await getDb().select({ status: financeExports.status, message: financeExports.message }).from(financeExports).where(eq(financeExports.fuelId, id)).limit(1);
  return Response.json(row ?? { status: "unlinked" }, { headers: { "cache-control": "private, no-store" } });
}
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("x-fuel-intent") !== "finance-sync") return new Response(null, { status: 403 });
  const { id } = await context.params;
  return Response.json(await syncFuelExpense(id), { headers: { "cache-control": "private, no-store" } });
}
