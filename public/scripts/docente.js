(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  let state = null;

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text ?? '');
    return div.innerHTML;
  }

  function formatDuration(ms) {
    const sec = Math.max(0, Math.round((Number(ms) || 0) / 1000));
    if (sec < 60) return `${sec} s`;
    const mins = Math.floor(sec / 60);
    const rem = sec % 60;
    if (mins < 60) return rem > 0 ? `${mins} min ${rem} s` : `${mins} min`;
    const hrs = Math.floor(mins / 60);
    return `${hrs} h ${mins % 60} min`;
  }

  function formatDate(iso) {
    if (!iso) return '—';
    try {
      return new Intl.DateTimeFormat('es-ES', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  }

  function showNotice(text, isError = false) {
    const el = $('dashNotice');
    if (!text) {
      el.hidden = true;
      return;
    }
    el.textContent = text;
    el.className = isError ? 'notice error' : 'notice';
    el.hidden = false;
    setTimeout(() => {
      if (el.textContent === text) el.hidden = true;
    }, 4500);
  }

  function renderAccuracy(acc, attempts) {
    if (!attempts || acc === null || acc === undefined) {
      return '<span style="color:var(--ink-muted)">Sin intentos</span>';
    }
    const cls = acc >= 75 ? '' : (acc >= 50 ? 'mid' : 'low');
    return `
      <div class="acc-wrap">
        <div class="acc-bar"><div class="acc-fill ${cls}" style="width:${acc}%"></div></div>
        <span class="acc-num">${acc}%</span>
      </div>`;
  }

  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.setAttribute('aria-selected', String(b === btn)));
      document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.hidden = panel.id !== `tab-${target}`;
      });
    });
  });

  // Auth check & login
  async function checkAuth() {
    const res = await fetch('/api/teacher/status', { cache: 'no-store' });
    const status = await res.json();
    if (status.aulaName) $('headerAulaName').textContent = status.aulaName;

    if (status.authenticated) {
      $('loginView').hidden = true;
      $('dashView').hidden = false;
      $('logoutBtn').hidden = !status.pinEnabled;
      await loadDashboard();
    } else {
      $('dashView').hidden = true;
      $('loginView').hidden = false;
      $('logoutBtn').hidden = true;
      $('defaultPinTip').hidden = !status.isDefaultPin;
      $('pinInput').focus();
    }
  }

  $('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    $('loginError').hidden = true;
    try {
      const res = await fetch('/api/teacher/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: $('pinInput').value })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al iniciar sesión');
      $('pinInput').value = '';
      await checkAuth();
    } catch (err) {
      $('loginError').textContent = err.message;
      $('loginError').hidden = false;
      $('pinInput').select();
    }
  });

  $('logoutBtn').addEventListener('click', async () => {
    await fetch('/api/teacher/logout', { method: 'POST' });
    await checkAuth();
  });

  // Load Dashboard
  async function loadDashboard() {
    const res = await fetch('/api/teacher/dashboard', { cache: 'no-store' });
    if (res.status === 401) return checkAuth();
    state = await res.json();
    renderAll();
  }

  function renderAll() {
    if (!state) return;

    $('headerAulaName').textContent = state.config.aulaName || 'Mi aula';
    $('logoutBtn').hidden = !state.config.pinEnabled;

    // Metrics
    $('mSessions').textContent = state.metrics.totalSessions;
    $('mActiveSub').textContent = `${state.metrics.activeSessions} ${state.metrics.activeSessions === 1 ? 'activa' : 'activas'} ahora`;
    $('mAttempts').textContent = state.metrics.totalAttempts;
    $('mCorrectSub').textContent = `${state.metrics.totalCorrect} aciertos`;
    $('mAccuracy').textContent = state.metrics.accuracy === null ? '—' : `${state.metrics.accuracy}%`;
    $('mTime').textContent = formatDuration(state.metrics.totalActiveMs);

    // Populate filters
    const prevStudent = $('filterStudent').value;
    const prevApp = $('filterApp').value;

    const studentNames = [...new Set([
      ...state.students.map(s => (typeof s === 'string' ? s : s.name)),
      ...state.sessions.flatMap(s => s.students)
    ])].sort((a, b) => a.localeCompare(b, 'es'));

    $('filterStudent').innerHTML = '<option value="">Todos</option>' +
      studentNames.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
    $('filterStudent').value = prevStudent;

    $('filterApp').innerHTML = '<option value="">Todas</option>' +
      state.apps.filter(a => a.builtIn).map(a => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.title)}</option>`).join('');
    $('filterApp').value = prevApp;

    renderSessionsTable();
    renderStudentsSection();
    renderAppsSection();
    renderConfigSection();
  }

  function renderSessionsTable() {
    const fStudent = $('filterStudent').value;
    const fApp = $('filterApp').value;
    const fStatus = $('filterStatus').value;

    // Update CSV export link with active filters
    const csvUrl = new URL('/api/teacher/export.csv', location.origin);
    if (fStudent) csvUrl.searchParams.set('student', fStudent);
    if (fApp) csvUrl.searchParams.set('app', fApp);
    $('exportCsvBtn').href = csvUrl.pathname + csvUrl.search;

    const filtered = state.sessions.filter(s => {
      if (fStudent && !s.students.includes(fStudent)) return false;
      if (fApp && s.app !== fApp) return false;
      if (fStatus && s.status !== fStatus) return false;
      return true;
    });

    const tbody = $('sessionsBody');
    tbody.replaceChildren();

    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="empty-cell">Todavía no hay sesiones que coincidan con este filtro.<br><small>Abre una aplicación en modo «Trabajo en el aula» para empezar a registrar resultados.</small></td></tr>`;
      return;
    }

    for (const s of filtered) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(formatDate(s.createdAt))}</td>
        <td><span class="code-chip">${escapeHtml(s.code)}</span></td>
        <td><strong>${escapeHtml(s.students.join(', '))}</strong></td>
        <td>${escapeHtml(s.appTitle)}</td>
        <td><span class="status-badge status-${escapeHtml(s.status)}">${escapeHtml(s.status)}</span></td>
        <td>
          ${renderAccuracy(s.accuracy, s.attempts)}
          <div style="font-size:11.5px;color:var(--ink-muted);margin-top:2px;">${s.correct}/${s.attempts} · ${s.hints} pistas</div>
        </td>
        <td style="white-space:nowrap;">${escapeHtml(formatDuration(s.activeMs))}</td>
        <td class="no-print" style="white-space:nowrap;">
          <button class="btn btn-sm detail-btn" type="button">Ver detalle</button>
          <button class="btn btn-danger btn-sm del-session-btn" type="button" title="Eliminar sesión">×</button>
        </td>
      `;

      tr.querySelector('.detail-btn').addEventListener('click', () => openSessionDetail(s.token));
      tr.querySelector('.del-session-btn').addEventListener('click', async () => {
        if (!confirm(`¿Eliminar la sesión ${s.code} de ${s.students.join(', ')}?`)) return;
        const r = await fetch(`/api/teacher/sessions/${encodeURIComponent(s.token)}`, { method: 'DELETE' });
        if (r.ok) {
          showNotice('Sesión eliminada.');
          await loadDashboard();
        }
      });
      tbody.append(tr);
    }
  }

  async function openSessionDetail(token) {
    const res = await fetch(`/api/teacher/sessions/${encodeURIComponent(token)}`, { cache: 'no-store' });
    if (!res.ok) return showNotice('No se pudo abrir el detalle de la sesión.', true);
    const { summary, tasks } = await res.json();

    $('detailTitle').textContent = `${summary.appTitle} · ${summary.code}`;
    $('detailSubtitle').textContent = `${summary.students.join(', ')} · ${formatDate(summary.createdAt)} · ${formatDuration(summary.activeMs)}`;

    const body = $('detailBody');
    if (!tasks.length) {
      body.innerHTML = '<div class="empty-cell">Esta sesión todavía no tiene actividades registradas.</div>';
    } else {
      body.innerHTML = tasks.map((t, idx) => {
        const flags = [];
        if (t.hints > 0) flags.push(`${t.hints} ${t.hints === 1 ? 'pista' : 'pistas'}`);
        if (t.revealed) flags.push('Solución revelada');
        if (t.skipped && !t.solved) flags.push('Omitida');

        const attemptsHtml = t.attempts.length
          ? t.attempts.map(a => `
              <div class="attempt-item ${a.correct ? 'ok' : 'ko'}">
                <span><strong>${a.correct ? '✓ Correcto' : '✗ Error'}</strong> · ${escapeHtml(a.answer || 'Sin texto')}</span>
                <span style="font-size:12px;opacity:.8;">${escapeHtml(formatDuration(a.taskMs))}</span>
              </div>`).join('')
          : '<div style="font-size:13px;color:var(--ink-muted);margin-top:6px;">Sin respuesta enviada.</div>';

        return `
          <div class="task-card">
            <div class="task-top">
              <div>
                <div class="task-prompt">${idx + 1}. ${escapeHtml(t.prompt)}</div>
                <div class="task-meta">${escapeHtml([t.mode, t.level, flags.join(' · ')].filter(Boolean).join(' · '))}</div>
              </div>
              <span style="font-family:var(--font-mono);font-size:12px;color:var(--ink-muted);white-space:nowrap;">${escapeHtml(formatDuration(t.taskMs))}</span>
            </div>
            <div class="attempt-list">${attemptsHtml}</div>
          </div>`;
      }).join('');
    }
    $('detailDialog').showModal();
  }

  $('closeDetailBtn').addEventListener('click', () => $('detailDialog').close());
  $('detailDialog').addEventListener('click', e => {
    if (e.target === $('detailDialog')) $('detailDialog').close();
  });

  // Students section
  function renderStudentsSection() {
    const tbody = $('studentProgressBody');
    tbody.replaceChildren();

    const sorted = [...state.byStudent].sort((a, b) => a.name.localeCompare(b.name, 'es'));
    if (!sorted.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">Añade alumnado para ver su evolución aquí.</td></tr>';
    } else {
      for (const st of sorted) {
        const acc = st.attempts > 0 ? Math.round((st.correct / st.attempts) * 100) : null;
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${escapeHtml(st.name)}</strong></td>
          <td>${escapeHtml(st.course || '—')}</td>
          <td>${st.sessions}</td>
          <td>${renderAccuracy(acc, st.attempts)}</td>
          <td>${escapeHtml(formatDuration(st.activeMs))}</td>
          <td class="no-print"><button class="btn btn-sm view-st-btn" type="button">Ver sesiones</button></td>
        `;
        tr.querySelector('.view-st-btn').addEventListener('click', () => {
          $('filterStudent').value = st.name;
          renderSessionsTable();
          document.querySelector('.tab-btn[data-tab="sesiones"]').click();
        });
        tbody.append(tr);
      }
    }

    const list = $('rosterList');
    list.replaceChildren();
    if (!state.students.length) {
      list.innerHTML = '<div class="empty-cell" style="padding:20px;">Lista vacía</div>';
      return;
    }

    for (const st of state.students) {
      const name = typeof st === 'string' ? st : st.name;
      const course = typeof st === 'string' ? '' : (st.course || '');
      const row = document.createElement('div');
      row.className = 'roster-item';
      row.innerHTML = `
        <div>
          <strong>${escapeHtml(name)}</strong>
          ${course ? `<span style="margin-left:8px;font-size:12px;color:var(--ink-muted);">${escapeHtml(course)}</span>` : ''}
        </div>
        <button class="btn btn-ghost btn-sm remove-st-btn" type="button" aria-label="Quitar a ${escapeHtml(name)}">Quitar</button>
      `;
      row.querySelector('.remove-st-btn').addEventListener('click', async () => {
        const next = state.students.filter(item => (typeof item === 'string' ? item : item.name) !== name);
        await saveStudents(next, `Se quitó a ${name} de la lista.`);
      });
      list.append(row);
    }
  }

  async function saveStudents(students, message) {
    const res = await fetch('/api/teacher/students', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ students })
    });
    if (res.ok) {
      showNotice(message);
      await loadDashboard();
    } else {
      showNotice('No se pudo guardar la lista de alumnado.', true);
    }
  }

  $('addStudentForm').addEventListener('submit', async e => {
    e.preventDefault();
    const name = $('newStudentName').value.trim();
    const course = $('newStudentCourse').value;
    if (!name) return;
    const next = [...state.students, { name, course }];
    $('newStudentName').value = '';
    await saveStudents(next, `${name} añadido a la lista de clase.`);
  });

  function parseBulkLines(text) {
    return text.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
      const [namePart, coursePart] = line.split(/[,;\t]/);
      return { name: (namePart || '').trim(), course: (coursePart || '').trim() };
    }).filter(s => s.name);
  }

  $('bulkAddBtn').addEventListener('click', async () => {
    const items = parseBulkLines($('bulkStudents').value);
    if (!items.length) return;
    $('bulkStudents').value = '';
    await saveStudents([...state.students, ...items], `Se añadieron ${items.length} alumnos a la lista.`);
  });

  $('bulkReplaceBtn').addEventListener('click', async () => {
    const items = parseBulkLines($('bulkStudents').value);
    if (!items.length) return;
    if (!confirm(`¿Reemplazar toda la lista actual por estos ${items.length} nombres?`)) return;
    $('bulkStudents').value = '';
    await saveStudents(items, `Lista reemplazada (${items.length} alumnos).`);
  });

  // Apps section
  function renderAppsSection() {
    const container = $('appsManageList');
    container.replaceChildren();
    for (const app of state.apps) {
      const row = document.createElement('div');
      row.className = 'app-row';
      const visible = app.visible !== false;
      row.innerHTML = `
        <div>
          <div class="app-row-title">${escapeHtml(app.title)} ${!visible ? '<span class="status-badge status-caducada" style="margin-left:6px;">Oculta</span>' : ''}</div>
          <div class="app-row-meta">${escapeHtml([app.area, app.cycle, app.unit, app.builtIn ? 'Integrada' : 'Externa'].filter(Boolean).join(' · '))}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <button class="btn btn-sm toggle-vis-btn" type="button">${visible ? 'Ocultar' : 'Mostrar'}</button>
          ${app.builtIn ? '' : '<button class="btn btn-danger btn-sm del-app-btn" type="button">Eliminar</button>'}
        </div>
      `;
      row.querySelector('.toggle-vis-btn').addEventListener('click', async () => {
        const res = await fetch(`/api/teacher/apps/${encodeURIComponent(app.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ visible: !visible })
        });
        if (res.ok) {
          showNotice(`${app.title} ahora está ${!visible ? 'visible' : 'oculta'} en el portal.`);
          await loadDashboard();
        }
      });
      const delBtn = row.querySelector('.del-app-btn');
      if (delBtn) {
        delBtn.addEventListener('click', async () => {
          if (!confirm(`¿Eliminar el recurso externo «${app.title}»?`)) return;
          const res = await fetch(`/api/teacher/apps/${encodeURIComponent(app.id)}`, { method: 'DELETE' });
          if (res.ok) {
            showNotice('Recurso eliminado.');
            await loadDashboard();
          }
        });
      }
      container.append(row);
    }
  }

  $('addAppForm').addEventListener('submit', async e => {
    e.preventDefault();
    const payload = {
      title: $('customAppTitle').value.trim(),
      area: $('customAppArea').value.trim(),
      cycle: $('customAppCycle').value.trim(),
      externalUrl: $('customAppUrl').value.trim(),
      description: $('customAppDesc').value.trim()
    };
    const res = await fetch('/api/teacher/apps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      showNotice(data.error || 'No se pudo añadir el recurso.', true);
      return;
    }
    $('addAppForm').reset();
    $('customAppArea').value = 'Lengua';
    $('customAppCycle').value = '2.º ciclo';
    showNotice(`«${data.app.title}» añadida al portal.`);
    await loadDashboard();
  });

  // Config section
  function renderConfigSection() {
    $('cfgAulaName').value = state.config.aulaName || 'Mi aula';
    $('cfgSubtitle').value = state.config.subtitle || '';
    $('cfgTtl').value = state.config.sessionTtlHours || 8;
    $('cfgPinEnabled').checked = Boolean(state.config.pinEnabled);
    $('cfgNewPin').value = '';
  }

  $('configForm').addEventListener('submit', async e => {
    e.preventDefault();
    const newPin = $('cfgNewPin').value.trim();
    if (newPin && newPin.length < 4) {
      showNotice('El nuevo PIN debe tener al menos 4 caracteres.', true);
      return;
    }
    const payload = {
      aulaName: $('cfgAulaName').value.trim(),
      subtitle: $('cfgSubtitle').value.trim(),
      sessionTtlHours: Number($('cfgTtl').value) || 8,
      pinEnabled: $('cfgPinEnabled').checked
    };
    if (newPin) payload.newPin = newPin;

    const res = await fetch('/api/teacher/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      showNotice('Configuración guardada correctamente.');
      await loadDashboard();
    } else {
      showNotice('No se pudo guardar la configuración.', true);
    }
  });

  // Filter & toolbar listeners
  $('filterStudent').addEventListener('change', renderSessionsTable);
  $('filterApp').addEventListener('change', renderSessionsTable);
  $('filterStatus').addEventListener('change', renderSessionsTable);
  $('refreshBtn').addEventListener('click', loadDashboard);
  $('printBtn').addEventListener('click', () => window.print());

  checkAuth();
})();
