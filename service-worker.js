// ============================================================
// service-worker.js
// - caches the app shell for offline use
// - handles notification clicks (open app / snooze)
// - best-effort periodic background sync (Android Chrome only)
// ============================================================
const CACHE_NAME = "daily-survey-v1";
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
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).catch(() => cached))
  );
});

// ---------- notification click handling ----------
self.addEventListener("notificationclick", (event) => {
  const notification = event.notification;
  const { occasion, date } = notification.data || {};
  const action = event.action; // "take", "snooze", or "" (default tap)
  notification.close();

  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });

    if (action === "snooze") {
      // Update schedule state directly so a re-notification fires later
      // even if no app window is currently open.
      await snoozeInIndexedDB(date, occasion);
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
