import { dispatchServiceReminders } from "@/lib/service-push";

// Owner-private Site access is enforced by Sites dispatch, including the
// platform service credential used by the linked daily task. Never expose this
// shared updater on a public Site without adding its own authorization.
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return new Response(null, { status: 403 });
  try {
    return Response.json(await dispatchServiceReminders(), { headers: { "cache-control": "private, no-store" } });
  } catch { return Response.json({ error: "Перевірка нагадувань не вдалася." }, { status: 503 }); }
}
