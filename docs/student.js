import { $, apiGet, apiPost, getDeviceId, setDeviceId, typesetMath } from "./common.js";

const classIdEl = $("#classId");
const labelEl = $("#label");
const regBtn = $("#registerBtn");
const regStatus = $("#regStatus");

const deviceIdText = $("#deviceIdText");
const activeLessonText = $("#activeLessonText");
const regOpenText = $("#regOpenText");

const lessonArea = $("#lessonArea");
const qSelect = $("#qSelect");
const questionText = $("#questionText");

const canvas = $("#canvas");
const ctx = canvas.getContext("2d");
ctx.lineCap = "round";
ctx.lineJoin = "round";

let tool = "pen";
let drawing = false;
let last = null;

let state = {
  classId: classIdEl.value,
  deviceId: getDeviceId(),
  activeLessonId: null,
  lesson: null,
  questionIndex: 0,
};

function setStatus(el, msg) { el.textContent = msg; }

function resizeForHiDPI() {
  const ratio = window.devicePixelRatio || 1;
  const w = canvas.width, h = canvas.height;
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  canvas.width = Math.floor(w * ratio);
  canvas.height = Math.floor(h * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function clearCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // white background for PNG
  ctx.save();
  ctx.setTransform(1,0,0,1,0,0);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.restore();
}

function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  const t = e.touches?.[0];
  const x = (t ? t.clientX : e.clientX) - rect.left;
  const y = (t ? t.clientY : e.clientY) - rect.top;
  return { x, y };
}

function drawLine(a, b) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);

  if (tool === "pen") {
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 3;
  } else {
    ctx.globalCompositeOperation = "destination-out";
    ctx.lineWidth = 18;
    ctx.strokeStyle = "rgba(0,0,0,1)";
  }

  ctx.stroke();
}

canvas.addEventListener("pointerdown", (e) => {
  drawing = true;
  last = getPos(e);
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  if (!drawing) return;
  const p = getPos(e);
  drawLine(last, p);
  last = p;
});
canvas.addEventListener("pointerup", () => { drawing = false; last = null; });
canvas.addEventListener("pointercancel", () => { drawing = false; last = null; });

$("#penBtn").onclick = () => tool = "pen";
$("#eraserBtn").onclick = () => tool = "eraser";
$("#clearBtn").onclick = () => clearCanvas();

async function refreshClassInfo() {
  state.classId = classIdEl.value;
  const info = await apiGet(`/api/class?classId=${encodeURIComponent(state.classId)}`);
  state.activeLessonId = info.settings.activeLessonId;

  deviceIdText.textContent = state.deviceId || "—";
  activeLessonText.textContent = state.activeLessonId || "—";
  regOpenText.textContent = info.settings.registrationOpen ? "Open" : "Closed";

  if (!state.activeLessonId) {
    lessonArea.style.display = "none";
    setStatus(regStatus, "Waiting for teacher to start a lesson…");
    return;
  }

  const lessonResp = await apiGet(`/api/lesson?classId=${encodeURIComponent(state.classId)}&lessonId=${encodeURIComponent(state.activeLessonId)}`);
  state.lesson = lessonResp.lesson;

  if (!state.lesson) {
    lessonArea.style.display = "none";
    setStatus(regStatus, "No lesson content found yet.");
    return;
  }

  // Populate questions
  qSelect.innerHTML = "";
  state.lesson.questions.forEach((q, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = `Q${i + 1}`;
    qSelect.appendChild(opt);
  });
  state.questionIndex = Number(qSelect.value || 0);

  await loadCanvas();
  renderQuestion();
  lessonArea.style.display = "block";
}

function renderQuestion() {
  const q = state.lesson.questions[state.questionIndex] || "";
  questionText.innerHTML = `<div>${q}</div>`;
  typesetMath();
}

qSelect.onchange = async () => {
  state.questionIndex = Number(qSelect.value);
  renderQuestion();
  await loadCanvas();
};

regBtn.onclick = async () => {
  try {
    state.classId = classIdEl.value;
    const resp = await apiPost("/api/register", {
      classId: state.classId,
      deviceId: state.deviceId || undefined,
      label: labelEl.value || undefined
    });
    state.deviceId = resp.deviceId;
    setDeviceId(state.deviceId);
    setStatus(regStatus, "Registered ✅");
    await refreshClassInfo();
  } catch (e) {
    setStatus(regStatus, e.message);
  }
};

$("#saveBtn").onclick = async () => {
  const saveStatus = $("#saveStatus");
  try {
    if (!state.deviceId) throw new Error("Register this device first.");
    if (!state.activeLessonId) throw new Error("No active lesson.");

    const pngDataUrl = canvas.toDataURL("image/png");
    await apiPost("/api/save", {
      classId: state.classId,
      lessonId: state.activeLessonId,
      questionIndex: state.questionIndex,
      deviceId: state.deviceId,
      pngDataUrl
    });
    setStatus(saveStatus, "Saved ✅");
    setTimeout(() => setStatus(saveStatus, ""), 1200);
  } catch (e) {
    setStatus(saveStatus, e.message);
  }
};

async function loadCanvas() {
  clearCanvas();
  if (!state.deviceId || !state.activeLessonId) return;

  try {
    const resp = await apiGet(
      `/api/load?classId=${encodeURIComponent(state.classId)}&lessonId=${encodeURIComponent(state.activeLessonId)}&questionIndex=${encodeURIComponent(state.questionIndex)}&deviceId=${encodeURIComponent(state.deviceId)}`
    );
    const rec = resp.record;
    if (rec?.pngDataUrl) {
      const img = new Image();
      img.onload = () => {
        // draw at 1:1 (we already fill white background)
        ctx.globalCompositeOperation = "source-over";
        ctx.drawImage(img, 0, 0);
      };
      img.src = rec.pngDataUrl;
    }
  } catch (e) {
    // ok to ignore
  }
}

classIdEl.onchange = async () => {
  await refreshClassInfo();
};

resizeForHiDPI();
clearCanvas();
state.deviceId = getDeviceId();
await refreshClassInfo();

// Poll every 5s for active lesson changes
setInterval(refreshClassInfo, 5000);

