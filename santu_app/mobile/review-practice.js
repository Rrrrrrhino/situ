/* 四土 · 口语复盘 —— 练习引擎（§3.2：⑤⑥＋⑨⑩ 合一套）：
   _showPracticeScreen({kind:'mistake'|'chunk'|'mixed', items}) —— targets 卡（kind 决定行渲染）
   ＋话题出题（仅 chunk）＋textarea＋录音短答（麦克风路）＋提交；
   提交按 kind 走 check_writing / check_chunk_drill（mixed 两个都调、合并展示），后端不动。 */
'use strict';

const _PRACTICE_TITLE = { mistake: '写作训练', chunk: '练词块', mixed: '混合练' };

function _showPracticeScreen(opts) {
  const kind = opts.kind, items = opts.items || [];
  RS.practice = { kind, items };
  RS.libSel = { selecting: false, mistakes: [], chunks: [] };
  _setScreen('practice', _PRACTICE_TITLE[kind] || '练习');

  const body = $('#reviewBody');
  body.innerHTML = '';

  const wrap = el('div', 'drill-screen');

  // 目标条目卡：错题行=原文→纠正；词块行=词块＋中文义
  const targets = el('div', 'drill-targets');
  items.forEach((it, i) => {
    const row = el('div', 'drill-target-item');
    if (it.kind === 'chunk') {
      row.innerHTML = `
        <span class="dt-num">${i + 1}</span>
        <span class="chunk-text">${esc(it.text)}</span>
        ${it.meaning ? `<span class="chunk-pick-meaning">${esc(it.meaning)}</span>` : ''}`;
    } else {
      row.innerHTML = `
        <span class="dt-num">${i + 1}</span>
        <span class="dt-orig">${esc(it.original)}</span>
        <span class="dt-arr">→</span>
        <span class="dt-corr">${esc(it.correction)}</span>`;
    }
    targets.appendChild(row);
  });
  wrap.appendChild(targets);

  // 「给我个话题」只在纯词块练显示（错题练不做出题——不加后端）
  let topicBox = null;
  if (kind === 'chunk') {
    const topicBtn = el('button', 'chunk-topic-btn', '给我个话题');
    wrap.appendChild(topicBtn);
    topicBox = el('div', 'chunk-topic-box hidden');
    wrap.appendChild(topicBox);
    topicBtn.onclick = async () => {
      topicBtn.disabled = true;
      topicBtn.textContent = '出题中…';
      let res;
      try {
        res = await api('suggest_chunk_topic', { ids: items.map((it) => it.id) });
      } catch (e) {
        topicBtn.disabled = false; topicBtn.textContent = '给我个话题';
        toast('出题失败：' + e.message); return;
      }
      topicBtn.disabled = false; topicBtn.textContent = '换一个话题';
      if (!res || !res.ok) { toast(res?.error || '出题失败'); return; }
      RS.practice.topic = res;
      topicBox.classList.remove('hidden');
      topicBox.innerHTML = `<div class="chunk-topic-zh">${esc(res.topic_zh)}</div><div class="chunk-topic-opener">${esc(res.opener_en)}</div>`;
    };
  }

  const promptTxt = kind === 'mistake'
    ? '用上面这几个表达，自然地写 3–5 句话（或一小段）：'
    : (kind === 'chunk'
      ? '说一段（或写一段）英文，尽量用上上面这些词块：'
      : '说一段（或写一段）英文，把上面的纠正和词块都用进去：');
  wrap.appendChild(el('div', 'drill-prompt', promptTxt));

  const ta = el('textarea', 'drill-textarea');
  ta.placeholder = '写在这里，或点下面的按钮录音…';
  ta.id = 'pracText';
  wrap.appendChild(ta);

  const recBtn = el('button', 'rev-rec-btn', _RS.mic + '<span id="pracRecLab">录音说一段</span>');
  recBtn.id = 'pracRecBtn';
  recBtn.type = 'button';
  wrap.appendChild(recBtn);

  const btn = el('button', 'drill-submit', '提交');
  btn.id = 'pracSubmit';
  wrap.appendChild(btn);

  body.appendChild(wrap);
  body.scrollTop = 0;

  btn.onclick = _doPracticeSubmit;
  _bindPracticeRecBtn(recBtn);
}

async function _doPracticeSubmit() {
  const text = ($('#pracText').value || '').trim();
  if (!text) { toast('请先说或写一段英文'); return; }

  const { items, topic } = RS.practice;
  const mItems = items.filter((it) => it.kind !== 'chunk');
  const cItems = items.filter((it) => it.kind === 'chunk');

  const btn = $('#pracSubmit');
  btn.disabled = true;
  btn.textContent = '批改中…';

  let writing = null, chunk = null;
  try {
    const tasks = [];
    if (mItems.length) tasks.push(api('check_writing', { itemIds: mItems.map((it) => it.id).filter(Boolean), text }).then((r) => { writing = r; }));
    if (cItems.length) tasks.push(api('check_chunk_drill', { ids: cItems.map((it) => it.id), text, topic: topic ? topic.topic_zh : '' }).then((r) => { chunk = r; }));
    await Promise.all(tasks);
  } catch (e) {
    btn.disabled = false; btn.textContent = '提交';
    toast('请求失败：' + e.message);
    return;
  }
  btn.disabled = false; btn.textContent = '提交';

  const bad = (writing && !writing.ok && writing.error) || (chunk && !chunk.ok && chunk.error);
  if ((mItems.length && (!writing || !writing.ok)) || (cItems.length && (!chunk || !chunk.ok))) {
    toast(bad || '批改失败，请重试');
    return;
  }

  RS.practiceResult = { writing, chunk, studentText: text, mItems, cItems };
  _showPracticeResultScreen(RS.practiceResult);
}

/* ============ 练习结果屏（批改 + 裁决 同一渲染器） ============ */
function _showPracticeResultScreen(pr) {
  _setScreen('practiceResult', '练习结果');
  const { writing, chunk, studentText, mItems = [], cItems = [] } = pr;

  const body = $('#reviewBody');
  body.innerHTML = '';
  const wrap = el('div', 'check-result-wrap');

  // meta 行
  const wordCount = (studentText || '').trim().split(/\s+/).filter(Boolean).length;
  const parts = [`${wordCount} 词`];
  if (writing) parts.push(`表达用对 ${ (writing.items || []).filter((it) => it.used && it.correct).length }/${(writing.items || []).length}`);
  if (chunk) parts.push(`词块用对 ${ (chunk.items || []).filter((it) => it.used && it.verdict === 'correct').length }/${(chunk.items || []).length}`);
  parts.push(esc((writing && writing.model) || (chunk && chunk.model) || 'AI'));
  wrap.appendChild(el('div', 'check-result-head', parts.join(' · ')));

  // ── 错题批改卡（原批改结果屏的渲染） ──
  (writing ? writing.items || [] : []).forEach((it, i) => {
    const card = el('div', 'chk-item');
    let statusCls = 'not-used';
    let statusIcon = '—';
    if (it.used && it.correct) { statusCls = 'used-correct'; statusIcon = '✓'; }
    else if (it.used && !it.correct) { statusCls = 'used-wrong'; statusIcon = '✗'; }

    // 对应条目：LLM 按顺序回显，直接按位置索引对应
    const drillItem = mItems[i];
    const mistakeId = drillItem ? drillItem.id : null;

    const headEl = el('div', 'chk-item-head');
    headEl.innerHTML = `
      <span class="chk-status ${statusCls}">${statusIcon}</span>
      <span class="chk-target">${esc(it.target)}</span>
      ${(it.used && it.correct && mistakeId) ? `<button class="chk-master-btn" data-mid="${esc(mistakeId)}">标掌握</button>` : ''}`;
    card.appendChild(headEl);

    const bodyEl = el('div', 'chk-item-body');
    if (it.quote) {
      const quoteEl = el('div', `chk-quote${!it.correct ? ' wrong' : ''}`);
      quoteEl.textContent = `"${it.quote}"`;
      bodyEl.appendChild(quoteEl);
    }
    const fbEl = el('div', 'chk-feedback');
    fbEl.textContent = it.feedback || '';
    bodyEl.appendChild(fbEl);
    card.appendChild(bodyEl);

    const masterBtn = headEl.querySelector('.chk-master-btn');
    if (masterBtn) {
      masterBtn.onclick = async (e) => {
        e.stopPropagation();
        try {
          await api('set_mistake_mastered', { id: masterBtn.dataset.mid, mastered: true });
          masterBtn.textContent = '✓ 已掌握';
          masterBtn.classList.add('done');
          masterBtn.disabled = true;
          toast('已标掌握');
        } catch (_) {
          toast('标掌握失败，请重试');
        }
      };
    }
    wrap.appendChild(card);
  });

  // ── 词块裁决卡（原裁决结果屏的渲染） ──
  (chunk ? chunk.items || [] : []).forEach((it) => {
    const card = el('div', `chunk-drill-card${it.justMastered ? ' just-mastered' : ''}`);
    let head;
    if (it.justMastered) {
      head = `<span class="chunk-verdict-pill mastered celebrate">🎉 已掌握</span>`;
    } else if (!it.used) {
      head = `<span class="chunk-verdict-pill notused">未用到</span>`;
    } else {
      head = _chunkVerdictPill(it.verdict, false);
    }
    card.innerHTML = `
      <div class="chunk-drill-head">
        <span class="chunk-text">${esc(it.chunk)}</span>
        ${head}
      </div>
      ${it.quote ? `<div class="chunk-quote">"${esc(it.quote)}"</div>` : ''}
      <div class="why">${esc(it.comment)}</div>
      ${(it.examples || []).length ? `<div class="chunk-examples"><div class="chunk-examples-label">例句</div><ul>${it.examples.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}
      ${_progressDots(it.progress)}`;
    wrap.appendChild(card);
  });

  // 词块裁决顺带发现的其他问题
  const extraErrors = (chunk && chunk.extraErrors) || [];
  if (extraErrors.length) {
    const sec = el('div', 'rev-section chunk-extra-errors');
    const head = el('div', 'rev-section-head error');
    head.innerHTML = `<span>✗ 其他问题</span><span class="cnt">${extraErrors.length} 条</span>`;
    sec.appendChild(head);
    extraErrors.forEach((e) => {
      const card = el('div', 'rev-card');
      card.innerHTML = `
        <span class="orig">${esc(e.original)}</span>
        <span class="arrow">→</span>
        <span class="correction">${esc(e.correction)}</span>
        <div class="why">${esc(e.why)}</div>`;
      sec.appendChild(card);
    });
    wrap.appendChild(sec);
  }

  // 总评（两路都有就各一段，题眉小字＋正文）
  const overalls = [writing && writing.overall, chunk && chunk.overall].filter(Boolean);
  if (overalls.length) {
    const ov = el('div', 'chk-overall');
    ov.innerHTML = `<div class="chk-overall-label">总评</div>` +
      overalls.map((o) => `<div class="chk-overall-text">${esc(o)}</div>`).join('');
    wrap.appendChild(ov);
  }

  body.appendChild(wrap);

  const bar = el('div', 'chk-bottom-bar');
  bar.innerHTML = `
    <button class="chk-btn-again" id="pracAgain">再练一次</button>
    <button class="chk-btn-back" id="pracBack">回积累</button>`;
  body.appendChild(bar);

  body.scrollTop = 0;

  $('#pracAgain').onclick = () => _showPracticeScreen(RS.practice);
  $('#pracBack').onclick = () => _showLibraryScreen();
}

/* ============ 旧入口名兼容（结果屏「练这几条」等处还在调） ============ */
function _showDrillScreen(items) {
  _showPracticeScreen({ kind: 'mistake', items: items.map((it) => ({ kind: 'mistake', ...it })) });
}
function _showChunkPickScreen(items) {
  _showPracticeScreen({ kind: 'chunk', items: items.map((it) => ({ kind: 'chunk', ...it })) });
}

/* ============ 练习屏录音（单麦路，通用化自原 _bindChunkRecBtn） ============ */
function _bindPracticeRecBtn(btn) {
  btn.onclick = async () => {
    if (_recState) { await _stopPracticeRecord(); return; }
    let stream;
    try {
      // 桌面复盘窗（REVIEW_ONLY）绝不请求浏览器级语音处理：macOS 上 echoCancellation:true 会让 WebKit
      // 拉起系统级 VoiceProcessing(AUVoiceIO)，与微信/腾讯会议等正在通话的软件抢占同一支麦克风的 AGC，
      // 害对方听到我声音忽大忽小。桌面练习作答是干说一句、不放音，无需回声消除。手机版是独立设备、
      // 会放 AI 外放音，保留 echoCancellation/降噪。
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
      segInt16Chunks: [], segSampleCount: 0, _resampleCarry: null,
      timer: null, secs: 0, segSecs: 0, segIdx: 1, segmenting: false,
      _targetTextareaId: 'pracText',
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
      btn.innerHTML = _RS.stop + `<span id="pracRecLab">录音中 ${m}:${s} · 点击停止</span>`;
    };
    paint();
    _recState.timer = setInterval(() => {
      _recState.secs++; _recState.segSecs++;
      paint();
      if (_recState.secs >= _TOTAL_CAP_SECONDS) { toast('已到 60 分钟上限'); _stopPracticeRecord(); return; }
      if (_recState.segSecs >= _SEG_SECONDS) { _flushSegment(_recState, false); }
    }, 1000);
  };
}

async function _stopPracticeRecord() {
  if (!_recState) return;
  const st = _recState; _recState = null;
  clearInterval(st.timer);
  try { st.proc.disconnect(); st.src.disconnect(); } catch (_) {}
  try { st.stream.getTracks().forEach((t) => t.stop()); } catch (_) {}
  try { st.ctx.close(); } catch (_) {}
  const btn = $('#pracRecBtn');
  if (!btn) return;
  btn.classList.remove('recording');

  const hadAudio = st.segSampleCount > 0 || st.segIdx > 1;
  if (!hadAudio) { btn.innerHTML = _RS.mic + '<span id="pracRecLab">录音说一段</span>'; toast('没录到声音，请重试'); return; }

  btn.disabled = true; btn.innerHTML = _RS.mic + '<span id="pracRecLab">转写中…</span>';
  const result = await _flushSegmentToTextarea(st, 'pracText');
  btn.disabled = false;
  btn.innerHTML = _RS.mic + '<span id="pracRecLab">录音说一段</span>';

  if (!result.ok) toast(`转写失败：${result.error}`);
  else if (result.appended) toast('已转写');
  else toast('没听清，请靠近麦克风重录');
}

/* 同 _flushSegment，但追加目标是指定 textarea（而非固定的 #revText） */
async function _flushSegmentToTextarea(st, textareaId) {
  const chunks = st.segInt16Chunks;
  st.segInt16Chunks = [];
  st.segSampleCount = 0;
  st.segSecs = 0;

  let total = 0; chunks.forEach((c) => total += c.length);
  if (!total) return { ok: true, appended: false };

  const merged = new Int16Array(total);
  let off = 0;
  chunks.forEach((c) => { merged.set(c, off); off += c.length; });
  const wavB64 = _encodeInt16WavBase64(merged, 16000);

  let res;
  try {
    res = await api('transcribe_audio', { audioBase64: wavB64, format: 'wav' });
  } catch (e) {
    return { ok: false, appended: false, error: e.message || '请求失败' };
  }
  if (!res || !res.ok) return { ok: false, appended: false, error: res?.error || '请重试' };
  const t = (res.text || '').trim();
  if (!t) return { ok: true, appended: false };
  const ta = document.getElementById(textareaId);
  if (ta) {
    ta.value = ta.value.trim() ? (ta.value.trim() + ' ' + t) : t;
    try { ta.dispatchEvent(new Event('input')); } catch (_) {}
  }
  return { ok: true, appended: true };
}
