# Spec · 四土 前端：书模式（目录导航 + 翻页阅读）

> 项目根 `~/Documents/situ/`，只改 `santu_app/index.html`（必要时加 `specs/_harness/`）。
> 后端已就绪：`process()` 对 epub 返回 `{mode:"book", toc:[{idx,title}], chapter_idx, chapter_count, article_html, ...}`；非 epub 返回 `{mode:"article", ...}`。还有 `get_toc()`、`load_chapter({idx})`（返回 `{chapter_idx, article_html, vocab_list, total_tokens, vocab_count, vocab_order_count}`，**后端已在 load_chapter 内自动起预热**）。
> 配色铁律：**沿用三土现有调色板**（纸张底 `--bg`、暖强调 `--accent`、`--border`、`data-theme` 那套），不要引入新主色。书模式新 UI 必须看起来像三土原生的一部分。

## 目标
导入 EPUB（`process` 返回 `mode:"book"`）时进入「书模式」：左侧可拉出**目录**、顶部有**章节导航 + 进度**、正文用**翻页**（非滚动）。文章模式（`mode:"article"` 或无 mode）**行为一字不变**。

## 范围铁律
- 只动 `index.html`，且新增为主。文章模式的 `renderArticle` 流程不破坏（点词、划词、朗读、生词本、追问、书签、导出全部照旧）。
- 不碰持久化（`doSave`/`load_archive` 的书模式支持是下一批）；本批书模式可以先不存进度（刷新回到第 0 章可接受），但**不要报错**。

---

## A. 分流
`run(source)` 里现在是 `renderArticle(r)`。改成：
```js
if (r.mode === 'book') renderBook(r);
else renderArticle(r);
```
其余不变。

## B. `renderBook(r)` — 书模式骨架
- 记录书态：`bookMode=true; bookToc=r.toc; bookIdx=r.chapter_idx; bookCount=r.chapter_count; bookTitle=r.title;`（文章模式把 `bookMode=false`）。
- 渲染**书模式外壳**到 `#reading`：一个纵向 flex：
  1. **顶部章节条 `.book-bar`**（书模式专属）：左 `☰ 目录` 按钮；中间章节标题 + `第 {idx+1} 章 / 共 {count} 章`；右 `上一章` / `下一章` 按钮（首/末章对应禁用）。样式走 `--accent`/`--border`，纸张感，slim。
  2. **翻页视口 `.pager-viewport`**（占满剩余高度）：内含 `.pager-track`（见 C）。
  3. **底部翻页条 `.pager-bar`**：`◂` 按钮、`{page} / {pages}` 页码、`▸` 按钮。
- 然后调 `renderChapterContent(r)`（把首章内容塞进 pager 并分页）。
- 复用文章模式已有的收尾：`exportBtn/bookmarkBtn/readBtn` 显隐、`refreshNbCount()`、`switchTab('ex')`、面板提示文案。**预热**：后端 load_chapter 已自动起；前端只需复用现有的「预热状态轮询」（看 `maybePregen` 里轮询那段），**不要重复调 `start_pregen`**——若 `maybePregen` 内部会调 start_pregen，则书模式改为只轮询 `get_pregen_status`。

## C. 章节内容渲染 + 翻页（核心）
`renderChapterContent(r)`：把 `r.article_html`（含标题）放进 `.pager-track`，结构与文章模式一致以复用点词/划词：
```html
<div class="pager-track" id="pagerTrack">
  <div class="reading-inner">
    <h1 class="doc-title">…wrapTitleWords(chapterTitle)…</h1>
    ${r.article_html}
  </div>
</div>
```
注意：书模式不要再显示 `doc-meta`（源/词数）那行，章标题足够。`wrapTitleWords` 复用现成。

**翻页用 CSS 多列（浏览器原生分页）**：
- `.pager-viewport{ overflow:hidden; }`（固定高度=剩余空间）。
- `.pager-track{ height:100%; column-width: <视口内容宽>; column-gap: <gap>; column-fill:auto; transform: translateX(...); transition: transform .28s ease; }`
  - 实操更稳的做法：给 `.reading-inner` 设 `height:100%; column-width:<pageW>; column-gap:<gap>`，每「页」宽 = 视口可视宽。用 `transform: translateX(-page * (pageW+gap))` 翻页。
- **页数** = `Math.round(track.scrollWidth / (pageW+gap))` 或用 `Math.ceil`。窗口 resize / 字号变化要**重算页数并夹紧当前页**。
- **不破坏 DOM**：`.sent`/`.vocab`/`.w` 原样在 column 流里，点词、划词、朗读高亮全部照常（CSS columns 不改 DOM，只改布局）。

**翻页控制**：
- 底部 `◂`/`▸` 按钮；键盘 `←`/`→`（仅书模式且焦点不在输入框时）。
- 到本章最后一页再 `▸` → 自动 `下一章`（载入后落在第 0 页）；第一页再 `◂` → 上一章最后一页（best-effort，先实现「到下一章」，上一章回到第0页即可，别过度）。
- 翻页时更新底部 `{page}/{pages}`。

## D. 目录抽屉 `.toc-drawer`
- 从**左侧滑入**的抽屉 + 半透明遮罩 `.toc-overlay`。`☰ 目录` 打开，点遮罩/Esc/选中后关闭。
- 列出 `bookToc`：每项 `第 N 章 · {title}`，**当前章高亮**（`--accent-soft` 底 + `--accent` 字）。
- 点击项 → `await api().load_chapter({idx})` → 用返回值调 `renderChapterContent` + 更新章节条/页码 + 关抽屉 + 回第 0 页。

## E. 换章函数 `gotoChapter(idx)`
```js
async function gotoChapter(idx){
  if(idx<0||idx>=bookCount) return;
  setBusy(true);
  const r = await api().load_chapter({idx});
  if(r.error){ setStatus('❌ '+r.error, true); setBusy(false); return; }
  bookIdx = r.chapter_idx;
  renderChapterContent(r);           // 重排 + 回第0页
  updateBookBar();                   // 章标题/进度/上下章禁用态
  switchTab('ex'); refreshNbCount();
  // 复用预热状态轮询（后端已自动起预热）
  setBusy(false);
}
```
`上一章/下一章` 按钮、键盘翻页越界都走它。

## F. 不要破坏的既有交互（自测必过）
- 文章模式（贴 URL / 拖 txt）：渲染、点词讲解、划词、朗读、生词本、追问、书签、导出、书架——**全部和改动前一致**。
- 书模式：点词出讲解（讲解面板照常）、划词高亮、`jumpToContext`（生词本点「原语境」跳回）——在翻页布局下**至少能跳到正确的页**（用 `el.offsetLeft` 算页：`page=Math.floor(el.offsetLeft/(pageW+gap))` 再翻过去）。跨章跳回可 best-effort，先保证本章内准确。

---

## G. 验收 harness（给主会话截图用，必做）
主会话要看真实排版但 pywebview 无 web server。请生成 `specs/_harness/`：
1. 用后端 dump 一份真实数据：跑 `process()` 拿一本书的 `{mode,toc,chapter_count,title,...,article_html}`，再 `load_chapter({idx:1})`、`{idx:2}` 各拿一份，存成 `specs/_harness/canned.js`（`window.__CANNED__ = {process:{...}, chapters:{0:{...},1:{...},2:{...}}}`）。用 `~/Downloads` 里那本真实 epub。
2. `specs/_harness/index.html` = 复制真实 `santu_app/index.html`，并在**主 `<script>` 之前**插一段 stub：
   ```html
   <script src="canned.js"></script>
   <script>
   window.pywebview = { api: {
     process: async()=>window.__CANNED__.process,
     load_chapter: async({idx})=>window.__CANNED__.chapters[idx] || window.__CANNED__.chapters[0],
     get_toc: async()=>window.__CANNED__.process.toc,
     get_pregen_status: async()=>({done:0,total:0,running:false}),
     explain_word: async(a)=>({ok:true, word:a.word, lemma:a.lemma, phonetic:'/.../', pos:'n.', literal:'（harness 假数据）', contextual:'', explanation:'这是 harness 占位讲解，仅供排版验收。'}),
     get_audio: async()=>({error:'harness'}), get_notebook: async()=>[], save_session: async()=>({}), get_settings: async()=>({}), get_config: async()=>({}),
   }};
   // 自动触发一次书模式渲染，方便截图
   window.addEventListener('load', ()=>{ setTimeout(()=>{ try{ run('harness.epub'); }catch(e){console.warn(e);} }, 60); });
   </script>
   ```
   （`run('harness.epub')` 会走 `process` stub → mode:book → renderBook，正好展示书模式。）
3. 自检：`cd specs/_harness && python3 -m http.server 0` 起服务，确认能渲染出书模式（章节条 + 翻页视口 + 目录可拉出）。把端口/URL 写进汇报，主会话会用 preview 工具截图过眼。

---

## 验证（贴证据）
1. harness 能起、能渲染书模式（贴 server URL）。
2. 翻页：`▸`/`▸`、`←/→`、页码递增；最后一页 `▸` 进下一章。
3. 目录：拉出、当前章高亮、点击切章。
4. 文章模式回归：在 harness 里把 `process` stub 临时换成 `{mode:'article',...}` 或直接说明文章流未受影响的理由（哪些代码路径没碰）。
5. 翻页布局下点词出讲解面板（harness 假讲解即可）。

完成后在本 spec 末尾写一句话进度，汇报贴：改了哪些函数/新增哪些、harness URL、上面验证的实际表现。视觉细节（间距/页宽/章节条样式）主会话会截图后再给调整意见，先实现到「结构对、能用、配色沿用三土」即可。
