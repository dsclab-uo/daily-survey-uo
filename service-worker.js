// ============================================================
// service-worker.js
// - caches the app shell for offline use
// - handles push events from the (optional) push server, so
//   notifications can arrive even with the app fully closed
// - handles notification clicks (open app / snooze)
// - best-effort periodic background sync (Android Chrome only)
// ============================================================
importScripts("config.js"); // gives this scope access to CONFIG (PUSH_SERVER_URL etc.)

const CACHE_NAME = "daily-survey-v2";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./db.js",
  "./config.js",
  "./survey-items.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  // Network-first: always try to get the latest file when online (so a
  // redeploy shows up immediately), falling back to the cached copy when
  // offline. This trades a little offline-purity for freshness, which
  // matters more here since the app gets iterated on.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// ---------- incoming push messages from the push server ----------
self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (e) { /* ignore malformed payload */ }
  const { title, body, occasion, date, participantId } = payload;
  if (!occasion || !date) return;

  event.waitUntil(
    self.registration.showNotification(title || "Daily survey", {
      body: body || "Tap to complete your survey now.",
      tag: `survey-${date}-${occasion}`,
      renotify: true,
      icon: "icons/icon-192.png",
      badge: "icons/icon-192.png",
      data: { occasion, date, participantId },
      actions: [
        { action: "take", title: "Take survey" },
        { action: "snooze", title: "Snooze 1 hr" }
      ]
    })
  );
});

// ---------- notification click handling ----------
self.addEventListener("notificationclick", (event) => {
  const notification = event.notification;
  const { occasion, date, participantId } = notification.data || {};
  const action = event.action; // "take", "snooze", or "" (default tap)
  notification.close();

  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });

    if (action === "snooze") {
      // Update schedule state directly so a re-notification fires later
      // even if no app window is currently open.
      await snoozeInIndexedDB(date, occasion);
      await snoozeOnServer(date, occasion, participantId);
      // also tell any open window so its in-memory state / home screen refresh
      allClients.forEach((c) => c.postMessage({ type: "REFRESH_HOME" }));
      return;
    }

    // default click or "take" action -> open/focus the app on the survey
    if (allClients.length > 0) {
      const client = allClients[0];
      client.focus();
      client.postMessage({ type: "OPEN_SURVEY", occasion });
    } else {
      await self.clients.openWindow("./index.html");
    }
  })());
});

// Tells the push server about a snooze too, so it keeps sending hourly
// reminders even while the app stays fully closed. No-op if push isn't
// configured or the request fails (the local IndexedDB update above still
// covers the "app gets opened again" case regardless).
async function snoozeOnServer(date, occasion, participantId) {
  if (typeof CONFIG === "undefined" || !CONFIG.PUSH_SERVER_URL || !participantId) return;
  try {
    await fetch(`${CONFIG.PUSH_SERVER_URL}/api/snooze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantId, date, occasion })
    });
  } catch (e) { /* offline or server unreachable — safe to ignore here */ }
}

// Minimal standalone IndexedDB write so "Snooze" works even with the app closed.
function snoozeInIndexedDB(date, occasion) {
  return new Promise((resolve) => {
    const req = indexedDB.open("daily-survey-db", 1);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction("schedule", "readwrite");
      const store = tx.objectStore("schedule");
      const key = `${date}_${occasion}`;
      const getReq = store.get(key);
      getReq.onsuccess = () => {
        const entry = getReq.result || { fired: true, snoozeCount: 0 };
        entry.key = key;
        entry.nextFireTime = Date.now() + 60 * 60000; // 1 hour; keep in sync with CONFIG.SNOOZE_INTERVAL_MINUTES
        store.put(entry);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    };
    req.onerror = () => resolve();
  });
}

// ---------- best-effort periodic background sync (Android Chrome, installed PWA) ----------
self.addEventListener("periodicsync", (event) => {
  if (event.tag === "check-schedule") {
    event.waitUntil(
      self.clients.matchAll({ type: "window" }).then((clients) => {
        clients.forEach((c) => c.postMessage({ type: "REFRESH_HOME" }));
      })
    );
  }
});
