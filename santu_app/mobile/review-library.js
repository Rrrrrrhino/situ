/* 四土 · 口语复盘 —— 积累屏（错题 + 词块 合体，§3.1）：
   顶部一个 seg「错题 | 词块」，切换只换数据源与条目渲染器；
   4-tab 视图、搜索、多选、star/掌握/删除操作栏共用同一份实现。
   多选可跨 tab 带条目（错题＋词块同场）→ 练习引擎 kind='mixed'。 */
'use strict';

/* 每 tab 最近一次载入的条目缓存（多选确认时取详情用） */
const _libItems = { mistakes: [], chunks: [] };

const _LIB_TABS = [
  { key: 'mistakes', label: '错题' },
  { key: 'chunks', label: '词块' },
];

async function _showLibraryScreen(tab) {
  if (_recState) _stopRecord();
  // 返回去处：从结果屏进来的回结果屏；从输入屏/历史进来的回输入屏。
  // 练习屏返回积累时不改写（保持最初的去处）。
  if (RS.view === 'result') RS.libReturn = 'result';
  else if (RS.view === 'input' || RS.view === 'history') RS.libReturn = 'input';
  if (tab) RS.libState.tab = tab;
  RS.libSel = { selecting: false, mistakes: [], chunks: [] };
  _setScreen('library', '积累');
  _renderLibraryBody();
  await _loadAndRenderLib();
}

/* 兼容旧入口名（结果屏底栏等处还在调） */
function _showMistakesScreen() { return _showLibraryScreen('mistakes'); }
function _showChunksScreen() { return _showLibraryScreen('chunks'); }

function _renderLibraryBody() {
  const t = RS.libState.tab;
  const ms = RS.mistakesState, cs = RS.chunksState;
  const st = t === 'mistakes' ? ms : cs;
  const body = $('#reviewBody');
  body.innerHTML = `
    <div class="lib-wrap">
      <div class="seg lib-tab-seg" id="libTabSeg">
        ${_LIB_TABS.map((x) => `<button data-lt="${x.key}" class="${t === x.key ? 'active' : ''}">${x.label}</button>`).join('')}
      </div>
      <div class="mst-controls">
        <div class="lib-ctrl-row">
          <div class="seg" id="libViewSeg">
            <button data-mv="unmastered" class="${st.view === 'unmastered' ? 'active' : ''}">未掌握</button>
            <button data-mv="star" class="${st.view === 'star' ? 'active' : ''}">${_RS.starFill} 重点</button>
            <button data-mv="mastered" class="${st.view === 'mastered' ? 'active' : ''}">✓ 已掌握</button>
            <button data-mv="all" class="${st.view === 'all' ? 'active' : ''}">全部</button>
          </div>
        </div>
        ${t === 'mistakes' ? `
        <div class="voc-chips" id="libTypeChips">
          <button data-mt="" class="${ms.type === '' ? 'active' : ''}">全部类型</button>
          <button data-mt="grammar" class="${ms.type === 'grammar' ? 'active' : ''}">语法</button>
          <button data-mt="wordchoice" class="${ms.type === 'wordchoice' ? 'active' : ''}">词不达意</button>
          <button data-mt="collocation" class="${ms.type === 'collocation' ? 'active' : ''}">搭配</button>
          <button data-mt="naturalness" class="${ms.type === 'naturalness' ? 'active' : ''}">不自然</button>
        </div>` : ''}
        <div class="voc-search lib-search">
          <input id="libSearch" placeholder="${t === 'mistakes' ? '搜索原文 / 纠正 / 理由…' : '搜索词块 / 释义…'}" autocomplete="off" value="${esc(st.q)}">
        </div>
        <div class="chunk-top-actions lib-actions">
          ${t === 'chunks' ? `<button id="libAddBtn">＋ 添加</button><button id="libPracAutoBtn">练一组</button>` : ''}
          <button id="libSelectBtn">挑几条练</button>
        </div>
      </div>
      <div class="mst-count" id="libCount"></div>
      <div class="mst-list" id="libList"></div>
    </div>`;

  // 顶部 tab：切换只换数据源与条目渲染器（选中的条目跨 tab 保留，混合练用）
  $$('#libTabSeg button').forEach((b) => b.onclick = () => {
    if (RS.libState.tab === b.dataset.lt) return;
    RS.libState.tab = b.dataset.lt;
    const keepSel = RS.libSel.selecting;
    _renderLibraryBody();
    if (keepSel) { RS.libSel.selecting = true; _refreshLibSelectBar(); }
    _loadAndRenderLib();
  });

  $$('#libViewSeg button').forEach((b) => b.onclick = () => {
    setActive($$('#libViewSeg button'), b);
    (RS.libState.tab === 'mistakes' ? RS.mistakesState : RS.chunksState).view = b.dataset.mv;
    _loadAndRenderLib();
  });
  $$('#libTypeChips button').forEach((b) => b.onclick = () => {
    setActive($$('#libTypeChips button'), b);
    RS.mistakesState.type = b.dataset.mt;
    _loadAndRenderLib();
  });
  let _libST;
  $('#libSearch').addEventListener('input', (e) => {
    (RS.libState.tab === 'mistakes' ? RS.mistakesState : RS.chunksState).q = e.target.value;
    clearTimeout(_libST);
    _libST = setTimeout(_loadAndRenderLib, 280);
  });
  $('#libSelectBtn').onclick = _libEnterSelect;
  const addBtn = $('#libAddBtn');
  if (addBtn) addBtn.onclick = _openAddChunkSheet;
  const pracBtn = $('#libPracAutoBtn');
  if (pracBtn) pracBtn.onclick = _onPracticeAuto;
}

async function _loadAndRenderLib() {
  const t = RS.libState.tab;
  const listEl = $('#libList');
  if (!listEl) return;
  listEl.innerHTML = '<div class="loading-line"><span class="spin"></span>载入中…</div>';

  let items = [];
  try {
    if (t === 'mistakes') {
      const ms = RS.mistakesState;
      items = await api('list_mistakes', { view: ms.view, type: ms.type || undefined, q: ms.q || undefined });
    } else {
      const cs = RS.chunksState;
      items = await api('list_chunks', { view: cs.view, q: cs.q || undefined });
    }
  } catch (e) {
    listEl.innerHTML = '';
    toast('加载失败：' + e.message);
    return;
  }
  if (RS.view !== 'library' || RS.libState.tab !== t) return; // 已切屏/切 tab，作废
  _libItems[t] = Array.isArray(items) ? items : [];

  const countEl = $('#libCount');
  if (countEl) countEl.textContent = `共 ${_libItems[t].length} 条`;

  listEl.innerHTML = '';
  if (!_libItems[t].length) {
    listEl.innerHTML = `<div class="lib-empty">${t === 'mistakes'
      ? '还没有错题。复盘之后，值得记住的问题会存进这里。'
      : '还没有词块。读文章、复盘时存下的好表达会住在这里，也可以手动添加。'}</div>`;
    return;
  }
  _libItems[t].forEach((it) => {
    listEl.appendChild(t === 'mistakes' ? _buildMistakeItem(it) : _buildChunkItem(it));
  });
}

/* ── 条目渲染器：错题 ── */
function _buildMistakeItem(m) {
  const isStar = !!m.star;
  const isMastered = !!m.mastered;
  const isNat = m.severity === 'naturalness';
  const isSelected = RS.libSel.mistakes.includes(m.id);
  const typeLabel = { grammar: '语法', wordchoice: '词不达意', collocation: '搭配', naturalness: '不自然' }[m.type] || m.type;

  const cls = [
    'mst-item',
    isNat ? 'nat' : '',
    isMastered ? 'mastered' : '',
    RS.libSel.selecting ? 'selectable' : '',
    isSelected ? 'selected' : '',
  ].filter(Boolean).join(' ');

  const div = el('div', cls);
  div.dataset.id = m.id;
  div.innerHTML = `
    <div class="mhead">
      <span class="sel-check">${isSelected ? '✓' : ''}</span>
      <span class="morig">${esc(m.original)}</span>
      <span class="marr">→</span>
      <span class="mcorr">${esc(m.correction)}</span>
      ${isStar ? `<span class="mstar">${_RS.starFill}</span>` : ''}
    </div>
    <div class="mwhy">${esc(m.why)}</div>
    <div class="mst-detail">
      <div class="mst-type-note">类型：${esc(typeLabel)}</div>
      <div class="mbtns">
        <button data-ma="star" class="${isStar ? 'on' : ''}">${isStar ? _RS.starFill + ' 重点' : _RS.starLine + ' 加重点'}</button>
        <button data-ma="mastered" class="${isMastered ? 'on' : ''}">${isMastered ? '✓ 已掌握' : '○ 标掌握'}</button>
        <button data-ma="del">${_RS.trash} 删除</button>
      </div>
      <button class="rev-save-chunk-btn${m.chunkAdded ? ' done' : ''}" data-ma="chunk" ${m.chunkAdded ? 'disabled' : ''}>${m.chunkAdded ? '已在词块库' : '存为词块'}</button>
    </div>`;

  div.onclick = (e) => {
    if (RS.libSel.selecting) { _libToggleSelect('mistakes', m.id, div); return; }
    const ma = e.target.closest('[data-ma]');
    if (ma) { _onMistakeAction(m.id, ma.dataset.ma, div, m); return; }
    div.classList.toggle('expanded');
  };
  return div;
}

/* ── 条目渲染器：词块 ── */
const _CHUNK_SRC_LABEL = { reading: '读', review: '盘', manual: '手', steal: '偷', retell: '述' };

function _buildChunkItem(c) {
  const isStar = !!c.star;
  const isMastered = !!c.mastered;
  const isSelected = RS.libSel.chunks.includes(c.id);
  const correct = (c.correctRefs || []).length;
  const srcLabel = _CHUNK_SRC_LABEL[c.source] || '手';

  const cls = [
    'mst-item', 'chunk-item',
    isMastered ? 'mastered' : '',
    RS.libSel.selecting ? 'selectable' : '',
    isSelected ? 'selected' : '',
  ].filter(Boolean).join(' ');

  const div = el('div', cls);
  div.dataset.id = c.id;
  div.innerHTML = `
    <div class="mhead">
      <span class="sel-check">${isSelected ? '✓' : ''}</span>
      <span class="chunk-text">${esc(c.text)}</span>
      <span class="chunk-src-chip">${esc(srcLabel)}</span>
      ${isStar ? `<span class="mstar">${_RS.starFill}</span>` : ''}
    </div>
    ${c.meaning ? `<div class="mwhy">${esc(c.meaning)}</div>` : ''}
    <div class="chunk-progress-row">${_progressDots({ correct, need: 3 })}</div>
    <div class="mst-detail">
      ${c.example ? `<div class="chunk-example">${esc(c.example)}</div>` : ''}
      <div class="mbtns">
        <button data-ca="star" class="${isStar ? 'on' : ''}">${isStar ? _RS.starFill + ' 重点' : _RS.starLine + ' 加重点'}</button>
        <button data-ca="del">${_RS.trash} 删除</button>
      </div>
    </div>`;

  div.onclick = (e) => {
    if (RS.libSel.selecting) { _libToggleSelect('chunks', c.id, div); return; }
    const ca = e.target.closest('[data-ca]');
    if (ca) { _onChunkAction(c.id, ca.dataset.ca, div); return; }
    div.classList.toggle('expanded');
  };
  return div;
}

/* ── 条目操作（错题） ── */
async function _onMistakeAction(id, action, divEl, m) {
  if (action === 'chunk') {
    const btn = divEl.querySelector('[data-ma=chunk]');
    if (btn) btn.disabled = true;
    let res;
    try {
      res = await api('add_chunk', { text: m.correction, meaning: (m.why || '').slice(0, 40), source: 'review' });
    } catch (e) {
      if (btn) btn.disabled = false; toast('保存失败：' + e.message); return;
    }
    if (!res || !res.ok) { if (btn) btn.disabled = false; toast(res?.error || '保存失败'); return; }
    m.chunkAdded = true;
    if (btn) { btn.textContent = '已在词块库'; btn.classList.add('done'); }
    toast('已存进词块库');
    return;
  }
  if (action === 'del') {
    if (!confirm('确认删除这条错题？')) return;
    try { await api('delete_mistake', { id }); } catch (e) { toast('删除失败'); return; }
    toast('已删除');
    await _loadAndRenderLib();
    return;
  }
  if (action === 'star') {
    const cur = divEl.querySelector('[data-ma=star]')?.classList.contains('on');
    const newVal = !cur;
    try { await api('set_mistake_star', { id, star: newVal }); } catch (e) { toast('操作失败'); return; }
    toast(newVal ? '已加重点' : '已取消重点');
    await _loadAndRenderLib();
    return;
  }
  if (action === 'mastered') {
    const cur = divEl.classList.contains('mastered');
    const newVal = !cur;
    try { await api('set_mistake_mastered', { id, mastered: newVal }); } catch (e) { toast('操作失败'); return; }
    toast(newVal ? '已标掌握' : '已取消掌握');
    await _loadAndRenderLib();
    return;
  }
}

/* ── 条目操作（词块） ── */
async function _onChunkAction(id, action, divEl) {
  if (action === 'del') {
    if (!confirm('确认删除这个词块？')) return;
    try { await api('delete_chunk', { id }); } catch (e) { toast('删除失败'); return; }
    toast('已删除');
    await _loadAndRenderLib();
    return;
  }
  if (action === 'star') {
    const cur = divEl.querySelector('[data-ca=star]')?.classList.contains('on');
    const newVal = !cur;
    try { await api('set_chunk_star', { id, star: newVal }); } catch (e) { toast('操作失败'); return; }
    toast(newVal ? '已加重点' : '已取消重点');
    await _loadAndRenderLib();
    return;
  }
}

/* ── 「＋添加」小 sheet：text 必填 + meaning/example 选填（复用通用 openSheet） ── */
function _openAddChunkSheet() {
  const html = `
    <div class="field"><label>词块（必填）</label>
      <input type="text" id="chkAddText" placeholder="如 be inclined to" autocomplete="off"></div>
    <div class="field"><label>中文义 / 用法（可选）</label>
      <input type="text" id="chkAddMeaning" placeholder="一句中文义" autocomplete="off"></div>
    <div class="field"><label>例句（可选）</label>
      <textarea id="chkAddExample" placeholder="一条典型例句"></textarea></div>
    <button class="btn block" id="chkAddGo">添加</button>`;
  openSheet(html, '添加词块');
  const body = $('#sheetBody');
  $('#chkAddGo', body).onclick = async () => {
    const text = ($('#chkAddText', body).value || '').trim();
    if (!text) { toast('请先填词块'); return; }
    const meaning = ($('#chkAddMeaning', body).value || '').trim();
    const example = ($('#chkAddExample', body).value || '').trim();
    let res;
    try {
      res = await api('add_chunk', { text, meaning, example, source: 'manual' });
    } catch (e) { toast('添加失败：' + e.message); return; }
    if (!res || !res.ok) { toast(res?.error || '添加失败'); return; }
    toast('已添加');
    closeSheet();
    await _loadAndRenderLib();
  };
}

/* ── 多选（跨 tab，混合练） ── */
function _libEnterSelect() {
  RS.libSel.selecting = true;
  RS.libSel.mistakes = [];
  RS.libSel.chunks = [];
  _refreshLibSelectBar();
  $$('#libList .mst-item').forEach((div) => {
    div.classList.add('selectable');
    div.classList.remove('expanded');
  });
}

function _libExitSelect() {
  RS.libSel = { selecting: false, mistakes: [], chunks: [] };
  $$('#libList .mst-item').forEach((div) => div.classList.remove('selectable', 'selected'));
  $$('#libList .sel-check').forEach((s) => { s.textContent = ''; });
  const bar = $('#libSelectBar');
  if (bar) bar.remove();
}

function _libToggleSelect(kind, id, divEl) {
  const ids = RS.libSel[kind];
  const idx = ids.indexOf(id);
  if (idx >= 0) {
    ids.splice(idx, 1);
    divEl.classList.remove('selected');
  } else {
    if (kind === 'chunks' && ids.length >= 5) { toast('词块最多选 5 个'); return; }
    if (kind === 'mistakes' && ids.length >= 8) { toast('错题最多选 8 条'); return; }
    ids.push(id);
    divEl.classList.add('selected');
  }
  const chk = divEl.querySelector('.sel-check');
  if (chk) chk.textContent = ids.includes(id) ? '✓' : '';
  _refreshLibSelectBar();
}

function _refreshLibSelectBar() {
  const old = $('#libSelectBar');
  if (old) old.remove();

  const nm = RS.libSel.mistakes.length, nc = RS.libSel.chunks.length;
  const total = nm + nc;
  const detail = (nm && nc) ? `（错题 ${nm} · 词块 ${nc}）` : '';
  const bar = el('div', 'mst-select-bar');
  bar.id = 'libSelectBar';
  bar.innerHTML = `
    <span class="sel-info">${total > 0 ? `已选 ${total} 条${detail}` : '点条目选择，可跨「错题/词块」同场练'}</span>
    <button class="cancel" id="libSelCancel">取消</button>
    <button class="confirm" id="libSelConfirm" ${total === 0 ? 'disabled' : ''}>练这 ${total} 条</button>`;

  const countEl = $('#libCount');
  if (countEl) countEl.parentNode.insertBefore(bar, countEl);
  else $('#reviewBody').appendChild(bar);

  $('#libSelCancel').onclick = _libExitSelect;
  $('#libSelConfirm').onclick = _confirmLibPractice;
}

async function _confirmLibPractice() {
  const mids = RS.libSel.mistakes.slice(), cids = RS.libSel.chunks.slice();
  if (!mids.length && !cids.length) return;

  const items = [];
  if (mids.length) {
    let res;
    try {
      res = await api('make_writing_drill', { ids: mids });
    } catch (e) { toast('获取训练条目失败：' + e.message); return; }
    if (!res || !res.ok) { toast(res?.error || '无法出题'); return; }
    (res.items || []).forEach((it) => items.push({ kind: 'mistake', ...it }));
  }
  if (cids.length) {
    for (const id of cids) {
      const c = _libItems.chunks.find((x) => x.id === id);
      if (c) items.push({ kind: 'chunk', id: c.id, text: c.text, meaning: c.meaning });
    }
  }
  if (!items.length) { toast('没有可练的条目'); return; }
  const kind = (mids.length && cids.length) ? 'mixed' : (mids.length ? 'mistake' : 'chunk');
  _showPracticeScreen({ kind, items });
}

/* ── 「练一组」（词块，不选自动配）：未掌握中 star 优先、最久没练优先取 4 个 ── */
async function _onPracticeAuto() {
  let all = [];
  try { all = await api('list_chunks', { view: 'unmastered' }); } catch (e) { toast('加载失败'); return; }
  if (!all.length) { toast('还没有未掌握的词块，先去添加几个'); return; }
  all.sort((a, b) => {
    const sa = a.star ? 1 : 0, sb = b.star ? 1 : 0;
    if (sa !== sb) return sb - sa;
    return (a.lastDrilled || 0) - (b.lastDrilled || 0);
  });
  const items = all.slice(0, 4).map((c) => ({ kind: 'chunk', id: c.id, text: c.text, meaning: c.meaning }));
  _showPracticeScreen({ kind: 'chunk', items });
}
