# Daily Survey — Push Notification Server

A small always-on Node server that sends real Web Push notifications to
participants' phones for the Daily Survey PWA — including when their
app is fully closed. This is what makes background delivery possible;
the client app on its own can only fire notifications while it's open
(see the main `/pwa/README.md` for why).

## How it fits together

```
pwa/ (GitHub Pages)  --subscribes-->  this server  --push-->  participant's phone
                      <--complete/snooze-->
```

- The client subscribes here once notification permission is granted.
- Every minute, this server checks each participant (in their own local
  timezone) and sends a push if a survey is due — same noon/8pm +
  wake/sleep-window logic as the client, just running server-side so it
  works with the app closed.
- The client tells this server when a survey is submitted (`/api/complete`)
  so reminders stop, and the service worker tells it when someone taps
  "Snooze" (`/api/snooze`) so the hourly reminder continues.

## 1. Generate VAPID keys

VAPID keys are how the server proves to browsers it's allowed to send
push messages to a given subscription — think of them as this server's
identity, not a per-participant secret.

```bash
npm install
npm run generate-keys
```

This prints a public and private key. Keep the private key secret —
it only ever lives in this server's environment variables, never in
the client.

## 2. Deploy to Render or Railway

Either works fine for this; steps are nearly identical:

1. Push this `push-server/` folder to its own GitHub repo (or a
   subfolder of the same repo as the client — either is fine, just
   point the host at this folder).
2. On Render or Railway, create a new **Web Service** from that repo.
   - Build command: `npm install`
   - Start command: `npm start`
3. Set these environment variables on the host (from step 1's output):
   - `VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
   - `VAPID_SUBJECT` — a `mailto:` address is fine, e.g. `mailto:you@university.edu`
4. Deploy. You should see `Push server listening on port ...` in the logs.
5. Copy the server's public URL (e.g. `https://your-app.onrender.com`).

## 3. Point the client at this server

Back in `/pwa/config.js`, set:

```js
PUSH_SERVER_URL: "https://your-app.onrender.com",
PUSH_VAPID_PUBLIC_KEY: "<the VAPID_PUBLIC_KEY from step 1>",
```

Redeploy the client. From then on, granting notification permission
also subscribes the participant to server-sent push automatically —
nothing else participants need to do.

**Keep `SURVEY_TIMES`, `SNOOZE_REPEAT_MAX`, `SNOOZE_INTERVAL_MINUTES`,
and `STUDY_LENGTH_DAYS` in this server's `config.js` identical to the
client's `/pwa/config.js`.** If they drift apart, the server and the
client will disagree about when a survey is due.

## Persistence — important

This server stores participant subscriptions and progress in a plain
JSON file (`data/participants.json`) for simplicity. **Most free-tier
hosts (including Render's free web services) use an ephemeral
filesystem** — meaning that file is wiped every time the server
restarts or redeploys, and every participant would need to reopen
their app once to re-subscribe (which the client does automatically on
every launch, so it's self-healing, but they'd miss any push sent
during the gap).

For a real study, do one of:
- **Railway**: attach a persistent volume and point `DATA_FILE` (env
  var) at a path inside it.
- **Render**: upgrade to a paid instance with a persistent disk, or
  swap this file-based store for Render's free PostgreSQL add-on.
- Simplest structural fix if you outgrow this: replace `store.js` with
  a real database — the rest of the server doesn't need to change.

## Testing without waiting for noon/8pm

Rather than editing survey times and waiting, you can trigger a check
manually:

```bash
curl -X POST https://your-app.onrender.com/api/debug/tick
```

This runs the same logic the once-a-minute cron job runs, immediately —
useful for confirming a subscribed participant actually receives a push
without needing to wait for a real scheduled time. Consider removing
or protecting this route before a real study, since anyone with the
URL can trigger it (it doesn't expose data, only sends notifications
that are already due).

## Endpoints

| Method | Path | Called by | Purpose |
|---|---|---|---|
| POST | `/api/subscribe` | client, on permission grant / every launch | Store/update a participant's push subscription |
| POST | `/api/complete` | client, on survey submit | Stop reminders for that occasion |
| POST | `/api/snooze` | service worker, on "Snooze" tap | Schedule the next hourly reminder |
| POST | `/api/unsubscribe` | (not currently called by the client) | Remove a participant entirely |
| POST | `/api/debug/tick` | you, manually | Force an immediate schedule check |
