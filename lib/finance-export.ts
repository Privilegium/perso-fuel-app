// Shared contract contains no credentials. Transport is used by server code only.
export type FinanceAccount = "cash" | "bourso" | "ukrsib";
export type FinanceExportStatus = "pending" | "synced" | "conflict";
export const FINANCE_ACCOUNTS = [
  { id: "cash", label: "Готівка" },
  { id: "bourso", label: "BoursoBank" },
  { id: "ukrsib", label: "Укрсиб" },
] as const;
export const FINANCE_ORIGIN = "https://finance-hub-sviat.opryshkosm.chatgpt.site";
export type FuelExpense = {
  id: string; date: string; budgetMonth: string; account: FinanceAccount;
  category: string; kind: "expense"; role: "consumption"; amountEUR: number;
  amountNative: number; currency: "EUR" | "UAH"; sign: -1; note: string;
  status: "settled"; source: "Моє пальне"; budgetIncluded: boolean; revision: number;
  originalAmount: number; originalCurrency: "EUR";
};
export function fuelExpense(entry: { id: string; fillDate: string; amount: number; note: string | null }, account: unknown, nativeAmount?: unknown): FuelExpense {
  if (account !== "cash" && account !== "bourso" && account !== "ukrsib") throw new Error("Виберіть рахунок оплати.");
  const cents = Math.round(entry.amount * 100);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.fillDate) || Number.isNaN(Date.parse(entry.fillDate)) || new Date(entry.fillDate).toISOString().slice(0,10) !== entry.fillDate) throw new Error("Перевірте дату заправки.");
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 1000000) throw new Error("Перевірте суму оплати.");
  const nativeCents = account === "ukrsib" && typeof nativeAmount === "number" ? Math.round(nativeAmount * 100) : cents;
  if (account === "ukrsib" && (typeof nativeAmount !== "number" || !Number.isSafeInteger(nativeCents) || nativeCents <= 0 || nativeCents > 100000000)) throw new Error("Вкажіть фактичну суму списання у гривнях.");
  return { id: "fuel-log:" + entry.id, date: entry.fillDate, budgetMonth: entry.fillDate.slice(0, 7),
    account, category: "cat-8500854d1b", kind: "expense", role: "consumption", amountEUR: cents,
    amountNative: nativeCents, currency: account === "ukrsib" ? "UAH" : "EUR", sign: -1, note: entry.note ?? "", status: "settled",
    source: "Моє пальне", budgetIncluded: account !== "ukrsib", revision: 0, originalAmount: cents, originalCurrency: "EUR" };
}
type Snapshot = { revision: number; state: { accounts: { id: string; currency: string; budget: boolean }[];
  categories: { id: string; archived?: boolean }[]; transactions: (FuelExpense & { voided?: boolean })[] } };
export class FinanceConflict extends Error {}
function sameExpense(actual: Snapshot["state"]["transactions"][number], expected: FuelExpense) {
  return !actual.voided && Object.entries(expected).every(([key, value]) => key === "revision" || actual[key as keyof FuelExpense] === value);
}

// An uncertain POST is reconciled by ID on the next explicit retry. Never
// overwrite an existing Finance HUB record, including a user's manual changes.
export async function deliverExpense(expense: FuelExpense, token: string, transport: typeof fetch = fetch): Promise<void> {
  const signal = AbortSignal.timeout(10000);
  const headers = { "OAI-Sites-Authorization": "Bearer " + token, "accept": "application/json" };
  for (let attempt = 0; attempt < 3; attempt++) {
    const read = await transport(FINANCE_ORIGIN + "/api/finance", { headers, signal, redirect: "error", cache: "no-store" });
    if (!read.ok) throw new Error("Finance HUB тимчасово недоступний.");
    const snapshot = await read.json() as Snapshot;
    if (!Number.isSafeInteger(snapshot.revision) || !Array.isArray(snapshot.state?.transactions)) throw new Error("Не вдалося прочитати Finance HUB.");
    const existing = snapshot.state.transactions.find(row => row.id === expense.id);
    if (existing) {
      if (sameExpense(existing, expense)) return;
      throw new FinanceConflict("Пов’язана витрата вже змінена у Finance HUB. Перевірте її вручну.");
    }
    const account = snapshot.state.accounts.find(row => row.id === expense.account);
    if (!account || account.currency !== expense.currency || account.budget !== expense.budgetIncluded ||
      !snapshot.state.categories.some(row => row.id === expense.category && !row.archived)) {
      throw new FinanceConflict("Рахунок або категорія у Finance HUB змінилися. Перевірте налаштування.");
    }
    const response = await transport(FINANCE_ORIGIN + "/api/finance", { method: "POST", redirect: "error", signal,
      headers: { ...headers, "content-type": "application/json", "x-finance-intent": "update" },
      body: JSON.stringify({ revision: snapshot.revision, operation: { action: "transaction.save", data: { transaction: expense } } }) });
    if (response.status === 409) { await response.body?.cancel(); continue; }
    if (!response.ok) throw new Error("Не вдалося підтвердити запис у Finance HUB.");
    const result = await response.json() as Snapshot;
    const saved = result.state?.transactions?.find(row => row.id === expense.id);
    if (!saved || !sameExpense(saved, expense)) throw new Error("Finance HUB не підтвердив витрату.");
    return;
  }
  throw new Error("Облік змінюється на іншому пристрої. Повторіть передачу.");
}
