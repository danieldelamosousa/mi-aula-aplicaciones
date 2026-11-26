'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const os = require('os');
const { spawn, execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
let passed = 0;

function test(name, fn) {
  return { name, fn };
}

async function runTests() {
  const core = await import('../functions/_lib/core.mjs');
  const suites = [];

  // 1. JS syntax checks
  suites.push(test('JS syntax check (server, build-standalone, public scripts)', () => {
    const files = [
      'server.js',
      'build-standalone.js',
      'public/registro.js',
      'public/sw.js',
      'public/scripts/portal.js',
      'public/scripts/gate.js',
      'public/scripts/docente.js',
      'public/scripts/qrcode.js',
      'public/apps/ortografia/app.js',
      'public/apps/ortografia/data.js'
    ];
    for (const rel of files) {
      execFileSync(process.execPath, ['--check', path.join(ROOT, rel)], { stdio: 'pipe' });
    }
  }));

  // 2. ESM modules load cleanly
  suites.push(test('Cloudflare Functions ESM modules import cleanly', async () => {
    await import('../functions/_lib/core.mjs');
    await import('../functions/_lib/db.js');
    await import('../functions/api/[[route]].js');
    await import('../functions/codigo/[code].js');
  }));

  // 3. Inline <script> syntax + registro.js + DUA hooks across all built-in apps
  suites.push(test('All built-in apps exist, parse cleanly, wire registro.js & data-aula-read, and are precached in sw.js', () => {
    const swText = fs.readFileSync(path.join(ROOT, 'public/sw.js'), 'utf8');
    const standaloneText = fs.readFileSync(path.join(ROOT, 'build-standalone.js'), 'utf8');

    assert.ok(core.BUILT_IN_APPS.length >= 10, 'Expected at least 10 built-in apps');

    for (const app of core.BUILT_IN_APPS) {
      const htmlPath = path.join(ROOT, 'public/apps', app.id, 'index.html');
      assert.ok(fs.existsSync(htmlPath), `Missing app HTML: ${htmlPath}`);
      const html = fs.readFileSync(htmlPath, 'utf8');

      assert.ok(
        html.includes('/registro.js'),
        `App ${app.id} missing /registro.js script`
      );
      assert.ok(
        html.includes('data-aula-read'),
        `App ${app.id} missing data-aula-read for DUA TTS`
      );
      if (app.id === 'taller-problemas' || app.id === 'clases-palabras') {
        assert.ok(html.includes('Aula.begin('), `App ${app.id} missing Aula.begin(...)`);
        assert.ok(html.includes('Aula.attempt('), `App ${app.id} missing Aula.attempt(...)`);
      }
      assert.ok(
        swText.includes(`/apps/${app.id}/`),
        `App ${app.id} not precached in public/sw.js`
      );
      assert.ok(
        standaloneText.includes(`'${app.id}'`),
        `App ${app.id} missing from build-standalone.js APP_IDS`
      );

      // Parse every inline <script> block with vm.Script
      const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
      let match;
      let scriptCount = 0;
      while ((match = re.exec(html)) !== null) {
        scriptCount++;
        new vm.Script(match[1], { filename: `${app.id}#script-${scriptCount}` });
      }
    }
  }));

  // 4. Stress-test procedural problem generator in taller-problemas (45 templates x 50 runs = 2,250 instances)
  suites.push(test('Taller de problemas procedural generator + false options + distinct colors (45 templates × 50 runs = 2,250 problems)', () => {
    const html = fs.readFileSync(path.join(ROOT, 'public/apps/taller-problemas/index.html'), 'utf8');
    // Distinct colors for Nivel inicial (blue) vs 3.º (green) vs 4.º (amber)
    assert.ok(html.includes('body[data-level="inicial"]'), 'Missing dedicated Nivel inicial color theme');
    const iniAccent = html.match(/body\[data-level="inicial"\][\s\S]*?--accent:\s*(#[0-9a-f]+)/i);
    const g3Accent = html.match(/body\[data-level="3"\][\s\S]*?--accent:\s*(#[0-9a-f]+)/i);
    const g4Accent = html.match(/body\[data-level="4"\][\s\S]*?--accent:\s*(#[0-9a-f]+)/i);
    assert.ok(iniAccent && g3Accent && g4Accent, 'All 3 levels must define --accent');
    assert.notStrictEqual(iniAccent[1], g3Accent[1], 'Nivel inicial and 3.º must have distinct accent colors');
    assert.notStrictEqual(g3Accent[1], g4Accent[1], '3.º and 4.º must have distinct accent colors');

    const startIdx = html.indexOf('const NAMES =');
    const endIdx = html.indexOf('const LEVEL_LABELS =');
    assert.ok(startIdx > 0 && endIdx > startIdx, 'Could not locate PROBLEM_GENERATORS block');
    const shuffleDef = 'function shuffle(arr){const c=[...arr];for(let i=c.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[c[i],c[j]]=[c[j],c[i]];}return c;}\n';
    const snippet = shuffleDef + html.slice(startIdx, endIdx) + '\n({ PROBLEM_GENERATORS, enrichChips });';
    const { PROBLEM_GENERATORS: generators, enrichChips } = vm.runInNewContext(snippet);

    let totalGenerated = 0;
    let totalTemplates = 0;
    let hardTemplates = 0;
    for (const [lvl, fns] of Object.entries(generators)) {
      assert.ok(fns.length >= 12, `Level ${lvl} should have at least 12 templates`);
      totalTemplates += fns.length;

      for (const fn of fns) {
        const distinctAnswers = new Set();
        let isHard = false;
        for (let run = 0; run < 50; run++) {
          const p = enrichChips(fn(), lvl);
          if (p.hard) isHard = true;
          totalGenerated++;
          assert.ok(Number.isInteger(p.answer) && p.answer > 0, `${p.id} answer must be positive integer, got ${p.answer}`);
          assert.ok(p.chips.some(c => c.useful), `${p.id} must have useful chips`);
          assert.ok(p.chips.some(c => !c.useful && c.invented), `${p.id} must include at least 1 invented false chip`);
          if (lvl !== 'inicial') {
            assert.ok(p.chips.filter(c => !c.useful).length >= 2, `${p.id} in ${lvl} should have at least 2 false/useless chips`);
          }
          assert.ok(p.opOptions.some(o => o.val === p.op), `${p.id} op ${p.op} must exist in opOptions`);
          assert.ok(p.unitOptions.includes(p.unitCorrect), `${p.id} unitCorrect must exist in unitOptions`);
          assert.strictEqual(new Set(p.unitOptions).size, p.unitOptions.length, `${p.id} unitOptions must be unique`);
          assert.strictEqual(p.steps[p.steps.length - 1].ans, p.answer, `${p.id} last step ans must match answer`);

          for (const st of p.steps) {
            const jsExpr = st.expr
              .replace(/=/g, '')
              .replace(/×/g, '*')
              .replace(/÷/g, '/')
              .replace(/−/g, '-')
              .trim();
            const computed = vm.runInNewContext(jsExpr);
            assert.strictEqual(computed, st.ans, `${p.id} step "${st.expr}" computed ${computed} !== ${st.ans}`);
            assert.ok(Number.isInteger(computed) && computed > 0, `${p.id} step result must be positive integer`);
          }

          // Nivel inicial: verify no-carry / no-borrow on 2-digit + and −
          if (lvl === 'inicial' && (p.op === '+' || p.op === '−')) {
            const m = p.steps[0].expr.match(/(\d+)\s*([+−])\s*(\d+)/);
            if (m) {
              const a = Number(m[1]), b = Number(m[3]);
              if (m[2] === '+') {
                assert.ok((a % 10) + (b % 10) <= 9, `${p.id} inicial carry in ${a}+${b}`);
              } else {
                assert.ok((a % 10) >= (b % 10), `${p.id} inicial borrow in ${a}-${b}`);
              }
            }
          }
          distinctAnswers.add(p.answer);
        }
        if (isHard) hardTemplates++;
        assert.ok(distinctAnswers.size >= 3, `Template in ${lvl} should produce varied answers across runs`);
      }
    }
    assert.strictEqual(totalTemplates, 45, 'Expected 45 problem templates');
    assert.strictEqual(hardTemplates, 5, 'Expected 5 hard distractor templates');
    assert.strictEqual(totalGenerated, 2250, 'Expected 2,250 verified generated problems');
  }));

  // 5. Unit tests for core.mjs analytics, pagination & student report
  suites.push(test('core.mjs aggregateDashboard pagination + metrics + weakSpots', () => {
    const now = Date.now();
    const summaries = [];
    for (let i = 0; i < 65; i++) {
      summaries.push({
        token: `tok-${i}`,
        code: `AAA-${100 + i}`,
        app: i % 2 === 0 ? 'ortografia' : 'taller-problemas',
        appTitle: i % 2 === 0 ? 'Taller de ortografía' : 'Taller de problemas paso a paso',
        students: [i % 2 === 0 ? 'Lucía G.' : 'Mateo R.'],
        status: i === 0 ? 'activa' : 'finalizada',
        createdAt: new Date(now - i * 3600 * 1000).toISOString(),
        lastActivityAt: new Date(now - i * 1000).toISOString(),
        attempts: 4,
        correct: i === 0 ? 1 : 3,
        accuracy: i === 0 ? 25 : 75,
        hints: i === 0 ? 3 : 0,
        reveals: 0,
        activeMs: 60000
      });
    }

    const res = core.aggregateDashboard({
      summaries,
      students: [{ name: 'Lucía G.', course: '3.º' }, { name: 'Mateo R.', course: '3.º' }],
      weakRows: [
        { app: 'ortografia', appTitle: 'Taller de ortografía', mode: 'Tildes', level: '3.º', attempts: 5, correct: 2 },
        { app: 'taller-problemas', appTitle: 'Taller de problemas paso a paso', mode: 'Paso a paso', level: '4.º', attempts: 4, correct: 4 },
        { app: 'clases-palabras', appTitle: 'Clases de palabras y oraciones', mode: 'Detecta', level: '3.º', attempts: 2, correct: 0 }
      ],
      page: 2,
      pageSize: 25,
      filters: {},
      nowMs: now
    });

    assert.strictEqual(res.metrics.totalSessions, 65);
    assert.strictEqual(res.metrics.activeSessions, 1);
    assert.strictEqual(res.sessions.length, 25);
    assert.strictEqual(res.pagination.page, 2);
    assert.strictEqual(res.pagination.totalPages, 3);
    assert.strictEqual(res.pagination.startIndex, 26);
    assert.strictEqual(res.pagination.endIndex, 50);
    assert.strictEqual(res.pagination.hasPrev, true);
    assert.strictEqual(res.pagination.hasNext, true);
    assert.strictEqual(res.liveSessions.length, 1);
    assert.strictEqual(res.liveSessions[0].needsAttention, true);
    assert.strictEqual(res.weakSpots.length, 1);
    assert.strictEqual(res.weakSpots[0].accuracy, 40);
  }));

  suites.push(test('core.mjs buildStudentReport computes weekly evolution, trend, strengths & toReinforce', () => {
    const w1 = new Date('2026-10-05T10:00:00Z').toISOString();
    const w2 = new Date('2026-10-19T10:00:00Z').toISOString();
    const summaries = [
      { token: 'a', app: 'taller-problemas', appTitle: 'Taller de problemas paso a paso', students: ['Lucía G.'], createdAt: w1, attempts: 4, correct: 2, accuracy: 50, hints: 2, reveals: 0, activeMs: 120000 },
      { token: 'b', app: 'clases-palabras', appTitle: 'Clases de palabras y oraciones', students: ['Lucía G.'], createdAt: w2, attempts: 4, correct: 4, accuracy: 100, hints: 0, reveals: 0, activeMs: 180000 }
    ];
    const attemptEvents = [
      { app: 'taller-problemas', appTitle: 'Taller de problemas paso a paso', mode: 'Paso a paso', level: '3.º', correct: false },
      { app: 'taller-problemas', appTitle: 'Taller de problemas paso a paso', mode: 'Paso a paso', level: '3.º', correct: false },
      { app: 'taller-problemas', appTitle: 'Taller de problemas paso a paso', mode: 'Paso a paso', level: '3.º', correct: true },
      { app: 'clases-palabras', appTitle: 'Clases de palabras y oraciones', mode: 'Detecta', level: '3.º', correct: true },
      { app: 'clases-palabras', appTitle: 'Clases de palabras y oraciones', mode: 'Detecta', level: '3.º', correct: true }
    ];

    const report = core.buildStudentReport({
      studentName: 'Lucía G.',
      studentCourse: '3.º',
      summaries,
      attemptEvents,
      apps: core.BUILT_IN_APPS,
      range: 'all'
    });

    assert.strictEqual(report.overview.sessions, 2);
    assert.strictEqual(report.overview.accuracy, 75);
    assert.strictEqual(report.timeline.length, 2);
    assert.strictEqual(report.trendDelta, 50);
    assert.strictEqual(report.strengths.length, 1);
    assert.strictEqual(report.toReinforce.length, 1);
    assert.strictEqual(report.byApp.length, 2);
  }));

  // 6. End-to-end HTTP integration test against server.js
  suites.push(test('End-to-end HTTP test (10 apps, batch QR, events, paginated dashboard, student-report)', async () => {
    const port = 34000 + Math.floor(Math.random() * 10000);
    const tmpDb = path.join(os.tmpdir(), `mi-aula-test-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
    const base = `http://127.0.0.1:${port}`;

    const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
      env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', AULA_DB_PATH: tmpDb },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    try {
      // Wait for server ready
      let ready = false;
      for (let i = 0; i < 40; i++) {
        try {
          const r = await fetch(`${base}/api/apps`);
          if (r.ok) { ready = true; break; }
        } catch {}
        await new Promise(r => setTimeout(r, 120));
      }
      assert.ok(ready, 'Test server did not start in time');

      // Check core pages & all 10 built-in apps return 200
      const pages = ['/', '/abrir', '/docente', '/sw.js', '/registro.js', ...core.BUILT_IN_APPS.map(a => `/apps/${a.id}/`)];
      for (const p of pages) {
        const r = await fetch(`${base}${p}`);
        assert.strictEqual(r.status, 200, `Expected HTTP 200 for ${p}, got ${r.status}`);
      }

      const appsResp = await (await fetch(`${base}/api/apps`)).json();
      assert.strictEqual(appsResp.apps.length, core.BUILT_IN_APPS.length);

      // Batch session creation for the two new apps
      const batchRes = await fetch(`${base}/api/sessions/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app: 'taller-problemas', groups: [['Lucía G.'], ['Mateo R.']] })
      });
      assert.strictEqual(batchRes.status, 201);
      const batchData = await batchRes.json();
      assert.strictEqual(batchData.sessions.length, 2);

      // Record events for Lucía G.
      const evRes = await fetch(`${base}/api/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: batchData.sessions[0].token,
          events: [
            { id: 'e1', kind: 'attempt', taskId: 't1', mode: 'Paso a paso', level: '3.º Primaria', prompt: 'P1', answer: '415', correct: true, activeMs: 30000 },
            { id: 'e2', kind: 'attempt', taskId: 't2', mode: 'Paso a paso', level: '3.º Primaria', prompt: 'P2', answer: '166', correct: true, activeMs: 60000 },
            { id: 'e3', kind: 'attempt', taskId: 't3', mode: 'Paso a paso', level: '3.º Primaria', prompt: 'P3', answer: '50', correct: false, activeMs: 90000 }
          ]
        })
      });
      assert.strictEqual(evRes.status, 200);

      // Teacher login
      const loginRes = await fetch(`${base}/api/teacher/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: '1234' })
      });
      assert.strictEqual(loginRes.status, 200);
      const cookie = loginRes.headers.get('set-cookie').split(';')[0];

      // Paginated dashboard
      const dashRes = await fetch(`${base}/api/teacher/dashboard?page=1&pageSize=10`, { headers: { Cookie: cookie } });
      assert.strictEqual(dashRes.status, 200);
      const dash = await dashRes.json();
      assert.strictEqual(dash.metrics.totalSessions, 2);
      assert.strictEqual(dash.pagination.page, 1);
      assert.strictEqual(dash.pagination.totalItems, 2);
      assert.strictEqual(dash.weakSpots.length, 1);

      // Individual student report
      const repRes = await fetch(`${base}/api/teacher/student-report?student=${encodeURIComponent('Lucía G.')}`, {
        headers: { Cookie: cookie }
      });
      assert.strictEqual(repRes.status, 200);
      const rep = await repRes.json();
      assert.strictEqual(rep.student.name, 'Lucía G.');
      assert.strictEqual(rep.overview.sessions, 1);
      assert.strictEqual(rep.overview.attempts, 3);
      assert.strictEqual(rep.overview.correct, 2);
      assert.strictEqual(rep.toReinforce.length, 1);
      assert.strictEqual(rep.timeline.length, 1);
    } finally {
      child.kill('SIGTERM');
      try { fs.unlinkSync(tmpDb); } catch {}
      try { fs.unlinkSync(`${tmpDb}.tmp`); } catch {}
    }
  }));

  for (const s of suites) {
    try {
      await s.fn();
      passed++;
      console.log(`✓ ${s.name}`);
    } catch (err) {
      console.error(`✗ ${s.name}`);
      console.error(err);
      process.exitCode = 1;
    }
  }

  console.log(`\n${passed}/${suites.length} pruebas superadas.`);
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
