# Daily Survey PWA

A 30-day experience-sampling survey app. Participants install it to their
phone's home screen, set a participant ID and their normal wake/sleep
times, and get prompted twice a day (noon and 8pm local time) to complete
a short survey. Responses are stored on-device and synced to a Google
Sheet whenever the phone is online.

This client works standalone (notifications while the app is open), or
paired with the sibling `/push-server/` folder for background/closed-app
notifications — see that folder's README for setup.

## What's in this folder

| File | Purpose |
|---|---|
| `index.html` | App shell (setup / home / survey screens) |
| `styles.css` | Styling |
| `app.js` | App logic: setup, scheduling, survey rendering, sync |
| `db.js` | IndexedDB wrapper (local storage) |
| `config.js` | **Edit this** — your Sheets URL, push server URL/key, study length, survey times |
| `survey-items.js` | The 12 survey questions, with the Q1→Q6 skip logic |
| `service-worker.js` | Offline caching + notification click/snooze handling |
| `manifest.json` | Makes the app installable on Android/iOS home screens |
| `icons/` | App icons |
| `apps-script.gs` | Paste into Google Apps Script to receive responses |

## 1. Set up the Google Sheet

1. Create a new Google Sheet (e.g. "Daily Survey Responses").
2. In the Sheet, go to **Extensions → Apps Script**.
3. Delete the placeholder code and paste in the contents of `apps-script.gs`.
4. Click **Deploy → New deployment**.
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone** (this is what lets the app POST to it without a login; it only accepts writes, it doesn't expose the sheet for reading)
5. Click **Deploy**, authorize the permissions it asks for, then copy the
   **Web app URL** (ends in `/exec`).
6. Paste that URL into `config.js` as `SHEETS_WEBAPP_URL`.

A "Responses" tab will be created automatically the first time a survey
is submitted, with columns for participant ID, date, occasion, and each
question's answer.

## 2. Configure the app

Open `config.js` and set:
- `SHEETS_WEBAPP_URL` — from step 1
- `STUDY_LENGTH_DAYS` — defaults to 30
- `SURVEY_TIMES` — defaults to `["12:00", "20:00"]`
- `SNOOZE_REPEAT_MAX` / `SNOOZE_INTERVAL_MINUTES` — defaults to 3 repeats, 1 hour apart

## 3. Host it on HTTPS

Installing to a home screen, service workers, and notifications all
require the app to be served over **HTTPS from a real domain** — none of
that works from a file opened directly on your computer. Easiest free
options:

- **GitHub Pages**: push this folder to a repo, enable Pages on the `main` branch.
- **Netlify / Vercel**: drag-and-drop this folder in their dashboard.
- **Firebase Hosting**: `firebase deploy` after `firebase init hosting`.

Whichever you use, deploy this whole folder as-is (keep the relative
paths intact).

## 4. Installing on participants' phones

**Android (Chrome):** open the URL → menu (⋮) → **"Add to Home screen" / "Install app"**.

**iOS (Safari):** open the URL → Share button → **"Add to Home Screen"**.
It must be opened in Safari (not Chrome-on-iOS) for this to work, and iOS
requires this step for notifications to function at all.

On first launch, the app asks for the participant ID and usual wake/sleep
times, then asks for notification permission — participants should tap
**Allow**.

## Notification delivery: local-only vs. push server

Out of the box (no `PUSH_SERVER_URL` set in `config.js`), notifications
only fire while a participant's app is open or was recently in the
foreground — closing the app stops the schedule check entirely, since
that check is just JavaScript running in the page.

**For background/closed-app delivery, deploy `/push-server/` (see its
own README)** and set `PUSH_SERVER_URL` / `PUSH_VAPID_PUBLIC_KEY` in
this folder's `config.js`. Once that's done:

- **Android (Chrome):** background push works reliably regardless of
  whether the app is installed to the home screen.
- **iOS Safari:** background push works too, but **only if the
  participant has added the app to their home screen** (Share → Add to
  Home Screen) — a plain Safari tab can never receive push on iOS, no
  matter what's configured server-side. This is an Apple platform
  restriction, not something fixable in code.

Either way, the app's own in-page schedule check (described above)
keeps running as a second layer — if the app happens to be open, it
fires immediately rather than waiting on the server's once-a-minute
check, and notification tags are shared between the two so they don't
stack as duplicates.

If you don't deploy the push server, iOS and Android both still behave
as before: the moment the app is opened, it immediately checks whether
a survey is due and fires the notification/reminder right then, so
nothing sits silently missed for long — participants just need to open
the app periodically for that to happen.

## Data & offline behavior

- All responses are stored locally first (IndexedDB), so the app works
  fully offline.
- Whenever the device is online, unsynced responses are POSTed to the
  Google Sheet automatically (on submit, on reconnect, and on app
  launch). Nothing is lost if the participant is offline when they take
  the survey.
- The study automatically stops prompting once 30 days have elapsed from
  the participant's setup date, and shows a "study complete" screen.

## Testing tips

- To test scheduling quickly, temporarily change `SURVEY_TIMES` in
  `config.js` to a time a minute or two in the future, reload, and watch
  for the notification.
- If you've set up the push server, you can skip waiting entirely by
  calling its `/api/debug/tick` endpoint (see `/push-server/README.md`)
  to force an immediate check — useful for confirming a closed-app push
  actually arrives.
- Use your browser's DevTools → Application → Service Workers panel to
  confirm the service worker registered, and → IndexedDB to inspect
  stored config/responses/schedule.
