// ============================================================
// db.js — thin IndexedDB wrapper
// Stores: config (participant setup), responses (survey answers),
// schedule (per-day/occasion notification state)
// ============================================================
const DB_NAME = "daily-survey-db";
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("config")) {
        db.createObjectStore("config", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("responses")) {
        const store = db.createObjectStore("responses", { keyPath: "id", autoIncrement: true });
        store.createIndex("synced", "synced");
      }
      if (!db.objectStoreNames.contains("schedule")) {
        db.createObjectStore("schedule", { keyPath: "key" }); // key = `${date}_${occasion}`
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(storeName, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const result = fn(store);
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
  });
}

const DB = {
  async getConfig() {
    return tx("config", "readonly", (store) => {
      return new Promise((resolve) => {
        const req = store.get("participant");
        req.onsuccess = () => resolve(req.result || null);
      });
    }).then((p) => p); // flatten nested promise
  },

  async setConfig(data) {
    return tx("config", "readwrite", (store) => {
      store.put({ id: "participant", ...data });
    });
  },

  async addResponse(record) {
    return tx("responses", "readwrite", (store) => {
      store.add({ ...record, synced: 0 });
    });
  },

  async getUnsyncedResponses() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("responses", "readonly");
      const store = transaction.objectStore("responses");
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result || []).filter((r) => !r.synced));
      req.onerror = () => reject(req.error);
    });
  },

  async markSynced(id) {
    return tx("responses", "readwrite", (store) => {
      const req = store.get(id);
      req.onsuccess = () => {
        const rec = req.result;
        if (rec) {
          rec.synced = 1;
          store.put(rec);
        }
      };
    });
  },

  async getResponsesForDate(date) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("responses", "readonly");
      const store = transaction.objectStore("responses");
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result || []).filter((r) => r.date === date));
      req.onerror = () => reject(req.error);
    });
  },

  async getScheduleEntry(key) {
    return tx("schedule", "readonly", (store) => {
      return new Promise((resolve) => {
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result || null);
      });
    }).then((p) => p);
  },

  async setScheduleEntry(key, data) {
    return tx("schedule", "readwrite", (store) => {
      store.put({ key, ...data });
    });
  }
};
