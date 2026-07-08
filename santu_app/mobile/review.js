/* 四土 · 口语复盘 —— 壳（状态 + 头部声明制 + 返回逻辑 + 共用小件）
   同目录平级脚本按序引入：
   review.js → review-input.js → review-result.js → review-library.js → review-practice.js
   全部走全局函数互相调用（无模块系统），与 app.js 的全局 helper（$ el esc api toast …）同一约定。 */
'use strict';

/* ============ 本地 SVG 常量（阶段6） ============ */
const _RS = {
  starFill:`<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 3.6l2.55 5.17 5.7.83-4.13 4.02.98 5.68L12 16.99l-5.1 2.31.98-5.68L3.75 9.6l5.7-.83z"/></svg>`,
  starLine:`<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M12 3.6l2.55 5.17 5.7.83-4.13 4.02.98 5.68L12 16.99l-5.1 2.31.98-5.68L3.75 9.6l5.7-.83z"/></svg>`,
  trash:`<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"><path d="M5 7h14M10 7V5.6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V7M17.4 7l-.8 12a1 1 0 0 1-1 .95H8.4a1 1 0 0 1-1-.95L6.6 7"/><path d="M10 11v5.4M14 11v5.4"/></svg>`,
  mic:`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0"/><path d="M12 17v3.6M8.5 20.6h7"/></svg>`,
  stop:`<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="6" width="12" height="12" rx="2.5"/></svg>`,
};

/* ============ 复盘状态 ============ */
const RS = {
  view: 'input',      // 'input' | 'result' | 'history' | 'library' | 'practice' | 'practiceResult' | 'dualList' | 'retellPick' | 'processing'
  lastResult: null,   // 最近一次 review_speech 返回值
  dualtrackList: [],  // list_dualtrack 缓存（阶段10）
  historyState: {
    q: '',              // 搜索关键词
  },
  _pendingWav: null,  // 转写失败时保留的最近一段音频 {wavB64, segIdx}，供「重试转写」按原音频重新调用

  /* ============ 积累（错题 + 词块 合体屏） ============ */
  libState: { tab: 'mistakes' },   // 当前 tab：'mistakes' | 'chunks'
  libReturn: 'input',              // 积累屏返回去处：'input' | 'result'
  mistakesState: {
    view: 'unmastered',   // all | unmastered | mastered | star
    type: '',             // '' | grammar | wordchoice | collocation | naturalness
    q: '',
  },
  chunksState: {
    view: 'unmastered',   // unmastered | star | mastered | all
    q: '',
  },
  libSel: { selecting: false, mistakes: [], chunks: [] },  // 跨 tab 多选（混合练）

  /* ============ 练习引擎（错题/词块/混合 一套） ============ */
  practice: null,        // {kind:'mistake'|'chunk'|'mixed', items:[{kind,...}], topic}
  practiceResult: null,  // 最近一次练习批改结果 {writing, chunk}

  /* ============ 复述练习（阅读联动，2026-07-07） ============ */
  retell: null,         // {title, text, chunks:[{text,meaning}], loading} | null
};

// 复述状态跨刷新恢复（与草稿同级：sessionStorage）
try {
  const _rt = sessionStorage.getItem('rev_retell');
  if (_rt) RS.retell = JSON.parse(_rt);
} catch (_) {}

/* ============ 入口 ============ */
function renderReview() {
  openOverlay('ovReview');
  _bindReviewHead();
  _showInputScreen();
}

/* ============ 头部「屏声明制」 ============
   每个 _show*Screen 渲染时调一次 _setScreen 声明自己（view/标题/是否根屏），
   头部按钮常驻不再忽隐忽现——积累 + ⚙ 永远在（⚙ 仅独立窗）。 */
function _setScreen(view, title, opts = {}) {
  RS.view = view;
  $('#reviewTitle').textContent = title;
  // 返回键：独立窗根屏藏（无处可退），子屏显；手机版永远显（根屏返回=关浮层）
  if (window.REVIEW_ONLY) $('#reviewBack').classList.toggle('hidden', !!opts.root);
}

/* ============ 顶部按钮绑定（只绑一次） ============ */
let _headBound = false;
function _bindReviewHead() {
  if (_headBound) return;
  _headBound = true;
  $('#reviewBack').onclick = _onBack;
  $('#reviewLibraryBtn').onclick = () => { if (RS.view !== 'library') _showLibraryScreen(); };
  // 桌面「口语复盘」独立窗（#review 直达）：复盘就是整扇窗的全部——
  // 头部补一个 ⚙ 设置入口（火山/LLM 配置住在本 WebView 的 IndexedDB，
  // 不给入口用户就没处填 appid）；手机版不出现（家里有设置）。
  if (window.REVIEW_ONLY) {
    const btns = document.querySelector('#reviewHead .rev-head-btns');
    // 夜/昼切换（夜间版式令牌在 app.js 顶部初始化，这里只负责手动切换与记忆）
    if (btns && !document.querySelector('#reviewNightBtn')) {
      const n = document.createElement('button');
      n.className = 'icon-btn'; n.id = 'reviewNightBtn';
      const moon = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/></svg>';
      const sun = '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.2 5.2l1.7 1.7M17.1 17.1l1.7 1.7M18.8 5.2l-1.7 1.7M6.9 17.1l-1.7 1.7"/></svg>';
      const paint = () => {
        const on = document.documentElement.dataset.night === '1';
        n.innerHTML = on ? sun : moon;
        n.title = on ? '切回日间' : '夜间版式';
      };
      paint();
      n.onclick = () => {
        const on = document.documentElement.dataset.night === '1';
        if (on) delete document.documentElement.dataset.night;
        else document.documentElement.dataset.night = '1';
        try { localStorage.setItem('situ_night', on ? '0' : '1'); } catch (_) {}
        paint();
      };
      btns.appendChild(n);
    }
    if (btns && !document.querySelector('#reviewSettingsBtn')) {
      const b = document.createElement('button');
      b.className = 'icon-btn'; b.id = 'reviewSettingsBtn'; b.title = '设置';
      b.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 13.5a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V20a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H4a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.09a1.7 1.7 0 0 0 1.03-1.56V4a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09a1.7 1.7 0 0 0 1.56 1.03H20a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1.03z"/></svg>';
      b.onclick = () => { if (window.renderSettings) renderSettings(); };
      btns.appendChild(b);
    }
  }
}

function _onBack() {
  if (RS.view === 'result') {
    _showInputScreen();
  } else if (RS.view === 'history') {
    _showInputScreen();
  } else if (RS.view === 'library') {
    // 多选态先退出多选
    if (RS.libSel.selecting) {
      _libExitSelect();
      return;
    }
    if (RS.libReturn === 'result' && RS.lastResult) _showResultScreen(RS.lastResult);
    else _showInputScreen();
  } else if (RS.view === 'practice') {
    _showLibraryScreen();
  } else if (RS.view === 'practiceResult') {
    if (RS.practice) _showPracticeScreen(RS.practice);
    else _showLibraryScreen();
  } else if (RS.view === 'dualList') {
    _showInputScreen();
  } else if (RS.view === 'retellPick') {
    _showInputScreen();
  } else {
    // 桌面独立窗：复盘输入屏已是根——身后没有 home（从没渲染过，退出去只会是
    // 一张空壳，用户曾困在那里）。独立窗里这一击不做事；关窗走红绿灯。
    if (window.REVIEW_ONLY) return;
    closeOverlay('ovReview');
  }
}

/* ============ 词块反馈区块（阶段9） ============ */
/* 复盘结果屏用：chunkFeedback 非空时插在「重点区」之后。卡片样式同裁决结果屏（verdict 胶囊 + 进度点/justMastered）。 */
const _CHUNK_VERDICT_LABEL = { correct: '完全正确', unnatural: '不够自然', collocation: '搭配错', grammar: '语法错', context: '语境不合' };
const _CHUNK_VERDICT_CLS   = { correct: 'good', unnatural: 'gold', collocation: 'error', grammar: 'error', context: 'error' };

function _chunkVerdictPill(verdict, justMastered) {
  if (justMastered) return `<span class="chunk-verdict-pill mastered">🎉 已掌握</span>`;
  const cls = _CHUNK_VERDICT_CLS[verdict] || 'error';
  const label = _CHUNK_VERDICT_LABEL[verdict] || verdict;
  return `<span class="chunk-verdict-pill ${cls}">${esc(label)}</span>`;
}

function _progressDots(progress) {
  if (!progress) return '';
  const need = progress.need || 3;
  const correct = Math.min(progress.correct || 0, need);
  let dots = '';
  for (let i = 0; i < need; i++) dots += i < correct ? '●' : '○';
  return `<span class="chunk-progress-dots">${dots} ${correct}/${need}</span>`;
}

/* ============ 辅助：setActive（复用 vocab.js 风格） ============ */
function setActive(buttons, active) {
  buttons.forEach((b) => b.classList.toggle('active', b === active));
}

/* ============ 暴露给 app.js ============ */
window.renderReview = renderReview;
