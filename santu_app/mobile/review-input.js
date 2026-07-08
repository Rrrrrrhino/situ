/* 四土 · 口语复盘 —— 输入屏（根屏）：双轨录音卡 / 待复盘 chips / 复述题签 / 一条龙复盘 / 单麦录音器 */
'use strict';

/* ============ 输入屏 ============ */
function _showInputScreen() {
  _setScreen('input', '口语复盘', { root: true });
  const body = $('#reviewBody');
  // 桌面独立窗（REVIEW_ONLY）：录音只走双轨引擎一扇门（recCardSlot），不再给单麦按钮——
  // 单麦 getUserMedia 路保留给手机版复盘和词块练习作答（那里没有/不需要 Swift 引擎）。
  // 同时不给「背景/话题」输入（对话录音自带上下文，独白也用不上）；文本区语义 = 转写后的文本。
  const RO = !!window.REVIEW_ONLY;
  body.innerHTML = `
    <div id="recCardSlot"></div>
    <div id="retellSlot"></div>
    <div id="dualCardSlot"></div>
    <div class="rev-input-wrap">
      <div class="rev-label">${RO ? '转写后的文本' : '你的英文输出'}</div>
      <textarea class="rev-textarea" id="revText"
        placeholder="${RO ? '录音点「复盘」时会转写到这里；也可以直接贴 / 打英文…' : '把你刚说的英文贴进来，或直接打…'}"
        rows="7"></textarea>
      ${RO ? '' : `<button class="rev-rec-btn" id="revRec" type="button">${_RS.mic}<span id="revRecLab">录音说一段</span></button>
      <div class="rev-label" style="margin-top:12px">背景 / 话题（可选）</div>
      <input class="rev-ctx-input" id="revCtx"
        type="text" placeholder="对方说了什么 / 讨论什么话题…">`}
      <button class="rev-submit" id="revSubmit">复盘</button>
    </div>
    <div class="recent-reviews" id="recentReviews"></div>`;

  // 恢复上次的草稿
  const saved = (typeof sessionStorage !== 'undefined') ? sessionStorage.getItem('rev_draft') : '';
  if (saved) $('#revText').value = saved;

  body.scrollTop = 0;

  $('#revSubmit').onclick = _doReview;
  _paintRecBtn();
  // 自动保存草稿
  $('#revText').addEventListener('input', () => {
    try { sessionStorage.setItem('rev_draft', $('#revText').value); } catch (_) {}
  });

  _loadRecCard();
  _loadRetellSlot();
  _loadDualtrackCard();
  _loadRecentReviews();
  _startRecWatch();
  _checkRetellPending();
}

/* ============ 根屏「最近复盘」3 条 + 全部›（§3.4：历史入口从头部搬进正文） ============ */
async function _loadRecentReviews() {
  const box = $('#recentReviews');
  if (!box) return;
  let items = [];
  try { items = await api('list_reviews', {}); } catch (_) { return; } // 拿不到就不渲染（历史仍可从结果屏进）
  if (RS.view !== 'input') return;
  if (!Array.isArray(items) || !items.length) { box.innerHTML = ''; return; }

  box.innerHTML = `
    <div class="recent-head">
      <span class="recent-title">最近复盘</span>
      <button class="recent-all" id="recentAllBtn" type="button">全部 ›</button>
    </div>
    <div class="recent-list" id="recentList"></div>`;
  const list = $('#recentList');
  items.slice(0, 3).forEach((r) => {
    const d = new Date(r.createdAt);
    const dateTxt = `${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
    const srcKey = r.source === 'dual' ? 'dual' : (r.source === 'record' || r.source === 'mic' ? 'mic' : 'paste');
    const row = el('div', 'recent-item');
    row.innerHTML = `
      <span class="recent-src">${_SRC_ICON[srcKey]}</span>
      <span class="recent-topic">${esc(r.topic || r.snippet || '（无内容）')}</span>
      <span class="recent-date">${dateTxt}</span>`;
    row.onclick = () => _openReviewFromHistory(r.id);
    list.appendChild(row);
  });
  $('#recentAllBtn').onclick = _showHistoryScreen;
}

/* ============ 双轨录音卡（桌面独立窗专用；复用 app.js 首页卡的全套全局函数） ============ */
async function _loadRecCard() {
  const slot = $('#recCardSlot');
  if (!slot || !window.REVIEW_ONLY) return;
  let status;
  try { status = await window.LocalApi.recorder_status(); }
  catch (_) { return; } // 引擎/server 不可用（如手机版）→ 整卡不渲染
  const card = el('div', 'rec-card');
  _fillRecCard(card, status);
  slot.innerHTML = '';
  slot.appendChild(card);
  // 录音中重进本屏：接上计时轮询（_fillRecCard 只画不轮询，轮询原本只在点「开始」时启动）
  if (status.recording) _startRecPoll(card);
}

/* 录音状态看守（独立窗专用）：盯 recorder_status，开始/停止翻转时整屏刷新输入屏——
   停止后待复盘 chip 立即冒出来，不用手动刷新。离开输入屏自动停表。 */
let _recWatchT = null;
let _recWatchLast = null;
function _startRecWatch() {
  if (_recWatchT) { clearInterval(_recWatchT); _recWatchT = null; }
  if (!window.REVIEW_ONLY) return;
  _recWatchLast = null;
  _recWatchT = setInterval(async () => {
    if (RS.view !== 'input' || !document.querySelector('#recCardSlot')) {
      clearInterval(_recWatchT); _recWatchT = null; return;
    }
    _checkRetellPending(); // 顺带接主窗「复述」递来的条子（本地 GET，极轻）
    let st;
    try { st = await window.LocalApi.recorder_status(); }
    catch (_) { return; }
    const rec = !!st.recording;
    if (_recWatchLast !== null && rec !== _recWatchLast) {
      _showInputScreen(); // 翻转（开始/停止）→ 录音卡 + 复述卡 + 待复盘 chips 一起刷新
      return;
    }
    _recWatchLast = rec;
  }, 1500);
}

/* ============ 对话录音待复盘卡（阶段10） ============ */
const _RS_DUAL = {
  dot: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none"/></svg>`,
  chevron: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>`,
};

async function _loadDualtrackCard() {
  const slot = $('#dualCardSlot');
  if (!slot) return;
  let list = [];
  try {
    list = await api('list_dualtrack', {});
  } catch (_) {
    return; // 静默失败：这只是个提示卡，不影响主输入流程
  }
  RS.dualtrackList = Array.isArray(list) ? list : [];
  _syncSubmitLabel();
  if (!RS.dualtrackList.length) { slot.innerHTML = ''; return; }

  // 独立窗：最近录音成 chips（含已复盘历史），点 chip 选中、点「复盘」转写选中那段；✕ = 移出历史
  if (window.REVIEW_ONLY) {
    _renderDualChips(slot);
    return;
  }

  // 手机版提示卡只数未复盘的（历史条目不该催复盘）
  const pending = RS.dualtrackList.filter((it) => !it.done);
  if (!pending.length) { slot.innerHTML = ''; return; }
  const card = el('div', 'dual-card');
  card.innerHTML = `
    <span class="dual-card-ic">${_RS_DUAL.dot}</span>
    <span class="dual-card-txt">有 <strong>${pending.length}</strong> 段对话录音待复盘</span>
    <span class="dual-card-chev">${_RS_DUAL.chevron}</span>`;
  card.onclick = _showDualListScreen;
  slot.innerHTML = '';
  slot.appendChild(card);
}

/* 本次「复盘」该转写哪段录音：用户点选过 → 那段（含已复盘的历史条，点了=想重新转写）；
   没点选过 → 最新一段未复盘的；全都复盘过 → null（走文本复盘路径）。 */
function _effectiveDualItem() {
  if (RS.selectedDualDir) {
    const it = RS.dualtrackList.find((x) => x.dir === RS.selectedDualDir);
    if (it) return it;
  }
  return RS.dualtrackList.find((x) => !x.done) || null;
}

/* 独立窗录音 chips（最近历史，服务端保留最近 5 条）：可点选（选中项带墨框+提示）；
   已复盘的条目带「已复盘」标记，点选后可重新转写；✕ = 从历史移除（音频仍留盘）。 */
function _renderDualChips(slot) {
  slot.innerHTML = '';
  // 选中项已被丢弃 → 回落默认（最新未复盘）
  if (!RS.dualtrackList.some((it) => it.dir === RS.selectedDualDir)) RS.selectedDualDir = null;
  const effective = _effectiveDualItem();
  const selDir = effective && effective.dir;
  RS.dualtrackList.forEach((item) => {
    const sel = item.dir === selDir;
    const hint = sel ? `<span class="dual-chip-hint">${item.done ? '点「复盘」重新转写' : '点「复盘」转写这段'}</span>` : '';
    const doneTag = item.done ? '<span class="dual-chip-done">已复盘</span>' : '';
    const chip = el('div', 'dual-chip' + (sel ? ' selected' : '') + (item.done ? ' done' : ''));
    chip.innerHTML = `
      <span class="dual-chip-ic">${_RS_DUAL.dot}</span>
      <span class="dual-chip-txt">录音 ${esc(_dualTimeLabel(item.startedAt))} · ${esc(_dualDurationLabel(item.durationSec))}${doneTag}${hint}</span>
      <button class="dual-chip-x" type="button" title="从历史移除这段录音">✕</button>`;
    chip.onclick = () => {
      RS.selectedDualDir = item.dir;
      _renderDualChips(slot);
      _syncSubmitLabel();
    };
    $('.dual-chip-x', chip).onclick = async (ev) => {
      ev.stopPropagation();
      try { await api('dualtrack_done', { dir: item.dir, hide: true }); } catch (_) {}
      if (RS.selectedDualDir === item.dir) RS.selectedDualDir = null;
      _loadDualtrackCard();
    };
    slot.appendChild(chip);
  });
}

/* 复盘按钮文案统一叫「复盘」（转写是内部过程，用户只关心结果） */
function _syncSubmitLabel() {
  const btn = $('#revSubmit');
  if (!btn || btn.disabled) return;
  btn.textContent = '复盘';
}

/* ============ 复述练习（阅读联动，2026-07-07） ============
   形态：输入屏的「带题模式」。选一篇读过的 → 入口行变身复述题签卡（书名+目标表达+
   可折叠原文抽屉）→ 照常录音/复盘，复盘注入书名+原文开头+目标表达（chunkFeedback 反馈）。
   来源两条路：① 本屏「说一说读过的」选材屏（server 同盘读 library）；
   ② 主窗阅读页「复述」按钮递条子（/api/retell_pending，_checkRetellPending 接）。 */

function _saveRetell() {
  try {
    if (RS.retell) sessionStorage.setItem('rev_retell', JSON.stringify(RS.retell));
    else sessionStorage.removeItem('rev_retell');
  } catch (_) {}
}

function _loadRetellSlot() {
  const slot = $('#retellSlot');
  if (!slot) return;
  if (!window.REVIEW_ONLY) { slot.innerHTML = ''; return; }   // 手机版无 server，不给入口
  const r = RS.retell;

  if (!r) {
    slot.innerHTML = `
      <div class="retell-entry" id="retellEntry">
        <span class="retell-entry-ic">▤</span>
        <span class="retell-entry-txt">说一说读过的 —— 挑一篇来复述</span>
        <span class="retell-entry-chev">›</span>
      </div>`;
    $('#retellEntry').onclick = _showRetellPicker;
    return;
  }

  const chipsHtml = (r.chunks && r.chunks.length)
    ? `<div class="retell-chips">${r.chunks.map((c, i) =>
        `<button type="button" class="retell-chip c${(i % 3) + 1}${r._chipOpen === i ? ' open' : ''}" data-chip="${i}"><span class="rc-txt">${esc(c.text)}</span><span class="rc-say" data-say="${esc(c.text)}" title="朗读这个词块">${SVG.speaker}</span></button>`).join('')}</div>
       <div class="retell-chip-detail${r._chipOpen == null ? ' hidden' : ''}" id="retellChipDetail"></div>
       <div class="retell-chips-cap">点一枚看用法 · 试着把这些说出口，复盘会逐条给你反馈</div>`
    : (r.loading ? `<div class="retell-chips-cap loading">正在挑值得用的表达…</div>`
      // 目标词块不再自动生成：先给一颗按钮，用户点了才挑（用户拍板）。勾选来源直接有 chunks，不会走到这。
      : (!r.generated
        ? `<div class="retell-chips-cap">想练几个地道表达？<button class="retell-chips-gen" id="retellChipsGen" type="button">挑几个值得练的词块 ›</button></div>`
        : (r.chunksFailed
          ? `<div class="retell-chips-cap">目标表达没取到。<button class="retell-chips-retry" id="retellChipsRetry" type="button">重试</button></div>`
          : '')));

  // 原文抽屉按段渲染（text 以双换行分段；老状态里没有分段的整篇算一段）。
  // 选材带来的 r.hl 优先：把阅读器里划的荧光笔/整段色卡原样显影（洗色走 --wX/--wpX）。
  const _ck = (c) => (c && /^[A-FP]$/.test(c) ? c : null);
  const srcHtml = (r.hl && r.hl.length)
    ? r.hl.map((pa) => {
        const inner = (pa.r || []).map((run) => {
          const t = esc((run && run.t) || '');
          return _ck(run && run.c) ? `<mark class="rt-hl" style="background:var(--w${run.c})">${t}</mark>` : t;
        }).join('');
        const pc = _ck(pa && pa.p);
        return `<p${pc ? ` class="rt-para" style="background:var(--wp${pc})"` : ''}>${inner}</p>`;
      }).join('')
    : String(r.text || '').split(/\n{2,}/)
      .map((p) => p.trim()).filter(Boolean)
      .map((p) => `<p>${esc(p)}</p>`).join('');

  slot.innerHTML = `
    <div class="retell-card">
      <div class="retell-eyebrow"><span class="retell-seal">复 述</span>
        <button class="retell-src-toggle" id="retellSrcToggle" type="button">原文 ▾</button>
      </div>
      <button class="retell-x" id="retellX" type="button" title="取消复述，回到普通复盘">✕</button>
      <div class="retell-title">${esc(r.title || '（无标题）')}</div>
      <div class="retell-hint">用自己的话，把它讲给一个没读过的人</div>
      <div class="retell-src${r._srcOpen ? '' : ' hidden'}" id="retellSrc">${srcHtml}</div>
      ${chipsHtml}
    </div>`;
  if (r._srcOpen) $('#retellSrcToggle').textContent = '原文 ▴';

  $('#retellX').onclick = () => { RS.retell = null; _saveRetell(); _loadRetellSlot(); };
  $('#retellSrcToggle').onclick = () => {
    const box = $('#retellSrc');
    const open = box.classList.toggle('hidden') === false;
    r._srcOpen = open; // 只记在内存态：chips 到货重绘/录音看守刷新时抽屉不再自己合上
    $('#retellSrcToggle').textContent = open ? '原文 ▴' : '原文 ▾';
  };
  const chipsRetry = $('#retellChipsRetry');
  if (chipsRetry) chipsRetry.onclick = () => {
    r.loading = true; r.chunksFailed = false;
    _saveRetell(); _loadRetellSlot(); _fetchRetellTargets();
  };
  // 「挑几个值得练的词块」按钮：点了才现挑（用户拍板：默认不自动生成）
  const chipsGen = $('#retellChipsGen');
  if (chipsGen) chipsGen.onclick = () => {
    r.loading = true;
    _saveRetell(); _loadRetellSlot(); _fetchRetellTargets();
  };
  // 词条卡：点一枚 chip 展开 中文义 + 用法骨架 + 原文那句话（再点合上）
  $$('.retell-chip[data-chip]').forEach((chipEl) => {
    chipEl.onclick = (e) => {
      const say = e.target.closest('.rc-say');
      if (say) { e.stopPropagation(); playAudio(say.dataset.say || '', say); return; }  // 只发音，不展开 chip
      const i = parseInt(chipEl.dataset.chip, 10);
      r._chipOpen = (r._chipOpen === i) ? null : i;
      _paintRetellChipDetail(r);
    };
  });
  if (r._chipOpen != null) _paintRetellChipDetail(r);
  // 恢复的状态若目标表达还没拿到（上次会话中断），补一次
  if (r.loading && !(r.chunks && r.chunks.length)) _fetchRetellTargets();
}

/* 词条卡内容：不重绘整卡（抽屉/滚动位不动），只画 detail 区与 chip 开合态 */
function _paintRetellChipDetail(r) {
  const box = $('#retellChipDetail');
  if (!box) return;
  $$('.retell-chip[data-chip]').forEach((elm) => {
    elm.classList.toggle('open', parseInt(elm.dataset.chip, 10) === r._chipOpen);
  });
  if (r._chipOpen == null || !(r.chunks && r.chunks[r._chipOpen])) {
    box.classList.add('hidden');
    box.innerHTML = '';
    return;
  }
  const c = r.chunks[r._chipOpen];
  // 原文句里把该表达标出来（大小写不敏感的一次替换；找不到就原样放）
  let quoteHtml = '';
  if (c.quote) {
    const q = esc(c.quote);
    const needle = esc(c.text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    try { quoteHtml = q.replace(new RegExp(needle, 'i'), (m) => `<mark>${m}</mark>`); }
    catch (_) { quoteHtml = q; }
  }
  box.innerHTML = `
    <div class="rcd-text">${esc(c.text)}${c.meaning ? `<span class="rcd-meaning">${esc(c.meaning)}</span>` : ''}</div>
    ${c.pattern ? `<div class="rcd-pattern">${esc(c.pattern)}</div>` : ''}
    ${quoteHtml ? `<div class="rcd-quote">${quoteHtml}</div>` : ''}`;
  box.classList.remove('hidden');
}

function _setRetell(payload) {
  const rawText = String(payload.text || '');
  // 收获集勾选送来的目标词块（批β γ）：直接用这几条，绝不再自动挑词（用户拍板：勾了就只练勾的）。
  const picked = Array.isArray(payload.chunks) ? payload.chunks
    .map((c) => ({ text: String((c && c.text) || '').trim(),
                   meaning: String((c && c.meaning) || '').trim(),
                   quote: String((c && c.quote) || '').trim() }))
    .filter((c) => c.text) : [];
  RS.retell = {
    title: String(payload.title || '').slice(0, 200),
    text: rawText.slice(0, 60000),
    // 高亮 runs 与 text 是同一批段落生成的；text 被截断时段落对不上号，宁可整篇不带色
    hl: (payload.hl && payload.hl.length && rawText.length <= 60000) ? payload.hl : null,
    chunks: picked,
    // generated：目标词块是否已备好。勾选来的天生就绪；否则先不生成，等用户点「挑词」按钮（用户拍板）。
    generated: picked.length > 0,
    loading: false,
  };
  _saveRetell();
  if (RS.view !== 'input') _showInputScreen(); else _loadRetellSlot();
  // 不再进屏就自动 _fetchRetellTargets：非勾选来源一律改为按钮触发。
}

let _retellFetchSeq = 0;
async function _fetchRetellTargets() {
  const cur = RS.retell;
  if (!cur) return;
  const seq = ++_retellFetchSeq;
  let res = null;
  try {
    res = await api('retell_targets', { title: cur.title, text: cur.text.slice(0, 12000) });
  } catch (_) {}
  if (RS.retell !== cur || seq !== _retellFetchSeq) return; // 已取消/换篇，作废
  cur.chunks = (res && res.chunks) || [];
  cur.loading = false;
  cur.generated = true;   // 挑过了（成功或空/失败都算已生成）：不再回落成「挑词」按钮
  // 失败（请求挂了/ok:false）≠ 真没挑出：失败给「重试」，真空则安静
  cur.chunksFailed = !cur.chunks.length && (!res || res.ok === false);
  _saveRetell();
  if (RS.view === 'input') _loadRetellSlot();
}

/* 选材屏：最近读物（server 同盘直读；书籍章节走主窗阅读页的「复述」按钮带过来） */
async function _showRetellPicker() {
  _setScreen('retellPick', '说一说读过的');
  const body = $('#reviewBody');
  body.innerHTML = '<div class="retell-pick-list" id="retellPickList"><div class="retell-pick-cap">正在取回书架…</div></div>';

  // 用轻量目录（不含 base64 封面）——选材屏只显示标题/来源/日期，整包从数百 KB 降到几 KB。
  // 退避重试：首个立即，之后 0.5s/1.2s/2.5s。冷开复盘窗时 server 的 Api() 有 1-3s 词表冷启动
  // （spec 阅读联动 §2 明写「冷启动本该转圈等、绝不白屏」）；背靠背瞬发的重试全撞在冷启动窗口内
  // 会一起失败，退避才等得过去。加载态「正在取回书架…」在这几秒里一直亮着。
  let items = null, err = '', attempts = 0;
  const _sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (const delay of [0, 500, 1200, 2500]) {
    if (delay) await _sleep(delay);
    if (RS.view !== 'retellPick') return;   // 退避期间用户离开了就别再打
    attempts++;
    try {
      const resp = await fetch('/api/list_library_brief', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      items = await resp.json();
      err = '';
      break;
    } catch (e) { err = (e && e.message) || '网络错误'; }
  }
  if (RS.view !== 'retellPick') return;

  const listEl = $('#retellPickList');
  // 接口失败/返回非数组：明说（带上试了几次，便于取证）+ 给「再试一次」，绝不装作「书架是空的」
  if (!Array.isArray(items)) {
    err = err || (items && items.error) || '返回格式不对';
    console.warn('[retell] list_library_brief 失败:', err, '（试了', attempts, '次）', items);
    listEl.innerHTML = `
      <div class="retell-pick-cap">书架没取回来（试了 ${attempts} 次）：${esc(String(err).slice(0, 120))}</div>
      <button class="retell-retry" id="retellRetry" type="button">再试一次</button>`;
    $('#retellRetry').onclick = _showRetellPicker;
    return;
  }

  const articles = items.filter((it) => it.mode !== 'book').slice(0, 30);
  if (!articles.length) {
    listEl.innerHTML = '<div class="retell-pick-cap">还没有读过的文章。读过的会出现在这里；书的章节，在读书页面点「复述」带过来。</div>';
    return;
  }
  listEl.innerHTML = '<div class="retell-pick-cap">挑一篇，用自己的话复述。书的章节：在读书页面点「复述」带过来。</div>';
  articles.forEach((it) => {
    const row = el('div', 'retell-pick-item');
    const d = it.saved_at ? new Date(it.saved_at * (it.saved_at < 2e10 ? 1000 : 1)) : null;
    const dateTxt = d ? `${d.getMonth() + 1}月${d.getDate()}日` : '';
    // 来源是整条 URL 的（粘链接读的文章）收敛成域名，像书目里的社名
    let src = it.source || '';
    if (/^https?:\/\//i.test(src)) { try { src = new URL(src).hostname.replace(/^www\./, ''); } catch (_) {} }
    row.innerHTML = `
      <div class="t">${esc(it.title || '(无标题)')}</div>
      <div class="m"><span class="src">${esc(src.slice(0, 40))}</span><span>${dateTxt}</span></div>`;
    row.onclick = () => _pickRetellItem(it, row);
    listEl.appendChild(row);
  });
}

async function _pickRetellItem(it, row) {
  row.classList.add('busy');
  let rec = null;
  try {
    const resp = await fetch('/api/load_archive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: it.id }) });
    rec = await resp.json();
  } catch (_) {}
  row.classList.remove('busy');
  const html = rec && (rec.article_html || rec.html);   // 文章存档字段=article_html（纯正文，标题/来源行在外面）
  if (!rec || rec.error || !html) {
    toast((rec && rec.error) || '这篇取不回原文，换一篇试试');
    return;
  }
  let text = '', hl = null;
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('.doc-title,.doc-meta,.doc-cover-wrap,script,style').forEach((n) => n.remove());
    // DOMParser 的文档没有布局，innerText 退化成 textContent（块级换行全丢，整篇黏成一堵墙）。
    // 按叶子块级元素收集段落、双换行相接——原文抽屉按段渲染，LLM 也吃带段落的版本。
    // 同时把阅读器里划过的高亮带出来：荧光笔 span（.hl[data-c]）按文本节点归属收集成
    // runs，整段色卡（.hl.para）记段级色键——原文抽屉照样显影，LLM 仍只吃纯文本。
    const blocks = doc.body.querySelectorAll('p,h1,h2,h3,h4,h5,h6,li,blockquote,figcaption,pre');
    const paras = [];
    const rich = [];
    let hasHl = false;
    const _key = (el) => {
      const c = (el && el.getAttribute && el.getAttribute('data-c')) || '';
      return /^[A-FP]$/.test(c) ? c : 'F';   // 缺色键的旧高亮按默认橄榄
    };
    blocks.forEach((b) => {
      if (b.querySelector('p,li,blockquote')) return; // 只取叶子块，避免嵌套重复
      const runs = [];
      const walker = doc.createTreeWalker(b, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        let t = String(node.nodeValue || '').replace(/\s+/g, ' ');
        if (!t) continue;
        let hlEl = node.parentElement ? node.parentElement.closest('.hl:not(.para)') : null;
        if (hlEl && !b.contains(hlEl)) hlEl = null;   // 只认块内的荧光笔
        const c = hlEl ? _key(hlEl) : null;
        const last = runs[runs.length - 1];
        if (last && last.c === c) {
          if (last.t.endsWith(' ') && t.startsWith(' ')) t = t.slice(1);
          last.t += t;
        } else runs.push({ t, c });
      }
      if (runs.length) {
        runs[0].t = runs[0].t.replace(/^\s+/, '');
        runs[runs.length - 1].t = runs[runs.length - 1].t.replace(/\s+$/, '');
      }
      const clean = runs.filter((r) => r.t);
      const s = clean.map((r) => r.t).join('').trim();
      if (!s) return;
      paras.push(s);
      const paraC = b.classList.contains('hl') && b.classList.contains('para') ? _key(b) : null;
      if (paraC || clean.some((r) => r.c)) hasHl = true;
      rich.push({ p: paraC, r: clean.map((r) => (r.c ? r : { t: r.t })) });
    });
    text = paras.join('\n\n');
    if (hasHl) hl = rich;
    if (!text) text = (doc.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
  } catch (_) {}
  if (!text) { toast('这篇抽不出正文，换一篇试试'); return; }
  _setRetell({ title: rec.title || it.title || '', text, hl });
}

/* 主窗阅读页「复述」递来的条子：GET 一次即清（server /api/retell_pending）。
   输入屏渲染时查 + 录音看守每拍顺带查 + 窗口聚焦时查（主窗点按钮后本窗被 show/focus）。 */
let _retellPendInflight = false;
async function _checkRetellPending() {
  if (!window.REVIEW_ONLY || _retellPendInflight) return;
  _retellPendInflight = true;
  try {
    const resp = await fetch('/api/retell_pending?_=' + Date.now());
    const p = await resp.json();
    if (p && (p.title || p.text)) _setRetell(p);
  } catch (_) {}
  _retellPendInflight = false;
}
if (typeof window !== 'undefined') {
  window.addEventListener('focus', () => _checkRetellPending());
}

function _dualDurationLabel(sec) {
  sec = sec || 0;
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function _dualTimeLabel(iso) {
  try {
    const d = new Date(iso);
    return `${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch (_) { return iso || ''; }
}

/* ============ 待复盘对话列表屏（阶段10） ============ */
async function _showDualListScreen() {
  _setScreen('dualList', '待复盘对话');

  const body = $('#reviewBody');
  body.innerHTML = '<div class="dual-list" id="dualList"></div>';
  const listEl = $('#dualList');

  const pending = RS.dualtrackList.filter((it) => !it.done);
  if (!pending.length) {
    listEl.innerHTML = '<div class="empty" style="padding:28px 16px;text-align:center;color:var(--muted)">暂无待复盘的对话录音</div>';
    return;
  }

  pending.forEach((item) => {
    const row = el('div', 'dual-item');
    row.innerHTML = `
      <span class="dual-item-ic">${_RS_DUAL.dot}</span>
      <div class="dual-item-body">
        <div class="dual-item-time">${esc(_dualTimeLabel(item.startedAt))}</div>
        <div class="dual-item-dur">${esc(_dualDurationLabel(item.durationSec))}</div>
      </div>
      <span class="dual-item-chev">${_RS_DUAL.chevron}</span>`;
    row.onclick = () => _doProcessDualtrack(item.dir);
    listEl.appendChild(row);
  });
}

/* 复盘处理中整屏进度态：转写+AI 精批都在内，对用户统一叫「复盘」（过程细节不外露）。
   RS.view 置 'processing' —— _startRecWatch 据此停表，不会中途重绘输入屏毁掉本屏。 */
function _showDualProcessing() {
  RS.view = 'processing';
  const body = $('#reviewBody');
  body.innerHTML = `
    <div class="dual-processing">
      <span class="spin"></span>
      <div class="dual-processing-txt">复盘中…</div>
    </div>`;
}

/* 处理中走秒：每秒刷新「复盘中… m:ss」。返回 stop 函数（成功/失败后都要调）。 */
function _dualProgressWatch() {
  const t0 = Date.now();
  const paint = () => {
    const t = $('.dual-processing-txt');
    if (t) t.textContent = `复盘中… ${_dualDurationLabel((Date.now() - t0) / 1000)}`;
  };
  const timer = setInterval(paint, 1000);
  return () => clearInterval(timer);
}

async function _doProcessDualtrack(dir) {
  _showDualProcessing();
  const stopWatch = _dualProgressWatch();

  let res;
  try {
    res = await api('process_dualtrack', { dir });
  } catch (e) {
    stopWatch();
    toast('复盘失败：' + e.message);
    _showDualListScreen();
    return;
  }
  stopWatch();

  if (!res || !res.ok) {
    toast((res && res.error) || '复盘失败，请重试');
    _showDualListScreen();
    return;
  }

  if (res.warnings && res.warnings.length) {
    res.warnings.forEach((w) => toast(w));
  }

  RS.lastResult = { ...res, source: 'dual' };
  _showResultScreen(RS.lastResult);
}

/* 独立窗一条龙：转写选中/最新未复盘的录音（转写稿填进文本区）→ 直接复盘出结果。
   全程整屏进度态+走秒；失败恢复输入屏（chip 留在历史可重试），报错走 localapi 的精准文案。 */
async function _doReviewFromRecording() {
  const item = _effectiveDualItem();
  _showDualProcessing();
  const stopWatch = _dualProgressWatch();

  let res;
  try {
    res = await api('process_dualtrack', { dir: item.dir, retell: _retellArg() });
  } catch (e) {
    res = { ok: false, error: (e && e.message) || String(e) };
  }
  stopWatch();

  if (!res || !res.ok) {
    _showInputScreen(); // 恢复输入屏：草稿自动带回，chips 重新拉取
    toast((res && res.error) || '复盘失败，请重试', 5200);
    return;
  }

  // 转写稿落草稿：回到输入屏就能看到、可编辑；独白不加说话人前缀
  const dialog = Array.isArray(res.dialog) ? res.dialog : [];
  const allMe = dialog.every((t) => t.speaker === 'me');
  const transcriptText = dialog
    .map((t) => (allMe ? t.text : (t.speaker === 'me' ? '我: ' : '对方: ') + t.text))
    .join('\n');
  try { sessionStorage.setItem('rev_draft', transcriptText); } catch (_) {}

  if (res.warnings && res.warnings.length) {
    res.warnings.forEach((w) => toast(w));
  }

  item.done = true; // 服务端已落 done；本地同步标记，chips 立即呈「已复盘」态
  if (RS.selectedDualDir === item.dir) RS.selectedDualDir = null;
  _stashRetellChunks(res);
  if (RS.retell) { RS.retell = null; _saveRetell(); } // 复述已完成，题签卡功成身退
  RS.lastResult = { ...res, source: 'dual' };
  _showResultScreen(RS.lastResult);
}

/* 复盘注入用的复述参数（题签卡在场才有）：书名 + 原文开头（前 ~200 词）+ 目标表达 */
function _retellArg() {
  const r = RS.retell;
  if (!r) return null;
  return {
    title: r.title,
    head: (r.text || '').split(/\s+/).slice(0, 200).join(' '),
    chunks: (r.chunks || []).map((c) => ({ text: c.text })),
  };
}

/* 复盘出结果时把目标表达词条随结果带走（题签卡随后清空）——
   结果屏词块反馈区的「存为词块」要用它们的中文义/例句。 */
function _stashRetellChunks(res) {
  if (RS.retell && Array.isArray(RS.retell.chunks) && RS.retell.chunks.length) {
    res._retellChunks = RS.retell.chunks;
  }
}

/* 按当前是否有 pending 失败音频，绘制录音按钮态并绑对应 onclick */
function _paintRecBtn() {
  const btn = $('#revRec');
  if (!btn) return;
  if (RS._pendingWav) {
    btn.classList.add('retry');
    btn.innerHTML = _RS.mic + '<span id="revRecLab">重试转写</span>';
    btn.onclick = _retryPendingTranscribe;
  } else {
    btn.classList.remove('retry');
    btn.innerHTML = _RS.mic + '<span id="revRecLab">录音说一段</span>';
    btn.onclick = _toggleRecord;
  }
}

/* ============ 发起复盘 ============ */
async function _doReview() {
  // 独立窗 + 有可转写的录音（点选的 / 最新未复盘的）：一条龙就地转写并复盘，不进任何子屏。
  // 历史里全是已复盘条目且没点选 → 走下面的文本复盘路径（不会误重转旧录音）。
  if (window.REVIEW_ONLY && _effectiveDualItem()) {
    return _doReviewFromRecording();
  }
  const text = ($('#revText').value || '').trim();
  if (!text) { toast('请先输入英文内容'); return; }
  const ctxEl = $('#revCtx');
  const ctx  = ctxEl ? (ctxEl.value || '').trim() : '';

  const btn = $('#revSubmit');
  btn.disabled = true;
  btn.textContent = '复盘中…';

  let res;
  try {
    res = await api('review_speech', { text, context: ctx, source: 'paste', retell: _retellArg() });
  } catch (e) {
    btn.disabled = false; btn.textContent = '复盘';
    toast('请求失败：' + e.message);
    return;
  }

  btn.disabled = false; btn.textContent = '复盘';

  if (!res || !res.ok) {
    toast(res?.error || '复盘失败，请重试');
    return;
  }

  // 清草稿；复述完成则题签卡功成身退
  try { sessionStorage.removeItem('rev_draft'); } catch (_) {}
  _stashRetellChunks(res);
  if (RS.retell) { RS.retell = null; _saveRetell(); }

  RS.lastResult = { ...res, transcript: text };
  _showResultScreen(RS.lastResult);
}

/* ============ 录音器（阶段7；阶段8升级：边录边降采样 + 自动分段）============ */
// 分段阈值（秒）：正式档 10 分钟；验流程时可临时改成 30 验证后改回。
const _SEG_SECONDS = 600;
const _TOTAL_CAP_SECONDS = 3600; // 总上限 60 分钟

let _recState = null; // {ctx, stream, proc, src, sr, segInt16Chunks, segSampleCount, timer, secs, segSecs, segIdx}

async function _toggleRecord() {
  const btn = $('#revRec'), lab = $('#revRecLab');
  if (_recState) { await _stopRecord(); return; }
  // 开始新录音：清掉上一次失败保留的 pending 音频（不再可重试）
  if (RS._pendingWav) { RS._pendingWav = null; _paintRecBtn(); }
  let stream;
  try {
    // 桌面复盘窗（REVIEW_ONLY）绝不请求浏览器级语音处理：macOS 上 echoCancellation:true 会让 WebKit
    // 拉起系统级 VoiceProcessing(AUVoiceIO)，与微信等正在通话的软件抢占同一支麦克风的 AGC，害对方听
    // 我声音忽大忽小。桌面复盘主录音本就走原生双轨引擎（自带 AEC），这条单麦路在桌面几乎用不到；真用到
    // 也不需浏览器回声消除。手机版是独立设备、会放 AI 外放音，保留 echoCancellation/降噪。
    const _mic = window.REVIEW_ONLY
      ? { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      : { channelCount: 1, echoCancellation: true, noiseSuppression: true };
    stream = await navigator.mediaDevices.getUserMedia({ audio: _mic });
  } catch (e) { toast('需要麦克风权限：请在系统设置里允许四土使用麦克风'); return; }
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const src = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const sr = ctx.sampleRate;

  _recState = {
    ctx, stream, proc, src, sr,
    segInt16Chunks: [],   // 当前分段已降采样的 Int16Array 块（边录边转，不再攒 Float32 整段）
    segSampleCount: 0,    // 当前分段样本数（16k 采样率下）
    _resampleCarry: null, // 跨 onaudioprocess 回调的重采样余量（保证分段边界不失真）
    timer: null, secs: 0, segSecs: 0, segIdx: 1,
    segmenting: false,    // 分段转写进行中（不影响继续录音）
  };

  proc.onaudioprocess = (e) => {
    const float32 = e.inputBuffer.getChannelData(0);
    const int16 = _downsampleToInt16(float32, sr, 16000, _recState);
    if (int16 && int16.length) {
      _recState.segInt16Chunks.push(int16);
      _recState.segSampleCount += int16.length;
    }
  };
  src.connect(proc); proc.connect(ctx.destination);

  btn.classList.add('recording');
  const paint = () => {
    const m = Math.floor(_recState.secs / 60), s = String(_recState.secs % 60).padStart(2, '0');
    lab.innerHTML = `录音中 ${m}:${s} · 点击停止`;
    btn.innerHTML = _RS.stop + `<span id="revRecLab">${lab.innerHTML}</span>`;
  };
  paint();
  _recState.timer = setInterval(() => {
    _recState.secs++; _recState.segSecs++;
    paint();
    if (_recState.secs >= _TOTAL_CAP_SECONDS) { toast('已到 60 分钟上限'); _stopRecord(); return; }
    if (_recState.segSecs >= _SEG_SECONDS) { _flushSegment(_recState, false); }
  }, 1000);
}

/* 边录边降采样：Float32(inRate) → Int16(outRate)，用 _resampleCarry 保留跨回调的相位，避免分段处畸变 */
function _downsampleToInt16(float32, inRate, outRate, state) {
  if (outRate === inRate) {
    const out = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  }
  const ratio = inRate / outRate;
  // 把上次余量拼到本次数据前面，保证连续两次回调之间采样点不丢
  let src = float32;
  if (state._resampleCarry && state._resampleCarry.length) {
    const merged = new Float32Array(state._resampleCarry.length + float32.length);
    merged.set(state._resampleCarry, 0);
    merged.set(float32, state._resampleCarry.length);
    src = merged;
  }
  const outLen = Math.floor((src.length - 1) / ratio) + 1 > 0 ? Math.floor((src.length - 1) / ratio) : 0;
  const out = new Int16Array(Math.max(outLen, 0));
  let i = 0;
  for (; i < out.length; i++) {
    const idx = i * ratio, i0 = Math.floor(idx), i1 = Math.min(i0 + 1, src.length - 1);
    const frac = idx - i0;
    const v = src[i0] * (1 - frac) + src[i1] * frac;
    const s = Math.max(-1, Math.min(1, v));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  // 余量：最后一个输出采样点对应的输入下标之后的部分留到下次
  const lastUsedIdx = out.length > 0 ? Math.floor((out.length - 1) * ratio) : -1;
  state._resampleCarry = src.slice(Math.max(lastUsedIdx, 0));
  return out;
}

/* 满 N 分钟（或停止时）把当前分段编 WAV → 转写 → 追加进 textarea；不中断录音（isFinal=false 时）
   接收 st（录音状态快照）而非读全局 _recState：停止录音后 _recState 已置 null，
   最后一段转写仍需处理该状态对象，且转写期间用户可立即开始新录音而不被卡住。
   返回 {ok, appended, error}：
     ok=true, appended=true  → 转写成功且有文字追加
     ok=true, appended=false → 请求成功但没听清（空文本）
     ok=false, error=...     → 请求/转写失败（这段没录到声音时也算 !ok=false 的特殊态，见下方 no-audio 分支） */
async function _flushSegment(st, isFinal) {
  if (!st) return { ok: true, appended: false };
  const chunks = st.segInt16Chunks;
  st.segInt16Chunks = [];
  st.segSampleCount = 0;
  st.segSecs = 0;

  let total = 0; chunks.forEach((c) => total += c.length);
  if (!total) return { ok: true, appended: false }; // 这一段没录到声音，静默跳过

  const merged = new Int16Array(total);
  let off = 0;
  chunks.forEach((c) => { merged.set(c, off); off += c.length; });
  const wavB64 = _encodeInt16WavBase64(merged, 16000);

  const segIdx = st.segIdx++;
  st.segmenting = true;
  let res;
  try {
    res = await api('transcribe_audio', { audioBase64: wavB64, format: 'wav' });
  } catch (e) {
    st.segmenting = false;
    const error = e.message || '请求失败';
    if (isFinal) RS._pendingWav = { wavB64, segIdx };
    return { ok: false, appended: false, error };
  }
  st.segmenting = false;
  if (!res || !res.ok) {
    const error = res?.error || '请重试';
    if (isFinal) RS._pendingWav = { wavB64, segIdx };
    return { ok: false, appended: false, error };
  }
  const t = (res.text || '').trim();
  if (!t) return { ok: true, appended: false }; // 这段没听清，静默跳过（不打断录音）
  const ta = $('#revText');
  if (ta) {
    ta.value = ta.value.trim() ? (ta.value.trim() + ' ' + t) : t;
    try { ta.dispatchEvent(new Event('input')); } catch (_) {}
  }
  if (!isFinal) toast(`第 ${segIdx} 段已转写`);
  return { ok: true, appended: true };
}

async function _stopRecord() {
  if (!_recState) return;
  const st = _recState; _recState = null;
  clearInterval(st.timer);
  try { st.proc.disconnect(); st.src.disconnect(); } catch (_) {}
  try { st.stream.getTracks().forEach((t) => t.stop()); } catch (_) {}
  try { st.ctx.close(); } catch (_) {}
  const btn = $('#revRec');
  if (!btn) return;
  btn.classList.remove('recording');

  const hadAudio = st.segSampleCount > 0 || st.segIdx > 1;
  if (!hadAudio) { _resetRecBtn(); toast('没录到声音，请重试'); return; }

  btn.disabled = true; btn.innerHTML = _RS.mic + '<span id="revRecLab">转写中…</span>';
  const result = await _flushSegment(st, true);
  btn.disabled = false;

  if (!result.ok) {
    toast(`转写失败：${result.error}`);
    _paintRecBtn(); // pending 已在 _flushSegment 内设置，绘制「重试转写」态
  } else if (result.appended) {
    toast('已转写');
    _resetRecBtn();
  } else {
    toast('没听清，请靠近麦克风重录');
    _resetRecBtn();
  }
}

function _resetRecBtn() {
  const btn = $('#revRec'); if (!btn) return;
  btn.classList.remove('recording');
  _paintRecBtn();
}

/* 点击「重试转写」：不重录，直接用上次失败保留的 wavB64 重新调 transcribe_audio */
async function _retryPendingTranscribe() {
  const pending = RS._pendingWav;
  if (!pending) return;
  const btn = $('#revRec');
  if (btn) { btn.disabled = true; btn.innerHTML = _RS.mic + '<span id="revRecLab">转写中…</span>'; }

  let res;
  try {
    res = await api('transcribe_audio', { audioBase64: pending.wavB64, format: 'wav' });
  } catch (e) {
    if (btn) btn.disabled = false;
    toast(`转写失败：${e.message || '请求失败'}`);
    _paintRecBtn(); // 仍保留 pending，可再试
    return;
  }
  if (btn) btn.disabled = false;

  if (!res || !res.ok) {
    toast(`转写失败：${res?.error || '请重试'}`);
    _paintRecBtn(); // 再失败仍保留 pending
    return;
  }

  const t = (res.text || '').trim();
  RS._pendingWav = null; // 成功（含空文本）都清掉 pending
  if (!t) {
    toast('没听清，请靠近麦克风重录');
    _paintRecBtn();
    return;
  }
  const ta = $('#revText');
  if (ta) {
    ta.value = ta.value.trim() ? (ta.value.trim() + ' ' + t) : t;
    try { ta.dispatchEvent(new Event('input')); } catch (_) {}
  }
  toast('已转写');
  _paintRecBtn();
}

// Int16Array（已是目标采样率）→ WAV → base64（不含 data: 前缀）
function _encodeInt16WavBase64(data, outRate) {
  const buf = new ArrayBuffer(44 + data.length * 2);
  const view = new DataView(buf);
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); view.setUint32(4, 36 + data.length * 2, true); ws(8, 'WAVE');
  ws(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, outRate, true); view.setUint32(28, outRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  ws(36, 'data'); view.setUint32(40, data.length * 2, true);
  let o = 44;
  for (let i = 0; i < data.length; i++) { view.setInt16(o, data[i], true); o += 2; }
  // ArrayBuffer → base64（分块避免超大字符串栈溢出）
  const bytes = new Uint8Array(buf); let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(bin);
}
