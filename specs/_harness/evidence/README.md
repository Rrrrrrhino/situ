# 验收截图说明

本批（书签系统第一批）的关键状态截图是在施工会话内通过 `mcp__Claude_Preview__preview_screenshot`
对 `specs/_harness/index.html`（真实 `santu_app/index.html` + `canned-bookmarks.js` stub api）
逐步截取、直接嵌入施工会话记录的，工具未提供落盘文件路径，故本目录未存二进制截图文件。

复现方式（任何时候都可重新截出同样的图）：

1. `.claude/launch.json` 里的 `situ-harness`（或等效 `python3 -m http.server 18731`，cwd 设为
   `specs/_harness/`）起服务。
2. 浏览器打开 `http://127.0.0.1:18731/`。
3. 打开控制台执行 `run('/fake/book.epub')` 进入书模式（或 `run('harness-article')` 进入文章模式）。
4. 依验收清单逐步点击 / 悬停即可复现以下四个关键状态：
   - 书模式：点空白放置 → 黛蓝墨线 + 右端「📑 M月D日」纸签（贴在两段之间，零回流）。
   - 悬停书签线/纸签 → 线变深 + 纸签文案变「✕ 移除」（红棕色）。
   - 抽屉切到「书签」tab → 两列缩略图网格，每格含离线渲染的正文快照 + 淡蓝细线 + 「第 N 章 · 日期」说明。
   - 点跨章节的书签格 → 自动换章 + 翻到锚点所在页（线短暂微光动画一次，正常前台浏览器下可见；
     rAF 在部分无头预览环境不触发，详见验收报告「已知风险」一节）。
   - 文章模式：空白单击同样出 A 样式线+纸签；点线删除+撤销 toast；`bookmarkBtn` 下拉仍可跳转/删除。

## 微调批（书签体验+缓存+启动+目录切章，2026-07-03）

`extractor-baseline-before.txt` / `extractor-baseline-after.txt` / `extractor-diff.txt`：
`extract_book()` 跑 `books/` 目录下全部 7 个 epub 的章节数回归对比（改前 vs 改后）。
唯一变化是 `cb089c878a12.epub`（To Kill a Mockingbird）5 章→34 章（目录乱→正确，含
Dedication + Chapter 1–31 + Copyright + About the Publisher）；其余 6 本（4 份 The
Artist's Way 副本 + Body Keeps the Score + Bossypants）章节数/标题逐字节零回归。

②防误触 + ⑤目录切章的截图同样通过 `situ-harness`（`specs/_harness/index.html`）
在施工会话内截取，未落盘二进制文件。复现方式：
- ②：`run('harness-article')` 进文章模式 / `run('/fake/book.epub')` 进书模式后，
  用浏览器 devtools 或 `preview_eval` 模拟 `window.dispatchEvent(new Event('focus'))`
  + `elementFromPoint`/`MouseEvent('click')` 精确点击段间空隙 vs 行内文字空白坐标，
  对比放置前后 `.bookmark` / `_bookmarks` 记录数。
- ⑤：在 harness 里用 `window.pywebview.api.process = async () => ({...真实 mockingbird
  的 toc 数据...})` 覆写 stub（真实 toc 数据来自 `extract_book('books/cb089c878a12.epub')`
  的 Python 输出），`run('/fake/mockingbird-real-toc.epub')` 后 `openTocDrawer('toc')`，
  目录抽屉显示「第 1 章·Dedication」…「第 17 章·Chapter 16」…（共 34 章）有序列表，
  与旧版 5 章乱序（Chapter 8/14/21/About the Publisher/Document Outline）形成对比。
