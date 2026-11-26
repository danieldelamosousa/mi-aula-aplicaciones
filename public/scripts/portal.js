(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const FAV_KEY = 'mi-aula:favoritas';
  const RECENT_KEY = 'mi-aula:recientes';

  let allApps = [];
  let selectedArea = '';
  let selectedCourse = '';
  let selectedUnit = '';
  let onlyFavorites = false;
  let favorites = new Set(loadJson(FAV_KEY, []));
  let recents = loadJson(RECENT_KEY, []);

  function loadJson(key, fallback) {
    try {
      const val = JSON.parse(localStorage.getItem(key) || 'null');
      return val ?? fallback;
    } catch {
      return fallback;
    }
  }

  function saveJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore storage quota errors
    }
  }

  function normalize(text) {
    return String(text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('es')
      .trim();
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text ?? '');
    return div.innerHTML;
  }

  function renderCover(app) {
    switch (app.coverType) {
      case 'market':
        return `
          <div class="card-cover cover-market" aria-hidden="true">
            <div class="market-awning"></div>
            <img src="/assets/mercadito-cover.webp" alt="" loading="lazy">
            <span class="market-price">19,95 €</span>
          </div>`;
      case 'words':
        return `
          <div class="card-cover cover-words" aria-hidden="true">
            <span class="word-piece pre">des</span>
            <span class="word-piece root">orden</span>
            <span class="word-piece suffix">…</span>
            <span class="cover-caption">Descubre · Subraya · Crea</span>
          </div>`;
      case 'ortho':
        return `
          <div class="card-cover cover-ortho" aria-hidden="true">
            <span class="ortho-tile">á</span>
            <span class="ortho-tile">A</span>
            <span class="ortho-tile">.</span>
            <span class="cover-caption">Piensa · Corrige · Escribe</span>
          </div>`;
      case 'lengua-u3':
        return `
          <div class="card-cover cover-lengua-u3" aria-hidden="true">
            <span class="ortho-tile">Aa</span>
            <span class="ortho-tile">-ito</span>
            <span class="ortho-tile">ue</span>
            <span class="cover-caption">Vocabulario · Gramática · Ortografía</span>
          </div>`;
      case 'calc':
        return `
          <div class="card-cover cover-calc" aria-hidden="true">
            <div class="mini-calc">
              <span class="mini-screen">42</span>
              <span class="mini-key">7</span>
              <span class="mini-key locked">8</span>
              <span class="mini-key">9</span>
              <span class="mini-key locked">4</span>
              <span class="mini-key">5</span>
              <span class="mini-key">6</span>
              <span class="mini-key">+</span>
              <span class="mini-key">−</span>
              <span class="mini-key equal">=</span>
            </div>
          </div>`;
      case 'number':
        return `
          <div class="card-cover cover-number" aria-hidden="true">
            <span class="number-tile">2</span>
            <span class="number-tile">4</span>
            <span class="number-tile">0</span>
            <span class="number-tile">8</span>
          </div>`;
      case 'multiply':
        return `
          <div class="card-cover cover-multiply" aria-hidden="true">
            <div class="multiply-preview">
              <span class="multiply-factor">3</span>
              <span>×</span>
              <span class="multiply-factor">4</span>
              <span>=</span>
              <span class="multiply-factor">12</span>
            </div>
          </div>`;
      case 'penalty':
        return `
          <div class="card-cover cover-penalty" aria-hidden="true">
            <div class="penalty-preview">
              <span>6 × 7</span>
              <span class="penalty-ball">⚽</span>
            </div>
          </div>`;
      case 'problems':
        return `
          <div class="card-cover cover-problems" aria-hidden="true">
            <div class="problems-steps">
              <span class="prob-step s1">1. Datos</span>
              <span class="prob-arrow">→</span>
              <span class="prob-step s2">2. Esquema</span>
              <span class="prob-arrow">→</span>
              <span class="prob-step s3">3. Solución</span>
            </div>
            <span class="cover-caption">Lee · Dibuja · Calcula</span>
          </div>`;
      case 'grammar':
        return `
          <div class="card-cover cover-grammar" aria-hidden="true">
            <div class="grammar-chips">
              <span class="gram-chip det">La</span>
              <span class="gram-chip sus">perra</span>
              <span class="gram-chip adj">alegre</span>
              <span class="gram-chip ver">corre</span>
            </div>
            <span class="cover-caption">Sustantivo · Adjetivo · Verbo · Oración</span>
          </div>`;
      default: {
        const initial = (app.title || 'A').trim().charAt(0).toUpperCase();
        return `
          <div class="card-cover cover-custom" aria-hidden="true">
            <span class="custom-initial">${escapeHtml(initial)}</span>
            <span class="cover-caption">Recurso del aula</span>
          </div>`;
      }
    }
  }

  function getAppHref(app) {
    if (!app.builtIn && app.externalUrl) return app.externalUrl;
    return `/abrir?app=${encodeURIComponent(app.id)}`;
  }

  function recordRecent(appId) {
    recents = [appId, ...recents.filter(id => id !== appId)].slice(0, 4);
    saveJson(RECENT_KEY, recents);
  }

  function renderRecents() {
    const valid = recents
      .map(id => allApps.find(a => a.id === id))
      .filter(Boolean);
    if (!valid.length) {
      $('recentStrip').hidden = true;
      return;
    }
    $('recentStrip').hidden = false;
    $('recentList').replaceChildren();
    for (const app of valid) {
      const link = document.createElement('a');
      link.className = 'recent-chip';
      link.href = getAppHref(app);
      if (!app.builtIn) {
        link.target = '_blank';
        link.rel = 'noopener';
      }
      link.textContent = app.title;
      link.addEventListener('click', () => recordRecent(app.id));
      $('recentList').append(link);
    }
  }

  function renderFilters() {
    const container = $('areaFilters');
    container.replaceChildren();

    const areas = [...new Set(allApps.map(a => a.area))].sort((a, b) => a.localeCompare(b, 'es'));

    for (const area of ['', ...areas]) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'filter-pill';
      btn.dataset.area = area;
      btn.setAttribute('aria-pressed', String(!onlyFavorites && selectedArea === area));

      const count = area ? allApps.filter(a => a.area === area).length : allApps.length;
      btn.innerHTML = `<span>${escapeHtml(area || 'Todas')}</span><span class="pill-count" aria-hidden="true">${count}</span>`;
      btn.addEventListener('click', () => {
        onlyFavorites = false;
        selectedArea = area;
        applyFilters();
      });
      container.append(btn);
    }

    if (favorites.size > 0) {
      const divider = document.createElement('span');
      divider.className = 'filter-divider';
      divider.setAttribute('aria-hidden', 'true');
      container.append(divider);

      const favPill = document.createElement('button');
      favPill.type = 'button';
      favPill.className = 'filter-pill';
      favPill.id = 'favFilterPill';
      favPill.setAttribute('aria-pressed', String(onlyFavorites));
      const favCount = allApps.filter(a => favorites.has(a.id)).length;
      favPill.innerHTML = `<span>★ Favoritas</span><span class="pill-count" aria-hidden="true">${favCount}</span>`;
      favPill.addEventListener('click', () => {
        onlyFavorites = !onlyFavorites;
        if (onlyFavorites) selectedArea = '';
        applyFilters();
      });
      container.append(favPill);
    }

    // Course pills
    const courseContainer = $('courseFilters');
    if (courseContainer) {
      courseContainer.replaceChildren();
      for (const [val, label] of [['', 'Todos'], ['3', '3.º Primaria'], ['4', '4.º Primaria']]) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'filter-pill';
        btn.dataset.course = val;
        btn.setAttribute('aria-pressed', String(selectedCourse === val));
        btn.textContent = label;
        btn.addEventListener('click', () => {
          selectedCourse = val;
          applyFilters();
        });
        courseContainer.append(btn);
      }
    }

    // Unit select
    const unitSelect = $('unitSelect');
    if (unitSelect) {
      const units = [...new Set(allApps.map(a => (a.unit || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
      unitSelect.innerHTML = '<option value="">Todas</option>' +
        units.map(u => `<option value="${escapeHtml(u)}">${escapeHtml(u)}</option>`).join('');
      unitSelect.value = units.includes(selectedUnit) ? selectedUnit : '';
      selectedUnit = unitSelect.value;
    }
  }

  function matchesCourse(app, course) {
    if (!course) return true;
    const text = normalize([app.cycle, app.description, app.unit, app.title].join(' '));
    if (text.includes('2.º ciclo') || text.includes('2.o ciclo') || text.includes('2º ciclo') || text.includes('3.º y 4.º') || text.includes('3º y 4º')) {
      return true;
    }
    if (course === '3') return /\b3[.ºo]/.test(text) || !/\b4[.ºo]/.test(text);
    if (course === '4') return /\b4[.ºo]/.test(text) || !/\b3[.ºo]/.test(text);
    return true;
  }

  function renderCards(filtered) {
    const grid = $('appsGrid');
    grid.replaceChildren();

    // Sort favorites first when viewing all
    const ordered = [...filtered].sort((a, b) => {
      const fa = favorites.has(a.id) ? 0 : 1;
      const fb = favorites.has(b.id) ? 0 : 1;
      return fa - fb;
    });

    for (const app of ordered) {
      const article = document.createElement('article');
      article.className = 'app-card';
      article.dataset.app = app.id;

      const isFav = favorites.has(app.id);
      const favBtn = document.createElement('button');
      favBtn.type = 'button';
      favBtn.className = 'fav-btn';
      favBtn.setAttribute('aria-pressed', String(isFav));
      favBtn.setAttribute('aria-label', isFav ? `Quitar ${app.title} de favoritas` : `Marcar ${app.title} como favorita`);
      favBtn.title = isFav ? 'Quitar de favoritas' : 'Guardar en favoritas';
      favBtn.textContent = isFav ? '★' : '☆';
      favBtn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        if (favorites.has(app.id)) favorites.delete(app.id);
        else favorites.add(app.id);
        saveJson(FAV_KEY, [...favorites]);
        if (favorites.size === 0) onlyFavorites = false;
        renderFilters();
        applyFilters();
      });

      const link = document.createElement('a');
      link.className = 'card-link';
      link.href = getAppHref(app);
      if (!app.builtIn) {
        link.target = '_blank';
        link.rel = 'noopener';
      }
      link.addEventListener('click', () => recordRecent(app.id));

      const metaParts = [app.cycle, app.unit].filter(Boolean).join(' · ');
      const actionLabel = app.builtIn ? 'Abrir aplicación' : 'Abrir recurso externo';
      const actionArrow = app.builtIn ? '→' : '↗';

      link.innerHTML = `
        ${renderCover(app)}
        <div class="card-details">
          <div class="card-meta">
            <span class="area-tag">${escapeHtml(app.area)}</span>
            ${metaParts ? `<span class="meta-sep" aria-hidden="true">·</span><span class="cycle-tag">${escapeHtml(metaParts)}</span>` : ''}
          </div>
          <h2>${escapeHtml(app.title)}</h2>
          <p class="card-desc">${escapeHtml(app.description)}</p>
          <div class="card-action">
            <span>${actionLabel}</span>
            <span class="card-arrow" aria-hidden="true">${actionArrow}</span>
          </div>
        </div>
      `;

      article.append(favBtn, link);
      grid.append(article);
    }
  }

  function applyFilters() {
    const rawQuery = $('searchInput').value;
    $('clearSearchBtn').hidden = !rawQuery;
    const terms = normalize(rawQuery).split(/\s+/).filter(Boolean);

    const filtered = allApps.filter(app => {
      if (onlyFavorites && !favorites.has(app.id)) return false;
      if (!onlyFavorites && selectedArea && app.area !== selectedArea) return false;
      if (selectedCourse && !matchesCourse(app, selectedCourse)) return false;
      if (selectedUnit && (app.unit || '').trim() !== selectedUnit) return false;
      if (!terms.length) return true;
      const haystack = normalize([app.title, app.description, app.area, app.cycle, app.unit].join(' '));
      return terms.every(term => haystack.includes(term));
    });

    renderCards(filtered);

    document.querySelectorAll('#areaFilters .filter-pill[data-area]').forEach(btn => {
      btn.setAttribute('aria-pressed', String(!onlyFavorites && btn.dataset.area === selectedArea));
    });
    document.querySelectorAll('#courseFilters .filter-pill[data-course]').forEach(btn => {
      btn.setAttribute('aria-pressed', String(btn.dataset.course === selectedCourse));
    });
    const favPill = $('favFilterPill');
    if (favPill) favPill.setAttribute('aria-pressed', String(onlyFavorites));

    const n = filtered.length;
    const parts = [];
    if (onlyFavorites) parts.push('favoritas');
    else if (selectedArea) parts.push(`de ${selectedArea}`);
    if (selectedCourse) parts.push(`${selectedCourse}.º`);
    if (selectedUnit) parts.push(selectedUnit);
    const suffix = parts.length ? ' · ' + parts.join(' · ') : '';
    $('resultCount').textContent = `${n} ${n === 1 ? 'aplicación' : 'aplicaciones'}${suffix}`;
    $('emptyState').hidden = n !== 0;
  }

  // Session Code Dialog
  const codeDialog = $('codeDialog');
  $('openCodeBtn').addEventListener('click', () => {
    $('codeError').hidden = true;
    $('sessionCodeInput').value = '';
    codeDialog.showModal();
    $('sessionCodeInput').focus();
  });

  $('closeCodeDialog').addEventListener('click', () => codeDialog.close());
  codeDialog.addEventListener('click', e => {
    if (e.target === codeDialog) codeDialog.close();
  });

  $('sessionCodeInput').addEventListener('input', e => {
    const clean = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
    e.target.value = clean;
    $('codeError').hidden = true;
  });

  $('codeForm').addEventListener('submit', async e => {
    e.preventDefault();
    const code = $('sessionCodeInput').value.trim();
    if (!code) {
      $('codeError').textContent = 'Escribe el código de sesión.';
      $('codeError').hidden = false;
      return;
    }
    $('codeSubmitBtn').disabled = true;
    $('codeError').hidden = true;
    try {
      const res = await fetch(`/api/sessions/resolve?code=${encodeURIComponent(code)}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Código no válido.');
      recordRecent(data.app);
      location.href = data.url;
    } catch (err) {
      $('codeError').textContent = err.message;
      $('codeError').hidden = false;
      $('codeSubmitBtn').disabled = false;
    }
  });

  // Search & extra filter controls
  $('searchInput').addEventListener('input', applyFilters);
  if ($('unitSelect')) {
    $('unitSelect').addEventListener('change', e => {
      selectedUnit = e.target.value;
      applyFilters();
    });
  }
  $('clearSearchBtn').addEventListener('click', () => {
    $('searchInput').value = '';
    applyFilters();
    $('searchInput').focus();
  });
  $('clearFiltersBtn').addEventListener('click', () => {
    selectedArea = '';
    selectedCourse = '';
    selectedUnit = '';
    onlyFavorites = false;
    $('searchInput').value = '';
    if ($('unitSelect')) $('unitSelect').value = '';
    renderFilters();
    applyFilters();
    $('searchInput').focus();
  });

  // Invalid code alert
  if (new URLSearchParams(location.search).get('codigo_invalido') === '1') {
    $('codeAlert').hidden = false;
    history.replaceState(null, '', '/');
  }

  // Initial load
  async function init() {
    try {
      const res = await fetch('/api/apps', { cache: 'no-store' });
      const data = await res.json();
      if (data.aulaName) {
        $('aulaName').textContent = data.aulaName;
        document.title = `${data.aulaName} · Aplicaciones`;
      }
      if (data.subtitle) $('aulaSubtitle').textContent = data.subtitle;
      allApps = Array.isArray(data.apps) ? data.apps : [];
      renderRecents();
      renderFilters();
      applyFilters();
    } catch {
      $('resultCount').textContent = 'Error al cargar';
      $('emptyState').hidden = false;
    }
  }

  init();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  }
})();
