// ============================================================
// scheduler.js — the server-side twin of the client's checkSchedule()
// in app.js. Runs once a minute, independent of whether any
// participant's app is open, and sends real Web Push messages for
// anything due.
// ============================================================
const cron = require("node-cron");
const webpush = require("web-push");
const config = require("./config");
const store = require("./store");

webpush.setVapidDetails(config.VAPID_SUBJECT, config.VAPID_PUBLIC_KEY, config.VAPID_PRIVATE_KEY);

const OCCASION_LABELS = { "12:00": "Midday survey", "20:00": "Evening survey" };

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function inSleepWindow(minuteOfDay, wakeMin, sleepMin) {
  if (sleepMin < wakeMin) return minuteOfDay >= sleepMin && minuteOfDay < wakeMin;
  return minuteOfDay >= sleepMin || minuteOfDay < wakeMin;
}

function adjustedTriggerMinute(baseMin, wakeMin, sleepMin) {
  return inSleepWindow(baseMin, wakeMin, sleepMin) ? wakeMin : baseMin;
}

function daysBetween(isoA, isoB) {
  const a = new Date(isoA + "T00:00:00Z");
  const b = new Date(isoB + "T00:00:00Z");
  return Math.round((b - a) / 86400000);
}

// Returns { timeStr: "HH:MM", dateStr: "YYYY-MM-DD" } for "now" in the
// given IANA timezone. Handles DST automatically.
function getLocalParts(timezone) {
  const now = new Date();
  const tz = timezone || "UTC";
  let timeStr, dateStr;
  try {
    timeStr = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false
    }).format(now);
    dateStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit"
    }).format(now);
  } catch (e) {
    // Unknown/invalid timezone string — fall back to UTC rather than crash.
    timeStr = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }).format(now);
    dateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(now);
  }
  return { timeStr, dateStr };
}

function buildPayload(occasion, date, isReminder, participantId) {
  return {
    title: isReminder ? "Reminder: Daily survey" : "Time for your daily survey",
    body: `${OCCASION_LABELS[occasion] || occasion} — tap to complete it now.`,
    occasion,
    date,
    participantId
  };
}

async function sendPush(participant, payload) {
  try {
    await webpush.sendNotification(participant.subscription, JSON.stringify(payload));
  } catch (err) {
    const status = err && err.statusCode;
    if (status === 404 || status === 410) {
      // The browser/OS says this subscription no longer exists — stop trying.
      store.removeParticipant(participant.participantId);
      console.log(`Removed expired subscription for participant ${participant.participantId}`);
    } else {
      console.error(`Push failed for participant ${participant.participantId}:`, status || err.message);
    }
  }
}

function tick() {
  const participants = store.getAllParticipants();
  const nowMs = Date.now();

  for (const p of participants) {
    if (!p.subscription || !p.startDate) continue;

    const { timeStr, dateStr: today } = getLocalParts(p.timezone);
    const studyDay = daysBetween(p.startDate, today) + 1;
    if (studyDay > config.STUDY_LENGTH_DAYS) continue; // this participant's study period is over

    const nowMin = toMinutes(timeStr);
    const wakeMin = toMinutes(p.wakeTime || "07:00");
    const sleepMin = toMinutes(p.sleepTime || "23:00");

    for (const occasion of config.SURVEY_TIMES) {
      const key = `${today}_${occasion}`;
      const entry = (p.schedule && p.schedule[key]) || { fired: false, snoozeCount: 0, nextFireTime: null, completed: false };
      if (entry.completed) continue;

      const adjMin = adjustedTriggerMinute(toMinutes(occasion), wakeMin, sleepMin);

      if (!entry.fired && nowMin >= adjMin) {
        sendPush(p, buildPayload(occasion, today, false, p.participantId));
        store.setScheduleEntry(p.participantId, key, {
          fired: true, firedAt: nowMs, snoozeCount: 0, nextFireTime: null, completed: false
        });
      } else if (entry.fired && entry.nextFireTime && nowMs >= entry.nextFireTime && entry.snoozeCount < config.SNOOZE_REPEAT_MAX) {
        sendPush(p, buildPayload(occasion, today, true, p.participantId));
        store.setScheduleEntry(p.participantId, key, {
          ...entry, snoozeCount: entry.snoozeCount + 1, nextFireTime: null
        });
      }
    }
  }
}

function start() {
  cron.schedule(config.CHECK_CRON, tick);
  console.log(`Scheduler running on cron "${config.CHECK_CRON}"`);
}

module.exports = { start, tick };
