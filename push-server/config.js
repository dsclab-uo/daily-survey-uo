// ============================================================
// config.js — keep SURVEY_TIMES / SNOOZE_* / STUDY_LENGTH_DAYS
// identical to the client's /pwa/config.js, or the two will
// disagree about when a survey is "due".
// ============================================================
require("dotenv").config();

module.exports = {
  PORT: process.env.PORT || 3000,

  VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
  VAPID_SUBJECT: process.env.VAPID_SUBJECT || "mailto:you@example.com",

  STUDY_LENGTH_DAYS: 30,
  SURVEY_TIMES: ["12:00", "20:00"],
  SNOOZE_REPEAT_MAX: 3,
  SNOOZE_INTERVAL_MINUTES: 60,

  // How often the scheduler checks every participant. Keep this small
  // relative to your survey windows (1 minute is plenty).
  CHECK_CRON: "* * * * *",

  DATA_FILE: process.env.DATA_FILE || require("path").join(__dirname, "data", "participants.json")
};
