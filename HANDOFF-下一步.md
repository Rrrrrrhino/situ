# 四土 · 书签/标注工作 接续便条（新窗口先读这个）

> 接续暗号：**「继续弄四土书签/标注，先读 HANDOFF-下一步.md」**
> 项目根 `~/Documents/situ/`。四土.app 跑实时源码（无冻结副本），改完 index.html/app.py 重启 App 即生效。
> 定位铁律：布局/位置类问题先用 preview_eval 量活 DOM，别靠猜。preview harness：`.claude/launch.json` 的 `situ-harness`(:18731)，控制台 `run('/fake/book.epub')` 进书模式、`run('harness-article')` 进文章模式。harness 假书数据已把词包成 `.w`（与真实 `reader_core/render.py` 一致）——**验证锚点/选区类功能务必先 `fetch('./canned-bookmarks.js?bust='+Math.floor(performance.now())).then(r=>r.text()).then(eval)` 刷新 canned 再测**（`<script src>` 有浏览器缓存；确认 `document.querySelectorAll('.w').length`≈1547 才开始）。

---

## 🆕 2026-07-03 夜 第四轮 · 真封面抽取 + 全局页码（两件都做完 · preview/端到端全验 · 真机待验）
主会话(Opus)直接施工 + 硬验收。改动 3 文件：`reader_core/extractor.py`、`santu_app/app.py`、`santu_app/index.html`（harness 已同步）。

**① 真封面抽取（书墙用真封面，无封面才落回字排兜底）**
- **`reader_core/extractor.py` 新增 `extract_cover(epub)`**：直接 zipfile 读（**不走 ebooklib 全量解析**，3MB epub 从 ~500ms 降到 1–16ms）。候选顺序：OPF `<meta name=cover>` → EPUB3 `properties=cover-image` → id/href 含 "cover" 的图 → manifest 首图。含 container.xml 定位 OPF、`../` 路径归一、zip 名大小写兜底。实测库里 5 本 epub 全抽到封面（1–16ms）。
- **`app.py` 新增 `_cover_thumb(book_id)`**：首次请求从 epub 抽 → PIL 缩到宽 300px（Retina 2x 够）→ JPEG q82 落盘 `covers/{id}.jpg` → 返 base64 data URL。无封面写 `{id}.none` 哨兵避免每次重开 epub。`list_library` 给每本 `book` 挂 `cover` 字段。冷启一次性生成（库里 4 本 ~3.2s，**已预热落盘**），之后 warm=0ms。`delete_archive` 连带清 `covers/{id}.jpg|.none`。`covers/` 已进 .gitignore；Pillow 已写进 requirements。
- **`index.html` `coverHTML`**：有 `it.cover` 就 `<img class=cv-img object-fit:cover>`（填满 2:3 框、盖进度色带），没有才落回原字排兜底。新增 `.cv-img` CSS 一行。
- **验收**：preview 注真封面 + 兜底混排截图过眼——hero/网格真封面填满 2:3 观感高级、"On Writing(无封面)"仍走暖纸字排兜底、进度带都在、与米底和谐。4 张真封面 naturalWidth=300 各自真实比例加载。

**② 全局页码（底部页码从「章内」改「全局」）**
- 四土不用 epub.js、没有连续 locations，故用**自校准估算**：`_toc_list` 现随每章带 `chars`（字数）；前端 `_globalPage()` 用「当前章真实页数 `_pageTotal` ÷ 当前章字数」得本次字号/窗口下的**每页字数 cpp**，再估其余各章页数（当前章永远用真实页数）。全局页=前面各章估算页 + 本章当前页；跨章/改字号/缩放自动重校准。
- `_updatePagerBar`：`bookCount>1 && bookToc 带 chars` 时显示 `全局页/全局总`，单章/异常回落章内页码。章内上下文仍由顶栏「第 X 章 / 共 Y 章」给出，信息不丢。
- **顺带④**：`_renderPagerTicks` 圆点刻度从「均分各章」改「按真实字数加权定位」（有 chars 时），与新页码体系对齐。
- **验收**：`_globalPage` 注真数据实测——ch1 页4/8(章内) → **8/15(全局)**、书首页=1、末章末页=总数(16/16，clamp 保证 cur≤total)；总数随章轻微漂移(15/14/16)是自校准固有代价、可接受。真书 load_archive 实测 34 章 toc 全带 chars（Ch1=27588 等）。

- **⚠️ 真机待验 A7/A8**：A7 书墙真封面（hero+网格 4 本真封面填满、无封面落字排兜底、进度带在）；A8 底部页码读「全局页/全局总」而非章内，翻页/换章数字连续递增、末页=总数。**preview 覆盖不到的仅"冷启首次生成 4 封面 ~3s"的真机手感**（已预热落盘，真机应已是 warm）。

---

## 🆕 2026-07-03 深夜 第三轮 · 首页顶栏大瘦身（已 preview 全验 · 真机待验）
用户要点：顶部那条功能横栏（URL 输入 + 生词0/28 + 朗读/书签/…/书架 + 生词本/设置）在首页多余，删掉，把纵向空间让给书墙/剪报墙。做完：
- **整条 `.topbar` 撤掉**。`#url`+`解析` 搬进 **dropzone**，现为一条：**[↑ 上传按钮] + 链接/文本输入框(回车即读) + 解析**。上传＝前置的向上箭头 `.dz-ico` 本身做成 `<label for="file">`（真手势触发原生选择器，规避 WKWebView 对程序化 `fileInput.click()` 的拦截，**这就是"dropzone 点击没反应"的修法**）；EPUB 也能直接拖进来。**已按用户二次反馈删掉多余的副提示文案 + 尾部「选文件」按钮**（上传功能归并到前置箭头按钮）。
- **`生词0/28`(navpill)、朗读、书签、书架、⋯ 菜单** 从界面删除；但这些元素仍被 JS 引用（方向键 navTo 更新 navPos、弦月 read/shelf 走 readBtn/libBtn.click、add 走 file.click），故收进 `<div id="legacyStubs" hidden>` 当**隐藏桩**，避免 `$('#id')` 取空报错。
- **`⋯` 菜单里的偏好**（英语水平/生词配色/发音口音/字号/预先备好讲解/导出）**折进「设置」面板**（新「阅读偏好」段，IDs 全保留，主会话 preview 验 level/accent/pregen/export/themebar×4/fs×4 都在且可用）。
- **`生词本`+`设置`** 留下，做成右上角浮动 `.home-utils`（`position:absolute;top:38;right:18`，仅首页显示、阅读态隐藏，不占纵向布局）。
- **书墙/剪报墙同比例增大 ~13-15%**：hero 150→172px、rest-grid minmax 86→100、clip 184→210/min-h 84→98，把腾出的空间给它们。
- 验收：0 console 报错；首页结构/URL 解析触发 run/设置偏好齐全/生词本开/reading 态 rfm(shelf/toc/read/add)+book-bar+dot 菜单全回归；宽窄两档截图过眼。**改动仅 `santu_app/index.html`（已同步 harness，仅差 canned include 1 行）。**
- **⚠️ 真机重点验**：① dropzone「选文件」能不能真开原生选择器（label 方案，harness 看不到 OS 弹窗）；② 右上角 `生词本/设置` 胶囊没被标题栏切；③ dropzone 空白粘贴链接→回车能读。

## 🔜 下一窗口从这里开始（2026-07-03 深夜 · 又一轮主会话结束）
**本轮（Opus 主会话，全 preview_eval 硬验收）修完用户点名的 4 件小事，均 0 报错、像素级验证：**
1. **圆点贴点击无改色菜单（真 bug，上轮 handoff 误写"已完成"）**：根因＝右页边放置槽 `#dotSlot`(z-index:6) / `#dotSlotA`(fixed z40) 盖在已落半圆(z auto)之上，点半圆命中的是槽→又贴一枚，菜单永不弹（`elementFromPoint` 实测命中 `dotSlot`）。修法：书模式 `.dotwrap{z-index:7}` 顶上槽（同栈直接生效，验 `elementFromPoint`→halfdot）；文章模式半圆跨栈无法靠 z-index 压过 fixed 槽，改 `_dotSlotAClick`/`_bkSlotAClick` 命中测试 `elementsFromPoint` 找底下的 `.dotwrap-a`/`.bookmark`→有就开菜单/删除、无才放置。验：点已落半圆弹七色+移除、不再重复贴。
2. **文章模式放置书签/圆点 预放置≠实放置**：根因＝`.bookmark`/`.dotwrap-a` 用 `margin:24px 0` 插入正文回流（把目标块推下 ~9px）+ 预览线画在 `r.top-11`/`r.bottom+11`（真实落点其实在块顶缘）→实测错位 20px。修法：`.bookmark`/`.dotwrap-a` 改 `margin:0`（零回流）+ 新 `_artAnchorY()` 让预览线精确画在真实落点（before=本块顶缘、after=下一块顶缘）。验：before/after 两种 case `mismatchPx==0`；margin:0 后行仍落在段落间隙、日期签浮得干净（截图过眼）。
3. **首页/目录/书签 三键不美观、不和谐 + 文章界面缺这两键**：旧版 `⌂ 首页 / ☰ 目录 / 📑 书签`＝细文字glyph 混彩色 emoji，且绝对居中的章节标题穿透压在按钮上一团糊。改：三键统一为**同一套细线 SVG 图标（house/list/bookmark ribbon，1.7 stroke，暖灰 `#7c7263`→hover 琥珀 accent）+ 文字**，收进一枚浮出的**暖纸小胶囊 `.tool-chip`**；胶囊 `z-index:2` 压在标题之上、暖纸底把标题左段干净遮住（窄窗不再打架）。文章模式加**同款胶囊 `#artTools`**（fixed 左上角，常驻 opacity:.5→hover 全显，因文章无顶栏需可发现）：首页→`goHome()`、书签→`openBkMenu(artBkBtn)`（`openBkMenu` 改为接受触发元素定位）。验：书模式三键截图过眼协调、标题不再穿帮；文章两键截图在位、`goHome`/`bkMenu` 都通。
**本轮第二批（用户复看后又提的 3 件，均已修+preview 全验）：**
4. **文章「首页/书签」胶囊被 macOS 标题栏遮挡**：`#app` 用 `padding-top:30px` 给透明标题栏(NSFullSizeContentView)留白，但我的 `#artTools` 是 `position:fixed;top:12px`（相对视口、无视那 30px）→ 藏在标题栏下被裁。修：`top:12px→38px`（30 留白 + ~8，与书模式三键同高、避开红绿灯）。另把常驻态从 `opacity:.5` 改 **`opacity:1`（不透明）**——半透明会透出身后正文一团糊，改不透明让暖纸底干净遮字，低调靠暖灰字而非整体透明度。
5. **圆点选色条每点一次自动上移一截**：`dotBar` 改色后原代码 `showDotBar(_curDot, dotBar.getBoundingClientRect())` 重开浮条、且以**浮条自身 rect** 重新定位（每次 top-42）→ 逐次漂移。修：改色后**原地** `toggle('on')` 更新当前色高亮、不重开浮条。书/文章模式都验：连点 3 色浮条 0 位移、色正确落到 record。
6. **文章书签落点在间隙靠下（书模式在间隙正中）**：书模式 `_renderBkLayer` 用 `gapHalf=10` 把线画在块顶缘上方 10px（间隙中）；文章 `margin:0` 后线落在块顶缘（间隙底）。修：`.bookmark`/`.dotwrap-a` 加 `transform:translateY(-10px)`（纯视觉上提、零回流，线+日期签整体移）+ `_artAnchorY` 同步 `-10`（`_ART_GAP_LIFT=10`，与书模式同值）。验：line 落点较块顶上移 10px、预览仍 0 错位、被 transform 抬起的半圆点击仍能命中开菜单。

- **改动仅 `santu_app/index.html`（已同步进 `specs/_harness/index.html`，两文件现仅差 harness shim）。** 未动 app.py（dots/bookmarks/highlights plumbing 不变）。
- **⚠️ 唯一 preview 无法覆盖的点＝#4 的"标题栏遮挡"本身**（harness 是普通浏览器没有原生标题栏）——已按 `#app padding-top:30px` + NSFullSizeContentView 几何推定 `top:38` 必然避开，真机请重点看这枚胶囊有没有露全。
- **真机待验**：见文末清单新增 A4（圆点改色菜单）、A5（文章预放置对齐）、A6（文章首页/书签胶囊）。

**⏭ 「② 全局页码」+「③ 真封面抽取」两件已于 2026-07-03 夜第四轮做完**（见本文顶部「第四轮」条目）。下面①②③ 为更早各轮完成参考。

**① 圆点贴 ✅ 已完成（本轮，真机待用户最终确认手感）**
- 用户要的最终形态：**放置永远干净一击**（移到右页边点一下，用「上次用色」直接贴半圆，中途不选色）；**改色/删除只在事后**点那枚已贴半圆→弹 `#dotBar`（七色 + ≤3字标签 + 移除）。
- 实现：删掉了曾短暂加过的「右页边顶端默认色小把手 dotCap」（用户嫌多余）；`.dot-slot-plus` 改成半透明「半圆幽灵」预览落点；`_dotApplyColor` 里恢复 `_dotLastColor=color`（改一枚就记为下一枚默认色）。改动限 index.html，node --check 过、preview 验（贴/点开菜单/七色+移除齐）。

**② 阅读顶栏改版 ✅ 已完成（本轮）**
- 章节标题(`#chapInfo`)常显、绝对居中位置钉死；`.bar-tools`(⌂首页 · ☰目录 · 📑书签)平时 opacity:0、`.book-bar:hover` 才淡入，开卷 `_barToolsPeekOnce()` 淡入 1.6s 帮发现；**删掉了「上一章/下一章」**（chapPrev/chapNext 及其 listener/disable 逻辑全清）；新增 `goHome()`（收抽屉+停朗读+`initWelcome()`）挂在「⌂首页」。preview 验：标题居中稳定、hover 出没不推标题、goHome 退出阅读态 body class 归零。

**② 底部页码要显示「全局页码」（现在是章内页码）——用户明确要**
- ⚠️ 关键架构差异：**四土不用 epub.js**（是 Python `reader_core/extractor.py` 按章切 + 前端 CSS 多列分页），所以**不能直接照搬阅读工坊的实现**。阅读工坊靠 epub.js `book.locations.percentageFromCfi(cfi)`+`locations.length()` 得连续全书页码（`09-reader-runtime.js:183-186`，`locations.generate(900)` 慢故 localStorage 缓存 `key::locations::v1`）。
- 四土怎么做（新窗口定）：后端各章有字符数（extractor 已知每章长度）。两条路——(a) **全书进度%/进度条**（最省：`(前面各章字数+本章已读比例)/全书总字数`，阅读工坊没 locations 时也是回退到 NN%）；(b) **估算全书页码**「第 X / Y 页」：用各章字数 ÷ 每页平均字数估每章页数，全局页=前面各章估算页和+本章当前页。(a) 最稳先做，(b) 更贴用户"页码"字面。**可参考阅读工坊的展示格式**（`14-reading-chrome.js:81` "X / N 页" / "NN%"），但底层要自己算。当前四土页码逻辑在 `_updatePagerBar`/`#pgLbl`（index.html）+ `updateBookBar`（章节条）。

**③ 第三批 书架改版——✅ 已完成（2026-07-03，builder 施工）**
> 首页改成「书墙（hero大封面+小封面网格）+ 剪报盒（横向文章卡）+ 单一智能入口」，方向 B，逐像素照 `specs/_harness/homepage-mock.html`。本批只做字排兜底封面，**真封面抽取仍是第二批未做的活，留给下一窗口**（见下方原始规划，抽封面部分尚未启动）：
> - 改动限 `santu_app/index.html`（同步进 `specs/_harness/index.html`），`app.py` 未动
> - `renderHome()` 替代 `renderShelf()`：`list_library()` 按 `mode` 分流，书列表第 0 条=hero；字排兜底封面按 id 哈希取固定套色（`--amber/--green/--navy/--clay/--plum/--olive/--mauve`，均低饱和，无亮蓝）
> - 顺手修了一个原有潜在 bug：`goHome()` 从阅读态回首页时，`#reading.innerHTML` 曾被 `renderBook`/文章渲染整个换掉、`#hint` 骨架永久丢失（旧 `renderShelf` 对此静默吞掉），现已用启动时快照的 `_HOME_SKELETON` 在 `initWelcome()` 里自动复原
> - preview 实测：1180×820 视口一屏全见（`.clip-band` bottom=801.6px ≤ 820px）；书/文分流、openArchive/删除/goHome 闭环全过；`node --check` 通过；详见 `~/Documents/改动日志库/situ/详细.md` 2026-07-03 条目
> - **主会话验收后的精修（2026-07-03）**：① 首页改为**全屏**——`body:not(.reading) .panel{display:none}` 收起右侧 372px 讲解面板（首页无需讲解、且旧结构会把首页挤成左半栏），书墙铺满整宽对齐 mockup；进阅读态 `.panel` 自动回来（已量 openArchive→flex、goHome→none）。② 一屏收紧——`body:not(.reading) #reading{padding-top:14px}` 收回阅读列的 44px 顶距 + 问候压成 15px 灰字（原 `.wel-top` 60px→~24px）+ dropzone margin 微收：剪报盒 bottom 802→**712px**（≥720px 高窗口一屏全见）。剩余固定成本＝顶栏 57px（含现在与 dropzone 冗余的 URL 输入框，窗口更矮时可考虑精简，未做）。
> - **第二轮用户反馈精修（2026-07-03 晚，主会话直接改 + preview 全验）**：
>   1. **剪报卡改小巧精致**：`clipHTML` 删掉「网址(source)」和「摘要(excerpt)」两行（真文章 source 就是个 URL，用户嫌丑没用），只留 **标题(衬线) + 日期 + 左缘一道套色**；卡片 236px→184px、padding 收、min-height 84、标题 clamp 3 行。剪报盒整体从 154px 高降到 ~112px。
>   2. **书墙 > 剪报盒（用户要书架更大）**：剪报卡变小后，书墙(225px) 明显高于剪报带(172px)，主次对了；剪报盒 bottom 再降到 ~663px。
>   3. **书籍数量默认收敛**：`HOME_SMALL_CAP=4` —— 默认只显示 hero 1 本 + 小封面 4 本，其余折叠；「展开全部 N 本 / 收起」做成**标题行右端的低调链接**（`#wallToggle` + `.wall-toggle-btn`，`_homeShowAllBooks` 标志位 + 委托 click 重渲染），**不占封面格、不撑第二行**（≥1000px 宽实测 hero+4+添加 = 一行；800px 窄窗添加格会折行，用户窗口够宽不受影响，真要更稳可把 CAP 降到 3）。
>   - harness `canned-bookmarks.js` 的 `HOME_BOOKS` 补到 7 本以验折叠。preview 验：折叠一行/展开 6 本/收起、书墙>剪报带、一屏全见、node --check 过、0 console 报错。
> - **⚠️ 下一窗口首要活之一：真封面抽取（原规划第二部分，尚未启动）**：Python 侧（`extract_book` 已在用 `ebooklib`）从 epub OPF manifest 的 cover/首图抽封面 → 缩略图存盘（`books/` 旁或新 `covers/`）→ `list_library` 每条带 `cover`(url/dataURL) → `coverHTML` 有真封面就 `<img>`、没有才落回现在的字排兜底。字排兜底已就绪，是"锦上添花"层。

<details><summary>原始规划（封面抽取部分尚未做，折叠保留供下一批参考）</summary>

- 阅读工坊首页画廊 `#homeView` 源：`15-home-shelf.js` + `style-15-home.css` + 已定稿 mock `_redesign_mock/home-a|b|c.html`（在 `~/Desktop/codex-practice/reading-atelier-mockup/`）。机制：开书时 `book.coverUrl()` 抓真封面→缩到≤300px dataURL 存 meta（`captureBookCoverIfNeeded`）；`renderSlot` 出封面格（无封面→字排兜底 `home-cv <color>`）+ 标题/作者/进度；`drawHomeWall` 画网格 + 末格虚线「＋ 添加书籍」。
- 四土落地差异：四土无 epub.js，**真封面要 Python 侧从 epub 里抽**（OPF manifest 的 cover 或首图，存 `books/` 旁），无封面走暖纸+深蓝油墨字排兜底。**动工前先把阅读工坊首页跑起来截图给用户确认"就照这个/微调哪里"，再决定直接移植还是重画**。
- **剪报盒 + 添加双通道**（见下方给用户的解释，已与用户对齐概念）：书=封面墙，文章=单独「剪报盒」区（文章不是书、不该混进书架封面墙）；添加入口拆「读一本书(EPUB)」/「读一篇文章(URL/文本/文件)」两条明路（功能其实已有，是存在感+分流）。视觉大岔路，**动工前出 2–3 方向 mockup 给用户挑**。

</details>

**④ 顺带**：第二批 Phase2 页码条刻度里「非当前章的章内位置」用的是估算 20 block（`_renderPagerTicks` 的 `inChFrac`）——若 ② 做了全书字数/页数体系，这里可顺手换成真实占比，更准。

---

## ✅ 2026-07-03 误触方案 A（页缘书签槽）已施工+preview全验（真机待验）
用户拍板选 **A**。已实现并逐项 preview_eval 量数字验证通过：
- **正文/空白点击 100% 免费**——彻底删除「点空白置签」（书模式 `_bkHandlePagerClick` 只留删除分支；文章模式 click 处理器删除放置分支）。删掉死代码 `_clickInTextFrag`/`_bkHitBoundary`/`BK_SNAP_PX`。
- **左页边书签槽**：书模式 `#bkSlot`（pager-viewport 内 absolute 左 42px 页边，text 从 48px 起，槽在纯页边不压字）；文章模式 `#bkSlotA`（fixed，贴住居中正文列左缘，随滚动/resize 重定位 `_bkPositionSlotA`）。默认只一道极淡竖向页边细线（.16，笔记本装订线隐喻），hover/armed 加深(.36)+ ＋跟随行高 + 版心浮出落线预览引导线(.44)。
- **落线算法**：新 `_bkBoundaryAtY(y)` 只按 Y 找当前页最近段落边界（复用 `_bkBoundaries`，X 完全不参与）；`_bkPlaceAtBoundary(hit)` 复用原 snap/frac/excerpt 落线（同 (ch,ord) 再点=切换删除）。文章模式槽点→`placeBookmarkAt(blockAtY(y), y)`。
- **删除仍保留焦点保护**（书签无撤销，防"点窗激活即误删"这一击）——只保留在删除路径，放置路径已无闸（解决"有时有反应有时没有"）。
- **开卷一次性提示** `_bkSlotIntro`：每会话第一次进阅读，页边细线亮一下(.05→.52→.16)帮发现槽（option A 唯一弱点=可发现性）。
- **边缘分工（与第二批圆点贴对齐）**：书签槽+落线在**左**页边；**圆点贴走右页边**（mockup `border-radius:28px 0 0 28px` 平边贴右缘、弧朝版心，天然分家不打架）。书签线日期签仍在线右端（列内），与右缘圆点贴 X 相差~48px 不冲突。
- 验证：node --check OK；preview_eval 实测 书模式(槽几何/armed/落线预览==实际落线像素一致/blank点0放置/点线删除/toggle删/换章过滤/多书签/存档恢复重画) + 文章模式(槽贴列左/armed/落线/blank免费/删除) 全过；截图过眼观感干净。
- 改文件：仅 `santu_app/index.html`（净变化：删约55行死代码+放置分支，增约130行槽CSS/HTML/JS）。harness 已同步。**未动 app.py**（书签字段plumbing不变）。

---

## 立即要做的第一件事：书签「误触」方案重设计（✅已完成，见上）

**背景**：现行「点正文空白＝置签」会误触（用户只想点一下让四土成为当前窗口，却放了书签）。已上的「焦点闸(窗口focus后450ms内点击不放)+真空白闸」被用户否决——治标不治本，且「有时点了有反应有时没有」体感差。用户要的是：**既能纯粹自由点击空白，又能方便置签**，即「点击永远免费 + 一个明确但仍快的手势置签」。

**已给用户 4 个方案（用户尚未选，新窗口先问定再动手）**：
1. **页缘书签槽（主会话首选⭐）**：正文栏外侧窄页边做「书签槽」，悬停浮出刻度+「＋」，点它在该行高落线；正文/空白区 100% 自由点击。空间上彻底分开两种意图，从结构根除误触；最贴合实体书；**与第二批圆点贴天然统一为「页缘标记体系」**。代价：得把光标移到页边槽。
2. **双击空白置签**：单击免费、双击落线。保留「任意空白都能放」的自由，零改布局。代价：需学会双击。
3. **长按空白置签(~350ms 生长动画)**：轻点免费、按住落线。仪式感好。代价：有 0.35s 等待。
4. **悬停浮「＋书签」把手**：空白/页边悬停浮出「＋书签」药丸，点它落线。误触为零、好发现。代价：多一个悬停元素。
- 次选叠加项：右键/⌥-点空白、或键盘 `B` 置签（意图性最强、可发现性差，适合作快捷方式与主方案并存）。

**主会话建议**：主用①页缘书签槽（唯一结构性根除误触 + 统一圆点贴），舍不得「任意空白点」就退②双击；①②可同时给（槽为主、双击为辅）。**新窗口：先让用户在 1/2/3/4 里选定（或①②组合），再改。改动限 santu_app/index.html，覆盖层几何逻辑已在 `_bkHandlePagerClick`/`_bkBoundaries`/`_renderBkLayer`。**注意与第二批圆点贴的放置手势别打架（若①中槽，需想清书签线 vs 圆点贴各自怎么放）。

---

## 第二件事：第二批 色块高亮 + 圆点贴（spec=`specs/色块高亮+圆点贴-第二批-施工规格.md`）

### ✅ Phase 1（②③④⑥ 色块高亮）已施工+验收通过（真机待验）
builder 施工 + 主会话 preview_eval 硬验收。已实现：
- **划选荧光笔**：mouseup 工具条从「讲解·追问 🗑️」扩成 `[讲解·追问] | ●七色 | [复制]`（`.sb-c`/`.sb-copy`）；点色点→`applyHighlight(_selRange,key)` 包 `.hl` span（`box-decoration-break:clone`，背景 `var(--wX)`）。讲解·追问在首位、`explainSelection` 一字未动（已验：`.sent` 选区仍生成 `.phrase`、0 stray `.hl`）。
- **整段色卡**：划选恰好覆盖整块→`.hl.para`（block、圆角、洗色 .16、margin:0 -16px 微出血）。
- **点已有 `.hl`**：工具条进 `mode='hl'` → 七色改色 + 移除（`recolorHighlight`/`unwrapHl`）。
- **叠加层级**：`.hl` 不设 z-index，`.w`/`mark.vocab`（赭金）/`.sent` 嵌其内在上层——已验高亮内 vocab 仍可点讲解。
- **持久化**：文章模式随 `doSave` innerHTML 快照天然持久（零后端）；书模式 `_highlights` 锚点 record `{id,ch,blockOrd,start,end,color,kind}`（字符偏移）+ 新 `highlights` 字段（app.py 照抄 bookmarks plumbing 3 行）+ 渲染后 `_applyHighlightsForChapter()` 重包。
- **七色**（`:root` 的 `--cA..cF,cP`/`--wA..wF,wP`）逐字照 mockup；截图过眼：暖纸底和谐不刺眼、藕粉与陶红/黛紫同族。
- **⚠️ 验收补的关键 bug**（详见 `~/Documents/改动日志库/四土/详细.md`）：`_hlPointToBlockOffset` 原只认文本节点，`liftRangeToWords` 吸附到 `.w`/`mark.vocab` 元素边界后返回 null→**书模式高亮锚点全丢、换章/重开不复现**（canned 用纯文本没暴露）。已改用 `Range.selectNodeContents(block)+setEnd(node,offset)→toString().length` 量偏移；并给 harness `canned-bookmarks.js` 的 `para()` 加 `.w` 包裹保真。重验：跨词/跨vocab选区都正确入 record、换章往返两条全复现。

### ✅ Phase 2（⑤ 圆点贴 + 页码条同色刻度）已施工+验收通过（真机待验）
builder 施工 + 主会话 preview_eval 硬验收（faithful `.w`=1547 harness）。已实现：
- **右页缘半圆** `.halfdot`（14×28、`border-radius:28px 0 0 28px` 平边贴右缘弧朝版心、背景 `var(--cX)`），覆盖层 `#dotLayer` + `_renderDotLayer()`（逐字镜像 `_renderBkLayer`：按 `{ch,ord,side}` 锚定、只画当前页当前章、8 处与 `_renderBkLayer` 同调用点联动）。
- **放置**：右页边槽 `#dotSlot`(书)/`#dotSlotA`(文章)，与左侧书签槽完全对称（淡竖线→hover ＋跟随行高+半圆落点预览，＋用上次用色）；单击即在 `_bkBoundaryAtY` 最近段落边界落半圆。
- **改色/标签/删除**=点已落半圆→mini popover `#dotBar`（七色改色 `.sb-c.on` 标当前色 / ≤3字标签 input / 移除）；标签 hover 时 `.dotlabel` 浮出（半圆左侧朝版心）。
- **持久化**：书模式 `_dots` record `{id,ch,ord,side,color,label}` + 新 `dots` 字段（app.py 照抄 bookmarks 3 行；`doSave` 已带 `dots:_dots`）；文章模式 `.dotwrap-a`（零高度行内标记，`blockAtY` 锚块）随 HTML 快照持久。
- **页码条刻度** `.pager-bar .tick`：全书位置分数（章序占比+章内 ord 占比，非当前章估算 20 block）、同色、点击 `_dotJumpTo` 直达。
- **验收数字**：半圆几何 14×28/radius 28/0/bg `rgb(179,121,139)`=`--cP`；save→load 全链路 dots+label"金句"完整复现（faithful harness）；换章往返 ch0→ch1(0)→ch0(2)；同页左书签(1)右圆点(2)互不干扰；3 dot→3 tick 同色；Phase1 高亮/讲解回归未坏；console 0 报错。
- builder 自评的取舍（主会话认可）：文章圆点用零高度行内标记复用 `.bookmark` 那套（比全局绝对定位+滚动同步简单可靠）；页码条章内分数用估算；`_dotJumpToA` 文章模式空占位（文章无 pager-bar）。

### 🎉 第二批（色块高亮 + 圆点贴）整体完成——真机待验清单见文末新增项。下一步=第三批 书架改版（见下）。

**下方为 Phase 1 施工前的原始设计备忘（mockup 已批准的拍板项，保留存档）：**
**mockup**：`~/Desktop/预览/四土/色块高亮与圆点贴-mockup.html`。**用户已拍板**：
- **荧光笔笔触选 A（平涂圆角）**——`border-radius:4px` + `box-decoration-break:clone`（跨行两端同圆角）。B（马克笔手绘感）弃。
- 色盘 = 呼吸盘六色浅纸版（琥珀/豆绿/黛蓝/陶红/黛紫/橄榄）+ **新增藕粉 `#b3798b`（灰调干玫瑰，dot色）/ `rgba(179,121,139,.24)`（洗色）**，用户认可。
- 其余（整段色卡、与生词高亮/书签线叠加、圆点贴页缘半圆、页码条同色刻度、划选工具条 讲解·七色·复制）用户都认可，无异议。

**设计要点（施工规格里展开）**：
- 两粒度高亮：划选=荧光笔浅色块；整段/章节标题=段落色卡（洗色更淡 .16、圆角、向两侧微出血）。
- 锚定与书签同一套：`{ch, ord/字符偏移, 颜色}` 存书档 JSON；色块垫在生词赭金高亮**下层**（避免叠加脏）。
- 划选松手→选区旁小工具条：`[讲解](保留原词块讲解在首位) [七色圆点即点即涂] [复制]`。划选取词/词块讲解现有逻辑不能被破坏。
- 圆点贴：**对折贴页缘的半圆**（平边与页缘齐平、弧朝版心，已定稿），自由用色+可选2–3字小标签(hover浮出)，页码条同色小刻度作全书索引点击直达，正反两页同高度都显示。放置手势需与「误触方案」一并想清（见上）。

---

## 第三件事：第三批 书架改版 —— ✅ 结构已完成（2026-07-03），真封面抽取待另开新批
书墙+剪报盒分区、单一入口已上线（见上方「③ 第三批」条目）。**仍缺**：真封面墙（从 books/ 里留存 epub 抽封面存缩略图；无封面才落回暖纸+深蓝油墨排版封面——本批已实现这个字排兜底）。视觉大岔路（真封面这部分），动工前出对比图给用户挑。

---

## 真机待验清单（微调批已施工完、用户尚未真机全验）
彻底退出所有四土实例再重开（.command 用 nohup 会留旧进程）。四土.app 跑实时源码，直接重启即含本轮全部改动。

**本轮新增（误触A + 第二批）真机验：**
- A1. **误触根治**：读书/文章时，正文任意处点击（字上/空白）都不再放书签；把鼠标移到**正文左**页边→浮出＋和落线预览→点一下落书签线；点线删除。开卷时左页边细线应轻亮一下。
- A2. **色块高亮**：划选一段松手→浮出工具条（讲解·追问 | 七色 | 复制），点色即涂；整段全选→整段色卡；点已涂处可改色/移除；高亮内的蓝色生词仍能点讲解。**关键**：书里涂完色，换章再回来 / ⌘Q 重开这本书，颜色应还在原位（这是我在验收里补修的锚点 bug 的真机确认点）。
- A3. **圆点贴**：鼠标移到**正文右**页边→浮出＋→点一下贴彩色半圆；点半圆弹小条改色/填≤3字标签/移除；底部页码条出现同色小刻度、点它跳转。左书签右圆点同页共存不打架；换章/重开圆点应还在。

**2026-07-03 深夜补的 4 件小事真机验（preview 全过）：**
- A4. **圆点改色菜单 + 选色条不漂移**：书里/文章里点一枚**已贴**的半圆 → 应弹七色+≤3字标签+移除的小条（之前是死的，再点只会又贴一枚）；**连续点不同颜色，选色条应纹丝不动**（之前每点一次就上移一截）；改色后下一枚干净放置默认用这个新色。
- A5. **文章放置对齐 + 落在间隙正中**：文章模式把鼠标移到左页边（书签）/右页边（圆点），浮出的预览落线/半圆，点下去后**真实落点应和预览严丝合缝**（之前差约 20px），**且书签线应落在两段间隙的正中，与书籍模式手感一致**（之前偏间隙靠下）。
- A6. **文章首页/书签胶囊（重点看有没有被标题栏裁掉）**：文章阅读界面左上角应有一枚**完整、不透明**的「⌂首页 · 📑书签」暖纸胶囊（之前 top 太高被 macOS 透明标题栏切掉半截）；点首页回书架、点书签弹书签列表。书模式顶栏三键也换成了同款细线图标胶囊，标题不再被按钮压糊。

（下为微调批既有项）
1. **启动白屏**是否明显变短（根因=Google Fonts 阻塞首屏，已本地化字体152KB+窗口底色暖纸）。
2. **讲解缓存**：同一页开关软件两次，第二次是否**不再**「生成讲解中」（已按书落盘 `data/pregen/{id}.json`，level不符即弃）。
3. **首页书脊一击即开**（acceptsFirstMouse 补丁，无法preview验）。
4. **mockingbird 目录**：应显示 Dedication+Chapter 1–31 全序共34章（已按epub真实TOC切章，其余书零回归）。**注意**：该书若放过旧书签，`{ch,ord}` 锚定会随重切章漂移，需手动删重放（已知限制）。

## 已完成（验收通过）
- **误触方案 A（页缘书签槽）**：正文点击100%免费，书签改由左页边槽放置（详见本便条顶部）。preview全验，真机待验。
- **第二批 色块高亮 + 圆点贴**：Phase1 高亮（划选荧光笔/整段色卡/工具条七色+复制/改色移除/书模式锚点持久，含验收补的锚点bug修复）+ Phase2 圆点贴（右页缘半圆/popover改色标签删/`dots`字段持久/页码条全书索引）。preview全验，真机待验。
- **第一批 书签系统**：点空白置签(覆盖层零回流)/A黛蓝墨线·纸签(点线即删,V1发丝线+迷你日期签,无emoji)/目录|书签双tab缩略图网格/📑入口/跨列fragment定位。真机基本验收OK。
- **微调批①③④⑤**：去状态小字/白屏字体本地化/讲解缓存持久化/目录切章——均已施工+harness验收，待真机。②误触=已由方案A推倒重做（见上）。

## 关键坐标
- 施工规格：`specs/书签系统-第一批-施工规格.md`、`specs/微调批-书签体验+缓存+启动-施工规格.md`
- git 存档点：微调批前基线 `a799435`；第一批施工前 `7d31229`。备份 `_backups/situ-20260703-080916`(4G)。
- 派工习惯：判断轻产出重(照规格写码/调样式)→写 spec 派 builder(Sonnet)；品味/方向/出对比图→主会话(Opus)做。builder 停了先 SendMessage 续。
- 改动日志中央库：`~/Documents/改动日志库/四土/`（概述.md 无代码 + 详细.md）。
- 长期记忆卡：`project_situ_annotations_plan.md`（三批计划+已锁定设计）、`reference_situ_path.md`。
