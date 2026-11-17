import { extractPage } from './lib/extract.js';
import { getBase, setBase, post } from './lib/api.js';
import { parseMd } from './lib/md.js';

/* NaN's side panel. NaN reads the page you are on (only when you let it) and answers about it; every piece of page or model text
   reaches the screen through textContent, never as HTML. */
const ORIGINS = ['http://*/*', 'https://*/*'];
const OFFLINE = 'NaN-Team đang tạm khóa để phát triển dự án';
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (id) => document.getElementById(id);
const state = { tab: null, access: false, attach: true, busy: false, online: false, history: [], page: null };

const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const feed = () => $('feed');
const scrollEnd = () => { const f = feed(); f.scrollTop = f.scrollHeight; };

/* ───────────── markdown → DOM ───────────── */
function inlineNodes(parts) {
  return parts.map((p) => {
    if (p.t === 'b') return el('b', '', p.v);
    if (p.t === 'code') return el('code', '', p.v);
    if (p.t === 'a') { const a = el('a', '', p.v); a.href = p.href; a.target = '_blank'; a.rel = 'noreferrer'; return a; }
    return document.createTextNode(p.v);
  });
}
function renderMd(into, text) {
  into.replaceChildren();
  for (const b of parseMd(text)) {
    if (b.k === 'h') { const h = el('h3'); h.append(...inlineNodes(b.inline)); into.append(h); }
    else if (b.k === 'p') { const p = el('p'); p.append(...inlineNodes(b.inline)); into.append(p); }
    else if (b.k === 'quote') { const q = el('blockquote'); q.append(...inlineNodes(b.inline)); into.append(q); }
    else { const l = el(b.k); for (const it of b.items) { const li = el('li'); li.append(...inlineNodes(it)); l.append(li); } into.append(l); }
  }
}
/** a reply that types itself word by word, formatted as it goes */
function stream(body, text) {
  if (REDUCED) { renderMd(body, text); return Promise.resolve(); }
  const parts = text.split(/(\s+)/); let i = 0;
  body.classList.add('caret');
  return new Promise((done) => {
    const id = setInterval(() => {
      i = Math.min(parts.length, i + 2); renderMd(body, parts.slice(0, i).join('')); scrollEnd();
      if (i >= parts.length) { clearInterval(id); body.classList.remove('caret'); done(); }
    }, 45);
  });
}

/* ───────────── feed ───────────── */
function hideEmpty() { const e = $('empty'); if (e) e.remove(); }
function addMsg(kind, text) {
  hideEmpty();
  const m = el('div', `msg ${kind}`), body = el('div', 'body');
  if (text != null) { if (kind === 'me') body.textContent = text; else renderMd(body, text); }
  m.append(body); feed().append(m); scrollEnd(); return { m, body };
}
function thinking(label) {
  const { m, body } = addMsg('nan');
  const t = el('div', 'think'); t.append(el('i'), el('span', 'shimmer', label)); body.append(t); return { m, body, say: (s) => { t.lastChild.textContent = s; } };
}
const svg = (tag, attrs) => { const n = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };
const tone = (v) => (v >= 75 ? 'var(--ok)' : v >= 50 ? 'var(--warn)' : 'var(--bad)');

function gauge(score) {
  const w = el('div', 'gauge'), s = svg('svg', { width: 84, height: 84, viewBox: '0 0 84 84' });
  const r = 36; s.append(svg('circle', { cx: 42, cy: 42, r, fill: 'none', stroke: '#eceef0', 'stroke-width': 8 }));
  const arc = svg('circle', { cx: 42, cy: 42, r, fill: 'none', stroke: tone(score), 'stroke-width': 8, 'stroke-linecap': 'round', pathLength: 1, 'stroke-dasharray': '1', 'stroke-dashoffset': REDUCED ? String(1 - score / 100) : '1' });
  arc.style.transition = 'stroke-dashoffset .9s cubic-bezier(.2,.8,.2,1)'; s.append(arc);
  const num = el('div', 'num', String(score)); w.append(s, num);
  if (!REDUCED) requestAnimationFrame(() => requestAnimationFrame(() => arc.setAttribute('stroke-dashoffset', String(1 - score / 100))));
  return w;
}
/** "What I read" line, then the review as a card */
function reviewCard(page, r) {
  const card = el('div', 'card');
  const h = el('div', 'card-h'); h.append(el('b', '', 'Page review')); h.append(el('small', '', hostOf(page.url))); card.append(h);
  const b = el('div', 'card-b'), score = el('div', 'score');
  const tx = el('div'); const n = { pass: 0, warn: 0, fail: 0 }; r.checks.forEach((c) => { n[c.status]++; });
  tx.append(el('p', '', r.summary));
  const tags = el('div'); tags.style.marginTop = '6px';
  tags.append(el('span', 'tag ok', `${n.pass} pass`), el('span', 'tag warn', `${n.warn} warn`), el('span', 'tag bad', `${n.fail} fail`)); tx.append(tags);
  score.append(gauge(r.score), tx); b.append(score);
  const ul = el('ul', 'checks');
  for (const c of r.checks) {
    const li = el('li'); const ic = el('span', `ic ${c.status}`, c.status === 'pass' ? '✓' : c.status === 'warn' ? '–' : '×');
    const t = el('div'); t.append(el('b', '', c.label), el('small', '', c.detail)); li.append(ic, t); ul.append(li);
  }
  b.append(ul); card.append(b);
  const f = el('div', 'card-f'); const ask = el('button', 'btn dark', 'Ask NaN how to fix this'); ask.type = 'button';
  ask.addEventListener('click', () => send('How do I fix the failing and weak checks on this page, most important first?'));
  f.append(ask); card.append(f);
  hideEmpty(); const m = el('div', 'msg nan'); m.append(card); feed().append(m); m.scrollIntoView({ block: 'start', behavior: REDUCED ? 'auto' : 'smooth' });
}
function noticeNeedAccess() {
  hideEmpty(); const m = el('div', 'msg nan'), n = el('div', 'notice');
  n.append(el('b', '', 'Let NaN read this site'), el('p', '', 'Chrome has not given NaN access to this page. Turn on “NaN can read this browser” and NaN can read the pages you ask about. It reads nothing until you ask.'));
  const b = el('button', 'btn dark', 'Turn on access'); b.type = 'button'; b.addEventListener('click', () => toggleAccess(true)); n.append(b);
  m.append(n); feed().append(m); scrollEnd();
}

/* ───────────── access, tab, context chip ───────────── */
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u || ''; } };
const readable = (u) => /^https?:\/\//i.test(u || '');
async function refreshAccess() {
  state.access = await chrome.permissions.contains({ origins: ORIGINS }).catch(() => false);
  $('switch').setAttribute('aria-checked', String(state.access));
  $('access-title').textContent = state.access ? 'NaN can read this browser' : 'NaN can’t read pages yet';
  paintStatus();
}
async function toggleAccess(on) {
  try {
    if (on) await chrome.permissions.request({ origins: ORIGINS });
    else await chrome.permissions.remove({ origins: ORIGINS });
  } catch (e) { addMsg('err', e.message || 'Chrome did not change the access.'); }
  await refreshAccess(); await refreshTab();
}
function paintStatus() {
  $('dot').classList.toggle('on', state.online && state.access);
  $('status-text').textContent = !state.online ? OFFLINE : state.access ? 'Ready. NaN reads a page only when you ask.' : 'Connected. Turn access on to let it read pages.';
}
async function refreshTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
  if (state.tab?.id !== tab?.id || state.tab?.url !== tab?.url) state.page = null;
  state.tab = tab || null; paintChip();
}
function paintChip() {
  const t = state.tab, chip = $('ctx');
  if (!t || (t.url && !readable(t.url))) { chip.hidden = true; return; }
  chip.hidden = false;
  $('ctx-kind').textContent = t.url ? `Tab · ${hostOf(t.url)}${state.attach ? '' : ' · not attached'}` : 'Tab · turn on access to read it';
  $('ctx-title').textContent = t.title || t.url || 'This tab';
  const ic = $('ctx-icon'); if (t.favIconUrl) { ic.src = t.favIconUrl; ic.hidden = false; } else ic.hidden = true;
  chip.style.opacity = state.attach ? '1' : '.55';
}
$('ctx-x').addEventListener('click', () => { state.attach = !state.attach; paintChip(); });

/** The page itself, read in the visitor's own browser (their session, their view). */
async function readPage() {
  if (!state.tab || !Number.isInteger(state.tab.id)) throw new Error('There is no page open to read.');
  if (state.tab.url && !readable(state.tab.url)) throw new Error('NaN can only read normal web pages, not browser pages.');
  let res;
  try { res = await chrome.scripting.executeScript({ target: { tabId: state.tab.id }, func: extractPage }); }
  catch (e) { const err = new Error(/permission|access|host/i.test(String(e.message)) ? 'NEEDS_ACCESS' : String(e.message || 'Could not read this page.')); throw err; }
  const page = res?.[0]?.result;
  if (!page) throw new Error('NaN could not read this page. Open a normal web page.');
  state.page = page; return page;
}
const readLine = (page) => { const l = el('div', 'read'); l.textContent = `Read ${hostOf(page.url)} · ${String(page.text || '').split(/\s+/).filter(Boolean).length} words, ${page.headings?.length ?? 0} headings, ${page.schemaTypes?.length ?? 0} data types`; return l; };

/* ───────────── talking ───────────── */
function setBusy(v) { state.busy = v; $('send').disabled = v || !$('input').value.trim(); }
async function send(raw) {
  const text = String(raw ?? $('input').value).trim();
  if (!text || state.busy) return;
  $('input').value = ''; autosize(); setBusy(true); addMsg('me', text);
  const wait = thinking('Reading the page…');
  try {
    let page = null;
    if (state.attach && state.tab && (!state.tab.url || readable(state.tab.url))) {
      try { page = await readPage(); wait.m.querySelector('.think').replaceWith(readLine(page)); wait.body.append(thinkingLine('Thinking…')); }
      catch (e) { if (e.message === 'NEEDS_ACCESS') { wait.m.remove(); noticeNeedAccess(); setBusy(false); return; } wait.say('Thinking…'); }
    } else wait.say('Thinking…');
    const body = { text, original: text, agent: 'nan', history: state.history.slice(-8), state: page ? { page: { url: page.url, title: page.title, description: page.description, schemaTypes: page.schemaTypes, hasFaq: page.hasFaq } } : {} };
    if (page) body.page = { url: page.url, title: page.title, description: page.description, headings: (page.headings || []).slice(0, 20), schemaTypes: page.schemaTypes, hasFaq: page.hasFaq, text: String(page.text || '').slice(0, 6000) };
    const j = await post('/api/one/chat', body);
    if (typeof j?.reply !== 'string') throw new Error('The server sent no usable reply.');
    wait.body.querySelectorAll('.think').forEach((x) => x.remove());
    const target = el('div'); wait.body.append(target); await stream(target, j.reply);
    state.history.push({ who: 'me', name: 'You', text }, { who: 'nan', name: 'NaN', text: j.reply });
    handOff(j.actions || [], wait.body, page);
  } catch (e) { wait.m.remove(); addMsg('err', e.message || 'Something went wrong.'); }
  setBusy(false);
}
const thinkingLine = (s) => { const t = el('div', 'think'); t.append(el('i'), el('span', 'shimmer', s)); return t; };
/** real jobs run in Picked, where they stream; the panel offers to hand them over */
function handOff(actions, body, page) {
  const a = actions.find((x) => ['analyze', 'audit', 'ask', 'apps'].includes(x.type));
  if (!a) return;
  const q = a.type === 'analyze' ? `Analyze ${a.q || (page ? hostOf(page.url) : '')}` : a.type === 'audit' ? `Audit ${a.brand || ''} ${a.fresh ? 'fresh' : 'quick'}` : a.type === 'ask' ? `Ask Gemini: ${a.q}` : `Use apps: ${a.q}`;
  const b = el('button', 'btn dark', 'Run this in Picked'); b.type = 'button'; b.style.marginTop = '8px';
  b.addEventListener('click', async () => { chrome.tabs.create({ url: `${await getBase()}/?ask=${encodeURIComponent(q.trim())}` }); });
  body.append(b);
}
async function reviewThisPage() {
  if (state.busy) return; setBusy(true); addMsg('me', 'Review this page for AI');
  const wait = thinking('Reading the page…');
  try {
    const page = await readPage(); wait.say('Scoring it the way an AI assistant would read it…');
    const r = await post('/api/page/review', { page });
    wait.m.remove(); const l = el('div', 'msg nan'); l.append(readLine(page)); hideEmpty(); feed().append(l); reviewCard(page, r);
  } catch (e) { wait.m.remove(); if (e.message === 'NEEDS_ACCESS') noticeNeedAccess(); else addMsg('err', e.message || 'Could not review this page.'); }
  setBusy(false);
}
async function analyzeInPicked() {
  const t = state.tab; if (!t?.url || !readable(t.url)) { addMsg('err', 'Open a normal web page first.'); return; }
  chrome.tabs.create({ url: `${await getBase()}/?ask=${encodeURIComponent(`Analyze ${hostOf(t.url)}`)}` });
}

/* ───────────── composer ───────────── */
function autosize() { const t = $('input'); t.style.height = 'auto'; t.style.height = `${Math.min(140, t.scrollHeight)}px`; $('send').disabled = state.busy || !t.value.trim(); }
$('input').addEventListener('input', autosize);
$('input').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
$('chat').addEventListener('submit', (e) => { e.preventDefault(); send(); });
$('plus').addEventListener('click', (e) => { e.stopPropagation(); $('menu').hidden = !$('menu').hidden; });
document.addEventListener('click', () => { $('menu').hidden = true; });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('menu').hidden = true; });
$('menu').addEventListener('click', (e) => {
  const a = e.target.closest('button')?.dataset.act; $('menu').hidden = true;
  if (a === 'attach') { state.attach = true; paintChip(); $('input').focus(); } else if (a === 'review') reviewThisPage(); else if (a === 'analyze') analyzeInPicked();
});
$('switch').addEventListener('click', () => toggleAccess(!state.access));
$('more').addEventListener('click', () => { $('settings').hidden = !$('settings').hidden; });
$('settings-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try { $('base').value = await setBase($('base').value); $('settings-result').textContent = 'Saved.'; await health(); } catch (err) { $('settings-result').textContent = err.message; }
});
const STARTERS = ['Read this page', 'Review this page for AI', 'What would an AI assistant say about this brand?', 'What should I fix first?'];
for (const s of STARTERS) { const b = el('button', '', s); b.type = 'button'; b.addEventListener('click', () => (s === 'Review this page for AI' ? reviewThisPage() : send(s === 'Read this page' ? 'Read this page and tell me what it is, what it sells and how AI assistants will see it.' : s))); $('starters').append(b); }

async function health() {
  let ok = false;
  try { const r = await fetch(`${await getBase()}/api/health`, { signal: AbortSignal.timeout(10_000), credentials: 'omit' }); const d = await r.json(); ok = r.ok && d?.ok === true; } catch { /* the status line says it */ }
  state.online = ok; paintStatus();
}
async function consumePending(p) {
  if (!p || !Number.isInteger(p.tabId)) return;
  try { state.tab = await chrome.tabs.get(p.tabId); paintChip(); if (p.selectionText) { $('input').value = p.selectionText; autosize(); } $('input').focus(); await chrome.storage.session.remove('pending'); } catch (e) { addMsg('err', e.message); }
}
chrome.storage.onChanged.addListener((c, area) => { if (area === 'session' && c.pending?.newValue) consumePending(c.pending.newValue); if (area === 'local' && c.base) health(); });
chrome.tabs.onActivated.addListener(() => refreshTab());
chrome.tabs.onUpdated.addListener((id, change) => { if (id === state.tab?.id && (change.url || change.title || change.status === 'complete')) refreshTab(); });
chrome.permissions.onAdded?.addListener(() => refreshAccess().then(refreshTab));
chrome.permissions.onRemoved?.addListener(() => refreshAccess().then(refreshTab));
(async () => {
  $('base').value = await getBase();
  await refreshAccess(); await refreshTab();
  const { pending } = await chrome.storage.session.get('pending'); await consumePending(pending);
  await health(); autosize();
})().catch((e) => addMsg('err', e.message));
