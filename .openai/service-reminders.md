# Service reminders

This owner-private Site stores service items, historical service records, device push subscriptions and delivery keys in its existing D1 database. Fuel records remain independent. New tables are added through the appended Drizzle migration; no maintenance dates are fabricated or seeded.

The daily linked task should get the current Site with project ID `appgprj_6ac8aac342f08191bc28c826774c3581`, obtain its existing service-access token in memory, and POST an empty body to `https://fuel-log-sviat.opryshkosm.chatgpt.site/api/service/dispatch` with `OAI-Sites-Authorization: Bearer <token>`. Never create/rotate a token, put it in files/prompts/logs, or send it to another origin. If the supported token is unavailable, report a blocked check. A successful JSON response confirms the check; it contains configured/due/subscriptions/sent/failed counts. Failed counts require attention. No publication is needed for routine runs. Never replay fuel or financial writes.

Dispatch recalculates status from service history and the latest dated fuel entry containing mileage. It sends one encrypted Web Push per enabled service, device, service cycle and severity. Retries after push-service errors are possible; expired subscriptions are removed. A new replacement/inspection resets that service's cycle. Individual reminder switches are persisted in D1; permission and subscription are per device. A switch alone does not grant notification permission. Unknown dates/mileage never produce invented due warnings. The device subscribes only after the user's explicit button click; on iPhone use the Home Screen app (iOS 16.4+).

VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are configured in Sites runtime variables; only the private key is secret. The browser receives only the public key. The existing service worker displays every push and opens the Service tab when tapped. Requests after fuel creation/edits also calculate reminders after the response via `after()`, so a fuel save is not held up by push delivery.

This shared updater depends on owner-private platform access. If sharing changes, add explicit authorization before using the endpoint with a wider audience.
