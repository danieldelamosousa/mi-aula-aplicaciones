'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'aula-db.json');

const BUILT_IN_APPS = [
  {
    id: 'mercadito',
    title: 'El mercadito',
    area: 'Matemáticas',
    cycle: '2.º ciclo',
    courses: ['3.º', '4.º'],
    unit: 'Dinero y cálculo',
    description: 'Compra, paga y devuelve el cambio con monedas y billetes. Elige el nivel y practica a tu ritmo.',
    coverType: 'market',
    visible: true,
    builtIn: true
  },
  {
    id: 'palabras',
    title: 'Taller de palabras',
    area: 'Lengua',
    cycle: '2.º ciclo',
    courses: ['3.º', '4.º'],
    unit: 'U2',
    description: 'Subraya prefijos y sufijos y forma palabras derivadas a partir de una raíz. Contenidos de 3.º y 4.º.',
    coverType: 'words',
    visible: true,
    builtIn: true
  },
  {
    id: 'ortografia',
    title: 'Taller de ortografía',
    area: 'Lengua',
    cycle: '2.º ciclo',
    courses: ['3.º', '4.º'],
    unit: 'U2',
    description: 'Practica las tildes y clasifica palabras. Corrige mayúsculas y coloca los tipos de punto en textos con párrafos.',
    coverType: 'ortho',
    visible: true,
    builtIn: true
  },
  {
    id: 'taller-lengua-u3',
    title: 'Taller de Lengua U3',
    area: 'Lengua',
    cycle: '3.º y 4.º',
    courses: ['3.º', '4.º'],
    unit: 'U3',
    description: 'En 3.º, practica palabras polisémicas, aumentativos, diminutivos, palabras compuestas y listas. En 4.º, repasa sinónimos, adjetivos, descripciones de animales, diptongos e hiatos.',
    coverType: 'lengua-u3',
    visible: true,
    builtIn: true
  },
  {
    id: 'calculadora',
    title: 'Calculadora bloqueada',
    area: 'Matemáticas',
    cycle: '2.º ciclo',
    courses: ['3.º', '4.º'],
    unit: 'Cálculo mental',
    description: 'Alcanza el número objetivo con sumas, restas y multiplicaciones sin usar las teclas bloqueadas. Retos aleatorios de 2 y 3 cifras.',
    coverType: 'calc',
    visible: true,
    builtIn: true
  },
  {
    id: 'numero-protagonista',
    title: 'El número protagonista',
    area: 'Matemáticas',
    cycle: '2.º ciclo',
    courses: ['3.º', '4.º'],
    unit: 'Numeración',
    description: 'Explora un número de 4 o 6 cifras. Practica el valor posicional, la descomposición, el redondeo y el Número sol.',
    coverType: 'number',
    visible: true,
    builtIn: true
  },
  {
    id: 'taller-multiplicacion',
    title: 'Taller de multiplicación U3',
    area: 'Matemáticas',
    cycle: '3.º y 4.º',
    courses: ['3.º', '4.º'],
    unit: 'U3',
    description: 'Elige tu curso y practica grupos iguales, tablas y problemas, con un teclado numérico para responder.',
    coverType: 'multiply',
    visible: true,
    builtIn: true
  },
  {
    id: 'penaltis-tablas',
    title: 'Penaltis de las tablas',
    area: 'Matemáticas',
    cycle: '2.º ciclo',
    courses: ['3.º', '4.º'],
    unit: 'Tablas',
    description: 'Practica las tablas del 1 al 10 chutando el resultado correcto o forma sumas repetidas con pelotas y aros.',
    coverType: 'penalty',
    visible: true,
    builtIn: true
  }
];

const DEFAULT_STUDENTS = [
  { name: 'Lucía G.', course: '3.º' },
  { name: 'Mateo R.', course: '3.º' },
  { name: 'Sofía M.', course: '3.º' },
  { name: 'Hugo P.', course: '3.º' },
  { name: 'Valeria C.', course: '4.º' },
  { name: 'Leo D.', course: '4.º' },
  { name: 'Martina S.', course: '4.º' },
  { name: 'Daniel V.', course: '4.º' }
];

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json'
};

// In-memory teacher & classroom login tokens (cookie-based) and rate-limit buckets
const teacherCookies = new Map();
const classroomCookies = new Map();
const authBuckets = new Map();
const PBKDF2_ITERATIONS = 100000;

function hashPin(pin, salt) {
  const derived = crypto.pbkdf2Sync(String(pin), String(salt), PBKDF2_ITERATIONS, 32, 'sha256').toString('hex');
  return `pbkdf2$${PBKDF2_ITERATIONS}$${derived}`;
}

function timingSafeEqualStr(a, b) {
  const ba = Buffer.from(String(a ?? ''), 'utf8');
  const bb = Buffer.from(String(b ?? ''), 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function verifySecret(secret, salt, storedHash) {
  if (!storedHash || !salt) return { ok: false, needsUpgrade: false };
  const raw = String(storedHash);
  if (raw.startsWith('pbkdf2$')) {
    const parts = raw.split('$');
    const iters = Math.min(PBKDF2_ITERATIONS, Math.max(1000, Number(parts[1]) || PBKDF2_ITERATIONS));
    const expected = parts[2] || '';
    const actual = crypto.pbkdf2Sync(String(secret), String(salt), iters, 32, 'sha256').toString('hex');
    return { ok: timingSafeEqualStr(actual, expected), needsUpgrade: false };
  }
  const legacy = crypto.createHash('sha256').update(`${salt}:${String(secret)}`).digest('hex');
  const ok = timingSafeEqualStr(legacy, raw);
  return { ok, needsUpgrade: ok };
}

function getClientHash(req) {
  const ip = String(req.headers['cf-connecting-ip'] || (req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket?.remoteAddress || 'local').trim();
  return crypto.createHash('sha256').update(`client:${ip}`).digest('hex').slice(0, 24);
}

function getAccessEmail(req) {
  return String(req.headers['cf-access-authenticated-user-email'] || '').trim().toLowerCase();
}

function checkAuthLock(keys) {
  const now = Date.now();
  let maxRetry = 0;
  for (const key of keys) {
    const row = authBuckets.get(key);
    if (row && row.lockedUntil > now) {
      const sec = Math.ceil((row.lockedUntil - now) / 1000);
      if (sec > maxRetry) maxRetry = sec;
    }
  }
  return maxRetry;
}

function recordAuthFailure(key, thresholds = { t1: 5, l1: 300, t2: 8, l2: 900, t3: 10, l3: 1800 }) {
  const now = Date.now();
  const row = authBuckets.get(key);
  const prev = row && (now - row.updatedAt < 3600 * 1000) ? row.failures : 0;
  const failures = prev + 1;
  let lockSec = 0;
  if (failures >= thresholds.t3) lockSec = thresholds.l3;
  else if (failures >= thresholds.t2) lockSec = thresholds.l2;
  else if (failures >= thresholds.t1) lockSec = thresholds.l1;
  authBuckets.set(key, { failures, lockedUntil: lockSec > 0 ? now + lockSec * 1000 : 0, updatedAt: now });
  return { failures, lockSec };
}

function clearAuthFailures(keys) {
  for (const k of keys) authBuckets.delete(k);
}

function checkWindowRateLimit(key, maxHits, windowMs) {
  const now = Date.now();
  const row = authBuckets.get(key);
  const inWindow = row && (now - row.updatedAt < windowMs);
  const count = inWindow ? row.failures : 0;
  if (count >= maxHits) {
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((row.updatedAt + windowMs - now) / 1000)) };
  }
  authBuckets.set(key, { failures: count + 1, lockedUntil: 0, updatedAt: inWindow ? row.updatedAt : now });
  return { allowed: true, retryAfterSec: 0 };
}

function formatRetryMessage(retryAfterSec) {
  if (retryAfterSec >= 60) {
    const mins = Math.ceil(retryAfterSec / 60);
    return `Demasiados intentos fallidos. Espera ${mins} ${mins === 1 ? 'minuto' : 'minutos'} antes de volver a intentarlo.`;
  }
  return `Demasiados intentos fallidos. Espera ${retryAfterSec} segundos antes de volver a intentarlo.`;
}

function resolveDateCutoff(range) {
  const now = new Date();
  if (range === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  if (range === '7d') return new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString();
  if (range === '30d') return new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString();
  if (range === '90d') return new Date(now.getTime() - 90 * 24 * 3600 * 1000).toISOString();
  return null;
}

function createInitialDb() {
  const salt = crypto.randomBytes(16).toString('hex');
  return {
    version: 1,
    config: {
      aulaName: 'Mi aula',
      subtitle: '2.º ciclo de Primaria',
      pinEnabled: true,
      pinSalt: salt,
      pinHash: hashPin('1234', salt),
      isDefaultPin: true,
      sessionTtlHours: 8,
      classCodeEnabled: false,
      classCodeSalt: '',
      classCodeHash: '',
      allowGuestStudents: true,
      allowedTeacherEmail: ''
    },
    students: DEFAULT_STUDENTS,
    apps: BUILT_IN_APPS,
    sessions: []
  };
}

function loadDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    const initial = createInitialDb();
    saveDb(initial);
    return initial;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    // Ensure all built-in apps exist
    const existingIds = new Set((raw.apps || []).map(a => a.id));
    raw.apps = raw.apps || [];
    for (const bi of BUILT_IN_APPS) {
      if (!existingIds.has(bi.id)) raw.apps.push(bi);
    }
    raw.students = Array.isArray(raw.students) ? raw.students : DEFAULT_STUDENTS;
    raw.sessions = Array.isArray(raw.sessions) ? raw.sessions : [];
    return raw;
  } catch (err) {
    console.error('Error leyendo la base de datos, creando una nueva:', err.message);
    const fresh = createInitialDb();
    saveDb(fresh);
    return fresh;
  }
}

function saveDb(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmpPath = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpPath, DB_PATH);
}

let db = loadDb();

function generateShortCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const activeCodes = new Set(db.sessions.map(s => s.code));
  for (let i = 0; i < 40; i++) {
    let code = '';
    for (let j = 0; j < 3; j++) code += letters[crypto.randomInt(letters.length)];
    code += '-';
    for (let j = 0; j < 3; j++) code += digits[crypto.randomInt(digits.length)];
    if (!activeCodes.has(code)) return code;
  }
  return `AUL-${crypto.randomInt(100, 999)}`;
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const cookies = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      cookies[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return cookies;
}

function isTeacherAuthenticated(req) {
  const accessEmail = getAccessEmail(req);
  const allowed = (db.config.allowedTeacherEmail || '').trim().toLowerCase();
  if (allowed && accessEmail && accessEmail !== allowed) return false;
  if (!db.config.pinEnabled) return true;
  const cookies = parseCookies(req);
  const sid = cookies.aula_docente;
  if (!sid) return false;
  const expiresAt = teacherCookies.get(sid);
  if (!expiresAt || expiresAt < Date.now()) {
    teacherCookies.delete(sid);
    return false;
  }
  return true;
}

function isClassroomUnlocked(req) {
  if (!db.config.classCodeEnabled || !db.config.classCodeHash) return true;
  if (isTeacherAuthenticated(req)) return true;
  const cookies = parseCookies(req);
  const sid = cookies.aula_clase;
  if (!sid) return false;
  const expiresAt = classroomCookies.get(sid);
  if (!expiresAt || expiresAt < Date.now()) {
    classroomCookies.delete(sid);
    return false;
  }
  return true;
}

function sendJson(res, status, data, extraHeaders = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex, nofollow',
    ...extraHeaders
  });
  res.end(body);
}

function readJsonBody(req, maxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('Cuerpo demasiado grande'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('JSON no válido'));
      }
    });
    req.on('error', reject);
  });
}

function safeExternalUrl(value) {
  const parsed = new URL(String(value || '').trim());
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('Enlace no válido. Usa una dirección http:// o https://');
  }
  return parsed.href;
}

function summarizeSession(session) {
  const events = Array.isArray(session.events) ? session.events : [];
  let attempts = 0;
  let correct = 0;
  let hints = 0;
  let reveals = 0;
  const tasks = new Set();

  for (const ev of events) {
    if (ev.taskId && ev.taskId !== 'session') tasks.add(ev.taskId);
    if (ev.kind === 'attempt') {
      attempts++;
      if (ev.correct) correct++;
    } else if (ev.kind === 'hint') {
      hints++;
    } else if (ev.kind === 'reveal') {
      reveals++;
    }
  }

  const now = Date.now();
  const expired = new Date(session.expiresAt).getTime() < now;
  const status = session.endedAt ? 'finalizada' : (expired ? 'caducada' : 'activa');

  return {
    token: session.token,
    code: session.code,
    app: session.app,
    appTitle: session.appTitle,
    students: session.students,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    endedAt: session.endedAt || null,
    lastActivityAt: session.lastActivityAt || session.createdAt,
    activeMs: session.activeMs || 0,
    status,
    attempts,
    correct,
    accuracy: attempts > 0 ? Math.round((correct / attempts) * 100) : null,
    hints,
    reveals,
    taskCount: tasks.size
  };
}

function buildSessionTasks(session) {
  const map = new Map();
  const order = [];
  for (const ev of session.events || []) {
    if (ev.kind === 'heartbeat' || ev.kind === 'end') continue;
    const key = ev.taskId || `ev-${ev.id}`;
    if (!map.has(key)) {
      const entry = {
        taskId: key,
        mode: ev.mode || 'general',
        level: ev.level || '',
        prompt: ev.prompt || 'Actividad sin enunciado',
        attempts: [],
        hints: 0,
        revealed: false,
        skipped: false,
        solved: false,
        assisted: false,
        taskMs: 0,
        startedAt: ev.clientAt || ev.receivedAt
      };
      map.set(key, entry);
      order.push(entry);
    }
    const item = map.get(key);
    if (ev.prompt && item.prompt === 'Actividad sin enunciado') item.prompt = ev.prompt;
    if (ev.level && !item.level) item.level = ev.level;
    if (ev.taskMs > item.taskMs) item.taskMs = ev.taskMs;
    if (ev.assisted) item.assisted = true;

    if (ev.kind === 'attempt') {
      item.attempts.push({
        answer: ev.answer || '',
        correct: Boolean(ev.correct),
        at: ev.clientAt || ev.receivedAt,
        taskMs: ev.taskMs || 0
      });
      if (ev.correct) item.solved = true;
    } else if (ev.kind === 'hint') {
      item.hints++;
      item.assisted = true;
    } else if (ev.kind === 'reveal') {
      item.revealed = true;
      item.assisted = true;
    } else if (ev.kind === 'skip') {
      item.skipped = true;
    }
  }
  return order;
}

function csvEscape(val) {
  const s = String(val ?? '');
  if (/[",\r\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function serveStatic(req, res, pathname) {
  let targetPath = pathname;
  if (targetPath === '/' || targetPath === '') targetPath = '/index.html';
  else if (targetPath === '/abrir') targetPath = '/abrir.html';
  else if (targetPath === '/docente') targetPath = '/docente.html';

  let filePath = path.normalize(path.join(PUBLIC_DIR, decodeURIComponent(targetPath)));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Acceso denegado');
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    if (!pathname.endsWith('/')) {
      const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
      res.writeHead(301, { Location: pathname + '/' + qs });
      res.end();
      return;
    }
    filePath = path.join(filePath, 'index.html');
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    const custom404 = path.join(PUBLIC_DIR, '404.html');
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow' });
    if (fs.existsSync(custom404)) {
      fs.createReadStream(custom404).pipe(res);
    } else {
      res.end('<!doctype html><html lang="es"><meta charset="utf-8"><title>No encontrado · Mi aula</title><body style="font-family:system-ui;padding:48px;background:#f8f7f0;color:#173e39"><h1>Página no encontrada</h1><p><a href="/" style="color:#1c6759;font-weight:700">← Volver a Mi aula</a></p></body></html>');
    }
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': ext === '.webp' || ext === '.png' || ext === '.svg' ? 'public, max-age=86400' : 'no-cache',
    'X-Robots-Tag': 'noindex, nofollow',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin'
  });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;
    const method = req.method.toUpperCase();

    // Short code direct redirect: /codigo/ABC-123
    if (method === 'GET' && pathname.startsWith('/codigo/')) {
      const raw = decodeURIComponent(pathname.slice('/codigo/'.length)).trim().toUpperCase().replace(/\s+/g, '');
      const code = raw.includes('-') ? raw : (raw.length === 6 ? `${raw.slice(0, 3)}-${raw.slice(3)}` : raw);
      const session = db.sessions.find(s => s.code === code);
      if (!session || session.endedAt || new Date(session.expiresAt).getTime() < Date.now()) {
        res.writeHead(302, { Location: '/?codigo_invalido=1' });
        res.end();
        return;
      }
      const dest = `/apps/${encodeURIComponent(session.app)}/?aula=1#sesion=${encodeURIComponent(session.token)}`;
      res.writeHead(302, { Location: dest });
      res.end();
      return;
    }

    // ---- PUBLIC API ----
    if (method === 'GET' && pathname === '/api/apps') {
      const showAll = parsedUrl.searchParams.get('all') === '1' && isTeacherAuthenticated(req);
      const apps = showAll ? db.apps : db.apps.filter(a => a.visible !== false);
      return sendJson(res, 200, {
        aulaName: db.config.aulaName,
        subtitle: db.config.subtitle || '2.º ciclo de Primaria',
        apps
      });
    }

    if (method === 'GET' && pathname === '/api/profile') {
      const classCodeRequired = Boolean(db.config.classCodeEnabled && db.config.classCodeHash);
      const allowGuestStudents = db.config.allowGuestStudents !== false;
      const unlocked = isClassroomUnlocked(req);
      if (!unlocked) {
        return sendJson(res, 200, {
          aulaName: db.config.aulaName,
          sessionTtlHours: db.config.sessionTtlHours || 8,
          classCodeRequired: true,
          unlocked: false,
          allowGuestStudents,
          students: [],
          roster: []
        });
      }
      return sendJson(res, 200, {
        aulaName: db.config.aulaName,
        sessionTtlHours: db.config.sessionTtlHours || 8,
        classCodeRequired,
        unlocked: true,
        allowGuestStudents,
        students: db.students.map(s => (typeof s === 'string' ? s : s.name)),
        roster: db.students.map(s => (typeof s === 'string' ? { name: s, course: '' } : s))
      });
    }

    if (method === 'POST' && pathname === '/api/classroom/unlock') {
      if (!db.config.classCodeEnabled || !db.config.classCodeHash) {
        return sendJson(res, 200, { ok: true });
      }
      const clientHash = getClientHash(req);
      const lockKeys = [`class:${clientHash}`];
      const retryAfter = checkAuthLock(lockKeys);
      if (retryAfter > 0) {
        return sendJson(res, 429, { error: formatRetryMessage(retryAfter) }, { 'Retry-After': String(retryAfter) });
      }
      const body = await readJsonBody(req);
      const code = String(body.code || '').trim();
      const { ok, needsUpgrade } = verifySecret(code, db.config.classCodeSalt, db.config.classCodeHash);
      if (!ok) {
        const resLock = recordAuthFailure(`class:${clientHash}`);
        if (resLock.lockSec > 0) {
          return sendJson(res, 429, { error: formatRetryMessage(resLock.lockSec) }, { 'Retry-After': String(resLock.lockSec) });
        }
        return sendJson(res, 401, { error: 'Clave de aula incorrecta. Inténtalo de nuevo.' });
      }
      clearAuthFailures(lockKeys);
      if (needsUpgrade) {
        db.config.classCodeHash = hashPin(code, db.config.classCodeSalt);
        saveDb(db);
      }
      const sid = crypto.randomBytes(24).toString('base64url');
      const ttlSec = 30 * 24 * 3600;
      classroomCookies.set(sid, Date.now() + ttlSec * 1000);
      return sendJson(res, 200, { ok: true }, { 'Set-Cookie': `aula_clase=${sid}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${ttlSec}` });
    }

    if (method === 'POST' && pathname === '/api/sessions') {
      if (!isClassroomUnlocked(req)) {
        return sendJson(res, 403, { error: 'Introduce la clave de aula antes de iniciar una sesión registrada.' });
      }
      const clientHash = getClientHash(req);
      const rate = checkWindowRateLimit(`sess:${clientHash}`, 40, 10 * 60 * 1000);
      if (!rate.allowed) {
        return sendJson(res, 429, { error: 'Se han creado demasiadas sesiones seguidas desde esta red. Espera unos minutos.' }, { 'Retry-After': String(rate.retryAfterSec) });
      }

      const body = await readJsonBody(req);
      const appId = String(body.app || '').trim();
      const appObj = db.apps.find(a => a.id === appId && a.builtIn);
      if (!appObj) {
        return sendJson(res, 400, { error: 'Aplicación no válida.' });
      }
      let students = Array.isArray(body.students)
        ? [...new Set(body.students.map(s => String(s).trim().slice(0, 60)).filter(Boolean))].slice(0, 12)
        : [];
      if (!students.length) {
        return sendJson(res, 400, { error: 'Selecciona al menos un alumno o alumna.' });
      }
      if (db.config.allowGuestStudents === false) {
        const byLower = new Map(db.students.map(s => {
          const n = typeof s === 'string' ? s : s.name;
          return [n.toLocaleLowerCase('es'), n];
        }));
        const matched = [];
        for (const name of students) {
          const canonical = byLower.get(name.toLocaleLowerCase('es'));
          if (!canonical) {
            return sendJson(res, 400, { error: 'Solo pueden participar alumnos incluidos en la lista oficial de clase.' });
          }
          matched.push(canonical);
        }
        students = [...new Set(matched)];
      }

      const token = crypto.randomBytes(18).toString('base64url');
      const code = generateShortCode();
      const now = new Date();
      const ttlHours = Math.max(1, Math.min(24, Number(db.config.sessionTtlHours) || 8));
      const expiresAt = new Date(now.getTime() + ttlHours * 3600 * 1000);

      const session = {
        token,
        code,
        app: appObj.id,
        appTitle: appObj.title,
        students,
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        lastActivityAt: now.toISOString(),
        endedAt: null,
        activeMs: 0,
        events: []
      };

      db.sessions.unshift(session);
      saveDb(db);

      return sendJson(res, 201, {
        token,
        code,
        app: appObj.id,
        appTitle: appObj.title,
        students,
        expiresAt: session.expiresAt,
        ttlHours
      });
    }

    if (method === 'GET' && pathname === '/api/sessions/resolve') {
      const code = String(parsedUrl.searchParams.get('code') || '').trim().toUpperCase().replace(/\s+/g, '');
      const normalized = code.includes('-') ? code : (code.length === 6 ? `${code.slice(0, 3)}-${code.slice(3)}` : code);
      const session = db.sessions.find(s => s.code === normalized);
      if (!session) {
        return sendJson(res, 404, { error: 'No encontramos ninguna sesión con ese código.' });
      }
      if (session.endedAt) {
        return sendJson(res, 410, { error: 'Esta sesión ya ha terminado.' });
      }
      if (new Date(session.expiresAt).getTime() < Date.now()) {
        return sendJson(res, 410, { error: 'Este código ha caducado. Pide uno nuevo al docente.' });
      }
      return sendJson(res, 200, {
        code: session.code,
        app: session.app,
        appTitle: session.appTitle,
        students: session.students,
        url: `/apps/${encodeURIComponent(session.app)}/?aula=1#sesion=${encodeURIComponent(session.token)}`
      });
    }

    if (method === 'GET' && pathname === '/api/sessions/info') {
      const token = String(parsedUrl.searchParams.get('token') || '').trim();
      const session = db.sessions.find(s => s.token === token);
      if (!session) {
        return sendJson(res, 404, { error: 'Sesión no encontrada.' });
      }
      return sendJson(res, 200, {
        code: session.code,
        app: session.app,
        appTitle: session.appTitle,
        students: session.students,
        expiresAt: session.expiresAt,
        endedAt: session.endedAt
      });
    }

    if (method === 'POST' && pathname === '/api/events') {
      const body = await readJsonBody(req);
      const token = String(body.token || '').trim();
      const incoming = Array.isArray(body.events) ? body.events : [];
      const session = db.sessions.find(s => s.token === token);
      if (!session) {
        return sendJson(res, 403, { error: 'La sesión no existe o ha sido eliminada.' });
      }
      if (session.endedAt) {
        return sendJson(res, 403, { error: 'Esta sesión ya se cerró.' });
      }
      if (new Date(session.expiresAt).getTime() < Date.now()) {
        return sendJson(res, 403, { error: 'El tiempo de la sesión ha expirado.' });
      }

      const existingIds = new Set(session.events.map(e => e.id));
      const saved = [];
      const nowIso = new Date().toISOString();

      for (const ev of incoming.slice(0, 50)) {
        if (!ev || !ev.id) continue;
        const id = String(ev.id).slice(0, 100);
        saved.push(id);
        if (existingIds.has(id)) continue;
        existingIds.add(id);

        const cleanEvent = {
          id,
          kind: String(ev.kind || 'heartbeat').slice(0, 32),
          taskId: String(ev.taskId || 'session').slice(0, 100),
          mode: String(ev.mode || '').slice(0, 64),
          level: String(ev.level || '').slice(0, 120),
          prompt: String(ev.prompt || '').slice(0, 500),
          answer: String(ev.answer || '').slice(0, 1200),
          correct: ev.correct === null || ev.correct === undefined ? null : Boolean(ev.correct),
          assisted: Boolean(ev.assisted),
          taskMs: Math.max(0, Number(ev.taskMs) || 0),
          activeMs: Math.max(0, Number(ev.activeMs) || 0),
          clientAt: String(ev.clientAt || nowIso),
          receivedAt: nowIso
        };

        if (cleanEvent.activeMs > (session.activeMs || 0)) {
          session.activeMs = cleanEvent.activeMs;
        }
        session.lastActivityAt = nowIso;

        if (cleanEvent.kind === 'end') {
          session.endedAt = nowIso;
        }
        if (cleanEvent.kind !== 'heartbeat') {
          session.events.push(cleanEvent);
        }
      }

      saveDb(db);
      return sendJson(res, 200, { saved });
    }

    // ---- TEACHER AUTH API ----
    if (method === 'GET' && pathname === '/api/teacher/status') {
      return sendJson(res, 200, {
        authenticated: isTeacherAuthenticated(req),
        pinEnabled: Boolean(db.config.pinEnabled),
        isDefaultPin: Boolean(db.config.isDefaultPin),
        aulaName: db.config.aulaName,
        accessEmail: getAccessEmail(req) || null
      });
    }

    if (method === 'POST' && pathname === '/api/teacher/login') {
      const accessEmail = getAccessEmail(req);
      const allowedEmail = (db.config.allowedTeacherEmail || '').trim().toLowerCase();
      if (allowedEmail && accessEmail && accessEmail !== allowedEmail) {
        return sendJson(res, 403, { error: 'Tu cuenta de Cloudflare Access no está autorizada para este panel.' });
      }
      const clientHash = getClientHash(req);
      const ipKey = `login:${clientHash}`;
      const globalKey = 'login:global';
      const retryAfter = checkAuthLock([ipKey, globalKey]);
      if (retryAfter > 0) {
        return sendJson(res, 429, { error: formatRetryMessage(retryAfter) }, { 'Retry-After': String(retryAfter) });
      }
      const body = await readJsonBody(req);
      const pin = String(body.pin || '').trim();
      const { ok, needsUpgrade } = db.config.pinEnabled
        ? verifySecret(pin, db.config.pinSalt, db.config.pinHash)
        : { ok: true, needsUpgrade: false };
      if (db.config.pinEnabled && !ok) {
        const ipRes = recordAuthFailure(ipKey, { t1: 5, l1: 300, t2: 8, l2: 900, t3: 10, l3: 1800 });
        const glRes = recordAuthFailure(globalKey, { t1: 15, l1: 600, t2: 25, l2: 1800, t3: 40, l3: 3600 });
        const lockSec = Math.max(ipRes.lockSec, glRes.lockSec);
        if (lockSec > 0) {
          return sendJson(res, 429, { error: formatRetryMessage(lockSec) }, { 'Retry-After': String(lockSec) });
        }
        return sendJson(res, 401, { error: 'PIN incorrecto. Inténtalo de nuevo.' });
      }
      clearAuthFailures([ipKey, globalKey]);
      if (needsUpgrade && pin) {
        db.config.pinHash = hashPin(pin, db.config.pinSalt);
        saveDb(db);
      }
      const sid = crypto.randomBytes(24).toString('base64url');
      teacherCookies.set(sid, Date.now() + 12 * 3600 * 1000);
      return sendJson(
        res,
        200,
        { ok: true },
        { 'Set-Cookie': `aula_docente=${sid}; HttpOnly; Path=/; SameSite=Lax; Max-Age=43200` }
      );
    }

    if (method === 'POST' && pathname === '/api/teacher/logout') {
      const cookies = parseCookies(req);
      if (cookies.aula_docente) teacherCookies.delete(cookies.aula_docente);
      return sendJson(
        res,
        200,
        { ok: true },
        { 'Set-Cookie': 'aula_docente=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0' }
      );
    }

    // Protected teacher endpoints
    if (pathname.startsWith('/api/teacher/')) {
      if (!isTeacherAuthenticated(req)) {
        return sendJson(res, 401, { error: 'Inicia sesión con el PIN docente.' });
      }

      if (method === 'GET' && pathname === '/api/teacher/dashboard') {
        const range = parsedUrl.searchParams.get('range') || 'all';
        const cutoffIso = resolveDateCutoff(range);
        const scopedSessions = (cutoffIso
          ? db.sessions.filter(s => (s.createdAt || '') >= cutoffIso)
          : db.sessions
        ).slice(0, 300);
        const summaries = scopedSessions.map(summarizeSession);
        let totalAttempts = 0;
        let totalCorrect = 0;
        let totalActiveMs = 0;
        let activeSessions = 0;
        const byApp = {};
        const byStudent = {};

        for (const st of db.students) {
          const name = typeof st === 'string' ? st : st.name;
          const course = typeof st === 'string' ? '' : (st.course || '');
          byStudent[name] = { name, course, sessions: 0, attempts: 0, correct: 0, hints: 0, activeMs: 0, apps: {} };
        }

        for (const s of summaries) {
          totalAttempts += s.attempts;
          totalCorrect += s.correct;
          totalActiveMs += s.activeMs;
          if (s.status === 'activa') activeSessions++;

          if (!byApp[s.app]) {
            byApp[s.app] = { app: s.app, title: s.appTitle, sessions: 0, attempts: 0, correct: 0, activeMs: 0 };
          }
          byApp[s.app].sessions++;
          byApp[s.app].attempts += s.attempts;
          byApp[s.app].correct += s.correct;
          byApp[s.app].activeMs += s.activeMs;

          for (const studentName of s.students) {
            if (!byStudent[studentName]) {
              byStudent[studentName] = { name: studentName, course: '', sessions: 0, attempts: 0, correct: 0, hints: 0, activeMs: 0, apps: {} };
            }
            const rec = byStudent[studentName];
            rec.sessions++;
            rec.attempts += s.attempts;
            rec.correct += s.correct;
            rec.hints += s.hints;
            rec.activeMs += s.activeMs;
            if (!rec.apps[s.app]) rec.apps[s.app] = { title: s.appTitle, attempts: 0, correct: 0 };
            rec.apps[s.app].attempts += s.attempts;
            rec.apps[s.app].correct += s.correct;
          }
        }

        return sendJson(res, 200, {
          range,
          accessEmail: getAccessEmail(req) || null,
          config: {
            aulaName: db.config.aulaName,
            subtitle: db.config.subtitle || '2.º ciclo de Primaria',
            pinEnabled: Boolean(db.config.pinEnabled),
            isDefaultPin: Boolean(db.config.isDefaultPin),
            sessionTtlHours: db.config.sessionTtlHours || 8,
            classCodeEnabled: Boolean(db.config.classCodeEnabled && db.config.classCodeHash),
            allowGuestStudents: db.config.allowGuestStudents !== false,
            allowedTeacherEmail: db.config.allowedTeacherEmail || ''
          },
          metrics: {
            totalSessions: summaries.length,
            activeSessions,
            totalAttempts,
            totalCorrect,
            accuracy: totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : null,
            totalActiveMs
          },
          byApp: Object.values(byApp),
          byStudent: Object.values(byStudent),
          students: db.students,
          apps: db.apps,
          sessions: summaries
        });
      }

      if (method === 'GET' && pathname.startsWith('/api/teacher/sessions/')) {
        const token = decodeURIComponent(pathname.slice('/api/teacher/sessions/'.length));
        const session = db.sessions.find(s => s.token === token);
        if (!session) return sendJson(res, 404, { error: 'Sesión no encontrada.' });
        return sendJson(res, 200, {
          summary: summarizeSession(session),
          tasks: buildSessionTasks(session)
        });
      }

      if (method === 'DELETE' && pathname.startsWith('/api/teacher/sessions/')) {
        const token = decodeURIComponent(pathname.slice('/api/teacher/sessions/'.length));
        const before = db.sessions.length;
        db.sessions = db.sessions.filter(s => s.token !== token);
        if (db.sessions.length === before) {
          return sendJson(res, 404, { error: 'Sesión no encontrada.' });
        }
        saveDb(db);
        return sendJson(res, 200, { ok: true });
      }

      if (method === 'PUT' && pathname === '/api/teacher/students') {
        const body = await readJsonBody(req);
        if (!Array.isArray(body.students)) {
          return sendJson(res, 400, { error: 'Lista de alumnado no válida.' });
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
        db.students = cleaned;
        saveDb(db);
        return sendJson(res, 200, { students: db.students });
      }

      if (method === 'POST' && pathname === '/api/teacher/apps') {
        const body = await readJsonBody(req);
        const title = String(body.title || '').trim().slice(0, 80);
        const area = String(body.area || 'Otras áreas').trim().slice(0, 40);
        const cycle = String(body.cycle || '2.º ciclo').trim().slice(0, 30);
        const unit = String(body.unit || '').trim().slice(0, 30);
        const description = String(body.description || '').trim().slice(0, 240);
        if (!title) return sendJson(res, 400, { error: 'Escribe el nombre de la aplicación.' });
        let externalUrl;
        try {
          externalUrl = safeExternalUrl(body.externalUrl);
        } catch (err) {
          return sendJson(res, 400, { error: err.message });
        }
        const slug = 'custom-' + crypto.randomBytes(5).toString('hex');
        const newApp = {
          id: slug,
          title,
          area,
          cycle,
          courses: ['3.º', '4.º'],
          unit,
          description: description || 'Recurso externo añadido por el docente.',
          coverType: 'custom',
          externalUrl,
          visible: true,
          builtIn: false
        };
        db.apps.push(newApp);
        saveDb(db);
        return sendJson(res, 201, { app: newApp });
      }

      if (method === 'PATCH' && pathname.startsWith('/api/teacher/apps/')) {
        const id = decodeURIComponent(pathname.slice('/api/teacher/apps/'.length));
        const appObj = db.apps.find(a => a.id === id);
        if (!appObj) return sendJson(res, 404, { error: 'Aplicación no encontrada.' });
        const body = await readJsonBody(req);
        if (typeof body.visible === 'boolean') appObj.visible = body.visible;
        saveDb(db);
        return sendJson(res, 200, { app: appObj });
      }

      if (method === 'DELETE' && pathname.startsWith('/api/teacher/apps/')) {
        const id = decodeURIComponent(pathname.slice('/api/teacher/apps/'.length));
        const appObj = db.apps.find(a => a.id === id);
        if (!appObj) return sendJson(res, 404, { error: 'Aplicación no encontrada.' });
        if (appObj.builtIn) return sendJson(res, 400, { error: 'Las aplicaciones integradas solo se pueden ocultar, no eliminar.' });
        db.apps = db.apps.filter(a => a.id !== id);
        saveDb(db);
        return sendJson(res, 200, { ok: true });
      }

      if (method === 'PUT' && pathname === '/api/teacher/config') {
        const body = await readJsonBody(req);
        if (typeof body.aulaName === 'string' && body.aulaName.trim()) {
          db.config.aulaName = body.aulaName.trim().slice(0, 60);
        }
        if (typeof body.subtitle === 'string') {
          db.config.subtitle = body.subtitle.trim().slice(0, 80);
        }
        if (typeof body.pinEnabled === 'boolean') {
          db.config.pinEnabled = body.pinEnabled;
        }
        if (body.sessionTtlHours !== undefined) {
          db.config.sessionTtlHours = Math.max(1, Math.min(24, Number(body.sessionTtlHours) || 8));
        }
        if (typeof body.allowGuestStudents === 'boolean') {
          db.config.allowGuestStudents = body.allowGuestStudents;
        }
        if (typeof body.allowedTeacherEmail === 'string') {
          db.config.allowedTeacherEmail = body.allowedTeacherEmail.trim().toLowerCase().slice(0, 120);
        }
        if (typeof body.newPin === 'string' && body.newPin.trim().length >= 4) {
          const newSalt = crypto.randomBytes(16).toString('hex');
          db.config.pinSalt = newSalt;
          db.config.pinHash = hashPin(body.newPin.trim(), newSalt);
          db.config.isDefaultPin = false;
          const currentSid = parseCookies(req).aula_docente || '';
          for (const sid of teacherCookies.keys()) {
            if (sid !== currentSid) teacherCookies.delete(sid);
          }
        }
        if (typeof body.newClassCode === 'string' && body.newClassCode.trim().length >= 4) {
          const codeSalt = crypto.randomBytes(16).toString('hex');
          db.config.classCodeSalt = codeSalt;
          db.config.classCodeHash = hashPin(body.newClassCode.trim(), codeSalt);
          db.config.classCodeEnabled = true;
          classroomCookies.clear();
        } else if (typeof body.classCodeEnabled === 'boolean') {
          if (body.classCodeEnabled && !db.config.classCodeHash) {
            return sendJson(res, 400, { error: 'Escribe una clave de aula de al menos 4 caracteres para activarla.' });
          }
          db.config.classCodeEnabled = body.classCodeEnabled;
          if (!body.classCodeEnabled) classroomCookies.clear();
        }
        saveDb(db);
        return sendJson(res, 200, {
          ok: true,
          config: {
            aulaName: db.config.aulaName,
            subtitle: db.config.subtitle,
            pinEnabled: db.config.pinEnabled,
            isDefaultPin: db.config.isDefaultPin,
            sessionTtlHours: db.config.sessionTtlHours,
            classCodeEnabled: Boolean(db.config.classCodeEnabled && db.config.classCodeHash),
            allowGuestStudents: db.config.allowGuestStudents !== false,
            allowedTeacherEmail: db.config.allowedTeacherEmail || ''
          }
        });
      }

      if (method === 'GET' && pathname === '/api/teacher/export.csv') {
        const studentFilter = parsedUrl.searchParams.get('student') || '';
        const appFilter = parsedUrl.searchParams.get('app') || '';
        const range = parsedUrl.searchParams.get('range') || 'all';
        const cutoffIso = resolveDateCutoff(range);
        const rows = [
          ['Fecha', 'Código sesión', 'Aplicación', 'Participantes', 'Modo', 'Nivel', 'Actividad', 'Respuesta', 'Acierto', 'Con ayuda', 'Tiempo (s)'].join(';')
        ];
        for (const s of db.sessions) {
          if (cutoffIso && (s.createdAt || '') < cutoffIso) continue;
          if (appFilter && s.app !== appFilter) continue;
          if (studentFilter && !s.students.includes(studentFilter)) continue;
          const attempts = (s.events || []).filter(e => e.kind === 'attempt' || e.kind === 'reveal');
          for (const ev of attempts) {
            rows.push([
              ev.clientAt || s.createdAt,
              s.code,
              s.appTitle,
              s.students.join(' + '),
              ev.mode,
              ev.level,
              ev.prompt,
              ev.kind === 'reveal' ? '[Solución revelada]' : ev.answer,
              ev.kind === 'reveal' ? 'Revelado' : (ev.correct ? 'Sí' : 'No'),
              ev.assisted ? 'Sí' : 'No',
              Math.round((ev.taskMs || 0) / 1000)
            ].map(csvEscape).join(';'));
          }
        }
        const csv = '\uFEFF' + rows.join('\r\n');
        res.writeHead(200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="mi-aula-resultados-${new Date().toISOString().slice(0, 10)}.csv"`,
          'X-Robots-Tag': 'noindex, nofollow'
        });
        res.end(csv);
        return;
      }
    }

    // Static files
    if (method === 'GET' || method === 'HEAD') {
      return serveStatic(req, res, pathname);
    }

    sendJson(res, 405, { error: 'Método no permitido' });
  } catch (err) {
    console.error('Error en servidor:', err);
    sendJson(res, 500, { error: err.message || 'Error interno del servidor' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Mi aula escuchando en http://localhost:${PORT}`);
});
