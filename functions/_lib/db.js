// Shared Cloudflare D1 database layer & helpers for Mi aula (Pages Functions)

export const BUILT_IN_APPS = [
  {
    id: 'mercadito',
    title: 'El mercadito',
    area: 'Matemáticas',
    cycle: '2.º ciclo',
    unit: 'Dinero y cálculo',
    description: 'Compra, paga y devuelve el cambio con monedas y billetes. Elige el nivel y practica a tu ritmo.',
    coverType: 'market',
    position: 1
  },
  {
    id: 'palabras',
    title: 'Taller de palabras',
    area: 'Lengua',
    cycle: '2.º ciclo',
    unit: 'U2',
    description: 'Subraya prefijos y sufijos y forma palabras derivadas a partir de una raíz. Contenidos de 3.º y 4.º.',
    coverType: 'words',
    position: 2
  },
  {
    id: 'ortografia',
    title: 'Taller de ortografía',
    area: 'Lengua',
    cycle: '2.º ciclo',
    unit: 'U2',
    description: 'Practica las tildes y clasifica palabras. Corrige mayúsculas y coloca los tipos de punto en textos con párrafos.',
    coverType: 'ortho',
    position: 3
  },
  {
    id: 'taller-lengua-u3',
    title: 'Taller de Lengua U3',
    area: 'Lengua',
    cycle: '3.º y 4.º',
    unit: 'U3',
    description: 'En 3.º, practica palabras polisémicas, aumentativos, diminutivos, palabras compuestas y listas. En 4.º, repasa sinónimos, adjetivos, descripciones de animales, diptongos e hiatos.',
    coverType: 'lengua-u3',
    position: 4
  },
  {
    id: 'calculadora',
    title: 'Calculadora bloqueada',
    area: 'Matemáticas',
    cycle: '2.º ciclo',
    unit: 'Cálculo mental',
    description: 'Alcanza el número objetivo con sumas, restas y multiplicaciones sin usar las teclas bloqueadas. Retos aleatorios de 2 y 3 cifras.',
    coverType: 'calc',
    position: 5
  },
  {
    id: 'numero-protagonista',
    title: 'El número protagonista',
    area: 'Matemáticas',
    cycle: '2.º ciclo',
    unit: 'Numeración',
    description: 'Explora un número de 4 o 6 cifras. Practica el valor posicional, la descomposición, el redondeo y el Número sol.',
    coverType: 'number',
    position: 6
  },
  {
    id: 'taller-multiplicacion',
    title: 'Taller de multiplicación U3',
    area: 'Matemáticas',
    cycle: '3.º y 4.º',
    unit: 'U3',
    description: 'Elige tu curso y practica grupos iguales, tablas y problemas, con un teclado numérico para responder.',
    coverType: 'multiply',
    position: 7
  },
  {
    id: 'penaltis-tablas',
    title: 'Penaltis de las tablas',
    area: 'Matemáticas',
    cycle: '2.º ciclo',
    unit: 'Tablas',
    description: 'Practica las tablas del 1 al 10 chutando el resultado correcto o forma sumas repetidas con pelotas y aros.',
    coverType: 'penalty',
    position: 8
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

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS students (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE COLLATE NOCASE, course TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS apps (id TEXT PRIMARY KEY, title TEXT NOT NULL, area TEXT NOT NULL, cycle TEXT NOT NULL DEFAULT '', unit TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', cover_type TEXT NOT NULL DEFAULT 'custom', external_url TEXT, visible INTEGER NOT NULL DEFAULT 1, built_in INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, app_id TEXT NOT NULL, app_title TEXT NOT NULL, students_json TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, last_activity_at TEXT NOT NULL, ended_at TEXT, active_ms INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, session_token TEXT NOT NULL, kind TEXT NOT NULL, task_id TEXT NOT NULL, mode TEXT NOT NULL DEFAULT '', level TEXT NOT NULL DEFAULT '', prompt TEXT NOT NULL DEFAULT '', answer TEXT NOT NULL DEFAULT '', correct INTEGER, assisted INTEGER NOT NULL DEFAULT 0, task_ms INTEGER NOT NULL DEFAULT 0, active_ms INTEGER NOT NULL DEFAULT 0, client_at TEXT NOT NULL, received_at TEXT NOT NULL, FOREIGN KEY (session_token) REFERENCES sessions(token) ON DELETE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS teacher_tokens (sid TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_code ON sessions(code)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_token)`
];

let initialized = false;

export function randomHex(bytes = 16) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return [...arr].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function randomToken(bytes = 18) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  let bin = '';
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function hashPin(pin, salt) {
  const data = new TextEncoder().encode(`${salt}:${String(pin)}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function generateShortCode(db) {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const randPick = str => {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return str[arr[0] % str.length];
  };
  for (let i = 0; i < 30; i++) {
    const code = `${randPick(letters)}${randPick(letters)}${randPick(letters)}-${randPick(digits)}${randPick(digits)}${randPick(digits)}`;
    const exists = await db.prepare('SELECT 1 FROM sessions WHERE code = ?').bind(code).first();
    if (!exists) return code;
  }
  return `AUL-${Math.floor(100 + Math.random() * 900)}`;
}

export async function ensureDb(db) {
  if (!db) {
    throw new Error('Base de datos D1 (binding "DB") no configurada en Cloudflare Pages.');
  }
  if (initialized) return;

  for (const sql of SCHEMA_STATEMENTS) {
    await db.prepare(sql).run();
  }

  // Seed default config if missing
  const existingCfg = await db.prepare('SELECT value FROM config WHERE key = ?').bind('aulaName').first();
  if (!existingCfg) {
    const salt = randomHex(16);
    const pinHash = await hashPin('1234', salt);
    const defaults = [
      ['aulaName', 'Mi aula'],
      ['subtitle', '2.º ciclo de Primaria'],
      ['pinEnabled', 'true'],
      ['pinSalt', salt],
      ['pinHash', pinHash],
      ['isDefaultPin', 'true'],
      ['sessionTtlHours', '8']
    ];
    await db.batch(defaults.map(([k, v]) =>
      db.prepare('INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)').bind(k, v)
    ));
  }

  // Ensure all 8 built-in apps exist
  await db.batch(BUILT_IN_APPS.map(app =>
    db.prepare(
      `INSERT OR IGNORE INTO apps (id, title, area, cycle, unit, description, cover_type, external_url, visible, built_in, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 1, 1, ?)`
    ).bind(app.id, app.title, app.area, app.cycle, app.unit, app.description, app.coverType, app.position)
  ));

  // Seed default students only on very first init (when seeded flag not set)
  const seeded = await db.prepare('SELECT value FROM config WHERE key = ?').bind('studentsSeeded').first();
  if (!seeded) {
    await db.batch([
      ...DEFAULT_STUDENTS.map((st, idx) =>
        db.prepare('INSERT OR IGNORE INTO students (name, course, position) VALUES (?, ?, ?)').bind(st.name, st.course, idx)
      ),
      db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').bind('studentsSeeded', 'true')
    ]);
  }

  initialized = true;
}

export async function getConfig(db) {
  const { results } = await db.prepare('SELECT key, value FROM config').all();
  const map = {};
  for (const r of results || []) map[r.key] = r.value;
  return {
    aulaName: map.aulaName || 'Mi aula',
    subtitle: map.subtitle || '2.º ciclo de Primaria',
    pinEnabled: map.pinEnabled !== 'false',
    pinSalt: map.pinSalt || '',
    pinHash: map.pinHash || '',
    isDefaultPin: map.isDefaultPin === 'true',
    sessionTtlHours: Math.max(1, Math.min(24, Number(map.sessionTtlHours) || 8))
  };
}

export async function getApps(db, onlyVisible = false) {
  const sql = onlyVisible
    ? 'SELECT * FROM apps WHERE visible = 1 ORDER BY position ASC, title ASC'
    : 'SELECT * FROM apps ORDER BY position ASC, title ASC';
  const { results } = await db.prepare(sql).all();
  return (results || []).map(r => ({
    id: r.id,
    title: r.title,
    area: r.area,
    cycle: r.cycle,
    unit: r.unit,
    description: r.description,
    coverType: r.cover_type,
    externalUrl: r.external_url || undefined,
    visible: Boolean(r.visible),
    builtIn: Boolean(r.built_in)
  }));
}

export async function getStudents(db) {
  const { results } = await db.prepare('SELECT name, course FROM students ORDER BY position ASC, name ASC').all();
  return (results || []).map(r => ({ name: r.name, course: r.course || '' }));
}

export function parseCookies(request) {
  const header = request.headers.get('cookie') || '';
  const cookies = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      cookies[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return cookies;
}

export async function isTeacherAuthenticated(db, request, config = null) {
  const cfg = config || await getConfig(db);
  if (!cfg.pinEnabled) return true;
  const cookies = parseCookies(request);
  const sid = cookies.aula_docente;
  if (!sid) return false;
  const row = await db.prepare('SELECT expires_at FROM teacher_tokens WHERE sid = ?').bind(sid).first();
  if (!row || Number(row.expires_at) < Date.now()) {
    if (row) await db.prepare('DELETE FROM teacher_tokens WHERE sid = ?').bind(sid).run();
    return false;
  }
  return true;
}

export function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders
    }
  });
}

export function safeExternalUrl(value) {
  const parsed = new URL(String(value || '').trim());
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('Enlace no válido. Usa una dirección http:// o https://');
  }
  return parsed.href;
}

export function csvEscape(val) {
  const s = String(val ?? '');
  if (/[",\r\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function summarizeSessionRow(row, events) {
  let attempts = 0, correct = 0, hints = 0, reveals = 0;
  const tasks = new Set();
  for (const ev of events) {
    if (ev.task_id && ev.task_id !== 'session') tasks.add(ev.task_id);
    if (ev.kind === 'attempt') {
      attempts++;
      if (ev.correct) correct++;
    } else if (ev.kind === 'hint') hints++;
    else if (ev.kind === 'reveal') reveals++;
  }

  let students = [];
  try { students = JSON.parse(row.students_json || '[]'); } catch {}

  const expired = new Date(row.expires_at).getTime() < Date.now();
  const status = row.ended_at ? 'finalizada' : (expired ? 'caducada' : 'activa');

  return {
    token: row.token,
    code: row.code,
    app: row.app_id,
    appTitle: row.app_title,
    students,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    endedAt: row.ended_at || null,
    lastActivityAt: row.last_activity_at || row.created_at,
    activeMs: Number(row.active_ms) || 0,
    status,
    attempts,
    correct,
    accuracy: attempts > 0 ? Math.round((correct / attempts) * 100) : null,
    hints,
    reveals,
    taskCount: tasks.size
  };
}

export function buildTasksFromDbEvents(events) {
  const map = new Map();
  const order = [];
  for (const ev of events) {
    if (ev.kind === 'heartbeat' || ev.kind === 'end') continue;
    const key = ev.task_id || `ev-${ev.id}`;
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
        startedAt: ev.client_at || ev.received_at
      };
      map.set(key, entry);
      order.push(entry);
    }
    const item = map.get(key);
    if (ev.prompt && item.prompt === 'Actividad sin enunciado') item.prompt = ev.prompt;
    if (ev.level && !item.level) item.level = ev.level;
    if (Number(ev.task_ms) > item.taskMs) item.taskMs = Number(ev.task_ms);
    if (ev.assisted) item.assisted = true;

    if (ev.kind === 'attempt') {
      item.attempts.push({
        answer: ev.answer || '',
        correct: Boolean(ev.correct),
        at: ev.client_at || ev.received_at,
        taskMs: Number(ev.task_ms) || 0
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
