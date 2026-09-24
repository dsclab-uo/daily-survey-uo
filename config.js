// ============================================================
// CONFIG — edit these before deploying
// ============================================================
const CONFIG = {
  // Paste the "Web app URL" you get after deploying apps-script.gs
  // (Deploy > New deployment > Web app). Looks like:
  // https://script.google.com/macros/s/AKfycb.../exec
  SHEETS_WEBAPP_URL: "https://script.google.com/macros/s/AKfycbxfZZSU9akWhO_kFQaQspYu9NvX3LJ0OYFvKcJ0THDeKz9XInqQCVGX6pRq0h2EXmmK/exec",

  // For background/closed-app push notifications (optional but recommended —
  // see /push-server/README.md). Leave PUSH_SERVER_URL blank to skip push
  // entirely and rely only on notifications firing while the app is open.
  PUSH_SERVER_URL: "daily-survey-uo-production.up.railway.app",              // e.g. "https://your-app.onrender.com"
  PUSH_VAPID_PUBLIC_KEY: "BBYpuB0L410aDZfJ6TgxVHDXklNyACdajENQZyViyqY4UB8DSKoZFP8SMt6dABVfTVWH-1lGq1zw9ZkAqFf92j8",        // printed by `npm run generate-keys` on the server

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
