import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const origin = "https://fuel.test";
const core = ["/_next/static/app-123.js", "/_next/static/app-123.css"];
const template = await readFile(new URL("../build/fuel-service-worker.js", import.meta.url), "utf8");

function worker() {
  const stores = new Map(), handlers = new Map(), requests = [], messages = [], notifications = [], opened = [];
  let network;
  const urlOf = request => new URL(typeof request === "string" ? request : request.url, origin).href;
  const fetch = async request => {
    const url = urlOf(request);
    requests.push(url);
    if (network) return network(url, request);
    const response = new Response(url === origin + "/"
      ? `<html data-fuel-app="journal"><script src="${core[0]}"></script><link href="${core[1]}"/></html>`
      : "asset", { headers: { "content-type": url === origin + "/" ? "text/html" : "application/javascript" } });
    Object.defineProperty(response, "type", { value: "basic" });
    return response;
  };
  const caches = {
    keys: async () => [...stores.keys()],
    delete: async name => stores.delete(name),
    open: async name => {
      if (!stores.has(name)) stores.set(name, new Map());
      const items = stores.get(name);
      return {
        match: async key => items.get(urlOf(key))?.clone(),
        put: async (key, response) => items.set(urlOf(key), response.clone()),
        delete: async key => items.delete(urlOf(key)),
        keys: async () => [...items.keys()].map(url => new Request(url)),
        addAll: async keys => { for (const key of keys) { const response = await fetch(key); if (!response.ok) throw new Error("Failed precache"); items.set(urlOf(key), response.clone()); } },
      };
    },
  };
  let skipped = false, claimed = false;
  const self = {
    location: { origin },
    addEventListener: (name, handler) => handlers.set(name, handler),
    skipWaiting: () => { skipped = true; },
    registration: { showNotification: async (title, options) => notifications.push({ title, ...options }) },
    clients: { claim: async () => { claimed = true; }, openWindow: async url => opened.push(url), matchAll: async () => ["current", "other"].map(id => ({ id, url: origin + "/", focus: async () => {}, postMessage: message => messages.push({ id, ...message }) })) },
  };
  vm.runInNewContext(template.replace("__FUEL_VERSION__", '"test"').replace("__FUEL_CORE_ASSETS__", JSON.stringify(core)), { self, caches, fetch, URL, Response, Set });
  return {
    caches, stores, requests, messages, notifications, opened,
    emitEvent: async (type, extra) => {
      const pending = [];
      handlers.get(type)({ ...extra, waitUntil: promise => pending.push(promise) });
      await Promise.all(pending);
    },
    setNetwork: handler => { network = handler; },
    skipped: () => skipped, claimed: () => claimed,
    emit: (type, request, clientId = "current") => {
      let response;
      const background = [];
      handlers.get(type)({ request, clientId, waitUntil: value => { background.push(value); }, respondWith: value => { response = value; } });
      if (response) return response.then(async result => { await Promise.all(background); return result; });
      if (background.length) return Promise.all(background);
    },
  };
}

const navigation = () => ({ url: origin + "/", method: "GET", mode: "navigate" });

test("a repeat/offline launch and core assets use cache without network", async () => {
  const app = worker();
  await app.emit("install");
  const before = app.requests.length;
  app.setNetwork(() => { throw new Error("offline"); });
  assert.match(await (await app.emit("fetch", navigation())).text(), /data-fuel-app/);
  assert.equal(await (await app.emit("fetch", new Request(origin + core[0]))).text(), "asset");
  assert.equal(app.requests.length, before);
});

test("updates wait for old tabs, then remove only old shell/assets and keep journal", async () => {
  const app = worker();
  await app.caches.open("fuel-log-shell-old");
  await app.caches.open("fuel-log-assets-old");
  await app.caches.open("fuel-log-journal-v1");
  await app.caches.open("unrelated-app");
  await app.emit("install");
  assert.equal(app.skipped(), false);
  await app.emit("activate");
  assert.equal(app.claimed(), true);
  assert.deepEqual((await app.caches.keys()).sort(), ["fuel-log-assets-test", "fuel-log-journal-v1", "fuel-log-shell-test", "unrelated-app"].sort());
});

test("an auth redirect or mismatched build cannot become an offline shell", async () => {
  for (const response of [new Response("login", { status: 403 }), new Response('<html data-fuel-app="journal"><script src="/_next/static/new-build.js"></script></html>')]) {
    const app = worker();
    await app.caches.open("fuel-log-shell-old");
    app.setNetwork(() => response.clone());
    await assert.rejects(app.emit("install"));
    assert.deepEqual(await app.caches.keys(), ["fuel-log-shell-old"]);
  }
});

test("failed precaching is atomic and leaves the previous launch intact", async () => {
  const app = worker();
  await app.caches.open("fuel-log-shell-old");
  app.setNetwork(url => new Response(url === origin + "/" ? '<html data-fuel-app="journal"></html>' : "unavailable", { status: url === origin + "/" ? 200 : 503 }));
  await assert.rejects(app.emit("install"));
  assert.deepEqual(await app.caches.keys(), ["fuel-log-shell-old"]);
});

test("mutations go to network once, invalidate snapshots, and notify other tabs", async () => {
  const app = worker();
  await app.emit("install");
  await app.caches.open("fuel-log-journal-v1");
  app.setNetwork(() => Response.json({ entry: { id: "new" } }, { status: 201 }));
  const before = app.requests.length;
  const response = await app.emit("fetch", new Request(origin + "/api/fuel", { method: "POST", body: "{}" }));
  assert.equal(response.status, 201);
  assert.equal(app.requests.length, before + 1);
  assert.equal(app.stores.has("fuel-log-journal-v1"), false);
  assert.deepEqual(app.messages.map(item => [item.id, item.type]), [["other", "FUEL_JOURNAL_CHANGED"]]);
  assert.equal(app.stores.has("fuel-log-shell-test"), true);
});

test("access denial and explicit sign-out clear all private cached content", async () => {
  for (const path of ["/api/fuel", "/signout-with-chatgpt"]) {
    const app = worker();
    await app.emit("install");
    await app.caches.open("fuel-log-journal-v1");
    await app.caches.open("unrelated-app");
    app.setNetwork(() => new Response("denied", { status: 401 }));
    const response = await app.emit("fetch", new Request(origin + path));
    assert.equal(response.status, 401);
    assert.deepEqual(await app.caches.keys(), ["unrelated-app"]);
    assert.equal(app.messages.length, 2);
    assert.equal(app.messages[0].type, "FUEL_SESSION_CLEARED");
  }
});

test("transient server errors do not destroy the offline journal", async () => {
  const app = worker();
  await app.emit("install");
  await app.caches.open("fuel-log-journal-v1");
  app.setNetwork(() => new Response("server error", { status: 503, headers: { "content-type": "text/html" } }));
  assert.equal((await app.emit("fetch", new Request(origin + "/api/fuel"))).status, 503);
  assert.equal(app.stores.has("fuel-log-journal-v1"), true);
});

test("successful sign-in/eviction recovery restores offline shell without a new deploy", async () => {
  const app = worker();
  await app.emit("install");
  app.setNetwork(() => new Response("denied", { status: 401 }));
  await app.emit("fetch", new Request(origin + "/api/fuel"));
  app.setNetwork(null);
  assert.equal((await app.emit("fetch", navigation())).status, 200);
  app.setNetwork(() => { throw new Error("offline"); });
  assert.match(await (await app.emit("fetch", navigation())).text(), /data-fuel-app/);
  assert.equal((await app.emit("fetch", new Request(origin + core[0]))).status, 200);
});

test("on-demand chunks are bounded without evicting pinned core assets or caching OSM", async () => {
  const app = worker();
  await app.emit("install");
  for (let index = 0; index < 40; index++) await app.emit("fetch", new Request(origin + `/_next/static/feature-${index}.js`));
  const assets = await app.caches.open("fuel-log-assets-test");
  assert.equal((await assets.keys()).length, 32 + core.length);
  assert.ok(await assets.match(core[0]));
  assert.equal(await assets.match("/_next/static/feature-0.js"), undefined);
  assert.equal(app.emit("fetch", new Request("https://tile.openstreetmap.org/1/1/1.png")), undefined);
});

test('service writes invalidate only the service snapshot and notify other tabs', async () => {
  const app = worker();
  await app.caches.open('fuel-log-service-v1');
  await app.caches.open('fuel-log-journal-v1');
  await app.emit('fetch', new Request(origin + '/api/service', { method: 'POST', body: '{}' }));
  assert.equal(app.stores.has('fuel-log-service-v1'), false);
  assert.equal(app.stores.has('fuel-log-journal-v1'), true);
  assert.equal(app.messages[0].type, 'FUEL_SERVICE_CHANGED');
  const count=app.messages.length;
  await app.emit('fetch', new Request(origin + '/api/service/dispatch', { method: 'POST' }));
  assert.equal(app.messages.length,count);
});
test('each push produces a visible notification, with a safe fallback for invalid data', async () => {
  const app=worker();
  await app.emitEvent('push',{data:{json:()=>({title:'Заміна масла',body:'Час заміни',tag:'service-oil',url:'https://evil.test'})}});
  assert.equal(app.notifications[0].title,'Заміна масла');
  assert.equal(app.notifications[0].data.url,'/?tab=service');
  await app.emitEvent('push',{data:{json:()=>{throw new Error('bad JSON')}}});
  assert.equal(app.notifications.length,2);
  assert.equal(app.notifications[1].title,'Моє пальне · Сервіс');
});
test('notification clicks focus the app and open its service tab', async () => {
  const app=worker();let closed=false;
  await app.emitEvent('notificationclick',{notification:{close:()=>{closed=true}}});
  assert.equal(closed,true);
  assert.equal(app.messages[0].type,'FUEL_OPEN_SERVICE');
});

test('a notification can open the service tab offline using the cached root shell', async () => {
  const app=worker();await app.emit('install');
  app.setNetwork(()=>{throw new Error('offline')});
  const response=await app.emit('fetch',{url:origin+'/?tab=service',method:'GET',mode:'navigate'});
  assert.equal(response.status,200);assert.match(await response.text(),/data-fuel-app/);
});
