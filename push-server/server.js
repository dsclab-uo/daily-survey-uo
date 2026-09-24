// ============================================================
// server.js — receives push subscriptions from the client and
// exposes small endpoints the client/service-worker call to keep
// the server's view of each participant's progress up to date.
// ============================================================
const express = require("express");
const cors = require("cors");
const config = require("./config");
const store = require("./store");
const scheduler = require("./scheduler");

if (!config.VAPID_PUBLIC_KEY || !config.VAPID_PRIVATE_KEY) {
  console.error(
    "Missing VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY. Run `npm run generate-keys`, " +
    "then set them as environment variables before starting the server."
  );
  process.exit(1);
}

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ status: "ok", service: "daily-survey-push-server" });
});

// Client calls this once it has a PushSubscription and the participant's
// wake/sleep times + timezone + study start date.
app.post("/api/subscribe", (req, res) => {
  const { participantId, subscription, wakeTime, sleepTime, timezone, startDate } = req.body || {};
  if (!participantId || !subscription || !wakeTime || !sleepTime || !startDate) {
    return res.status(400).json({ error: "participantId, subscription, wakeTime, sleepTime, and startDate are required" });
  }
  const existing = store.getParticipant(participantId);
  store.upsertParticipant(participantId, {
    subscription,
    wakeTime,
    sleepTime,
    timezone: timezone || "UTC",
    startDate,
    schedule: (existing && existing.schedule) || {}
  });
  res.json({ status: "subscribed" });
});

// Client calls this after a survey submission, so the server stops
// sending reminders for that occasion.
app.post("/api/complete", (req, res) => {
  const { participantId, date, occasion } = req.body || {};
  if (!participantId || !date || !occasion) {
    return res.status(400).json({ error: "participantId, date, and occasion are required" });
  }
  const participant = store.getParticipant(participantId);
  if (!participant) return res.status(404).json({ error: "unknown participantId" });

  const key = `${date}_${occasion}`;
  const existing = (participant.schedule && participant.schedule[key]) || {};
  store.setScheduleEntry(participantId, key, { ...existing, completed: true, nextFireTime: null });
  res.json({ status: "ok" });
});

// The service worker calls this when the participant taps "Snooze" on a
// push notification, so the server schedules the next hourly reminder
// even while the app stays closed.
app.post("/api/snooze", (req, res) => {
  const { participantId, date, occasion } = req.body || {};
  if (!participantId || !date || !occasion) {
    return res.status(400).json({ error: "participantId, date, and occasion are required" });
  }
  const participant = store.getParticipant(participantId);
  if (!participant) return res.status(404).json({ error: "unknown participantId" });

  const key = `${date}_${occasion}`;
  const existing = (participant.schedule && participant.schedule[key]) || { fired: true, snoozeCount: 0 };
  store.setScheduleEntry(participantId, key, {
    ...existing,
    nextFireTime: Date.now() + config.SNOOZE_INTERVAL_MINUTES * 60000
  });
  res.json({ status: "ok" });
});

app.post("/api/unsubscribe", (req, res) => {
  const { participantId } = req.body || {};
  if (!participantId) return res.status(400).json({ error: "participantId is required" });
  store.removeParticipant(participantId);
  res.json({ status: "ok" });
});

// Manually trigger a scheduler pass — handy for testing without waiting
// for the cron tick or for noon/8pm. Consider removing/protecting this
// route before running a real study if you don't want participants'
// devices able to trigger it (it doesn't expose any data, only sends
// notifications that are already due).
app.post("/api/debug/tick", (req, res) => {
  scheduler.tick();
  res.json({ status: "ticked" });
});

app.listen(config.PORT, () => {
  console.log(`Push server listening on port ${config.PORT}`);
  scheduler.start();
});
