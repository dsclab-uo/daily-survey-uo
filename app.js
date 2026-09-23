// ============================================================
// app.js — main application logic
// ============================================================

const OCCASION_LABELS = { "12:00": "Midday survey", "20:00": "Evening survey" };

let swRegistration = null;
let currentOccasion = null; // occasion being answered on the survey screen
let currentAnswers = {};

// ---------- small utils ----------
function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function isoDate(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function daysBetween(isoA, isoB) {
  const a = new Date(isoA + "T00:00:00");
  const b = new Date(isoB + "T00:00:00");
  return Math.round((b - a) / 86400000);
}
function inSleepWindow(minuteOfDay, wakeMin, sleepMin) {
  if (sleepMin < wakeMin) return minuteOfDay >= sleepMin && minuteOfDay < wakeMin;
  return minuteOfDay >= sleepMin || minuteOfDay < wakeMin;
}
function adjustedTriggerMinute(baseMin, wakeMin, sleepMin) {
  return inSleepWindow(baseMin, wakeMin, sleepMin) ? wakeMin : baseMin;
}
function show(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
}

// ---------- init ----------
window.addEventListener("load", init);

async function init() {
  if ("serviceWorker" in navigator) {
    try {
      swRegistration = await navigator.serviceWorker.register("service-worker.js");
      // try periodic background sync (Android Chrome, installed PWA only — best effort)
      if ("periodicSync" in swRegistration) {
        try {
          const status = await navigator.permissions.query({ name: "periodic-background-sync" });
          if (status.state === "granted") {
            await swRegistration.periodicSync.register("check-schedule", { minInterval: 60 * 60 * 1000 });
          }
        } catch (e) { /* not supported everywhere — fine */ }
      }
    } catch (e) {
      console.warn("Service worker registration failed", e);
    }
  }

  navigator.serviceWorker && navigator.serviceWorker.addEventListener("message", onSWMessage);
  window.addEventListener("online", syncPendingResponses);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkSchedule();
  });

  const config = await DB.getConfig();
  if (!config) {
    show("screen-setup");
    wireSetupScreen();
  } else {
    show("screen-home");
    await renderHome();
    checkSchedule();
    setInterval(checkSchedule, CONFIG.CHECK_INTERVAL_MS);
    syncPendingResponses();
  }
}

function onSWMessage(event) {
  if (event.data && event.data.type === "OPEN_SURVEY") {
    startSurvey(event.data.occasion);
  }
  if (event.data && event.data.type === "REFRESH_HOME") {
    renderHome();
  }
}

// ============================================================
// SETUP SCREEN
// ============================================================
function wireSetupScreen() {
  document.getElementById("btnStartStudy").addEventListener("click", async () => {
    const participantId = document.getElementById("participantId").value.trim();
    const wakeTime = document.getElementById("wakeTime").value;
    const sleepTime = document.getElementById("sleepTime").value;
    const errEl = document.getElementById("setupError");
    errEl.textContent = "";

    if (!participantId) { errEl.textContent = "Please enter your participant ID."; return; }
    if (!wakeTime || !sleepTime) { errEl.textContent = "Please set both times."; return; }

    await DB.setConfig({
      participantId,
      wakeTime,
      sleepTime,
      startDate: isoDate(new Date())
    });

    if ("Notification" in window && Notification.permission === "default") {
      try { await Notification.requestPermission(); } catch (e) {}
    }

    show("screen-home");
    await renderHome();
    checkSchedule();
    setInterval(checkSchedule, CONFIG.CHECK_INTERVAL_MS);
  });
}

// ============================================================
// HOME SCREEN
// ============================================================
async function renderHome() {
  const config = await DB.getConfig();
  const today = isoDate(new Date());
  const studyDay = daysBetween(config.startDate, today) + 1;
  const dayCounterEl = document.getElementById("dayCounter");
  const completeBlock = document.getElementById("completeBlock");
  const takeSurveyBtn = document.getElementById("btnTakeSurvey");
  const statusList = document.getElementById("todayStatus");
  statusList.innerHTML = "";

  if (studyDay > CONFIG.STUDY_LENGTH_DAYS) {
    dayCounterEl.textContent = `Study complete`;
    completeBlock.classList.remove("hidden");
    takeSurveyBtn.classList.add("hidden");
    document.querySelector(".status-block").classList.add("hidden");
  } else {
    dayCounterEl.textContent = `Day ${studyDay} of ${CONFIG.STUDY_LENGTH_DAYS}`;
    completeBlock.classList.add("hidden");
    document.querySelector(".status-block").classList.remove("hidden");

    const wakeMin = toMinutes(config.wakeTime);
    const sleepMin = toMinutes(config.sleepTime);
    const responses = await DB.getResponsesForDate(today);
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();

    let dueOccasion = null;
    for (const occasion of CONFIG.SURVEY_TIMES) {
      const done = responses.some((r) => r.occasion === occasion);
      const adjMin = adjustedTriggerMinute(toMinutes(occasion), wakeMin, sleepMin);
      const li = document.createElement("li");
      const label = document.createElement("span");
      label.textContent = OCCASION_LABELS[occasion] || occasion;
      const tag = document.createElement("span");
      if (done) {
        tag.className = "tag done"; tag.textContent = "Completed";
      } else if (nowMin >= adjMin) {
        tag.className = "tag pending"; tag.textContent = "Available now";
        if (!dueOccasion) dueOccasion = occasion;
      } else {
        tag.className = "tag waiting";
        const hh = String(Math.floor(adjMin / 60)).padStart(2, "0");
        const mm = String(adjMin % 60).padStart(2, "0");
        tag.textContent = `From ${hh}:${mm}`;
      }
      li.appendChild(label); li.appendChild(tag);
      statusList.appendChild(li);
    }

    if (dueOccasion) {
      takeSurveyBtn.classList.remove("hidden");
      takeSurveyBtn.onclick = () => startSurvey(dueOccasion);
    } else {
      takeSurveyBtn.classList.add("hidden");
    }
  }

  // notification permission banner
  const banner = document.getElementById("notifPermBanner");
  if ("Notification" in window && Notification.permission !== "granted") {
    banner.classList.remove("hidden");
    document.getElementById("btnEnableNotif").onclick = async () => {
      await Notification.requestPermission();
      renderHome();
    };
  } else {
    banner.classList.add("hidden");
  }

  document.getElementById("offlineBanner").classList.toggle("hidden", navigator.onLine);
}

// ============================================================
// SCHEDULING / NOTIFICATIONS
// ============================================================
async function checkSchedule() {
  const config = await DB.getConfig();
  if (!config) return;
  const today = isoDate(new Date());
  const studyDay = daysBetween(config.startDate, today) + 1;
  if (studyDay > CONFIG.STUDY_LENGTH_DAYS) return;

  const wakeMin = toMinutes(config.wakeTime);
  const sleepMin = toMinutes(config.sleepTime);
  const responses = await DB.getResponsesForDate(today);
  const now = new Date();

  for (const occasion of CONFIG.SURVEY_TIMES) {
    const completed = responses.some((r) => r.occasion === occasion);
    const key = `${today}_${occasion}`;
    let entry = (await DB.getScheduleEntry(key)) || { fired: false, snoozeCount: 0, nextFireTime: null };
    if (completed) continue;

    const adjMin = adjustedTriggerMinute(toMinutes(occasion), wakeMin, sleepMin);
    const scheduled = new Date(now);
    scheduled.setHours(Math.floor(adjMin / 60), adjMin % 60, 0, 0);

    if (!entry.fired && now.getTime() >= scheduled.getTime()) {
      await fireNotification(occasion, today, false);
      entry = { fired: true, firedAt: now.getTime(), snoozeCount: 0, nextFireTime: null };
      await DB.setScheduleEntry(key, entry);
    } else if (entry.fired && entry.nextFireTime && now.getTime() >= entry.nextFireTime && entry.snoozeCount < CONFIG.SNOOZE_REPEAT_MAX) {
      await fireNotification(occasion, today, true);
      entry.snoozeCount += 1;
      entry.nextFireTime = null; // cleared until user snoozes again
      await DB.setScheduleEntry(key, entry);
    }
  }
  renderHome();
}

async function fireNotification(occasion, dateStr, isReminder) {
  const title = isReminder ? "Reminder: Daily survey" : "Time for your daily survey";
  const body = `${OCCASION_LABELS[occasion] || occasion} — tap to complete it now.`;
  const options = {
    body,
    tag: `survey-${dateStr}-${occasion}`,
    renotify: true,
    icon: "icons/icon-192.png",
    badge: "icons/icon-192.png",
    data: { occasion, date: dateStr },
    actions: [
      { action: "take", title: "Take survey" },
      { action: "snooze", title: "Snooze 1 hr" }
    ]
  };
  if (swRegistration) {
    await swRegistration.showNotification(title, options);
  } else if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, options);
  }
}

// called by the service worker (via postMessage) when the user taps "Snooze"
async function snoozeOccasion(dateStr, occasion) {
  const key = `${dateStr}_${occasion}`;
  const entry = (await DB.getScheduleEntry(key)) || { fired: true, snoozeCount: 0 };
  entry.nextFireTime = Date.now() + CONFIG.SNOOZE_INTERVAL_MINUTES * 60000;
  await DB.setScheduleEntry(key, entry);
}
window.snoozeOccasion = snoozeOccasion;

// ============================================================
// SURVEY SCREEN
// ============================================================
function startSurvey(occasion) {
  currentOccasion = occasion;
  currentAnswers = {};
  renderSurveyForm();
  show("screen-survey");
}

function renderSurveyForm() {
  const form = document.getElementById("surveyForm");
  form.innerHTML = "";

  SURVEY_ITEMS.forEach((item) => {
    const wrapper = document.createElement("div");
    wrapper.className = "question";
    wrapper.dataset.qid = item.id;

    const p = document.createElement("p");
    p.className = "qtext";
    p.textContent = item.text;
    wrapper.appendChild(p);

    if (item.type === "single_choice") {
      item.options.forEach((opt) => {
        const row = document.createElement("label");
        row.className = "option-row";
        row.innerHTML = `<input type="radio" name="${item.id}" value="${opt}"> <span>${opt}</span>`;
        row.querySelector("input").addEventListener("change", () => {
          wrapper.querySelectorAll(".option-row").forEach((r) => r.classList.remove("selected"));
          row.classList.add("selected");
          currentAnswers[item.id] = opt;
          applySkipLogic();
          if (item.otherText === opt) {
            showOtherInput(wrapper, item);
          } else {
            const existingOther = wrapper.querySelector(".other-input");
            if (existingOther) existingOther.remove();
          }
          updateSubmitState();
        });
        wrapper.appendChild(row);
      });
    } else if (item.type === "scale_1_7") {
      const row = document.createElement("div");
      row.className = "scale-row";
      for (let i = 1; i <= 7; i++) {
        const btn = document.createElement("div");
        btn.className = "scale-btn";
        btn.textContent = i;
        btn.addEventListener("click", () => {
          row.querySelectorAll(".scale-btn").forEach((b) => b.classList.remove("selected"));
          btn.classList.add("selected");
          currentAnswers[item.id] = i;
          updateSubmitState();
        });
        row.appendChild(btn);
      }
      wrapper.appendChild(row);
      const labels = document.createElement("div");
      labels.className = "scale-labels";
      labels.innerHTML = `<span>${item.lowLabel}</span><span>${item.highLabel}</span>`;
      wrapper.appendChild(labels);
    } else if (item.type === "open_text") {
      const ta = document.createElement("textarea");
      ta.placeholder = "Type your answer…";
      ta.addEventListener("input", () => {
        currentAnswers[item.id] = ta.value;
        updateSubmitState();
      });
      wrapper.appendChild(ta);
    }

    form.appendChild(wrapper);
  });

  const navRow = document.createElement("div");
  navRow.className = "nav-row";
  const submitBtn = document.createElement("button");
  submitBtn.type = "button";
  submitBtn.id = "btnSubmitSurvey";
  submitBtn.className = "btn-primary";
  submitBtn.textContent = "Submit";
  submitBtn.disabled = true;
  submitBtn.addEventListener("click", submitSurvey);
  navRow.appendChild(submitBtn);
  form.appendChild(navRow);

  applySkipLogic();
  updateSubmitState();
}

function showOtherInput(wrapper, item) {
  let ta = wrapper.querySelector(".other-input");
  if (!ta) {
    ta = document.createElement("textarea");
    ta.className = "other-input";
    ta.placeholder = "Please specify…";
    ta.addEventListener("input", () => {
      currentAnswers[item.id + "_other"] = ta.value;
      updateSubmitState();
    });
    wrapper.appendChild(ta);
  }
}

function applySkipLogic() {
  // Q1 -> No skips Q2-Q5
  const q1Answer = currentAnswers["q1"];
  const skipIds = ["q2", "q3", "q4", "q5"];
  const shouldSkip = q1Answer === "No";
  skipIds.forEach((id) => {
    const el = document.querySelector(`.question[data-qid="${id}"]`);
    if (!el) return;
    el.classList.toggle("hidden", shouldSkip);
    if (shouldSkip) delete currentAnswers[id];
  });
}

function visibleRequiredIds() {
  return SURVEY_ITEMS
    .map((i) => i.id)
    .filter((id) => {
      const el = document.querySelector(`.question[data-qid="${id}"]`);
      return el && !el.classList.contains("hidden");
    });
}

function updateSubmitState() {
  const btn = document.getElementById("btnSubmitSurvey");
  if (!btn) return;
  const requiredIds = visibleRequiredIds();
  const allAnswered = requiredIds.every((id) => {
    const val = currentAnswers[id];
    return val !== undefined && val !== null && String(val).trim() !== "";
  });
  btn.disabled = !allAnswered;

  const total = requiredIds.length;
  const answered = requiredIds.filter((id) => currentAnswers[id] !== undefined).length;
  const fill = document.getElementById("progressFill");
  if (fill) fill.style.width = `${total ? Math.round((answered / total) * 100) : 0}%`;
}

async function submitSurvey() {
  const config = await DB.getConfig();
  const now = new Date();
  const record = {
    participantId: config.participantId,
    date: isoDate(now),
    occasion: currentOccasion,
    timestamp: now.toISOString(),
    answers: currentAnswers
  };
  await DB.addResponse(record);

  // mark schedule entry completed / stop further reminders for this occasion
  const key = `${record.date}_${currentOccasion}`;
  const entry = (await DB.getScheduleEntry(key)) || {};
  entry.completed = true;
  entry.nextFireTime = null;
  await DB.setScheduleEntry(key, entry);

  if (swRegistration) {
    // close any lingering notification for this occasion
    const notifs = await swRegistration.getNotifications({ tag: `survey-${record.date}-${currentOccasion}` });
    notifs.forEach((n) => n.close());
  }

  show("screen-done");
  document.getElementById("btnBackHome").onclick = async () => {
    show("screen-home");
    await renderHome();
  };

  syncPendingResponses();
}

// ============================================================
// GOOGLE SHEETS SYNC
// ============================================================
async function syncPendingResponses() {
  if (!navigator.onLine) return;
  if (!CONFIG.SHEETS_WEBAPP_URL || CONFIG.SHEETS_WEBAPP_URL.includes("PASTE_YOUR")) return;

  const pending = await DB.getUnsyncedResponses();
  for (const rec of pending) {
    try {
      const res = await fetch(CONFIG.SHEETS_WEBAPP_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" }, // avoids CORS preflight to Apps Script
        body: JSON.stringify(rec)
      });
      if (res.ok) {
        await DB.markSynced(rec.id);
      }
    } catch (e) {
      // stays unsynced, will retry next time we're online
      break;
    }
  }
}
