'use strict';

const express = require('express');
const zlib = require('node:zlib');

const app = express();
const MAX_FAILURES = 200;

// ---------------------------------------------------------------------------
// In-memory circular buffer
// ---------------------------------------------------------------------------
const failures = [];

function storeFailure(payload) {
  failures.unshift({ id: Date.now().toString(), payload });
  if (failures.length > MAX_FAILURES) failures.pop();
}

// ---------------------------------------------------------------------------
// Ingest endpoint — accepts Gzip-compressed JSON
// ---------------------------------------------------------------------------
app.post('/api/ingest', (req, res, next) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const buffer = Buffer.concat(chunks);
    try {
      const raw = req.headers['content-encoding'] === 'gzip'
        ? zlib.gunzipSync(buffer)
        : buffer;
      req.body = JSON.parse(raw.toString('utf8'));
      next();
    } catch (e) {
      res.status(400).json({ error: 'decompression/parse failed', detail: e.message });
    }
  });
  req.on('error', (e) => res.status(500).json({ error: e.message }));
}, (req, res) => {
  if (req.body) {
    storeFailure(req.body);
    console.log(`[INGEST] ${req.body.testName} — ${req.body.status}`);
  }
  res.status(200).json({ success: true });
});

// ---------------------------------------------------------------------------
// API — retrieve stored failures
// ---------------------------------------------------------------------------
app.get('/api/failures', (_req, res) => res.json(failures));

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
app.get('/', (_req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Failure Hub — Forensic Dashboard</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background-color:#0f172a; color:#f8fafc; font-family:ui-sans-serif,system-ui,sans-serif; }
    .glass { background:rgba(30,41,59,.7); backdrop-filter:blur(12px); border:1px solid rgba(255,255,255,.1); }
    ::-webkit-scrollbar { width:8px; height:8px; }
    ::-webkit-scrollbar-track { background:rgba(15,23,42,.5); border-radius:4px; }
    ::-webkit-scrollbar-thumb { background:rgba(51,65,85,.8); border-radius:4px; }
    ::-webkit-scrollbar-thumb:hover { background:rgba(71,85,105,1); }
    .highlight-line { background:rgba(225,29,72,.3); border-left:3px solid #e11d48; display:block; width:100%; }
  </style>
</head>
<body class="p-8 min-h-screen">
  <div class="max-w-6xl mx-auto">
    <header class="mb-10 flex flex-col md:flex-row items-start md:items-center justify-between border-b border-slate-800 pb-6 gap-4">
      <div>
        <h1 class="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-rose-400 via-fuchsia-400 to-indigo-400">Failure Hub</h1>
        <p class="text-slate-400 mt-2 text-sm font-medium">Forensic Observability Dashboard</p>
      </div>
      <div class="animate-pulse flex items-center text-sm font-semibold text-emerald-400 bg-emerald-400/10 px-4 py-2 rounded-full border border-emerald-400/20">
        <span class="w-2.5 h-2.5 rounded-full bg-emerald-400 mr-2"></span> Listening on :3000
      </div>
    </header>
    <div id="gallery" class="space-y-8 pb-20"></div>
  </div>

  <script>
    function filterLogs(id) {
      const term = document.getElementById('search-' + id).value.toLowerCase();
      document.querySelectorAll('#logs-' + id + ' .log-line').forEach(line => {
        line.style.display = line.textContent.toLowerCase().includes(term) ? 'block' : 'none';
      });
    }

    function esc(str) {
      return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    function buildCard(f) {
      const p = f.payload;
      const errorMsg = esc(p.error || 'No error message');

      // --- Source code panel ---
      let sourceHtml = '';
      if (p.sourceCode) {
        const lines = p.sourceCode.split('\\n');
        const target = (p.line || 1) - 1;
        const highlighted = lines.map((l, i) =>
          i === target
            ? '<span class="highlight-line">' + esc(l) + '</span>'
            : '<span>' + esc(l) + '</span><br/>'
        ).join('');
        sourceHtml = \`
          <div class="mb-6">
            <h3 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Source Code</h3>
            <div class="bg-[#0a0f18] rounded-xl border border-slate-700/80 overflow-hidden">
              <div class="bg-slate-800/80 px-4 py-2 border-b border-slate-700/80 text-xs text-slate-400 font-mono">\${esc(p.file)}:\${p.line||'?'}</div>
              <div class="p-4 overflow-x-auto max-h-[400px]"><pre class="text-xs text-slate-300 font-mono leading-relaxed">\${highlighted}</pre></div>
            </div>
          </div>\`;
      }

      // --- Logs panel ---
      let logHtml = '';
      if (p.logs) {
        const lines = p.logs.split('\\n').map(l => '<div class="log-line">' + esc(l) + '</div>').join('');
        logHtml = \`
          <div class="flex-1 flex flex-col">
            <h3 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
              Browser Logs
              <input type="text" id="search-\${f.id}" onkeyup="filterLogs('\${f.id}')" placeholder="Search…" class="bg-slate-800 text-[10px] px-2 py-1 rounded border border-slate-600 outline-none text-slate-300">
            </h3>
            <div class="bg-[#0a0f18] rounded-xl border border-slate-700/80 overflow-hidden flex-1">
              <div class="p-4 overflow-y-auto max-h-[300px]" id="logs-\${f.id}">
                <pre class="text-[11px] text-emerald-400/90 font-mono whitespace-pre-wrap">\${lines}</pre>
              </div>
            </div>
          </div>\`;
      }

      // --- DOM panel ---
      let domPanel = '';
      if (p.domHtml) {
        const encoded = p.domHtml.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
        domPanel = \`
          <div class="mt-6">
            <h3 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Forensic DOM Structure</h3>
            <div class="bg-[#0a0f18] rounded-xl border border-slate-700/80 overflow-hidden h-[400px]">
              <iframe srcdoc="\${encoded}" class="w-full h-full border-none bg-white"></iframe>
            </div>
          </div>\`;
      }

      // --- Tags ---
      let tagsHtml = '';
      if (p.tags && p.tags.length) {
        const pills = p.tags.map(t => \`<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">\${esc(t)}</span>\`).join(' ');
        tagsHtml = \`<div class="flex flex-wrap gap-1 mt-2">\${pills}</div>\`;
      }

      // --- Env context ---
      let envBadge = '';
      if (p.envContext) {
        envBadge = \`<span class="text-[10px] text-slate-500 font-mono">\${esc(p.envContext.os)} / \${esc(p.envContext.arch)} — \${esc(p.envContext.ciProvider)}</span>\`;
      }

      // --- Storage keys ---
      let storageHtml = '';
      if (p.storageKeys) {
        const ls = (p.storageKeys.localStorage || []).map(k => esc(k)).join(', ') || 'empty';
        const ss = (p.storageKeys.sessionStorage || []).map(k => esc(k)).join(', ') || 'empty';
        storageHtml = \`
          <div class="mt-4 text-xs text-slate-400 font-mono bg-slate-900/50 rounded-lg px-4 py-3 border border-slate-700/40">
            <span class="text-slate-500">localStorage keys:</span> \${ls}<br/>
            <span class="text-slate-500">sessionStorage keys:</span> \${ss}
          </div>\`;
      }

      return \`
        <div class="glass rounded-2xl overflow-hidden shadow-2xl">
          <div class="bg-slate-800/60 px-6 py-4 border-b border-slate-700/50 flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
            <div class="flex-1 min-w-0 pr-4">
              <div class="flex items-center space-x-3 mb-1">
                <span class="px-2.5 py-0.5 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[11px] font-black uppercase">\${esc(p.status)}</span>
                <h2 class="text-xl font-bold text-white truncate">\${esc(p.testName)}</h2>
              </div>
              <div class="text-xs text-slate-400 font-mono truncate">\${esc(p.file || 'unknown')}</div>
              \${tagsHtml}
              \${envBadge}
            </div>
            <div class="text-xs font-medium text-slate-500 bg-slate-900/50 px-3 py-1.5 rounded-lg border border-slate-700/50 flex flex-col items-end gap-1 flex-shrink-0">
              <span>\${p.timestamp ? new Date(p.timestamp).toLocaleString() : ''}</span>
              <span class="text-indigo-400 font-mono">\${esc(p.browserName||'')} \${p.viewport ? '(' + esc(p.viewport) + ')' : ''}</span>
            </div>
          </div>
          <div class="p-6">
            <div class="bg-rose-950/30 border-l-[3px] border-rose-500 p-4 rounded-r-xl mb-6 text-sm font-mono text-rose-200 overflow-x-auto">\${errorMsg}</div>
            \${sourceHtml}
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                \${p.screenshotBase64
                  ? '<img src="data:image/png;base64,' + p.screenshotBase64 + '" class="w-full rounded-xl border border-slate-700" alt="Screenshot">'
                  : '<div class="h-[250px] rounded-xl border border-dashed border-slate-700/60 bg-slate-900/20 flex items-center justify-center text-slate-500 text-sm">No screenshot captured</div>'}
              </div>
              <div class="flex flex-col">\${logHtml}</div>
            </div>
            \${storageHtml}
            \${domPanel}
          </div>
        </div>\`;
    }

    async function fetchFailures() {
      try {
        const res = await fetch('/api/failures');
        const data = await res.json();
        const gallery = document.getElementById('gallery');
        if (!data.length) {
          gallery.innerHTML = '<div class="text-center py-32"><div class="text-6xl mb-6">🔭</div><div class="text-xl text-slate-300 font-medium">Waiting for test failures…</div><p class="text-slate-500 mt-2">Run your test suite to see forensic reports appear here.</p></div>';
          return;
        }
        gallery.innerHTML = data.map(buildCard).join('');
      } catch (err) {
        console.error('Dashboard fetch error:', err);
      }
    }

    fetchFailures();
    setInterval(fetchFailures, 5000);
  </script>
</body>
</html>`);
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(3000, () => {
  console.log('✨ Failure Hub Dashboard running on http://localhost:3000');
});