import { env } from "cloudflare:workers";
import { eq, sql } from "drizzle-orm";
import { buildPushPayload } from "@block65/webcrypto-web-push";
import { getDb } from "@/db";
import { pushSubscriptions, reminderDeliveries } from "@/db/schema";
import { serviceStatus, parisDay } from "@/lib/service-model";
import { readServices, readCurrentMileage } from "@/lib/service-store";

export function pushConfig() {
  const values = env as unknown as Record<string, string | undefined>;
  return { publicKey: values.VAPID_PUBLIC_KEY, privateKey: values.VAPID_PRIVATE_KEY,
    subject: "https://fuel-log-sviat.opryshkosm.chatgpt.site/" };
}
// Push endpoints are browser-issued capability URLs. Limit destinations to the
// actual browser push services to keep this private endpoint from becoming SSRF.
export function validPushEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && !url.username && !url.password && !url.port &&
      (url.hostname === "web.push.apple.com" || url.hostname.endsWith(".push.apple.com") ||
       url.hostname === "fcm.googleapis.com" || url.hostname === "updates.push.services.mozilla.com" ||
       url.hostname.endsWith(".notify.windows.com"));
  } catch { return false; }
}
export async function dispatchServiceReminders() {
  const config = pushConfig();
  const db = getDb();
  const [data, mileage, subscriptions] = await Promise.all([readServices(), readCurrentMileage(), db.select().from(pushSubscriptions).limit(30)]);
  const today = parisDay();
  const due = data.items.filter(item => item.reminders).map(item => ({ item, status: serviceStatus(item, data.records, mileage, today) }))
    .filter(({ status }) => status.level === "warning" || status.level === "overdue");
  if (!config.publicKey || !config.privateKey) return { configured: false, due: due.length, subscriptions: subscriptions.length, sent: 0, failed: 0 };
  let sent = 0, failed = 0;
  for (const subscription of subscriptions) {
    if (!validPushEndpoint(subscription.endpoint)) continue;
    for (const { item, status } of due) {
      const key = `${subscription.id}:${status.reminderKey}`;
      const claim = await db.insert(reminderDeliveries).values({ id: key }).onConflictDoNothing().returning({ id: reminderDeliveries.id });
      if (!claim.length) continue;
      try {
        const body = status.reason === "distance"
          ? `Від останнього запису: ${Math.round(status.distance ?? 0).toLocaleString("uk-UA")} км. ${status.label}.`
          : `${status.label}. Термін: ${status.level === "warning" ? status.recommendedDate : status.dueDate}.`;
        const payload = await buildPushPayload({ data: { title: item.title, body, tag: `service-${item.id}`, url: "/?tab=service" }, options: { ttl: 86400, urgency: "normal" } },
          { endpoint: subscription.endpoint, expirationTime: null, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, config);
        const response = await fetch(subscription.endpoint, { ...payload, signal: AbortSignal.timeout(10000), redirect: "error" });
        if (response.status === 404 || response.status === 410) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, subscription.id));
          break;
        }
        if (!response.ok) throw new Error("Push service rejected message");
        sent++;
      } catch {
        failed++;
        await db.delete(reminderDeliveries).where(eq(reminderDeliveries.id, key));
      }
    }
  }
  await db.delete(reminderDeliveries).where(sql`sent_at < datetime('now', '-400 days')`);
  return { configured: true, due: due.length, subscriptions: subscriptions.length, sent, failed };
}
