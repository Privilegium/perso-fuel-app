import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { pushConfig, validPushEndpoint } from "@/lib/service-push";

const headers = { "cache-control": "private, no-store" };
const schema = z.object({ endpoint: z.string().max(2048).refine(validPushEndpoint),
  keys: z.object({ p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}$/), auth: z.string().regex(/^[A-Za-z0-9_-]{22}$/) }) });
export async function GET() {
  const { publicKey, privateKey } = pushConfig();
  return Response.json({ publicKey: publicKey ?? null, configured: !!(publicKey && privateKey) }, { headers });
}
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "Недозволений запит." }, { status: 403, headers });
  try {
    const data = schema.parse(await request.json());
    const config = pushConfig();
    if (!config.publicKey || !config.privateKey) return Response.json({ error: "Сповіщення ще не налаштовано." }, { status: 503, headers });
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data.endpoint));
    const id = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    await getDb().insert(pushSubscriptions).values({ id, endpoint: data.endpoint, ...data.keys })
      .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: data.keys });
    return Response.json({ subscribed: true }, { headers });
  } catch { return Response.json({ error: "Не вдалося під’єднати сповіщення. Спробуйте ще раз." }, { status: 400, headers }); }
}
export async function DELETE(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "Недозволений запит." }, { status: 403, headers });
  const { endpoint } = z.object({ endpoint: z.string().max(2048) }).parse(await request.json());
  await getDb().delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
  return Response.json({ subscribed: false }, { headers });
}
