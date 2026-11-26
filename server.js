// Folio — editor LaTeX local (sin dependencias externas de Node)
// Ejecuta: node server.js   y abre http://localhost:3210
'use strict';
const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const os = require('os');

const PORT = Number(process.env.PORT) || 3210;
const HOST = '127.0.0.1'; // solo accesible desde tu PC
const ROOT = __dirname;
const PROJECTS = path.join(ROOT, 'projects');
const PUBLIC = path.join(ROOT, 'public');
const OUT = '.out';
const META = '.texlocal.json';
const COMPILE_TIMEOUT_MS = 180000;

fs.mkdirSync(PROJECTS, { recursive: true });

// ---------- Detección de motores LaTeX ----------
const EXTRA_BIN_DIRS = (() => {
  const dirs = [];
  const la = process.env.LOCALAPPDATA || '';
  const pf = process.env.ProgramFiles || 'C:\\Program Files';
  dirs.push(path.join(la, 'Programs', 'MiKTeX', 'miktex', 'bin', 'x64'));
  dirs.push(path.join(pf, 'MiKTeX', 'miktex', 'bin', 'x64'));
  try {
    for (const y of fs.readdirSync('C:\\texlive').sort().reverse()) {
      dirs.push(path.join('C:\\texlive', y, 'bin', 'windows'));
      dirs.push(path.join('C:\\texlive', y, 'bin', 'win64'));
      dirs.push(path.join('C:\\texlive', y, 'bin', 'win32'));
    }
  } catch {}
  dirs.push(path.join(ROOT, 'bin')); // p.ej. tectonic.exe portable
  return dirs.filter(d => { try { return fs.statSync(d).isDirectory(); } catch { return false; } });
})();
const ENV = { ...process.env, PATH: [process.env.PATH || '', ...EXTRA_BIN_DIRS].join(path.delimiter) };

function which(cmd) {
  const isWin = process.platform === 'win32';
  const r = spawnSync(isWin ? 'where' : 'which', [cmd], { env: ENV, encoding: 'utf8' });
  if (r.status === 0 && r.stdout.trim()) return r.stdout.trim().split(/\r?\n/)[0];
  return null;
}
let ENGINES = {};
function detectEngines() {
  ENGINES = {};
  for (const e of ['pdflatex', 'xelatex', 'lualatex', 'tectonic', 'bibtex', 'biber', 'makeindex', 'makeglossaries', 'synctex']) {
    const p = which(e);
    if (p) ENGINES[e] = p;
  }
  return ENGINES;
}
detectEngines();

// ---------- Utilidades ----------
function safeName(name) {
  return String(name || '').trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 100);
}
function projectDir(p) {
  const name = safeName(decodeURIComponent(p));
  if (!name || name.startsWith('.')) throw httpErr(400, 'Nombre de proyecto inválido');
  return path.join(PROJECTS, name);
}
function resolveIn(base, rel) {
  const target = path.resolve(base, String(rel || '').replace(/^[/\\]+/, ''));
  if (target !== base && !target.startsWith(base + path.sep)) throw httpErr(400, 'Ruta fuera del proyecto');
  return target;
}
function httpErr(code, msg) { const e = new Error(msg); e.code = code; return e; }
function send(res, code, body, type = 'application/json; charset=utf-8') {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(data);
}
function readBody(req, limit = 200 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > limit) { reject(httpErr(413, 'Archivo demasiado grande')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function readJson(req) { const b = await readBody(req, 5e6); return b.length ? JSON.parse(b.toString('utf8')) : {}; }
async function exists(p) { try { await fsp.access(p); return true; } catch { return false; } }

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8',
  '.tex': 'text/plain; charset=utf-8', '.bib': 'text/plain; charset=utf-8', '.log': 'text/plain; charset=utf-8', '.eps': 'application/postscript',
};

async function listFiles(dir, rel = '') {
  const out = [];
  for (const ent of await fsp.readdir(path.join(dir, rel), { withFileTypes: true })) {
    if (!rel && (ent.name === OUT || ent.name === META)) continue;
    const r = rel ? rel + '/' + ent.name : ent.name;
    if (ent.isDirectory()) { out.push({ path: r, type: 'dir' }); out.push(...await listFiles(dir, r)); }
    else { const st = await fsp.stat(path.join(dir, r)); out.push({ path: r, type: 'file', size: st.size }); }
  }
  return out;
}
async function getMeta(dir) {
  try { return JSON.parse(await fsp.readFile(path.join(dir, META), 'utf8')); } catch { return {}; }
}
async function setMeta(dir, patch) {
  const m = { ...(await getMeta(dir)), ...patch };
  await fsp.writeFile(path.join(dir, META), JSON.stringify(m, null, 2));
  return m;
}

const clean = t => String(t).replace(/[\\{}$&#^_%~]/g, '');
const BIB = `@article{einstein1905,
  author  = {Albert Einstein},
  title   = {Zur Elektrodynamik bewegter K{\\"o}rper},
  journal = {Annalen der Physik},
  volume  = {322},
  number  = {10},
  pages   = {891--921},
  year    = {1905},
  doi     = {10.1002/andp.19053221004}
}

@book{knuth1984,
  author    = {Donald E. Knuth},
  title     = {The {\\TeX}book},
  publisher = {Addison-Wesley},
  year      = {1984}
}

@book{lamport1994,
  author    = {Leslie Lamport},
  title     = {{\\LaTeX}: A Document Preparation System},
  edition   = {2},
  publisher = {Addison-Wesley},
  year      = {1994}
}
`;
const TEMPLATES = {
  // Artículo completo: paquetes, \input de secciones, figuras, tablas, referencias cruzadas y bibliografía (BibTeX)
  article: (title) => ({
    'main.tex': `\\documentclass[11pt,a4paper]{article}

% ---------- Paquetes ----------
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[spanish,es-tabla]{babel}
\\usepackage{amsmath,amssymb,amsthm}
\\usepackage{graphicx}
\\usepackage{booktabs}
\\usepackage[margin=2.5cm]{geometry}
\\usepackage[numbers,sort&compress]{natbib}
\\usepackage{hyperref}
\\usepackage[spanish,capitalise]{cleveref}

\\graphicspath{{figuras/}}

\\title{${clean(title)}}
\\author{Tu nombre}
\\date{\\today}

\\begin{document}
\\maketitle
\\tableofcontents

\\input{secciones/introduccion}
\\input{secciones/resultados}

% ---------- Bibliografía ----------
\\bibliographystyle{plainnat}
\\bibliography{referencias}

\\end{document}
`,
    'secciones/introduccion.tex': `\\section{Introducción}\\label{sec:intro}

Este documento se compila \\textbf{en tu propia máquina}. La teoría de la relatividad
especial se publicó en~\\cite{einstein1905}, y \\TeX{} está descrito en~\\cite{knuth1984,lamport1994}.

En la \\cref{sec:resultados} se muestra la \\cref{eq:euler} y la \\cref{tab:datos}.
`,
    'secciones/resultados.tex': `\\section{Resultados}\\label{sec:resultados}

\\begin{equation}\\label{eq:euler}
  e^{i\\pi} + 1 = 0
\\end{equation}

\\begin{table}[htbp]
  \\centering
  \\caption{Datos de ejemplo.}\\label{tab:datos}
  \\begin{tabular}{lrr}
    \\toprule
    Muestra & $x$ & $y$ \\\\
    \\midrule
    A & 1.0 & 2.3 \\\\
    B & 2.0 & 4.1 \\\\
    \\bottomrule
  \\end{tabular}
\\end{table}

% Sube una imagen a la carpeta "figuras" y descomenta:
% \\begin{figure}[htbp]
%   \\centering
%   \\includegraphics[width=0.7\\linewidth]{mi-imagen}
%   \\caption{Una figura.}\\label{fig:ejemplo}
% \\end{figure}
`,
    'referencias.bib': BIB,
    'figuras/': null,
  }),
  // Artículo con biblatex + biber (orden alfabético, estilo APA)
  biblatex: (title) => ({
    'main.tex': `\\documentclass[11pt,a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[spanish,es-noshorthands]{babel} % es-noshorthands evita conflictos con biblatex-apa
\\usepackage{csquotes}
\\usepackage[margin=2.5cm]{geometry}
\\usepackage[backend=biber,style=apa,sorting=nyt]{biblatex}
\\addbibresource{referencias.bib}
\\usepackage{hyperref}

\\title{${clean(title)}}
\\author{Tu nombre}
\\date{\\today}

\\begin{document}
\\maketitle

\\section{Introducción}
Según \\textcite{einstein1905}, ... Véase también \\parencite{knuth1984,lamport1994}.

\\printbibliography[title={Referencias}]
\\end{document}
`,
    'referencias.bib': BIB,
  }),
  report: (title) => ({
    'main.tex': `\\documentclass[12pt,a4paper,oneside]{report}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage[spanish]{babel}
\\usepackage{amsmath,amssymb,graphicx,booktabs}
\\usepackage[margin=2.5cm]{geometry}
\\usepackage[numbers]{natbib}
\\usepackage{hyperref}

\\title{${clean(title)}}
\\author{Tu nombre}

\\begin{document}
\\maketitle
\\tableofcontents
\\listoffigures
\\listoftables

\\include{capitulos/cap1}

\\bibliographystyle{unsrtnat}
\\bibliography{referencias}
\\end{document}
`,
    'capitulos/cap1.tex': `\\chapter{Primer capítulo}\\label{cap:uno}
Texto con una cita~\\cite{knuth1984}.
`,
    'referencias.bib': BIB,
  }),
  beamer: (title) => ({
    'main.tex': `\\documentclass{beamer}
\\usepackage[utf8]{inputenc}
\\usepackage[spanish]{babel}
\\usetheme{Madrid}

\\title{${clean(title)}}
\\author{Tu nombre}
\\date{\\today}

\\begin{document}
\\frame{\\titlepage}

\\begin{frame}{Primera diapositiva}
  \\begin{itemize}
    \\item Punto uno
    \\item Punto dos
  \\end{itemize}
\\end{frame}
\\end{document}
`,
  }),
  blank: () => ({
    'main.tex': `\\documentclass{article}
\\usepackage[utf8]{inputenc}

\\begin{document}

\\end{document}
`,
  }),
};

// ---------- Compilación ----------
const compiling = new Map();

function run(cmd, args, cwd, extraEnv = {}) {
  return new Promise(resolve => {
    let out = '';
    const child = spawn(cmd, args, { cwd, env: { ...ENV, ...extraEnv }, windowsHide: true });
    const timer = setTimeout(() => { out += '\n[Folio] Tiempo de compilación agotado; proceso detenido.\n'; child.kill('SIGKILL'); }, COMPILE_TIMEOUT_MS);
    child.stdout.on('data', d => out += d);
    child.stderr.on('data', d => out += d);
    child.stdin.end(); // nunca esperar entrada interactiva
    child.on('error', e => { clearTimeout(timer); resolve({ code: -1, out: out + '\n' + e.message }); });
    child.on('close', code => { clearTimeout(timer); resolve({ code, out }); });
  });
}

async function mirrorDirs(dir, outDir) {
  for (const f of await listFiles(dir)) if (f.type === 'dir') await fsp.mkdir(path.join(outDir, f.path), { recursive: true });
}

async function compile(dir, main, engine) {
  const outDir = path.join(dir, OUT);
  await fsp.mkdir(outDir, { recursive: true });
  await mirrorDirs(dir, outDir);
  const base = main.replace(/\.tex$/i, '');
  const steps = [];
  const t0 = Date.now();

  if (engine === 'tectonic') {
    const r = await run(ENGINES.tectonic, [main, '--outdir', OUT, '--keep-logs', '--synctex', '--keep-intermediates'], dir);
    steps.push({ step: 'tectonic', ...r });
  } else {
    const exe = ENGINES[engine];
    if (!exe) throw httpErr(400, `El motor "${engine}" no está instalado`);
    const args = ['-interaction=nonstopmode', '-file-line-error', '-synctex=1', `-output-directory=${OUT}`, main];
    const sep = path.delimiter;
    const texEnv = { TEXINPUTS: `.${sep}${dir}${sep}`, BIBINPUTS: `${dir}${sep}`, BSTINPUTS: `${dir}${sep}` };
    let r = await run(exe, args, dir, texEnv);
    steps.push({ step: engine + ' (1)', ...r });

    // Bibliografía
    const src = await fsp.readFile(path.join(dir, main), 'utf8').catch(() => '');
    const usesBiber = /\\usepackage(\[[^\]]*\])?\{biblatex\}/.test(src) && !/backend\s*=\s*bibtex/.test(src);
    const aux = await fsp.readFile(path.join(outDir, base + '.aux'), 'utf8').catch(() => '');
    let ranBib = false;
    if (usesBiber && ENGINES.biber && await exists(path.join(outDir, base + '.bcf'))) {
      const b = await run(ENGINES.biber, [`--input-directory=${dir}`, base], outDir, texEnv);
      steps.push({ step: 'biber', ...b }); ranBib = true;
    } else if (/\\bibdata|\\citation/.test(aux) && ENGINES.bibtex) {
      const b = await run(ENGINES.bibtex, [base], outDir, texEnv);
      steps.push({ step: 'bibtex', ...b }); ranBib = true;
    }
    if (ENGINES.makeindex && await exists(path.join(outDir, base + '.idx'))) {
      steps.push({ step: 'makeindex', ...await run(ENGINES.makeindex, [base + '.idx'], outDir) });
      ranBib = true;
    }
    if (ENGINES.makeglossaries && await exists(path.join(outDir, base + '.glo'))) {
      steps.push({ step: 'makeglossaries', ...await run(ENGINES.makeglossaries, [base], outDir) });
      ranBib = true;
    }
    // Los paquetes que faltan los instala MiKTeX automáticamente (si "instalar al vuelo" está activado)
    // Recompilar mientras sea necesario (referencias, índices, bibliografía)
    for (let i = 2; i <= 4; i++) {
      if (!ranBib && !/Rerun to get|Label\(s\) may have changed|Rerun LaTeX|There were undefined references|No file .*\.(toc|aux)/.test(r.out)) break;
      ranBib = false;
      r = await run(exe, args, dir, texEnv);
      steps.push({ step: `${engine} (${i})`, ...r });
    }
  }

  const pdfPath = path.join(outDir, base + '.pdf');
  const logText = await fsp.readFile(path.join(outDir, base + '.log'), 'latin1').catch(() => steps.map(s => s.out).join('\n'));
  let pdfOk = false;
  try { const st = await fsp.stat(pdfPath); pdfOk = st.mtimeMs >= t0 - 1000; } catch {}
  return {
    ok: pdfOk,
    pdf: pdfOk || await exists(pdfPath),
    durationMs: Date.now() - t0,
    issues: parseLog(logText, dir),
    log: logText,
    raw: steps.map(s => `===== ${s.step} (código ${s.code}) =====\n${s.out}`).join('\n'),
  };
}

function parseLog(log, dir) {
  const issues = [];
  const lines = log.split(/\r?\n/);
  const norm = f => { f = f.replace(/^\.\//, ''); if (path.isAbsolute(f)) f = path.relative(dir, f); return f.split(path.sep).join('/'); };
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    let m = L.match(/^(.+?\.(?:tex|sty|cls|bib|bbl|cfg|def)):(\d+): (.*)$/);
    if (m) {
      let msg = m[3];
      for (let j = 1; j <= 2 && lines[i + j] && !/^\s*$/.test(lines[i + j]); j++) if (/^l\.\d+/.test(lines[i + j])) { msg += '  →  ' + lines[i + j].replace(/^l\.\d+\s*/, ''); break; }
      issues.push({ level: 'error', file: norm(m[1]), line: +m[2], message: msg });
      continue;
    }
    if (/^! /.test(L)) {
      let line = null;
      for (let j = 1; j < 8 && lines[i + j]; j++) { const lm = lines[i + j].match(/^l\.(\d+)/); if (lm) { line = +lm[1]; break; } }
      issues.push({ level: 'error', file: null, line, message: L.slice(2) });
      continue;
    }
    m = L.match(/^(?:LaTeX|Package (\S+)|Class (\S+)) Warning: (.*)$/);
    if (m) {
      let msg = m[3]; let j = i + 1;
      while (lines[j] && /^\(\S*\)\s+/.test(lines[j]) && j < i + 6) { msg += ' ' + lines[j].replace(/^\(\S*\)\s+/, ''); j++; }
      const lm = msg.match(/on input line (\d+)/);
      issues.push({ level: 'warning', file: null, line: lm ? +lm[1] : null, message: (m[1] || m[2] ? `[${m[1] || m[2]}] ` : '') + msg });
      continue;
    }
    m = L.match(/^(Overfull|Underfull) \\[hv]box .*?(?:lines? (\d+))?/);
    if (m) issues.push({ level: 'typesetting', file: null, line: m[2] ? +m[2] : null, message: L.trim() });
  }
  // eliminar duplicados (el "! ..." y el "file:line:" del mismo error)
  const seen = new Set();
  return issues.filter(x => { const k = x.level + x.message.slice(0, 80) + x.line; if (seen.has(k)) return false; seen.add(k); return true; })
    .filter((x, _, arr) => !(x.level === 'error' && !x.file && arr.some(y => y.file && y.level === 'error' && y.message.startsWith(x.message.slice(0, 40)))));
}

// ---------- Router ----------
async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const parts = url.pathname.split('/').filter(Boolean);
  const q = url.searchParams;

  if (parts[0] !== 'api') return serveStatic(url.pathname, res);

  // Protección básica CSRF: solo peticiones del propio origen modifican datos
  if (req.method !== 'GET') {
    const origin = req.headers.origin;
    if (origin && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) throw httpErr(403, 'Origen no permitido');
  }

  if (parts[1] === 'engines') {
    if (q.get('refresh')) detectEngines();
    return send(res, 200, { engines: Object.keys(ENGINES), paths: ENGINES, platform: os.platform() });
  }

  if (parts[1] !== 'projects') throw httpErr(404, 'No encontrado');

  // /api/projects
  if (parts.length === 2) {
    if (req.method === 'GET') {
      const list = [];
      for (const ent of await fsp.readdir(PROJECTS, { withFileTypes: true })) {
        if (!ent.isDirectory() || ent.name.startsWith('.')) continue;
        const d = path.join(PROJECTS, ent.name);
        const st = await fsp.stat(d);
        const meta = await getMeta(d);
        list.push({ name: ent.name, modified: meta.modified || st.mtimeMs, created: st.birthtimeMs });
      }
      list.sort((a, b) => b.modified - a.modified);
      return send(res, 200, list);
    }
    if (req.method === 'POST') {
      const { name, template } = await readJson(req);
      const dir = projectDir(encodeURIComponent(name));
      if (await exists(dir)) throw httpErr(409, 'Ya existe un proyecto con ese nombre');
      await fsp.mkdir(dir, { recursive: true });
      const files = (TEMPLATES[template] || TEMPLATES.article)(name);
      for (const [rel, content] of Object.entries(files)) {
        const fp = resolveIn(dir, rel);
        if (content === null) { await fsp.mkdir(fp, { recursive: true }); continue; }
        await fsp.mkdir(path.dirname(fp), { recursive: true });
        await fsp.writeFile(fp, content);
      }
      await setMeta(dir, { main: 'main.tex', engine: ENGINES.pdflatex ? 'pdflatex' : Object.keys(ENGINES)[0] || 'pdflatex', modified: Date.now() });
      return send(res, 201, { name: path.basename(dir) });
    }
  }

  const dir = projectDir(parts[2]);
  if (!(await exists(dir))) throw httpErr(404, 'Proyecto no encontrado');
  const action = parts[3];

  if (!action) {
    if (req.method === 'DELETE') { await fsp.rm(dir, { recursive: true, force: true }); return send(res, 200, { ok: true }); }
    if (req.method === 'GET') return send(res, 200, { name: path.basename(dir), meta: await getMeta(dir), files: await listFiles(dir) });
  }
  switch (action) {
    case 'rename': {
      const { name } = await readJson(req);
      const nd = projectDir(encodeURIComponent(name));
      if (await exists(nd)) throw httpErr(409, 'Ya existe un proyecto con ese nombre');
      await fsp.rename(dir, nd);
      return send(res, 200, { name: path.basename(nd) });
    }
    case 'duplicate': {
      const { name } = await readJson(req);
      const nd = projectDir(encodeURIComponent(name));
      if (await exists(nd)) throw httpErr(409, 'Ya existe un proyecto con ese nombre');
      await fsp.cp(dir, nd, { recursive: true, filter: s => path.basename(s) !== OUT });
      return send(res, 200, { name: path.basename(nd) });
    }
    case 'meta': {
      if (req.method === 'GET') return send(res, 200, await getMeta(dir));
      return send(res, 200, await setMeta(dir, await readJson(req)));
    }
    case 'files': return send(res, 200, await listFiles(dir));
    case 'file': {
      const fp = resolveIn(dir, q.get('path'));
      if (req.method === 'GET') {
        const buf = await fsp.readFile(fp);
        return send(res, 200, buf, MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
      }
      if (req.method === 'PUT') {
        await fsp.mkdir(path.dirname(fp), { recursive: true });
        await fsp.writeFile(fp, await readBody(req));
        await setMeta(dir, { modified: Date.now() });
        return send(res, 200, { ok: true });
      }
      if (req.method === 'DELETE') { await fsp.rm(fp, { recursive: true, force: true }); return send(res, 200, { ok: true }); }
      break;
    }
    case 'folder': {
      const { path: p } = await readJson(req);
      await fsp.mkdir(resolveIn(dir, p), { recursive: true });
      return send(res, 200, { ok: true });
    }
    case 'move': {
      const { from, to } = await readJson(req);
      const a = resolveIn(dir, from), b = resolveIn(dir, to);
      if (await exists(b)) throw httpErr(409, 'El destino ya existe');
      await fsp.mkdir(path.dirname(b), { recursive: true });
      await fsp.rename(a, b);
      const meta = await getMeta(dir);
      if (meta.main === from) await setMeta(dir, { main: to });
      return send(res, 200, { ok: true });
    }
    case 'compile': {
      if (compiling.get(dir)) throw httpErr(409, 'Ya se está compilando este proyecto');
      const meta = await getMeta(dir);
      const body = await readJson(req);
      const main = body.main || meta.main || 'main.tex';
      const engine = body.engine || meta.engine || 'pdflatex';
      resolveIn(dir, main);
      if (!(await exists(path.join(dir, main)))) throw httpErr(400, `No existe el archivo principal "${main}"`);
      if (!ENGINES[engine]) detectEngines();
      if (!ENGINES[engine]) throw httpErr(400, `No se encontró "${engine}". Instala MiKTeX o TeX Live (ver README) y pulsa "Detectar motores".`);
      compiling.set(dir, true);
      try {
        const r = await compile(dir, main, engine);
        await setMeta(dir, { main, engine, lastCompile: Date.now() });
        return send(res, 200, r);
      } finally { compiling.delete(dir); }
    }
    case 'pdf': {
      const meta = await getMeta(dir);
      const base = (meta.main || 'main.tex').replace(/\.tex$/i, '');
      const fp = path.join(dir, OUT, base + '.pdf');
      if (!(await exists(fp))) throw httpErr(404, 'Aún no hay PDF');
      const headers = { 'Content-Type': 'application/pdf', 'Cache-Control': 'no-store' };
      if (q.get('download')) headers['Content-Disposition'] = `attachment; filename="${encodeURIComponent(path.basename(dir))}.pdf"`;
      res.writeHead(200, headers);
      return fs.createReadStream(fp).pipe(res);
    }
    case 'synctex': {
      // Del código al PDF (forward search) usando el binario synctex si existe
      const exe = ENGINES.synctex;
      if (!exe) return send(res, 200, { available: false });
      const meta = await getMeta(dir);
      const base = (meta.main || 'main.tex').replace(/\.tex$/i, '');
      const r = await run(exe, ['view', '-i', `${q.get('line')}:0:${path.join(dir, q.get('file'))}`, '-o', path.join(dir, OUT, base + '.pdf')], dir);
      const page = r.out.match(/Page:(\d+)/);
      return send(res, 200, { available: true, page: page ? +page[1] : null });
    }
    case 'reveal': {
      const cmd = process.platform === 'win32' ? 'explorer' : process.platform === 'darwin' ? 'open' : 'xdg-open';
      spawn(cmd, [dir], { detached: true, stdio: 'ignore' }).unref();
      return send(res, 200, { ok: true });
    }
    case 'clean': {
      await fsp.rm(path.join(dir, OUT), { recursive: true, force: true });
      return send(res, 200, { ok: true });
    }
  }
  throw httpErr(404, 'Ruta no encontrada');
}

async function serveStatic(p, res) {
  if (p === '/') p = '/index.html';
  const fp = resolveIn(PUBLIC, decodeURIComponent(p));
  try {
    const buf = await fsp.readFile(fp);
    send(res, 200, buf, MIME[path.extname(fp)] || 'application/octet-stream');
  } catch { send(res, 404, 'No encontrado', 'text/plain'); }
}

http.createServer((req, res) => {
  handle(req, res).catch(e => {
    if (!res.headersSent) send(res, e.code >= 400 && e.code < 600 ? e.code : 500, { error: e.message });
    if (!(e.code >= 400 && e.code < 600)) console.error(e);
  });
}).listen(PORT, HOST, () => {
  console.log(`\n  Folio listo en  http://localhost:${PORT}`);
  console.log(`  Proyectos en:      ${PROJECTS}`);
  const e = Object.keys(ENGINES);
  console.log(`  Motores LaTeX:     ${e.length ? e.join(', ') : 'NINGUNO — instala MiKTeX o TeX Live (ver README.md)'}\n`);
});
