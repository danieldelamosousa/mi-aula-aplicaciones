import {
  ensureDb,
  getConfig,
  getApps,
  getStudents,
  hashPin,
  verifySecret,
  randomHex,
  randomToken,
  generateShortCode,
  parseCookies,
  getClientHash,
  getAccessEmail,
  checkAuthLock,
  recordAuthFailure,
  clearAuthFailures,
  checkWindowRateLimit,
  isTeacherAuthenticated,
  isClassroomUnlocked,
  jsonResponse,
  safeExternalUrl,
  csvEscape,
  resolveDateCutoff,
  summarizeSessionFromAgg,
  summarizeSessionRow,
  buildTasksFromDbEvents
} from '../_lib/db.js';
import { aggregateDashboard, buildStudentReport } from '../_lib/core.mjs';

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function formatRetryMessage(retryAfterSec) {
  if (retryAfterSec >= 60) {
    const mins = Math.ceil(retryAfterSec / 60);
    return `Demasiados intentos fallidos. Espera ${mins} ${mins === 1 ? 'minuto' : 'minutos'} antes de volver a intentarlo.`;
  }
  return `Demasiados intentos fallidos. Espera ${retryAfterSec} segundos antes de volver a intentarlo.`;
}

export async function onRequest(context) {
  const { request, env } = context;
  const db = env.DB;

  try {
    await ensureDb(db);

    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method.toUpperCase();
    const isSecure = url.protocol === 'https:';
    const cookieFlags = `HttpOnly; Path=/; SameSite=Lax${isSecure ? '; Secure' : ''}`;

    // ---- PUBLIC API ----
    if (method === 'GET' && pathname === '/api/apps') {
      const cfg = await getConfig(db);
      const showAll = url.searchParams.get('all') === '1' && await isTeacherAuthenticated(db, request, cfg);
      const apps = await getApps(db, !showAll);
      return jsonResponse({
        aulaName: cfg.aulaName,
        subtitle: cfg.subtitle,
        apps
      });
    }

    if (method === 'GET' && pathname === '/api/profile') {
      const cfg = await getConfig(db);
      const unlocked = await isClassroomUnlocked(db, request, cfg);
      if (!unlocked) {
        return jsonResponse({
          aulaName: cfg.aulaName,
          sessionTtlHours: cfg.sessionTtlHours,
          classCodeRequired: true,
          unlocked: false,
          allowGuestStudents: cfg.allowGuestStudents,
          students: [],
          roster: []
        });
      }
      const roster = await getStudents(db);
      return jsonResponse({
        aulaName: cfg.aulaName,
        sessionTtlHours: cfg.sessionTtlHours,
        classCodeRequired: cfg.classCodeEnabled,
        unlocked: true,
        allowGuestStudents: cfg.allowGuestStudents,
        students: roster.map(s => s.name),
        roster
      });
    }

    if (method === 'POST' && pathname === '/api/classroom/unlock') {
      const cfg = await getConfig(db);
      if (!cfg.classCodeEnabled) {
        return jsonResponse({ ok: true });
      }

      const clientHash = await getClientHash(request);
      const lockKeys = [`class:${clientHash}`];
      const retryAfter = await checkAuthLock(db, lockKeys);
      if (retryAfter > 0) {
        return jsonResponse(
          { error: formatRetryMessage(retryAfter) },
          429,
          { 'Retry-After': String(retryAfter) }
        );
      }

      const body = await readJson(request);
      const code = String(body.code || '').trim();
      const { ok, needsUpgrade } = await verifySecret(code, cfg.classCodeSalt, cfg.classCodeHash);

      if (!ok) {
        const res = await recordAuthFailure(db, `class:${clientHash}`);
        if (res.lockSec > 0) {
          return jsonResponse(
            { error: formatRetryMessage(res.lockSec) },
            429,
            { 'Retry-After': String(res.lockSec) }
          );
        }
        return jsonResponse({ error: 'Clave de aula incorrecta. Inténtalo de nuevo.' }, 401);
      }

      await clearAuthFailures(db, lockKeys);

      const sid = randomToken(24);
      const ttlSec = 30 * 24 * 3600;
      const expiresAt = Date.now() + ttlSec * 1000;
      const stmts = [
        db.prepare('DELETE FROM classroom_tokens WHERE expires_at < ?').bind(Date.now()),
        db.prepare('INSERT INTO classroom_tokens (sid, expires_at) VALUES (?, ?)').bind(sid, expiresAt)
      ];
      if (needsUpgrade) {
        const upgraded = await hashPin(code, cfg.classCodeSalt);
        stmts.push(db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').bind('classCodeHash', upgraded));
      }
      await db.batch(stmts);

      return jsonResponse(
        { ok: true },
        200,
        { 'Set-Cookie': `aula_clase=${sid}; ${cookieFlags}; Max-Age=${ttlSec}` }
      );
    }

    if (method === 'POST' && pathname === '/api/sessions') {
      const cfg = await getConfig(db);
      const unlocked = await isClassroomUnlocked(db, request, cfg);
      if (!unlocked) {
        return jsonResponse({ error: 'Introduce la clave de aula antes de iniciar una sesión registrada.' }, 403);
      }

      const clientHash = await getClientHash(request);
      const rate = await checkWindowRateLimit(db, `sess:${clientHash}`, 40, 10 * 60 * 1000);
      if (!rate.allowed) {
        return jsonResponse(
          { error: 'Se han creado demasiadas sesiones seguidas desde esta red. Espera unos minutos.' },
          429,
          { 'Retry-After': String(rate.retryAfterSec) }
        );
      }

      const body = await readJson(request);
      const appId = String(body.app || '').trim();
      const appRow = await db.prepare('SELECT id, title, built_in FROM apps WHERE id = ?').bind(appId).first();
      if (!appRow || !appRow.built_in) {
        return jsonResponse({ error: 'Aplicación no válida.' }, 400);
      }

      let students = Array.isArray(body.students)
        ? [...new Set(body.students.map(s => String(s).trim().slice(0, 60)).filter(Boolean))].slice(0, 12)
        : [];
      if (!students.length) {
        return jsonResponse({ error: 'Selecciona al menos un alumno o alumna.' }, 400);
      }

      if (!cfg.allowGuestStudents) {
        const roster = await getStudents(db);
        const byLower = new Map(roster.map(r => [r.name.toLocaleLowerCase('es'), r.name]));
        const matched = [];
        for (const name of students) {
          const canonical = byLower.get(name.toLocaleLowerCase('es'));
          if (!canonical) {
            return jsonResponse({ error: 'Solo pueden participar alumnos incluidos en la lista oficial de clase.' }, 400);
          }
          matched.push(canonical);
        }
        students = [...new Set(matched)];
      }

      const token = randomToken(18);
      const code = await generateShortCode(db);
      const now = new Date();
      const ttlHours = cfg.sessionTtlHours || 8;
      const expiresAt = new Date(now.getTime() + ttlHours * 3600 * 1000).toISOString();
      const nowIso = now.toISOString();

      await db.prepare(
        `INSERT INTO sessions (token, code, app_id, app_title, students_json, created_at, expires_at, last_activity_at, ended_at, active_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 0)`
      ).bind(token, code, appRow.id, appRow.title, JSON.stringify(students), nowIso, expiresAt, nowIso).run();

      return jsonResponse({
        token,
        code,
        app: appRow.id,
        appTitle: appRow.title,
        students,
        expiresAt,
        ttlHours
      }, 201);
    }

    if (method === 'POST' && pathname === '/api/sessions/batch') {
      const cfg = await getConfig(db);
      const unlocked = await isClassroomUnlocked(db, request, cfg);
      if (!unlocked) {
        return jsonResponse({ error: 'Introduce la clave de aula antes de preparar sesiones.' }, 403);
      }

      const clientHash = await getClientHash(request);
      const rate = await checkWindowRateLimit(db, `batch:${clientHash}`, 15, 10 * 60 * 1000);
      if (!rate.allowed) {
        return jsonResponse(
          { error: 'Has preparado demasiados lotes seguidos desde esta red. Espera unos minutos.' },
          429,
          { 'Retry-After': String(rate.retryAfterSec) }
        );
      }

      const body = await readJson(request);
      const appId = String(body.app || '').trim();
      const appRow = await db.prepare('SELECT id, title, built_in FROM apps WHERE id = ?').bind(appId).first();
      if (!appRow || !appRow.built_in) {
        return jsonResponse({ error: 'Aplicación no válida.' }, 400);
      }

      const rawGroups = Array.isArray(body.groups) ? body.groups.slice(0, 32) : [];
      if (!rawGroups.length) {
        return jsonResponse({ error: 'Selecciona al menos un alumno o grupo.' }, 400);
      }

      const roster = !cfg.allowGuestStudents ? await getStudents(db) : [];
      const byLower = new Map(roster.map(r => [r.name.toLocaleLowerCase('es'), r.name]));

      const cleanGroups = [];
      for (const grp of rawGroups) {
        let members = Array.isArray(grp)
          ? [...new Set(grp.map(s => String(s).trim().slice(0, 60)).filter(Boolean))].slice(0, 12)
          : [];
        if (!members.length) continue;
        if (!cfg.allowGuestStudents) {
          const matched = [];
          for (const name of members) {
            const canonical = byLower.get(name.toLocaleLowerCase('es'));
            if (!canonical) {
              return jsonResponse({ error: 'Solo pueden participar alumnos incluidos en la lista oficial de clase.' }, 400);
            }
            matched.push(canonical);
          }
          members = [...new Set(matched)];
        }
        cleanGroups.push(members);
      }

      if (!cleanGroups.length) {
        return jsonResponse({ error: 'Selecciona al menos un alumno o grupo.' }, 400);
      }

      const now = new Date();
      const ttlHours = cfg.sessionTtlHours || 8;
      const expiresAt = new Date(now.getTime() + ttlHours * 3600 * 1000).toISOString();
      const nowIso = now.toISOString();

      const usedCodes = new Set();
      const created = [];
      const stmts = [];
      for (const students of cleanGroups) {
        const token = randomToken(18);
        let code = await generateShortCode(db);
        let tries = 0;
        while (usedCodes.has(code) && tries < 10) {
          code = await generateShortCode(db);
          tries++;
        }
        usedCodes.add(code);
        stmts.push(
          db.prepare(
            `INSERT INTO sessions (token, code, app_id, app_title, students_json, created_at, expires_at, last_activity_at, ended_at, active_ms)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 0)`
          ).bind(token, code, appRow.id, appRow.title, JSON.stringify(students), nowIso, expiresAt, nowIso)
        );
        created.push({
          token,
          code,
          students,
          expiresAt,
          directUrl: `/apps/${encodeURIComponent(appRow.id)}/?aula=1#sesion=${encodeURIComponent(token)}`,
          shortUrl: `/codigo/${encodeURIComponent(code)}`
        });
      }

      await db.batch(stmts);

      return jsonResponse({
        app: appRow.id,
        appTitle: appRow.title,
        ttlHours,
        sessions: created
      }, 201);
    }

    if (method === 'GET' && pathname === '/api/sessions/resolve') {
      const rawCode = String(url.searchParams.get('code') || '').trim().toUpperCase().replace(/\s+/g, '');
      const normalized = rawCode.includes('-')
        ? rawCode
        : (rawCode.length === 6 ? `${rawCode.slice(0, 3)}-${rawCode.slice(3)}` : rawCode);

      const session = await db.prepare('SELECT * FROM sessions WHERE code = ?').bind(normalized).first();
      if (!session) {
        return jsonResponse({ error: 'No encontramos ninguna sesión con ese código.' }, 404);
      }
      if (session.ended_at) {
        return jsonResponse({ error: 'Esta sesión ya ha terminado.' }, 410);
      }
      if (new Date(session.expires_at).getTime() < Date.now()) {
        return jsonResponse({ error: 'Este código ha caducado. Pide uno nuevo al docente.' }, 410);
      }

      let students = [];
      try { students = JSON.parse(session.students_json || '[]'); } catch {}

      return jsonResponse({
        code: session.code,
        app: session.app_id,
        appTitle: session.app_title,
        students,
        url: `/apps/${encodeURIComponent(session.app_id)}/?aula=1#sesion=${encodeURIComponent(session.token)}`
      });
    }

    if (method === 'GET' && pathname === '/api/sessions/info') {
      const token = String(url.searchParams.get('token') || '').trim();
      const session = await db.prepare('SELECT code, app_id, app_title, students_json, expires_at, ended_at FROM sessions WHERE token = ?').bind(token).first();
      if (!session) {
        return jsonResponse({ error: 'Sesión no encontrada.' }, 404);
      }
      let students = [];
      try { students = JSON.parse(session.students_json || '[]'); } catch {}

      return jsonResponse({
        code: session.code,
        app: session.app_id,
        appTitle: session.app_title,
        students,
        expiresAt: session.expires_at,
        endedAt: session.ended_at || null
      });
    }

    if (method === 'POST' && pathname === '/api/events') {
      const body = await readJson(request);
      const token = String(body.token || '').trim();
      const incoming = Array.isArray(body.events) ? body.events : [];

      const session = await db.prepare('SELECT token, expires_at, ended_at, active_ms FROM sessions WHERE token = ?').bind(token).first();
      if (!session) {
        return jsonResponse({ error: 'La sesión no existe o ha sido eliminada.' }, 403);
      }
      if (session.ended_at) {
        return jsonResponse({ error: 'Esta sesión ya se cerró.' }, 403);
      }
      if (new Date(session.expires_at).getTime() < Date.now()) {
        return jsonResponse({ error: 'El tiempo de la sesión ha expirado.' }, 403);
      }

      const nowIso = new Date().toISOString();
      let maxActiveMs = Number(session.active_ms) || 0;
      let endedAt = null;
      const saved = [];
      const statements = [];

      for (const ev of incoming.slice(0, 50)) {
        if (!ev || !ev.id) continue;
        const id = String(ev.id).slice(0, 100);
        saved.push(id);

        const kind = String(ev.kind || 'heartbeat').slice(0, 32);
        const activeMs = Math.max(0, Number(ev.activeMs) || 0);
        if (activeMs > maxActiveMs) maxActiveMs = activeMs;
        if (kind === 'end') endedAt = nowIso;

        if (kind !== 'heartbeat') {
          statements.push(
            db.prepare(
              `INSERT OR IGNORE INTO events
               (id, session_token, kind, task_id, mode, level, prompt, answer, correct, assisted, task_ms, active_ms, client_at, received_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).bind(
              id,
              token,
              kind,
              String(ev.taskId || 'session').slice(0, 100),
              String(ev.mode || '').slice(0, 64),
              String(ev.level || '').slice(0, 120),
              String(ev.prompt || '').slice(0, 500),
              String(ev.answer || '').slice(0, 1200),
              ev.correct === null || ev.correct === undefined ? null : (ev.correct ? 1 : 0),
              ev.assisted ? 1 : 0,
              Math.max(0, Number(ev.taskMs) || 0),
              activeMs,
              String(ev.clientAt || nowIso),
              nowIso
            )
          );
        }
      }

      statements.push(
        db.prepare(
          `UPDATE sessions
           SET active_ms = ?, last_activity_at = ?, ended_at = COALESCE(?, ended_at)
           WHERE token = ?`
        ).bind(maxActiveMs, nowIso, endedAt, token)
      );

      if (statements.length) {
        await db.batch(statements);
      }

      return jsonResponse({ saved });
    }

    // ---- TEACHER AUTH ----
    if (method === 'GET' && pathname === '/api/teacher/status') {
      const cfg = await getConfig(db);
      const authenticated = await isTeacherAuthenticated(db, request, cfg);
      const accessEmail = getAccessEmail(request);
      return jsonResponse({
        authenticated,
        pinEnabled: cfg.pinEnabled,
        isDefaultPin: cfg.isDefaultPin,
        aulaName: cfg.aulaName,
        accessEmail: accessEmail || null
      });
    }

    if (method === 'POST' && pathname === '/api/teacher/login') {
      const cfg = await getConfig(db);
      const accessEmail = getAccessEmail(request);
      if (cfg.allowedTeacherEmail && accessEmail && accessEmail !== cfg.allowedTeacherEmail) {
        return jsonResponse({ error: 'Tu cuenta de Cloudflare Access no está autorizada para este panel.' }, 403);
      }

      const clientHash = await getClientHash(request);
      const ipKey = `login:${clientHash}`;
      const globalKey = 'login:global';
      const retryAfter = await checkAuthLock(db, [ipKey, globalKey]);
      if (retryAfter > 0) {
        return jsonResponse(
          { error: formatRetryMessage(retryAfter) },
          429,
          { 'Retry-After': String(retryAfter) }
        );
      }

      const body = await readJson(request);
      const pin = String(body.pin || '').trim();
      const { ok, needsUpgrade } = cfg.pinEnabled
        ? await verifySecret(pin, cfg.pinSalt, cfg.pinHash)
        : { ok: true, needsUpgrade: false };

      if (cfg.pinEnabled && !ok) {
        const [ipRes, glRes] = await Promise.all([
          recordAuthFailure(db, ipKey, { t1: 5, l1: 300, t2: 8, l2: 900, t3: 10, l3: 1800 }),
          recordAuthFailure(db, globalKey, { t1: 15, l1: 600, t2: 25, l2: 1800, t3: 40, l3: 3600 })
        ]);
        const lockSec = Math.max(ipRes.lockSec, glRes.lockSec);
        if (lockSec > 0) {
          return jsonResponse(
            { error: formatRetryMessage(lockSec) },
            429,
            { 'Retry-After': String(lockSec) }
          );
        }
        return jsonResponse({ error: 'PIN incorrecto. Inténtalo de nuevo.' }, 401);
      }

      await clearAuthFailures(db, [ipKey, globalKey]);

      const sid = randomToken(24);
      const expiresAt = Date.now() + 12 * 3600 * 1000;
      const stmts = [
        db.prepare('DELETE FROM teacher_tokens WHERE expires_at < ?').bind(Date.now()),
        db.prepare('INSERT INTO teacher_tokens (sid, expires_at) VALUES (?, ?)').bind(sid, expiresAt)
      ];
      if (needsUpgrade && pin) {
        const upgraded = await hashPin(pin, cfg.pinSalt);
        stmts.push(db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').bind('pinHash', upgraded));
      }
      await db.batch(stmts);

      return jsonResponse(
        { ok: true },
        200,
        { 'Set-Cookie': `aula_docente=${sid}; ${cookieFlags}; Max-Age=43200` }
      );
    }

    if (method === 'POST' && pathname === '/api/teacher/logout') {
      const cookies = parseCookies(request);
      if (cookies.aula_docente) {
        await db.prepare('DELETE FROM teacher_tokens WHERE sid = ?').bind(cookies.aula_docente).run();
      }
      return jsonResponse(
        { ok: true },
        200,
        { 'Set-Cookie': `aula_docente=; ${cookieFlags}; Max-Age=0` }
      );
    }

    // ---- PROTECTED TEACHER ENDPOINTS ----
    if (pathname.startsWith('/api/teacher/')) {
      const cfg = await getConfig(db);
      const authed = await isTeacherAuthenticated(db, request, cfg);
      if (!authed) {
        return jsonResponse({ error: 'Inicia sesión con el PIN docente.' }, 401);
      }

      if (method === 'GET' && pathname === '/api/teacher/dashboard') {
        const range = url.searchParams.get('range') || 'all';
        const cutoffIso = resolveDateCutoff(range);

        const sessionsStmt = cutoffIso
          ? db.prepare('SELECT * FROM sessions WHERE created_at >= ? ORDER BY created_at DESC').bind(cutoffIso)
          : db.prepare('SELECT * FROM sessions ORDER BY created_at DESC');

        const aggStmt = cutoffIso
          ? db.prepare(
              `SELECT
                 e.session_token,
                 SUM(CASE WHEN e.kind = 'attempt' THEN 1 ELSE 0 END) AS attempts,
                 SUM(CASE WHEN e.kind = 'attempt' AND e.correct = 1 THEN 1 ELSE 0 END) AS correct,
                 SUM(CASE WHEN e.kind = 'hint' THEN 1 ELSE 0 END) AS hints,
                 SUM(CASE WHEN e.kind = 'reveal' THEN 1 ELSE 0 END) AS reveals,
                 COUNT(DISTINCT CASE WHEN e.task_id IS NOT NULL AND e.task_id != '' AND e.task_id != 'session' THEN e.task_id END) AS task_count
               FROM events e
               JOIN sessions s ON s.token = e.session_token
               WHERE s.created_at >= ?
               GROUP BY e.session_token`
            ).bind(cutoffIso)
          : db.prepare(
              `SELECT
                 session_token,
                 SUM(CASE WHEN kind = 'attempt' THEN 1 ELSE 0 END) AS attempts,
                 SUM(CASE WHEN kind = 'attempt' AND correct = 1 THEN 1 ELSE 0 END) AS correct,
                 SUM(CASE WHEN kind = 'hint' THEN 1 ELSE 0 END) AS hints,
                 SUM(CASE WHEN kind = 'reveal' THEN 1 ELSE 0 END) AS reveals,
                 COUNT(DISTINCT CASE WHEN task_id IS NOT NULL AND task_id != '' AND task_id != 'session' THEN task_id END) AS task_count
               FROM events
               GROUP BY session_token`
            );

        const weakStmt = cutoffIso
          ? db.prepare(
              `SELECT
                 s.app_id,
                 s.app_title,
                 e.mode,
                 e.level,
                 COUNT(*) AS attempts,
                 SUM(CASE WHEN e.correct = 1 THEN 1 ELSE 0 END) AS correct
               FROM events e
               JOIN sessions s ON s.token = e.session_token
               WHERE e.kind = 'attempt' AND s.created_at >= ?
               GROUP BY s.app_id, s.app_title, e.mode, e.level
               HAVING COUNT(*) >= 3`
            ).bind(cutoffIso)
          : db.prepare(
              `SELECT
                 s.app_id,
                 s.app_title,
                 e.mode,
                 e.level,
                 COUNT(*) AS attempts,
                 SUM(CASE WHEN e.correct = 1 THEN 1 ELSE 0 END) AS correct
               FROM events e
               JOIN sessions s ON s.token = e.session_token
               WHERE e.kind = 'attempt'
               GROUP BY s.app_id, s.app_title, e.mode, e.level
               HAVING COUNT(*) >= 3`
            );

        const [students, apps, sessionsRes, aggRes, weakRes] = await Promise.all([
          getStudents(db),
          getApps(db, false),
          sessionsStmt.all(),
          aggStmt.all(),
          weakStmt.all()
        ]);

        const aggByToken = new Map();
        for (const row of aggRes.results || []) {
          aggByToken.set(row.session_token, row);
        }

        const summaries = (sessionsRes.results || []).map(row =>
          summarizeSessionFromAgg(row, aggByToken.get(row.token))
        );

        const page = Number(url.searchParams.get('page')) || 1;
        const pageSize = Number(url.searchParams.get('pageSize')) || 50;
        const filters = {
          student: url.searchParams.get('student') || '',
          app: url.searchParams.get('app') || '',
          status: url.searchParams.get('status') || ''
        };

        const aggregated = aggregateDashboard({
          summaries,
          students,
          weakRows: weakRes.results || [],
          page,
          pageSize,
          filters
        });

        return jsonResponse({
          range,
          accessEmail: getAccessEmail(request) || null,
          config: {
            aulaName: cfg.aulaName,
            subtitle: cfg.subtitle,
            pinEnabled: cfg.pinEnabled,
            isDefaultPin: cfg.isDefaultPin,
            sessionTtlHours: cfg.sessionTtlHours,
            classCodeEnabled: cfg.classCodeEnabled,
            allowGuestStudents: cfg.allowGuestStudents,
            allowedTeacherEmail: cfg.allowedTeacherEmail
          },
          ...aggregated,
          students,
          apps
        });
      }

      if (method === 'GET' && pathname === '/api/teacher/student-report') {
        const studentName = String(url.searchParams.get('student') || '').trim();
        if (!studentName) {
          return jsonResponse({ error: 'Indica el nombre del alumno.' }, 400);
        }
        const range = url.searchParams.get('range') || 'all';
        const cutoffIso = resolveDateCutoff(range);

        const sessionsStmt = cutoffIso
          ? db.prepare('SELECT * FROM sessions WHERE created_at >= ? ORDER BY created_at DESC').bind(cutoffIso)
          : db.prepare('SELECT * FROM sessions ORDER BY created_at DESC');

        const aggStmt = cutoffIso
          ? db.prepare(
              `SELECT
                 e.session_token,
                 SUM(CASE WHEN e.kind = 'attempt' THEN 1 ELSE 0 END) AS attempts,
                 SUM(CASE WHEN e.kind = 'attempt' AND e.correct = 1 THEN 1 ELSE 0 END) AS correct,
                 SUM(CASE WHEN e.kind = 'hint' THEN 1 ELSE 0 END) AS hints,
                 SUM(CASE WHEN e.kind = 'reveal' THEN 1 ELSE 0 END) AS reveals,
                 COUNT(DISTINCT CASE WHEN e.task_id IS NOT NULL AND e.task_id != '' AND e.task_id != 'session' THEN e.task_id END) AS task_count
               FROM events e
               JOIN sessions s ON s.token = e.session_token
               WHERE s.created_at >= ?
               GROUP BY e.session_token`
            ).bind(cutoffIso)
          : db.prepare(
              `SELECT
                 session_token,
                 SUM(CASE WHEN kind = 'attempt' THEN 1 ELSE 0 END) AS attempts,
                 SUM(CASE WHEN kind = 'attempt' AND correct = 1 THEN 1 ELSE 0 END) AS correct,
                 SUM(CASE WHEN kind = 'hint' THEN 1 ELSE 0 END) AS hints,
                 SUM(CASE WHEN kind = 'reveal' THEN 1 ELSE 0 END) AS reveals,
                 COUNT(DISTINCT CASE WHEN task_id IS NOT NULL AND task_id != '' AND task_id != 'session' THEN task_id END) AS task_count
               FROM events
               GROUP BY session_token`
            );

        const [students, apps, sessionsRes, aggRes] = await Promise.all([
          getStudents(db),
          getApps(db, false),
          sessionsStmt.all(),
          aggStmt.all()
        ]);

        const aggByToken = new Map();
        for (const row of aggRes.results || []) {
          aggByToken.set(row.session_token, row);
        }

        const summaries = (sessionsRes.results || [])
          .map(row => summarizeSessionFromAgg(row, aggByToken.get(row.token)))
          .filter(s => s.students.includes(studentName));

        const matchingTokens = summaries.map(s => s.token);
        const attemptEvents = [];
        // Query attempt events in chunks to stay safely below SQLite parameter limits
        for (let i = 0; i < matchingTokens.length; i += 80) {
          const chunk = matchingTokens.slice(i, i + 80);
          const placeholders = chunk.map(() => '?').join(',');
          const { results } = await db.prepare(
            `SELECT s.app_id, s.app_title, e.mode, e.level, e.correct
             FROM events e
             JOIN sessions s ON s.token = e.session_token
             WHERE e.kind = 'attempt' AND e.session_token IN (${placeholders})`
          ).bind(...chunk).all();
          for (const ev of results || []) {
            attemptEvents.push({
              app: ev.app_id,
              appTitle: ev.app_title,
              mode: ev.mode || '',
              level: ev.level || '',
              correct: Boolean(ev.correct)
            });
          }
        }

        const studentRec = students.find(st => st.name === studentName);
        const report = buildStudentReport({
          studentName,
          studentCourse: studentRec?.course || '',
          summaries,
          attemptEvents,
          apps,
          range
        });

        return jsonResponse({
          aulaName: cfg.aulaName,
          ...report
        });
      }

      if (method === 'GET' && pathname.startsWith('/api/teacher/sessions/')) {
        const token = decodeURIComponent(pathname.slice('/api/teacher/sessions/'.length));
        const session = await db.prepare('SELECT * FROM sessions WHERE token = ?').bind(token).first();
        if (!session) return jsonResponse({ error: 'Sesión no encontrada.' }, 404);
        const { results: evs } = await db.prepare('SELECT * FROM events WHERE session_token = ? ORDER BY rowid ASC').bind(token).all();
        return jsonResponse({
          summary: summarizeSessionRow(session, evs || []),
          tasks: buildTasksFromDbEvents(evs || [])
        });
      }

      if (method === 'DELETE' && pathname.startsWith('/api/teacher/sessions/')) {
        const token = decodeURIComponent(pathname.slice('/api/teacher/sessions/'.length));
        const exists = await db.prepare('SELECT 1 FROM sessions WHERE token = ?').bind(token).first();
        if (!exists) return jsonResponse({ error: 'Sesión no encontrada.' }, 404);
        await db.batch([
          db.prepare('DELETE FROM events WHERE session_token = ?').bind(token),
          db.prepare('DELETE FROM sessions WHERE token = ?').bind(token)
        ]);
        return jsonResponse({ ok: true });
      }

      if (method === 'PUT' && pathname === '/api/teacher/students') {
        const body = await readJson(request);
        if (!Array.isArray(body.students)) {
          return jsonResponse({ error: 'Lista de alumnado no válida.' }, 400);
        }
        const seen = new Set();
        const cleaned = [];
        for (const item of body.students) {
          const name = String(typeof item === 'string' ? item : item?.name || '').trim().slice(0, 60);
          const course = String(typeof item === 'string' ? '' : item?.course || '').trim().slice(0, 20);
          if (!name) continue;
          const key = name.toLocaleLowerCase('es');
          if (seen.has(key)) continue;
          seen.add(key);
          cleaned.push({ name, course });
        }

        const stmts = [db.prepare('DELETE FROM students')];
        cleaned.forEach((st, idx) => {
          stmts.push(db.prepare('INSERT INTO students (name, course, position) VALUES (?, ?, ?)').bind(st.name, st.course, idx));
        });
        await db.batch(stmts);
        return jsonResponse({ students: cleaned });
      }

      if (method === 'POST' && pathname === '/api/teacher/apps') {
        const body = await readJson(request);
        const title = String(body.title || '').trim().slice(0, 80);
        const area = String(body.area || 'Otras áreas').trim().slice(0, 40);
        const cycle = String(body.cycle || '2.º ciclo').trim().slice(0, 30);
        const unit = String(body.unit || '').trim().slice(0, 30);
        const description = String(body.description || '').trim().slice(0, 240);
        if (!title) return jsonResponse({ error: 'Escribe el nombre de la aplicación.' }, 400);

        let externalUrl;
        try {
          externalUrl = safeExternalUrl(body.externalUrl);
        } catch (err) {
          return jsonResponse({ error: err.message }, 400);
        }

        const id = 'custom-' + randomHex(5);
        await db.prepare(
          `INSERT INTO apps (id, title, area, cycle, unit, description, cover_type, external_url, visible, built_in, position)
           VALUES (?, ?, ?, ?, ?, ?, 'custom', ?, 1, 0, 100)`
        ).bind(id, title, area, cycle, unit, description || 'Recurso externo añadido por el docente.', externalUrl).run();

        return jsonResponse({
          app: {
            id,
            title,
            area,
            cycle,
            unit,
            description: description || 'Recurso externo añadido por el docente.',
            coverType: 'custom',
            externalUrl,
            visible: true,
            builtIn: false
          }
        }, 201);
      }

      if (method === 'PATCH' && pathname.startsWith('/api/teacher/apps/')) {
        const id = decodeURIComponent(pathname.slice('/api/teacher/apps/'.length));
        const appRow = await db.prepare('SELECT * FROM apps WHERE id = ?').bind(id).first();
        if (!appRow) return jsonResponse({ error: 'Aplicación no encontrada.' }, 404);
        const body = await readJson(request);
        const visible = typeof body.visible === 'boolean' ? (body.visible ? 1 : 0) : appRow.visible;
        await db.prepare('UPDATE apps SET visible = ? WHERE id = ?').bind(visible, id).run();
        return jsonResponse({ app: { ...appRow, visible: Boolean(visible) } });
      }

      if (method === 'DELETE' && pathname.startsWith('/api/teacher/apps/')) {
        const id = decodeURIComponent(pathname.slice('/api/teacher/apps/'.length));
        const appRow = await db.prepare('SELECT id, built_in FROM apps WHERE id = ?').bind(id).first();
        if (!appRow) return jsonResponse({ error: 'Aplicación no encontrada.' }, 404);
        if (appRow.built_in) {
          return jsonResponse({ error: 'Las aplicaciones integradas solo se pueden ocultar, no eliminar.' }, 400);
        }
        await db.prepare('DELETE FROM apps WHERE id = ?').bind(id).run();
        return jsonResponse({ ok: true });
      }

      if (method === 'PUT' && pathname === '/api/teacher/config') {
        const body = await readJson(request);
        const updates = [];
        const extraStmts = [];

        if (typeof body.aulaName === 'string' && body.aulaName.trim()) {
          updates.push(['aulaName', body.aulaName.trim().slice(0, 60)]);
        }
        if (typeof body.subtitle === 'string') {
          updates.push(['subtitle', body.subtitle.trim().slice(0, 80)]);
        }
        if (typeof body.pinEnabled === 'boolean') {
          updates.push(['pinEnabled', body.pinEnabled ? 'true' : 'false']);
        }
        if (body.sessionTtlHours !== undefined) {
          updates.push(['sessionTtlHours', String(Math.max(1, Math.min(24, Number(body.sessionTtlHours) || 8)))]);
        }
        if (typeof body.allowGuestStudents === 'boolean') {
          updates.push(['allowGuestStudents', body.allowGuestStudents ? 'true' : 'false']);
        }
        if (typeof body.allowedTeacherEmail === 'string') {
          updates.push(['allowedTeacherEmail', body.allowedTeacherEmail.trim().toLowerCase().slice(0, 120)]);
        }
        if (typeof body.newPin === 'string' && body.newPin.trim().length >= 4) {
          const newSalt = randomHex(16);
          const newHash = await hashPin(body.newPin.trim(), newSalt);
          updates.push(['pinSalt', newSalt], ['pinHash', newHash], ['isDefaultPin', 'false']);
          // Invalidate other teacher sessions when PIN changes, keeping current session alive
          const currentSid = parseCookies(request).aula_docente || '';
          if (currentSid) {
            extraStmts.push(db.prepare('DELETE FROM teacher_tokens WHERE sid != ?').bind(currentSid));
          }
        }

        if (typeof body.newClassCode === 'string' && body.newClassCode.trim().length >= 4) {
          const codeSalt = randomHex(16);
          const codeHash = await hashPin(body.newClassCode.trim(), codeSalt);
          updates.push(['classCodeSalt', codeSalt], ['classCodeHash', codeHash], ['classCodeEnabled', 'true']);
          extraStmts.push(db.prepare('DELETE FROM classroom_tokens'));
        } else if (typeof body.classCodeEnabled === 'boolean') {
          if (body.classCodeEnabled && !cfg.classCodeHash) {
            return jsonResponse({ error: 'Escribe una clave de aula de al menos 4 caracteres para activarla.' }, 400);
          }
          updates.push(['classCodeEnabled', body.classCodeEnabled ? 'true' : 'false']);
          if (!body.classCodeEnabled) {
            extraStmts.push(db.prepare('DELETE FROM classroom_tokens'));
          }
        }

        const allStmts = [
          ...updates.map(([k, v]) =>
            db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').bind(k, v)
          ),
          ...extraStmts
        ];
        if (allStmts.length) {
          await db.batch(allStmts);
        }

        const nextCfg = await getConfig(db);
        return jsonResponse({
          ok: true,
          config: {
            aulaName: nextCfg.aulaName,
            subtitle: nextCfg.subtitle,
            pinEnabled: nextCfg.pinEnabled,
            isDefaultPin: nextCfg.isDefaultPin,
            sessionTtlHours: nextCfg.sessionTtlHours,
            classCodeEnabled: nextCfg.classCodeEnabled,
            allowGuestStudents: nextCfg.allowGuestStudents,
            allowedTeacherEmail: nextCfg.allowedTeacherEmail
          }
        });
      }

      if (method === 'GET' && pathname === '/api/teacher/export.csv') {
        const studentFilter = url.searchParams.get('student') || '';
        const appFilter = url.searchParams.get('app') || '';
        const range = url.searchParams.get('range') || 'all';
        const cutoffIso = resolveDateCutoff(range);

        const sessionsQuery = cutoffIso
          ? db.prepare('SELECT * FROM sessions WHERE created_at >= ? ORDER BY created_at DESC').bind(cutoffIso)
          : db.prepare('SELECT * FROM sessions ORDER BY created_at DESC');

        const eventsQuery = cutoffIso
          ? db.prepare(
              `SELECT e.* FROM events e
               JOIN sessions s ON s.token = e.session_token
               WHERE s.created_at >= ? AND e.kind IN ('attempt', 'reveal')
               ORDER BY e.rowid ASC`
            ).bind(cutoffIso)
          : db.prepare(`SELECT * FROM events WHERE kind IN ('attempt', 'reveal') ORDER BY rowid ASC`);

        const [{ results: sessions }, { results: allEvents }] = await Promise.all([
          sessionsQuery.all(),
          eventsQuery.all()
        ]);

        const eventsByToken = new Map();
        for (const ev of allEvents || []) {
          if (!eventsByToken.has(ev.session_token)) eventsByToken.set(ev.session_token, []);
          eventsByToken.get(ev.session_token).push(ev);
        }

        const rows = [
          ['Fecha', 'Código sesión', 'Aplicación', 'Participantes', 'Modo', 'Nivel', 'Actividad', 'Respuesta', 'Acierto', 'Con ayuda', 'Tiempo (s)'].join(';')
        ];

        for (const s of sessions || []) {
          if (appFilter && s.app_id !== appFilter) continue;
          let students = [];
          try { students = JSON.parse(s.students_json || '[]'); } catch {}
          if (studentFilter && !students.includes(studentFilter)) continue;

          for (const ev of eventsByToken.get(s.token) || []) {
            rows.push([
              ev.client_at || s.created_at,
              s.code,
              s.app_title,
              students.join(' + '),
              ev.mode,
              ev.level,
              ev.prompt,
              ev.kind === 'reveal' ? '[Solución revelada]' : ev.answer,
              ev.kind === 'reveal' ? 'Revelado' : (ev.correct ? 'Sí' : 'No'),
              ev.assisted ? 'Sí' : 'No',
              Math.round((Number(ev.task_ms) || 0) / 1000)
            ].map(csvEscape).join(';'));
          }
        }

        const csv = '\uFEFF' + rows.join('\r\n');
        return new Response(csv, {
          status: 200,
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="mi-aula-resultados-${new Date().toISOString().slice(0, 10)}.csv"`,
            'Cache-Control': 'no-store',
            'X-Robots-Tag': 'noindex, nofollow'
          }
        });
      }

      if (method === 'GET' && pathname === '/api/teacher/export-additio.csv') {
        const range = url.searchParams.get('range') || 'all';
        const scale = url.searchParams.get('scale') === '100' ? '100' : '10';
        const cutoffIso = resolveDateCutoff(range);

        const sessionsStmt = cutoffIso
          ? db.prepare('SELECT * FROM sessions WHERE created_at >= ? ORDER BY created_at DESC').bind(cutoffIso)
          : db.prepare('SELECT * FROM sessions ORDER BY created_at DESC');

        const aggStmt = cutoffIso
          ? db.prepare(
              `SELECT
                 e.session_token,
                 SUM(CASE WHEN e.kind = 'attempt' THEN 1 ELSE 0 END) AS attempts,
                 SUM(CASE WHEN e.kind = 'attempt' AND e.correct = 1 THEN 1 ELSE 0 END) AS correct,
                 SUM(CASE WHEN e.kind = 'hint' THEN 1 ELSE 0 END) AS hints
               FROM events e
               JOIN sessions s ON s.token = e.session_token
               WHERE s.created_at >= ?
               GROUP BY e.session_token`
            ).bind(cutoffIso)
          : db.prepare(
              `SELECT
                 session_token,
                 SUM(CASE WHEN kind = 'attempt' THEN 1 ELSE 0 END) AS attempts,
                 SUM(CASE WHEN kind = 'attempt' AND correct = 1 THEN 1 ELSE 0 END) AS correct,
                 SUM(CASE WHEN kind = 'hint' THEN 1 ELSE 0 END) AS hints
               FROM events
               GROUP BY session_token`
            );

        const [students, apps, sessionsRes, aggRes] = await Promise.all([
          getStudents(db),
          getApps(db, false),
          sessionsStmt.all(),
          aggStmt.all()
        ]);

        const builtInApps = apps.filter(a => a.builtIn);
        const aggByToken = new Map();
        for (const row of aggRes.results || []) aggByToken.set(row.session_token, row);

        const byStudent = new Map();
        for (const st of students) {
          byStudent.set(st.name, { name: st.name, course: st.course || '', sessions: 0, attempts: 0, correct: 0, hints: 0, activeMs: 0, apps: {} });
        }

        for (const row of sessionsRes.results || []) {
          const agg = aggByToken.get(row.token) || {};
          const attempts = Number(agg.attempts) || 0;
          const correct = Number(agg.correct) || 0;
          const hints = Number(agg.hints) || 0;
          const activeMs = Number(row.active_ms) || 0;
          let stList = [];
          try { stList = JSON.parse(row.students_json || '[]'); } catch {}

          for (const studentName of stList) {
            if (!byStudent.has(studentName)) {
              byStudent.set(studentName, { name: studentName, course: '', sessions: 0, attempts: 0, correct: 0, hints: 0, activeMs: 0, apps: {} });
            }
            const rec = byStudent.get(studentName);
            rec.sessions++;
            rec.attempts += attempts;
            rec.correct += correct;
            rec.hints += hints;
            rec.activeMs += activeMs;
            if (!rec.apps[row.app_id]) rec.apps[row.app_id] = { attempts: 0, correct: 0 };
            rec.apps[row.app_id].attempts += attempts;
            rec.apps[row.app_id].correct += correct;
          }
        }

        const formatScore = (correct, attempts) => {
          if (!attempts) return '';
          if (scale === '100') return String(Math.round((correct / attempts) * 100));
          return ((correct / attempts) * 10).toFixed(1).replace('.', ',');
        };

        const sortedStudents = [...byStudent.values()].sort((a, b) =>
          (a.course || 'ZZ').localeCompare(b.course || 'ZZ', 'es') || a.name.localeCompare(b.name, 'es')
        );

        const suffix = scale === '100' ? '(%)' : '(/10)';
        const header = [
          'Alumno',
          'Curso',
          'Sesiones',
          'Intentos',
          'Aciertos',
          'Acierto global (%)',
          'Nota global (/10)',
          'Tiempo activo (min)',
          ...builtInApps.map(a => `${a.title} ${suffix}`)
        ];

        const rows = [header.map(csvEscape).join(';')];
        for (const st of sortedStudents) {
          const globalPct = st.attempts > 0 ? String(Math.round((st.correct / st.attempts) * 100)) : '';
          const globalGrade = st.attempts > 0 ? ((st.correct / st.attempts) * 10).toFixed(1).replace('.', ',') : '';
          const mins = (st.activeMs / 60000).toFixed(1).replace('.', ',');
          const appCells = builtInApps.map(a => {
            const cell = st.apps[a.id];
            return cell ? formatScore(cell.correct, cell.attempts) : '';
          });
          rows.push([
            st.name,
            st.course,
            st.sessions,
            st.attempts,
            st.correct,
            globalPct,
            globalGrade,
            mins,
            ...appCells
          ].map(csvEscape).join(';'));
        }

        const csv = '\uFEFF' + rows.join('\r\n');
        return new Response(csv, {
          status: 200,
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="mi-aula-additio-${range}-${new Date().toISOString().slice(0, 10)}.csv"`,
            'Cache-Control': 'no-store',
            'X-Robots-Tag': 'noindex, nofollow'
          }
        });
      }
    }

    return jsonResponse({ error: 'Ruta de API no encontrada.' }, 404);
  } catch (err) {
    return jsonResponse({ error: err?.message || 'Error interno del servidor.' }, 500);
  }
}
