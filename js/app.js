/* Shared utilities: nav toggle, formatting, tracker storage (localStorage only, no backend). */

(function initNav() {
  document.addEventListener("DOMContentLoaded", () => {
    const toggle = document.querySelector(".nav-toggle");
    const nav = document.querySelector(".main-nav");
    if (toggle && nav) {
      toggle.addEventListener("click", () => nav.classList.toggle("open"));
    }
  });
})();

function fmtMoney(v) {
  return v === null || v === undefined ? "Not reported" : "$" + Number(v).toLocaleString();
}
function fmtPct(v) {
  return v === null || v === undefined ? "Not reported" : v + "%";
}
function fmtNum(v) {
  return v === null || v === undefined ? "Not reported" : Number(v).toLocaleString();
}
function escapeHtml(s) {
  if (s === null || s === undefined) return "";
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

let _schoolsCache = null;
async function fetchSchools() {
  if (_schoolsCache) return _schoolsCache;
  const res = await fetch("data/schools.json");
  _schoolsCache = await res.json();
  return _schoolsCache;
}

/* ---------------- Tracker (localStorage) ---------------- */
const TRACKER_KEY = "cpt_tracker_v1";

const STATUS_OPTIONS = [
  { value: "researching", label: "Researching", color: "navy" },
  { value: "planning", label: "Planning to Apply", color: "navy" },
  { value: "applying", label: "Application In Progress", color: "amber" },
  { value: "submitted", label: "Submitted", color: "navy" },
  { value: "interview", label: "Interview", color: "amber" },
  { value: "accepted", label: "Accepted", color: "green" },
  { value: "waitlisted", label: "Waitlisted", color: "amber" },
  { value: "denied", label: "Denied", color: "red" },
  { value: "committed", label: "Committed", color: "green" },
];

const APP_TYPES = ["", "Early Decision", "Early Action", "Regular Decision", "Rolling Admission", "Other"];

function getTracker() {
  try {
    const raw = localStorage.getItem(TRACKER_KEY);
    if (!raw) return { schools: {} };
    const parsed = JSON.parse(raw);
    if (!parsed.schools) parsed.schools = {};
    return parsed;
  } catch (e) {
    console.warn("Tracker data could not be read; starting fresh.", e);
    return { schools: {} };
  }
}

function saveTracker(data) {
  try {
    localStorage.setItem(TRACKER_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    console.warn("Could not save tracker data (storage full or blocked).", e);
    return false;
  }
}

function isInTracker(id) {
  const t = getTracker();
  return !!t.schools[id];
}

function addToTracker(school) {
  const t = getTracker();
  if (!t.schools[school.id]) {
    t.schools[school.id] = {
      id: school.id,
      name: school.name,
      city: school.city,
      state: school.state,
      status: "researching",
      appType: "",
      deadline: "",
      notes: "",
      addedAt: Date.now(),
    };
    saveTracker(t);
  }
  return t.schools[school.id];
}

function removeFromTracker(id) {
  const t = getTracker();
  delete t.schools[id];
  saveTracker(t);
}

function updateTrackerEntry(id, patch) {
  const t = getTracker();
  if (t.schools[id]) {
    Object.assign(t.schools[id], patch);
    saveTracker(t);
  }
}

function statusMeta(value) {
  return STATUS_OPTIONS.find((s) => s.value === value) || STATUS_OPTIONS[0];
}
