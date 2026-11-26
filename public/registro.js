(() => {
  'use strict';

  const app = location.pathname.split('/')[2] || '';
  const params = new URLSearchParams(location.search);
  const free = params.get('libre') === '1';

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
    if (!document.hidden && Date.now() - lastAction < 90000) {
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

  async function flush() {
    if (free || sending || !queue.length || blocked) return;
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
          setStatus('Pendiente de guardar…', 'warn');
        }
        return;
      }
      const ids = new Set(data.saved || []);
      queue = queue.filter(e => !ids.has(e.id));
      persist();
      setStatus(queue.length ? 'Guardando…' : 'Guardado', queue.length ? 'sync' : 'ok');
    } catch {
      setStatus('Sin conexión · en cola', 'warn');
    } finally {
      sending = false;
    }
    if (queue.length && !blocked) setTimeout(flush, 1200);
  }

  window.Aula = {
    begin(m, prompt, level = '') {
      tick();
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
    if (document.hidden) enqueue('heartbeat', null);
    else flush();
  });

  window.addEventListener('online', flush);
  window.addEventListener('pagehide', () => {
    enqueue('heartbeat', null);
    persist();
  });

  setInterval(() => {
    tick();
    if (!free) persist();
  }, 1000);

  setInterval(() => {
    if (!free) {
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
      }
      #aula-bar a:hover, #aula-bar button:hover {
        background: #f5f8f2;
        border-color: #93ae99;
      }
      #aula-bar #aula-end {
        background: #1a6456;
        border-color: #1a6456;
        color: #ffffff;
      }
      #aula-bar #aula-end:hover {
        background: #134d42;
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
      @media print { #aula-bar { display: none !important; } }
    `;
    document.head.append(css);

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
        <button type="button" id="aula-fs" title="Pantalla completa" aria-label="Pantalla completa">⛶</button>
        <button type="button" id="aula-end">${free ? 'Cambiar de modo' : 'Terminar sesión'}</button>
      </div>
    `;
    document.body.prepend(bar);

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

    document.getElementById('aula-end').onclick = async () => {
      if (!free) {
        if (!ending) {
          ending = true;
          enqueue('end', null);
        }
        while (sending) await new Promise(resolve => setTimeout(resolve, 100));
        await flush();
        if (queue.length && !blocked) {
          setStatus('Quedan resultados pendientes. Comprueba la conexión.', 'warn');
          return;
        }
        finished = true;
        sessionStorage.removeItem('aula-token:' + app);
        try { localStorage.removeItem(storeKey); } catch {}
      }
      location.href = '/abrir?app=' + encodeURIComponent(app);
    };

    if (!free) {
      updateHud();
      enqueue('heartbeat', null);
      flush();
      // Fetch safe session participants & short code for the HUD
      try {
        const res = await fetch('/api/sessions/info?token=' + encodeURIComponent(token), { cache: 'no-store' });
        if (res.ok) {
          const info = await res.json();
          const pill = document.getElementById('aula-mode-pill');
          if (pill && Array.isArray(info.students) && info.students.length) {
            pill.textContent = 'En el aula · ' + info.students.join(', ');
          }
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
