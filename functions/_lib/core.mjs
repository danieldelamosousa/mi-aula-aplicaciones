// Shared domain catalog & analytics core for Mi aula
// Used by both Cloudflare Pages Functions (ESM) and local Node server.js (dynamic import).

export const BUILT_IN_APPS = [
  {
    id: 'mercadito',
    title: 'El mercadito',
    area: 'Matemáticas',
    cycle: '2.º ciclo',
    courses: ['3.º', '4.º'],
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
    courses: ['3.º', '4.º'],
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
    courses: ['3.º', '4.º'],
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
    courses: ['3.º', '4.º'],
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
    courses: ['3.º', '4.º'],
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
    courses: ['3.º', '4.º'],
    unit: 'Numeración',
    description: 'Explora un número de 3, 4 o 6 cifras. Practica el valor posicional, la descomposición, el redondeo y el Número sol.',
    coverType: 'number',
    position: 6
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
    position: 7
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
    position: 8
  },
  {
    id: 'taller-problemas',
    title: 'Taller de problemas paso a paso',
    area: 'Matemáticas',
    cycle: '3.º y 4.º',
    courses: ['3.º', '4.º'],
    unit: 'Problemas',
    description: 'Lee despacio, selecciona los datos clave, elige el esquema visual y resuelve problemas de nivel inicial, 3.º y 4.º paso a paso.',
    coverType: 'problems',
    position: 9
  },
  {
    id: 'clases-palabras',
    title: 'Clases de palabras y oraciones',
    area: 'Lengua',
    cycle: '3.º y 4.º',
    courses: ['3.º', '4.º'],
    unit: 'Gramática',
    description: 'Identifica sustantivos, adjetivos, verbos, determinantes y pronombres con código de color DUA, practica concordancia y construye oraciones.',
    coverType: 'grammar',
    position: 10
  }
];

export const BUILT_IN_APP_MAP = new Map(BUILT_IN_APPS.map(app => [app.id, app]));

export const DEFAULT_STUDENTS = [
  { name: 'Lucía G.', course: '3.º' },
  { name: 'Mateo R.', course: '3.º' },
  { name: 'Sofía M.', course: '3.º' },
  { name: 'Hugo P.', course: '3.º' },
  { name: 'Valeria C.', course: '4.º' },
  { name: 'Leo D.', course: '4.º' },
  { name: 'Martina S.', course: '4.º' },
  { name: 'Daniel V.', course: '4.º' }
];

export function resolveDateCutoff(range) {
  const now = new Date();
  if (range === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return start.toISOString();
  }
  if (range === '7d') return new Date(now.getTime() - 7 * 86400 * 1000).toISOString();
  if (range === '30d') return new Date(now.getTime() - 30 * 86400 * 1000).toISOString();
  if (range === '90d') return new Date(now.getTime() - 90 * 86400 * 1000).toISOString();
  return null;
}

export function computeWeakSpots(rawRows = [], limit = 6) {
  return rawRows
    .map(r => {
      const attempts = Number(r.attempts) || 0;
      const correct = Number(r.correct) || 0;
      const accuracy = attempts > 0 ? Math.round((correct / attempts) * 100) : 100;
      return {
        app: r.app || r.app_id || '',
        appTitle: r.appTitle || r.app_title || '',
        mode: r.mode || '',
        level: r.level || '',
        attempts,
        correct,
        accuracy
      };
    })
    .filter(w => w.attempts >= 3 && w.accuracy < 80)
    .sort((a, b) => a.accuracy - b.accuracy || b.attempts - a.attempts)
    .slice(0, limit);
}

export function paginateSessions(items = [], rawPage = 1, rawPageSize = 50) {
  const pageSize = Math.max(10, Math.min(300, Number(rawPageSize) || 50));
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.max(1, Math.min(totalPages, Number(rawPage) || 1));
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  return {
    items: items.slice(start, end),
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages,
      hasPrev: page > 1,
      hasNext: page < totalPages,
      startIndex: totalItems === 0 ? 0 : start + 1,
      endIndex: Math.min(totalItems, end)
    }
  };
}

export function aggregateDashboard({
  summaries = [],
  students = [],
  weakRows = [],
  page = 1,
  pageSize = 50,
  filters = {},
  nowMs = Date.now()
}) {
  let totalAttempts = 0;
  let totalCorrect = 0;
  let totalActiveMs = 0;
  let activeSessions = 0;
  const byApp = {};
  const byStudent = {};
  const liveSessions = [];

  for (const st of students) {
    const name = typeof st === 'string' ? st : st.name;
    const course = typeof st === 'string' ? '' : (st.course || '');
    if (!name) continue;
    byStudent[name] = {
      name,
      course,
      sessions: 0,
      attempts: 0,
      correct: 0,
      hints: 0,
      activeMs: 0,
      apps: {}
    };
  }

  for (const s of summaries) {
    totalAttempts += s.attempts;
    totalCorrect += s.correct;
    totalActiveMs += s.activeMs;

    if (s.status === 'activa') {
      activeSessions++;
      const lastMs = new Date(s.lastActivityAt || s.createdAt).getTime() || 0;
      const isRecentlyActive = nowMs - lastMs < 5 * 60 * 1000;
      const needsAttention =
        (s.attempts >= 2 && s.accuracy !== null && s.accuracy < 55) ||
        (s.hints + (s.reveals || 0) >= 3);
      liveSessions.push({
        ...s,
        isRecentlyActive,
        needsAttention
      });
    }

    if (!byApp[s.app]) {
      byApp[s.app] = {
        app: s.app,
        title: s.appTitle,
        sessions: 0,
        attempts: 0,
        correct: 0,
        activeMs: 0
      };
    }
    byApp[s.app].sessions++;
    byApp[s.app].attempts += s.attempts;
    byApp[s.app].correct += s.correct;
    byApp[s.app].activeMs += s.activeMs;

    for (const studentName of s.students || []) {
      if (!byStudent[studentName]) {
        byStudent[studentName] = {
          name: studentName,
          course: '',
          sessions: 0,
          attempts: 0,
          correct: 0,
          hints: 0,
          activeMs: 0,
          apps: {}
        };
      }
      const rec = byStudent[studentName];
      rec.sessions++;
      rec.attempts += s.attempts;
      rec.correct += s.correct;
      rec.hints += s.hints;
      rec.activeMs += s.activeMs;
      if (!rec.apps[s.app]) {
        rec.apps[s.app] = {
          title: s.appTitle,
          sessions: 0,
          attempts: 0,
          correct: 0,
          hints: 0,
          activeMs: 0
        };
      }
      rec.apps[s.app].sessions++;
      rec.apps[s.app].attempts += s.attempts;
      rec.apps[s.app].correct += s.correct;
      rec.apps[s.app].hints += s.hints;
      rec.apps[s.app].activeMs += s.activeMs;
    }
  }

  liveSessions.sort((a, b) =>
    Number(b.needsAttention) - Number(a.needsAttention) ||
    new Date(b.lastActivityAt || b.createdAt).getTime() - new Date(a.lastActivityAt || a.createdAt).getTime()
  );

  const fStudent = String(filters.student || '').trim();
  const fApp = String(filters.app || '').trim();
  const fStatus = String(filters.status || '').trim();

  const filteredSessions = summaries.filter(s => {
    if (fStudent && !(s.students || []).includes(fStudent)) return false;
    if (fApp && s.app !== fApp) return false;
    if (fStatus && s.status !== fStatus) return false;
    return true;
  });

  const paged = paginateSessions(filteredSessions, page, pageSize);

  return {
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
    weakSpots: computeWeakSpots(weakRows, 6),
    liveSessions: liveSessions.slice(0, 40),
    totalSessionsCount: summaries.length,
    filteredSessionsCount: filteredSessions.length,
    sessionsTruncated: paged.pagination.totalPages > 1,
    pagination: paged.pagination,
    sessions: paged.items
  };
}

function getIsoWeekKey(isoStr) {
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return null;
  // Monday-based week start (UTC)
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() - (day - 1));
  const y = utc.getUTCFullYear();
  const m = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(utc.getUTCDate()).padStart(2, '0');
  return {
    key: `${y}-${m}-${dd}`,
    label: `Sem. ${dd}/${m}`
  };
}

export function buildStudentReport({
  studentName,
  studentCourse = '',
  summaries = [],
  attemptEvents = [],
  apps = [],
  range = 'all',
  nowMs = Date.now()
}) {
  const appMeta = new Map((apps || []).map(a => [a.id, a]));
  const matching = summaries
    .filter(s => Array.isArray(s.students) && s.students.includes(studentName))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  let attempts = 0;
  let correct = 0;
  let hints = 0;
  let reveals = 0;
  let activeMs = 0;

  const byAppMap = new Map();
  const byWeekMap = new Map();

  for (const s of matching) {
    attempts += s.attempts || 0;
    correct += s.correct || 0;
    hints += s.hints || 0;
    reveals += s.reveals || 0;
    activeMs += s.activeMs || 0;

    if (!byAppMap.has(s.app)) {
      const meta = appMeta.get(s.app) || BUILT_IN_APP_MAP.get(s.app);
      byAppMap.set(s.app, {
        app: s.app,
        title: s.appTitle || meta?.title || s.app,
        area: meta?.area || '',
        sessions: 0,
        attempts: 0,
        correct: 0,
        hints: 0,
        activeMs: 0
      });
    }
    const appRec = byAppMap.get(s.app);
    appRec.sessions++;
    appRec.attempts += s.attempts || 0;
    appRec.correct += s.correct || 0;
    appRec.hints += s.hints || 0;
    appRec.activeMs += s.activeMs || 0;

    const wk = getIsoWeekKey(s.createdAt);
    if (wk) {
      if (!byWeekMap.has(wk.key)) {
        byWeekMap.set(wk.key, {
          weekKey: wk.key,
          label: wk.label,
          sessions: 0,
          attempts: 0,
          correct: 0,
          activeMs: 0
        });
      }
      const wRec = byWeekMap.get(wk.key);
      wRec.sessions++;
      wRec.attempts += s.attempts || 0;
      wRec.correct += s.correct || 0;
      wRec.activeMs += s.activeMs || 0;
    }
  }

  const byApp = [...byAppMap.values()]
    .map(a => ({
      ...a,
      accuracy: a.attempts > 0 ? Math.round((a.correct / a.attempts) * 100) : null
    }))
    .sort((a, b) => a.area.localeCompare(b.area, 'es') || a.title.localeCompare(b.title, 'es'));

  const timeline = [...byWeekMap.values()]
    .sort((a, b) => a.weekKey.localeCompare(b.weekKey))
    .slice(-8)
    .map(w => ({
      ...w,
      accuracy: w.attempts > 0 ? Math.round((w.correct / w.attempts) * 100) : null
    }));

  // Compute temporal trend comparing earlier half vs recent half of active weeks with attempts
  const activeWeeks = timeline.filter(w => w.accuracy !== null);
  let trendDelta = null;
  if (activeWeeks.length >= 2) {
    const mid = Math.floor(activeWeeks.length / 2);
    const prevSlice = activeWeeks.slice(0, mid);
    const recentSlice = activeWeeks.slice(mid);
    const prevAttempts = prevSlice.reduce((sum, w) => sum + w.attempts, 0);
    const prevCorrect = prevSlice.reduce((sum, w) => sum + w.correct, 0);
    const recAttempts = recentSlice.reduce((sum, w) => sum + w.attempts, 0);
    const recCorrect = recentSlice.reduce((sum, w) => sum + w.correct, 0);
    if (prevAttempts > 0 && recAttempts > 0) {
      trendDelta = Math.round((recCorrect / recAttempts) * 100) - Math.round((prevCorrect / prevAttempts) * 100);
    }
  }

  // Group attempt events by (app, mode, level) for strengths & toReinforce
  const blockMap = new Map();
  for (const ev of attemptEvents || []) {
    const key = `${ev.app}::${ev.mode || ''}::${ev.level || ''}`;
    if (!blockMap.has(key)) {
      blockMap.set(key, {
        app: ev.app,
        appTitle: ev.appTitle || appMeta.get(ev.app)?.title || ev.app,
        mode: ev.mode || '',
        level: ev.level || '',
        attempts: 0,
        correct: 0
      });
    }
    const b = blockMap.get(key);
    b.attempts++;
    if (ev.correct) b.correct++;
  }

  const blocks = [...blockMap.values()]
    .filter(b => b.attempts >= 2)
    .map(b => ({
      ...b,
      accuracy: Math.round((b.correct / b.attempts) * 100)
    }));

  const strengths = blocks
    .filter(b => b.accuracy >= 80)
    .sort((a, b) => b.accuracy - a.accuracy || b.attempts - a.attempts)
    .slice(0, 5);

  const toReinforce = blocks
    .filter(b => b.accuracy < 75)
    .sort((a, b) => a.accuracy - b.accuracy || b.attempts - a.attempts)
    .slice(0, 5);

  return {
    generatedAt: new Date(nowMs).toISOString(),
    range,
    student: {
      name: studentName,
      course: studentCourse
    },
    overview: {
      sessions: matching.length,
      attempts,
      correct,
      hints,
      reveals,
      accuracy: attempts > 0 ? Math.round((correct / attempts) * 100) : null,
      activeMs
    },
    trendDelta,
    timeline,
    byApp,
    strengths,
    toReinforce,
    recentSessions: matching.slice(0, 10)
  };
}
