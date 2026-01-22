
export const API_BASE = "https://sss-canvas.pmjoh1.workers.dev";

export function getDeviceId() {
  let id = localStorage.getItem("sss_deviceId");
  return id || null;
}
export function setDeviceId(id) {
  localStorage.setItem("sss_deviceId", id);
}
export function $(sel) { return document.querySelector(sel); }

export async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`);
  const data = await res.json();
  if (!res.ok || data.ok === false) throw new Error(data.error || `GET ${path} failed`);
  return data;
}

export async function apiPost(path, body, adminKey) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(adminKey ? { "X-Admin-Key": adminKey } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || data.ok === false) throw new Error(data.error || `POST ${path} failed`);
  return data;
}

// MathJax helper
export function typesetMath() {
  if (window.MathJax?.typesetPromise) return window.MathJax.typesetPromise();
}
