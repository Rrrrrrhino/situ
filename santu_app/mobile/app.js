/* 四土 · 手机版 前端逻辑
   复用桌面后端（/api/*）。点词讲解 / 选区讲解 / 追问 / 音频 / 滚动阅读 / 存续。 */
'use strict';

/* ============ 内联 SVG 图标集（阶段6：细线暖金，currentColor 继承） ============ */
const SVG = {
  hamburger:`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>`,
  book:`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M12 6c-2-1.2-5-1.2-7 0v11c2-1.2 5-1.2 7 0 2-1.2 5-1.2 7 0V6c-2-1.2-5-1.2-7 0z"/><path d="M12 6v11"/></svg>`,
  doc:`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"><path d="M7 3.7h6.4L18 8.2V19a1.3 1.3 0 0 1-1.3 1.3H7A1.3 1.3 0 0 1 5.7 19V5A1.3 1.3 0 0 1 7 3.7z"/><path d="M13.2 3.9V8.4h4.4"/><path d="M8.6 12.6h6.8M8.6 15.6h6.8"/></svg>`,
  trash:`<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"><path d="M5 7h14M10 7V5.6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V7M17.4 7l-.8 12a1 1 0 0 1-1 .95H8.4a1 1 0 0 1-1-.95L6.6 7"/><path d="M10 11v5.4M14 11v5.4"/></svg>`,
  speaker:`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M3 9v6h3.5l5.5 4.5v-15L6.5 9z" fill="currentColor" stroke="none"/><path d="M16 9a4.5 4.5 0 0 1 0 6" stroke-linecap="round"/><path d="M18.8 6a8.5 8.5 0 0 1 0 12" stroke-linecap="round"/></svg>`,
  search:`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20.5 20.5l-4.3-4.3"/></svg>`,
  starFill:`<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 3.6l2.55 5.17 5.7.83-4.13 4.02.98 5.68L12 16.99l-5.1 2.31.98-5.68L3.75 9.6l5.7-.83z"/></svg>`,
  starLine:`<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M12 3.6l2.55 5.17 5.7.83-4.13 4.02.98 5.68L12 16.99l-5.1 2.31.98-5.68L3.75 9.6l5.7-.83z"/></svg>`,
  download:`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M8 11l4 4 4-4"/><path d="M5 19h14"/></svg>`,
  upload:`<svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4M8 8l4-4 4 4"/><path d="M5 15v3a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 18v-3"/></svg>`,
  mic:`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z"/><path d="M6 11a6 6 0 0 0 12 0"/><path d="M12 17v3.5M9 20.5h6"/></svg>`,
};

/* ============ 独立复盘窗版式（越早越好，避免亮色闪一下） ============
   review-only 类给 review.css 门控印刷品化布局；夜间令牌默认跟随系统外观，
   手动切过一次后记住（localStorage situ_night: '1'|'0'）。 */
(function () {
  if (location.hash !== '#review') return;
  try {
    document.body.classList.add('review-only');
    const saved = localStorage.getItem('situ_night');
    const night = saved === null
      ? window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches
      : saved === '1';
    if (night) document.documentElement.dataset.night = '1';
    // 没手动定过档就继续跟随系统切换
    if (saved === null && window.matchMedia) {
      matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (localStorage.getItem('situ_night') !== null) return;
        if (e.matches) document.documentElement.dataset.night = '1';
        else delete document.documentElement.dataset.night;
      });
    }
  } catch (_) {}
})();

/* ============ 小工具 ============ */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
const esc = s => (s == null ? '' : String(s)).replace(/[&<>"]/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[m]));
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(method, args) {
  const LA = window.LocalApi;
  if (LA && typeof LA[method] === 'function') {
    return LA[method](args || {});
  }
  return { error: '未知方法 ' + method };
}

let _toastT;
function toast(msg, ms = 2200) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(_toastT); _toastT = setTimeout(() => t.classList.remove('show'), ms);
}

function timeAgo(sec) {
  if (!sec) return '';
  const d = Date.now() / 1000 - sec;
  if (d < 60) return '刚刚';
  if (d < 3600) return Math.floor(d / 60) + ' 分钟前';
  if (d < 86400) return Math.floor(d / 3600) + ' 小时前';
  if (d < 86400 * 30) return Math.floor(d / 86400) + ' 天前';
  return new Date(sec * 1000).toLocaleDateString('zh-CN');
}

// followup 答案的轻量 Markdown（**粗** `码` 段落）
function mdLite(t) {
  const safe = esc(t);
  return safe.split(/\n{2,}/).map(p =>
    '<p>' + p.replace(/\n/g, '<br>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>') + '</p>'
  ).join('');
}

/* ============ 全局状态 ============ */
const S = {
  mode: null,            // 'article' | 'book'
  doc_id: null,
  title: '',
  book: null,            // {toc, idx, count, title}
  level: localStorage.getItem('situ_level') || 'cet4-6',
  accent: localStorage.getItem('situ_accent') || 'uk',
  fontSize: +(localStorage.getItem('situ_fs') || 18),
  cur: null,             // 当前讲解对象上下文
  followups: [],         // 当前讲解的追问线程
};

function applyFontSize() {
  document.documentElement.style.setProperty('--article-fs', S.fontSize + 'px');
}

/* ============ 抽屉 ============ */
function openDrawer() { $('#drawer').classList.add('show'); $('#drawerScrim').classList.add('show'); }
function closeDrawer() { $('#drawer').classList.remove('show'); $('#drawerScrim').classList.remove('show'); }

/* ============ 通用 sheet ============ */
function openSheet(html, title) {
  const body = $('#sheetBody'); body.innerHTML = html; body.scrollTop = 0;
  const th = $('#sheetTitle');
  if (title) { th.classList.remove('hidden'); $('h3', th).textContent = title; }
  else th.classList.add('hidden');
  $('#sheet').classList.add('show'); $('#sheetScrim').classList.add('show');
}
function closeSheet() { $('#sheet').classList.remove('show'); $('#sheetScrim').classList.remove('show'); }

/* ============ overlay（生词本 / 设置） ============ */
/* 所有 .overlay 基础 z-index 同为 45 → 同时开两层时按 DOM 顺序绘制，谁在 HTML 里
   靠后谁压上面（曾致：复盘窗里点 ⚙，设置在 ovReview 身后展开，看起来「点了没反应」）。
   让「最新打开的浮层永远在最上」：每次 open 发一个递增 z-index。 */
let _ovTopZ = 46;
function openOverlay(id) { const el = $('#' + id); el.style.zIndex = String(_ovTopZ++); el.classList.add('show'); }
function closeOverlay(id) { $('#' + id).classList.remove('show'); }

/* ============ 路由 / 导航 ============ */
function go(nav) {
  closeDrawer();
  if (nav === 'home') { renderHome(); return; }
  // 切走 home 屏：清录音卡轮询，防泄漏（spec §3）
  _stopRecPoll();
  if (nav === 'add') openAddSheet();
  else if (nav === 'vocab') openVocab();
  else if (nav === 'discover') openDiscover();
  else if (nav === 'review') openReview();
  else if (nav === 'settings') openSettings();
}

function openDiscover() { closeDrawer(); if (window.renderDiscover) renderDiscover(); }

function openReview() { if (window.renderReview) renderReview(); else openOverlay('ovReview'); }

/* ============ 对话录音卡（阶段10.1：并入首页） ============ */
let _recPollT = null;

function _stopRecPoll() {
  if (_recPollT) { clearInterval(_recPollT); _recPollT = null; }
}

function _fmtElapsed(sec) {
  sec = sec || 0;
  const m = Math.floor(sec / 60), s = sec % 60;
  return m + ':' + String(s).padStart(2, '0');
}

/** 渲染对话录音卡；status 请求失败（如手机版无 server）→ 返回 null，整卡不渲染（spec §3）。 */
async function _renderRecCard() {
  let status;
  try { status = await window.LocalApi.recorder_status(); }
  catch (_) { return null; }

  const card = el('div', 'rec-card');
  _fillRecCard(card, status);
  return card;
}

function _fillRecCard(card, status) {
  if (status.recording) {
    card.innerHTML = `
      <div class="rec-elapsed"><span class="rec-dot"></span>已录 ${esc(_fmtElapsed(status.elapsedSec))}</div>
      <button class="btn rec-main block" data-act="stop">停止录音</button>`;
  } else {
    const lastErr = status.error
      ? (REC_PERM_RE.test(status.error) ? _recPermGuide(status.error)
         : `<div class="rec-lasterr">上次未能开始：${esc(status.error)}</div>`) : '';
    card.innerHTML = `
      <div class="rec-head"><div class="rec-ico">${SVG.mic}</div><div class="rec-title">录音语料</div></div>
      <div class="rec-sub">和 AI 语音对话、或自己说一段独白，双轨录下，完了来复盘</div>
      <button class="btn rec-main block" data-act="start">开始录音</button>
      ${lastErr}`;
  }
  const btn = $('.rec-main', card);
  btn.onclick = () => btn.dataset.act === 'start' ? _recStart(card) : _recStop(card);
}

/* 权限类失败的识别与指引。2026-07-07 起录音引擎由四土直接 spawn（不再走 open）——
   responsible process = 四土，屏幕录制/麦克风权限都记在「四土」一个名下，不再有第二个授权对象。
   SCStream/AVAudioEngine 的 TCC 报错多为英文（declined/denied/TCC/-3801），一并匹配。 */
const REC_PERM_RE = /TCC|declin|denied|not permitted|permission|3801|SCStream|权限|屏幕录制|麦克风/i;

function _recPermGuide(errMsg) {
  return `<div class="rec-lasterr">需要系统权限——授权对象是「<b>四土</b>」：<br>
    ① 系统设置 → 隐私与安全性 → <b>麦克风</b> → 打开「四土」<br>
    ② 同一页 → <b>屏幕录制与系统录音</b> → 打开「四土」（用来录 AI 的声音）<br>
    两处都开了再点「开始录音」。列表里没有？先点一次「开始录音」让它申请，再回设置里找。<br>
    <span class="rec-lasterr-raw">${esc(errMsg)}</span></div>`;
}

function _recPermHint(errMsg) {
  if (REC_PERM_RE.test(errMsg || '')) {
    return '需要系统权限：到 系统设置→隐私与安全性 给「四土」开启 麦克风 + 屏幕录制与系统录音（详见录音卡上的说明）';
  }
  return errMsg;
}

async function _recStart(card) {
  const btn = $('.rec-main', card);
  btn.disabled = true;
  try {
    const res = await window.LocalApi.recorder_start();
    if (res.ok) {
      const status = await window.LocalApi.recorder_status();
      _fillRecCard(card, status);
      _startRecPoll(card);
    } else {
      toast(_recPermHint(res.error || '开始录音失败'), 3600);
      const status = await window.LocalApi.recorder_status();
      _fillRecCard(card, status);
    }
  } catch (e) {
    toast('开始录音失败：' + ((e && e.message) || e), 3600);
  } finally {
    btn.disabled = false;
  }
}

async function _recStop(card) {
  const btn = $('.rec-main', card);
  btn.disabled = true;
  try {
    const res = await window.LocalApi.recorder_stop();
    _stopRecPoll();
    if (res.ok) {
      toast('录音已保存');
      card.innerHTML = `
        <div class="rec-head"><div class="rec-ico">${SVG.mic}</div><div class="rec-title">录音语料</div></div>
        <div class="rec-sub">和 AI 语音对话、或自己说一段独白，双轨录下，完了来复盘</div>
        <button class="btn rec-main block" data-act="start">开始录音</button>
        <a class="rec-goreview" data-nav="review">去复盘 →</a>`;
      $('.rec-main', card).onclick = () => _recStart(card);
      $('.rec-goreview', card).onclick = () => go('review');
    } else {
      toast(_recPermHint(res.error || '停止录音失败'), 3600);
      const status = await window.LocalApi.recorder_status();
      _fillRecCard(card, status);
      if (status.recording) _startRecPoll(card);
    }
  } catch (e) {
    toast('停止录音失败：' + ((e && e.message) || e), 3600);
  } finally {
    btn.disabled = false;
  }
}

/** 每 1s 轮询 status 刷新计时；态由 status 驱动（页面刷新/重进也能恢复录音中态）。 */
function _startRecPoll(card) {
  _stopRecPoll();
  _recPollT = setInterval(async () => {
    if (!document.body.contains(card)) { _stopRecPoll(); return; }
    let status;
    try { status = await window.LocalApi.recorder_status(); }
    catch (_) { return; }
    if (!status.recording) { _stopRecPoll(); }
    _fillRecCard(card, status);
  }, 1000);
}

/* ============ 书架 / 首页 ============ */
async function renderHome() {
  setTopTitle(null);
  hideBookChrome();
  _stopRecPoll(); // 离开 home 时会清；重进先清一次防旧 interval 残留
  const app = $('#app');
  app.className = 'view pad';
  app.innerHTML = '<div class="loading-line"><span class="spin"></span>载入书架…</div>';
  let lib = [];
  try { lib = await api('list_library'); } catch (e) { app.innerHTML = errBox('载入书架失败：' + e.message); return; }
  lib = lib.filter(it => (it.title || '').trim() && it.title !== 'PK');
  app.innerHTML = '';

  const recCard = await _renderRecCard();
  if (recCard) {
    app.appendChild(recCard);
    if ($('.rec-elapsed', recCard)) _startRecPoll(recCard);
  }

  if (!lib.length) {
    app.appendChild(el('div', 'empty',
      '<div class="big">四</div><p>还没有读过的内容<br>点下面开始第一篇</p>'));
    const b = el('button', 'btn block', '＋ 添加文章 / 导入书');
    b.style.marginTop = '22px'; b.onclick = openAddSheet; app.appendChild(b);
    return;
  }

  // 继续阅读（最近一条）
  const top = lib[0];
  const cont = el('div', 'cont-card');
  cont.innerHTML = `<div class="k">继续阅读</div>
    <div class="t">${esc(top.title)}</div>
    <div class="m">${top.mode === 'book' ? SVG.book + ' 书' : SVG.doc + ' 文章'} · ${top.vocab_count || 0} 生词 · ${timeAgo(top.saved_at)}</div>
    <div class="go">→</div>`;
  cont.onclick = () => openArchive(top.id);
  app.appendChild(cont);

  app.appendChild(el('div', 'sec-h', '书架'));
  const list = el('div', 'lib-list');
  lib.forEach(it => list.appendChild(libItem(it)));
  app.appendChild(list);

  const add = el('button', 'btn ghost block', '＋ 添加新的');
  add.style.marginTop = '16px'; add.onclick = openAddSheet; app.appendChild(add);
}

function libItem(it) {
  const row = el('div', 'lib-item');
  row.innerHTML = `<div class="ico">${it.mode === 'book' ? SVG.book : SVG.doc}</div>
    <div class="body"><div class="t">${esc(it.title)}</div>
      <div class="m"><span class="vc">${it.vocab_count || 0} 生词</span><span>${timeAgo(it.saved_at)}</span></div></div>
    <button class="del" aria-label="删除">${SVG.trash}</button>`;
  row.onclick = e => { if (e.target.closest('.del')) return; openArchive(it.id); };
  $('.del', row).onclick = async e => {
    e.stopPropagation();
    if (!confirm('删除《' + it.title + '》的阅读记录？（生词本里的词不受影响）')) return;
    try { await api('delete_archive', { id: it.id }); row.remove(); toast('已删除'); }
    catch (err) { toast('删除失败'); }
  };
  return row;
}

function errBox(msg) { return `<div class="empty"><p>${esc(msg)}</p></div>`; }

/* ============ 打开存档 ============ */
async function openArchive(id) {
  closeSheet(); closeDrawer();
  showFull('<div class="loading-line"><span class="spin"></span>打开中…</div>');
  let r;
  try { r = await api('load_archive', { id }); }
  catch (e) { return showFull(errBox('打开失败：' + e.message)); }
  if (r.error) return showFull(errBox(r.error));
  mountDoc(r);
}

function showFull(html) { const a = $('#app'); a.className = 'view pad'; a.innerHTML = html; }

/* ============ 添加文章 / 导入书 ============ */
function openAddSheet() {
  closeDrawer();
  const html = `
    <div class="add-tabs">
      <button data-at="file" class="active">文件</button>
      <button data-at="url">网址</button>
      <button data-at="text">粘贴</button>
    </div>
    <div data-pane="file">
      <label class="filedrop" for="fileInput">
        <div class="big">${SVG.upload}</div><p>选取 EPUB / TXT 文件</p><small>EPUB 按章阅读 · TXT 整篇</small>
      </label>
      <input type="file" id="fileInput" accept=".epub,.txt,text/plain,application/epub+zip" style="display:none">
    </div>
    <div data-pane="url" class="hidden">
      <div class="field"><label>文章网址</label>
        <input type="url" id="urlInput" placeholder="https://…" autocomplete="off"></div>
      <button class="btn block" id="urlGo">开始阅读</button>
    </div>
    <div data-pane="text" class="hidden">
      <div class="field"><label>粘贴英文文本</label>
        <textarea id="textInput" placeholder="把要读的英文段落粘贴进来…"></textarea></div>
      <button class="btn block" id="textGo">开始阅读</button>
    </div>`;
  openSheet(html, '添加');
  const body = $('#sheetBody');
  $$('.add-tabs button', body).forEach(b => b.onclick = () => {
    $$('.add-tabs button', body).forEach(x => x.classList.toggle('active', x === b));
    $$('[data-pane]', body).forEach(p => p.classList.toggle('hidden', p.dataset.pane !== b.dataset.at));
  });
  $('#fileInput', body).onchange = e => { const f = e.target.files[0]; if (f) addFile(f); };
  $('#urlGo', body).onclick = () => { const u = $('#urlInput', body).value.trim(); if (u) addSource(u); };
  $('#textGo', body).onclick = () => {
    const t = $('#textInput', body).value.trim();
    if (t.length < 8) return toast('文本太短');
    addText(t);
  };
}

function addFile(file) {
  const rd = new FileReader();
  rd.onload = () => processStart(() => api('process_file', { name: file.name, data_url: rd.result, level: S.level }), '解析中…');
  rd.onerror = () => toast('读取文件失败');
  rd.readAsDataURL(file);
}
function addSource(src) { processStart(() => api('process', { source: src, level: S.level }), '抓取正文…'); }
function addText(t) {
  const data_url = 'data:text/plain;base64,' + btoa(unescape(encodeURIComponent(t)));
  processStart(() => api('process_file', { name: '粘贴文本.txt', data_url, level: S.level }), '解析中…');
}

async function processStart(fn, label) {
  closeSheet();
  showFull(`<div class="loading-line"><span class="spin"></span>${esc(label)}</div>`);
  let r;
  try { r = await fn(); } catch (e) { return showFull(errBox('处理失败：' + e.message)); }
  if (r.error) return showFull(errBox(r.error));
  mountDoc(r);
}

/* ============ 挂载文档（文章 / 书） ============ */
function mountDoc(r) {
  S.mode = r.mode; S.title = r.title || '（未命名）';
  S.doc_id = r.doc_id || S.doc_id;
  setTopTitle(S.title);
  if (r.mode === 'book') {
    S.book = { toc: r.toc || [], idx: r.chapter_idx || 0, count: r.chapter_count || (r.toc ? r.toc.length : 1), title: r.title };
    renderChapter(r);
    showBookChrome();
  } else {
    S.book = null;
    renderArticle(r);
    hideBookChrome();
  }
  // 自动保存（持久化到书架 + 生词本）
  scheduleSave(800);
  startPregenPoll();
}

function renderArticle(r) {
  const app = $('#app'); app.className = 'view';
  app.innerHTML = `<div class="reader reading" id="reader">
      <h1 class="doc-title">${esc(r.title || '')}</h1>
      ${r.source ? `<div class="doc-src">${esc(r.source)}</div>` : ''}
      ${r.article_html || ''}
    </div>`;
  bindReader();
  restoreScroll();
}

function renderChapter(r) {
  if (S.book) S.book.idx = r.chapter_idx != null ? r.chapter_idx : S.book.idx;
  const app = $('#app'); app.className = 'view';
  // 书模式不另加 doc-title：章名已在底部章节条显示，且多数 EPUB 章节正文自带标题，
  // 重复一个反而冗余（PROLOGUE/PROLOGUE）。文章模式才显示标题。
  app.innerHTML = `<div class="reader reading" id="reader">${r.article_html || ''}</div>`;
  bindReader();
  updateChapBar();
  window.scrollTo(0, 0);
  restoreScroll();
}

/* ============ 阅读区交互（点词 / 选区） ============ */
function bindReader() {
  const reader = $('#reader');
  if (!reader) return;
  reader.addEventListener('click', onWordTap);
}

function onWordTap(e) {
  const sel = window.getSelection();
  if (sel && !sel.isCollapsed && sel.toString().trim().length > 1) return; // 正在选词组
  const w = e.target.closest('.vocab, .w');
  if (!w) return;
  const word = w.textContent.trim();
  if (!word) return;
  const sent = w.closest('.sent');
  flash(w);
  explainWord({
    word,
    sentence: sent ? sent.dataset.sentence : '',
    lemma: w.dataset.lemma || '',
    level: w.dataset.level || '',
    freq: w.dataset.freq || '',
    elem: w,
  });
}

function flash(node) {
  $$('.active', $('#reader')).forEach(n => n.classList.remove('active'));
  node.classList.add('active');
}

/* ---- 选区讲解 ---- */
function onSelectChange() {
  const sel = window.getSelection();
  const fab = $('#selFab');
  if (!sel || sel.isCollapsed) { fab.classList.add('hidden'); return; }
  const text = sel.toString().trim();
  const reader = $('#reader');
  if (!reader || text.length < 2 || !reader.contains(sel.anchorNode)) { fab.classList.add('hidden'); return; }
  // 单个词交给点词；选区针对词组 / 句子
  let rect;
  try { rect = sel.getRangeAt(0).getBoundingClientRect(); } catch { return; }
  fab.style.left = (rect.left + rect.width / 2) + 'px';
  fab.style.top = (rect.top - 8) + 'px';
  fab.classList.remove('hidden');
  fab._text = text;
  fab._sent = nearestSentence(sel.anchorNode);
}
function nearestSentence(node) {
  let n = node && node.nodeType === 3 ? node.parentElement : node;
  const s = n && n.closest ? n.closest('.sent') : null;
  return s ? s.dataset.sentence : '';
}

/* ============ 讲解 sheet ============ */
async function explainWord(ctx) {
  S.cur = { ...ctx, isPhrase: false }; S.followups = [];
  openSheet(skeletonExplain(ctx.word), null);
  let res;
  try {
    res = await api('explain_word', {
      word: ctx.word, sentence: ctx.sentence, lemma: ctx.lemma,
      level: ctx.level, freq: ctx.freq,
    });
  } catch (e) { return setSheet(errExplain(e.message)); }
  if (res.error) return setSheet(errExplain(res.error));
  if (res.ok === false) return setSheet(errExplain(res.error || '讲解失败'));
  S.cur.lemma = res.lemma || ctx.lemma || ctx.word.toLowerCase();
  S.cur.res = res;
  renderWordExplain(res);
}

async function explainSelection(text, sentence) {
  $('#selFab').classList.add('hidden');
  S.cur = { word: text, sentence, isPhrase: true }; S.followups = [];
  openSheet(skeletonExplain(text.length > 40 ? text.slice(0, 40) + '…' : text), null);
  let res;
  try { res = await api('explain_selection', { text, sentence }); }
  catch (e) { return setSheet(errExplain(e.message)); }
  if (res.error || res.ok === false) return setSheet(errExplain(res.error || '讲解失败'));
  S.cur.lemma = res.lemma || '§' + text.toLowerCase();
  S.cur.res = res;
  renderSelectionExplain(res, text);
}

function skeletonExplain(word) {
  return `<div class="ex-head"><div class="ex-word">${esc(word)}</div></div>
    <div class="loading-line"><span class="spin"></span>讲解生成中…</div>`;
}
function errExplain(msg) {
  return `<div class="ex-row"><div class="val">${esc(msg)}</div></div>
    ${/key|设置|api/i.test(msg) ? '<button class="btn ghost block" style="margin-top:14px" onclick="openSettings()">去设置填 Key</button>' : ''}`;
}
function setSheet(html) { $('#sheetBody').innerHTML = html; }

function bandChip(res) {
  if (!res.freq_band) return '';
  return `<span class="chip band" data-b="${esc(res.freq_band)}">${esc(res.freq_band)} ${esc(res.freq_name || '')}</span>`;
}

function renderWordExplain(res) {
  const word = res.word || S.cur.word;
  let h = `<div class="ex-head">
      <div class="ex-word">${esc(word)}</div>
      ${res.phonetic ? `<span class="ex-ph">${esc(res.phonetic)}</span>` : ''}
      <button class="say" id="sayBtn" aria-label="朗读">${SVG.speaker}</button>
    </div>
    <div class="ex-chips">
      ${res.pos ? `<span class="chip pos">${esc(res.pos)}</span>` : ''}
      ${bandChip(res)}
    </div>`;
  if (res.literal) h += exRow('字面 / 词源', res.literal, true);
  if (res.contextual) h += exRow('本句义', res.contextual);
  if (res.explanation) h += `<div class="ex-talk"><span class="lbl">讲 解</span><div class="val">${esc(res.explanation)}</div></div>`;
  h += actionsRow();
  h += askBlock(false);
  setSheet(h);
  wireExplainCommon();
}

function renderSelectionExplain(res, text) {
  const isSent = res.kind === 'sentence';
  let h = `<div class="ex-head">
      <div class="ex-word" style="font-size:20px">${esc(text)}</div>
      <button class="say" id="sayBtn" aria-label="朗读">${SVG.speaker}</button>
    </div>
    <div class="ex-chips"><span class="chip pos">${isSent ? '句子' : '词块'}</span></div>`;
  if (res.meaning) h += exRow(isSent ? '句意' : '含义', res.meaning);
  if (isSent && res.key_words && res.key_words.length) {
    h += `<div class="ex-row"><span class="lbl soft">关键词</span><div class="ex-keywords">` +
      res.key_words.map(k => `<div class="kw"><b>${esc(k.word)}</b><span>${esc(k.gloss)}</span></div>`).join('') +
      `</div></div>`;
  }
  if (res.talk) h += `<div class="ex-talk"><span class="lbl">讲 解</span><div class="val">${esc(res.talk)}</div></div>`;
  h += actionsRow();
  h += askBlock(true);
  setSheet(h);
  wireExplainCommon();
}

function exRow(label, val, soft) {
  return `<div class="ex-row"><span class="lbl${soft ? ' soft' : ''}">${esc(label)}</span><div class="val">${esc(val)}</div></div>`;
}

function actionsRow() {
  const starOn = S.cur.res && S.cur.res.star;
  const knownOn = S.cur.res && S.cur.res.known;
  return `<div class="ex-actions">
      <button data-act="star" class="${starOn ? 'on' : ''}">${SVG.starFill} 重点</button>
      <button data-act="known" class="${knownOn ? 'on' : ''}">✓ 已掌握</button>
      <button id="saveChunkBtn">存为词块</button>
    </div>`;
}

function askBlock(isPhrase) {
  const chips = isPhrase
    ? [['用法', '这个表达平时怎么用？给两个地道例句。'], ['近义', '有哪些近义表达？区别在哪？']]
    : [['词汇深解', '', 'deep'], ['常见程度', '', 'freq'], ['近义辨析', '有哪些近义词？怎么区分？'], ['例句', '给我两个地道例句。']];
  const chipHtml = chips.map(c =>
    `<button data-q="${esc(c[1])}" data-label="${esc(c[0])}"${c[2] ? ` data-mode="${c[2]}"` : ''}>${esc(c[0])}</button>`
  ).join('');
  return `<div class="ask-h">追 问</div>
    <div class="ask-chips">${chipHtml}</div>
    <div class="thread" id="thread"></div>
    <div class="ask-form">
      <input id="askInput" placeholder="继续问这个词…" autocomplete="off">
      <button id="askSend" aria-label="发送">↑</button>
    </div>`;
}

function wireExplainCommon() {
  const body = $('#sheetBody');
  const say = $('#sayBtn', body);
  if (say) say.onclick = () => playAudio(S.cur.word, say);
  $$('[data-act]', body).forEach(b => b.onclick = () => toggleMark(b));
  $$('.ask-chips button', body).forEach(b => b.onclick = () => askFollowup(b.dataset.label, b.dataset.q, b.dataset.mode, b));
  const send = $('#askSend', body), inp = $('#askInput', body);
  if (send) send.onclick = () => { const q = inp.value.trim(); if (q) askFollowup(q, q, '', send); };
  if (inp) inp.onkeydown = e => { if (e.key === 'Enter') { const q = inp.value.trim(); if (q) askFollowup(q, q, '', send); } };
  const saveChunk = $('#saveChunkBtn', body);
  if (saveChunk) saveChunk.onclick = () => saveCurAsChunk(saveChunk);
  renderThread();
}

/* ============ 存为词块（阶段9：讲解面板）============ */
/* 存当前查询词/短语；meaning 取讲解里现成的中文义第一句，example 取讲解例句第一条；没有就空串。
   只加按钮和一次 api('add_chunk',...) 调用，不改讲解逻辑。 */
async function saveCurAsChunk(btn) {
  const c = S.cur;
  const res = c.res || {};
  const text = c.word || '';
  if (!text) return;
  // meaning：词讲解用 contextual/literal，短语/句子讲解用 meaning；取第一句（按中文句号/分号粗切）
  const meaningSrc = res.contextual || res.literal || res.meaning || '';
  const meaning = (meaningSrc.split(/[。；;]/)[0] || '').trim();
  // example：暂无结构化例句字段，讲解文本里可能含引号例句，此处从简取空串（宁缺毋滥，不臆造）
  const example = '';
  btn.disabled = true;
  const prevText = btn.textContent;
  let apiRes;
  try {
    apiRes = await api('add_chunk', {
      text, meaning, example,
      source: 'reading', sourceRef: S.doc_id || '',
    });
  } catch (e) {
    btn.disabled = false; toast('保存失败：' + e.message); return;
  }
  if (!apiRes || !apiRes.ok) { btn.disabled = false; toast(apiRes?.error || '保存失败'); return; }
  btn.textContent = '已在词块库';
  btn.classList.add('done');
  toast('已存进词块库');
}

async function toggleMark(btn) {
  const act = btn.dataset.act;
  const on = !btn.classList.contains('on');
  btn.classList.toggle('on', on);
  const key = S.cur.lemma;
  try {
    if (act === 'star') { await api('set_star', { key, star: on }); if (S.cur.res) S.cur.res.star = on; }
    else { await api('set_known', { key, known: on }); await api('set_known_global', { key, known: on }); if (S.cur.res) S.cur.res.known = on; }
    toast(on ? (act === 'star' ? '已设为重点' : '已标记掌握 ✓') : '已取消');
  } catch (e) { toast('操作失败'); btn.classList.toggle('on', !on); }
}

async function askFollowup(label, question, mode, btn) {
  const c = S.cur;
  $$('.ask-chips button', $('#sheetBody')).forEach(b => b.disabled = true);
  const inp = $('#askInput'); if (inp) inp.value = '';
  S.followups.push({ q: label, a: null });
  renderThread();
  try {
    const res = await api('ask_followup', {
      word: c.word, lemma: c.lemma, sentence: c.sentence,
      question: question || label, label, mode: mode || '',
      band: (c.res && c.res.freq_band) || '',
      prior: c.res ? (c.res.explanation || c.res.talk || c.res.meaning || '') : '',
      history: S.followups.filter(f => f.a).map(f => ({ q: f.q, a: f.a })),
    });
    const last = S.followups[S.followups.length - 1];
    if (res.ok && res.answer) last.a = res.answer;
    else { last.a = null; last.err = res.error || '没收到回答'; }
  } catch (e) {
    const last = S.followups[S.followups.length - 1]; last.a = null; last.err = e.message;
  }
  $$('.ask-chips button', $('#sheetBody')).forEach(b => b.disabled = false);
  renderThread();
}

function renderThread() {
  const t = $('#thread'); if (!t) return;
  t.innerHTML = S.followups.map(f => `<div class="qa">
      <div class="q">${esc(f.q)}</div>
      <div class="a">${f.a == null && !f.err ? '<span class="spin"></span>' : f.err ? esc(f.err) : mdLite(f.a)}</div>
    </div>`).join('');
  // 仅在有追问时把新答案滚进视野；初次打开讲解保持在顶部（露出词头）
  if (S.followups.length) { const body = $('#sheetBody'); body.scrollTop = body.scrollHeight; }
}

/* ============ 音频 ============ */
let _audio;
async function playAudio(word, btn) {
  if (!word) return;
  btn.classList.add('loading');
  try {
    const r = await api('get_audio', { word: word.toLowerCase(), accent: S.accent });
    if (r.ok && r.data) {
      if (_audio) { _audio.pause(); }
      _audio = new Audio(r.data);
      await _audio.play();
    } else toast(r.error || '朗读失败');
  } catch (e) { toast('朗读失败'); }
  finally { btn.classList.remove('loading'); btn.innerHTML = SVG.speaker; }
}

/* ============ 书：章节条 / 目录 ============ */
function showBookChrome() { $('#chapbar').classList.remove('hidden'); $('#readProg').classList.remove('hidden'); }
function hideBookChrome() { $('#chapbar').classList.add('hidden'); $('#readProg').classList.add('hidden'); }
function hideBookChromeIfArticle() { if (S.mode !== 'book') hideBookChrome(); }

function updateChapBar() {
  if (!S.book) return;
  const cur = S.book.toc[S.book.idx];
  $('#chMid .c1').textContent = cur ? cur.title : '第 ' + (S.book.idx + 1) + ' 章';
  $('#chMid .c2').textContent = `第 ${S.book.idx + 1} / ${S.book.count} 章`;
  $('#chPrev').disabled = S.book.idx <= 0;
  $('#chNext').disabled = S.book.idx >= S.book.count - 1;
}

async function gotoChapter(idx) {
  if (!S.book || idx < 0 || idx >= S.book.count) return;
  saveSession(true);
  showFull('<div class="loading-line"><span class="spin"></span>载入第 ' + (idx + 1) + ' 章…</div>');
  let r;
  try { r = await api('load_chapter', { idx }); }
  catch (e) { return showFull(errBox('载入失败：' + e.message)); }
  if (r.error) return showFull(errBox(r.error));
  S.book.idx = r.chapter_idx != null ? r.chapter_idx : idx;
  renderChapter(r);
  scheduleSave(600);
  startPregenPoll();
}

function openToc() {
  if (!S.book) return;
  const html = '<div style="display:flex;flex-direction:column">' + S.book.toc.map(c =>
    `<button class="toc-item${c.idx === S.book.idx ? ' cur' : ''}" data-idx="${c.idx}"
       style="text-align:left;padding:13px 4px;border-bottom:1px solid var(--border-soft);font-size:14.5px;color:${c.idx === S.book.idx ? 'var(--gold-deep)' : 'var(--ink)'};font-weight:${c.idx === S.book.idx ? 600 : 400}">
       <span style="color:var(--muted);font-size:12px;margin-right:8px">${c.idx + 1}</span>${esc(c.title)}</button>`
  ).join('') + '</div>';
  openSheet(html, '目录');
  $$('.toc-item', $('#sheetBody')).forEach(b => b.onclick = () => { closeSheet(); gotoChapter(+b.dataset.idx); });
}

/* ============ 阅读进度 ============ */
function onScroll() {
  if (S.mode === 'book') {
    const h = document.documentElement.scrollHeight - window.innerHeight;
    const pct = h > 0 ? Math.min(100, (window.scrollY / h) * 100) : 0;
    $('#readProg').style.width = pct + '%';
  }
  scheduleSave(1500);
  saveScroll();
}

/* ============ 存续（保存 / 滚动恢复） ============ */
let _saveT;
function scheduleSave(ms) { clearTimeout(_saveT); _saveT = setTimeout(() => saveSession(false), ms); }

async function saveSession(sync) {
  if (!S.mode) return;
  try {
    if (S.mode === 'book') {
      await api('save_session', { page: 0 });
    } else {
      const reader = $('#reader');
      await api('save_session', { html: reader ? reader.innerHTML : '' });
    }
  } catch (e) { /* 静默 */ }
}

function scrollKey() { return `situ_scroll_${S.doc_id}_${S.mode === 'book' && S.book ? S.book.idx : 0}`; }
function saveScroll() { try { localStorage.setItem(scrollKey(), String(Math.round(window.scrollY))); } catch {} }
function restoreScroll() {
  try {
    const y = +(localStorage.getItem(scrollKey()) || 0);
    if (y > 0) requestAnimationFrame(() => window.scrollTo(0, y));
  } catch {}
}

/* ============ 预热指示 ============ */
let _pregenT;
function startPregenPoll() {
  clearInterval(_pregenT);
  const box = $('#pregen');
  let idle = 0;
  _pregenT = setInterval(async () => {
    try {
      const p = await api('get_pregen_status');
      if (p.running && p.total > 0 && p.done < p.total) {
        box.classList.remove('hidden');
        box.innerHTML = `<span class="spin" style="width:11px;height:11px;border-width:2px"></span>预热讲解 ${p.done}/${p.total}`;
        idle = 0;
      } else {
        box.classList.add('hidden');
        if (++idle > 3) clearInterval(_pregenT);
      }
    } catch { clearInterval(_pregenT); box.classList.add('hidden'); }
  }, 1200);
}

/* ============ 顶栏标题 ============ */
function setTopTitle(t) {
  const e = $('#topTitle');
  if (!t) { e.innerHTML = '四<span class="dot">·</span>土'; }
  else { e.textContent = t.length > 16 ? t.slice(0, 16) + '…' : t; }
}

/* ============ 占位：生词本 / 设置（各自任务实现） ============ */
function openVocab() { if (window.renderVocab) renderVocab(); else { openOverlay('ovVocab'); $('#vocabBody').innerHTML = '<div class="empty"><p>生词本载入中…</p></div>'; } }
function openSettings() { if (window.renderSettings) renderSettings(); else { openOverlay('ovSettings'); $('#settingsBody').innerHTML = '<div class="empty"><p>设置载入中…</p></div>'; } }

/* ============ 事件绑定 ============ */
function bindGlobal() {
  $('#btnMenu').onclick = openDrawer;
  $('#drawerScrim').onclick = closeDrawer;
  $('#btnVocabTop').onclick = openVocab;
  $$('#drawer nav button').forEach(b => b.onclick = () => go(b.dataset.nav));
  $('#sheetScrim').onclick = closeSheet;
  $('.sheet-title .x').onclick = closeSheet;
  $$('[data-close-ov]').forEach(b => b.onclick = () => closeOverlay(b.dataset.closeOv));
  $('#chPrev').onclick = () => gotoChapter(S.book ? S.book.idx - 1 : 0);
  $('#chNext').onclick = () => gotoChapter(S.book ? S.book.idx + 1 : 0);
  $('#chToc').onclick = openToc;
  $('#selFab').onclick = () => { const f = $('#selFab'); if (f._text) explainSelection(f._text, f._sent || ''); };
  document.addEventListener('selectionchange', () => { clearTimeout(window._selT); window._selT = setTimeout(onSelectChange, 120); });
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('pagehide', () => saveSession(true));
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveSession(true); });
}

/* ============ 启动 ============ */
async function boot() {
  applyFontSize();
  bindGlobal(); // 先挂事件——后面初始化再怎么失败，按钮也不能是死的
  // 等待 LocalApi 初始化（IndexedDB 开库 + 词表 + NLP）。
  // 失败不许无声中止 boot（2026-07-07 教训：旧标签页卡住 IndexedDB 升级 →
  // ready() reject → 整页空白按钮全死）；报出来，后续开库还会自动重试。
  if (window.LocalApi && typeof window.LocalApi.ready === 'function') {
    try { await window.LocalApi.ready(); }
    catch (e) {
      toast('初始化失败：' + ((e && e.message) || e) + '——关掉其他四土标签页后刷新', 6000);
    }
  }
  // #review 直达（四土桌面 App 的「口语复盘」窗口从这里进）。
  // renderReview 定义在 review.js（排在 app.js 之后）——等文档 load 完再进，
  // 免得 ready() 秒回时抢在脚本解析前面、打到 undefined 退化成半死壳。
  if (location.hash === '#review') {
    window.REVIEW_ONLY = true;   // 独立复盘窗：复盘即整扇窗（review.js 据此藏返回键/加设置入口）
    if (document.readyState !== 'complete') {
      await new Promise(r => window.addEventListener('load', r, { once: true }));
    }
    // 先把 home 渲染好垫在复盘屏身后——曾经这里只进 review，一旦浮层被关，
    // 露出的是从没渲染过的空壳（顶栏孤零零、正文全空），用户困在死页。
    try { await renderHome(); } catch (_) {}
    go('review');
  } else await renderHome();
  // service worker：只给「手机 PWA」离线壳用（供「加到主屏」离线开壳）。
  // 桌面「口语复盘」窗（#review）是本地 server 的原生壳，SW 对它只有害无益——会缓存住 JS
  // （改了码永远看不到新版）、并在 server 没就绪那一刻用旧壳+旧码把窗口伪装成「活着」，
  // 把「后端没起」掩盖成「壳能开但接口 Load failed」。这里主动拆除并清缓存，永远走网络拿最新。
  if ('serviceWorker' in navigator) {
    if (location.hash === '#review') {
      const hadController = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.getRegistrations()
        .then(rs => Promise.all(rs.map(r => r.unregister())))
        .then(() => (window.caches && caches.keys ? caches.keys().then(ks => Promise.all(ks.map(k => caches.delete(k)))) : null))
        // 曾被旧 SW 控制→清干净后重载一次拿真·新码（拆除后本页不再有 controller，不会循环）
        .then(() => { if (hadController) location.reload(); })
        .catch(() => {});
    } else {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }
}
boot();
