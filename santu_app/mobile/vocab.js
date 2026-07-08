/* 四土 · 手机版 生词本（全局 + 本篇 / 三维排序 / 冷暖分层 / 复制 + 导出）
   classic script，共享 app.js 的全局 helper（$ el esc api toast mdLite openOverlay…）。 */
'use strict';

/* ============ 本地 SVG 常量（不依赖 app.js 的 SVG 对象） ============ */
const _VS = {
  search:`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20.5 20.5l-4.3-4.3"/></svg>`,
  download:`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M8 11l4 4 4-4"/><path d="M5 19h14"/></svg>`,
  starFill:`<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 3.6l2.55 5.17 5.7.83-4.13 4.02.98 5.68L12 16.99l-5.1 2.31.98-5.68L3.75 9.6l5.7-.83z"/></svg>`,
  doc:`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"><path d="M7 3.7h6.4L18 8.2V19a1.3 1.3 0 0 1-1.3 1.3H7A1.3 1.3 0 0 1 5.7 19V5A1.3 1.3 0 0 1 7 3.7z"/><path d="M13.2 3.9V8.4h4.4"/><path d="M8.6 12.6h6.8M8.6 15.6h6.8"/></svg>`,
  trash:`<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"><path d="M5 7h14M10 7V5.6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V7M17.4 7l-.8 12a1 1 0 0 1-1 .95H8.4a1 1 0 0 1-1-.95L6.6 7"/><path d="M10 11v5.4M14 11v5.4"/></svg>`,
};

const VS = {
  scope: 'global',     // global | doc
  sort: 'freq',        // freq | chapter | clicks
  type: 'all',         // all | word | phrase | sentence
  view: 'all',         // all(未掌握) | star | known
  q: '',
  raw: [],             // 当前 scope 的原始数据
};

function renderVocab() {
  openOverlay('ovVocab');
  const body = $('#vocabBody');
  body.innerHTML = `
    <div class="voc-controls">
      <div class="seg scope">
        <button data-scope="global" class="active">全局生词本</button>
        <button data-scope="doc">本篇</button>
      </div>
      <div class="voc-row">
        <div class="seg sort">
          <button data-sort="freq" class="active">日常频率</button>
          <button data-sort="chapter">章节顺序</button>
          <button data-sort="clicks">点击次数</button>
        </div>
        <button class="ic-s" id="vSearchT">${_VS.search}</button>
      </div>
      <div class="voc-search hidden"><input id="vSearch" placeholder="搜索词 / 释义…" autocomplete="off"></div>
      <div class="voc-chips">
        <button data-type="all" class="active">全部</button>
        <button data-type="word">词</button>
        <button data-type="phrase">词块</button>
        <button data-type="sentence">句</button>
        <span class="gap"></span>
        <button data-view="all" class="active">未掌握</button>
        <button data-view="star">${_VS.starFill} 重点</button>
        <button data-view="known">✓ 已掌握</button>
      </div>
    </div>
    <div class="voc-count" id="vCount"></div>
    <div class="voc-list" id="vList"></div>
    <div class="voc-actions">
      <button id="vCopy">⧉ 复制全部</button>
      <button id="vExport">${_VS.download} 导出 CSV</button>
    </div>`;

  body.querySelectorAll('.scope button').forEach(b => b.onclick = () => {
    setActive(body.querySelectorAll('.scope button'), b); VS.scope = b.dataset.scope; loadVocab();
  });
  body.querySelectorAll('.sort button').forEach(b => b.onclick = () => {
    setActive(body.querySelectorAll('.sort button'), b); VS.sort = b.dataset.sort; renderVList();
  });
  body.querySelectorAll('[data-type]').forEach(b => b.onclick = () => {
    setActive(body.querySelectorAll('[data-type]'), b); VS.type = b.dataset.type; renderVList();
  });
  body.querySelectorAll('[data-view]').forEach(b => b.onclick = () => {
    setActive(body.querySelectorAll('[data-view]'), b); VS.view = b.dataset.view; renderVList();
  });
  $('#vSearchT', body).onclick = () => {
    const box = $('.voc-search', body); box.classList.toggle('hidden');
    $('#vSearchT', body).classList.toggle('active');
    if (!box.classList.contains('hidden')) $('#vSearch', body).focus();
    else { VS.q = ''; $('#vSearch', body).value = ''; renderVList(); }
  };
  $('#vSearch', body).oninput = e => { VS.q = e.target.value.trim().toLowerCase(); renderVList(); };
  $('#vCopy', body).onclick = copyVocab;
  $('#vExport', body).onclick = exportVocab;

  loadVocab();
}
window.renderVocab = renderVocab;

function setActive(nodes, on) { nodes.forEach(n => n.classList.toggle('active', n === on)); }

async function loadVocab() {
  const list = $('#vList'); list.innerHTML = '<div class="loading-line"><span class="spin"></span>载入…</div>';
  if (VS.scope === 'doc' && !S.mode) {
    list.innerHTML = '<div class="empty"><p>还没打开任何文章 / 书<br>「本篇」生词会在阅读时出现</p></div>';
    $('#vCount').textContent = ''; VS.raw = []; return;
  }
  try {
    VS.raw = await api(VS.scope === 'global' ? 'get_global_notebook' : 'get_notebook');
  } catch (e) { list.innerHTML = `<div class="empty"><p>载入失败：${esc(e.message)}</p></div>`; return; }
  renderVList();
}

/* 冷暖分层色 index（随排序维度变） */
function bandIdx(it) {
  if (VS.sort === 'freq') {
    const b = (it.freq_band || '').toUpperCase();
    return { A: 0, B: 1, C: 2, D: 3, E: 4 }[b] ?? 5;
  }
  if (VS.sort === 'chapter') {
    const ch = it.chapter_idx != null ? it.chapter_idx
      : (it.order != null ? Math.floor(it.order / 1e6) : null);
    return ch == null ? 5 : ch % 6;
  }
  // clicks
  const c = it.clicks || 0;
  return Math.min(Math.max(c - 1, 0), 5);
}

function vMeaning(it) {
  return it.contextual || it.meaning || it.literal || (it.explanation ? it.explanation.slice(0, 60) : '') || '';
}
function vKind(it) { return it.kind || (String(it.lemma || '').startsWith('§') ? 'phrase' : 'word'); }

function filterSort() {
  let arr = VS.raw.slice();
  // type
  if (VS.type !== 'all') arr = arr.filter(it => vKind(it) === VS.type);
  // view
  if (VS.view === 'known') arr = arr.filter(it => it.known);
  else if (VS.view === 'star') arr = arr.filter(it => it.star);
  else arr = arr.filter(it => !it.known);           // 默认隐藏已掌握
  // search
  if (VS.q) arr = arr.filter(it =>
    (it.word || '').toLowerCase().includes(VS.q) || vMeaning(it).toLowerCase().includes(VS.q));
  // sort
  const inf = Number.POSITIVE_INFINITY;
  // 频率：罕见优先（生词本里难词更值得复习；未入 5 万词表的专名/词块视作最罕见，置顶）
  if (VS.sort === 'freq') arr.sort((a, b) => (b.daily_rank ?? inf) - (a.daily_rank ?? inf) || (b.clicks || 0) - (a.clicks || 0));
  else if (VS.sort === 'chapter') arr.sort((a, b) => (a.order ?? inf) - (b.order ?? inf));
  else arr.sort((a, b) => (b.clicks || 0) - (a.clicks || 0) || (b.last_seen || 0) - (a.last_seen || 0));
  return arr;
}

function renderVList() {
  const list = $('#vList'); if (!list) return;
  const arr = filterSort();
  $('#vCount').textContent = arr.length ? `${arr.length} 个` : '';
  if (!arr.length) { list.innerHTML = '<div class="empty"><p>这里还是空的</p></div>'; return; }
  list.innerHTML = arr.map((it, i) => vItem(it, i)).join('');
  // 绑定展开 + 详情按钮
  list.querySelectorAll('.voc-item').forEach(node => {
    node.querySelector('.vhead').onclick = () => toggleItem(node, +node.dataset.i);
  });
}

function vItem(it, i) {
  const kind = vKind(it);
  const bi = bandIdx(it);
  const band = it.freq_band ? `<span class="b b${bi}">${esc(it.freq_band)}</span>` : '';
  const src = (it.sources && it.sources[0] && it.sources[0].title) || it.chapter_title || '';
  const clicks = it.clicks ? `${it.clicks}×` : '';
  const kindLabel = kind === 'phrase' ? '词块' : kind === 'sentence' ? '句' : '';
  return `<div class="voc-item bar${bi}" data-i="${i}" data-key="${esc(it.lemma || '')}">
    <div class="vhead">
      <span class="vw ${kind !== 'word' ? 'phrase' : ''}">${esc(it.word || it.lemma || '')}</span>
      ${it.phonetic ? `<span class="vph">${esc(it.phonetic)}</span>` : ''}
      ${it.star ? `<span class="vstar">${_VS.starFill}</span>` : ''}
    </div>
    ${vMeaning(it) ? `<div class="vmean">${esc(vMeaning(it))}</div>` : ''}
    <div class="vmeta">
      ${band}${kindLabel ? `<span>${kindLabel}</span>` : ''}${clicks ? `<span>${clicks}</span>` : ''}
      ${src ? `<span class="src">${_VS.doc} ${esc(src)}</span>` : ''}
    </div>
    <div class="voc-detail"></div>
  </div>`;
}

function toggleItem(node, i) {
  const open = node.classList.toggle('expanded');
  const detail = node.querySelector('.voc-detail');
  if (!open) return;
  const it = filterSort()[i];
  if (!it) return;
  let h = '';
  if (it.literal) h += `<div class="dl">字面 / 词源</div><div class="dv">${esc(it.literal)}</div>`;
  if (it.contextual && it.contextual !== vMeaning(it)) h += `<div class="dl">本句义</div><div class="dv">${esc(it.contextual)}</div>`;
  if (it.meaning && vKind(it) !== 'word') h += `<div class="dl">含义</div><div class="dv">${esc(it.meaning)}</div>`;
  const talk = it.explanation || it.talk;
  if (talk) h += `<div class="dl">讲解</div><div class="dv">${esc(talk)}</div>`;
  (it.followups || []).forEach(f => {
    h += `<div class="qa"><div class="q">Q · ${esc(f.q)}</div><div class="a">${mdLite(f.a || '')}</div></div>`;
  });
  h += `<div class="vbtns">
      <button data-a="star" class="${it.star ? 'on' : ''}">${_VS.starFill} 重点</button>
      <button data-a="known" class="${it.known ? 'on' : ''}">✓ 掌握</button>
      <button data-a="del">${_VS.trash} 删除</button>
    </div>`;
  detail.innerHTML = h;
  detail.querySelectorAll('[data-a]').forEach(btn => btn.onclick = e => { e.stopPropagation(); vAction(btn.dataset.a, it, node); });
}

async function vAction(act, it, node) {
  const key = it.lemma;
  try {
    if (act === 'del') {
      if (!confirm('从生词本删除「' + (it.word || key) + '」？')) return;
      await api(VS.scope === 'global' ? 'delete_global' : 'delete_global', { key });
      VS.raw = VS.raw.filter(x => x.lemma !== key);
      node.remove(); toast('已删除'); return;
    }
    if (act === 'star') {
      it.star = !it.star; await api('set_star', { key, star: it.star });
      node.querySelector('[data-a=star]').classList.toggle('on', it.star);
      toast(it.star ? '已设为重点' : '已取消重点');
    } else {
      it.known = !it.known;
      await api('set_known_global', { key, known: it.known });
      await api('set_known', { key, known: it.known });
      node.querySelector('[data-a=known]').classList.toggle('on', it.known);
      toast(it.known ? '已标记掌握 ✓' : '已取消');
    }
  } catch (e) { toast('操作失败'); }
}

/* ---- 复制 / 导出 ---- */
function copyVocab() {
  const arr = filterSort();
  if (!arr.length) return toast('没有可复制的词');
  const text = arr.map(it => `${it.word || it.lemma}\t${vMeaning(it)}`).join('\n');
  copyText(text).then(ok => toast(ok ? `已复制 ${arr.length} 条（词\\t释义）` : '复制失败，长按手动选'));
}

function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text).then(() => true).catch(() => fallbackCopy(text));
  }
  return Promise.resolve(fallbackCopy(text));
}
function fallbackCopy(text) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  } catch { return false; }
}

function exportVocab() {
  const arr = filterSort();
  if (!arr.length) return toast('没有可导出的词');
  const head = ['Word', 'Type', 'FreqBand', 'Clicks', 'Phonetic', 'Meaning', 'Source'];
  const rows = arr.map(it => [
    it.word || it.lemma, vKind(it), it.freq_band || '', it.clicks || 0,
    it.phonetic || '', vMeaning(it), (it.sources && it.sources[0] && it.sources[0].title) || it.chapter_title || '',
  ].map(csvCell).join(','));
  const csv = '﻿' + [head.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `四土生词本-${VS.scope === 'global' ? '全局' : '本篇'}.csv`;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast(`已导出 ${arr.length} 条 CSV`);
}
function csvCell(v) {
  const s = String(v == null ? '' : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
