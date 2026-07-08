/* 四土 · 手机版 读物精选（阶段5）
   复用 app.js 的全局 helper：el esc api toast addSource closeDrawer
   setTopTitle hideBookChrome timeAgo errBox
   两级视图：来源列表 → 文章列表（→ addSource 进入阅读） */
'use strict';

/* ============ 媒体来源注册表（已全部验证可用） ============ */
const OUTLETS = [
  { id: 'cna',  name: 'CNA',  desc: 'Channel NewsAsia · 亚洲视角英文新闻',
    feeds: [ { name: '最新', url: 'https://www.channelnewsasia.com/rssfeeds/8395986' } ] },
  { id: 'tc',   name: 'The Conversation', desc: '学者撰稿 · 深度解读',
    feeds: [ { name: '全球', url: 'https://theconversation.com/global/articles.atom' },
             { name: '美国', url: 'https://theconversation.com/us/articles.atom' },
             { name: '英国', url: 'https://theconversation.com/uk/articles.atom' } ] },
];

/* ============ 模块状态 ============ */
const DS = {
  outlet: null,    // 当前选中的 OUTLETS 条目
  feedIdx: 0,      // 当前选中的 feed 下标
};

/* ============ 入口 ============ */
window.renderDiscover = async function renderDiscover() {
  setTopTitle('读物精选');
  hideBookChrome();
  _showOutletList();
};

/* ============ 第一级：来源列表 ============ */
function _showOutletList() {
  const app = document.querySelector('#app');
  app.className = 'view pad';
  app.innerHTML = '';

  app.appendChild(el('div', 'sec-h', '选择来源'));

  OUTLETS.forEach(outlet => {
    const card = el('div', 'disc-outlet-card');
    card.innerHTML =
      `<div class="disc-outlet-body">` +
        `<div class="disc-outlet-name">${esc(outlet.name)}</div>` +
        `<div class="disc-outlet-desc">${esc(outlet.desc)}</div>` +
      `</div>` +
      `<div class="disc-outlet-arrow">›</div>`;
    card.onclick = () => {
      DS.outlet = outlet;
      DS.feedIdx = 0;
      _showArticleList();
    };
    app.appendChild(card);
  });
}

/* ============ 第二级：文章列表 ============ */
async function _showArticleList() {
  const outlet = DS.outlet;
  if (!outlet) { _showOutletList(); return; }

  const app = document.querySelector('#app');
  app.className = 'view pad';
  app.innerHTML = '';

  /* 顶部返回行 */
  const header = el('div', 'disc-list-header');
  const backBtn = el('button', 'disc-back-btn');
  backBtn.innerHTML = '‹ 读物精选';
  backBtn.onclick = () => _showOutletList();
  const outletLabel = el('span', 'disc-outlet-label', esc(outlet.name));
  header.appendChild(backBtn);
  header.appendChild(outletLabel);
  app.appendChild(header);

  /* Feed 切换胶囊（多 feed 才显示） */
  let capsuleRow = null;
  if (outlet.feeds.length > 1) {
    capsuleRow = el('div', 'disc-feed-caps');
    outlet.feeds.forEach((feed, idx) => {
      const cap = el('button', 'disc-cap' + (idx === DS.feedIdx ? ' active' : ''), esc(feed.name));
      cap.onclick = () => {
        if (DS.feedIdx === idx) return;
        DS.feedIdx = idx;
        _loadFeed(outlet, app, capsuleRow);
      };
      capsuleRow.appendChild(cap);
    });
    app.appendChild(capsuleRow);
  }

  /* 文章列表容器 */
  const listWrap = el('div', 'disc-list-wrap');
  app.appendChild(listWrap);

  await _loadFeed(outlet, app, capsuleRow, listWrap);
}

/* ============ 加载某个 feed ============ */
async function _loadFeed(outlet, app, capsuleRow, listWrapArg) {
  /* 如果 capsuleRow 已存在，同步选中态 */
  if (capsuleRow) {
    const caps = capsuleRow.querySelectorAll('.disc-cap, [class*="disc-cap"]');
    caps.forEach((c, i) => c.classList.toggle('active', i === DS.feedIdx));
  }

  /* 找或创建 list 容器 */
  let listWrap = listWrapArg || app.querySelector('.disc-list-wrap');
  if (!listWrap) {
    listWrap = el('div', 'disc-list-wrap');
    app.appendChild(listWrap);
  }

  const feed = outlet.feeds[DS.feedIdx];
  if (!feed) return;

  listWrap.innerHTML = '<div class="loading-line"><span class="spin"></span>载入中…</div>';

  let res;
  try {
    res = await api('fetch_feed', { url: feed.url });
  } catch (e) {
    _showFeedError(listWrap, '请求失败：' + e.message, outlet);
    return;
  }

  if (!res || res.error) {
    _showFeedError(listWrap, res ? res.error : '未知错误', outlet);
    return;
  }

  if (!res.items || !res.items.length) {
    _showFeedError(listWrap, '暂无文章，稍后再试', outlet);
    return;
  }

  listWrap.innerHTML = '';

  res.items.forEach(item => {
    const row = el('div', 'disc-article-row');

    /* 标题（两行截断） */
    const titleEl = el('div', 'disc-article-title', esc(item.title || '（无标题）'));
    row.appendChild(titleEl);

    /* 日期小字 */
    if (item.date) {
      let dateTxt = item.date;
      try {
        const ts = Date.parse(item.date);
        if (!isNaN(ts)) {
          const diffSec = (Date.now() - ts) / 1000;
          // timeAgo 接受秒级 unix 时间戳
          dateTxt = diffSec > 0 && diffSec < 86400 * 365
            ? timeAgo(Math.floor(ts / 1000))
            : new Date(ts).toLocaleDateString('zh-CN');
        }
      } catch (_) { /* 解析失败就用原始字符串 */ }
      row.appendChild(el('div', 'disc-article-date', esc(dateTxt)));
    }

    /* summary 灰字（可选） */
    if (item.summary) {
      row.appendChild(el('div', 'disc-article-summary', esc(item.summary)));
    }

    row.onclick = () => {
      if (item.link) addSource(item.link);
      else toast('该文章缺少链接');
    };

    listWrap.appendChild(row);
  });
}

/* ============ 错误态 ============ */
function _showFeedError(container, msg, outlet) {
  container.innerHTML = '';
  container.appendChild(el('div', 'disc-err-msg', esc(msg || '加载失败')));
  const retryBtn = el('button', 'btn ghost block', '重试');
  retryBtn.style.marginTop = '12px';
  retryBtn.onclick = () => _loadFeed(outlet, container.closest('#app') || document.querySelector('#app'), null, container);
  container.appendChild(retryBtn);
}
