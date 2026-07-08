/* 四土 · 口语复盘 —— 结果屏（v2/v1）与复盘历史：高亮 / 重点区 / 词块反馈 / 对话稿 / 偷学 */
'use strict';

/* ============ 结果屏（v2：阶段8） ============ */
/* 「复盘用时」常显标识：录音复盘的结果页 meta 行带总用时；括号里的转写秒数+引擎
   （极速/慢速通道）是测试功能——一眼验证火山极速版有没有真用上。文本复盘无 timing 不显示。 */
function _timingMetaLabel(result) {
  const tm = result && result.timing;
  if (!tm || !tm.transcribeMs) return '';
  const total = Math.round((tm.transcribeMs + (tm.llmMs || 0)) / 1000);
  const min = Math.floor(total / 60), sec = total % 60;
  const totalTxt = min ? `${min} 分 ${sec} 秒` : `${sec} 秒`;
  const eng = tm.engine || {};
  const engines = [eng.me && eng.me.engine, eng.ai && eng.ai.engine].filter(Boolean);
  const engTxt = engines.length ? (engines.every((e) => e === 'flash') ? '·极速' : '·慢速通道') : '';
  return ` · 复盘用时 ${totalTxt}（转写 ${Math.round(tm.transcribeMs / 1000)} 秒${engTxt}）`;
}

function _showResultScreen(result) {
  if (_recState) _stopRecord();
  _setScreen('result', '复盘结果');

  // v1 旧数据（没有 topic/segments/priority，只有 errors/naturalness）→ 降级渲染
  if (!('priority' in result) && !('topic' in result)) {
    _showResultScreenV1(result);
    return;
  }

  const {
    transcript = '', topic = '', overall = '', strengths = [], segments = [],
    priority = [], minor = [], warnings = [],
  } = result;
  const isDual = result.source === 'dual';

  if (warnings && warnings.length) {
    warnings.forEach((w) => toast(w));
  }

  const body = $('#reviewBody');
  body.innerHTML = '';

  const wrap = el('div', 'rev-result-wrap');

  // 1. meta 行（含「复盘用时」常显标识：转写秒数+引擎标记是测试功能，验证极速版是否用上）
  const wordCount = transcript.trim() ? transcript.trim().split(/\s+/).filter(Boolean).length : 0;
  const metaDiv = el('div', 'rev-meta',
    `${wordCount} 词 · ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}` +
    ` · ${esc(result.model || 'AI')}` + (topic ? ` · ${esc(topic)}` : '') +
    (result.retellTitle ? ` · 复述《${esc(result.retellTitle)}》` : '') + _timingMetaLabel(result));
  wrap.appendChild(metaDiv);

  // 2. 总评卡
  if (overall) {
    const ov = el('div', 'rev-overall-card', esc(overall));
    wrap.appendChild(ov);
  }

  // 3. 原文卡：source='dual' 换成对话稿卡（逐 turn，speaker 标签，我的 turn 做错误高亮）；
  //    否则照旧单卡（默认折叠约4行 + 展开全文；priority+minor 都参与高亮）
  if (isDual && Array.isArray(result.dialog) && result.dialog.length) {
    wrap.appendChild(_buildDialogCard(result.dialog, priority, minor));
  } else {
    const transCard = el('div', 'rev-transcript-card collapsed');
    transCard.innerHTML = _highlightTranscriptV2(transcript, priority, minor);
    wrap.appendChild(transCard);
    const expandBtn = el('button', 'rev-expand-btn', '展开全文');
    expandBtn.onclick = () => {
      const collapsed = transCard.classList.toggle('collapsed');
      expandBtn.textContent = collapsed ? '展开全文' : '收起';
    };
    wrap.appendChild(expandBtn);
  }

  // 4. 重点区（priority）
  wrap.appendChild(_buildPrioritySection(priority));

  // 4.5 词块反馈（阶段9：chunkFeedback 非空时插在「重点区」之后；
  //     复述目标表达（库外条目，无 progress）带「存为词块」，一键进积累闭环练到掌握）
  const chunkFeedback = result.chunkFeedback || [];
  if (chunkFeedback.length) {
    wrap.appendChild(_buildChunkFeedbackSection(chunkFeedback, result));
  }

  // 5. 用得好
  wrap.appendChild(_buildSection('good', '用得好', strengths, 'strengths'));

  // 5.5 偷学区块（阶段10：仅 source='dual' 且 steals 非空，放在「用得好」之后）
  if (isDual && Array.isArray(result.steals) && result.steals.length) {
    wrap.appendChild(_buildStealSection(result.steals));
  }

  // 6. 完整清单（仅当有 minor 或 segments）
  if (minor.length || segments.length) {
    wrap.appendChild(_buildMinorSection(minor, segments));
  }

  // 底栏占位（防止被 sticky bar 遮住）
  wrap.appendChild(el('div', '', ''));
  body.appendChild(wrap);

  // 偷学卡片「存为词块」按钮绑定（阶段10）
  if (isDual && Array.isArray(result.steals) && result.steals.length) {
    _bindStealButtons(wrap, result.steals, result.reviewId);
  }

  // 7. 底栏 sticky（N 条已存进错题本 = priority 实存数）
  const savedCount = priority.filter((p) => p.mistakeId).length;
  const bar = el('div', 'rev-bottom-bar');
  bar.innerHTML = `
    <div class="count-note">
      <strong>${savedCount}</strong> 条已存进错题本
    </div>
    <button class="rev-btn-mistk" id="revGoMistakes">错题本</button>
    <button class="rev-btn-prac" id="revPrac">练这几条</button>`;
  body.appendChild(bar);

  body.scrollTop = 0;

  $('#revGoMistakes').onclick = _showMistakesScreen;
  $('#revPrac').onclick = () => {
    const items = priority
      .filter((p) => p.mistakeId)
      .map((p) => ({ id: p.mistakeId, original: p.original, correction: p.correction, type: p.type }));
    if (!items.length) { toast('本次复盘没有可练的条目'); return; }
    _showDrillScreen(items);
  };

  // minor 卡片「入错题本」按钮绑定
  $$('.rev-minor-card [data-save-mistake]', wrap).forEach((btn) => {
    btn.onclick = async () => {
      const idx = parseInt(btn.dataset.idx, 10);
      const item = minor[idx];
      if (!item) return;
      btn.disabled = true;
      let res;
      try {
        res = await api('save_mistake_from_item', {
          original: item.original, correction: item.correction, type: item.type, why: item.why,
          reviewId: result.reviewId,
        });
      } catch (e) {
        btn.disabled = false; toast('保存失败：' + e.message); return;
      }
      if (!res || !res.ok) { btn.disabled = false; toast(res?.error || '保存失败'); return; }
      item.mistakeId = res.mistakeId;
      btn.textContent = '已进错题本';
      btn.classList.add('done');
    };
  });

  // priority/minor 卡片「存为词块」按钮绑定（阶段9）
  $$('[data-save-chunk]', wrap).forEach((btn) => {
    btn.onclick = () => _onSaveChunkFromItem(btn, btn.dataset.kind === 'priority' ? priority : minor);
  });
}

/* v1 旧数据降级渲染（三栏：用得好/要改/换种更自然，无 topic/priority/minor） */
function _showResultScreenV1(result) {
  const { transcript = '', strengths = [], errors = [], naturalness = [] } = result;
  const mistakeCount = errors.length + naturalness.length;

  const body = $('#reviewBody');
  body.innerHTML = '';

  const wrap = el('div', 'rev-result-wrap');

  const wordCount = transcript.trim() ? transcript.trim().split(/\s+/).filter(Boolean).length : 0;
  const metaDiv = el('div', 'rev-meta',
    `${wordCount} 词 · ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}` +
    ` · ${esc(result.model || 'AI')} · 旧版复盘`);
  wrap.appendChild(metaDiv);

  const card = el('div', 'rev-transcript-card');
  card.innerHTML = _highlightTranscript(transcript, errors, naturalness);
  wrap.appendChild(card);

  wrap.appendChild(_buildSection('good', '用得好', strengths, 'strengths'));
  wrap.appendChild(_buildSection('error', '要改', errors, 'errors'));
  wrap.appendChild(_buildSection('nat', '换种更自然', naturalness, 'naturalness'));

  wrap.appendChild(el('div', '', ''));
  body.appendChild(wrap);

  const bar = el('div', 'rev-bottom-bar');
  bar.innerHTML = `
    <div class="count-note">
      <strong>${mistakeCount}</strong> 条已存进错题本
    </div>
    <button class="rev-btn-mistk" id="revGoMistakes">错题本</button>
    <button class="rev-btn-prac" id="revPrac">练这几条</button>`;
  body.appendChild(bar);

  body.scrollTop = 0;

  $('#revGoMistakes').onclick = _showMistakesScreen;
  $('#revPrac').onclick = () => {
    const items = [];
    for (const e of (result.errors || [])) {
      items.push({ id: e.mistakeId, original: e.original, correction: e.correction, type: e.type });
    }
    for (const n of (result.naturalness || [])) {
      items.push({ id: n.mistakeId, original: n.original, correction: n.better, type: n.type });
    }
    if (!items.length) { toast('本次复盘没有可练的条目'); return; }
    _showDrillScreen(items);
  };
}

/* 子串高亮 v2：priority=赭橙/暖金（按 type），minor=同规则但弱一档；用同一套 rev-hl-error/rev-hl-nat */
function _highlightTranscriptV2(transcript, priority, minor) {
  const ranges = [];
  function addRanges(items) {
    for (const item of items) {
      const orig = (item.original || '').trim();
      if (!orig) continue;
      let idx = transcript.indexOf(orig);
      if (idx < 0) idx = _looseFind(transcript, orig);
      if (idx < 0) continue; // 找不到就跳过，不报错（条目仍列出）
      const cls = item.type === 'naturalness' ? 'rev-hl-nat' : 'rev-hl-error';
      ranges.push([idx, idx + orig.length, cls]);
    }
  }
  addRanges(priority);
  addRanges(minor);

  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const r of ranges) {
    if (merged.length && r[0] < merged[merged.length - 1][1]) continue;
    merged.push(r);
  }

  let html = '';
  let pos = 0;
  for (const [s, e, cls] of merged) {
    html += esc(transcript.slice(pos, s));
    html += `<span class="${cls}">${esc(transcript.slice(s, e))}</span>`;
    pos = e;
  }
  html += esc(transcript.slice(pos));
  return html;
}

/* 高亮匹配鲁棒化：indexOf 找不到时，两边规范化（小写+空白折叠+去首尾标点）后再定位映射回原文 */
function _looseFind(transcript, orig) {
  const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const normOrig = norm(orig).replace(/^[.,!?;:'"…—-]+|[.,!?;:'"…—-]+$/g, '');
  if (!normOrig) return -1;
  // 在原文的小写折叠版本里找，再换算回原始下标（用滑动窗口逐词对齐，容错空白差异）
  const normTranscript = transcript.toLowerCase();
  // 简化处理：把 orig 内部空白替换为 \s+ 的正则，允许原文空白差异
  const escRe = normOrig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
  try {
    const re = new RegExp(escRe, 'i');
    const m = re.exec(transcript);
    if (m) return m.index;
  } catch (_) {}
  return -1;
}

/* 构建重点区（priority）：卡片带 ×N 徽章 + 重犯徽章 + 已入错题本标 */
function _buildPrioritySection(items) {
  const sec = el('div', 'rev-section');
  const head = el('div', 'rev-section-head error');
  head.innerHTML = `<span>✗ 重点</span><span class="cnt">${items.length} 条</span>`;
  sec.appendChild(head);

  if (!items.length) {
    sec.appendChild(el('div', 'rev-empty-note', '这段没有特别需要记住的问题'));
    return sec;
  }

  items.forEach((p, idx) => {
    const card = el('div', 'rev-card');
    const isNat = p.type === 'naturalness';
    const typeLabel = { grammar: '语法', wordchoice: '词不达意', collocation: '搭配', naturalness: '不自然' }[p.type] || p.type;
    card.innerHTML = `
      ${p.mistakeId ? '<span class="saved-tag">已进错题本</span>' : ''}
      <span class="${isNat ? 'nat-orig' : 'orig'}">${esc(p.original)}</span>
      <span class="arrow">→</span>
      <span class="correction">${esc(p.correction)}</span>
      ${p.count > 1 ? `<span class="rev-badge-count">×${p.count}</span>` : ''}
      ${p.recur ? `<span class="rev-badge-recur">⚠️ 第 ${p.recur} 次</span>` : ''}
      <div class="why">${esc(p.why)}</div>
      <span class="type-chip${isNat ? ' nat' : ''}">${esc(typeLabel)}</span>
      <button class="rev-save-chunk-btn${p.chunkAdded ? ' done' : ''}" data-save-chunk data-kind="priority" data-idx="${idx}" ${p.chunkAdded ? 'disabled' : ''}>${p.chunkAdded ? '已在词块库' : '存为词块'}</button>`;
    sec.appendChild(card);
  });

  return sec;
}

/* 构建完整清单（仅当有 minor 或 segments）：按 segments 分块，可折叠；无 segments 则一个平铺「次要」块 */
function _buildMinorSection(minor, segments) {
  const outer = el('div', 'rev-section');
  const head = el('div', 'rev-section-head nat');
  head.innerHTML = `<span>~ 完整清单</span><span class="cnt">${minor.length} 条</span>`;
  outer.appendChild(head);

  if (!minor.length) {
    outer.appendChild(el('div', 'rev-empty-note', '没有更多次要问题'));
    return outer;
  }

  function buildMinorCard(m, idx) {
    const card = el('div', 'rev-minor-card');
    const isNat = m.type === 'naturalness';
    const typeLabel = { grammar: '语法', wordchoice: '词不达意', collocation: '搭配', naturalness: '不自然' }[m.type] || m.type;
    card.innerHTML = `
      <span class="${isNat ? 'nat-orig' : 'orig'}">${esc(m.original)}</span>
      <span class="arrow">→</span>
      <span class="correction">${esc(m.correction)}</span>
      ${m.count > 1 ? `<span class="rev-badge-count">×${m.count}</span>` : ''}
      <div class="why">${esc(m.why)}</div>
      <span class="type-chip${isNat ? ' nat' : ''}">${esc(typeLabel)}</span>
      <div class="rev-minor-btns">
        <button class="rev-save-mistake-btn${m.mistakeId ? ' done' : ''}" data-save-mistake data-idx="${idx}" ${m.mistakeId ? 'disabled' : ''}>${m.mistakeId ? '已进错题本' : '入错题本'}</button>
        <button class="rev-save-chunk-btn${m.chunkAdded ? ' done' : ''}" data-save-chunk data-kind="minor" data-idx="${idx}" ${m.chunkAdded ? 'disabled' : ''}>${m.chunkAdded ? '已在词块库' : '存为词块'}</button>
      </div>`;
    return card;
  }

  if (!segments.length) {
    // 短文本：一个平铺折叠块
    const block = el('div', 'rev-seg-block collapsed');
    const blockHead = el('div', 'rev-seg-head', `<span>次要（${minor.length}）</span><span class="rev-seg-chevron">›</span>`);
    blockHead.onclick = () => block.classList.toggle('collapsed');
    block.appendChild(blockHead);
    const blockBody = el('div', 'rev-seg-body');
    minor.forEach((m, idx) => blockBody.appendChild(buildMinorCard(m, idx)));
    block.appendChild(blockBody);
    outer.appendChild(block);
    return outer;
  }

  // 按 segments 顺序分块，seg 为空的归入「其他」
  const groups = new Map();
  segments.forEach((s) => groups.set(s, []));
  const otherKey = '其他';
  const other = [];
  minor.forEach((m, idx) => {
    const seg = m.seg && groups.has(m.seg) ? m.seg : null;
    if (seg) groups.get(seg).push({ m, idx });
    else other.push({ m, idx });
  });

  for (const [segName, list] of groups) {
    if (!list.length) continue;
    const block = el('div', 'rev-seg-block collapsed');
    const blockHead = el('div', 'rev-seg-head', `<span>${esc(segName)}（${list.length}）</span><span class="rev-seg-chevron">›</span>`);
    blockHead.onclick = () => block.classList.toggle('collapsed');
    block.appendChild(blockHead);
    const blockBody = el('div', 'rev-seg-body');
    list.forEach(({ m, idx }) => blockBody.appendChild(buildMinorCard(m, idx)));
    block.appendChild(blockBody);
    outer.appendChild(block);
  }
  if (other.length) {
    const block = el('div', 'rev-seg-block collapsed');
    const blockHead = el('div', 'rev-seg-head', `<span>其他（${other.length}）</span><span class="rev-seg-chevron">›</span>`);
    blockHead.onclick = () => block.classList.toggle('collapsed');
    block.appendChild(blockHead);
    const blockBody = el('div', 'rev-seg-body');
    other.forEach(({ m, idx }) => blockBody.appendChild(buildMinorCard(m, idx)));
    block.appendChild(blockBody);
    outer.appendChild(block);
  }

  return outer;
}

function _buildChunkFeedbackSection(items, result) {
  const sec = el('div', 'rev-section');
  const head = el('div', 'rev-section-head chunk');
  head.innerHTML = `<span>词块反馈</span><span class="cnt">${items.length} 条</span>`;
  sec.appendChild(head);

  const retellChunks = (result && result._retellChunks) || [];
  items.forEach((it) => {
    const card = el('div', `rev-card chunk-fb-card${it.justMastered ? ' just-mastered' : ''}`);
    // 库里的词块自带 progress；没有的＝复述目标表达（库外）→ 给「存为词块」入库闭环
    const isLibrary = !!it.progress;
    card.innerHTML = `
      <span class="chunk-text">${esc(it.chunk)}</span>
      ${_chunkVerdictPill(it.verdict, it.justMastered)}
      ${it.quote ? `<div class="chunk-quote">"${esc(it.quote)}"</div>` : ''}
      <div class="why">${esc(it.comment)}</div>
      ${_progressDots(it.progress)}
      ${isLibrary ? '' : `<button class="rev-save-chunk-btn${it.chunkAdded ? ' done' : ''}" data-save-retell-chunk ${it.chunkAdded ? 'disabled' : ''}>${it.chunkAdded ? '已在词块库' : '存为词块'}</button>`}`;
    const saveBtn = card.querySelector('[data-save-retell-chunk]');
    if (saveBtn) saveBtn.onclick = async () => {
      saveBtn.disabled = true;
      const src = retellChunks.find((c) => c.text && c.text.toLowerCase() === String(it.chunk || '').toLowerCase()) || {};
      let res;
      try {
        res = await api('add_chunk', {
          text: it.chunk,
          meaning: (src.meaning || '').slice(0, 40),
          example: src.quote || it.quote || '',
          source: 'retell',
        });
      } catch (e) {
        saveBtn.disabled = false; toast('保存失败：' + e.message); return;
      }
      if (!res || !res.ok) { saveBtn.disabled = false; toast(res?.error || '保存失败'); return; }
      it.chunkAdded = true;
      saveBtn.textContent = '已在词块库';
      saveBtn.classList.add('done');
      toast('已存进词块库，积累里可以练');
    };
    sec.appendChild(card);
  });

  return sec;
}

/* ============ 「存为词块」共用逻辑（阶段9） ============ */
/* 复盘结果屏 priority/minor 卡片、错题本条目 均走这里：text=correction，meaning=why 截断，source="review" */
async function _onSaveChunkFromItem(btn, itemsArr) {
  const idx = parseInt(btn.dataset.idx, 10);
  const item = itemsArr[idx];
  if (!item) return;
  btn.disabled = true;
  const meaning = (item.why || '').slice(0, 40);
  let res;
  try {
    res = await api('add_chunk', { text: item.correction, meaning, source: 'review' });
  } catch (e) {
    btn.disabled = false; toast('保存失败：' + e.message); return;
  }
  if (!res || !res.ok) { btn.disabled = false; toast(res?.error || '保存失败'); return; }
  item.chunkAdded = true;
  btn.textContent = '已在词块库';
  btn.classList.add('done');
  toast('已存进词块库');
}

/* ============ 对话稿卡（阶段10） ============ */
/* source='dual' 复盘的原文卡替代品：逐 turn 渲染，speaker 标签「我」（深蓝小签）/「对方」（暖灰小签）；
   我的 turn 里照旧用 _highlightTranscriptV2 做错误高亮（该函数按文本查找，可对单个 turn 子串独立调用）。
   默认折叠只露前几个 turn，点击展开全部。 */
const _DIALOG_COLLAPSED_TURNS = 4;

function _buildDialogCard(dialog, priority, minor) {
  const wrap = el('div', 'dual-dialog-card');
  const list = el('div', 'dual-dialog-list');

  dialog.forEach((turn, idx) => {
    const row = el('div', `dual-turn dual-turn-${turn.speaker}${idx >= _DIALOG_COLLAPSED_TURNS ? ' dual-turn-extra' : ''}`);
    const speakerLabel = turn.speaker === 'me' ? '我' : '对方';
    const textHtml = turn.speaker === 'me'
      ? _highlightTranscriptV2(turn.text, priority, minor)
      : esc(turn.text);
    row.innerHTML = `
      <span class="dual-turn-tag dual-turn-tag-${turn.speaker}">${speakerLabel}</span>
      <span class="dual-turn-text">${textHtml}</span>`;
    list.appendChild(row);
  });

  wrap.appendChild(list);

  if (dialog.length > _DIALOG_COLLAPSED_TURNS) {
    const expandBtn = el('button', 'rev-expand-btn', `展开全部对话（共 ${dialog.length} 句）`);
    expandBtn.onclick = () => {
      const expanded = list.classList.toggle('dual-dialog-expanded');
      expandBtn.textContent = expanded ? '收起' : `展开全部对话（共 ${dialog.length} 句）`;
    };
    wrap.appendChild(expandBtn);
  }

  return wrap;
}

/* ============ 偷学区块（阶段10） ============ */
/* 放在「用得好」之后；橄榄绿系标题（复用 --ok 变量，已是低饱和墨绿，符合暖纸档案风）。
   每条卡片：expression（衬线，显眼）+ quote（小字引用）+ why（中文）+ example（衬线）+「存为词块」按钮。
   区块头一个「全部入库」。 */
function _buildStealSection(steals) {
  const sec = el('div', 'rev-section');
  const head = el('div', 'rev-section-head steal');
  head.innerHTML = `<span>偷学</span><span class="cnt">${steals.length} 条</span>
    <button class="rev-steal-all-btn" id="revStealAll">全部入库</button>`;
  sec.appendChild(head);

  steals.forEach((s, idx) => {
    const card = el('div', 'rev-card steal-card');
    card.innerHTML = `
      <span class="steal-expression">${esc(s.expression)}</span>
      <div class="steal-quote">"${esc(s.quote)}"</div>
      <div class="why">${esc(s.why)}</div>
      <div class="steal-example">${esc(s.example)}</div>
      <button class="rev-save-chunk-btn${s.chunkAdded ? ' done' : ''}" data-save-steal data-idx="${idx}" ${s.chunkAdded ? 'disabled' : ''}>${s.chunkAdded ? '已在词块库' : '存为词块'}</button>`;
    sec.appendChild(card);
  });

  return sec;
}

/* 偷学卡片按钮绑定：单条「存为词块」+ 区块头「全部入库」。
   add_chunk({text:expression, meaning:why, example, source:'steal', sourceRef:reviewId}) —— spec §3。 */
function _bindStealButtons(wrap, steals, reviewId) {
  async function saveOne(idx, btn) {
    const item = steals[idx];
    if (!item || item.chunkAdded) return true;
    if (btn) btn.disabled = true;
    let res;
    try {
      res = await api('add_chunk', {
        text: item.expression, meaning: item.why, example: item.example,
        source: 'steal', sourceRef: reviewId || '',
      });
    } catch (e) {
      if (btn) btn.disabled = false;
      toast('保存失败：' + e.message);
      return false;
    }
    if (!res || !res.ok) {
      if (btn) btn.disabled = false;
      toast((res && res.error) || '保存失败');
      return false;
    }
    item.chunkAdded = true;
    if (btn) {
      btn.textContent = '已在词块库';
      btn.classList.add('done');
    }
    return true;
  }

  $$('[data-save-steal]', wrap).forEach((btn) => {
    btn.onclick = () => saveOne(parseInt(btn.dataset.idx, 10), btn);
  });

  const allBtn = $('#revStealAll', wrap);
  if (allBtn) {
    allBtn.onclick = async () => {
      allBtn.disabled = true;
      for (let i = 0; i < steals.length; i++) {
        const btn = $(`[data-save-steal][data-idx="${i}"]`, wrap);
        await saveOne(i, btn);
      }
      allBtn.textContent = '已全部入库';
      toast('已全部存进词块库');
    };
  }
}

/* 子串高亮 v1（旧数据降级用）：errors=赭橙，naturalness=暖金 */
function _highlightTranscript(transcript, errors, naturalness) {
  const ranges = [];
  function addRanges(items, cls) {
    for (const item of items) {
      const orig = (item.original || '').trim();
      if (!orig) continue;
      const idx = transcript.indexOf(orig);
      if (idx < 0) continue;
      ranges.push([idx, idx + orig.length, cls]);
    }
  }
  addRanges(errors, 'rev-hl-error');
  addRanges(naturalness, 'rev-hl-nat');

  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const r of ranges) {
    if (merged.length && r[0] < merged[merged.length - 1][1]) continue;
    merged.push(r);
  }

  let html = '';
  let pos = 0;
  for (const [s, e, cls] of merged) {
    html += esc(transcript.slice(pos, s));
    html += `<span class="${cls}">${esc(transcript.slice(s, e))}</span>`;
    pos = e;
  }
  html += esc(transcript.slice(pos));
  return html;
}

/* 构建三个区块（v1 降级渲染专用） */
function _buildSection(type, title, items, kind) {
  const sec = el('div', 'rev-section');

  const head = el('div', `rev-section-head ${type}`);
  const icons = { good: '✦', error: '✗', nat: '~' };
  head.innerHTML = `<span>${icons[type] || ''} ${esc(title)}</span><span class="cnt">${items.length} 条</span>`;
  sec.appendChild(head);

  if (kind === 'strengths') {
    if (!items.length) {
      sec.appendChild(el('div', 'rev-empty-note', '这段没有特别突出的亮点，继续加油'));
    } else {
      const ul = el('ul', 'rev-strengths-list');
      items.forEach((s) => {
        const li = el('li', '', esc(String(s)));
        ul.appendChild(li);
      });
      sec.appendChild(ul);
    }
  } else if (kind === 'errors') {
    if (!items.length) {
      sec.appendChild(el('div', 'rev-empty-note', '未发现明显语法或用词错误'));
    } else {
      items.forEach((e) => {
        const card = el('div', 'rev-card');
        const typeLabel = { grammar: '语法', wordchoice: '词不达意', collocation: '搭配' }[e.type] || e.type;
        card.innerHTML = `
          <span class="saved-tag">已进错题本</span>
          <span class="orig">${esc(e.original)}</span>
          <span class="arrow">→</span>
          <span class="correction">${esc(e.correction)}</span>
          <div class="why">${esc(e.why)}</div>
          <span class="type-chip">${esc(typeLabel)}</span>`;
        sec.appendChild(card);
      });
    }
  } else if (kind === 'naturalness') {
    if (!items.length) {
      sec.appendChild(el('div', 'rev-empty-note', '表达已相当地道'));
    } else {
      items.forEach((n) => {
        const card = el('div', 'rev-card');
        card.innerHTML = `
          <span class="saved-tag">已进错题本</span>
          <span class="nat-orig">${esc(n.original)}</span>
          <span class="arrow">→</span>
          <span class="correction">${esc(n.better)}</span>
          <div class="why">${esc(n.why)}</div>
          <span class="type-chip nat">不自然</span>`;
        sec.appendChild(card);
      });
    }
  }

  return sec;
}

/* ============ 历史屏（阶段8）============ */
async function _showHistoryScreen() {
  if (_recState) _stopRecord();
  _setScreen('history', '复盘历史');

  const body = $('#reviewBody');
  body.innerHTML = `
    <div class="hist-controls">
      <div class="voc-search"><input id="histSearch" placeholder="搜索主题 / 原文…" autocomplete="off" value="${esc(RS.historyState.q)}"></div>
    </div>
    <div class="hist-list" id="histList"></div>`;

  let _histST;
  $('#histSearch').addEventListener('input', (e) => {
    RS.historyState.q = e.target.value;
    clearTimeout(_histST);
    _histST = setTimeout(_loadAndRenderHistory, 280);
  });

  await _loadAndRenderHistory();
}

const _SRC_ICON = {
  mic: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0"/><path d="M12 17v3.6M8.5 20.6h7"/></svg>`,
  paste: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="12" height="16" rx="1.5"/><path d="M9 9h6M9 13h6M9 17h3"/></svg>`,
  dual: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5h11a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H9l-3.5 3v-3H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2z"/><path d="M20 10.5v6a2 2 0 0 1-2 2h-1v2.6l-2.6-2.6" /></svg>`,
};

function _histDayLabel(ts) {
  const d = new Date(ts);
  const wd = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
  return `${d.getMonth() + 1}月${d.getDate()}日 · ${wd}`;
}

async function _loadAndRenderHistory() {
  const listEl = $('#histList');
  if (!listEl) return;
  listEl.innerHTML = '<div class="loading-line"><span class="spin"></span>载入中…</div>';

  let items = [];
  try {
    items = await api('list_reviews', { q: RS.historyState.q || undefined });
  } catch (e) {
    listEl.innerHTML = '';
    toast('加载失败：' + e.message);
    return;
  }

  if (!items.length) {
    listEl.innerHTML = '<div class="empty" style="padding:28px 16px;text-align:center;color:var(--muted)">暂无复盘记录</div>';
    return;
  }

  // 按日分组（日期头）
  const groups = [];
  let lastDay = null;
  for (const r of items) {
    const dayKey = new Date(r.createdAt).toDateString();
    if (dayKey !== lastDay) {
      groups.push({ dayKey, label: _histDayLabel(r.createdAt), rows: [] });
      lastDay = dayKey;
    }
    groups[groups.length - 1].rows.push(r);
  }

  listEl.innerHTML = '';
  for (const g of groups) {
    listEl.appendChild(el('div', 'hist-day-head', esc(g.label)));
    for (const r of g.rows) {
      const time = new Date(r.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      const srcKey = r.source === 'dual' ? 'dual' : (r.source === 'record' || r.source === 'mic' ? 'mic' : 'paste');
      const srcIcon = _SRC_ICON[srcKey];
      const row = el('div', 'hist-item');
      row.innerHTML = `
        <div class="hist-item-top">
          <span class="hist-topic">${esc(r.topic || r.snippet || '（无内容）')}</span>
          <span class="hist-time">${time}</span>
        </div>
        <div class="hist-item-bottom">
          <span class="hist-src">${srcIcon}</span>
          <span class="hist-wc">${r.wordCount} 词</span>
          <span class="hist-counts">重点 ${r.priorityCount} · 次要 ${r.minorCount}</span>
        </div>`;
      row.onclick = () => _openReviewFromHistory(r.id);
      listEl.appendChild(row);
    }
  }
}

async function _openReviewFromHistory(id) {
  let row;
  try {
    row = await api('get_review', { id });
  } catch (e) {
    toast('加载失败：' + e.message); return;
  }
  if (!row || row.error) { toast(row?.error || '找不到该复盘记录'); return; }

  const isV2 = row.version === 2;
  const result = isV2
    ? {
        reviewId: row.id, transcript: row.transcript, model: row.model, source: row.source || 'paste',
        topic: row.result.topic, overall: row.result.overall, strengths: row.result.strengths,
        segments: row.result.segments, priority: row.result.priority, minor: row.result.minor,
        chunkFeedback: row.result.chunkFeedback || [],
        dialog: row.result.dialog || null, steals: row.result.steals || [],
        timing: row.result.timing || null, retellTitle: row.result.retellTitle || '',
      }
    : {
        reviewId: row.id, transcript: row.transcript, model: row.model, source: row.source || 'paste',
        strengths: row.result.strengths, errors: row.result.errors, naturalness: row.result.naturalness,
      };

  RS.lastResult = result;
  _showResultScreen(result);
}
