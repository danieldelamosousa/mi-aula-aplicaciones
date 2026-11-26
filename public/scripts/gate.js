(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const appId = new URLSearchParams(location.search).get('app');

  let roster = [];
  let selectedStudents = new Set();
  let selectedCourse = '';
  let busy = false;

  if (!appId) {
    location.replace('/');
    return;
  }

  function showMessage(text, isError = false) {
    const el = $('gateMessage');
    if (!text) {
      el.hidden = true;
      return;
    }
    el.textContent = text;
    el.className = isError ? 'notice error' : 'notice';
    el.hidden = false;
  }

  function normalize(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();
  }

  function updateBadge() {
    const n = selectedStudents.size;
    $('selectionBadge').textContent = n === 0
      ? '0 seleccionados'
      : (n === 1 ? '1 participante' : `Grupo de ${n}`);
  }

  function renderCoursePills() {
    const courses = [...new Set(roster.map(s => s.course).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
    const container = $('coursePills');
    container.replaceChildren();
    if (!courses.length) return;

    for (const c of ['', ...courses]) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'course-pill';
      btn.textContent = c || 'Todos';
      btn.setAttribute('aria-pressed', String(selectedCourse === c));
      btn.addEventListener('click', () => {
        selectedCourse = c;
        renderCoursePills();
        renderStudents();
      });
      container.append(btn);
    }
  }

  function renderStudents() {
    const list = $('studentList');
    list.replaceChildren();
    const q = normalize($('rosterSearch').value);

    const visible = roster.filter(s => {
      if (selectedCourse && s.course !== selectedCourse) return false;
      if (q && !normalize(s.name).includes(q)) return false;
      return true;
    });

    if (!visible.length) {
      const empty = document.createElement('p');
      empty.className = 'panel-sub';
      empty.textContent = roster.length
        ? 'Ningún alumno coincide con el filtro.'
        : 'Todavía no hay alumnos en la lista. Añade un nombre abajo o configura tu clase en el Panel docente.';
      list.append(empty);
      return;
    }

    for (const st of visible) {
      const label = document.createElement('label');
      label.className = 'student-chip';

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = st.name;
      input.checked = selectedStudents.has(st.name);
      input.addEventListener('change', () => {
        if (input.checked) selectedStudents.add(st.name);
        else selectedStudents.delete(st.name);
        updateBadge();
        showMessage('');
      });

      const nameSpan = document.createElement('span');
      nameSpan.textContent = st.name;

      label.append(input, nameSpan);
      if (st.course) {
        const badge = document.createElement('span');
        badge.className = 'student-course';
        badge.textContent = st.course;
        label.append(badge);
      }
      list.append(label);
    }
  }

  async function init() {
    try {
      const res = await fetch('/api/apps', { cache: 'no-store' });
      const data = await res.json();
      if (data.aulaName) $('aulaName').textContent = data.aulaName;
      const app = (data.apps || []).find(a => a.id === appId && a.builtIn);
      if (!app) {
        location.replace('/');
        return;
      }
      document.title = `${app.title} · ${data.aulaName || 'Mi aula'}`;
      $('appTitle').textContent = app.title;
      $('appArea').textContent = [app.area, app.cycle, app.unit].filter(Boolean).join(' · ');
      $('appDesc').textContent = app.description;
    } catch {
      showMessage('No se pudo cargar la información de la aplicación.', true);
    }
  }

  $('freeBtn').addEventListener('click', () => {
    location.href = `/apps/${encodeURIComponent(appId)}/?libre=1`;
  });

  async function loadClassroomProfile() {
    showMessage('');
    try {
      const res = await fetch('/api/profile', { cache: 'no-store' });
      const profile = await res.json();
      if (!res.ok) throw new Error(profile.error || 'No se pudo cargar la lista del aula.');

      if (profile.classCodeRequired && !profile.unlocked) {
        $('studentsPanel').hidden = true;
        $('classroomLockPanel').hidden = false;
        $('classroomLockPanel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        $('classCodeInput').focus();
        return;
      }

      $('classroomLockPanel').hidden = true;
      roster = Array.isArray(profile.roster)
        ? profile.roster
        : (profile.students || []).map(name => ({ name, course: '' }));
      if (profile.sessionTtlHours) {
        $('ttlFootnote').textContent = `El código y el enlace permiten enviar resultados durante ${profile.sessionTtlHours} horas. No permiten consultar informes docentes.`;
      }
      const quickAddRow = $('quickAddRow');
      if (quickAddRow) {
        quickAddRow.hidden = profile.allowGuestStudents === false;
      }
      $('studentsPanel').hidden = false;
      renderCoursePills();
      renderStudents();
      updateBadge();
      $('studentsPanel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (err) {
      showMessage(err.message || 'No se pudo cargar la lista del aula. Inténtalo de nuevo.', true);
    }
  }

  $('classBtn').addEventListener('click', async () => {
    $('classBtn').setAttribute('aria-pressed', 'true');
    await loadClassroomProfile();
  });

  const unlockForm = $('classroomUnlockForm');
  if (unlockForm) {
    unlockForm.addEventListener('submit', async e => {
      e.preventDefault();
      const code = $('classCodeInput').value.trim();
      if (!code) return;
      $('unlockClassBtn').disabled = true;
      showMessage('');
      try {
        const res = await fetch('/api/classroom/unlock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Clave de aula incorrecta.');
        $('classCodeInput').value = '';
        await loadClassroomProfile();
      } catch (err) {
        showMessage(err.message || 'No se pudo desbloquear el aula.', true);
        $('classCodeInput').select();
      } finally {
        $('unlockClassBtn').disabled = false;
      }
    });
  }

  $('rosterSearch').addEventListener('input', renderStudents);

  function addGuest() {
    const val = $('guestName').value.trim();
    if (!val) return;
    if (!roster.some(r => r.name.toLocaleLowerCase('es') === val.toLocaleLowerCase('es'))) {
      roster.push({ name: val, course: 'Invitado' });
    }
    selectedStudents.add(val);
    $('guestName').value = '';
    selectedCourse = '';
    renderCoursePills();
    renderStudents();
    updateBadge();
    showMessage('');
  }

  $('addGuestBtn').addEventListener('click', addGuest);
  $('guestName').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addGuest();
    }
  });

  async function startSession(shareMode) {
    if (busy) return;
    const students = [...selectedStudents];
    if (!students.length) {
      showMessage('Selecciona al menos un alumno o alumna antes de continuar.', true);
      return;
    }

    busy = true;
    $('startHereBtn').disabled = true;
    $('prepareShareBtn').disabled = true;
    showMessage('');

    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app: appId, students })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo preparar la sesión.');

      const directLink = `${location.origin}/apps/${encodeURIComponent(appId)}/?aula=1#sesion=${encodeURIComponent(data.token)}`;
      const shortLink = `${location.origin}/codigo/${encodeURIComponent(data.code)}`;

      if (!shareMode) {
        sessionStorage.setItem('aula-token:' + appId, data.token);
        location.href = directLink;
        return;
      }

      $('preparedPanel').hidden = false;
      $('preparedSummary').textContent = `Participantes: ${students.join(', ')}.`;
      $('sessionCodeValue').textContent = data.code;
      $('sessionLinkInput').value = shortLink;
      $('openPreparedLink').href = directLink;

      try {
        $('qrContainer').innerHTML = window.renderQrSvg(shortLink, 184);
      } catch {
        $('qrContainer').textContent = data.code;
      }

      showMessage(`Sesión ${data.code} preparada para ${students.join(', ')}.`);
      $('preparedPanel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (err) {
      showMessage(err.message || 'No se pudo preparar la sesión.', true);
    } finally {
      busy = false;
      $('startHereBtn').disabled = false;
      $('prepareShareBtn').disabled = false;
    }
  }

  $('startHereBtn').addEventListener('click', () => startSession(false));
  $('prepareShareBtn').addEventListener('click', () => startSession(true));

  async function copyText(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      showMessage(`${label} copiado al portapapeles.`);
    } catch {
      $('sessionLinkInput').select();
      showMessage('Selecciona y copia el texto manualmente.');
    }
  }

  $('copyLinkBtn').addEventListener('click', () => copyText($('sessionLinkInput').value, 'Enlace'));
  $('copyCodeBtn').addEventListener('click', () => copyText($('sessionCodeValue').textContent, 'Código'));

  init();
})();
