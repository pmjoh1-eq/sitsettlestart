export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS (GitHub Pages origin)
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Admin-Key",
    };
    if (request.method === "OPTIONS") {
      return new Response("", { headers: corsHeaders });
    }

    try {
      if (path === "/api/health") return json({ ok: true }, corsHeaders);

      if (path === "/api/register" && request.method === "POST") {
        const body = await request.json();
        const { classId, deviceId, label } = body;

        if (!classId) return json({ ok: false, error: "Missing classId" }, corsHeaders, 400);

        const settingsKey = keySettings(classId);
        const settings = await getJson(env.KV, settingsKey, defaultSettings());

        if (!settings.registrationOpen) {
          return json({ ok: false, error: "Registration is closed for this class." }, corsHeaders, 403);
        }

        const newDeviceId = deviceId || crypto.randomUUID();
        const rosterKey = keyRoster(classId);
        const roster = await getJson(env.KV, rosterKey, { students: [] });

        // avoid duplicates
        const existing = roster.students.find(s => s.deviceId === newDeviceId);
        if (!existing) {
          roster.students.push({
            deviceId: newDeviceId,
            label: label || `Student ${roster.students.length + 1}`,
            createdAt: Date.now()
          });
          await env.KV.put(rosterKey, JSON.stringify(roster));
        }

        return json({ ok: true, deviceId: newDeviceId, roster }, corsHeaders);
      }

      // Student saves a canvas (PNG dataURL) for a question
      if (path === "/api/save" && request.method === "POST") {
        const body = await request.json();
        const { classId, lessonId, questionIndex, deviceId, pngDataUrl } = body;

        for (const k of ["classId", "lessonId", "questionIndex", "deviceId", "pngDataUrl"]) {
          if (body[k] === undefined || body[k] === null || body[k] === "") {
            return json({ ok: false, error: `Missing ${k}` }, corsHeaders, 400);
          }
        }

        const settings = await getJson(env.KV, keySettings(classId), defaultSettings());
        // Only allow saves for the active lesson (prevents “old lesson scribbles”)
        if (settings.activeLessonId && settings.activeLessonId !== lessonId) {
          return json({ ok: false, error: "Lesson is not active." }, corsHeaders, 403);
        }

        const canvasKey = keyCanvas(classId, lessonId, questionIndex, deviceId);
        const record = { pngDataUrl, updatedAt: Date.now() };
        await env.KV.put(canvasKey, JSON.stringify(record));

        return json({ ok: true }, corsHeaders);
      }

      // Load a student's canvas
      if (path === "/api/load" && request.method === "GET") {
        const classId = url.searchParams.get("classId");
        const lessonId = url.searchParams.get("lessonId");
        const questionIndex = url.searchParams.get("questionIndex");
        const deviceId = url.searchParams.get("deviceId");

        if (!classId || !lessonId || questionIndex === null || !deviceId) {
          return json({ ok: false, error: "Missing query params" }, corsHeaders, 400);
        }

        const canvasKey = keyCanvas(classId, lessonId, questionIndex, deviceId);
        const raw = await env.KV.get(canvasKey);
        return json({ ok: true, record: raw ? JSON.parse(raw) : null }, corsHeaders);
      }

      // Teacher: set lesson questions + activate lesson
      if (path === "/api/teacher/setLesson" && request.method === "POST") {
        assertAdmin(request, env);

        const body = await request.json();
        const { classId, lessonId, questions, makeActive } = body;

        if (!classId || !lessonId || !Array.isArray(questions)) {
          return json({ ok: false, error: "Missing classId/lessonId/questions" }, corsHeaders, 400);
        }

        const lessonKey = keyLesson(classId, lessonId);
        const payload = { lessonId, questions, updatedAt: Date.now() };
        await env.KV.put(lessonKey, JSON.stringify(payload));

        if (makeActive) {
          const settingsKey = keySettings(classId);
          const settings = await getJson(env.KV, settingsKey, defaultSettings());
          settings.activeLessonId = lessonId;
          await env.KV.put(settingsKey, JSON.stringify(settings));
        }

        return json({ ok: true }, corsHeaders);
      }

      // Teacher: toggle registration open/closed
      if (path === "/api/teacher/toggleRegistration" && request.method === "POST") {
        assertAdmin(request, env);

        const body = await request.json();
        const { classId, registrationOpen } = body;

        if (!classId || typeof registrationOpen !== "boolean") {
          return json({ ok: false, error: "Missing classId/registrationOpen(boolean)" }, corsHeaders, 400);
        }

        const settingsKey = keySettings(classId);
        const settings = await getJson(env.KV, settingsKey, defaultSettings());
        settings.registrationOpen = registrationOpen;
        await env.KV.put(settingsKey, JSON.stringify(settings));

        return json({ ok: true, settings }, corsHeaders);
      }

      // Teacher: set active lesson id
      if (path === "/api/teacher/setActiveLesson" && request.method === "POST") {
        assertAdmin(request, env);

        const body = await request.json();
        const { classId, lessonId } = body;
        if (!classId) return json({ ok: false, error: "Missing classId" }, corsHeaders, 400);

        const settingsKey = keySettings(classId);
        const settings = await getJson(env.KV, settingsKey, defaultSettings());
        settings.activeLessonId = lessonId || null;
        await env.KV.put(settingsKey, JSON.stringify(settings));

        return json({ ok: true, settings }, corsHeaders);
      }

      // Public: get class settings (so student knows if registration open + active lesson)
      if (path === "/api/class" && request.method === "GET") {
        const classId = url.searchParams.get("classId");
        if (!classId) return json({ ok: false, error: "Missing classId" }, corsHeaders, 400);

        const settings = await getJson(env.KV, keySettings(classId), defaultSettings());
        const roster = await getJson(env.KV, keyRoster(classId), { students: [] });

        // Only send safe info (no admin stuff)
        return json(
          {
            ok: true,
            classId,
            settings: { registrationOpen: settings.registrationOpen, activeLessonId: settings.activeLessonId },
            rosterCount: roster.students.length,
          },
          corsHeaders
        );
      }

      // Public: get active lesson questions
      if (path === "/api/lesson" && request.method === "GET") {
        const classId = url.searchParams.get("classId");
        const lessonId = url.searchParams.get("lessonId");
        if (!classId || !lessonId) return json({ ok: false, error: "Missing classId/lessonId" }, corsHeaders, 400);

        const raw = await env.KV.get(keyLesson(classId, lessonId));
        return json({ ok: true, lesson: raw ? JSON.parse(raw) : null }, corsHeaders);
      }

      // Teacher: get roster
      if (path === "/api/teacher/roster" && request.method === "GET") {
        assertAdmin(request, env);
        const classId = url.searchParams.get("classId");
        if (!classId) return json({ ok: false, error: "Missing classId" }, corsHeaders, 400);

        const settings = await getJson(env.KV, keySettings(classId), defaultSettings());
        const roster = await getJson(env.KV, keyRoster(classId), { students: [] });
        return json({ ok: true, settings, roster }, corsHeaders);
      }

      // Teacher: fetch all canvases for a question (for carousel)
      if (path === "/api/teacher/canvases" && request.method === "GET") {
        assertAdmin(request, env);

        const classId = url.searchParams.get("classId");
        const lessonId = url.searchParams.get("lessonId");
        const questionIndex = url.searchParams.get("questionIndex");
        if (!classId || !lessonId || questionIndex === null) {
          return json({ ok: false, error: "Missing query params" }, corsHeaders, 400);
        }

        const roster = await getJson(env.KV, keyRoster(classId), { students: [] });
        const results = [];

        for (const s of roster.students) {
          const k = keyCanvas(classId, lessonId, questionIndex, s.deviceId);
          const raw = await env.KV.get(k);
          results.push({
            deviceId: s.deviceId,
            label: s.label,
            record: raw ? JSON.parse(raw) : null
          });
        }

        return json({ ok: true, canvases: results }, corsHeaders);
      }

      return json({ ok: false, error: "Not found" }, corsHeaders, 404);
    } catch (e) {
      return json({ ok: false, error: e?.message || String(e) }, corsHeaders, 500);
    }
  }
};

function assertAdmin(request, env) {
  const k = request.headers.get("X-Admin-Key");
  if (!k || k !== env.ADMIN_KEY) {
    throw new Error("Unauthorized (missing/invalid X-Admin-Key).");
  }
}

function json(obj, headers = {}, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...headers }
  });
}

function defaultSettings() {
  return { registrationOpen: true, activeLessonId: null };
}

async function getJson(KV, key, fallback) {
  const raw = await KV.get(key);
  return raw ? JSON.parse(raw) : fallback;
}

function keySettings(classId) { return `settings:${classId}`; }
function keyRoster(classId) { return `roster:${classId}`; }
function keyLesson(classId, lessonId) { return `lesson:${classId}:${lessonId}`; }
function keyCanvas(classId, lessonId, q, deviceId) { return `canvas:${classId}:${lessonId}:${q}:${deviceId}`; }
