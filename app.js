// ============================================================
// app.js — main application logic
// ============================================================

const OCCASION_LABELS = { "12:00": "Midday survey", "20:00": "Evening survey" };

let swRegistration = null;
let currentOccasion = null; // occasion being answered on the survey screen
let currentAnswers = {};
let stepHistory = [];  // ordered list of question ids actually visited this survey
let stepIndex = 0;     // pointer into stepHistory for the question currently shown
let deferredInstallPrompt = null;
const INSTALL_DISMISS_KEY = "installBannerDismissed";

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

// Catch "beforeinstallprompt" as early as possible — Chrome can dispatch this
// before the window "load" event fires, so waiting for load can miss it entirely.
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  showAndroidInstallBanner();
});

// When a new service worker takes over (i.e. a redeploy was picked up),
// reload once so the page is running the current JS/CSS instead of
// whatever was in memory from before the update.
let swRefreshing = false;
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (swRefreshing) return;
    swRefreshing = true;
    window.location.reload();
  });
}

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

  setupInstallBanner();

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
// ADD-TO-HOME-SCREEN PROMPT
// ============================================================
function isStandaloneDisplay() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}
function isIOSDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
}

function wireDismissButton() {
  const banner = document.getElementById("installBanner");
  const dismissBtn = document.getElementById("btnDismissInstall");
  dismissBtn.onclick = () => {
    localStorage.setItem(INSTALL_DISMISS_KEY, "1");
    banner.classList.add("hidden");
  };
}

function showAndroidInstallBanner() {
  if (isStandaloneDisplay()) return;
  if (localStorage.getItem(INSTALL_DISMISS_KEY) === "1") return;
  const banner = document.getElementById("installBanner");
  const textEl = document.getElementById("installBannerText");
  const actionBtn = document.getElementById("btnInstallAction");
  if (!banner) return; // DOM not ready — shouldn't happen since this script tag is after the banner markup

  textEl.textContent = "Install this app to your home screen so reminders work reliably.";
  actionBtn.classList.remove("hidden");
  banner.classList.remove("hidden");
  wireDismissButton();
  actionBtn.onclick = async () => {
    banner.classList.add("hidden");
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
    }
  };
}

function setupInstallBanner() {
  if (isStandaloneDisplay()) return; // already installed — nothing to prompt
  if (localStorage.getItem(INSTALL_DISMISS_KEY) === "1") return;

  if (isIOSDevice()) {
    // iOS has no programmatic install prompt — show instructions instead.
    const banner = document.getElementById("installBanner");
    const textEl = document.getElementById("installBannerText");
    const actionBtn = document.getElementById("btnInstallAction");
    textEl.textContent = 'Add this app to your Home Screen for reminders to work: tap the Share icon, then "Add to Home Screen".';
    actionBtn.classList.add("hidden");
    banner.classList.remove("hidden");
    wireDismissButton();
  } else if (deferredInstallPrompt) {
    // The "beforeinstallprompt" event (registered at the top of this file,
    // before window "load") may already have fired by the time we get here.
    showAndroidInstallBanner();
  }
  // If deferredInstallPrompt hasn't arrived yet on non-iOS, the top-level
  // listener will call showAndroidInstallBanner() itself once it does.
}

window.addEventListener("appinstalled", () => {
  document.getElementById("installBanner").classList.add("hidden");
  localStorage.setItem(INSTALL_DISMISS_KEY, "1");
});

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
// SURVEY SCREEN — one question at a time, so skip logic can
// actually take the participant off the page entirely.
// ============================================================
function startSurvey(occasion) {
  currentOccasion = occasion;
  currentAnswers = {};
  stepHistory = ["q1"];
  stepIndex = 0;
  renderQuestionStep();
  show("screen-survey");
}

// Given the id of the question just answered, figure out which
// question comes next (honoring skipTo rules based on the answer given).
function getNextId(fromId) {
  const item = SURVEY_ITEMS.find((i) => i.id === fromId);
  const idx = SURVEY_ITEMS.findIndex((i) => i.id === fromId);
  if (item.skipTo) {
    const ans = currentAnswers[fromId];
    if (ans !== undefined && item.skipTo[ans]) return item.skipTo[ans];
  }
  return idx + 1 < SURVEY_ITEMS.length ? SURVEY_ITEMS[idx + 1].id : null;
}

function isStepAnswered(id) {
  const item = SURVEY_ITEMS.find((i) => i.id === id);
  const val = currentAnswers[id];
  if (val === undefined || val === null || String(val).trim() === "") return false;
  if (item.otherText && val === item.otherText) {
    const otherVal = currentAnswers[id + "_other"];
    if (!otherVal || !otherVal.trim()) return false;
  }
  return true;
}

// Rough progress estimate: total questions shrinks by 4 once we know
// Q1 will skip Q2–Q5.
function estimateTotalSteps() {
  return currentAnswers["q1"] === "No" ? SURVEY_ITEMS.length - 4 : SURVEY_ITEMS.length;
}

function renderQuestionStep() {
  const id = stepHistory[stepIndex];
  const item = SURVEY_ITEMS.find((i) => i.id === id);
  const form = document.getElementById("surveyForm");
  form.innerHTML = "";

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
      row.className = "option-row" + (currentAnswers[id] === opt ? " selected" : "");
      row.innerHTML = `<input type="radio" name="${item.id}" value="${opt}" ${currentAnswers[id] === opt ? "checked" : ""}> <span>${opt}</span>`;
      row.querySelector("input").addEventListener("change", () => {
        wrapper.querySelectorAll(".option-row").forEach((r) => r.classList.remove("selected"));
        row.classList.add("selected");
        currentAnswers[item.id] = opt;
        if (item.otherText === opt) {
          showOtherInput(wrapper, item);
        } else {
          const existingOther = wrapper.querySelector(".other-input");
          if (existingOther) existingOther.remove();
          delete currentAnswers[item.id + "_other"];
        }
        refreshNavState();
      });
      wrapper.appendChild(row);
    });
    if (item.otherText && currentAnswers[id] === item.otherText) {
      showOtherInput(wrapper, item);
    }
  } else if (item.type === "scale_1_7") {
    const row = document.createElement("div");
    row.className = "scale-row";
    for (let i = 1; i <= 7; i++) {
      const btn = document.createElement("div");
      btn.className = "scale-btn" + (currentAnswers[id] === i ? " selected" : "");
      btn.textContent = i;
      btn.addEventListener("click", () => {
        row.querySelectorAll(".scale-btn").forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        currentAnswers[item.id] = i;
        refreshNavState();
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
    ta.value = currentAnswers[id] || "";
    ta.addEventListener("input", () => {
      currentAnswers[item.id] = ta.value;
      refreshNavState();
    });
    wrapper.appendChild(ta);
  }

  form.appendChild(wrapper);

  const navRow = document.createElement("div");
  navRow.className = "nav-row";

  if (stepIndex > 0) {
    const backBtn = document.createElement("button");
    backBtn.type = "button";
    backBtn.className = "btn-secondary";
    backBtn.textContent = "Back";
    backBtn.addEventListener("click", handleBack);
    navRow.appendChild(backBtn);
  }

  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.id = "btnNextStep";
  nextBtn.className = "btn-primary";
  nextBtn.textContent = getNextId(id) === null ? "Submit" : "Next";
  nextBtn.disabled = !isStepAnswered(id);
  nextBtn.addEventListener("click", () => handleNext(id));
  navRow.appendChild(nextBtn);

  form.appendChild(navRow);

  updateProgressBar();
}

function showOtherInput(wrapper, item) {
  let ta = wrapper.querySelector(".other-input");
  if (!ta) {
    ta = document.createElement("textarea");
    ta.className = "other-input";
    ta.placeholder = "Please specify…";
    ta.value = currentAnswers[item.id + "_other"] || "";
    ta.addEventListener("input", () => {
      currentAnswers[item.id + "_other"] = ta.value;
      refreshNavState();
    });
    wrapper.appendChild(ta);
  }
}

function refreshNavState() {
  const id = stepHistory[stepIndex];
  const nextBtn = document.getElementById("btnNextStep");
  if (nextBtn) {
    nextBtn.disabled = !isStepAnswered(id);
    nextBtn.textContent = getNextId(id) === null ? "Submit" : "Next";
  }
  updateProgressBar();
}

function updateProgressBar() {
  const fill = document.getElementById("progressFill");
  if (!fill) return;
  const total = estimateTotalSteps();
  const pct = total ? Math.min(100, Math.round(((stepIndex + 1) / total) * 100)) : 0;
  fill.style.width = `${pct}%`;
}

function handleNext(fromId) {
  const nextId = getNextId(fromId);
  // Truncate any forward history beyond this point — if the participant
  // went back and changed an earlier answer, the old branch no longer applies.
  stepHistory = stepHistory.slice(0, stepIndex + 1);
  if (nextId) {
    stepHistory.push(nextId);
    stepIndex++;
    renderQuestionStep();
  } else {
    submitSurvey();
  }
}

function handleBack() {
  if (stepIndex > 0) {
    stepIndex--;
    renderQuestionStep();
  }
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
