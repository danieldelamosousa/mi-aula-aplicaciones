'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const APPS_DIR = path.join(PUBLIC, 'apps');

const OUT_PATHS = [
  path.join(ROOT, 'mi-aula-offline.html')
];

const APP_IDS = [
  'mercadito',
  'palabras',
  'ortografia',
  'taller-lengua-u3',
  'calculadora',
  'numero-protagonista',
  'taller-multiplicacion',
  'penaltis-tablas',
  'taller-problemas',
  'clases-palabras'
];

const INLINE_BRIDGE = `<script>(function(){'use strict';
let mode='',tasks={},last=performance.now(),lastAction=Date.now(),activeMs=0;
function tick(){
  const now=performance.now(),d=Math.max(0,Math.min(2000,now-last));
  last=now;
  if(!document.hidden&&Date.now()-lastAction<90000){
    activeMs+=d;
    if(tasks[mode]&&!tasks[mode].done)tasks[mode].ms+=d;
  }
}
function emit(kind,t,answer,correct){
  tick();
  try{
    window.parent.postMessage({
      type:'mi-aula-event',
      kind,
      taskId:t?t.id:'session',
      mode:(t&&t.mode)||mode||'inicio',
      level:(t&&t.level)||'',
      prompt:(t&&t.prompt)||'',
      answer:answer===undefined?'':String(answer).slice(0,1200),
      correct:correct===undefined?null:correct,
      assisted:!!(t&&t.assisted),
      taskMs:Math.round((t&&t.ms)||0),
      activeMs:Math.round(activeMs),
      clientAt:new Date().toISOString()
    },'*');
  }catch(e){}
}
const mkId=()=>'t-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
window.Aula={
  begin(m,prompt,level=''){
    tick();
    const old=tasks[m];
    if(old&&!old.done)emit('skip',old);
    tasks[m]={id:mkId(),mode:m,prompt:String(prompt||''),level:String(level||''),ms:0,assisted:false,done:false};
    if(!mode)mode=m;
  },
  activate(m){tick();mode=m;},
  attempt(m,ok,answer){
    const t=tasks[m];
    if(!t||t.done)return;
    emit('attempt',t,answer,!!ok);
    if(ok)t.done=true;
  },
  hint(m){
    const t=tasks[m];
    if(!t||t.done)return;
    t.assisted=true;
    emit('hint',t);
  },
  reveal(m){
    const t=tasks[m];
    if(!t||t.done)return;
    t.assisted=true;
    emit('reveal',t);
    t.done=true;
  }
};
for(const ev of ['pointerdown','keydown','touchstart','pointermove']){
  document.addEventListener(ev,()=>{lastAction=Date.now();},{passive:true});
}
setInterval(()=>{tick();emit('heartbeat',null);},2000);
})();</script>`;

function bundleApp(appId) {
  const dir = path.join(APPS_DIR, appId);
  let html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');

  // Inline ortografia external assets
  if (appId === 'ortografia') {
    const css = fs.readFileSync(path.join(dir, 'style.css'), 'utf8');
    const dataJs = fs.readFileSync(path.join(dir, 'data.js'), 'utf8');
    const appJs = fs.readFileSync(path.join(dir, 'app.js'), 'utf8');
    html = html
      .replace('<link rel="stylesheet" href="style.css">', () => `<style>${css}</style>`)
      .replace('<script src="data.js"></script>', () => `<script>${dataJs}</script>`)
      .replace('<script src="app.js"></script>', () => `<script>${appJs}</script>`)
      .replace('href="./"', 'href="#top" onclick="window.scrollTo({top:0,behavior:\'smooth\'});return false;"');
  }

  // Replace /registro.js with inline postMessage bridge
  html = html.replace(/<script\s+src="\/registro\.js"\s*><\/script>/i, () => INLINE_BRIDGE);

  return Buffer.from(html, 'utf8').toString('base64');
}

const embeddedApps = {};
for (const id of APP_IDS) {
  embeddedApps[id] = bundleApp(id);
  console.log(`Bundled ${id}: ${Math.round(embeddedApps[id].length / 1024)} KB (b64)`);
}

const mercaditoCoverB64 = fs.readFileSync(path.join(PUBLIC, 'assets/mercadito-cover.webp')).toString('base64');

const finalHtml = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Mi aula · Aplicaciones</title>
  <script src="https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js"></script>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: var(--background);
      color: var(--foreground);
      font-size: 14px;
      line-height: 1.5;
    }
    .cover {
      height: 176px;
      position: relative;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      border-bottom: 1px solid var(--border);
    }
    .cover-market { background: #e6f2e7; color: #163e39; }
    .awning {
      position: absolute; inset: 0 0 auto; height: 18px;
      background: repeating-linear-gradient(90deg, #1d827a 0 22px, #d7efe2 22px 44px);
      border-radius: 0 0 8px 8px;
    }
    .cover-market img {
      position: absolute; width: 156px; height: 156px; object-fit: contain;
      left: calc(50% - 96px); bottom: 2px; mix-blend-mode: multiply; transform: rotate(-6deg);
    }
    .price-tag {
      position: absolute; right: 20px; top: 48px;
      background: #ffd16b; color: #214038; font-weight: 800; font-size: 18px;
      padding: 8px 11px; border-radius: 8px; transform: rotate(7deg);
      box-shadow: 2px 3px 0 rgba(160, 122, 48, 0.35);
      font-family: ui-monospace, SFMono-Regular, monospace;
    }
    .cover-words { background: #e5efe3; gap: 6px; color: #163e39; }
    .word-piece {
      font-size: 22px; font-weight: 800; padding: 12px 10px;
      background: #fffdf8; border-radius: 10px; box-shadow: 0 3px 0 rgba(20,56,51,0.1);
    }
    .word-piece.pre { background: #e3ecff; color: #1f5ac4; border-bottom: 3px solid #1f5ac4; transform: rotate(-4deg); }
    .word-piece.root { transform: rotate(2deg); }
    .word-piece.suf { background: #fce4e3; color: #bf3643; border-bottom: 3px solid #bf3643; transform: rotate(-3deg); }

    .cover-ortho {
      background: #f5eadb;
      background-image: repeating-linear-gradient(0deg, transparent 0 24px, rgba(180,156,128,0.22) 24px 25px);
      gap: 10px;
    }
    .ortho-tile {
      width: 52px; height: 64px; border-radius: 10px; display: grid; place-items: center;
      font-family: Georgia, serif; font-size: 32px; font-weight: 700;
      box-shadow: 0 3px 0 rgba(130, 96, 62, 0.18);
    }
    .ortho-tile.t1 { background: #fffbf5; color: #b44b36; transform: rotate(-6deg); }
    .ortho-tile.t2 { background: #e2ecda; color: #24634c; transform: rotate(4deg); }
    .ortho-tile.t3 { background: #ebe3f2; color: #6b4894; transform: rotate(-3deg); }

    .cover-u3 {
      background: #ece4f6;
      background-image: repeating-linear-gradient(0deg, transparent 0 24px, rgba(132,108,168,0.14) 24px 25px);
      gap: 8px;
    }
    .cover-u3 .ortho-tile { width: auto; min-width: 50px; padding: 0 10px; font-size: 22px; }

    .cover-calc { background: #e5ecd9; }
    .mini-calc {
      background: #213d3a; border-radius: 12px; width: 112px; height: 136px; padding: 10px;
      box-shadow: 0 5px 0 #142f2a; transform: rotate(-5deg);
      display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px;
    }
    .mini-screen {
      grid-column: span 3; background: #e7efdb; border-radius: 4px; padding: 2px 6px;
      text-align: right; font-family: ui-monospace, monospace; font-weight: 800; color: #214038; font-size: 16px;
    }
    .mini-key {
      background: #fffdf4; color: #23473a; border-radius: 4px; display: grid; place-items: center;
      font-size: 12px; font-weight: 800;
    }
    .mini-key.locked { background: #476256; color: #b5c6b5; text-decoration: line-through; }
    .mini-key.eq { background: #f6ce68; }

    .cover-number { background: #e3ecff; gap: 6px; }
    .num-tile {
      width: 44px; height: 56px; border-radius: 10px; display: grid; place-items: center;
      font-family: ui-monospace, monospace; font-size: 28px; font-weight: 800;
    }
    .num-tile.n1 { background: #ffffff; color: #1b499d; box-shadow: 0 3px 0 #a8c0ef; transform: rotate(-4deg); }
    .num-tile.n2 { background: #e5f5e8; color: #256142; box-shadow: 0 3px 0 #a9d4b7; transform: translateY(-4px) rotate(3deg); }
    .num-tile.n3 { background: #fce7e9; color: #a43043; box-shadow: 0 3px 0 #efb9c2; transform: rotate(-2deg); }
    .num-tile.n4 { background: #fff1b7; color: #6d4b0c; box-shadow: 0 3px 0 #ebcf74; transform: translateY(-3px) rotate(4deg); }

    .cover-multiply { background: #e5eafc; color: #303b78; gap: 8px; font-family: ui-monospace, monospace; font-size: 26px; font-weight: 800; }
    .mul-tile { width: 46px; height: 56px; border-radius: 10px; background: #fff; display: grid; place-items: center; box-shadow: 0 3px 0 #b4bee5; }
    .mul-tile.res { background: #d8efe1; color: #235f40; box-shadow: 0 3px 0 #a7ceb7; }

    .cover-penalty { background: repeating-linear-gradient(90deg, #d8edd9 0 28px, #cde6d1 28px 56px); }
    .penalty-box {
      background: #fff; color: #214734; border-radius: 12px; padding: 12px 18px;
      box-shadow: 0 4px 0 #8ec19f; font-family: ui-monospace, monospace; font-size: 24px; font-weight: 800;
      display: flex; align-items: center; gap: 10px;
    }

    .cover-custom { background: #ebe6f4; color: #544973; font-family: Georgia, serif; font-size: 64px; font-weight: 700; }

    .cover-cap {
      position: absolute; bottom: 10px; left: 0; right: 0; text-align: center;
      font-size: 11px; font-weight: 700; letter-spacing: 0.04em; color: #4c6254;
    }

    .card-hover { transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease; }
    .card-hover:hover { transform: translateY(-3px); }
    .runner-shell {
      display: flex;
      flex-direction: column;
      height: 100vh;
      min-height: 640px;
    }
    .app-iframe {
      flex: 1;
      width: 100%;
      border: 0;
      background: #f8f7f0;
    }
    [hidden] { display: none !important; }
  </style>
</head>
<body class="bg-[var(--background)] text-[var(--foreground)] antialiased">

  <!-- Main Site Header (hidden while inside an app so the app gets full space) -->
  <header id="mainSiteHeader" class="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--card)]/95 backdrop-blur">
    <nav class="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between gap-4">
      <button id="brandBtn" type="button" class="flex items-center gap-3 text-left">
        <span class="w-9 h-9 rounded-xl flex items-center justify-center font-extrabold text-base shadow-sm" style="background:#f6c968;color:#1d3e36;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/>
            <rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>
          </svg>
        </span>
        <span>
          <span id="navAulaName" class="block font-extrabold text-lg tracking-tight leading-none">Mi aula</span>
          <span id="navAulaSub" class="block text-xs text-[var(--muted-foreground)] mt-0.5">2.º ciclo de Primaria</span>
        </span>
      </button>

      <div class="flex items-center gap-2">
        <button id="navCodeBtn" type="button" class="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] hover:bg-[var(--secondary)] text-xs font-semibold flex items-center gap-1.5">
          <span>Código de sesión</span>
        </button>
        <button id="navDocenteBtn" type="button" class="px-3 py-2 rounded-lg text-xs font-semibold hover:bg-[var(--secondary)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
          Panel docente ↗
        </button>
      </div>
    </nav>
  </header>

  <!-- VIEW 1: PORTAL -->
  <main id="viewPortal" class="max-w-6xl mx-auto px-5 py-8 space-y-6">
    <section class="flex flex-col md:flex-row md:items-end justify-between gap-4">
      <div class="max-w-2xl">
        <h1 class="text-3xl md:text-4xl font-extrabold tracking-tight leading-tight">Tu aula, a un clic.</h1>
        <p class="mt-2 text-sm md:text-base text-[var(--muted-foreground)]">
          Elige una aplicación de Lengua o Matemáticas y decide cómo trabajar hoy: práctica libre a tu ritmo o sesión registrada en el aula.
        </p>
      </div>
    </section>

    <section id="recentStrip" class="flex items-center gap-2 flex-wrap px-4 py-2.5 rounded-xl bg-[var(--card)] border border-[var(--border)]" hidden>
      <span class="text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)] mr-1">Recientes</span>
      <div id="recentList" class="flex items-center gap-2 flex-wrap"></div>
    </section>

    <section class="p-4 md:p-5 rounded-2xl bg-[var(--card)] border border-[var(--border)] space-y-4">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 class="text-sm font-bold">Encuentra tu actividad</h2>
          <p class="text-xs text-[var(--muted-foreground)]">Filtra por área, favoritas o busca por contenido (tildes, tablas, monedas, prefijos…).</p>
        </div>
        <div class="relative w-full md:w-80">
          <svg class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>
          </svg>
          <input id="searchInput" type="search" placeholder="Buscar una aplicación…" class="w-full pl-9 pr-8 py-2 rounded-xl border border-[var(--border)] bg-[var(--background)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]">
          <button id="clearSearchBtn" type="button" class="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)]" hidden>×</button>
        </div>
      </div>

      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div id="areaFilters" class="flex items-center gap-2 flex-wrap"></div>
        <span id="resultCount" class="text-xs font-semibold text-[var(--muted-foreground)] tabular-nums">8 aplicaciones</span>
      </div>
    </section>

    <section id="appsGrid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"></section>

    <section id="emptyState" class="text-center p-10 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)]" hidden>
      <h2 class="text-lg font-bold">No encontramos esa actividad</h2>
      <p class="text-sm text-[var(--muted-foreground)] mt-1 mb-4">Prueba con otra búsqueda o quita los filtros activos.</p>
      <button id="clearFiltersBtn" type="button" class="px-4 py-2 rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-semibold">Ver todas las aplicaciones</button>
    </section>
  </main>

  <!-- VIEW 2: MODE GATE (/abrir) -->
  <main id="viewGate" class="max-w-4xl mx-auto px-5 py-8 space-y-6" hidden>
    <button id="gateBackBtn" type="button" class="text-xs font-bold text-[var(--primary)] hover:underline">← Volver a todas las aplicaciones</button>

    <div>
      <div id="gateArea" class="text-xs font-extrabold uppercase tracking-widest text-[var(--primary)]"></div>
      <h1 id="gateTitle" class="text-3xl font-extrabold tracking-tight mt-1"></h1>
      <p id="gateDesc" class="text-sm text-[var(--muted-foreground)] mt-1.5 max-w-2xl"></p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <button id="gateFreeBtn" type="button" class="card-hover text-left p-6 rounded-2xl bg-[var(--card)] border border-[var(--border)] hover:border-[var(--primary)] flex flex-col">
        <span class="w-10 h-10 rounded-xl bg-[var(--secondary)] text-[var(--primary)] flex items-center justify-center font-bold mb-3">▶</span>
        <strong class="text-lg font-extrabold">Práctica libre</strong>
        <span class="text-sm text-[var(--muted-foreground)] mt-1">Practica a tu ritmo con todas las funciones de la aplicación. No se guardan resultados.</span>
        <span class="mt-4 text-xs font-bold text-[var(--primary)]">Entrar ahora →</span>
      </button>

      <button id="gateClassBtn" type="button" class="card-hover text-left p-6 rounded-2xl bg-[var(--card)] border border-[var(--border)] hover:border-[var(--primary)] flex flex-col">
        <span class="w-10 h-10 rounded-xl bg-[var(--secondary)] text-[var(--primary)] flex items-center justify-center font-bold mb-3">👥</span>
        <strong class="text-lg font-extrabold">Trabajo en el aula</strong>
        <span class="text-sm text-[var(--muted-foreground)] mt-1">Elige uno o varios alumnos, registra automáticamente cada intento, pista y tiempo, y genera código + QR.</span>
        <span class="mt-4 text-xs font-bold text-[var(--primary)]">Elegir participantes ↓</span>
      </button>
    </div>

    <section id="gateStudentsPanel" class="p-6 rounded-2xl bg-[var(--card)] border border-[var(--border)] space-y-4" hidden>
      <div class="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 class="text-lg font-bold">¿Quién participa?</h2>
          <p class="text-xs text-[var(--muted-foreground)]">Selecciona un alumno o forma un grupo.</p>
        </div>
        <span id="gateSelBadge" class="px-3 py-1 rounded-full text-xs font-bold bg-[var(--secondary)] text-[var(--foreground)]">0 seleccionados</span>
      </div>

      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div id="gateCoursePills" class="flex gap-1.5 flex-wrap"></div>
        <input id="gateRosterSearch" type="search" placeholder="Buscar alumno…" class="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] text-xs w-48">
      </div>

      <div id="gateStudentList" class="flex flex-wrap gap-2"></div>

      <div class="flex gap-2 pt-3 border-t border-[var(--border)]">
        <input id="gateGuestInput" type="text" placeholder="Añadir alumno puntual…" class="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] text-xs flex-1 max-w-xs">
        <button id="gateAddGuestBtn" type="button" class="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] hover:bg-[var(--secondary)] text-xs font-semibold">+ Añadir</button>
      </div>

      <div class="flex flex-wrap gap-2.5 pt-2">
        <button id="gateStartHereBtn" type="button" class="px-4 py-2.5 rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-semibold">Empezar en este dispositivo →</button>
        <button id="gatePrepareQrBtn" type="button" class="px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--background)] hover:bg-[var(--secondary)] text-sm font-semibold">Preparar código y QR</button>
      </div>
      <div id="gateMsg" class="text-xs font-semibold text-[var(--error)]" hidden></div>
    </section>

    <section id="gatePreparedPanel" class="p-6 rounded-2xl bg-[var(--card)] border border-[var(--border)]" hidden>
      <h2 class="text-lg font-bold">Sesión preparada</h2>
      <p id="gatePreparedSub" class="text-xs text-[var(--muted-foreground)] mt-0.5 mb-4"></p>
      <div class="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-5 items-center">
        <div class="space-y-3">
          <div class="p-4 rounded-xl border border-[var(--border)] bg-[var(--background)]">
            <div class="text-xs font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Código corto de sesión</div>
            <div id="gateShortCode" class="text-3xl font-extrabold font-mono tracking-widest mt-1">---</div>
          </div>
          <div class="flex flex-wrap gap-2">
            <button id="gateCopyCodeBtn" type="button" class="px-4 py-2 rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)] text-xs font-semibold">Copiar código</button>
            <button id="gateLaunchPreparedBtn" type="button" class="px-4 py-2 rounded-xl border border-[var(--border)] bg-[var(--background)] hover:bg-[var(--secondary)] text-xs font-semibold">Abrir actividad aquí →</button>
          </div>
        </div>
        <div class="p-3 rounded-xl border border-[var(--border)] bg-white text-center justify-self-start">
          <div id="gateQrContainer"></div>
          <div class="text-xs font-semibold mt-1.5" style="color:#4e655c;">QR de la sesión</div>
        </div>
      </div>
    </section>
  </main>

  <!-- VIEW 3: FULL REAL APPLICATION RUNNER -->
  <main id="viewRunner" class="runner-shell" hidden>
    <div id="aulaBar" class="border-b border-[var(--border)] bg-[var(--card)] px-4 py-2.5 flex items-center justify-between gap-2 flex-wrap shrink-0">
      <div class="flex items-center gap-2 flex-wrap">
        <button id="runBackPortal" type="button" class="px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] hover:bg-[var(--secondary)] text-xs font-semibold">← Mi aula</button>
        <span id="runAppName" class="text-xs font-extrabold hidden sm:inline"></span>
        <span id="runModePill" class="px-2.5 py-1 rounded-full text-xs font-bold bg-[var(--secondary)]">Práctica libre</span>
        <span id="runCodePill" class="px-2.5 py-1 rounded-full text-xs font-mono font-bold border border-[var(--border)]" hidden></span>
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        <span id="runScorePill" class="px-2.5 py-1 rounded-full text-xs font-mono font-semibold border border-[var(--border)] tabular-nums" hidden>0/0 aciertos</span>
        <span id="runTimerPill" class="px-2.5 py-1 rounded-full text-xs font-mono font-semibold border border-[var(--border)] tabular-nums" hidden>00:00</span>
        <span id="runSavePill" class="px-2.5 py-1 rounded-full text-xs font-semibold text-[var(--success)]" hidden>Preparado</span>
        <button id="runFsBtn" type="button" title="Pantalla completa" class="px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] hover:bg-[var(--secondary)] text-xs font-semibold">⛶</button>
        <button id="runEndBtn" type="button" class="px-3 py-1.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-xs font-semibold">Cambiar de modo</button>
      </div>
    </div>
    <iframe id="appFrame" class="app-iframe" title="Aplicación interactiva de Mi aula" allow="fullscreen"></iframe>
  </main>

  <!-- VIEW 4: TEACHER DASHBOARD (/docente) -->
  <main id="viewDocente" class="max-w-6xl mx-auto px-5 py-8" hidden>
    <section id="docLogin" class="max-w-md mx-auto my-8 p-7 rounded-2xl bg-[var(--card)] border border-[var(--border)] space-y-4" hidden>
      <h1 class="text-2xl font-extrabold tracking-tight">Acceso docente</h1>
      <p class="text-sm text-[var(--muted-foreground)]">Introduce tu PIN para consultar resultados reales de las 8 aplicaciones, gestionar la lista de clase y organizar el portal.</p>
      <div id="docDefaultTip" class="p-3 rounded-xl bg-[var(--secondary)] text-xs">
        PIN inicial por defecto: <strong class="font-mono">1234</strong>. Puedes cambiarlo o desactivarlo en <em>Ajustes</em>.
      </div>
      <form id="docLoginForm" class="space-y-3">
        <input id="docPinInput" type="password" inputmode="numeric" placeholder="••••" class="w-full py-3 px-4 rounded-xl border border-[var(--border)] bg-[var(--background)] text-center font-mono text-xl tracking-[0.3em]">
        <div id="docLoginErr" class="text-xs font-semibold text-[var(--error)]" hidden></div>
        <button type="submit" class="w-full py-2.5 rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-semibold">Entrar al panel docente</button>
      </form>
    </section>

    <section id="docDash" class="space-y-6" hidden>
      <div class="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 class="text-2xl md:text-3xl font-extrabold tracking-tight">Registro docente</h1>
          <p class="text-sm text-[var(--muted-foreground)]">Seguimiento del trabajo real en el aula, alumnado y catálogo de aplicaciones.</p>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <button id="docExportCsv" type="button" class="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-xs font-semibold">Exportar CSV</button>
          <button id="docLogout" type="button" class="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)] text-xs font-semibold">Bloquear panel</button>
        </div>
      </div>

      <div id="docToast" class="p-3 rounded-xl bg-[var(--secondary)] text-xs font-semibold" hidden></div>

      <div class="flex gap-2 flex-wrap border-b border-[var(--border)] pb-3">
        <button class="doc-tab px-4 py-2 rounded-full text-xs font-bold" data-tab="sesiones" type="button">Resumen y sesiones</button>
        <button class="doc-tab px-4 py-2 rounded-full text-xs font-bold" data-tab="alumnado" type="button">Alumnado</button>
        <button class="doc-tab px-4 py-2 rounded-full text-xs font-bold" data-tab="apps" type="button">Aplicaciones</button>
        <button class="doc-tab px-4 py-2 rounded-full text-xs font-bold" data-tab="ajustes" type="button">Ajustes</button>
      </div>

      <div id="docTab-sesiones" class="doc-panel space-y-5">
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="p-4 rounded-2xl bg-[var(--card)] border border-[var(--border)]">
            <div class="text-xs font-bold uppercase text-[var(--muted-foreground)]">Sesiones</div>
            <div id="mSessions" class="text-2xl font-extrabold font-mono mt-1 tabular-nums">0</div>
          </div>
          <div class="p-4 rounded-2xl bg-[var(--card)] border border-[var(--border)]">
            <div class="text-xs font-bold uppercase text-[var(--muted-foreground)]">Respuestas</div>
            <div id="mAttempts" class="text-2xl font-extrabold font-mono mt-1 tabular-nums">0</div>
          </div>
          <div class="p-4 rounded-2xl bg-[var(--card)] border border-[var(--border)]">
            <div class="text-xs font-bold uppercase text-[var(--muted-foreground)]">Acierto medio</div>
            <div id="mAccuracy" class="text-2xl font-extrabold font-mono mt-1 tabular-nums">—</div>
          </div>
          <div class="p-4 rounded-2xl bg-[var(--card)] border border-[var(--border)]">
            <div class="text-xs font-bold uppercase text-[var(--muted-foreground)]">Tiempo activo</div>
            <div id="mTime" class="text-2xl font-extrabold font-mono mt-1 tabular-nums">0 s</div>
          </div>
        </div>

        <div class="p-5 rounded-2xl bg-[var(--card)] border border-[var(--border)] space-y-4">
          <div class="flex items-center justify-between gap-3 flex-wrap">
            <h2 class="text-base font-bold">Sesiones registradas</h2>
            <div class="flex gap-2 flex-wrap">
              <select id="fStudent" class="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] text-xs"><option value="">Todos los alumnos</option></select>
              <select id="fApp" class="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] text-xs"><option value="">Todas las apps</option></select>
            </div>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse text-xs">
              <thead>
                <tr class="border-b border-[var(--border)] text-[var(--muted-foreground)] uppercase">
                  <th class="py-2.5 pr-3">Fecha</th>
                  <th class="py-2.5 pr-3">Código</th>
                  <th class="py-2.5 pr-3">Participantes</th>
                  <th class="py-2.5 pr-3">Aplicación</th>
                  <th class="py-2.5 pr-3">Acierto</th>
                  <th class="py-2.5 pr-3">Tiempo</th>
                  <th class="py-2.5">Acciones</th>
                </tr>
              </thead>
              <tbody id="docSessionsBody"></tbody>
            </table>
          </div>
        </div>
      </div>

      <div id="docTab-alumnado" class="doc-panel grid grid-cols-1 lg:grid-cols-2 gap-5" hidden>
        <div class="p-5 rounded-2xl bg-[var(--card)] border border-[var(--border)] space-y-3">
          <h2 class="text-base font-bold">Progreso por alumno</h2>
          <div id="docStudentStats" class="divide-y divide-[var(--border)] text-xs"></div>
        </div>
        <div class="p-5 rounded-2xl bg-[var(--card)] border border-[var(--border)] space-y-4">
          <h2 class="text-base font-bold">Gestionar lista de clase</h2>
          <form id="docAddStudentForm" class="flex gap-2 flex-wrap">
            <input id="docNewStName" type="text" placeholder="Nombre del alumno/a" class="flex-1 min-w-[140px] px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-xs" required>
            <select id="docNewStCourse" class="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-xs">
              <option value="3.º">3.º</option>
              <option value="4.º">4.º</option>
            </select>
            <button type="submit" class="px-3 py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-xs font-semibold">Añadir</button>
          </form>
          <div id="docRosterList" class="divide-y divide-[var(--border)] border border-[var(--border)] rounded-xl"></div>
          <details class="text-xs">
            <summary class="cursor-pointer font-bold text-[var(--primary)]">Importar lista en lote (un nombre por línea)</summary>
            <textarea id="docBulkText" rows="4" placeholder="Ana G., 3.º&#10;Bruno M., 4.º" class="mt-2 w-full p-2.5 rounded-lg border border-[var(--border)] bg-[var(--background)]"></textarea>
            <div class="flex gap-2 mt-2">
              <button id="docBulkAdd" type="button" class="px-3 py-1.5 rounded-lg border border-[var(--border)] font-semibold">Añadir</button>
              <button id="docBulkReplace" type="button" class="px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--error)] font-semibold">Reemplazar lista</button>
            </div>
          </details>
        </div>
      </div>

      <div id="docTab-apps" class="doc-panel grid grid-cols-1 lg:grid-cols-2 gap-5" hidden>
        <div class="p-5 rounded-2xl bg-[var(--card)] border border-[var(--border)] space-y-3">
          <h2 class="text-base font-bold">Visibilidad en el portal</h2>
          <p class="text-xs text-[var(--muted-foreground)]">Activa u oculta aplicaciones según la unidad que estés trabajando hoy.</p>
          <div id="docAppsList" class="divide-y divide-[var(--border)] border border-[var(--border)] rounded-xl"></div>
        </div>
        <div class="p-5 rounded-2xl bg-[var(--card)] border border-[var(--border)] space-y-3">
          <h2 class="text-base font-bold">Añadir recurso externo</h2>
          <form id="docAddAppForm" class="space-y-3 text-xs">
            <input id="cAppTitle" type="text" placeholder="Nombre (ej. Dictado interactivo)" class="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)]" required>
            <div class="grid grid-cols-2 gap-2">
              <input id="cAppArea" type="text" value="Lengua" placeholder="Área" class="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)]" required>
              <input id="cAppCycle" type="text" value="2.º ciclo" placeholder="Ciclo" class="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)]">
            </div>
            <input id="cAppUrl" type="url" placeholder="https://… (opcional)" class="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)]">
            <input id="cAppDesc" type="text" placeholder="Descripción breve" class="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)]">
            <button type="submit" class="w-full py-2.5 rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)] font-semibold">Añadir al portal</button>
          </form>
        </div>
      </div>

      <div id="docTab-ajustes" class="doc-panel max-w-lg" hidden>
        <form id="docCfgForm" class="p-5 rounded-2xl bg-[var(--card)] border border-[var(--border)] space-y-4 text-xs">
          <h2 class="text-base font-bold">Configuración del aula</h2>
          <div>
            <label class="block font-bold mb-1">Nombre del portal</label>
            <input id="cfgName" type="text" class="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)]" required>
          </div>
          <div>
            <label class="block font-bold mb-1">Subtítulo</label>
            <input id="cfgSub" type="text" class="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)]">
          </div>
          <div>
            <label class="block font-bold mb-1">Nuevo PIN docente (opcional, mín. 4 dígitos)</label>
            <input id="cfgPin" type="password" inputmode="numeric" placeholder="Dejar vacío para mantener" class="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)]">
          </div>
          <label class="flex items-center justify-between gap-3 p-3 rounded-xl border border-[var(--border)] bg-[var(--background)]">
            <span class="font-semibold">Pedir PIN al abrir el panel docente</span>
            <input id="cfgPinEnabled" type="checkbox" class="w-4 h-4 accent-[var(--primary)]">
          </label>
          <button type="submit" class="px-4 py-2.5 rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)] font-semibold">Guardar ajustes</button>
        </form>
      </div>
    </section>
  </main>

  <!-- SESSION CODE MODAL -->
  <div id="codeModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" hidden>
    <div class="w-full max-w-md p-6 rounded-2xl bg-[var(--card)] border border-[var(--border)] space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-bold">Entrar con código de sesión</h2>
        <button id="closeCodeModal" type="button" class="w-8 h-8 rounded-lg border border-[var(--border)] text-base">×</button>
      </div>
      <p class="text-xs text-[var(--muted-foreground)]">Escribe el código generado por el docente (por ejemplo <span class="font-mono font-bold">AUL-482</span>).</p>
      <form id="codeModalForm" class="space-y-3">
        <input id="codeModalInput" type="text" maxlength="9" placeholder="ABC-123" class="w-full py-3 px-4 rounded-xl border border-[var(--border)] bg-[var(--background)] text-center font-mono text-2xl font-bold tracking-widest uppercase">
        <div id="codeModalErr" class="text-xs font-semibold text-[var(--error)]" hidden></div>
        <button type="submit" class="w-full py-2.5 rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-semibold">Abrir mi actividad →</button>
      </form>
    </div>
  </div>

  <!-- SESSION DETAIL MODAL -->
  <div id="detailModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" hidden>
    <div class="w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6 rounded-2xl bg-[var(--card)] border border-[var(--border)] space-y-4">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h2 id="detailTitle" class="text-lg font-bold"></h2>
          <p id="detailSub" class="text-xs text-[var(--muted-foreground)]"></p>
        </div>
        <button id="closeDetailModal" type="button" class="w-8 h-8 rounded-lg border border-[var(--border)] text-base">×</button>
      </div>
      <div id="detailContent" class="space-y-3"></div>
    </div>
  </div>

  <script>
  (() => {
    'use strict';

    const MERCADITO_COVER_URI = 'data:image/webp;base64,${mercaditoCoverB64}';
    const EMBEDDED_APPS = ${JSON.stringify(embeddedApps)};

    function decodeAppHtml(id) {
      const b64 = EMBEDDED_APPS[id];
      if (!b64) return '';
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new TextDecoder('utf-8').decode(bytes);
    }

    // --- Pure-JS QR SVG Generator (Versions 1-5, ECC M) ---
    const GF_EXP = new Uint8Array(512), GF_LOG = new Uint8Array(256);
    let gx = 1;
    for (let i = 0; i < 255; i++) { GF_EXP[i] = gx; GF_LOG[gx] = i; gx <<= 1; if (gx & 0x100) gx ^= 0x11d; }
    for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
    const gfMul = (a, b) => (a === 0 || b === 0) ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]];
    function rsEncode(data, ec) {
      let poly = [1];
      for (let i = 0; i < ec; i++) {
        const next = new Array(poly.length + 1).fill(0);
        for (let j = 0; j < poly.length; j++) { next[j] ^= poly[j]; next[j + 1] ^= gfMul(poly[j], GF_EXP[i]); }
        poly = next;
      }
      const res = new Uint8Array(ec);
      for (let i = 0; i < data.length; i++) {
        const f = data[i] ^ res[0];
        for (let j = 0; j < ec - 1; j++) res[j] = res[j + 1];
        res[ec - 1] = 0;
        if (f) for (let j = 0; j < ec; j++) res[j] ^= gfMul(poly[j + 1], f);
      }
      return res;
    }
    const QR_VER = { 1:[16,10,1,[]], 2:[28,16,1,[6,18]], 3:[44,26,1,[6,22]], 4:[64,18,2,[6,26]], 5:[86,24,2,[6,30]] };
    function renderQrSvg(text, px = 152) {
      const bytes = new TextEncoder().encode(text);
      let ver = 1; while (ver <= 5 && bytes.length + 2 > QR_VER[ver][0]) ver++;
      const [totalData, ecPer, blocks, align] = QR_VER[Math.min(ver, 5)];
      const size = Math.min(ver, 5) * 4 + 17;
      const bits = [];
      const push = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
      push(4, 4); push(bytes.length, 8); for (const b of bytes) push(b, 8);
      for (let i = 0; i < 4 && bits.length < totalData * 8; i++) bits.push(0);
      while (bits.length % 8) bits.push(0);
      const dataBytes = [];
      for (let i = 0; i < bits.length; i += 8) { let b = 0; for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j]; dataBytes.push(b); }
      let pi = 0; while (dataBytes.length < totalData) dataBytes.push(pi++ & 1 ? 0x11 : 0xec);
      const bLen = Math.floor(totalData / blocks), dB = [], eB = [];
      for (let b = 0; b < blocks; b++) { const sl = dataBytes.slice(b * bLen, (b + 1) * bLen); dB.push(sl); eB.push(rsEncode(sl, ecPer)); }
      const cw = [];
      for (let i = 0; i < bLen; i++) for (let b = 0; b < blocks; b++) cw.push(dB[b][i]);
      for (let i = 0; i < ecPer; i++) for (let b = 0; b < blocks; b++) cw.push(eB[b][i]);
      const mat = Array.from({ length: size }, () => new Int8Array(size).fill(-1));
      const fn = Array.from({ length: size }, () => new Uint8Array(size));
      const setF = (r, c, v) => { if (r >= 0 && r < size && c >= 0 && c < size) { mat[r][c] = v ? 1 : 0; fn[r][c] = 1; } };
      const finder = (r0, c0) => {
        for (let dr = -1; dr <= 7; dr++) for (let dc = -1; dc <= 7; dc++) {
          const d = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6 && (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
          setF(r0 + dr, c0 + dc, d ? 1 : 0);
        }
      };
      finder(0, 0); finder(0, size - 7); finder(size - 7, 0);
      for (const r of align) for (const c of align) if (!fn[r][c]) for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) setF(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1 ? 1 : 0);
      for (let i = 8; i < size - 8; i++) { setF(6, i, i % 2 === 0); setF(i, 6, i % 2 === 0); }
      for (let i = 0; i <= 8; i++) if (i !== 6) { if (!fn[8][i]) setF(8, i, 0); if (!fn[i][8]) setF(i, 8, 0); }
      for (let i = size - 8; i < size; i++) { setF(8, i, 0); setF(i, 8, 0); }
      setF(size - 8, 8, 1);
      let bi = 0, up = true;
      for (let col = size - 1; col >= 1; col -= 2) {
        if (col === 6) col--;
        for (let i = 0; i < size; i++) {
          const r = up ? size - 1 - i : i;
          for (let dx = 0; dx < 2; dx++) {
            const c = col - dx; if (fn[r][c]) continue;
            let bit = bi < cw.length * 8 ? ((cw[bi >>> 3] >>> (7 - (bi & 7))) & 1) : 0; bi++;
            if ((r + c) % 2 === 0) bit ^= 1;
            mat[r][c] = bit;
          }
        }
        up = !up;
      }
      const fmt = 0x5412;
      for (let i = 0; i < 6; i++) setF(8, i, (fmt >>> (14 - i)) & 1);
      setF(8, 7, (fmt >>> 8) & 1); setF(8, 8, (fmt >>> 7) & 1); setF(7, 8, (fmt >>> 6) & 1);
      for (let i = 0; i < 6; i++) setF(5 - i, 8, (fmt >>> (5 - i)) & 1);
      for (let i = 0; i < 7; i++) setF(size - 1 - i, 8, (fmt >>> (14 - i)) & 1);
      for (let i = 0; i < 8; i++) setF(8, size - 8 + i, (fmt >>> (7 - i)) & 1);
      const m = 2, tot = size + m * 2; let d = '';
      for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (mat[r][c] === 1) d += \`M\${c + m},\${r + m}h1v1h-1z\`;
      return \`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 \${tot} \${tot}" width="\${px}" height="\${px}" shape-rendering="crispEdges"><rect width="\${tot}" height="\${tot}" fill="#fff"/><path d="\${d}" fill="#143833"/></svg>\`;
    }

    // --- State & Storage ---
    const STORE_KEY = 'mi-aula-full-v3';
    const DEFAULT_APPS = [
      { id: 'mercadito', title: 'El mercadito', area: 'Matemáticas', cycle: '2.º ciclo', unit: 'Dinero y cálculo', description: 'Compra, paga y devuelve el cambio con monedas y billetes. Elige el nivel y practica a tu ritmo.', cover: 'market', visible: true, builtIn: true },
      { id: 'palabras', title: 'Taller de palabras', area: 'Lengua', cycle: '2.º ciclo', unit: 'U2', description: 'Subraya prefijos y sufijos y forma palabras derivadas a partir de una raíz. Contenidos de 3.º y 4.º.', cover: 'words', visible: true, builtIn: true },
      { id: 'ortografia', title: 'Taller de ortografía', area: 'Lengua', cycle: '2.º ciclo', unit: 'U2', description: 'Practica las tildes y clasifica palabras. Corrige mayúsculas y coloca los tipos de punto en textos con párrafos.', cover: 'ortho', visible: true, builtIn: true },
      { id: 'taller-lengua-u3', title: 'Taller de Lengua U3', area: 'Lengua', cycle: '3.º y 4.º', unit: 'U3', description: 'En 3.º, practica palabras polisémicas, aumentativos, diminutivos, compuestas y listas. En 4.º, sinónimos, adjetivos, descripciones de animales, diptongos e hiatos.', cover: 'u3', visible: true, builtIn: true },
      { id: 'calculadora', title: 'Calculadora bloqueada', area: 'Matemáticas', cycle: '2.º ciclo', unit: 'Cálculo mental', description: 'Alcanza el número objetivo con sumas, restas y multiplicaciones sin usar las teclas bloqueadas. Retos aleatorios de 2 y 3 cifras.', cover: 'calc', visible: true, builtIn: true },
      { id: 'numero-protagonista', title: 'El número protagonista', area: 'Matemáticas', cycle: '2.º ciclo', unit: 'Numeración', description: 'Explora un número de 4 o 6 cifras. Practica el valor posicional, la descomposición, el redondeo y el Número sol.', cover: 'number', visible: true, builtIn: true },
      { id: 'taller-multiplicacion', title: 'Taller de multiplicación U3', area: 'Matemáticas', cycle: '3.º y 4.º', unit: 'U3', description: 'Elige tu curso y practica grupos iguales, tablas y problemas, con un teclado numérico para responder.', cover: 'multiply', visible: true, builtIn: true },
      { id: 'penaltis-tablas', title: 'Penaltis de las tablas', area: 'Matemáticas', cycle: '2.º ciclo', unit: 'Tablas', description: 'Practica las tablas del 1 al 10 chutando el resultado correcto o forma sumas repetidas con pelotas y aros.', cover: 'penalty', visible: true, builtIn: true }
    ];

    function defaultState() {
      return {
        config: { aulaName: 'Mi aula', subtitle: '2.º ciclo de Primaria', pin: '1234', pinEnabled: true, isDefaultPin: true },
        students: [
          { name: 'Lucía G.', course: '3.º' }, { name: 'Mateo R.', course: '3.º' },
          { name: 'Sofía M.', course: '3.º' }, { name: 'Hugo P.', course: '3.º' },
          { name: 'Valeria C.', course: '4.º' }, { name: 'Leo D.', course: '4.º' },
          { name: 'Martina S.', course: '4.º' }, { name: 'Daniel V.', course: '4.º' }
        ],
        apps: DEFAULT_APPS,
        favorites: [],
        recents: [],
        sessions: []
      };
    }

    function loadState() {
      try {
        const raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
        if (raw && Array.isArray(raw.apps)) return raw;
      } catch {}
      const fresh = defaultState();
      saveState(fresh);
      return fresh;
    }

    function saveState(st = db) {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(st)); } catch {}
    }

    let db = loadState();
    let selectedArea = '', onlyFavs = false;
    let currentGateApp = null, gateCourse = '', gateSelected = new Set(), preparedSession = null;
    let teacherUnlocked = false, currentDocTab = 'sesiones';
    let activeRunner = null;

    const $ = id => document.getElementById(id);
    const norm = s => String(s || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLocaleLowerCase('es').trim();
    const esc = s => { const d = document.createElement('div'); d.textContent = String(s ?? ''); return d.innerHTML; };
    const fmtDur = ms => {
      const s = Math.max(0, Math.round((ms || 0) / 1000));
      if (s < 60) return \`\${s} s\`;
      const m = Math.floor(s / 60), r = s % 60;
      return r ? \`\${m} min \${r} s\` : \`\${m} min\`;
    };
    const fmtClock = ms => {
      const t = Math.floor((ms || 0) / 1000);
      return \`\${String(Math.floor(t / 60)).padStart(2, '0')}:\${String(t % 60).padStart(2, '0')}\`;
    };

    function genCode() {
      const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ', D = '23456789';
      const pick = s => s[Math.floor(Math.random() * s.length)];
      return \`\${pick(L)}\${pick(L)}\${pick(L)}-\${pick(D)}\${pick(D)}\${pick(D)}\`;
    }

    function showView(viewId) {
      const isRunner = viewId === 'viewRunner';
      $('mainSiteHeader').hidden = isRunner;
      if (!isRunner) {
        $('appFrame').srcdoc = '';
        activeRunner = null;
      }
      ['viewPortal', 'viewGate', 'viewRunner', 'viewDocente'].forEach(id => { $(id).hidden = id !== viewId; });
      window.scrollTo({ top: 0, behavior: 'instant' });
    }

    function syncHeader() {
      $('navAulaName').textContent = db.config.aulaName || 'Mi aula';
      $('navAulaSub').textContent = db.config.subtitle || '2.º ciclo de Primaria';
    }

    // --- PORTAL ---
    function coverHtml(app) {
      switch (app.cover) {
        case 'market': return \`<div class="cover cover-market"><div class="awning"></div><img src="\${MERCADITO_COVER_URI}" alt=""><span class="price-tag">19,95 €</span></div>\`;
        case 'words': return \`<div class="cover cover-words"><span class="word-piece pre">des</span><span class="word-piece root">orden</span><span class="word-piece suf">…</span><span class="cover-cap">Descubre · Subraya · Crea</span></div>\`;
        case 'ortho': return \`<div class="cover cover-ortho"><span class="ortho-tile t1">á</span><span class="ortho-tile t2">A</span><span class="ortho-tile t3">.</span><span class="cover-cap">Piensa · Corrige · Escribe</span></div>\`;
        case 'u3': return \`<div class="cover cover-u3"><span class="ortho-tile t1">Aa</span><span class="ortho-tile t2">-ito</span><span class="ortho-tile t3">ue</span><span class="cover-cap">Vocabulario · Gramática · Ortografía</span></div>\`;
        case 'calc': return \`<div class="cover cover-calc"><div class="mini-calc"><span class="mini-screen">42</span><span class="mini-key">7</span><span class="mini-key locked">8</span><span class="mini-key">9</span><span class="mini-key locked">4</span><span class="mini-key">5</span><span class="mini-key">6</span><span class="mini-key">+</span><span class="mini-key">−</span><span class="mini-key eq">=</span></div></div>\`;
        case 'number': return \`<div class="cover cover-number"><span class="num-tile n1">2</span><span class="num-tile n2">4</span><span class="num-tile n3">0</span><span class="num-tile n4">8</span></div>\`;
        case 'multiply': return \`<div class="cover cover-multiply"><span class="mul-tile">3</span><span>×</span><span class="mul-tile">4</span><span>=</span><span class="mul-tile res">12</span></div>\`;
        case 'penalty': return \`<div class="cover cover-penalty"><div class="penalty-box"><span>6 × 7</span><span class="text-3xl">⚽</span></div></div>\`;
        default: return \`<div class="cover cover-custom">\${esc((app.title || 'A').charAt(0).toUpperCase())}</div>\`;
      }
    }

    function renderPortal() {
      syncHeader();
      const visibleApps = db.apps.filter(a => a.visible !== false);

      const recApps = db.recents.map(id => visibleApps.find(a => a.id === id)).filter(Boolean);
      $('recentStrip').hidden = !recApps.length;
      $('recentList').replaceChildren();
      for (const a of recApps) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'px-3 py-1 rounded-full bg-[var(--secondary)] hover:bg-[var(--primary)] hover:text-[var(--primary-foreground)] text-xs font-semibold transition-colors';
        b.textContent = a.title;
        b.onclick = () => openAppCard(a);
        $('recentList').append(b);
      }

      const areas = [...new Set(visibleApps.map(a => a.area))].sort((a, b) => a.localeCompare(b, 'es'));
      $('areaFilters').replaceChildren();
      for (const area of ['', ...areas]) {
        const active = !onlyFavs && selectedArea === area;
        const count = area ? visibleApps.filter(a => a.area === area).length : visibleApps.length;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = \`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors \${active ? 'bg-[var(--primary)] text-[var(--primary-foreground)] border-[var(--primary)]' : 'bg-[var(--background)] border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}\`;
        btn.innerHTML = \`\${esc(area || 'Todas')} <span class="opacity-75 ml-1">\${count}</span>\`;
        btn.onclick = () => { onlyFavs = false; selectedArea = area; renderPortal(); };
        $('areaFilters').append(btn);
      }

      const favSet = new Set(db.favorites);
      if (favSet.size > 0) {
        const favCount = visibleApps.filter(a => favSet.has(a.id)).length;
        const fBtn = document.createElement('button');
        fBtn.type = 'button';
        fBtn.className = \`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors \${onlyFavs ? 'bg-[var(--primary)] text-[var(--primary-foreground)] border-[var(--primary)]' : 'bg-[var(--background)] border-[var(--border)] text-[var(--muted-foreground)]'}\`;
        fBtn.innerHTML = \`★ Favoritas <span class="opacity-75 ml-1">\${favCount}</span>\`;
        fBtn.onclick = () => { onlyFavs = !onlyFavs; if (onlyFavs) selectedArea = ''; renderPortal(); };
        $('areaFilters').append(fBtn);
      }

      const q = $('searchInput').value;
      $('clearSearchBtn').hidden = !q;
      const terms = norm(q).split(/\\s+/).filter(Boolean);
      const filtered = visibleApps.filter(a => {
        if (onlyFavs && !favSet.has(a.id)) return false;
        if (!onlyFavs && selectedArea && a.area !== selectedArea) return false;
        if (!terms.length) return true;
        const txt = norm([a.title, a.description, a.area, a.cycle, a.unit].join(' '));
        return terms.every(t => txt.includes(t));
      }).sort((a, b) => (favSet.has(a.id) ? 0 : 1) - (favSet.has(b.id) ? 0 : 1));

      $('resultCount').textContent = \`\${filtered.length} \${filtered.length === 1 ? 'aplicación' : 'aplicaciones'}\`;
      $('emptyState').hidden = filtered.length > 0;
      $('appsGrid').replaceChildren();

      for (const app of filtered) {
        const isFav = favSet.has(app.id);
        const card = document.createElement('article');
        card.className = 'card-hover relative rounded-2xl bg-[var(--card)] border border-[var(--border)] overflow-hidden flex flex-col cursor-pointer';
        card.innerHTML = \`
          <button type="button" class="fav-toggle absolute top-2.5 right-2.5 z-10 w-8 h-8 rounded-full border border-[var(--border)] flex items-center justify-center text-sm shadow-sm" style="background:\${isFav ? '#f6c968' : 'rgba(255,255,255,0.92)'};color:\${isFav ? '#5a3c03' : '#52675d'};" title="\${isFav ? 'Quitar favorita' : 'Marcar favorita'}">\${isFav ? '★' : '☆'}</button>
          \${coverHtml(app)}
          <div class="p-4 flex flex-col flex-1">
            <div class="text-xs font-extrabold uppercase tracking-wider text-[var(--primary)]">\${esc(app.area)} <span class="font-semibold normal-case tracking-normal text-[var(--muted-foreground)]">· \${esc([app.cycle, app.unit].filter(Boolean).join(' · '))}</span></div>
            <h2 class="text-lg font-extrabold tracking-tight mt-1">\${esc(app.title)}</h2>
            <p class="text-xs text-[var(--muted-foreground)] mt-1.5 mb-4 leading-relaxed">\${esc(app.description)}</p>
            <div class="mt-auto pt-3 border-t border-[var(--border)] flex items-center justify-between text-xs font-bold text-[var(--primary)]">
              <span>\${app.builtIn ? 'Abrir aplicación' : 'Abrir recurso externo'}</span><span>\${app.builtIn ? '→' : '↗'}</span>
            </div>
          </div>
        \`;
        card.querySelector('.fav-toggle').onclick = e => {
          e.stopPropagation();
          if (favSet.has(app.id)) db.favorites = db.favorites.filter(x => x !== app.id);
          else db.favorites.push(app.id);
          if (!db.favorites.length) onlyFavs = false;
          saveState(); renderPortal();
        };
        card.onclick = () => openAppCard(app);
        $('appsGrid').append(card);
      }
    }

    function openAppCard(app) {
      if (!app.builtIn && app.externalUrl) {
        window.open(app.externalUrl, '_blank', 'noopener');
        return;
      }
      openGate(app.id);
    }

    // --- GATE (/abrir) ---
    function openGate(appId) {
      const app = db.apps.find(a => a.id === appId);
      if (!app) return;
      db.recents = [appId, ...db.recents.filter(x => x !== appId)].slice(0, 4);
      saveState();

      currentGateApp = app;
      gateCourse = '';
      gateSelected = new Set();
      preparedSession = null;

      $('gateArea').textContent = [app.area, app.cycle, app.unit].filter(Boolean).join(' · ');
      $('gateTitle').textContent = app.title;
      $('gateDesc').textContent = app.description;
      $('gateStudentsPanel').hidden = true;
      $('gatePreparedPanel').hidden = true;
      $('gateMsg').hidden = true;
      $('gateRosterSearch').value = '';
      showView('viewGate');
    }

    function renderGateStudents() {
      const courses = [...new Set(db.students.map(s => s.course).filter(Boolean))].sort();
      $('gateCoursePills').replaceChildren();
      for (const c of ['', ...courses]) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = \`px-3 py-1 rounded-full text-xs font-semibold border \${gateCourse === c ? 'bg-[var(--primary)] text-[var(--primary-foreground)] border-[var(--primary)]' : 'bg-[var(--background)] border-[var(--border)]'}\`;
        b.textContent = c || 'Todos';
        b.onclick = () => { gateCourse = c; renderGateStudents(); };
        $('gateCoursePills').append(b);
      }

      const q = norm($('gateRosterSearch').value);
      const list = db.students.filter(s => (!gateCourse || s.course === gateCourse) && (!q || norm(s.name).includes(q)));
      $('gateStudentList').replaceChildren();
      for (const st of list) {
        const checked = gateSelected.has(st.name);
        const lbl = document.createElement('label');
        lbl.className = \`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold cursor-pointer select-none \${checked ? 'border-[var(--primary)] bg-[var(--secondary)]' : 'border-[var(--border)] bg-[var(--background)]'}\`;
        lbl.innerHTML = \`<input type="checkbox" class="accent-[var(--primary)]" \${checked ? 'checked' : ''}><span>\${esc(st.name)}</span>\${st.course ? \`<span class="opacity-65">\${esc(st.course)}</span>\` : ''}\`;
        lbl.querySelector('input').onchange = e => {
          if (e.target.checked) gateSelected.add(st.name); else gateSelected.delete(st.name);
          updateGateBadge(); renderGateStudents();
        };
        $('gateStudentList').append(lbl);
      }
      updateGateBadge();
    }

    function updateGateBadge() {
      const n = gateSelected.size;
      $('gateSelBadge').textContent = n === 0 ? '0 seleccionados' : (n === 1 ? '1 participante' : \`Grupo de \${n}\`);
    }

    function createClassroomSession(students) {
      const session = {
        id: 'ses-' + Date.now().toString(36),
        code: genCode(),
        app: currentGateApp.id,
        appTitle: currentGateApp.title,
        students: [...students],
        createdAt: new Date().toISOString(),
        endedAt: null,
        activeMs: 0,
        events: []
      };
      db.sessions.unshift(session);
      saveState();
      return session;
    }

    // --- REAL FULL APP RUNNER (IFRAME SRCDOC + POSTMESSAGE BRIDGE) ---
    function launchRealApp(app, session) {
      showView('viewRunner');
      activeRunner = {
        app,
        session,
        baseMs: session ? (session.activeMs || 0) : 0,
        attempts: 0,
        correct: 0
      };

      if (session) {
        for (const ev of (session.events || [])) {
          if (ev.kind === 'attempt') {
            activeRunner.attempts++;
            if (ev.correct) activeRunner.correct++;
          }
        }
      }

      $('runAppName').textContent = app.title;
      $('runModePill').textContent = session ? \`En el aula · \${session.students.join(', ')}\` : 'Práctica libre · sin registro';
      $('runCodePill').hidden = !session;
      if (session) $('runCodePill').textContent = session.code;
      $('runScorePill').hidden = !session;
      $('runTimerPill').hidden = !session;
      $('runSavePill').hidden = !session;
      if (session) {
        $('runScorePill').textContent = \`\${activeRunner.correct}/\${activeRunner.attempts} aciertos\`;
        $('runTimerPill').textContent = fmtClock(activeRunner.baseMs);
        $('runSavePill').textContent = 'Preparado';
      }
      $('runEndBtn').textContent = session ? 'Terminar sesión' : 'Cambiar de modo';

      const html = decodeAppHtml(app.id);
      $('appFrame').srcdoc = html;
    }

    window.addEventListener('message', e => {
      const msg = e.data;
      if (!msg || msg.type !== 'mi-aula-event' || !activeRunner) return;
      const ses = activeRunner.session;
      if (!ses) return;

      const totalMs = activeRunner.baseMs + (Number(msg.activeMs) || 0);
      ses.activeMs = Math.max(ses.activeMs || 0, totalMs);
      $('runTimerPill').textContent = fmtClock(ses.activeMs);

      if (msg.kind !== 'heartbeat') {
        ses.events = ses.events || [];
        ses.events.push({
          kind: msg.kind,
          taskId: msg.taskId,
          mode: msg.mode,
          level: msg.level,
          prompt: msg.prompt,
          answer: msg.answer,
          correct: msg.correct,
          assisted: !!msg.assisted,
          taskMs: msg.taskMs || 0,
          clientAt: msg.clientAt || new Date().toISOString()
        });
        if (msg.kind === 'attempt') {
          activeRunner.attempts++;
          if (msg.correct) activeRunner.correct++;
          $('runScorePill').textContent = \`\${activeRunner.correct}/\${activeRunner.attempts} aciertos\`;
        }
        $('runSavePill').textContent = 'Guardado ✓';
      }
      saveState();
    });

    // --- SESSION TASK BUILDER ---
    function buildTasksFromEvents(session) {
      const map = new Map(), order = [];
      for (const ev of (session.events || [])) {
        if (ev.kind === 'heartbeat' || ev.kind === 'end') continue;
        const key = ev.taskId || ('ev-' + order.length);
        if (!map.has(key)) {
          const item = { prompt: ev.prompt || 'Actividad', mode: ev.mode || '', level: ev.level || '', attempts: [], hints: 0, revealed: false, taskMs: 0 };
          map.set(key, item); order.push(item);
        }
        const item = map.get(key);
        if (ev.prompt && item.prompt === 'Actividad') item.prompt = ev.prompt;
        if (ev.level && !item.level) item.level = ev.level;
        if (ev.taskMs > item.taskMs) item.taskMs = ev.taskMs;
        if (ev.kind === 'attempt') item.attempts.push({ answer: ev.answer, correct: !!ev.correct, ms: ev.taskMs || 0 });
        else if (ev.kind === 'hint') item.hints++;
        else if (ev.kind === 'reveal') item.revealed = true;
      }
      return order;
    }

    function sessionCounts(s) {
      let att = 0, cor = 0, hints = 0;
      for (const ev of (s.events || [])) {
        if (ev.kind === 'attempt') { att++; if (ev.correct) cor++; }
        else if (ev.kind === 'hint') hints++;
      }
      return { att, cor, hints };
    }

    // --- TEACHER PANEL ---
    function openDocente() {
      showView('viewDocente');
      if (!db.config.pinEnabled || teacherUnlocked) {
        $('docLogin').hidden = true;
        $('docDash').hidden = false;
        renderDocente();
      } else {
        $('docDash').hidden = true;
        $('docLogin').hidden = false;
        $('docDefaultTip').hidden = !db.config.isDefaultPin;
        $('docLoginErr').hidden = true;
        $('docPinInput').value = '';
        $('docPinInput').focus();
      }
    }

    function showDocToast(msg) {
      $('docToast').textContent = msg;
      $('docToast').hidden = false;
      setTimeout(() => { if ($('docToast').textContent === msg) $('docToast').hidden = true; }, 3500);
    }

    function renderDocente() {
      document.querySelectorAll('.doc-tab').forEach(b => {
        const active = b.dataset.tab === currentDocTab;
        b.className = \`doc-tab px-4 py-2 rounded-full text-xs font-bold \${active ? 'bg-[var(--primary)] text-[var(--primary-foreground)]' : 'bg-[var(--card)] border border-[var(--border)] text-[var(--muted-foreground)]'}\`;
      });
      document.querySelectorAll('.doc-panel').forEach(p => { p.hidden = p.id !== \`docTab-\${currentDocTab}\`; });

      let totalAtt = 0, totalCor = 0, totalMs = 0;
      for (const s of db.sessions) {
        totalMs += s.activeMs || 0;
        const c = sessionCounts(s);
        totalAtt += c.att; totalCor += c.cor;
      }
      $('mSessions').textContent = db.sessions.length;
      $('mAttempts').textContent = totalAtt;
      $('mAccuracy').textContent = totalAtt ? \`\${Math.round((totalCor / totalAtt) * 100)}%\` : '—';
      $('mTime').textContent = fmtDur(totalMs);

      const prevSt = $('fStudent').value, prevApp = $('fApp').value;
      const names = [...new Set([...db.students.map(s => s.name), ...db.sessions.flatMap(s => s.students)])].sort();
      $('fStudent').innerHTML = '<option value="">Todos los alumnos</option>' + names.map(n => \`<option value="\${esc(n)}">\${esc(n)}</option>\`).join('');
      $('fStudent').value = prevSt;
      $('fApp').innerHTML = '<option value="">Todas las apps</option>' + db.apps.map(a => \`<option value="\${esc(a.id)}">\${esc(a.title)}</option>\`).join('');
      $('fApp').value = prevApp;

      const filtered = db.sessions.filter(s => (!prevSt || s.students.includes(prevSt)) && (!prevApp || s.app === prevApp));
      const tbody = $('docSessionsBody');
      tbody.replaceChildren();
      if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="py-8 text-center text-[var(--muted-foreground)]">Todavía no hay sesiones registradas. Abre cualquier app en modo «Trabajo en el aula» para empezar a registrar respuestas reales.</td></tr>';
      } else {
        for (const s of filtered) {
          const { att, cor, hints } = sessionCounts(s);
          const acc = att ? \`\${Math.round((cor / att) * 100)}% (\${cor}/\${att})\` : 'Sin intentos';
          const tr = document.createElement('tr');
          tr.className = 'border-b border-[var(--border)]';
          tr.innerHTML = \`
            <td class="py-2.5 pr-3 whitespace-nowrap">\${esc(new Date(s.createdAt).toLocaleString('es-ES', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }))}</td>
            <td class="py-2.5 pr-3 font-mono font-bold">\${esc(s.code)}</td>
            <td class="py-2.5 pr-3 font-semibold">\${esc(s.students.join(', '))}</td>
            <td class="py-2.5 pr-3">\${esc(s.appTitle)}</td>
            <td class="py-2.5 pr-3 font-mono">\${esc(acc)}\${hints ? \` · \${hints}p\` : ''}</td>
            <td class="py-2.5 pr-3 whitespace-nowrap">\${esc(fmtDur(s.activeMs))}</td>
            <td class="py-2.5 whitespace-nowrap flex gap-1.5">
              <button type="button" class="det-btn px-2.5 py-1 rounded-lg border border-[var(--border)] bg-[var(--background)] font-semibold">Detalle</button>
              <button type="button" class="del-btn px-2 py-1 rounded-lg border border-[var(--border)] text-[var(--error)] font-bold">×</button>
            </td>
          \`;
          tr.querySelector('.det-btn').onclick = () => openSessionDetail(s);
          tr.querySelector('.del-btn').onclick = () => {
            db.sessions = db.sessions.filter(x => x.id !== s.id);
            saveState(); renderDocente(); showDocToast('Sesión eliminada.');
          };
          tbody.append(tr);
        }
      }

      $('docStudentStats').replaceChildren();
      for (const st of db.students) {
        let ses = 0, att = 0, cor = 0;
        for (const s of db.sessions) if (s.students.includes(st.name)) {
          ses++;
          const c = sessionCounts(s); att += c.att; cor += c.cor;
        }
        const row = document.createElement('div');
        row.className = 'py-2.5 flex items-center justify-between gap-3';
        row.innerHTML = \`<div><strong>\${esc(st.name)}</strong> <span class="text-[var(--muted-foreground)]">\${esc(st.course)}</span></div><div class="font-mono text-[var(--muted-foreground)]">\${ses} ses. · \${att ? Math.round((cor / att) * 100) + '%' : '—'}</div>\`;
        $('docStudentStats').append(row);
      }

      $('docRosterList').replaceChildren();
      for (const st of db.students) {
        const row = document.createElement('div');
        row.className = 'px-3 py-2 flex items-center justify-between text-xs';
        row.innerHTML = \`<span><strong>\${esc(st.name)}</strong> <span class="text-[var(--muted-foreground)]">\${esc(st.course)}</span></span><button type="button" class="text-[var(--error)] font-semibold">Quitar</button>\`;
        row.querySelector('button').onclick = () => {
          db.students = db.students.filter(x => x.name !== st.name);
          saveState(); renderDocente(); showDocToast(\`Se quitó a \${st.name}.\`);
        };
        $('docRosterList').append(row);
      }

      $('docAppsList').replaceChildren();
      for (const app of db.apps) {
        const vis = app.visible !== false;
        const row = document.createElement('div');
        row.className = 'px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs';
        row.innerHTML = \`<div><strong>\${esc(app.title)}</strong> <span class="text-[var(--muted-foreground)]">· \${esc(app.area)}</span></div><div class="flex gap-1.5"><button type="button" class="vis-btn px-2.5 py-1 rounded-lg border border-[var(--border)] bg-[var(--background)] font-semibold">\${vis ? 'Ocultar' : 'Mostrar'}</button>\${app.builtIn ? '' : '<button type="button" class="rm-app px-2 py-1 rounded-lg text-[var(--error)] font-bold">×</button>'}</div>\`;
        row.querySelector('.vis-btn').onclick = () => { app.visible = !vis; saveState(); renderDocente(); showDocToast(\`\${app.title}: \${app.visible ? 'visible' : 'oculta'}.\`); };
        const rm = row.querySelector('.rm-app');
        if (rm) rm.onclick = () => { db.apps = db.apps.filter(x => x.id !== app.id); saveState(); renderDocente(); };
        $('docAppsList').append(row);
      }

      $('cfgName').value = db.config.aulaName;
      $('cfgSub').value = db.config.subtitle;
      $('cfgPinEnabled').checked = !!db.config.pinEnabled;
      $('cfgPin').value = '';
    }

    function openSessionDetail(s) {
      $('detailTitle').textContent = \`\${s.appTitle} · \${s.code}\`;
      $('detailSub').textContent = \`\${s.students.join(', ')} · \${fmtDur(s.activeMs)}\`;
      const tasks = buildTasksFromEvents(s);
      const c = $('detailContent');
      if (!tasks.length) {
        c.innerHTML = '<p class="text-xs text-[var(--muted-foreground)]">Esta sesión aún no tiene actividades registradas.</p>';
      } else {
        c.innerHTML = tasks.map((t, i) => \`
          <div class="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--background)] space-y-2 text-xs">
            <div class="font-bold">\${i + 1}. \${esc(t.prompt)}</div>
            <div class="text-[var(--muted-foreground)]">\${esc([t.mode, t.level].filter(Boolean).join(' · '))} · \${t.hints} pistas\${t.revealed ? ' · Solución revelada' : ''} · \${fmtDur(t.taskMs)}</div>
            <div class="space-y-1">
              \${t.attempts.length ? t.attempts.map(a => \`<div class="px-2.5 py-1 rounded-lg font-semibold" style="background:\${a.correct ? 'rgba(26,110,76,0.12)' : 'rgba(168,60,43,0.12)'};color:\${a.correct ? 'var(--success)' : 'var(--error)'};">\${a.correct ? '✓ Correcto' : '✗ Error'}: \${esc(a.answer || 'Sin texto')}</div>\`).join('') : '<div class="text-[var(--muted-foreground)]">Sin respuesta enviada.</div>'}
            </div>
          </div>\`).join('');
      }
      $('detailModal').hidden = false;
    }

    // --- Wiring ---
    $('brandBtn').onclick = () => { showView('viewPortal'); renderPortal(); };
    $('navDocenteBtn').onclick = openDocente;
    $('searchInput').oninput = renderPortal;
    $('clearSearchBtn').onclick = () => { $('searchInput').value = ''; renderPortal(); };
    $('clearFiltersBtn').onclick = () => { selectedArea = ''; onlyFavs = false; $('searchInput').value = ''; renderPortal(); };

    $('gateBackBtn').onclick = () => { showView('viewPortal'); renderPortal(); };
    $('gateFreeBtn').onclick = () => launchRealApp(currentGateApp, null);
    $('gateClassBtn').onclick = () => { $('gateStudentsPanel').hidden = false; renderGateStudents(); };
    $('gateRosterSearch').oninput = renderGateStudents;
    $('gateAddGuestBtn').onclick = () => {
      const name = $('gateGuestInput').value.trim();
      if (!name) return;
      if (!db.students.some(s => s.name.toLowerCase() === name.toLowerCase())) db.students.push({ name, course: 'Invitado' });
      gateSelected.add(name);
      $('gateGuestInput').value = '';
      saveState(); renderGateStudents();
    };
    $('gateStartHereBtn').onclick = () => {
      if (!gateSelected.size) { $('gateMsg').textContent = 'Selecciona al menos un alumno.'; $('gateMsg').hidden = false; return; }
      $('gateMsg').hidden = true;
      launchRealApp(currentGateApp, createClassroomSession([...gateSelected]));
    };
    $('gatePrepareQrBtn').onclick = () => {
      if (!gateSelected.size) { $('gateMsg').textContent = 'Selecciona al menos un alumno.'; $('gateMsg').hidden = false; return; }
      $('gateMsg').hidden = true;
      preparedSession = createClassroomSession([...gateSelected]);
      $('gatePreparedPanel').hidden = false;
      $('gatePreparedSub').textContent = \`Participantes: \${preparedSession.students.join(', ')}\`;
      $('gateShortCode').textContent = preparedSession.code;
      $('gateQrContainer').innerHTML = renderQrSvg(\`MI-AULA:\${preparedSession.code}\`, 152);
    };
    $('gateCopyCodeBtn').onclick = () => {
      if (preparedSession) navigator.clipboard?.writeText(preparedSession.code).catch(() => {});
      $('gateCopyCodeBtn').textContent = '¡Código copiado!';
      setTimeout(() => { $('gateCopyCodeBtn').textContent = 'Copiar código'; }, 1800);
    };
    $('gateLaunchPreparedBtn').onclick = () => { if (preparedSession) launchRealApp(currentGateApp, preparedSession); };

    $('runBackPortal').onclick = () => { showView('viewPortal'); renderPortal(); };
    $('runFsBtn').onclick = () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
      else document.exitFullscreen?.().catch(() => {});
    };
    $('runEndBtn').onclick = () => {
      const appId = activeRunner?.app?.id;
      if (activeRunner?.session) { activeRunner.session.endedAt = new Date().toISOString(); saveState(); }
      if (appId) openGate(appId);
      else { showView('viewPortal'); renderPortal(); }
    };

    $('navCodeBtn').onclick = () => { $('codeModalErr').hidden = true; $('codeModalInput').value = ''; $('codeModal').hidden = false; $('codeModalInput').focus(); };
    $('closeCodeModal').onclick = () => { $('codeModal').hidden = true; };
    $('codeModalForm').onsubmit = e => {
      e.preventDefault();
      const raw = $('codeModalInput').value.trim().toUpperCase().replace(/\\s+/g, '');
      const normCode = raw.includes('-') ? raw : (raw.length === 6 ? \`\${raw.slice(0,3)}-\${raw.slice(3)}\` : raw);
      const ses = db.sessions.find(s => s.code === normCode);
      if (!ses) {
        $('codeModalErr').textContent = 'No encontramos ese código. Crea primero una sesión en «Trabajo en el aula».';
        $('codeModalErr').hidden = false;
        return;
      }
      const app = db.apps.find(a => a.id === ses.app);
      $('codeModal').hidden = true;
      if (app) launchRealApp(app, ses);
    };

    $('docLoginForm').onsubmit = e => {
      e.preventDefault();
      if ($('docPinInput').value.trim() === db.config.pin) { teacherUnlocked = true; openDocente(); }
      else { $('docLoginErr').textContent = 'PIN incorrecto.'; $('docLoginErr').hidden = false; }
    };
    $('docLogout').onclick = () => { teacherUnlocked = false; openDocente(); };
    document.querySelectorAll('.doc-tab').forEach(b => { b.onclick = () => { currentDocTab = b.dataset.tab; renderDocente(); }; });
    $('fStudent').onchange = renderDocente;
    $('fApp').onchange = renderDocente;
    $('closeDetailModal').onclick = () => { $('detailModal').hidden = true; };

    $('docAddStudentForm').onsubmit = e => {
      e.preventDefault();
      const name = $('docNewStName').value.trim();
      if (!name) return;
      db.students.push({ name, course: $('docNewStCourse').value });
      $('docNewStName').value = '';
      saveState(); renderDocente(); showDocToast(\`\${name} añadido a la lista.\`);
    };

    function parseBulk(txt) {
      return txt.split(/\\r?\\n/).map(l => l.trim()).filter(Boolean).map(l => {
        const [n, c] = l.split(/[,;\\t]/);
        return { name: (n || '').trim(), course: (c || '').trim() };
      }).filter(x => x.name);
    }
    $('docBulkAdd').onclick = () => {
      const items = parseBulk($('docBulkText').value);
      if (!items.length) return;
      db.students.push(...items); $('docBulkText').value = '';
      saveState(); renderDocente(); showDocToast(\`Se añadieron \${items.length} alumnos.\`);
    };
    $('docBulkReplace').onclick = () => {
      const items = parseBulk($('docBulkText').value);
      if (!items.length) return;
      db.students = items; $('docBulkText').value = '';
      saveState(); renderDocente(); showDocToast(\`Lista reemplazada (\${items.length} alumnos).\`);
    };

    $('docAddAppForm').onsubmit = e => {
      e.preventDefault();
      const title = $('cAppTitle').value.trim();
      if (!title) return;
      db.apps.push({
        id: 'custom-' + Date.now().toString(36),
        title,
        area: $('cAppArea').value.trim() || 'Otras áreas',
        cycle: $('cAppCycle').value.trim() || '2.º ciclo',
        unit: '',
        externalUrl: $('cAppUrl').value.trim() || '',
        description: $('cAppDesc').value.trim() || 'Recurso añadido desde el panel docente.',
        cover: 'custom',
        visible: true,
        builtIn: false
      });
      $('docAddAppForm').reset();
      $('cAppArea').value = 'Lengua'; $('cAppCycle').value = '2.º ciclo';
      saveState(); renderDocente(); showDocToast(\`«\${title}» añadida al portal.\`);
    };

    $('docCfgForm').onsubmit = e => {
      e.preventDefault();
      db.config.aulaName = $('cfgName').value.trim() || 'Mi aula';
      db.config.subtitle = $('cfgSub').value.trim();
      db.config.pinEnabled = $('cfgPinEnabled').checked;
      const np = $('cfgPin').value.trim();
      if (np.length >= 4) { db.config.pin = np; db.config.isDefaultPin = false; }
      saveState(); syncHeader(); renderDocente(); showDocToast('Ajustes guardados.');
    };

    $('docExportCsv').onclick = () => {
      const rows = ['Fecha;Codigo;Participantes;Aplicacion;Modo;Nivel;Actividad;Respuesta;Acierto'];
      for (const s of db.sessions) {
        for (const ev of (s.events || [])) {
          if (ev.kind !== 'attempt' && ev.kind !== 'reveal') continue;
          rows.push([
            ev.clientAt || s.createdAt, s.code, s.students.join(' + '), s.appTitle,
            ev.mode, ev.level, ev.prompt,
            ev.kind === 'reveal' ? '[Solución revelada]' : ev.answer,
            ev.kind === 'reveal' ? 'Revelado' : (ev.correct ? 'Sí' : 'No')
          ].map(v => \`"\${String(v ?? '').replace(/"/g, '""')}"\`).join(';'));
        }
      }
      const blob = new Blob(['\\uFEFF' + rows.join('\\r\\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'mi-aula-resultados.csv'; a.click();
      URL.revokeObjectURL(url);
      showDocToast('CSV descargado.');
    };

    renderPortal();
  })();
  </script>
</body>
</html>`;

for (const out of OUT_PATHS) {
  fs.writeFileSync(out, finalHtml, 'utf8');
  console.log(`Wrote ${out} (${(Buffer.byteLength(finalHtml, 'utf8') / 1024).toFixed(1)} KB)`);
}
