// ============================================================
// store.js — a plain JSON-file store. Good enough for a study
// with a modest number of participants; NOT safe against heavy
// concurrent writes. See README's "Persistence" section before
// relying on this for a real deployment on a host with an
// ephemeral filesystem (writes will be lost on restart/redeploy
// unless you attach a persistent volume/disk).
// ============================================================
const fs = require("fs");
const path = require("path");
const config = require("./config");

function ensureFile() {
  const dir = path.dirname(config.DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(config.DATA_FILE)) fs.writeFileSync(config.DATA_FILE, "{}");
}

function loadAll() {
  ensureFile();
  try {
    return JSON.parse(fs.readFileSync(config.DATA_FILE, "utf8"));
  } catch (e) {
    console.error("Failed to read data file, starting empty:", e);
    return {};
  }
}

function saveAll(data) {
  ensureFile();
  fs.writeFileSync(config.DATA_FILE, JSON.stringify(data, null, 2));
}

// Participant shape:
// {
//   participantId, subscription, wakeTime, sleepTime, timezone, startDate,
//   schedule: { "2026-09-23_12:00": { fired, firedAt, snoozeCount, nextFireTime, completed } }
// }

function upsertParticipant(participantId, fields) {
  const data = loadAll();
  const existing = data[participantId] || { schedule: {} };
  data[participantId] = { ...existing, ...fields, participantId };
  saveAll(data);
  return data[participantId];
}

function getParticipant(participantId) {
  const data = loadAll();
  return data[participantId] || null;
}

function getAllParticipants() {
  return Object.values(loadAll());
}

function setScheduleEntry(participantId, key, entry) {
  const data = loadAll();
  if (!data[participantId]) return;
  data[participantId].schedule = data[participantId].schedule || {};
  data[participantId].schedule[key] = entry;
  saveAll(data);
}

function removeParticipant(participantId) {
  const data = loadAll();
  delete data[participantId];
  saveAll(data);
}

module.exports = {
  upsertParticipant,
  getParticipant,
  getAllParticipants,
  setScheduleEntry,
  removeParticipant
};
