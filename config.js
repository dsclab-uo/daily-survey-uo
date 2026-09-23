// ============================================================
// CONFIG — edit these before deploying
// ============================================================
const CONFIG = {
  // Paste the "Web app URL" you get after deploying apps-script.gs
  // (Deploy > New deployment > Web app). Looks like:
  // https://script.google.com/macros/s/AKfycb.../exec
  SHEETS_WEBAPP_URL: "PASTE_YOUR_GOOGLE_APPS_SCRIPT_URL_HERE",

  // Total number of days the daily-survey period runs for.
  STUDY_LENGTH_DAYS: 30,

  // Times of day surveys are triggered (24h "HH:MM", local time).
  SURVEY_TIMES: ["12:00", "20:00"],

  // How many times a snoozed notification will re-fire, and how
  // far apart (minutes), before it stops repeating for that occasion.
  SNOOZE_REPEAT_MAX: 3,
  SNOOZE_INTERVAL_MINUTES: 60,

  // How often (ms) the open app re-checks whether a notification
  // is due. 60000 = once a minute.
  CHECK_INTERVAL_MS: 60000
};
