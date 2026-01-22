import { $, apiGet, apiPost, typesetMath } from "./common.js";

const adminKeyEl = $("#adminKey");
const saveAdminKeyBtn = $("#saveAdminKey");
const authStatus = $("#authStatus");

const classIdEl = $("#classId");
const refreshBtn = $("#refreshBtn");
const regState = $("#regState");
const activeLesson = $("#activeLesson");
const rosterCount = $("#rosterCount");

const openRegBtn = $("#openRegBtn");
const closeRegBtn = $("#closeRegBtn");
const clearActiveBtn = $("#clearActiveBtn");

const lessonIdEl = $("#lessonId");
const questionsEl = $("#questions");
const setActiveBtn = $("#setActiveBtn");
const saveOnlyBtn = $("#saveOnlyBtn");
const lessonStatus = $("#lessonStatus");

const preview = $("#preview");

const qSelect = $("#qSelect");
const loadCarouselBtn = $("#loadCarouselBtn");
const carousel = $("#carousel");
const carouselStatus = $("#carouselStatus");

let adminKey = sessionStorage.getItem("sss_adminKey") || "";
adminKeyEl.value = adminKey;

function setStatus(el, msg) { el.textContent = msg; }

saveAdminKeyBtn.onclick = () => {
  adminKey = adminKeyEl.value.trim();
  sessionStorage.setItem("sss_adminKey", adminKey);
  setStatus(authStatus, adminKey ? "Key set ✅" : "Key cleared");
};

function getLines(text) {
  return text
    .split("\n")
    .map(s => s.trim())
    .filter(Boolean);
}

function renderPreview() {
  const qs = getLines(questionsEl.value);
  preview.innerHTML = qs.map((q, i) => `<div class="card"><b>Q${i+1}</b><div>${q}</div></div>`).join("");
  typesetMath();
  qSelect.innerHTML = "";
  qs.forEach((_, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = `Q${i + 1}`;
    qSelect.appendChild(opt);
  });
}

questionsEl.addEventListener("input", renderPreview);

async function refreshTeacher() {
  try {
    const classId = classIdEl.value;
    const data = await apiPost(`/api/teacher/roster?classId=${encodeURIComponent(classId)}`, {}, adminKey);

    regState.textContent = data.settings.registrationOpen ? "Open" : "Closed";
    activeLesson.textContent = data.settings.activeLessonId || "—";
    rosterCount.textContent = String(data.roster.students.length);

    setStatus(authStatus, "Authorized ✅");
  } catch (e) {
    setStatus(authStatus, e.message);
  }
}

refreshBtn.onclick = refreshTeacher;

openRegBtn.onclick = async () => {
  try {
    await apiPost("/api/teacher/toggleRegistration", { classId: classIdEl.value, registrationOpen: true }, adminKey);
    await refreshTeacher();
  } catch (e) { setStatus(authStatus, e.message); }
};

closeRegBtn.onclick = async () => {
  try {
    await apiPost("/api/teacher/toggleRegistration", { classId: classIdEl.value, registrationOpen: false }, adminKey);
    await refreshTeacher();
  } catch (e) { setStatus(authStatus, e.message); }
};

clearActiveBtn.onclick = async () => {
  try {
    await apiPost("/api/teacher/setActiveLesson", { classId: classIdEl.value, lessonId: null }, adminKey);
    await refreshTeacher();
  } catch (e) { setStatus(authStatus, e.message); }
};

setActiveBtn.onclick = async () => {
  try {
    const classId = classIdEl.value;
    const lessonId = lessonIdEl.value.trim();
    const questions = getLines(questionsEl.value);

    if (!lessonId) throw new Error("Lesson ID required.");
    if (questions.length === 0) throw new Error("Enter at least 1 question.");

    await apiPost("/api/teacher/setLesson", { classId, lessonId, questions, makeActive: true }, adminKey);
    setStatus(lessonStatus, "Saved + Active ✅");
    await refreshTeacher();
  } catch (e) { setStatus(lessonStatus, e.message); }
};

saveOnlyBtn.onclick = async () => {
  try {
    const classId = classIdEl.value;
    const lessonId = lessonIdEl.value.trim();
    const questions = getLines(questionsEl.value);

    if (!lessonId) throw new Error("Lesson ID required.");
    if (questions.length === 0) throw new Error("Enter at least 1 question.");

    await apiPost("/api/teacher/setLesson", { classId, lessonId, questions, makeActive: false }, adminKey);
    setStatus(lessonStatus, "Saved ✅");
    await refreshTeacher();
  } catch (e) { setStatus(lessonStatus, e.message); }
};

loadCarouselBtn.onclick = async () => {
  try {
    carousel.innerHTML = "";
    setStatus(carouselStatus, "Loading…");

    const classId = classIdEl.value;
    // Use active lesson by default
    const rosterData = await apiPost(`/api/teacher/roster?classId=${encodeURIComponent(classId)}`, {}, adminKey);
    const lessonId = rosterData.settings.activeLessonId;
    if (!lessonId) throw new Error("No active lesson set.");

    const qi = Number(qSelect.value || 0);
    const resp = await apiPost(
      `/api/teacher/canvases?classId=${encodeURIComponent(classId)}&lessonId=${encodeURIComponent(lessonId)}&questionIndex=${encodeURIComponent(qi)}`,
      {},
      adminKey
    );

    const slides = resp.canvases.map((c) => {
      const png = c.record?.pngDataUrl;
      return `
        <div class="slide">
          <div class="row" style="justify-content:space-between;">
            <b>${escapeHtml(c.label || c.deviceId)}</b>
            <span class="small">${c.record?.updatedAt ? new Date(c.record.updatedAt).toLocaleTimeString() : ""}</span>
          </div>
          ${png ? `<img src="${png}" alt="canvas" />` : `<div class="small">No submission yet</div>`}
        </div>
      `;
    });

    carousel.innerHTML = slides.join("");
    setStatus(carouselStatus, `Loaded ${resp.canvases.length}`);
  } catch (e) {
    setStatus(carouselStatus, e.message);
  }
};

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

// initial
renderPreview();
await refreshTeacher();

