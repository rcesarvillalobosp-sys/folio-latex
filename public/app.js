'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const TEXT_EXT = /\.(tex|bib|sty|cls|bst|bbx|cbx|txt|md|csv|dat|cfg|def|ltx|clo|tikz|pgf|json|lua)$/i;
const IMG_EXT = /\.(png|jpe?g|gif|svg|webp|pdf|eps)$/i;
const ENGINE_NAMES = ['pdflatex', 'xelatex', 'lualatex', 'tectonic'];

const S = {
  project: null, meta: {}, files: [], docs: new Map(), current: null, engines: [],
  labels: [], bibKeys: [], saveTimers: new Map(), compiling: false, lastIssues: [], collapsed: new Set(),
};
let cm;

// ---------------- API ----------------
async function api(method, url, body, raw) {
  const opt = { method, headers: {} };
  if (body !== undefined) {
    if (raw) opt.body = body; else { opt.body = JSON.stringify(body); opt.headers['Content-Type'] = 'application/json'; }
  }
  const r = await fetch(url, opt);
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('json') ? await r.json() : await r.text();
  if (!r.ok) throw new Error(data && data.error ? data.error : `HTTP ${r.status}`);
  return data;
}
const P = () => '/api/projects/' + encodeURIComponent(S.project);
const fileUrl = p => `${P()}/file?path=${encodeURIComponent(p)}`;

function toast(msg, isErr) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (isErr ? ' error' : '');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), isErr ? 5000 : 2200);
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------------- Inicio ----------------
async function loadEngines(refresh) {
  const r = await api('GET', '/api/engines' + (refresh ? '?refresh=1' : ''));
  S.engines = r.engines;
  const tex = r.engines.filter(e => ENGINE_NAMES.includes(e));
  $('#engineStatus').textContent = tex.length ? 'Motores: ' + r.engines.join(', ') : 'Sin motor LaTeX';
  const n = $('#noEngine');
  if (!tex.length) {
    n.classList.remove('hidden');
    n.innerHTML = `<strong>No se encontró ninguna distribución LaTeX.</strong> Instala una (gratis) y pulsa
      <button id="redetect">Detectar motores</button><br><br>
      Opción recomendada en Windows (MiKTeX, instala paquetes automáticamente):<br>
      <code>winget install MiKTeX.MiKTeX</code><br>
      Luego abre <em>MiKTeX Console → Settings</em> y en <em>“Install missing packages on-the-fly”</em> elige <em>Always</em>.<br>
      Para usar biblatex con estilo moderno también necesitas <code>biber</code> (MiKTeX lo instala al vuelo).<br>
      Alternativa: TeX Live completo (<code>https://tug.org/texlive/</code>).`;
    $('#redetect').onclick = async () => { await loadEngines(true); toast(S.engines.length ? 'Motores detectados' : 'Aún no se detecta LaTeX (¿reiniciaste el servidor tras instalar?)', !S.engines.length); };
  } else n.classList.add('hidden');
}

async function showHome() {
  S.project = null;
  $('#editor').classList.add('hidden'); $('#home').classList.remove('hidden');
  document.title = 'Folio';
  loadEngines().catch(() => {});
  const list = await api('GET', '/api/projects');
  const tb = $('#projectList');
  tb.innerHTML = list.length ? '' : '<tr><td colspan="3" class="muted">Aún no hay proyectos. Crea uno arriba.</td></tr>';
  for (const p of list) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><a>${esc(p.name)}</a></td><td class="muted">${new Date(p.modified).toLocaleString()}</td>
      <td class="act"><button data-a="rename">Renombrar</button><button data-a="dup">Duplicar</button><button data-a="del">Eliminar</button></td>`;
    tr.querySelector('a').onclick = () => location.hash = '#/p/' + encodeURIComponent(p.name);
    tr.querySelector('[data-a=rename]').onclick = async () => {
      const n = prompt('Nuevo nombre:', p.name); if (!n || n === p.name) return;
      try { await api('POST', `/api/projects/${encodeURIComponent(p.name)}/rename`, { name: n }); showHome(); } catch (e) { toast(e.message, 1); }
    };
    tr.querySelector('[data-a=dup]').onclick = async () => {
      const n = prompt('Nombre de la copia:', p.name + ' (copia)'); if (!n) return;
      try { await api('POST', `/api/projects/${encodeURIComponent(p.name)}/duplicate`, { name: n }); showHome(); } catch (e) { toast(e.message, 1); }
    };
    tr.querySelector('[data-a=del]').onclick = async () => {
      if (!confirm(`¿Eliminar definitivamente "${p.name}" y todos sus archivos? No se puede deshacer.`)) return;
      await api('DELETE', `/api/projects/${encodeURIComponent(p.name)}`); showHome();
    };
    tb.appendChild(tr);
  }
}
$('#createBtn').onclick = async () => {
  const name = $('#newName').value.trim();
  if (!name) return toast('Escribe un nombre', 1);
  try {
    const r = await api('POST', '/api/projects', { name, template: $('#newTemplate').value });
    $('#newName').value = '';
    location.hash = '#/p/' + encodeURIComponent(r.name);
  } catch (e) { toast(e.message, 1); }
};
$('#newName').onkeydown = e => { if (e.key === 'Enter') $('#createBtn').click(); };

// ---------------- Abrir proyecto ----------------
async function openProject(name) {
  await flushAll();
  S.project = name; S.docs.clear(); S.current = null; S.lastIssues = [];
  $('#home').classList.add('hidden'); $('#editor').classList.remove('hidden');
  $('#projName').textContent = name; document.title = name + ' — Folio';
  if (!cm) initEditor();
  await loadEngines().catch(() => {});
  const r = await api('GET', P());
  S.meta = r.meta || {}; S.files = r.files;
  // cargar todos los archivos de texto (para índice de \label, claves .bib y esquema)
  await Promise.all(S.files.filter(f => f.type === 'file' && TEXT_EXT.test(f.path) && f.size < 3e6).map(loadDoc));
  fillSelects();
  renderTree(); rebuildIndex();
  $('#autoCompile').checked = !!S.meta.autoCompile;
  $('#issues').innerHTML = ''; $('#log').textContent = ''; $('#issueCount').textContent = '';
  const main = S.meta.main && S.docs.has(S.meta.main) ? S.meta.main : [...S.docs.keys()].find(p => p.endsWith('.tex'));
  if (main) openFile(main);
  showPdf();
}

async function loadDoc(f) {
  const text = await api('GET', fileUrl(f.path));
  const mode = /\.bib$/i.test(f.path) ? { name: 'stex', inMathMode: false } : 'stex';
  const doc = CodeMirror.Doc(typeof text === 'string' ? text : JSON.stringify(text), mode);
  const entry = { doc, saved: doc.getValue(), dirty: false };
  S.docs.set(f.path, entry);
  return entry;
}

function fillSelects() {
  const texs = S.files.filter(f => f.type === 'file' && /\.tex$/i.test(f.path)).map(f => f.path);
  $('#mainSelect').innerHTML = texs.map(t => `<option ${t === S.meta.main ? 'selected' : ''}>${esc(t)}</option>`).join('');
  const engs = ENGINE_NAMES.map(e => `<option value="${e}" ${e === S.meta.engine ? 'selected' : ''}>${e}${S.engines.includes(e) ? '' : ' (no instalado)'}</option>`);
  $('#engineSelect').innerHTML = engs.join('');
  if (!S.meta.engine) $('#engineSelect').value = S.engines.find(e => ENGINE_NAMES.includes(e)) || 'pdflatex';
}
$('#mainSelect').onchange = async e => { S.meta = await api('POST', P() + '/meta', { main: e.target.value }); renderTree(); rebuildIndex(); };
$('#engineSelect').onchange = async e => { S.meta = await api('POST', P() + '/meta', { engine: e.target.value }); };
$('#autoCompile').onchange = async e => { S.meta = await api('POST', P() + '/meta', { autoCompile: e.target.checked }); };

// ---------------- Árbol de archivos ----------------
function renderTree() {
  const tree = $('#fileTree'); tree.innerHTML = '';
  const items = [...S.files].sort((a, b) => {
    const pa = a.path.split('/'), pb = b.path.split('/');
    for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
      if (pa[i] !== pb[i]) {
        const da = i < pa.length - 1 || a.type === 'dir', db = i < pb.length - 1 || b.type === 'dir';
        if (da !== db) return da ? -1 : 1;
        return pa[i].localeCompare(pb[i]);
      }
    }
    return pa.length - pb.length;
  });
  for (const f of items) {
    const parts = f.path.split('/');
    if (parts.slice(0, -1).some((_, i) => S.collapsed.has(parts.slice(0, i + 1).join('/')))) continue;
    const depth = parts.length - 1;
    const el = document.createElement('div');
    el.className = 'node' + (f.path === S.current ? ' active' : '');
    el.style.paddingLeft = 8 + depth * 14 + 'px';
    const icon = f.type === 'dir' ? (S.collapsed.has(f.path) ? '▸📁' : '▾📂') : /\.tex$/i.test(f.path) ? '📄' : /\.bib$/i.test(f.path) ? '📚' : IMG_EXT.test(f.path) ? '🖼' : '📃';
    el.innerHTML = `<span>${icon}</span><span class="nm" title="${esc(f.path)}">${esc(parts.at(-1))}</span>` +
      (f.path === S.meta.main ? '<span class="main-tag">principal</span>' : '') +
      `<button class="icon" data-a="ren" title="Renombrar / mover">✎</button><button class="icon" data-a="del" title="Eliminar">🗑</button>`;
    el.onclick = e => {
      if (e.target.dataset.a) return;
      if (f.type === 'dir') { S.collapsed.has(f.path) ? S.collapsed.delete(f.path) : S.collapsed.add(f.path); renderTree(); }
      else openFile(f.path);
    };
    el.querySelector('[data-a=ren]').onclick = () => renamePath(f);
    el.querySelector('[data-a=del]').onclick = () => deletePath(f);
    if (f.type === 'dir') {
      el.ondragover = e => { e.preventDefault(); e.stopPropagation(); el.classList.add('dragover'); };
      el.ondragleave = () => el.classList.remove('dragover');
      el.ondrop = e => { e.preventDefault(); e.stopPropagation(); el.classList.remove('dragover'); onDrop(e, f.path); };
    } else {
      el.draggable = true;
      el.ondragstart = e => e.dataTransfer.setData('text/x-texlocal', f.path);
    }
    tree.appendChild(el);
  }
}
async function refreshFiles() { S.files = await api('GET', P() + '/files'); fillSelects(); renderTree(); }

async function renamePath(f) {
  const to = prompt('Nueva ruta (puedes moverlo a otra carpeta, p. ej. "figuras/img.png"):', f.path);
  if (!to || to === f.path) return;
  await flushAll();
  try {
    await api('POST', P() + '/move', { from: f.path, to });
    for (const [k, v] of [...S.docs]) if (k === f.path || k.startsWith(f.path + '/')) { S.docs.delete(k); S.docs.set(to + k.slice(f.path.length), v); }
    if (S.current && (S.current === f.path || S.current.startsWith(f.path + '/'))) S.current = to + S.current.slice(f.path.length);
    S.meta = await api('GET', P() + '/meta');
    await refreshFiles(); rebuildIndex(); updateFileLabel();
  } catch (e) { toast(e.message, 1); }
}
async function deletePath(f) {
  if (!confirm(`¿Eliminar "${f.path}"${f.type === 'dir' ? ' y todo su contenido' : ''}? No se puede deshacer.`)) return;
  await api('DELETE', fileUrl(f.path));
  for (const k of [...S.docs.keys()]) if (k === f.path || k.startsWith(f.path + '/')) S.docs.delete(k);
  if (S.current && !S.docs.has(S.current) && !IMG_EXT.test(S.current)) S.current = null;
  await refreshFiles(); rebuildIndex();
  if (!S.current) { const t = [...S.docs.keys()][0]; if (t) openFile(t); else { cm.swapDoc(CodeMirror.Doc('', 'stex')); updateFileLabel(); } }
}
$('#newFileBtn').onclick = async () => {
  const p = prompt('Nombre del archivo (puede incluir carpeta), p. ej. "secciones/metodo.tex" o "refs.bib":', 'nuevo.tex');
  if (!p) return;
  if (S.files.some(f => f.path === p)) return toast('Ya existe', 1);
  const initial = /\.tex$/i.test(p) && !/main/.test(p) ? `% ${p}\n` : '';
  await api('PUT', fileUrl(p), initial, true);
  await refreshFiles(); await loadDoc({ path: p }); openFile(p); rebuildIndex();
  if (/\.tex$/i.test(p) && p !== S.meta.main) toast(`Inclúyelo en el principal con \\input{${p.replace(/\.tex$/i, '')}}`);
};
$('#newFolderBtn').onclick = async () => {
  const p = prompt('Nombre de la carpeta:', 'figuras'); if (!p) return;
  await api('POST', P() + '/folder', { path: p }); refreshFiles();
};
$('#uploadBtn').onclick = () => $('#uploadInput').click();
$('#uploadInput').onchange = e => { uploadFiles([...e.target.files], ''); e.target.value = ''; };
const treeEl = $('#fileTree');
treeEl.ondragover = e => { e.preventDefault(); treeEl.classList.add('drop'); };
treeEl.ondragleave = () => treeEl.classList.remove('drop');
treeEl.ondrop = e => { e.preventDefault(); treeEl.classList.remove('drop'); onDrop(e, ''); };
function onDrop(e, folder) {
  const internal = e.dataTransfer.getData('text/x-texlocal');
  if (internal) {
    const to = (folder ? folder + '/' : '') + internal.split('/').at(-1);
    if (to !== internal) api('POST', P() + '/move', { from: internal, to }).then(async () => {
      const d = S.docs.get(internal); if (d) { S.docs.delete(internal); S.docs.set(to, d); }
      if (S.current === internal) S.current = to;
      S.meta = await api('GET', P() + '/meta'); refreshFiles(); updateFileLabel(); rebuildIndex();
    }).catch(err => toast(err.message, 1));
    return;
  }
  uploadFiles([...e.dataTransfer.files], folder);
}
async function uploadFiles(files, folder) {
  if (!files.length) return;
  if (!folder && S.current && files.every(f => IMG_EXT.test(f.name)) && S.files.some(f => f.type === 'dir' && /^(fig|img|image)/i.test(f.path))) {
    folder = S.files.find(f => f.type === 'dir' && /^(fig|img|image)/i.test(f.path)).path;
  }
  for (const f of files) {
    const p = (folder ? folder + '/' : '') + f.name;
    await api('PUT', fileUrl(p), await f.arrayBuffer(), true);
    if (TEXT_EXT.test(p)) await loadDoc({ path: p });
  }
  toast(`${files.length} archivo(s) subido(s)${folder ? ' a ' + folder : ''}`);
  await refreshFiles(); rebuildIndex();
}

// ---------------- Editor ----------------
function initEditor() {
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  cm = CodeMirror($('#cm'), {
    mode: 'stex', theme: dark ? 'material-darker' : 'default', lineNumbers: true, lineWrapping: true,
    matchBrackets: true, autoCloseBrackets: '()[]{}$$', styleActiveLine: true, indentUnit: 2, tabSize: 2,
    foldGutter: true, gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
    extraKeys: {
      'Ctrl-S': () => compileNow(), 'Cmd-S': () => compileNow(),
      'Ctrl-Enter': () => compileNow(), 'Cmd-Enter': () => compileNow(),
      'Ctrl-Space': c => c.showHint({ hint: latexHint, completeSingle: false }),
      'Ctrl-B': () => wrap('\\textbf{|}'), 'Ctrl-I': () => wrap('\\textit{|}'),
      'Ctrl-/': 'toggleComment', 'Cmd-/': 'toggleComment',
      'Ctrl-H': 'replace', 'Ctrl-G': 'jumpToLine',
      'Ctrl-.': () => syncToPdf(),
      Tab: c => c.somethingSelected() ? c.indentSelection('add') : c.replaceSelection('  '),
    },
  });
  cm.setOption('lineComment', '%');
  CodeMirror.extendMode('stex', { lineComment: '%' });
  cm.on('change', (_, ch) => { if (ch.origin !== 'setValue') onEdit(); });
  cm.on('inputRead', (c, ch) => {
    const t = ch.text.join('');
    if (/[\\{,@a-zA-Z]/.test(t) && !c.state.completionActive) {
      const line = c.getLine(c.getCursor().line).slice(0, c.getCursor().ch);
      if (/\\[a-zA-Z]*$/.test(line) || /\\\w+\*?(\[[^\]]*\])*\{[^{}]*$/.test(line) || /^\s*@\w*$/.test(line))
        c.showHint({ hint: latexHint, completeSingle: false });
    }
  });
  addEventListener('beforeunload', e => { if ([...S.docs.values()].some(d => d.dirty)) { flushAll(); e.preventDefault(); } });
}

function openFile(p) {
  S.current = p;
  const isImg = IMG_EXT.test(p) && !S.docs.has(p);
  $('#cm').classList.toggle('hidden', isImg);
  $('#formatBar').querySelectorAll('button').forEach(b => b.disabled = isImg);
  const prev = $('#imgPreview');
  prev.classList.toggle('hidden', !isImg);
  if (isImg) {
    const url = `${fileUrl(p)}&t=${Date.now()}`;
    prev.innerHTML = /\.pdf$/i.test(p) ? `<iframe src="${url}"></iframe>` : /\.eps$/i.test(p) ? '<span class="muted">Vista previa EPS no disponible</span>' : `<img src="${url}" alt="">`;
  } else if (S.docs.has(p)) {
    cm.swapDoc(S.docs.get(p).doc); cm.focus(); markErrors();
  } else {
    prev.classList.remove('hidden'); $('#cm').classList.add('hidden');
    prev.innerHTML = '<span class="muted">Archivo binario — no editable</span>';
  }
  updateFileLabel(); renderTree(); renderOutline();
}
function updateFileLabel() {
  $('#currentFile').textContent = S.current || '';
  const d = S.docs.get(S.current); $('#dirtyMark').classList.toggle('hidden', !(d && d.dirty));
}

function onEdit() {
  const p = S.current, d = S.docs.get(p); if (!d) return;
  d.dirty = true; updateFileLabel();
  clearTimeout(S.saveTimers.get(p));
  S.saveTimers.set(p, setTimeout(() => saveDoc(p).then(() => { if ($('#autoCompile').checked) compileNow(); }), 900));
  clearTimeout(onEdit.idx); onEdit.idx = setTimeout(rebuildIndex, 600);
}
async function saveDoc(p) {
  const d = S.docs.get(p); if (!d || !d.dirty) return;
  clearTimeout(S.saveTimers.get(p));
  const val = d.doc.getValue();
  try { await api('PUT', fileUrl(p), val, true); d.saved = val; d.dirty = d.doc.getValue() !== val; }
  catch (e) { toast('Error al guardar: ' + e.message, 1); }
  if (p === S.current) updateFileLabel();
}
async function flushAll() { await Promise.all([...S.docs.keys()].map(saveDoc)); }

function wrap(tpl) {
  const sel = cm.getSelection();
  const [a, b] = tpl.split('|');
  cm.replaceSelection(a + sel + b);
  if (!sel) { const c = cm.getCursor(); cm.setCursor({ line: c.line, ch: c.ch - b.length }); }
  cm.focus();
}
function snippet(name) {
  const s = LATEX.snippets[name]; const i = s.indexOf('|');
  const c = cm.getCursor(); const sel = cm.getSelection();
  const txt = s.replace('|', sel);
  cm.replaceSelection(txt);
  const before = s.slice(0, i).split('\n');
  cm.setCursor({ line: c.line + before.length - 1, ch: (before.length === 1 ? c.ch : 0) + before.at(-1).length + sel.length });
  cm.focus();
}
$$('#formatBar [data-wrap]').forEach(b => b.onclick = () => { wrap(b.dataset.wrap); if (/cite|ref/.test(b.dataset.wrap)) setTimeout(() => cm.showHint({ hint: latexHint, completeSingle: false }), 10); });
$$('#formatBar [data-snippet]').forEach(b => b.onclick = () => snippet(b.dataset.snippet));
$('#findBtn').onclick = () => cm.execCommand('find');

// ---------------- Índice: labels, claves bib, esquema ----------------
function rebuildIndex() {
  const labels = [], keys = [];
  for (const [p, d] of S.docs) {
    const txt = d.doc.getValue();
    if (/\.tex$/i.test(p)) {
      txt.split('\n').forEach((l, i) => {
        const code = l.replace(/(^|[^\\])%.*$/, '$1');
        for (const m of code.matchAll(/\\label\{([^}]+)\}/g)) labels.push({ key: m[1], file: p, line: i });
      });
    } else if (/\.bib$/i.test(p)) {
      for (const m of txt.matchAll(/@(\w+)\s*\{\s*([^,\s]+)\s*,([\s\S]*?)(?=\n\s*@|$)/g)) {
        if (/^(string|comment|preamble)$/i.test(m[1])) continue;
        const f = name => { const r = m[3].match(new RegExp(name + '\\s*=\\s*[{"]\\s*([^\\n]*?)[}"]\\s*,?\\s*\\n', 'i')); return r ? r[1].replace(/[{}]/g, '') : ''; };
        keys.push({ key: m[2], type: m[1], title: f('title'), author: f('author'), year: f('year'), file: p });
      }
    }
  }
  S.labels = labels; S.bibKeys = keys;
  renderOutline();
}

function texOrder() {
  // Archivos .tex en el orden en que aparecen desde el principal (siguiendo \input / \include / \subfile)
  const order = [], seen = new Set();
  const visit = p => {
    if (seen.has(p) || !S.docs.has(p)) return; seen.add(p); order.push(p);
    const txt = S.docs.get(p).doc.getValue().replace(/(^|[^\\])%.*$/gm, '$1');
    for (const m of txt.matchAll(/\\(?:input|include|subfile)\{([^}]+)\}/g)) {
      let f = m[1].trim(); if (!/\.tex$/i.test(f)) f += '.tex';
      visit(f.replace(/^\.\//, ''));
    }
  };
  if (S.meta.main) visit(S.meta.main);
  return order;
}
function renderOutline() {
  const out = $('#outline'); if (!out) return; out.innerHTML = '';
  const lv = { part: 0, chapter: 0, section: 1, subsection: 2, subsubsection: 3, paragraph: 4, frametitle: 1 };
  const hasChapter = texOrder().some(p => /\\chapter\*?\{/.test(S.docs.get(p).doc.getValue()));
  for (const p of texOrder()) {
    S.docs.get(p).doc.getValue().split('\n').forEach((l, i) => {
      const m = l.replace(/(^|[^\\])%.*$/, '$1').match(/\\(part|chapter|section|subsection|subsubsection|paragraph|frametitle)\*?(?:\[[^\]]*\])?\{([^}]*)\}/);
      if (!m) return;
      const level = Math.max(0, lv[m[1]] - (hasChapter ? 0 : 1) + (hasChapter && m[1] !== 'chapter' && m[1] !== 'part' ? 0 : 0));
      const el = document.createElement('div');
      el.className = `node lvl-${level}`;
      el.innerHTML = `<span class="nm" title="${esc(p)}:${i + 1}">${esc(m[2] || '(sin título)')}</span>`;
      el.onclick = () => jumpTo(p, i + 1);
      out.appendChild(el);
    });
  }
  if (!out.children.length) out.innerHTML = '<div class="node muted">Sin secciones</div>';
}

function jumpTo(file, line) {
  if (file && S.docs.has(file) && file !== S.current) openFile(file);
  if (line) { const l = line - 1; cm.setCursor({ line: l, ch: 0 }); cm.scrollIntoView({ line: l, ch: 0 }, 120); }
  cm.focus();
}

// ---------------- Autocompletado ----------------
const CITE_RE = /^(cite[a-z]*|[Cc]ite[a-z]*|parencite|textcite|autocite|footcite|fullcite|smartcite|supercite|nocite|citep|citet|citealp|citealt|citeauthor|citeyear)\*?$/;
const REF_RE = /^(ref|eqref|pageref|autoref|cref|Cref|crefrange|nameref|vref|vpageref|labelcref|subref)\*?$/;

function latexHint(c) {
  const cur = c.getCursor(), line = c.getLine(cur.line), before = line.slice(0, cur.ch);
  const mk = (list, from) => ({ list, from: CodeMirror.Pos(cur.line, from), to: CodeMirror.Pos(cur.line, cur.ch + (line.slice(cur.ch).match(/^[\w:.\-/]*/) || [''])[0].length) });
  const filt = (items, word, get = x => x) => {
    const w = word.toLowerCase();
    return items.filter(x => get(x).toLowerCase().includes(w)).sort((a, b) => get(a).toLowerCase().indexOf(w) - get(b).toLowerCase().indexOf(w));
  };

  // .bib: tipos de entrada
  if (/\.bib$/i.test(S.current || '')) {
    const m = before.match(/^\s*@(\w*)$/);
    if (m) return mk(filt(Object.keys(LATEX.bibTypes), m[1]).map(t => ({
      text: `${t}{clave,\n` + LATEX.bibTypes[t].map(f => `  ${f.padEnd(9)} = {},`).join('\n') + '\n}\n', displayText: '@' + t,
    })), before.length - m[1].length);
  }

  // Argumento de un comando: \cmd[...]{arg,arg
  const am = before.match(/\\(\w+\*?)((?:\[[^\]]*\])*)\{([^{}]*)$/);
  if (am) {
    const cmd = am[1], argAll = am[3], word = argAll.split(',').at(-1).trimStart(), from = cur.ch - word.length;
    let list = null;
    if (CITE_RE.test(cmd)) {
      list = filt(S.bibKeys, word, k => k.key + ' ' + k.author + ' ' + k.title + ' ' + k.year).map(k => ({
        text: k.key, render: el => el.innerHTML = `<b>${esc(k.key)}</b><span class="hint-desc">${esc((k.author.split(' and ')[0] || '').slice(0, 30))} ${esc(k.year)} — ${esc(k.title.slice(0, 50))}</span>`,
      }));
      if (!S.bibKeys.length) list = [{ text: word, displayText: '(no hay entradas en ningún .bib del proyecto)' }];
    } else if (REF_RE.test(cmd)) {
      list = filt(S.labels, word, l => l.key).map(l => ({ text: l.key, render: el => el.innerHTML = `<b>${esc(l.key)}</b><span class="hint-desc">${esc(l.file)}:${l.line + 1}</span>` }));
    } else if (/^(usepackage|RequirePackage)$/.test(cmd)) {
      list = filt(LATEX.packages, word);
    } else if (/^(begin|end)$/.test(cmd)) {
      const envs = filt([...new Set([...LATEX.environments, ...envsInProject()])], word);
      list = envs.map(env => cmd === 'end' ? env : {
        text: env, hint: (c2, data) => {
          const indent = line.match(/^\s*/)[0];
          const endPos = CodeMirror.Pos(cur.line, data.to.ch + (c2.getLine(cur.line).slice(data.to.ch).startsWith('}') ? 1 : 0));
          const body = env === 'itemize' || env === 'enumerate' ? '\\item ' : env === 'figure' || env === 'table' ? '\\centering\n' + indent + '  ' : '';
          c2.replaceRange(`${env}}\n${indent}  ${body}\n${indent}\\end{${env}}`, data.from, endPos);
          c2.setCursor(CodeMirror.Pos(cur.line + 1 + (body.includes('\n') ? 1 : 0), indent.length + 2 + (body.includes('\n') ? 0 : body.length)));
        },
      });
    } else if (/^(input|include|subfile|includeonly)$/.test(cmd)) {
      list = filt(S.files.filter(f => /\.tex$/i.test(f.path) && f.path !== S.meta.main).map(f => f.path.replace(/\.tex$/i, '')), word);
    } else if (cmd === 'includegraphics') {
      const gp = graphicsPaths();
      list = filt(S.files.filter(f => f.type === 'file' && /\.(png|jpe?g|pdf|eps|svg)$/i.test(f.path)).map(f => {
        const pre = gp.find(g => f.path.startsWith(g)); return pre ? f.path.slice(pre.length) : f.path;
      }), word);
    } else if (/^(bibliography|addbibresource)$/.test(cmd)) {
      list = filt(S.files.filter(f => /\.bib$/i.test(f.path)).map(f => cmd === 'bibliography' ? f.path.replace(/\.bib$/i, '') : f.path), word);
    } else if (cmd === 'bibliographystyle') {
      list = filt(LATEX.bibStyles, word);
    }
    if (list) return mk(list, from);
  }

  // Nombre de comando
  const cmM = before.match(/\\([a-zA-Z]*)$/);
  if (cmM) {
    const w = cmM[1];
    const all = [...new Set([...LATEX.commands, ...commandsInProject()])];
    const list = all.filter(x => x.toLowerCase().startsWith(w.toLowerCase())).sort((a, b) => a.length - b.length).slice(0, 80).map(x => ({
      text: x, displayText: '\\' + x,
      hint: (c2, data) => {
        c2.replaceRange(x, data.from, data.to);
        const p = x.search(/\{\}|\[\]|\{\*\}|<>/);
        if (p >= 0) c2.setCursor(CodeMirror.Pos(cur.line, data.from.ch + p + 1));
        if (/^(begin|end|cite|ref|eqref|cref|Cref|autoref|usepackage|input|include|includegraphics|bibliography|addbibresource|citep|citet|parencite|textcite)/.test(x)) setTimeout(() => c2.showHint({ hint: latexHint, completeSingle: false }), 0);
      },
    }));
    return mk(list, cur.ch - w.length);
  }
  return null;
}
function envsInProject() {
  const s = new Set();
  for (const [p, d] of S.docs) if (/\.(tex|sty)$/i.test(p)) for (const m of d.doc.getValue().matchAll(/\\(?:newenvironment|newtheorem)\{(\w+\*?)\}/g)) s.add(m[1]);
  return [...s];
}
function commandsInProject() {
  const s = new Set();
  for (const [p, d] of S.docs) if (/\.(tex|sty)$/i.test(p)) for (const m of d.doc.getValue().matchAll(/\\(?:newcommand|renewcommand|DeclareMathOperator|def)\*?\{?\\(\w+)\}?(?:\[(\d)\])?/g)) s.add(m[1] + (m[2] ? '{}'.repeat(+m[2]) : ''));
  return [...s];
}
function graphicsPaths() {
  const out = [];
  for (const [p, d] of S.docs) if (/\.tex$/i.test(p)) {
    const m = d.doc.getValue().match(/\\graphicspath\{((?:\{[^}]*\})+)\}/);
    if (m) for (const g of m[1].matchAll(/\{([^}]*)\}/g)) out.push(g[1].replace(/^\.\//, ''));
  }
  return out;
}

// ---------------- Compilación ----------------
async function compileNow() {
  await flushAll();
  if (S.compiling) { S.recompile = true; return; }
  S.compiling = true;
  const btn = $('#compileBtn'); btn.disabled = true; btn.textContent = '⏳ Compilando…';
  $('#compileStatus').textContent = '';
  try {
    const r = await api('POST', P() + '/compile', { main: $('#mainSelect').value, engine: $('#engineSelect').value });
    S.lastIssues = r.issues;
    renderIssues(r.issues);
    $('#log').textContent = r.raw;
    const errs = r.issues.filter(i => i.level === 'error').length;
    $('#compileStatus').textContent = `${r.ok ? 'OK' : 'Falló'} en ${(r.durationMs / 1000).toFixed(1)} s`;
    if (r.pdf) showPdf(true);
    if (!r.ok || errs) switchTab(r.ok ? 'pdf' : 'issues');
    if (!r.ok && !errs) switchTab('log');
    markErrors();
  } catch (e) {
    toast(e.message, 1);
    $('#issues').innerHTML = `<div class="issue error"><div class="msg">${esc(e.message)}</div></div>`; switchTab('issues');
  } finally {
    S.compiling = false; btn.disabled = false; btn.textContent = '▶ Compilar';
    if (S.recompile) { S.recompile = false; compileNow(); }
  }
}
$('#compileBtn').onclick = compileNow;
addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'Enter') && S.project) { e.preventDefault(); compileNow(); } });

function showPdf(reload) {
  const f = $('#pdfFrame');
  fetch(P() + '/pdf', { method: 'HEAD' }).then(r => {
    $('#pdfEmpty').classList.toggle('hidden', r.ok);
    if (r.ok) f.src = `${P()}/pdf?t=${Date.now()}${S.pdfPage ? '#page=' + S.pdfPage : ''}`;
    else f.removeAttribute('src');
  }).catch(() => {});
}
$('#downloadBtn').onclick = () => { const a = document.createElement('a'); a.href = P() + '/pdf?download=1'; a.click(); };
$('#revealBtn').onclick = () => api('POST', P() + '/reveal', {});
$('#cleanBtn').onclick = async () => { await api('POST', P() + '/clean', {}); toast('Archivos auxiliares borrados'); showPdf(); };

async function syncToPdf() {
  if (!S.current || !/\.tex$/i.test(S.current)) return;
  const r = await api('GET', `${P()}/synctex?file=${encodeURIComponent(S.current)}&line=${cm.getCursor().line + 1}`);
  if (!r.available) return toast('synctex no disponible en tu distribución', 1);
  if (r.page) { S.pdfPage = r.page; showPdf(); switchTab('pdf'); }
}

function hintFor(msg) {
  let m;
  if ((m = msg.match(/File `([^']+)\.(sty|cls)' not found/))) return `Falta el paquete "${m[1]}". En MiKTeX activa la instalación automática de paquetes, o instálalo desde MiKTeX Console. En TeX Live: tlmgr install ${m[1]}`;
  if (/Undefined control sequence/.test(msg)) return 'Comando desconocido: revisa la ortografía o añade el \\usepackage que lo define.';
  if ((m = msg.match(/Citation [`']([^']+)' .*undefined/))) return S.bibKeys.some(k => k.key === m[1]) ? 'La clave existe; vuelve a compilar (bibtex/biber necesitan otra pasada).' : `No existe "${m[1]}" en ningún .bib del proyecto.`;
  if ((m = msg.match(/Reference [`']([^']+)' .*undefined/))) return S.labels.some(l => l.key === m[1]) ? 'La etiqueta existe; vuelve a compilar.' : `No hay \\label{${m[1]}} en el proyecto.`;
  if (/Missing \$ inserted/.test(msg)) return 'Hay símbolos matemáticos (_ ^ etc.) fuera de modo matemático; rodéalos con $...$ o escápalos (\\_).';
  if (/File `([^']+)' not found/.test(msg)) return 'Comprueba la ruta del archivo (mayúsculas, extensión, \\graphicspath).';
  if (/hooks Error: Generic hooks cannot be added/.test(msg)) return 'Conflicto típico de babel en español con otro paquete (p. ej. biblatex-apa): usa \\usepackage[spanish,es-noshorthands]{babel}.';
  if (/Emergency stop|Fatal error/.test(msg)) return 'Error fatal: corrige el primer error de la lista.';
  return '';
}
function renderIssues(issues) {
  const order = { error: 0, warning: 1, typesetting: 2 };
  issues = [...issues].sort((a, b) => order[a.level] - order[b.level]);
  const errs = issues.filter(i => i.level === 'error').length, warns = issues.length - errs;
  const badge = $('#issueCount');
  badge.textContent = errs || warns || '';
  badge.className = 'badge' + (errs ? '' : warns ? ' warn' : '');
  const box = $('#issues'); box.innerHTML = issues.length ? '' : '<div class="muted">Sin errores ni avisos 🎉</div>';
  for (const i of issues) {
    const el = document.createElement('div');
    el.className = 'issue ' + i.level;
    const file = i.file || S.meta.main || $('#mainSelect').value;
    const h = hintFor(i.message);
    el.innerHTML = `<div class="loc">${{ error: 'Error', warning: 'Aviso', typesetting: 'Composición' }[i.level]} · ${esc(i.file || '')}${i.line ? ':' + i.line : ''}</div>
      <div class="msg">${esc(i.message)}</div>${h ? `<div class="hint">💡 ${esc(h)}</div>` : ''}`;
    el.onclick = () => jumpTo(file, i.line);
    box.appendChild(el);
  }
}
function markErrors() {
  if (!cm) return;
  for (const [, d] of S.docs) d.doc.eachLine(l => d.doc.removeLineClass(l, 'background', 'cm-err-line'));
  for (const i of S.lastIssues) {
    if (i.level !== 'error' || !i.line) continue;
    const d = S.docs.get(i.file || S.meta.main); if (!d) continue;
    if (i.line - 1 < d.doc.lineCount()) d.doc.addLineClass(i.line - 1, 'background', 'cm-err-line');
  }
}

function switchTab(t) {
  $$('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
  $$('.tabbody').forEach(b => b.classList.toggle('hidden', b.id !== 'tab-' + t));
}
$$('.tab').forEach(b => b.onclick = () => switchTab(b.dataset.tab));

// ---------------- Paneles redimensionables ----------------
$$('.gutter').forEach(g => g.onmousedown = e => {
  const target = document.getElementById(g.dataset.for);
  const startX = e.clientX, startW = target.getBoundingClientRect().width;
  const frames = $$('iframe'); frames.forEach(f => f.style.pointerEvents = 'none');
  const move = ev => { target.style.flex = 'none'; target.style.width = Math.max(140, startW + ev.clientX - startX) + 'px'; cm && cm.refresh(); };
  const up = () => { removeEventListener('mousemove', move); removeEventListener('mouseup', up); frames.forEach(f => f.style.pointerEvents = ''); };
  addEventListener('mousemove', move); addEventListener('mouseup', up);
});

// ---------------- Rutas ----------------
$('#backBtn').onclick = async () => { await flushAll(); location.hash = ''; };
async function route() {
  const m = location.hash.match(/^#\/p\/(.+)$/);
  try { if (m) await openProject(decodeURIComponent(m[1])); else await showHome(); }
  catch (e) { toast(e.message, 1); location.hash = ''; }
}
addEventListener('hashchange', route);
route();
