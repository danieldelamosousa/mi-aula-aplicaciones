(() => {
  'use strict';

  const app = location.pathname.split('/')[2] || '';
  const params = new URLSearchParams(location.search);
  const free = params.get('libre') === '1';
  const DUA_TEXT_KEY = 'mi-aula:dua-text';

  let token = '';
  let storeKey = '';
  let queue = [];
  let last = performance.now();
  let lastAction = Date.now();
  let activeMs = 0;
  let mode = '';
  let tasks = {};
  let sending = false;
  let blocked = false;
  let finished = false;
  let ending = false;
  let attemptCount = 0;
  let correctCount = 0;
  let sessionStudents = [];
  let sessionAppTitle = '';
  let speaking = false;

  if (!free) {
    token = location.hash.startsWith('#sesion=')
      ? decodeURIComponent(location.hash.slice(8))
      : (sessionStorage.getItem('aula-token:' + app) || '');
    if (!token) {
      location.replace('/abrir?app=' + encodeURIComponent(app));
      return;
    }
    sessionStorage.setItem('aula-token:' + app, token);
    history.replaceState(null, '', location.pathname + '?aula=1');
    storeKey = 'aula-pendiente:' + token;
    try {
      const saved = JSON.parse(localStorage.getItem(storeKey) || '{}');
      queue = Array.isArray(saved.queue) ? saved.queue : [];
      activeMs = Number(saved.activeMs) || 0;
      attemptCount = Number(saved.attemptCount) || 0;
      correctCount = Number(saved.correctCount) || 0;
    } catch {
      // Ignore parse errors
    }
  }

  // Restore saved DUA reading comfort mode immediately to avoid layout flash
  try {
    if (localStorage.getItem(DUA_TEXT_KEY) === '1') {
      document.documentElement.classList.add('aula-dua-text');
    }
  } catch {
    // Ignore storage errors
  }

  function persist() {
    if (free) return;
    try {
      localStorage.setItem(storeKey, JSON.stringify({ queue, activeMs, attemptCount, correctCount }));
    } catch {
      setStatus('Mantén abierta esta ventana para guardar.', 'warn');
    }
  }

  function formatClock(ms) {
    const totalSec = Math.floor(ms / 1000);
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text ?? '');
    return div.innerHTML;
  }

  function formatStudentList(names) {
    if (!Array.isArray(names) || !names.length) return '';
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} y ${names[1]}`;
    return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
  }

  function updateHud() {
    const timerEl = document.getElementById('aula-timer');
    if (timerEl) timerEl.textContent = formatClock(activeMs);
    const scoreEl = document.getElementById('aula-score');
    if (scoreEl) {
      scoreEl.textContent = attemptCount > 0
        ? `${correctCount}/${attemptCount} aciertos`
        : 'Sin respuestas aún';
    }
  }

  function tick() {
    const now = performance.now();
    const delta = Math.max(0, Math.min(2000, now - last));
    last = now;
    if (!document.hidden && !finished && Date.now() - lastAction < 90000) {
      activeMs += delta;
      if (tasks[mode] && !tasks[mode].done) tasks[mode].ms += delta;
    }
    updateHud();
  }

  function setStatus(message, tone = 'ok') {
    const el = document.getElementById('aula-save');
    if (!el) return;
    el.textContent = message;
    el.dataset.tone = tone;
  }

  function makeId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'ev-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function enqueue(kind, t, answer = '', correct = null) {
    if (free || blocked || finished) return;
    tick();
    queue.push({
      id: makeId(),
      kind,
      taskId: t?.id || 'session',
      mode: t?.mode || mode || 'inicio',
      level: t?.level || '',
      prompt: t?.prompt || '',
      answer: String(answer).slice(0, 1200),
      correct,
      assisted: !!t?.assisted,
      taskMs: Math.round(t?.ms || 0),
      activeMs: Math.round(activeMs),
      clientAt: new Date().toISOString()
    });
    persist();
    setStatus('Guardando…', 'sync');
    flush();
  }

  let retryDelayMs = 1500;
  let retryTimer = null;

  function scheduleFlush(delay) {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(() => {
      retryTimer = null;
      flush();
    }, delay);
  }

  async function flush() {
    if (free || sending || !queue.length || blocked) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setStatus(`Sin conexión · ${queue.length} en cola`, 'warn');
      return;
    }
    sending = true;
    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, events: queue.slice(0, 15) }),
        keepalive: true
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403) {
          blocked = true;
          setStatus(data.error || 'Sesión cerrada', 'err');
        } else {
          setStatus(`Pendiente · ${queue.length} en cola`, 'warn');
          retryDelayMs = Math.min(30000, retryDelayMs * 2);
          scheduleFlush(retryDelayMs);
        }
        return;
      }
      const ids = new Set(data.saved || []);
      queue = queue.filter(e => !ids.has(e.id));
      retryDelayMs = 1500;
      persist();
      setStatus(queue.length ? 'Guardando…' : 'Guardado', queue.length ? 'sync' : 'ok');
    } catch {
      setStatus(`Sin conexión · ${queue.length} en cola`, 'warn');
      retryDelayMs = Math.min(30000, retryDelayMs * 2);
      scheduleFlush(retryDelayMs);
    } finally {
      sending = false;
    }
    if (queue.length && !blocked && retryDelayMs === 1500) {
      scheduleFlush(900);
    }
  }

  // Resync any pending event queues left in localStorage from earlier offline sessions
  async function flushOtherStoredQueues() {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    try {
      const prefix = 'mi-aula:';
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(prefix) && k !== storeKey && !k.includes('dua') && !k.includes('favoritas') && !k.includes('recientes')) {
          keys.push(k);
        }
      }
      for (const k of keys) {
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        let saved;
        try { saved = JSON.parse(raw); } catch { continue; }
        if (!saved || !Array.isArray(saved.queue) || !saved.queue.length) continue;
        const otherToken = k.slice(prefix.length);
        if (!otherToken || otherToken.length < 8) continue;
        const res = await fetch('/api/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: otherToken, events: saved.queue.slice(0, 30) })
        });
        if (res.status === 403 || res.status === 404) {
          saved.queue = [];
          localStorage.setItem(k, JSON.stringify(saved));
          continue;
        }
        if (!res.ok) continue;
        const data = await res.json();
        const ids = new Set(data.saved || []);
        saved.queue = saved.queue.filter(e => !ids.has(e.id));
        localStorage.setItem(k, JSON.stringify(saved));
      }
    } catch {
      // Offline or storage unavailable
    }
  }

  // ---- DUA Text-to-Speech (es-ES) ----
  function stopSpeech() {
    speaking = false;
    try {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    } catch {
      // Ignore
    }
    const btn = document.getElementById('aula-tts');
    if (btn) {
      btn.setAttribute('aria-pressed', 'false');
      btn.textContent = '🔊 Leer';
    }
  }

  function isVisibleElement(el) {
    if (!el || el.hidden) return false;
    if (el.closest('#aula-bar, #aula-summary-overlay, [hidden], .hidden')) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function formatForSpeech(raw) {
    return String(raw || '')
      .replace(/=\s*\?/g, ', ¿cuánto es?')
      .replace(/×/g, ' por ')
      .replace(/÷/g, ' entre ')
      .replace(/=/g, ' igual a ')
      .replace(/−/g, ' menos ')
      .replace(/\+/g, ' más ')
      .replace(/·/g, '. ')
      .replace(/€/g, ' euros')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function getReadableText() {
    // 1. If the student selected specific text, read that exact selection
    try {
      const sel = window.getSelection()?.toString().trim();
      if (sel && sel.length >= 2) return formatForSpeech(sel);
    } catch {
      // Ignore
    }

    const parts = [];
    const seen = new Set();
    const pushUnique = text => {
      const clean = String(text || '').replace(/\s+/g, ' ').trim();
      if (!clean || clean.length < 2) return;
      const key = clean.toLocaleLowerCase('es');
      if (seen.has(key)) return;
      // Avoid duplicating substring already captured
      for (const prev of seen) {
        if (prev.includes(key) || key.includes(prev)) {
          if (key.length > prev.length) {
            seen.delete(prev);
            const idx = parts.findIndex(p => p.toLocaleLowerCase('es') === prev);
            if (idx >= 0) parts.splice(idx, 1);
            break;
          }
          return;
        }
      }
      seen.add(key);
      parts.push(clean);
    };

    // 2. Explicit data-aula-read markers (highest priority, ordered by optional numeric priority)
    const explicit = [...document.querySelectorAll('[data-aula-read]')].filter(isVisibleElement);
    if (explicit.length) {
      explicit.sort((a, b) => {
        const pa = Number(a.dataset.aulaRead) || 99;
        const pb = Number(b.dataset.aulaRead) || 99;
        return pa - pb;
      });
      for (const el of explicit) {
        const custom = el.getAttribute('data-aula-read-text');
        pushUnique(custom || el.innerText);
      }
      if (parts.length) return formatForSpeech(parts.slice(0, 4).join('. '));
    }

    // 3. Visible task instructions & clues inside the active app
    const selectors = [
      '#mark-title',
      '#mark-instruction',
      '#clue',
      '#word-context',
      '#activity-title',
      '#instructions',
      '#heading',
      '#instruction',
      '#sums-equation',
      '#sums-instruction',
      '.sheet h1',
      '.task-heading h2',
      '.task-heading p',
      '.prompt',
      '.question',
      '.stimulus',
      '.problem',
      '#caps-title',
      '#points-title'
    ];
    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach(el => {
        if (isVisibleElement(el)) pushUnique(el.innerText);
      });
    }

    // 4. Active task prompt reported via window.Aula.begin(...)
    if (tasks[mode]?.prompt) {
      pushUnique(tasks[mode].prompt);
    }

    // 5. Fallback to first visible heading / paragraph in main
    if (!parts.length) {
      const root = document.querySelector('main') || document.body;
      root.querySelectorAll('h1, h2, p').forEach(el => {
        if (parts.length < 2 && isVisibleElement(el)) pushUnique(el.innerText);
      });
    }

    return formatForSpeech(parts.slice(0, 4).join('. '));
  }

  function pickSpanishVoice() {
    try {
      const voices = window.speechSynthesis.getVoices() || [];
      return (
        voices.find(v => /^es[-_]ES$/i.test(v.lang)) ||
        voices.find(v => /^es/i.test(v.lang)) ||
        null
      );
    } catch {
      return null;
    }
  }

  function toggleSpeech() {
    if (!('speechSynthesis' in window)) return;
    if (speaking) {
      stopSpeech();
      return;
    }
    const text = getReadableText();
    if (!text) return;

    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'es-ES';
      utter.rate = 0.93;
      const voice = pickSpanishVoice();
      if (voice) utter.voice = voice;

      const btn = document.getElementById('aula-tts');
      utter.onstart = () => {
        speaking = true;
        if (btn) {
          btn.setAttribute('aria-pressed', 'true');
          btn.textContent = '⏹ Parar';
        }
      };
      utter.onend = stopSpeech;
      utter.onerror = stopSpeech;

      speaking = true;
      if (btn) {
        btn.setAttribute('aria-pressed', 'true');
        btn.textContent = '⏹ Parar';
      }
      window.speechSynthesis.speak(utter);
    } catch {
      stopSpeech();
    }
  }

  function showSessionSummary() {
    const existing = document.getElementById('aula-summary-overlay');
    if (existing) existing.remove();

    const namesText = formatStudentList(sessionStudents);
    const greeting = namesText ? `¡Buen trabajo, ${namesText}!` : '¡Buen trabajo!';
    const pct = attemptCount > 0 ? Math.round((correctCount / attemptCount) * 100) : null;

    let encouragement = 'Sesión cerrada correctamente. ¡Hasta la próxima!';
    if (pct !== null) {
      if (pct >= 80) encouragement = 'Has trabajado con mucha atención y esfuerzo. ¡Sigue así!';
      else if (pct >= 50) encouragement = 'Buen trabajo: cada intento te ayuda a aprender y mejorar.';
      else encouragement = '¡Gracias por intentarlo! Practicando paso a paso se mejora cada día.';
    }

    const scoreMain = attemptCount > 0 ? `${correctCount}/${attemptCount}` : '—';
    const scoreSub = pct !== null ? `${pct}% de acierto` : 'Actividad explorada';
    const saveTitle = blocked ? 'Sesión finalizada' : 'Guardado para el profe';
    const saveTone = blocked ? 'warn' : 'ok';

    const overlay = document.createElement('div');
    overlay.id = 'aula-summary-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'aula-summary-title');

    overlay.innerHTML = `
      <div class="aula-summary-card">
        <div class="aula-summary-badge" aria-hidden="true">★</div>
        <h2 id="aula-summary-title">${escapeHtml(greeting)}</h2>
        <p class="aula-summary-sub">${escapeHtml(encouragement)}</p>
        ${sessionAppTitle ? `<div class="aula-summary-app">${escapeHtml(sessionAppTitle)}</div>` : ''}
        <div class="aula-summary-grid">
          <div class="aula-summary-stat">
            <span class="aula-stat-label">Aciertos</span>
            <strong class="aula-stat-value">${escapeHtml(scoreMain)}</strong>
            <span class="aula-stat-sub">${escapeHtml(scoreSub)}</span>
          </div>
          <div class="aula-summary-stat">
            <span class="aula-stat-label">Tiempo activo</span>
            <strong class="aula-stat-value">${escapeHtml(formatClock(activeMs))}</strong>
            <span class="aula-stat-sub">Trabajo en el aula</span>
          </div>
        </div>
        <div class="aula-summary-status ${saveTone}">
          ${blocked ? 'ℹ ' : '✓ '}${escapeHtml(saveTitle)}
        </div>
        <div class="aula-summary-actions">
          <a id="aula-summary-home" class="aula-sum-btn primary" href="/">← Volver al portal</a>
          <a class="aula-sum-btn" href="/abrir?app=${encodeURIComponent(app)}">Otra sesión en esta app</a>
        </div>
      </div>
    `;

    document.body.append(overlay);
    const homeBtn = document.getElementById('aula-summary-home');
    if (homeBtn) homeBtn.focus();
  }

  window.Aula = {
    begin(m, prompt, level = '') {
      tick();
      if (speaking) stopSpeech();
      const old = tasks[m];
      if (old && !old.done) enqueue('skip', old);
      tasks[m] = {
        id: makeId(),
        mode: m,
        prompt: String(prompt || ''),
        level: String(level || ''),
        ms: 0,
        assisted: false,
        done: false
      };
      if (!mode) mode = m;
    },
    activate(m) {
      tick();
      mode = m;
    },
    attempt(m, ok, answer) {
      const t = tasks[m];
      if (!t || t.done) return;
      attemptCount++;
      if (ok) correctCount++;
      updateHud();
      enqueue('attempt', t, answer, !!ok);
      if (ok) t.done = true;
    },
    hint(m) {
      const t = tasks[m];
      if (!t || t.done) return;
      t.assisted = true;
      enqueue('hint', t);
    },
    reveal(m) {
      const t = tasks[m];
      if (!t || t.done) return;
      t.assisted = true;
      enqueue('reveal', t);
      t.done = true;
    }
  };

  for (const ev of ['pointerdown', 'keydown', 'touchstart', 'pointermove']) {
    document.addEventListener(ev, () => { lastAction = Date.now(); }, { passive: true });
  }

  document.addEventListener('visibilitychange', () => {
    tick();
    if (document.hidden) {
      stopSpeech();
      enqueue('heartbeat', null);
    } else {
      flush();
    }
  });

  window.addEventListener('online', () => {
    retryDelayMs = 1500;
    flush();
    flushOtherStoredQueues();
  });
  window.addEventListener('offline', () => {
    if (!free && !blocked) {
      setStatus(queue.length ? `Sin conexión · ${queue.length} en cola` : 'Sin conexión (modo local)', 'warn');
    }
  });
  window.addEventListener('pagehide', () => {
    stopSpeech();
    enqueue('heartbeat', null);
    persist();
  });

  setTimeout(() => { flushOtherStoredQueues(); }, 4000);

  setInterval(() => {
    tick();
    if (!free && !finished) persist();
  }, 1000);

  setInterval(() => {
    if (!free && !finished) {
      enqueue('heartbeat', null);
      flush();
    }
  }, 30000);

  document.addEventListener('DOMContentLoaded', async () => {
    if (!document.querySelector('link[rel~="icon"]')) {
      const icon = document.createElement('link');
      icon.rel = 'icon';
      icon.type = 'image/svg+xml';
      icon.href = '/favicon.svg';
      document.head.append(icon);
    }

    const css = document.createElement('style');
    css.textContent = `
      #aula-bar {
        font-family: 'Plus Jakarta Sans', 'Segoe UI', system-ui, sans-serif;
        font-size: 13px;
        display: flex;
        gap: 10px 14px;
        align-items: center;
        justify-content: space-between;
        padding: 9px 18px;
        background: #eef3ea;
        color: #143833;
        flex-wrap: wrap;
        border-bottom: 1px solid #d1dccd;
        position: sticky;
        top: 0;
        z-index: 9999;
      }
      #aula-bar .aula-group {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      #aula-bar a, #aula-bar button {
        color: #143833;
        font: inherit;
        font-weight: 600;
        border: 1px solid #bcccb9;
        background: #ffffff;
        border-radius: 8px;
        padding: 6px 11px;
        cursor: pointer;
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        line-height: 1.2;
        min-height: 32px;
      }
      #aula-bar a:hover, #aula-bar button:hover {
        background: #f5f8f2;
        border-color: #93ae99;
      }
      #aula-bar button[aria-pressed="true"] {
        background: #dff0e6;
        border-color: #1a6456;
        color: #12493f;
      }
      #aula-bar #aula-end {
        background: #1a6456;
        border-color: #1a6456;
        color: #ffffff;
      }
      #aula-bar #aula-end:hover {
        background: #134d42;
      }
      #aula-bar #aula-end:disabled {
        opacity: 0.65;
        cursor: wait;
      }
      .aula-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.78);
        border: 1px solid #d2ddd0;
        font-size: 12px;
        font-weight: 600;
      }
      .aula-pill.live {
        background: #e1f2e9;
        border-color: #b7d9c6;
        color: #15553b;
      }
      .aula-pill.mono {
        font-family: ui-monospace, SFMono-Regular, monospace;
        font-variant-numeric: tabular-nums;
      }
      #aula-save[data-tone="ok"] { color: #1a6e4c; }
      #aula-save[data-tone="sync"] { color: #5b6d64; }
      #aula-save[data-tone="warn"] { color: #995814; background: #fdf1da; border-color: #ead099; }
      #aula-save[data-tone="err"] { color: #a83c2b; background: #fceae7; border-color: #e9b9b0; }

      /* DUA reading comfort mode (universal, zero visual stigma) */
      html.aula-dua-text body {
        line-height: 1.65 !important;
        letter-spacing: 0.015em;
        word-spacing: 0.06em;
      }
      html.aula-dua-text main p,
      html.aula-dua-text main li,
      html.aula-dua-text .instruction,
      html.aula-dua-text .instructions,
      html.aula-dua-text .clue,
      html.aula-dua-text .context-line,
      html.aula-dua-text .reading,
      html.aula-dua-text .feedback,
      html.aula-dua-text .hint,
      html.aula-dua-text .prompt,
      html.aula-dua-text .question,
      html.aula-dua-text .stimulus,
      html.aula-dua-text .answer,
      html.aula-dua-text .option,
      html.aula-dua-text .match-item,
      html.aula-dua-text .piece,
      html.aula-dua-text .chip,
      html.aula-dua-text .sums-task p {
        font-size: max(1.08em, 18px) !important;
        line-height: 1.6 !important;
      }

      /* End-of-session motivating summary overlay */
      #aula-summary-overlay {
        position: fixed;
        inset: 0;
        z-index: 10000;
        background: rgba(20, 56, 51, 0.56);
        backdrop-filter: blur(4px);
        display: grid;
        place-items: center;
        padding: 20px;
        font-family: 'Plus Jakarta Sans', 'Segoe UI', system-ui, sans-serif;
      }
      .aula-summary-card {
        width: 100%;
        max-width: 460px;
        background: #ffffff;
        color: #143833;
        border-radius: 22px;
        border: 1px solid #d1dccd;
        padding: 30px 26px 26px;
        text-align: center;
        box-shadow: 0 20px 50px rgba(20, 56, 51, 0.24);
      }
      .aula-summary-badge {
        width: 58px;
        height: 58px;
        margin: 0 auto 14px;
        border-radius: 18px;
        background: #e1f2e9;
        color: #1a6456;
        display: grid;
        place-items: center;
        font-size: 30px;
      }
      .aula-summary-card h2 {
        margin: 0 0 8px;
        font-size: 24px;
        line-height: 1.2;
        color: #143833;
      }
      .aula-summary-sub {
        margin: 0 0 12px;
        font-size: 15px;
        line-height: 1.5;
        color: #49605b;
      }
      .aula-summary-app {
        display: inline-block;
        padding: 4px 12px;
        border-radius: 999px;
        background: #f3f6ef;
        border: 1px solid #dce5d8;
        font-size: 12.5px;
        font-weight: 700;
        color: #2f554c;
        margin-bottom: 18px;
      }
      .aula-summary-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
        margin-bottom: 16px;
      }
      .aula-summary-stat {
        background: #f8faf5;
        border: 1px solid #dde6da;
        border-radius: 14px;
        padding: 14px 12px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .aula-stat-label {
        font-size: 11.5px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: #5b6d64;
      }
      .aula-stat-value {
        font-family: ui-monospace, SFMono-Regular, monospace;
        font-size: 24px;
        font-weight: 800;
        color: #143833;
      }
      .aula-stat-sub {
        font-size: 12px;
        color: #5b6d64;
      }
      .aula-summary-status {
        padding: 10px 14px;
        border-radius: 12px;
        font-size: 13.5px;
        font-weight: 700;
        margin-bottom: 20px;
      }
      .aula-summary-status.ok {
        background: #e1f2e9;
        color: #15553b;
        border: 1px solid #b7d9c6;
      }
      .aula-summary-status.warn {
        background: #fdf1da;
        color: #8b5110;
        border: 1px solid #ead099;
      }
      .aula-summary-actions {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        justify-content: center;
      }
      .aula-sum-btn {
        flex: 1 1 160px;
        padding: 12px 16px;
        border-radius: 12px;
        border: 1px solid #bcccb9;
        background: #ffffff;
        color: #143833;
        font-size: 14px;
        font-weight: 700;
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .aula-sum-btn:hover {
        background: #f5f8f2;
      }
      .aula-sum-btn.primary {
        background: #1a6456;
        border-color: #1a6456;
        color: #ffffff;
      }
      .aula-sum-btn.primary:hover {
        background: #134d42;
      }
      @media print {
        #aula-bar, #aula-summary-overlay { display: none !important; }
      }
    `;
    document.head.append(css);

    const hasTts = 'speechSynthesis' in window;
    const isDuaText = document.documentElement.classList.contains('aula-dua-text');

    const bar = document.createElement('div');
    bar.id = 'aula-bar';
    bar.innerHTML = `
      <div class="aula-group">
        <a href="/">← Mi aula</a>
        <span id="aula-mode-pill" class="aula-pill ${free ? '' : 'live'}">
          ${free ? 'Práctica libre · sin registro' : 'Trabajo en el aula'}
        </span>
        ${free ? '' : '<span id="aula-code-pill" class="aula-pill mono" hidden></span>'}
      </div>
      <div class="aula-group">
        ${free ? '' : '<span id="aula-score" class="aula-pill mono">Sin respuestas aún</span>'}
        ${free ? '' : '<span id="aula-timer" class="aula-pill mono">00:00</span>'}
        ${free ? '' : '<span id="aula-save" class="aula-pill" role="status" data-tone="ok">Preparado</span>'}
        ${hasTts ? '<button type="button" id="aula-tts" aria-pressed="false" title="Leer enunciado en voz alta (o texto seleccionado)">🔊 Leer</button>' : ''}
        <button type="button" id="aula-text-size" aria-pressed="${isDuaText ? 'true' : 'false'}" title="Texto más amplio y fácil de leer" aria-label="Aumentar tamaño e interlineado del texto">Aa</button>
        <button type="button" id="aula-fs" title="Pantalla completa" aria-label="Pantalla completa">⛶</button>
        <button type="button" id="aula-end">${free ? 'Cambiar de modo' : 'Terminar sesión'}</button>
      </div>
    `;
    document.body.prepend(bar);

    if (hasTts) {
      const ttsBtn = document.getElementById('aula-tts');
      if (ttsBtn) ttsBtn.onclick = toggleSpeech;
      // Warm up voices list asynchronously on Chromium/Android
      try { window.speechSynthesis.getVoices(); } catch {}
    }

    const textBtn = document.getElementById('aula-text-size');
    if (textBtn) {
      textBtn.onclick = () => {
        const next = !document.documentElement.classList.contains('aula-dua-text');
        document.documentElement.classList.toggle('aula-dua-text', next);
        textBtn.setAttribute('aria-pressed', String(next));
        try { localStorage.setItem(DUA_TEXT_KEY, next ? '1' : '0'); } catch {}
      };
    }

    const fsBtn = document.getElementById('aula-fs');
    if (!document.fullscreenEnabled) {
      fsBtn.hidden = true;
    } else {
      fsBtn.onclick = () => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen?.().catch(() => {});
        } else {
          document.exitFullscreen?.().catch(() => {});
        }
      };
    }

    const endBtn = document.getElementById('aula-end');
    endBtn.onclick = async () => {
      stopSpeech();
      if (!free) {
        endBtn.disabled = true;
        endBtn.textContent = 'Guardando…';
        if (!ending) {
          ending = true;
          enqueue('end', null);
        }
        while (sending) await new Promise(resolve => setTimeout(resolve, 100));
        await flush();
        if (queue.length && !blocked) {
          ending = false;
          endBtn.disabled = false;
          endBtn.textContent = 'Terminar sesión';
          setStatus('Quedan resultados pendientes. Comprueba la conexión.', 'warn');
          return;
        }
        finished = true;
        sessionStorage.removeItem('aula-token:' + app);
        try { localStorage.removeItem(storeKey); } catch {}
        endBtn.textContent = 'Sesión terminada';
        showSessionSummary();
        return;
      }
      location.href = '/abrir?app=' + encodeURIComponent(app);
    };

    if (!free) {
      updateHud();
      enqueue('heartbeat', null);
      flush();
      // Fetch safe session participants & short code for the HUD and summary
      try {
        const res = await fetch('/api/sessions/info?token=' + encodeURIComponent(token), { cache: 'no-store' });
        if (res.ok) {
          const info = await res.json();
          if (Array.isArray(info.students) && info.students.length) {
            sessionStudents = info.students;
            const pill = document.getElementById('aula-mode-pill');
            if (pill) pill.textContent = 'En el aula · ' + info.students.join(', ');
          }
          if (info.appTitle) sessionAppTitle = info.appTitle;
          const codePill = document.getElementById('aula-code-pill');
          if (codePill && info.code) {
            codePill.textContent = info.code;
            codePill.hidden = false;
          }
        }
      } catch {
        // Non-blocking
      }
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  });
})();
