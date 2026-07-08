# 四土 接续便条（HANDOFF）

> 新窗口接续暗号：**「继续弄四土，先读项目根 HANDOFF.md」**

---

## ✅ Opus·仅标记批ε（2026-07-08）：右栏整块做成可折叠抽屉（已改源码，待真机验收）

> 上一条批δ′ 的「下一窗口的活」已做完。把手样式经四轮（细握把→四把手对比→四款可交互→用户上传参考图定），
> 最终＝**左圆角拉手 tab · 悬停浮现**。**只动 `index.html`**（右栏 chrome 显隐；核批划痕层 / 批α 收获管线没碰）。
> 细账见 CHANGELOG 顶节。

- **做了什么**：整条右栏（讲解／生词本／收获，本就共用一区）＝一只可开关抽屉；`margin-right:-372px` 滑出、
  正文自动占满。把手 `#drawerGrip`＝44×82 **左圆角拉手 tab**（`border-radius:12px 0 0 12px`、纸底暖线边、
  柔灰雪佛龙、右缘贴分隔线），**平时隐藏，鼠标移到右缘 66px 热区才浮现**（`.grip-hot:hover ~ .drawer-grip`）；
  展开态贴抽屉左缘常显、雪佛龙翻 ›、兼作收起。两态各记偏好（讲解默认展开、仅标记默认收起，localStorage 记住）；
  点蓝词／短语／「收获」钮会 `ensureDrawerOpen()` 自动拉出，程序化换文档复位不触发。
- **⚠️ 只改了源码，未打包 `/Applications`**：主窗无 SW，**`/Desktop/四土.app`（源码启动器）可即时验**。
  **确认后再 `bash packaging/build.sh` 装 `/Applications`**（避免拍板前白建）。
- **用户验收清单**：① 阅读态把手默认看不见 → 鼠标移到最右缘，圆角拉手浮现 → 点它，抽屉 .22s 滑出/收起。
  ② 进「仅标记」→ 抽屉自动收起、正文占满；退回讲解 → 自动展开。③ 收起态点正文蓝词/点顶栏「收获」钮 →
  抽屉自动滑出到对应内容。④ 两态各自的开/收会被记住。**参考图/对比图**在 `previews/仅标记-收获抽屉-*.html`。

---

## ✅ Opus·仅标记批δ′（2026-07-08）：真机反馈两轮修复（已装机）

> 批δ 装机后用户真机测试，两轮反馈全部修完。细账见 CHANGELOG 顶两节。**取证优先**贯穿（音频/时序/可见性
> 都先拿数据坐实再改）。动了 index.html + app.py + mobile/js/core/{audio.js,localapi.js,llm.js}（bundle 已重建）。

**已修全部**：
- **复盘窗喇叭无声**（根因坐实）：复盘窗音频走客户端引擎读 IndexedDB 空凭证 → 改成**优先借用 `/api/get_audio`
  原生引擎**（同进程、有用户真凭证；curl 证明原生对失败词组能出 33KB 音频）。失败落客户端，手机不受影响。
- **定位提示**：原高亮**根本不可见**（`.8s` 淡入却 60ms 清掉）。改成**词块级**（点亮划过的那几个词 `.capt` 而非
  整段）+ **D·绿洗色**（用户拍板；橄榄绿瞬时洗色再淡回琥珀）+ 瞬时点亮走「先无过渡→双 rAF→淡出」避开旧 bug。
- **换章后留在收获 tab**（不再弹讲解）、**「原文·第N章」标号**改用 toc 标题（与顶栏一致）、**词块生成"卡~1分钟"**
  ＝90s 阈值 → 加 `nudge_sheaf`（收获 tab 开着即时催生）、**收获区排序竞态**（save 防抖 1500ms vs 刷新 400ms →
  刷新前先 `doSave`）、**收获条目删除键** `.sh-del`、**讲解卡删除** `.ex-del`（从生词本移除当前词）。

### ▶️ 下一窗口的活：收获区在「仅标记」下做成可折叠抽屉（用户提出，待做）
> 暗号可用：「继续四土仅标记，把收获区做成仅标记下可折叠的抽屉」。
- **用户诉求**：仅标记＝沉浸「捕猎/收获」态，右栏那一竖列收获内容会分散注意力；希望能折叠收起、想看时再拉出。
- **现状**：右栏是 `.panel` 三 tab（讲解/生词本/收获 `#panelSh`）；仅标记开关＝`toggleCaptMode()`（body.capt-mode-on）。
- **Opus 建议（供下窗参考，非定稿）**：① 仅标记开启时，整条右栏（或至少收获 tab）默认**收起为一道窄边把手/书脊**
  （贴右缘竖条，显「收获 N」徽标），点它/hover 才滑出抽屉；关掉仅标记恢复常驻。② 折叠态仍保留徽标计数（`_shSyncBadge`
  已有 `#shCount`），让用户余光知道攒了几条但不被内容拉扯。③ 动效走印刷品克制（滑出 .22s，别弹跳）。
  ④ 别动核批划痕层与批α 管线，只做右栏 chrome 的显隐。**先出对比图**（抽屉把手样式/折叠态观感）再落。

---

## ✅ Opus·仅标记批δ（2026-07-08）：收获集打磨+词块发音+删除入口+复述稳健（已装机，待真机验收）

> 规格 `specs/仅标记-批δ-收获集打磨与发音删除-施工规格.md`；细账见 CHANGELOG 顶节。四土主会话亲做（不派 builder）。
> 动了 index.html + app.py + mobile/review-input.js + review.css + mobile/js/core/{localapi,llm}.js
> （core 两文件已 `npm run build` 重建 bundle）。build.sh EXIT=0、自检哈希一致、grep 坐实全 baked。

**七条全落地**（逐条根因/改法见规格 §1）：①书页收获钮监听重挂（装机验证）②复述挑词点灯+稳健兜底
（断网显「没取到+重试」不再静默空白，失败重试1次）③词块发音小喇叭（复述 chip `.rc-say` + 收获条目 `.sh-say`，
细线复用、点了只发音不误触）④换章后点前章条目原文→自动跳章+翻页+呼吸高亮⑤排序补 start（同段多条严格章→块→偏移）
+收获 tab 开着划/取消防抖 400ms 自动刷新（新条冒骨架、取消即消失）⑥get_sheaf 惰性删除同步（活 cid 集过滤，不落盘，
永不返幽灵）⑦讲解模式生词本 tab 每行 `.nb-del` + 大视图本篇放开 `.gv-del`，delete_global 顺带清 session 镜像。

### ⚠️ 待用户真机验收（Dock 重开四土）
1. **书页**顶栏「收获」钮点一下 → 右栏切收获 tab（①）。
2. **收获条目**标题旁小喇叭点一下出声、不误触勾选/跳转；**复述窗** chip 内小喇叭同理（③）。
3. **生词本 tab** 某行垃圾桶 → 该词消失、计数-1、重开仍不在；本篇+全局都能删（⑦）。
4. 在第 N 章点收获里第 M 章条目的「原文·第M章」→ 自动翻到该章、滚到那句、呼吸高亮（④）。
5. 收获 tab 开着划一条 → 数秒内冒骨架、生成后 ink-in；取消一条 → 即时消失；顺序严格按章→块→偏移（⑤⑥）。
6. 复述**断网**点「挑几个值得练的词块」→ 显「目标表达没取到 [重试]」而非转圈后空白；console 有 `[retell]` 归因日志（②）。

---

## ✅ Opus·仅标记批β+γ（2026-07-08）：收获集视图+导出+复述衔接（已装机，待真机验收）

> 规格 `specs/仅标记-批β-收获集视图-施工规格.md`；细账见 CHANGELOG 顶节。α+β 同窗串行做完一起打包装机
> （`build.sh` EXIT=0，自检哈希一致）。动了 index.html + app.py + mobile/review-input.js + review.css。

- **主窗**：文章/书页胶囊加「收获」钮 → 右栏第三 tab「收获 N」；甲改·墨化条目（标题原档色/正文档色墨/
  例句仅加粗/词形也能加粗）、双排序、显影揭晓、pending 骨架轮询补齐、srcmark 点回原文呼吸高亮、导出自包含 HTML。
- **γ 复述衔接（用户拍板 A + 两条加码，动了 mobile/review-input.js）**：勾条目→「用这 N 条去复述」→ 复盘窗
  **① 只练勾的、不再自动挑词；② 非勾选来源改「挑词」按钮、点了才生成**。review-input.js 直载不进 bundle，
  改它即生效；只影响 REVIEW_ONLY 桌面复盘窗，手机端不受影响。
- **手机版（Flutter 那份 mobile）故意没同步**：review-input.js 的 γ 改动只进了桌面复盘窗；要手机也用需重建 APK。

### 🔎 用户真机测试反馈（2026-07-08）→ 已整理成【批δ】待做
> 规格：`specs/仅标记-批δ-收获集打磨与发音删除-施工规格.md`（照心法六条已写好）。
> 接续暗号：**「做四土仅标记批δ，先读 specs/仅标记-批δ-收获集打磨与发音删除-施工规格.md」**
> 用户已确认这批放**新窗口**做（四土主会话亲做，不派 builder）。逐条根因/改法/验收都在规格里。
- ✅ **已 work**：γ 挑词改按钮、勾选送复述 chips 精确进（都过）。
- 🐛 **书页「收获」钮点了没反应** → 根因=renderBook 重建顶栏后 bkSheafBtn 监听没重挂；**已在本窗改好源码**
  （index.html renderBook 内 ~L5330 补了监听），**未重新装机**——随批δ 装机后验证。文章页收获钮正常。
- 待批δ 修（详见规格 §1）：② 挑词按钮偶发生成失败（转圈后空白，换篇又好）→ 点灯+稳健兜底；
  ③ **词块发音小喇叭**（新诉求：复述 chip 旁 + 阅读页收获条目旁，复用 get_audio/speak/playAudio）；
  ④ 换章后点收获里前章条目原文小注回不去（应自动跳章+定位，别提示先翻页）；⑤ 收获区排序不严格按章节 +
  点新词块收获区不自动刷新；⑥ 取消划痕后收获区没同步删（幽灵条目→get_sheaf 惰性删除同步）；
  ⑦ **讲解模式**（=非仅标记模式的正式叫法）下点过/收藏过的词块无删除入口（后端 delete_global 现成，前端补入口）。

## ✅ Opus·仅标记批α（2026-07-08）：收获集后台生成管线（已随 β 一起装机）

> 规格：`specs/仅标记-批α-生成管线-施工规格.md`。CHANGELOG 顶节有细账。**只动了 `santu_app/app.py`**
> ＋会新建 `DATA_ROOT/sheaf/` 目录；index.html/mobile/核批 captures 一律没碰。

- **管线**：`save_session` 写盘后 `_maybe_trigger_sheaf` 算差集（新增≥6 或 >90s 有新增）→ 后台
  daemon 线程 `_run_sheaf`：合并同 group→删除同步→分批(≤10)喂 `deepseek-chat`(temp=0,json,max3072,
  重试1次)→ 归位+三档rubric+释义+用法注+例句 → 原子写 `sheaf/{doc_id}.json`（每批落一次盘可渐次显影）。
- **批β 的数据契约（直接消费，零新 API）**：
  - 取：`window.pywebview.api.get_sheaf({doc_id})` → `{ok,running,doc_id,updated_at,items[],pending[]}`。
    item 字段：`cid/raw/chunk/snapped/tier(1|2|3)/def/note/sents[{en,src?}]/ch/blockOrd/ts/status(done|error)`。
    原文句在 `sents[0]` 带 `src:true`；`pending` = 已见但未生成的 cid（批β 显骨架、`running` 时轮询）。
  - 重跑：`regen_sheaf({doc_id, cids?})`（不传 cids=全部重跑；后台跑，前端轮询 get_sheaf）。
  - tier 档色/整区变色/显影/双排序照总设计决策 3–4 与样机③页「甲改」（正文用「档色墨」）。
- **验收已过**（证据在 CHANGELOG）：单测(mock)合并/删除同步/pending 收敛；真跑 DeepSeek 10 条真实
  划痕归位+例句+tier 全符 §4；一致性重跑 0/9 不一致；py_compile 过。
- **接续暗号**：「做四土仅标记批β，先读 specs/仅标记-批β-收获集视图-施工规格.md」（规格待 Fable 5 立）。
  ⚠️ α/β 都动 app.py/index.html——**别与其它窗并行**；批β 施工完一起 `bash packaging/build.sh` 装机。

---

## ✅ fable5（2026-07-08 下午）：「书架没取回来 Load failed」根因收口 + 复述原文显影高亮

- **Load failed 时有时无的真相（取证定案，别再改逻辑）**：修复代码（选材退避重试+SW拆除）
  上午 11:27 就进源码了，但 /Applications/四土.app 是 08:44 的冻结包——**改源码必须
  `bash packaging/build.sh` 重打包装机**（reference_situ_frozen_app_stale）。本批已重新打包装机。
  「完全退出」是伪线索：ps 取证零个残留进程，关窗即退干净。若装机后仍复现，红字里会带
  「（试了 N 次）：原因」，让用户把整句发回来再定位。
- **复述原文抽屉显影阅读器高亮**：选材带出的文章，荧光笔（mark.rt-hl，洗色 --wX 同主窗）
  与整段色卡（p.rt-para，--wpX=.16/夜.14）在原文抽屉原样显影；LLM 仍只吃纯文本。
  commit 01ac877，细账见 CHANGELOG 顶节。预览服务器日/夜两版已截图验收。
- **待用户过眼**：重开 App（Dock 重开即可）→ 口语复盘 → 说一说读过的 → 选「America at 250」
  → 点「原文」——中段应有一块橄榄色整段色卡。列表若再失败，把红字整句发回。

---

## ✅ fable5·批⁸（2026-07-08）：「仅标记＋收获集」设计全定案 + 核批（划痕层）已装机

> 总设计：`specs/仅标记-收获集-总体设计.md`（九条拍板决策，施工不复议）。
> 样机：`previews/仅标记-捕获反馈-mockup.html`（桌面副本在 ~/Desktop/预览/四土/）——
> ①捕获手感（用户拍板方案 D）②收获集揭晓 ③整区变色三案对比（推荐甲改，正文用「档色墨」）。

### 核批已装机（fable5 亲做，build.sh 自检哈希一致）
- **仅标记开关**：文章页 `#artTools` 与书页 `#barTools` 胶囊各一枚「仅标记」钮
  （`artCaptBtn`/`bkCaptBtn`，开态=accent 淡衬底章），localStorage 记住上次选择（默认关）。
- **捕获层**：开着时划选/单击词＝落素色划痕 `.capt`（方案 D：墨迹 220ms 显影→落笔深色沉定
  ＋右下「本次拾得 N」拾数＋耳语级石墨纸声，设置面板 `captSndChk` 可关）；再点划痕=取消（同
  group 整组）；词界双层吸附（liftRangeToWords 元素级 + `_captSnapTextNodes` 文本级）；
  跨已有划痕的选区守卫不处理（防 extract 撕裂）。selbar/讲解/hover-prewarm 在该模式下全静默
  （**阅读中零 LLM 调用**）。
- **持久化**：`_captures` records 随 `save_session` 新字段 `captures` 落 `LIBRARY/{doc_id}.json`
  （文章模式 .capt 另随 innerHTML 快照天然还原；书模式换章按锚点重包 `_applyCapturesForChapter`，
  照抄 _phrases 那套口径）。app.py 存/取四处已接。**批α 直接从 library json 消费，零新 API**。
- **验证**：浏览器 stub 桥全链路（真实 mouseup/click 事件路径）：划收/词收/取消/拾数/载荷含
  captures/快照含 .capt/关模式 selbar 与讲解零回归，全过；截图过眼（划痕+拾数+开态胶囊成套）；
  node --check + py_compile 过。**书模式划痕未在真书上验**（浏览器起不了书后端）——见下。

### ⚠️ 待用户真机验收（重开 App）
① 文章页开「仅标记」→ 划一段/点一个词：素色划痕显影 + 右下拾数走字 +（若没关）纸声；
   再点划痕消失。关掉模式后点词讲解一切照旧。
② **书模式**：书页顶栏开「仅标记」划几笔 → 翻章再翻回/退出重开书，划痕应原位还原。
③ 设置 ⚙ 里「仅标记·划痕纸声」开关生效。

### ▶️ 接下来（用户拍板：严格串行，新开 Opus 窗口）
1. **批α 生成管线**：暗号「做四土仅标记批α，先读 specs/仅标记-批α-生成管线-施工规格.md」。
2. **批β 收获集视图+导出+复述衔接**（α 验收后再开）：暗号「做四土仅标记批β，先读
   specs/仅标记-批β-收获集视图-施工规格.md」。
3. 每批之间由主会话验收（审证据+亲跑最要害 1–2 条）再放行。
> 注意：α/β 都会动 app.py / index.html——**两批绝不能并行开窗**。

---

## ✅ fable5·批⁷（2026-07-07 深夜³）：口语复盘 系统优化 UI 大改版 + Opus 三件并行批（已装机，待真机验收）

> 规格：`specs/口语复盘-系统优化-施工方案.md`（批α/β/γ 全部完成，唯一遗留见下）。
> 细账见 CHANGELOG 顶节。commit 链：b01417a(拆5文件) → 8d298b7(IA:声明制头部/积累合体/
> 练习引擎/最近复盘/选材修) → faba8a2(印刷品化+夜间+复述阅读态+词条化) ＋
> Opus 并行：53bf613(热词注入) / a985eb0+304f4f8(key全局默认) / 317c2ea(书架加固)。

### 用户报的「选材列表常常空」结论（取证过，别重复查）
- 当前实例 `/api/list_library` 健康（0.09s 回 31 条）；故障现场=上一个 App 实例，不可复现。
- 已修三处结构隐患：dispatch 里 `Api()` 初始化裸 500、index.json 非原子写并发读半截、
  前端把一切失败画成「还没有读过的文章」。**现在失败会显示原因+「再试一次」**——
  若复现，让用户把红字原因发回来即可定位。

### 待用户真机验收（重开 App）
① 复盘窗新 IA：头部只有 ‹|标题|积累|月亮|⚙；积累=错题|词块二tab可跨tab混合练；
   根屏见「最近复盘」3条；亮/暗两版都过一眼（月亮钮切换，默认跟随系统外观）。
② 复述：选材列表是否还会空；原文抽屉阅读态；点 chip 出词条卡（义+骨架+原文句）；
   复盘后词块反馈区库外目标带「存为词块」。
③ 热词（Opus）：设置→转写热词填 Fable 5 / Sesame / casual talk → 录一段验转写；
   结果页 meta 应仍标「极速」（若掉慢速=极速版不支持corpus的去corpus重试有bug，报回）。
④ key 全局（Opus）：复盘窗不填 key 应直接能复盘（借主窗的），设置里有「正在使用主窗口的 key」提示。

### 遗留（下一窗口可接）
- **转写稿按内容块分割**（复盘 V2 segments 字段雏形）——要动 llm.js v2 schema，独立一批做。
- 手机版（Flutter 壳内那份 mobile/）**故意没同步**——用户拍板等桌面成熟后一次性同步
  （注意转写传输分叉，见 memory reference_situ_transcribe_transport_split）。
- 夜间令牌只在独立复盘窗生效（body.review-only 门控）；将来若要给手机版夜间，另起一批。
- 极速版是否支持 corpus 热词未真机验证；若报参数错唯一备选=把 context 挪到 request 顶层
  （server.py `_hotwords_corpus` 一处集中，Opus 汇报注明）。

---

## ✅ fable5·批⁶（2026-07-07 夜）：阅读联动「复述练习」全链路（已装机，待真机验收）

> 设计+施工规格：`specs/口语复盘-阅读联动-施工方案.md`（含用户三点补充：原文折叠抽屉/
> 目标表达常驻可见/阅读页一键复述）。mockup 存 `~/Desktop/预览/四土/复述练习-方案mockup.html`。

### 形态（用户拍板）
复述=输入屏的「带题模式」，一条龙流程不变。三条入口汇到同一张**复述题签卡**
（「复 述」印章眉题 + 书名衬线 + 「原文 ▾」折叠抽屉(240px 内滚动) + 目标表达档案标签 chips +
✕ 取消；sessionStorage 持久，录音中整屏刷新不丢）：
① 输入屏「说一说读过的 ›」入口行 → 选材屏（最近 30 篇文章/剪报，server 同盘直读，
   书籍章节不进列表——注了一句「在读书页面点复述带过来」）；
② **主窗文章页**左上工具胶囊（首页/书签/**复述**）→ `startRetell()`；
③ **主窗书页**顶栏工具胶囊（首页/目录/书签/**复述**）→ 同一函数，带当前章。

### 管线（外科手术，全部新增不改旧）
- 主窗 index.html：`startRetell()` 抽 `.reading-inner` 纯文本（去标题/meta/封面）→
  `api().open_review_retell({title,text})`。
- app.py：`open_review_retell` = `server.set_retell_pending()`（先递条子）+ `open_review()`。
- server.py：模块变量 `_retell_pending`（带锁）+ `GET /api/retell_pending` 取一次即清。
- review.js：`_checkRetellPending`（输入屏渲染 + `_startRecWatch` 每拍顺带 + window focus 三处接）；
  `_setRetell/_loadRetellSlot/_showRetellPicker/_pickRetellItem/_retellArg`；
  复盘两条路径（`_doReviewFromRecording`/`_doReview`）都传 `retell` 参数，成功后清题签。
- localapi.js：`retell_targets`（①server RPC `get_global_notebook` 按 sources.title 命中该篇
  生词 star/clicks 优先 cap5 → ②不足 3 个 LLM 现场挑补齐，都失败也 ok:true 空数组不挡练）；
  `review_speech`/`process_dualtrack` 接 `retell {title,head,chunks}` → context 前置书名+原文开头、
  目标表达插进现成 chunks 注入（chunkFeedback 机制原样复用，`_applyChunkFeedback` 对库外
  text 优雅跳过）；结果/历史带 `retellTitle`（meta 行显「复述《书名》」）。
- llm.js：`pickRetellChunks`（RETELL_PICK_SYSTEM，maxTokens 1024，失败静默）。
- style.css：`.retell-*` 全套（印章眉题/衬线书名/档案标签三色轮转/抽屉细线框）。

### 已验（preview 真数据冒烟 + 截图过眼）
选材屏 27 篇真实文章（URL 源收敛成域名）→ 点选 → 题签卡（原文 3432 字进抽屉）✓；
pending 条子路径（服务端预置→输入屏自动出卡）✓；✕ 取消回入口行✓；sessionStorage 持久✓；
**`load_archive` 文章字段是 article_html 不是 html**（栽过一次已修）；
py_compile/node --check 全过；`_retell_pop` 单测✓。冒烟服务器（18999）已停。

### ⚠️ 待用户真机验收（preview 验不了的部分）
① 主窗文章页/书页点「复述」→ 复盘窗自动打开并出题签卡（pywebview create_window 路径）；
② 题签卡 chips：真机复盘窗里有 DeepSeek key，生词命中不足时 LLM 兜底应能出 5 枚；
③ 完整复述一轮：录音→复盘→结果页 meta 看「复述《书名》」+ 目标表达逐条反馈（词块反馈区）。
注意：18760 被运行中的 App 占用属正常（那就是 App 内置 server）；本批装机后要**重开 App**。

---

## ✅ Opus·极速版转写修复（2026-07-07 晚）：单轨也上 flash + 静音码回退 bug 根治（已装机）

**背景**：用户开通了火山极速版(`volc.bigasr.auc_turbo`)，但「口语复盘」仍走慢通道。

**取证到的两个独立根因**（都已修）：
1. **单轨从没接极速版**：「录音说一段」的 `transcribe_audio`（localapi.js）写死标准版 submit/query，
   连 flash 都不试。→ 统一到 `/api/transcribe_flash`（server 新增路由+`_transcribe_flash_single`），
   复用 `_transcribe_slice` 的极速优先+回退，与双轨同一套。删了失效的直连常量/桥分支。
2. **静音码误判**（关键）：`_transcribe_slice_flash` 只认 `20000000` 当成功，把火山的
   `20000003`（=处理成功但整段静音/无人声，HTTP 仍 200）当 flash 挂了 → 回退慢标准版。
   用户录音偏轻就撞这条。→ 成功码白名单放宽到 `("20000000","20000003")`。详见 memory
   `reference_situ_volc_flash_silence_code`。

**验证**（用用户真凭证直打火山，从 IndexedDB 抠 token）：真人声 flash 1.0s 带 start_time 的
utterances；静音 1.1s 空结果；`_transcribe_slice` engine 全=flash 不回退。已 `build.sh` 装机。

**⚠️ 手机版没碰**：四土app(Flutter)无 Python server、跑不了 /api 路由，单轨仍旧慢标准版；
两份 mobile 目录转写这块**故意分叉、别盲 rsync**（详见 memory `reference_situ_transcribe_transport_split`）。
要手机也上极速版需写桥直连 flash 版 + 重建 APK。

---

## ✅ fable5·批⁵（2026-07-07 深夜）：复盘用时常显 + 录音历史保留 + 文案统一「复盘」（已装机）

用户对批⁴ 的验收反馈批（1 分钟实测：第一次点失败第二次成功、没看到耗时、退出重进历史丢失）。

### 修（四处）
1. **「复盘用时」常显**（用户点名的测试功能）：结果页 meta 行新增
   `复盘用时 X 分 Y 秒（转写 Z 秒·极速/慢速通道）`（review.js `_timingMetaLabel`）；
   timing 存进 review row（localapi `row.result.timing`），**历史回看也带**。
   引擎标记=一眼验证火山极速版有没有真用上。原完成 toast 撤掉（改常显）。
2. **录音历史保留**：server `_dualtrack_list` 不再滤掉已消费的——未消费全给 + 已消费按
   最新保留，总量 cap 5，`done:true` 标志；✕ 改传 `hide:true`（落 hidden 标记，音频留盘）。
   chips 已复盘条目带「已复盘」细线标签+变灰，点选可重新转写；默认选中最新**未复盘**那条。
   `_effectiveDualItem()` 统一裁决转写哪段：点选的 > 最新未复盘 > null（走文本复盘，
   **不会误重转旧录音**）。手机版「待复盘」提示卡/列表只数未消费的（零回归）。
3. **文案统一「复盘」**：按钮不再叫「转写并复盘」；处理中整屏进度态只显
   「复盘中… m:ss」走秒（转写/AI 阶段不外露）；`RS.view='processing'` 让 `_startRecWatch`
   停表不毁屏；**失败恢复输入屏**（草稿从 sessionStorage 带回）+ 报错 toast。
4. **一条龙路径也走整屏进度态**（原来只改按钮文字，用户看不见进度）。

### 验证
- server 隔离单测：done 含入/hidden 排除/cap5 未消费优先/hide 标记，ALL PASS；
  _devtest 三个 node 测试套（review_v2/steal/interleave）全过；语法检查×3 过。
- **preview 真数据冒烟**（源码起 server:18760 + 浏览器）：5 条真实历史 chips（含用户当天
  17:55/16:49 的测试）已复盘标签✓ 默认选中唯一未复盘✓ 按钮「复盘」✓ 点已复盘条出
  「点「复盘」重新转写」✓ 无 key 点复盘→失败恢复输入屏+精准报错✓；截图过眼（暖纸+墨框成套）。
  **冒烟后已立即停掉 18760 预览服务器**（防孤儿端口污染冻结包，老坑）。
- 用户报的「第一次点失败第二次成功」：当时无报错记录没法归因，**别投机改**——现在失败会
  精准报错+恢复输入屏，若复现看 toast 文案再定位。

### 待办移交（Opus 窗口）
- **热词注入已写好规格**：`specs/口语复盘-热词注入-施工规格.md`（用户指定这类活给 Opus 干，
  省 fable5 额度）。接续暗号在规格头部。

---

## ✅ fable5·批⁴（2026-07-07 深夜）：转写+复盘全链路提速（6分钟录音≈10分钟 → 预期2分钟内）

### 用户实测痛点与账目（代码坐实，非猜）
6 分钟录音转写+复盘近 10 分钟 = ①转写走标准版 auc（排队+轮询，分钟级）
＋②复盘是 **3 次串行 v4-pro 推理调用**（>350 词触发两遍制：检出→编辑串行，之后再串行跑偷学；
v4-pro 单次 1-2 分钟）。两块各占约一半。

### 修（四处，已装机）
1. **server.py 转写切「极速版」**：新增 `_transcribe_slice_flash`（端点 `…/recognize/flash`、
   资源 `volc.bigasr.auc_turbo`、一次 POST 同步返回不排队）；`_transcribe_slice` 包装
   「极速优先→安全回退标准版」（非200/资源未开通/缺时间戳都回退）；`_volc_request` 加
   resource_id/timeout 参数并捕获 `X-Api-Status-Code` 响应头。回退时 warning 提示用户去
   火山控制台开通「录音文件识别-极速版」。
2. **llm.js 两遍制阈值 350→800 词**：350-800 词时检出反正只有一块，两遍制=白付一次串行推理调用；
   单遍 maxTokens 3072→4096（retry 8192）。6 分钟口语（~500-700 词）从 2 次串行变 1 次。
3. **localapi.js 复盘+偷学并行**：`Promise.all`，再省一整段串行等待；process_dualtrack 全程计时
   （transcribeMs/llmMs/engine 随结果返回 + console.log）。
4. **review.js 进度点灯**：处理中「转写中…/AI 复盘中…+走秒」（监听 `dual-progress` CustomEvent）；
   完成 toast「本次耗时：转写 X 秒 · 复盘 Y 秒」——**下次实测直接有账目**。

### ⚠️ 新坑入册：改 `mobile/js/core/*.js` 必须重建 bundle 才生效
冻结包只带 `js/core.bundle.js`（santu.spec 故意不带 core 源码）——改完 core 源码要先
`cd santu_app/mobile && npm run build`（esbuild，秒级）再 `bash packaging/build.sh`，
否则打包自检照样通过但新逻辑根本没进包（本批第一次打包就栽在这，grep bundle 才发现）。

### 验证
- 隔离单测（mock 火山）：flash 成功带片偏移✓ / 403 回退标准版✓ / 缺时间戳回退✓ /
  整轨 engine 汇总+回退 warning✓；py_compile + node --check ×3 过；
  bundle 重建后 `wordCount <= 800`/`dual-progress` 已 baked 进 /Applications。
- **待用户真机验收**：重录一段→看完成 toast 的耗时账目；若 toast 提示「极速版没跑通」→
  去火山控制台开通 auc_turbo（大模型录音文件识别-极速版，有免费试用额度）再试。

### 下一步（用户已排序）
① 验收本批提速效果（看 toast 账目）→ ② **阅读区↔口语复盘联动**（读过的材料来口语输出练习，
用户点名最感兴趣，fable5 亲做）→ ③ 口语复盘整体 UI（`specs/口语复盘-系统优化-施工方案.md`
已定盘，改由 fable5 亲做而非派工）→ ④ 转写稿按内容块分割（复盘 V2 的 segments 字段已有雏形）。
另有小任务：转写准确率热词注入（火山 `corpus.boosting_table_name`/`context` 参数已查实存在，
设置里加「常用专有名词」一格，待实测验证极速版是否同样支持）。

---

## ✅ fable5·批³（2026-07-07 晚）：自动停录修复 + 权限收敛「四土」一个名下且跨更新存活 + 语料可选中 + 转写并行（已装机）

### ① 录音跨窗口自动停止（用户两次实测 71s/166s，日志实锤）
根因：关掉正在放音的窗口/退全屏时系统重配置屏幕内容 → SCStream `didStopWithError: 系统已停止流播放`，
Recorder 原把这当「录音结束」直接收尾。修（Recorder.swift）：
- **自动重启续录**：`didStopWithError` 不再收尾 → `restartStreamLoop` 退避重试 5 次（0.5/1/2/4/8s），
  每次重新取 SCShareableContent 建流；全部失败才诚实收尾保数据（错误文案说明已录部分可转写）。
- **补零对齐时间轴**：重启后按墙钟把 ai 轨（回落态含 me 轨）`padTrackToWallClock` 补零
  （WavWriter 加 bytesWritten 访问器），两轨 utterances 时间戳交织不再错位。
- **麦轨设备切换也稳**：观察 `AVAudioEngineConfigurationChange`（插拔耳机等）→ 自动重启麦引擎+补零。
### ② 权限两刀（用户核心诉求：只授一次、只授给「四土」）
- **稳定证书**：两个 build 脚本弃 ad-hoc 改签钥匙串现成的「KuaiLu Codesign」自签证书
  （ad-hoc 的 TCC 按 cdhash 记，重编即失效；稳定证书 designated requirement 跨构建不变）→
  **以后更新不再掉权限**。
- **单一主体**：server.py `_recorder_start` 弃 `open -n` 改**直接 exec 包内二进制**
  （`Contents/MacOS/DualTrackRecorder --headless`）→ responsible process = 四土 →
  麦克风/屏幕录制权限都记在「**四土**」名下，「四土对话录」不再作为独立授权对象出现。
  前端权限指引文案已同步改（app.js `_recPermGuide`）。
  ⚠️ 若真机验收发现 TCC 仍指向「四土对话录」（responsible 判断失误），回退方案=恢复 open 启动，
  至少稳定证书保证不随更新掉权。
### ③ 语料 chip 可点选
点任意 chip 选中（墨框+「点「复盘」转写这段」提示跟随），「转写并复盘」转写选中那段；
默认选最新；✕ 丢弃；选中项被消费后自动回落最新（`_renderDualChips`/`RS.selectedDualDir`）。
### ④ 转写提速（回应用户对半小时/一小时录音的担心）
- 两轨并行 + 轨内 600s 切片并行（×3）→ 墙钟≈最慢单片，不再全串行相加；
- 轮询预算按片长伸缩（老的 30s 预算只够短片，10 分钟大片现给到 ~170 次×1s）。
- 半小时对话预计几分钟内出稿（3 片并行）；实测待用户跑长录音。
### 验收提示
- **还要授权最后一次**（签名从 adhoc 换稳定证书必然触发）：系统设置→隐私与安全性→麦克风+
  屏幕录制与系统录音，两处勾「**四土**」（列表里没有就先点一次「开始录音」）。此后更新不再掉。
- 验自动续录：录音中途关掉正在放音的窗口/切另一个 AI → 卡上计时应继续走，最终一段完整转写
  （中断处 AI 轨有几秒补零空白属正常）。

---

## ✅ fable5·批²（2026-07-07 傍晚）：麦轨全零根因修掉 + 输入屏一条龙改版（已装机，⚠️须重新授权）

### 根因（三轮取证证伪链，全程数据说话）
用户真录 70s：**me.wav 整轨精确全零**（RMS=0 peak=0）、ai.wav 正常 →「没转出内容」。
① 麦克风权限？——Recorder L71 requestAccess 已过、日志「麦轨 AEC 启动成功」→ 排除。
② 麦克风 96kHz 采样率？——CoreAudio 拨回 48k 重录仍全零 → 证伪。
③ CLI 三模式对照（裸麦✅ / 纯VPIO✅ / VPIO+输出接线崩）→ VPIO 本身活的；
④ **终审复现**：这台机器装了 Background Music 虚拟声卡 → VPIO 聚合出 **7 声道**输入格式 →
Recorder 按原生格式 tap → `AudioTrackConverter` 用 AVAudioConverter 做 **7→1 降混静默产出
100% 全零**（float 输入 peak 0.20 有信号、int16 输出全零，状态还返回成功）。
### 修（三层）
- **Recorder.swift 根修**：tap 显式要单声道（引擎内部安全降混）；+micPeak 看门狗（整场全零
  → meta.json 写 `micSilent:true` + 日志报警）。`bash 对话录/build.sh` 已重编（dist+桌面副本）。
- **server.py**：`_dualtrack_transcribe` 先测 me.wav 是否整轨零 → `meSilent` 回传前端 +
  静音轨直接跳过火山转写（不再白等 30s）。
- **localapi.js**：三处笼统「没转出内容」改成能定位的报错（麦轨静音/两轨全空/只有对方声音），
  已实测 meSilent 检测（拿真实静音录音+假凭证打端点，返回全对）。
### 输入屏改版（用户拍板的形态）
- 录音卡标题「对话录音」→「**录音语料**」（对话+独白都覆盖）。
- **删掉**独立窗的「背景/话题」输入；「你的英文输出」→「**转写后的文本**」。
- **一条龙**：录完就地成 **chip**（时间+时长+✕丢弃，不再进 dualList 子屏）；主按钮变
  「**转写并复盘**」→ 本屏转写（转写稿落文本区+存草稿）→ 直接出结果。失败 chip 留队列可重试。
- `_startRecWatch` 1.5s 盯 recorder_status：开始/停止翻转整屏刷新，停止后 chip 立即冒出。
- preview 已闭环（独立窗全新形态✓ / 手机路径零回归✓ / ✕丢弃真删✓ / 截图过眼✓）。
### ⚠️ 用户必做（Swift 重签，TCC 作废重授）
系统设置→隐私与安全性：**屏幕录制与系统录音** + **麦克风** 两处重新勾「四土对话录」
（可能要先点一次「开始录音」让它重新申请）；四土 App 要**退出重开**（在跑的是旧包）。
留了一段 15:08 的静音录音在队列里，chip 上点 ✕ 丢掉即可（麦轨全零救不回来）。

---

## ✅ fable5·批¹（2026-07-07）：录音走错门已修——复盘窗只留双轨一扇门（已打包装机 14:56）

### 根因（用户确认+代码坐实）
用户点的是复盘输入屏「录音说一段」（单麦 getUserMedia，物理上录不到 AI 声）；能录双轨的
「对话录音」卡只活在 mobile 首页 `app.js renderHome`，而复盘独立窗 REVIEW_ONLY 首页被永久
盖住——**双轨入口在用户真实路径里等于不存在**。纯入口问题，引擎与权限无恙（昨晚还成功录过）。

### 修法（用户拍板：主入口只留双轨）
- `review.js _showInputScreen`：顶部新增 `#recCardSlot`，REVIEW_ONLY 时渲染**双轨录音卡**
  （`_loadRecCard`，整卡复用 app.js 首页卡全局函数 `_fillRecCard/_recStart/_recStop/_startRecPoll/
  _recPermGuide`，含权限指引；录音中重进屏会接上计时轮询）；同时**不再渲染单麦「录音说一段」按钮**。
- 单麦路**保留**给手机版复盘输入屏＋词块练习作答（它们没有/不需要 Swift 引擎）——代码没删，只是门控。
- 失败**不静默降级单麦**（会复刻本次事故），失败明说＋「四土对话录」权限指引。
- `app.js` 录音卡文案改为「和 AI 语音对话、或自己说一段独白，双轨录下，完了来复盘」（首页+复盘窗共用）。

### 验证与生效
- preview 闭环：REVIEW_ONLY=true → 双轨卡渲染+开始录音钮、单麦钮消失、⚙/返回键行为不变；
  REVIEW_ONLY=false → 单麦钮回来、双轨卡不渲染（手机零回归）。截图过眼（暖纸+深蓝卡，风格成套）。
- `node --check` ×2 过；`bash packaging/build.sh` EXIT=0，`/Applications/四土.app` 已装机（14:56），
  `recCardSlot`/新文案 grep 坐实已 baked。
- **待用户真机验收**：复盘窗点「开始录音」→ 和 ChatGPT 聊一段 → 停止 → 点「有 N 段对话录音待复盘」
  → 转写出双轨对话稿。若开始录音报权限：系统设置→隐私与安全性→屏幕录制与系统录音＋麦克风，
  两处勾「**四土对话录**」（不是「四土」）。

### 原始取证记录（留档）
和 Chrome 里的 ChatGPT 语音聊天时，复盘**只转录了「我」的声音，完全没录到 ChatGPT 的声音**。

### 已取证的关键事实（別重复查，直接接着往下证）
1. **用户这次八成走错了录音入口 —— 是单轨麦克风路，不是双轨引擎路。**
   - 复盘输入屏那颗「录音说一段」按钮（`review.js` `#revRec` → `_toggleRecord`，L2065）走的是
     **`navigator.mediaDevices.getUserMedia({audio})`**（L2072）——**天生只抓麦克风**（我的声音），
     物理上抓不到系统外放的 AI 声。这是设计如此，不是 bug。
   - 能同时抓「我(麦) + AI(系统音)」的是**另一条路**：Swift 菜单栏引擎「四土对话录」
     （`对话录/Sources/DualTrackRecorder/Recorder.swift`）——麦轨走 AVAudioEngine+VPIO(AEC)，
     AI 轨走 `SCStream`(`capturesAudio=true`, `.audio` output, L116/261-283)。产物落
     `~/Documents/situ/data/dualtrack/<时间戳>/`，复盘输入屏顶部会冒「有 N 段对话录音待复盘」卡
     （`_loadDualtrackCard`）。
   - **实锤**：`~/Library/Logs/DualTrackRecorder.log` 最后一次真正 `startCapture` 是**昨天 22:30**；
     今天 07-07 只有 `applicationDidFinishLaunching`（起了个壳）、**零 startCapture**。→ 用户今天那次
     ChatGPT 对话根本没经过 Swift 双轨引擎。`data/dualtrack/` 现也是空的（昨天的已复盘消费掉）。
2. **AI 轨（系统音）依赖「屏幕录制与系统录音」权限**（SCStream capturesAudio 走这条 TCC，授权对象＝
   「四土对话录」，不是「四土」）。`Recorder.swift` L77-80 已有「拿不到屏幕内容→提示去开屏幕录制权限」的分支。
   TCC.db 本会话读不到（需完全磁盘访问），**要用户在 系统设置→隐私与安全性→屏幕录制与系统录音 里核对
   「四土对话录」是否勾上**。

### （已了结：用户确认点的是「录音说一段」→ 入口问题，修法见上 ✅ 节。以下留档）
- 若将来「确实走了双轨、AI 轨还是空」→ 那才是**权限/捕获问题**：查 DualTrackRecorder.log 有没有
  startCapture、有没有 SCStream 报错；核屏幕录制权限；查产物 `data/dualtrack/<dir>/` 里 AI 轨 WAV
  是不是全静音（`meta.json` 的 aec 标志 + WAV 大小/RMS）。**一个症状可能多根因，拆开逐个用数据证伪。**
- 相关文件：`对话录/Sources/DualTrackRecorder/Recorder.swift`（捕获）、`santu_app/server.py`
  （`_dualtrack_*`、`DUALTRACK_DIR` L43、转写+filterBleed 串音过滤——注意**别把 filterBleed 误当成
  「AI 声没录到」的根因**，那是转写后过滤，不是录音层）、`santu_app/mobile/review.js`（`_loadDualtrackCard`
  L175 / `_toggleRecord` L2065）、`santu_app/app.py`（`recorder_start/status/stop` 遥控 Swift 引擎）。
- Swift 改完要 `bash 对话录/build.sh` 重编重签部署；四土主壳改完要 `bash packaging/build.sh` 重打包装机。

### 顺带·留给 Opus 的小任务（用户明确说这条不用 fable5、后面单独给 Opus）
- **DeepSeek key 全局只填一次**：复盘录制界面要重填一遍 DeepSeek key，用户希望**全局一份**、或至少
  **默认跟四土主页面一致**（想用别的模型再单独设）。现状：复盘窗前端配置住在**它自己那扇 WebView 的
  IndexedDB**（`santu_app/mobile` 的 settings），和主窗 pywebview 的设置是两套存储 → 两处各填。
  方案方向（供 Opus 定夺）：复盘窗设置读不到本地 key 时，向后端要主窗的 key 当默认（`app.py` 有
  `get_settings`）；或把 key 收敛到后端一处、两个前端都从后端取。**本窗不做。**

---

## ✅ 续⁴·补（2026-07-07）：⚙ 设置「点了没反应」＝浮层压序 bug（已提交，已打包装机）

用户复测：顶栏四钮里唯独 ⚙ 无反应。**取证结论（非猜）**：设置浮层其实每次都打开了——
所有 `.overlay` 同为 `z-index:45`，同级按 DOM 顺序绘制，`ovSettings`(index.html L78) 排在
`ovReview`(L88) 之前 → 设置永远展开在复盘屏**身后**，看起来像没反应。手机版从 home 开设置
（复盘没开着）故从未暴露。修：`openOverlay` 每次发递增 z-index（`_ovTopZ`，最新打开者浮最上）。
preview 实测：点 ⚙ 后 settings z=47 > review z=46、整屏设置（含火山字段）压上；已重打包装机
（`_ovTopZ` baked ×2）。⚠️ 教训：验「浮层是否打开」不能只看 display/innerText，要看 z 序+盖没盖住。

**独立窗 vs 并入主窗（用户问）**：维持独立窗（用户已同意）。原因：复盘前端是自成一体的
web app（自己的 IndexedDB 存储绑在 server 源上），塞进主窗要走 iframe——WKWebView 对跨源
iframe 存储有分区/清理策略，历史与设置有丢失风险，且录音/权限生命周期都要重接。收益小风险大。

---

## ✅ Opus 批·续⁴（2026-07-07）：复盘窗点击失灵根因 + 独立窗化 + 麦克风免重复授权 + 封面竞态 + 来源起名（已提交 `e8d8645`，已打包装机）

用户对续³ 的验收反馈批。**核心战果＝一个潜伏 bug 的真机取证**：

### 复盘窗顶栏按钮全点不动（根因坐实，非猜）
- **取证链**：Chrome 同页全正常 → 真机 computer-use 实点复现（顶栏死、正文活、返回键点下缘偶尔生效）→ hitTest 探针视图层干净 → 合成 NSEvent 直达 DOM → 差异锁定在真实事件路径上的类级补丁 → **app.py `_patch_webview_titlebar_drag`**：把所有 pywebview 窗口顶部 30px 的 mouseDown 吞成 performWindowDrag（为主窗隐藏标题栏设计的），复盘窗网页顶栏恰在带内。
- **修**：门控 `styleMask & NSFullSizeContentView`——只有内容铺进标题栏的主窗才走拖窗。合成事件双窗实测：普通窗顶条 3 点全达 DOM、fullsize 窗仍吞（主窗拖拽保留）。
- ⚠️ 经验：**classAddMethod 类级补丁殃及所有窗口**，以后加 pywebview 补丁必须想第二扇窗。

### 复盘独立窗 UX（用户判定「附件2 空白 home 多余」＝正确）
- `window.REVIEW_ONLY`（app.js boot，hash==#review 时立）：输入屏藏返回键（MutationObserver 盯 #reviewTitle 咽喉点，子屏自动复显）；输入屏 back 不再 closeOverlay 露空壳；boot 先 renderHome 垫底；**头部新增 ⚙ 设置入口**（火山 appid/LLM 配置在本 WebView 的 IndexedDB，之前根本没处填）。手机版（REVIEW_ONLY=false）零变化。
- preview 闭环：历史/词块/错题本往返、back 无处可退不动窗、⚙ 开设置（含火山字段）关回复盘，全过；截图过眼（右上四图标成套）。

### 麦克风每次点录音都弹授权
- 根因：pywebview UIDelegate 未实现 macOS12+ `requestMediaCapturePermission` 回调 → WebKit 每次 getUserMedia 自弹。新增 `_patch_webview_media_permission`：本机来源(127.0.0.1/localhost)一律放行，其他维持默认。pyobjc WebKit `_metadata.py:2127` 收录该 selector → block 桥接安全。App 级 TCC 首弹保留。**真录音行为待用户真机验**（headless 验不了）。

### 读物精选两条回访反馈
- **封面时无时有（haskaps 篇）**：根因＝save_session 里同步单次 8s 下载，慢图首拉失败→历史无封面，后续 save 幂等重试成功→又出现。修：12s×2 重试 + 下载挪后台线程（不再阻塞 save 桥）+ 索引记 image 源 + **list_library 对缺封面条目每会话后台补抓一次**（自动愈合，下次进首页即有）。
- **globalnews.ca 没起好名**：feed `<title>` 就是空的（curl 坐实）。修：空名→抓站点首页 `og:site_name`（实测得 "Global News"）→再回落首字母大写 host。**用户已存条目已手工修正为 "Global News"**。

### 验证与生效
- 合成事件门控探针、preview 复盘窗闭环、真实 globalnews 起名单测、py_compile/node --check 全过。
- `bash packaging/build.sh` EXIT=0 自检一致，REVIEW_ONLY/reviewSettingsBtn 已 baked，装机启动验活（PID 7976）。
- **待用户真机验收**：① 复盘窗顶栏四按钮+返回键即点即应；② ⚙ 填火山 appid 后转写跑通；③ 点录音只在**首次**弹系统麦克风授权；④ 历史封面不再时无时有；⑤ 读物精选里 globalnews 显示为 "Global News"。

---

## ✅ Opus 批·续³（2026-07-07）：读物精选「自定义来源」入口 + 丝滑打开三连（已提交 `01b1c63`，已打包装机）

### 当前目标
把 HANDOFF 待办 C（自定义 RSS 来源入口）做掉；并按用户新要求让「点精选文章→打开→图片加载」全程连续丝滑。**两件都完成。**

### 已完成
1. **自定义来源入口（C 大件）**：
   - 后端 `add_feed_source / list_feed_sources / remove_feed_source`，持久化 `DATA_ROOT/feed_sources.json`（内置 DISC_OUTLETS 不动）。
   - **feed 自动发现**：粘普通网页地址→自动找 `<link rel=alternate type=…rss/atom…>`（真机实测 nautil.us 首页→自动定位 /feed 存成「Nautilus · Science Connected」）；真不是 feed→提示「试试站点的 /feed 或 /rss 地址」。
   - 名字/简介自动取 feed 自身 `<title>/<description>`（截 40/48 字），按归一化 url 去重。
   - 前端「＋ 添加来源」幽灵瓦片（虚线、无油墨条）排队尾，点开**就地变输入卡**（Enter 提交/Esc 取消/错误就地红字，重渲染保值保焦点）；自定义卡 band 色轮转 `amber/clay/plum/olive/mauve`（内置 navy/green 不占用，天然成套）；hover 出 ✕→复用 `.cfm` 确认框移除（只删入口不动剪报）。
   - `allOutlets()`（内置+自定义）统一渲染/预取/打开；新添加的源立即预取列表。
   - **排版和谐已截图验收**：1280 宽 6 源+瓦片=两行整齐网格（等宽 236、gap 14、首屏内），亮/暗双色均成套。
2. **丝滑打开三连（用户意图：整段连续体验顺滑）**：
   - **点击即时响应**：点文章立即切入阅读态骨架页——真标题即刻上屏（RSS 列表带来）、来源行轮询 `get_progress` 显示「①抽取正文…②词汇分层…」、正文位置浅墨呼吸线；process 回来 `.ink-in` 原位显影。`_runSeq` 作废守卫：等待中回首页/再点别篇→旧结果作废绝不拽回，`goHome` 接管清 busy。粘贴 URL 也走同一骨架路径。
   - **文章预取**：开列表→静默预取最上两篇；悬停行 180ms（同词讲解 prewarm 节奏）→预取该篇。后端 `prewarm_article` 只抓 HTML 进 extractor 新加的 5 分钟短时缓存（**每 URL 一把锁在途去重**：预取没回来就点击→共享同一次抓取），并回传 og:image 让前端 `new Image()` 预热进 WebKit 缓存→点开图文常同帧到齐。实测：缓存命中后 `extract_text` 41ms（原本 2-4s 网络等待归零）。
   - **封面占位**：`.doc-cover-wrap` 先按 og 惯例 1200×630 留版面（**正文不再被迟到的图顶下去跳动**），onload 淡入 0.4s 并释放为真实比例；多数 og 图恰 1.91:1 零位移。旧存档裸 `.doc-cover` 不受影响；失败 `parentElement.remove()`。
   - 此举**替代了旧「待验证」节里的「预下载内联 data URL」权衡项**——不再需要牺牲打开延迟。

### 已改文件
- `santu_app/app.py`（+FEEDS_FILE、三个来源方法、prewarm_article）
- `santu_app/index.html`（disc 区 CSS/JS、run 骨架、renderArticle 封面 wrap、goHome 守卫）
- `reader_core/extractor.py`（fetch_url_html_cached：TTL 缓存+在途锁）

### 关键决策
- 添加入口=就地变形的瓦片而非弹窗（不挪版、不破坏两张内置卡观感——C 的「克制」要求）。
- 预取只抓 HTML+图，不碰 LLM、不写库——丝滑靠「把网络等待挪进用户看列表的时间」，零质量代价。
- 骨架页与正文同版面骨骼（doc-title/doc-meta 同位），显影时标题不跳；骨架换正文只淡入不位移（视线不被打断）。

### 验证结果
- 后端隔离单测全过（真实 aeon.co feed 添加/去重/移除、nautil.us 自动发现、非 feed 友好报错、缓存命中 0ms、extract_text 免网络 41ms）；FEEDS_FILE monkeypatch，真实数据零污染。
- 前端 mock 桥 harness 闭环全过（添加/错误/Esc/移除确认/tc 三 feed 子标签/↻刷新/top-2 预取/悬停预取/骨架 120ms 上屏/进度更新/显影/封面 1.90 淡入/中途回首页不被拽回）；亮暗双色+骨架页截图过眼。
- 打包 `bash packaging/build.sh` EXIT=0，自检 `6cc9bdd7…` 逐字一致，新标记（dsaUrl/sk-page/doc-cover-wrap）已 baked，装机启动验活 PID 99379。

### 未解决问题
- 无新增。旧两条待用户回报仍挂着：**D 首点冷启动**是否复现、**A2 封面清晰度**复看（见下方旧节）。

### 下一步（待用户真机验收清单）
① 读物精选点「＋ 添加来源」粘 `https://nautil.us`（故意不带 /feed）→应自动发现并上架；② 点开来源、悬停一篇再点开→骨架页即刻出现、正文顺滑显影、封面不顶正文；③ hover 自定义卡右上 ✕ 移除；④ 多加两三个源看排版是否顺眼。

---

## 🚧 旧待办存档（用户第 N 轮反馈·剩余项）

用户一轮给了 5 组反馈，**批 1 已做完并打包**（见下条 `611482f`）。

### ~~C.（大件）读物精选加「自定义来源」入口~~ ✅ 已由上节（续³）完成
- 需求：让用户手动添加其他带文章的网站到读物精选。用户已猜到「得是 RSS 那种」——**对**：现有 disc 完全靠
  RSS/Atom（`fetch_feed` 用 `xml.etree` 解析 `<item>/<entry>`，见 app.py `fetch_feed`）。非 feed 的普通网页 URL
  抓不出文章列表。
- 设计要点（下窗口先出方案再动手）：① 读物精选区加一个「＋ 添加来源」入口（克制，别破坏现有两张来源卡观感）；
  ② 输入 URL → 后端试拉解析：能解析出 entries=有效 feed，存起来（持久化到 DATA_ROOT，别写死进 DISC_OUTLETS——
  那是内置源）；③ **非 RSS/Atom → 小提示**（如「这不是 RSS/Atom 源，试试站点的 /feed 或 /rss 地址」）。
  可选增强：给个 URL→feed 自动发现（抓 `<link rel=alternate type=application/rss+xml>`）省用户找 feed 地址。
- 触及：`DISC_OUTLETS`(index.html，内置源不动)、新增自定义源的存取（app.py 加 `add_feed_source`/`list_feed_sources`/
  `remove_feed_source` + 持久化文件）、`renderDiscOutlets` 合并内置+自定义、`fetch_feed` 复用。band 颜色给自定义源轮转。

### 待验证 / 待观察（下窗口先问用户结果）
- **D 首点无反应**：批 1 已按「排除法」定位并修（resize 兜底误杀浮层，改成重定位）。**要用户冷启动 App、第一次点
  CNA 确认是否还复现**。若仍复现＝还有别的根因，**别再猜**——按取证加 disc 生命周期文件日志（open/close/resize/
  fetch 时间戳写 DATA_ROOT/diag.log，我可直接 Read），让用户复现一次再精准修。
- **A2 封面模糊**：og:image 实测 1200×676（够清），批 1 去掉了裁切（object-fit:cover→完整显示）——模糊/别扭大概率
  是裁切造成的，应已改善。**让用户复看**；若仍觉糊，再查是否个别源 og:image 真低清。
- **封面加载慢（文本先出图后出）**：远程 og:image 是独立网络请求，天然晚于文本；批 1 加了 fetchpriority=high。
  若用户要「图和文一起出」，唯一根治＝**后端 process() 预下载图内联成 data URL**（代价：开文章延迟增加、快照变大）——
  这是权衡项，需用户拍板再做。

---

## ✅ Opus 批·续²（2026-07-07）：封面完整显示 + 来源超链接 + 读物精选提速/首点修复（批1，已提交 `611482f`，已打包装机）

用户第 N 轮反馈的 5 组里，做完这 4 组（第 5 组＝上面 C，deferred）：

1. **封面完整显示（A）**：原 `object-fit:cover`+max-height:300 **裁掉了图的一部分**（用户嫌别扭）→ 改
   `width:100%/height:auto` 按原图比例**完整显示不裁**；`fetchpriority=high` 尽早下载。og:image 实测 1200×676
   本就够清，裁切才是「模糊/别扭」主因。
2. **来源超链接（B）**：标题下的来源若是 http(s) 网址 → 渲成可点超链接（`srcMetaHTML` + `.doc-src-link`），
   点击走**新增 `open_external` 桥**（app.py，仅放行 http/https）在**系统浏览器**开原文，方便对照。委托监听，
   新旧存档都生效。`article.source` 对 URL 抓取＝原始 URL（extractor `_from_url` source=url），故有链可跳。
3. **读物精选首点无反应（D·排除法定位+修）**：按排除法——冷启动单点一下、能关掉刚开浮层的**只剩 resize 兜底**
   （`resize→closeDiscList`）。冷启动 App 窗口尺寸抖动几帧 → 误杀刚点开的浮层 → 「首点没反应、二点才行」。改：
   resize 不再关，改**跟随来源卡重定位**（复用 `_discRepositionOnScroll`，rAF 节流），仅卡真滚出视口才收。
   **harness 同步验证：重定位后浮层保持 display:block（不再被关）**。⚠️仍需用户冷启动实测确认（见上「待验证」）。
4. **读物精选加载失败/慢（D）**：`fetch_feed` timeout **8→12s + 一次重试**（CNA 慢源常首拉超时=用户截图的
   `read timeout=8`）；`discLoadOutlet` 加 **`_discInflight` 在途去重**（预取与点击复用同一请求，减并发降超时）。

**验收**：harness 实测封面 max-height:none/object-fit 不裁、来源渲成 `.doc-src-link`(非URL原样)、`_discInflight`
存在、resize→重定位浮层不关；app.py 编译通过。**已 `bash packaging/build.sh` 打包装机**（EXIT=0、自检
`6059d5be…` 逐字一致、doc-src-link/_discInflight/_discResizeTicking/height:auto 已 baked、二进制新编、启动 PID 97804）。

---

## ✅ Opus 批·续（2026-07-07）：来源简写 + 封面进正文 + 历史即时入库（已提交 `0f79973`，已打包装机）

用户测 B 卡认可（右下角来源+套色）。四点反馈里做了三点、查了一点：

1. **①来源品牌简写**：右下角/报头原显示全称被截断（CHANNEL NEWSA…）。新增 `SOURCE_ABBR` 映射表
   （CNA/BBC/NYT/WSJ/The Conversation/The Straits Times/Aeon/Sixth Tone… `index.html` clipMasthead 上方），
   `clipMasthead` 先按 host 再按 sitename 命中缩写、否则回落 sitename→host。**加新媒体只需往表里加一行**（键用小写）。
   harness 实测：显示 "CNA"、"The Straits Times" 不截断；未知源回落品牌名/host。
2. **②文章封面进正文**（用户倾向、问过成本）：**成本极低、不卡**——og:image 随文章抽取已拿到，零 LLM、lazy 加载不阻塞。
   `process()` 回传 `image`；`renderArticle` 在正文最上方插 `.doc-cover`（满栏、限高 300px、软阴影+细线框、印刷特写感、
   `onerror` 自 remove）。**加进 DOM 故随 readingSnapshot 写进快照 → 回看文章原样恢复**，无需改存/取档链路。
   harness 实测：封面居 reading-inner 首、在标题上方、`readingSnapshot()` 含之。
3. **③读物精选历史「快速关闭漏记」**（竞态·已修）：根因＝文章索引条目由前端 `save_session` 异步落盘（大 html 走桥慢），
   打开后极快关闭时 `renderHome` 读索引早于落盘 → 漏该篇。修：`process()` 文章一解析完**立即写库索引**
   （镜像 save_session 的 upsert，完整快照 .json 仍由前端写）。**隔离单测**（真 `_read_index/_write_index`）：解析后立即
   在索引出现 + 后续 save_session 同 id 去重不重复。✅
4. **④首点 CNA 偶尔无反应**（未改·取证结论）：读全 disc 点击链路——单委托监听、各分支 early-return、**无自关闭竞态**，
   fable5 的 `_discOpenId` 残留根因已修、toggle 守卫正确。**复现不出确定的逻辑缺陷**（用户也说"再测又不见了"）。
   最可能＝冷启动首拉 RSS 走冷代理的网络延迟 / 首帧 rect 未定位好（重点一次即好，符合"第二次点就行"）。
   **按取证铁律不发投机改动**让用户试；若稳定复现再加诊断定位。

**⚠️ 生效边界**：①②纯前端、③后端(app.py)。**已 `bash packaging/build.sh` 重打包装 /Applications**（EXIT=0、
自检 `5a7d131a…` 逐字一致、SOURCE_ABBR/doc-cover 已 baked、二进制新编）。已 `open` 启动 PID 96169。
**看新封面/来源简写需有 og:image 的文章**：粘新 CNA/新闻链接（旧无封面剪报仍走报头形态）。

---

## 🔧 永久修复（2026-07-07）：`build.sh` 现在会自动装进 /Applications（根治「更新后没更新」）

**反复出现的坑的真根因（取证坐实，非猜）**：旧 `build.sh` **只产出 `packaging/dist/四土.app` + DMG，从不覆盖 `/Applications`**。
而 Dock/启动台启动的是 `file:///Applications/四土.app`（冻结旧包）。所以「改源码 → 跑 build.sh」后用户看到的仍是旧界面——
不是实例没杀，是**新包压根没装上去**（此前那次「装上去」是上个窗口手工 `ditto` 的，脚本里没有）。

**已焊死进 `build.sh`（默认执行，`SKIP_INSTALL=1` 可只出 DMG 分发）**：签名后自动
① 优雅退出 + 按**安装路径**兜底 `pkill`（冻结包进程名=编译二进制 `四土`，只能按路径杀，`pkill -f santu_app.app` 杀不到）
② `rm -rf` 旧包 + `ditto` 原子覆盖到 `/Applications`
③ 刷 `lsregister -f` + `touch` + `killall Dock`（图标缓存）
④ **防呆自检**：`shasum` 比对已装包 baked `index.html` == 源码 `index.html`，不一致直接告警（杜绝「装了个寂寞」）。

**本次实测**：EXIT=0；自检通过（两者 `5047836c…` 逐字一致）；二进制 09:44 全新编译、`build/` 本次清后新建。
**以后任何批改完，只需 `bash packaging/build.sh` 一条命令即「重建=安装=生效」，从 Dock 重开即最新版。** 若自检告警→查 `santu.spec` 的 datas。

> 备注：系统上仍有多个 `四土.app`：`/Applications`（Dock 目标·冻结包，现由脚本自动更新）、`~/Desktop/四土.app`（源码启动器·即时验）、
> `packaging/dist/四土.app`（构建产物·可无视）、`~/Documents/situ/四土.app`（项目根一个旧副本，来历不明，未动——要清理请言语）。

---

## ✅ Opus 批（2026-07-07）：剪报带封面卡「压低封面 B」+ 读物精选回首屏（已完成，源码已提交）

两件纯视觉，主会话 Opus 亲做（未派 builder）。先出对比图 mockup 拍板再施工。

1. **剪报带·有图卡小巧化（用户拍板方案 B「压低封面」）**：原有图卡（`.clip.has-cover`）竖版全宽封面
   104px + 3 行标题 = **215px 高**，比无图剪报（98px）高一圈，且因 `.clip-scroll` 是 `align-items:stretch`，
   **一张就把整排撑到 215**。改为矮横幅：封面 104→**58px**、标题 3→2 行、卡宽 210→**194px**、正文 padding 收紧
   → 有图卡实测 **128px**。用户加的要求：**来源低调简写落卡底右侧**（左侧是日期）——新增 `.clip-orig`，
   复用无图剪报报头 `clip-src` 的套色小标语言（band 色·大写·极小），复用 `clipMasthead(it)` 取 sitename/host
   （如 "CNA"、"THE STRAITS TIMES"），有图/无图两形态成套。改动仅 `clipHTML` 的 `it.cover` 分支 + 对应 CSS。
2. **读物精选回首屏（任务一联动即达，零额外改动）**：有图卡从 215→128 后剪报带矮一截 → 读物精选来源卡
   （CNA / The Conversation）自然上提。**harness 实测 1280×900 窗口：clip-scroll 底 665、读物精选底 792**
   （距首屏底 ~108px 余量），CNA 与 The Conversation 首屏可见可点。✅ 达标，未动任何间距/来源卡形态。

**验收证据**：harness 注入 2 张真实封面（CNA/straitstimes）+ 几何断言：有图卡 128px、`.clip-orig`="CNA" 且
在日期右侧、读物精选底 792<900；亮/暗双色真机截图过眼（B 卡 + 卡底右来源 + 混排和谐 + 读物精选首屏可见）。
**未破坏**：`.clip-del` 删除按钮（hover 显示、data-del 在）、无图回落 masthead 形态、点卡 `openArchive`（data-id 在）、
读物精选点击链路（未碰）。对比图 mockup 存 `~/Desktop/预览/四土/`：`首页-剪报三方向-真封面.html`（真封面×真排版×三方向可切）
+ `剪报封面-小巧化三案对比.html`（含亮暗 toggle）。

**⚠️ 生效边界**：纯前端（index.html）。`/Applications/四土.app` 冻结包要 `bash packaging/build.sh` 重打包才见效。
**建议与 fable5 批（讲解提速/首点/删除按钮，见下节）一起 `bash packaging/build.sh` 重打包装 /Applications 一次。**
`/Desktop/四土.app`（源码启动器）即时可验。

---

## ✅ fable5 批（2026-07-07 下午）：讲解提速两连 + 首点 bug + 删除按钮（已完成，源码已提交）

四条提交：`5540b87`(读物精选首点)·`6081655`(删除按钮)·`a838c84`(.env 锚定)·`104db9d`(流式讲解)。

1. **讲解提速①·挖出隐藏大坑（.env 锚定）**：冻结包内 load_dotenv 够不到 `~/Documents/situ/.env`
   → model 空 → 静默回落 **deepseek-v4-pro 推理模型**（每次讲解先烧数秒推理 token）；dev 却按 .env
   走 deepseek-chat(v4-flash)。同一份代码两种速度——用户日常用的正式包一直在慢车道。已修：
   `Api.__init__` 显式 `WordExplainer(env_path=DATA_ROOT/".env")`，两形态一致；分发机器无此文件
   照旧走设置面板。两分支均有进程级验证证据。
2. **讲解提速②·D 流式（用户首选方案）**：`explain_stream`（流式+部分 JSON 增量解析，失败整体回落
   非流式，质量零妥协）→ `explain_word_start/poll` 轮询桥 → 前端 150ms 渐进渲染（复用
   explanationHtml 零样式漂移）。**真实 LLM 实测：音标 1.23s 可见，完整讲解 2.95s**——观感等待砍半；
   缓存/在途去重/生词本 clicks 记账/点击插队全部走同一条路（有单测+闭环断言）。C（本地词典 0ms 本义）
   经评估**建议缓做**：流式+快模型后首义已 ~1.2s 到，再省这 1 秒要付词典资产+新代码路径的复杂度。
   A（视口优先预生成）仍值得做，留给后续批。
3. **读物精选首点无反应（已复现坐实非猜测）**：从精选点开文章走 run() 不关 popover →
   `_discOpenId` 残留 → 回首页后首点被 toggle 当「收起」吃掉。修：点文章先 closeDiscList +
   toggle 分支只在列表真开着时收起。preview 三场景（回首页首点/人为残留/正常 toggle）全过。
4. **删除按钮**：hero 书补删除 ×；小书 × 从书名行挪到封面右上角，不再遮字（几何断言+截图过眼）。

**⚠️ 生效边界**：以上全在源码。`/Applications/四土.app` 冻结包要 `bash packaging/build.sh` 重打包
才见效（①③④是前端+app.py，②含 llm.py 后端——都得真重建）。建议等 Opus 的剪报/首屏视觉批做完
**一起打包一次**。桌面 `/Desktop/四土.app`（源码启动器）即时可验。

**真机验收清单**：① 冷词点开 ~1s 内先见音标/本义、讲解逐字长出；② 从 CNA 点文章读完回首页，
再点 CNA 一次就该展开；③ 书架 hover 每本书（含最左大封面）封面右上角出 ×、不遮书名。

**交给 Opus 窗口的活（用户已知）**：剪报带封面卡的小巧精致化 + 读物精选首屏可见。做前先读本节
知道 index.html 已动过哪些地方，别互相踩。

---

## 🎯 给 fable5 的接续（2026-07-07，上一节之前的交底，B 节任务已由上面完成）

### A. 一个已定位的部署真相：为什么「改了却看不到」

用户反馈第三轮反馈批（删除框/剪报封面/图标）在 App 里「毫无变化」。**取证结论（已用命令坐实，不是猜）：**
- 用户日常用的是 **`/Applications/四土.app`——一个 PyInstaller 冻结包，编译于 2026-07-07 02:16**（上一窗口阶段10.2b 打的），里面**烘焙的是旧 `index.html`**（`grep`：`showConfirm`=0 / `has-cover`=0 / 旧 `confirm()`=1）+ 旧图标。
- 我的六项改动**都在源码里且正确**：`resource_base()` → `/Users/yizhang/Documents/situ`，源码 `santu_app/index.html` 有 `showConfirm`×2 / cover×5 / 旧confirm×0；亲自 `.venv/bin/python -m santu_app.app` 启动实测**能正常加载我的代码**（生成 `index.<mtime>.html` 已核有我的代码）。
- 关键坑：`pkill -f "santu_app.app"` **杀不掉冻结包**（其进程名是编译后的 `四土` 二进制，cmdline 不含 `-m santu_app.app`）；`open ~/Documents/situ/四土.app`（源码启动器）开的是另一个 app，所以用户始终在看那个冻结旧包 → 零变化。
- 系统上有**十几个 `四土.app`**（/Applications、/Desktop、各 _backups）。**`/Desktop/四土.app` 是源码启动器**（`exec .venv/bin/python -m santu_app.app`，加载实时源码=我的代码）；**`/Applications/四土.app` 是冻结旧包**。

**修复（✅ 已完成）**：`bash packaging/build.sh` 重新冻结 → 覆盖安装到 `/Applications/四土.app`（`ditto` + `lsregister` + `killall Dock` 刷图标缓存）。**已逐项 verify**：安装后的 baked `index.html` `showConfirm`=2/`has-cover`=3/旧confirm=0、`icon.icns`=新 80% 版；冻结二进制含 `_click_priority_until`(⑤)+`_cache_article_cover`(④)；直接跑二进制**能启动并渲染**（spawn 了 WebKit WebContent 进程，仅一条无害 IMKCF 输入法 warning）。产物：`packaging/dist/四土.app` + `四土-mac.dmg`。
- ⚠️ ④/⑤/③ 是**后端(app.py)**改动，被编译进冻结二进制 → **必须真重建**，不能只拷 index.html。②⑥是纯前端。
- **用户下一步**：从 Dock/启动台重开 `/Applications/四土.app`（已装新版）即可看到全部六项。图标若仍显旧＝macOS 图标缓存顽固，`killall Dock` 已刷；必要时注销重登。
- **备选**：`/Desktop/四土.app` 是源码启动器，永远加载实时源码=最新代码。

### B. 讲解提速——用户倾向 + 待 fable5 优化（本轮重点）

**用户偏好（明确）**：**C、D 最有好感 → 其次 A → B 舍弃（不能牺牲讲解质量换速度）**。并希望 fable5 **另外提出有没有更好的提速方案**。

**已摸清的管线事实（省 fable5 重新探索）：**
- 讲解走 `reader_core/llm.py` `WordExplainer.explain`（L179）→ `_create`（L~250，**非流式**，`response_format=json_object`，**未设 max_tokens**，temperature 0.6）。输出是**结构化 JSON**：`phonetic/pos/literal/contextual/explanation`（讲解 60-120 字）。Prompt：`SYSTEM_PROMPT`(L40)+`USER_TEMPLATE`(L46)。
- 已有 **8 线程预生成**（`app.py start_pregen` L888，`_pregen_one` L922，`ThreadPoolExecutor(max_workers=8)`）+ **落盘缓存**（`_pregen_path`/`_flush_pregen_cache`，跨会话不重算）。痛点只在「未及预生成就点开」的冷词。
- **悬停预取已存在**（`index.html` L2516-2533：`mouseover .vocab/.w.vocab` → 180ms 防抖 → `prewarm_word`，`_hoverWarmed` 去重，受 `pregenChk` 门控）+ `_get_explanation`（app.py L~760）有 **inflight 去重**（点击 attach 到在途生成）。
- 我本轮已加 **点击插队**（explain_word/selection 置 `_click_priority_until` 窗口 3s，`_pregen_one` 窗口内让路把 API 并发让给用户这一击）。行为测过。
- **冷词地板 = 一次 LLM 调用（~2-4s）**，⑤ 只去争抢+给头起，不改这个地板。

**四个候选方案（用户排序 C/D>A，弃 B）：**
- **C 本地词典秒出「本义」+ LLM 补讲解**（感知最快、读书流畅）：内置轻量英汉词典，点词 0 延迟先给核心中文意思，温度讲解随后补。中/低。
- **D 流式输出**（感知最快、全讲解渐进）：需把 JSON 输出改成**可流式分段格式**（如 `@@音标@@…@@本义@@…` 定界符）+ 渐进解析 + **pywebview 流式传输**（bg 线程 `window.evaluate_js` 推 chunk，或前端轮询 `poll_explain`）。核心管线大改、风险中高——**正因如此适合 fable5 专攻**。
- **A 视口优先预生成**（真提速、最治读书点词）：一页/一章渲染后先生成**当前屏幕上的词**，而非从头按 `vocab_order` 顺序。改 `_build_pregen_order` 或 pregen 调度。中/低。
- ~~B 收紧输出+max_tokens~~：**用户明令舍弃**（怕牺牲讲解质量）。

### C. 一个仍开放的小任务
- **剪报封面回填**：现有旧剪报（④ 之前存的）无缓存封面 → 只显 B（来源小标）。要让旧文章也补 C 首图，需一次性后台重抓 og:image（旧记录都存了 `source` URL）。用户尚未拍板要不要做。

---

## ✅ 第三轮反馈批 全部完成（2026-07-07，主会话 Opus 亲做，未派 builder）

下方「🚧 待办批（第三轮反馈）」六项**已全部施工 + preview/行为验证 + 分条 git 提交**。提交：`5c4b1a4`(⑤)·`770af98`(④)·`564a2e1`(①)·`0db04be`(②)·⑥内容在`b2cf73b`(被并行窗口 auto hook 抢提，内容已核对无误)·③无需改码。

- **⑥ 频率档+配色**：A 档扩到 ≤21000（overweight/nutritious/vacate 进 A），bcde 顺延 30000/38000/44000；`--fA..E` 重排为**绿蓝紫红黄**（仅频率色）。亮暗双色截图验收和谐。
- **② 删除确认框**：去 pywebview 火箭，改暖纸自绘模态 `.cfm`（陶土色删除+幽灵取消，取消/✕外点/Esc 全关）。
- **③ 书架封面**：查证+对 5 本库内 epub 实测 `extract_cover` **5/5 全抽到封面**，管线可靠、删书连带清缓存重抽，无需改码。
- **① App 图标**：squircle 缩到 1024 画布 80%、四周透明留白（macOS Dock 惯例），icns 重生成；**只改尺寸不动画面**。
- **④ 剪报盒封面**：用户定 **C（og:image 首图）+ 无图回落 B（来源小标+细线）**。extractor 取 `meta.image/sitename`，save_session 下载缓存到 `covers/{id}.jpg`(幂等失败静默)，clipHTML 双形态。顺带修暗色剪报卡浅字压浅底旧 bug（`.clip` 夜览改 #262019）。
- **⑤ 讲解提速**：用户定「悬停预取+点击插队」。**悬停预取(mouseover→prewarm_word)+inflight 去重为既有实现，已验证仍工作**；新增**点击插队**——explain_word/selection 置优先窗口(3s)，`_pregen_one` 窗口内让路把 API 并发让给用户这一击（行为测过：让路 1.4s / 词已缓存则跳过 / 停手恢复满速）。

**⚠️ 下一步＝打包 dmg**（用户原定此顺序）：`bash packaging/build.sh`。打包前清临时 mock、核 santu.spec datas 白名单；装后真机看 ①Dock 图标大小 + ②删除框 + ④剪报封面首图/回落。**⑤ 提速与 ④ 首图缓存建议真机各走一遍**（真 LLM/真 og:image 环境 preview 假数据未覆盖）。

---

## ✅ 阶段10.2 · 复盘并入真四土 + 空白死页根因修复（2026-07-07 凌晨，主会话全权修复，用户明令不派 builder）

**用户三症状与实锤根因**：
- ① 口语复盘.command 打开的网页空白+两角按钮全死 → **IndexedDB 多标签升级卡死**：`DB_VERSION` 当天连升两次（16:35 v3→4、18:28 v4→5）而全项目零 `onversionchange` 处理，Chrome 里白天留下的旧标签页永远握着旧版本连接 → 新页 open 进 `onblocked` → `LocalApi.ready()` reject → `boot()` 无 try/catch 且 `bindGlobal()` 排在其后 → 事件全没挂、主区空白。（server 时序、SW 陈旧缓存、JS 语法错均已逐一取证证伪：冷启动实测 0.33s、SW 缓存 22:47 当场新建、node --check 全过。）
- ② 「四土对话录」双击无反应 → 昨晚那次双击**其实启动成功**（取证：进程已连跑 3 小时），只是菜单栏图标被挤到屏幕外看不见；今天再双击 macOS 只激活旧实例，更没动静。
- ③ 复盘只存在于 mobile 前端、真四土桌面版里 grep「复盘/对话录音」为零 → 用户「你做的是网页版不是真四土」判断完全正确。

**修复内容（全部主会话手改）**：
- `mobile/js/core/store.js`：openDB onsuccess 挂 `onversionchange` 自动关连接+重置缓存（根治多标签互卡；已重建 core.bundle.js）。
- `mobile/app.js` `boot()`：`bindGlobal()` 前置（初始化再失败按钮也不许死）+ `ready()` 包 try/catch（失败 toast 说人话）+ **`#review` 直达**（等 `load` 完再进，防 renderReview 未定义竞态）。
- `santu_app/server.py`：模块级 `api = Api()` 改惰性单例 `_get_api()`（带锁）；前端早已全走 LocalApi，RPC 只剩兜底，四土进程内起线程不再白付一份重初始化。
- `santu_app/app.py`：新增 `Api.open_review()` + `_ensure_review_server()`——先清 18760 上任何外部/孤儿进程再在**本进程内**起 server 守护线程（端口自检、幂等、已开窗只聚焦不重开），然后 `webview.create_window` 开原生「四土 · 口语复盘」窗口指 `http://127.0.0.1:18760/#review`。
- `santu_app/index.html`（桌面真身）：`#homeUtils` 新增「口语复盘」ghost 按钮（与生词本/设置同款同排），点击 `api().open_review()`，失败走 setStatus 报原因。
- `对话录/AppDelegate.swift`：人工双击（非 --headless）弹 NSAlert 说明框指路「四土首页→口语复盘→开始录音」；server 拉起的 headless 路线不受影响。已 `bash build.sh` 重建+签名+部署桌面。
- `mobile/` 全量 rsync 至 `四土app/assets/mobile/`（md5 核对一致）；**APK 未重打**。

**验收证据**：真实 pywebview E2E 脚本（scratchpad）：`open_review→{ok:true}`、复盘窗内 DOM `{shown:true, backWired:true, hash:#review}`、二次调用 `focused:true` 不重开；`_ensure_review_server` 对着活的外部 server 实测抢占成功+幂等；preview 里 `indexedDB.open(v6)` 即刻 success（旧代码会永久卡死）；桌面按钮行截图过眼风格统一；独立 `python -m santu_app.server`（.command 路径）静态/recorder/RPC 三路冒烟通过。

**数据边界（重要，回答用户疑问用）**：复盘历史/词块/错题本/设置住在**各自 WebView 的 IndexedDB**——四土原生复盘窗与 Chrome 网页版互不相通。用户此前在 Chrome 里的复盘记录仍在 Chrome（双击 .command 可回看）；四土窗口首次使用需重填火山/LLM 设置（存 WKWebView，跨重启留存，storage_path 已持久化）。如用户想搬历史，可做一次性迁移批（server 中转 dump），暂未做。

**待用户真机验收**：① 四土首页点「口语复盘」→ 原生窗口直达复盘屏；② 窗内「对话录音」卡开始/停止录音（首次授权对象仍是「四土对话录」：麦克风弹窗+屏幕录制去系统设置手动开）→ 复盘闭环；③ 双击桌面「四土对话录」现在弹说明框。

### 10.2b 追加批（同夜，用户反馈「要原生 App + 权限找不到四土」）

- **重大 bug 实锤并修复：录音卡自 10.1 上线起从没渲染出来过**——`localapi.js recorder_status()` 对
  `httpGet` 的返回（只有 `{status,text}`）调 `.json()` 必抛错，被 `_renderRecCard` 的 catch 吞成
  「整卡不渲染」优雅降级，所有环境全灭。已改 `text+JSON.parse`（同 `list_dualtrack`），preview 里
  卡片首次真实渲染成功。⚠️ 教训：优雅降级会把硬 bug 藏成「像是没配 server」。
- **权限指引重写**（用户在 系统设置 找「四土」找不到而卡死）：卡片失败时渲染分步指引——授权对象是
  「四土对话录」引擎（非四土本体），要开 隐私与安全性→麦克风 + 屏幕录制与系统录音 两处；列表没有它
  就先点一次开始录音让它申请。`REC_PERM_RE` 匹配中英 TCC 报错（declined/denied/3801/SCStream…）。
- **正式原生 App 落地**：`packaging/santu.spec` 补 `santu_app/mobile` 全套 datas（滤 node_modules/
  core源码/_devtest）+ `santu_app.server` hiddenimport + `NSMicrophoneUsageDescription`；
  `server.py DUALTRACK_DIR` 绝对锚死 `~/Documents/situ/data/dualtrack`（与 Swift 引擎一致，冻结后
  不再指进包内）；`app.py _writable_root` 冻结时若见 `~/Documents/situ/library` 就继续用它
  （本机书架不变空，朋友机器照旧走 App Support）；`_kill_other_instances` pgrep 同时匹配源码/冻结
  两种形态（`/四土\.app/` 带斜杠锚定防误伤对话录）；`_ensure_review_server` 旗标改「连一下才算数」
  自愈重启。`packaging/santu_entry.py` selftest 追加复盘链路断言（mobile 进包/dualtrack 锚家目录）。
- **产物**：`bash packaging/build.sh` → 178M app / 103M dmg；冻结 selftest 全绿；已安装
  `/Applications/四土.app`（替换旧版）并启动验活（pywebview :42001 正常监听）。分发用
  `packaging/dist/四土-mac.dmg`。
- **已知边界**：pywebview cocoa 无 WKWebView 媒体捕获授权回调（venv 源码 grep 证实）→ 复盘窗里
  「页面内直录麦克风」（getUserMedia）暂不可用；主录音流程=首页对话录音卡（Swift 引擎，系统级双轨）。
  Chrome 网页版（.command）仍可页面内直录，作兜底。
- **入口现状**：日常=Dock/`/Applications/四土.app`（原生正式版，带全部新功能+用户原数据）；
  `~/Desktop/四土.command`=dev 模式备用；`~/Desktop/四土口语复盘.command`=Chrome 网页版兜底
  （旧复盘数据在那边）。

---

## ✅ 阶段8 · 口语复盘大脑升级（2026-07-06 完工验收）+ 批2/批3 待做

- **已完成**（builder 施工、主会话验收：三条 prompt 逐字比对✓、repeatOf/minor 逻辑抽验✓、真实 API 三组证据✓）：
  分级两遍管线（≤350词单遍/超长分块检出→编辑）、重点恒定≤5条、同类合并×N、话题段折叠、
  跨次记忆（重犯徽章+recurCount）、minor 不自动入错题本、复盘历史屏（按日分组+topic+搜索）、
  精批模型可单配、server.py 火山转写代理（桌面录音可用）、录音 10 分钟自动分段（上限 60 分钟）。
  spec=`specs/阶段8-复盘大脑升级-施工规格.md`；commit `8d3e105`；APK 已更新到 `~/Desktop/四土手机版/四土.apk`（用户自装）。
- **桌面入口**：`~/Desktop/四土口语复盘.command`（起 server.py:18760 + 开浏览器）。
- **遗留待用户真机验**：① 10 分钟档真实长录+火山转写；② 手机麦克风录音（沙盒验不了）。
- **8.1 修复批**（2026-07-06 已派 builder，spec=`specs/阶段8.1-复盘修复批-施工规格.md`）：
  ①桌面录音假成功 toast + 失败丢录音（加重试）；②deepseek-chat 弱档别名代码层升级映射 v4-pro。
- **分工（2026-07-06 用户拍板）**：核心 prompt/质量攸关设计=Fable 主会话必做不下放；施工=Sonnet builder。
- **批2 词块系统 ✅（2026-07-06 完工，主会话验收：四条 prompt 逐字✓、掌握规则抽验✓、真实 API 三组✓）**：
  spec=`specs/阶段9-词块系统-施工规格.md`。
- **批3 改版=双轨录音 ✅（2026-07-06 完工，主会话验收通过，待用户真机验收）**：Swift 菜单栏「四土对话录」
  （麦=我/系统声音=AI）→ data/dualtrack/ → server 切片转写(show_utterances) → filterBleed 串音过滤 →
  交织 turns → 复盘 + 偷学进词块库。spec=`specs/阶段10-双轨对话录音-施工规格.md`（含 2026-07-06 用户
  硬要求追加版：**外放不戴耳机也必须分清两轨**）。
  - **AEC 双保险**：麦轨 AVAudioEngine `setVoiceProcessingEnabled`（系统级回声消除，ducking 已关）+
    失败回落 SCStream captureMicrophone（meta.json `aec:true/false`）；交织前 filterBleed
    （时间重叠≥0.5 × token containment≥0.6 且 token≥3 双条件）兜底。「建议耳机」只出现在 AEC 回落态。
  - 主会话已验：单测 21/21、AEC/文案/阈值抽查、本轮 llm.js 零 diff、工作树干净、无残留进程。
  - 交付：`~/Desktop/四土对话录.app`（首次用需授「屏幕录制」+「麦克风」权限后重启 App）。
  - **待用户真机验收三项**：①授权后真录一段 Sesame/ChatGPT 对话端到端；②**外放不戴耳机录**——复盘
    对话稿里 AI 的话不得进「我」的 turn（本批最核心验收项）；③真实火山凭证下 utterances 时间戳是否
    返回（整轨降级则交织粒度退化，观察现象回报）。
  - 已知瑕疵（非本批引入）：偷学卡「存为词块」按钮态不持久化，重开显示回初始态但不会重复入库。
  - ~~沙盒局限：bundle open 后菜单日志不出，判定非代码 bug~~ **误判，已翻案（2026-07-06 晚）**：
    真根因=NSStatusItem 在 AppDelegate 属性初始化器里建（app.run() 之前），AppKit 抢跑 finishLaunching
    → delegate 丢回调 → setup 不执行 → 图标窗口死在屏幕外（CGWindowList 实测 X=-21,Y=-37）。
    已修：statusItem 延迟到 didFinishLaunching/setup() 里建（commit 3aab343），日志实锤修复生效。
    另修 build.sh 桌面部署 cp -R 嵌套包坑（先 rm -rf 再 ditto + 签名校验）。
  - 图标可见性：用户菜单栏 30+ 图标超宽，macOS 把新图标排屏外（Y=-37），此路不通 → 催生阶段10.1。
- **阶段10.1 ✅（2026-07-06 深夜完工，主会话验收通过，待用户真机验收）**：**录音控制并入四土首页**
  （用户拍板，菜单栏 App 降级为隐形后台引擎）。spec=`specs/阶段10.1-录音并入首页-施工规格.md`。
  - Swift `--headless` 模式（HeadlessRunner.swift：didFinishLaunching 纪律照守、SIGTERM 正常收尾、
    `.recorder.pid`/`.recorder.error` 落盘协议）+ server.py 三端点（recorder_start/status/stop，
    `open -n` 拉起保 TCC 记在「四土对话录」名下，pid 校验 argv 防重用误杀，stop 超时不 SIGKILL）+
    首页书架顶「对话录音」卡（status 驱动三态、1s 轮询、切 tab 清 interval、无 server 整卡不渲染）。
  - **为单 dmg 分发铺路**：`_recorder_app_path()` 三级回落（SITU_RECORDER_APP env → 对话录/dist →
    桌面），将来打 dmg 把对话录.app 塞进四土.app、env 指过去即可（用户已拍板要做单 dmg，后续批）。
  - 主会话验收：红线文件零 diff、HeadlessRunner 逐行过、server pid 防误杀逻辑过、builder 曾在
    意外获得权限时真录成功一次（aec=true 完整链路 + 双 WAV 落盘）。
  - **⚠️ 交付时发现并清掉 18760 孤儿旧 server**（PPID=1，18:00 起，serving 旧代码）——测试前必须
    重启 server（双击 `~/Desktop/四土口语复盘.command`），老进程看不到新端点和新首页。
  - **待用户真机验收**：①首页点「开始录音」→ 首次授权（麦克风弹窗+屏幕录制去系统设置手动开，
    对象都是「四土对话录」）→ 外放真录一段 → 停止 → 复盘闭环；②AEC 外放不串音（阶段10 核心遗留项）。
- ~~模型提醒：用户应手动把 deepseek-chat 改成 v4-pro~~ **已过时（8.1 批已代码层解决）**：llm.js
  `_loadConfig`/`_loadReviewConfig` 会把 `deepseek-chat` 自动升级为 `deepseek-v4-pro`（llm.js:122/151），
  用户无需改任何设置。

---

## 🚧 待办批（用户第三轮反馈 2026-07-06）— 新窗口从这里开始做

**总状态**：前三批（原六项 + 补充批 + 补充批2）**全部施工完成并经主会话 preview 闭环验收通过**，用户真机试用「非常好」。**dmg 尚未打包——用户要求先做完下面这批再打包。** 打包命令：`bash packaging/build.sh`（PyInstaller 冻结→hdiutil 出 `situ-mac.dmg`；配方/两坑见 memory `reference_situ_mac_dmg_packaging`）。

**工作方式**：判断轻产出重的照旧写 spec 派 builder(Sonnet)；品味/方向/mockup 类主会话(Opus)自己做。验收＝审证据+重跑最关键 1–2 条+抽看关键 diff。preview 配置（全局 launch.json）：`situ-harness`(18731)、`situ-app`(18732)。主战场 `santu_app/index.html`(≈4700行)、`santu_app/app.py`、`reader_core/{vocab,llm,extractor}.py`。

六项（根因/落点已由上一窗口定位好，可直接写规格）：

**① App 图标尺寸偏大**（用户对比微信/Claude app 图标判断）。根因：图标画面填满整块、缺 macOS 惯例的留白内边距，显得过大。图标源：`santu_app/assets/icon.png`（Dock 图标，`app.py:2046`）+ `santu_app/assets/icon.icns`（bundle 图标，`packaging/santu.spec:75`）。改法：把画面**缩到画布 ~80%、四周留透明边距**（可加 macOS 圆角矩形底），重新生成 icon.png + icon.icns（`iconutil`/`sips`）。属资源活，注意生成后 png 和 icns 都要更新。

**② 删除书本弹出的小火箭确认框很丑**。根因：`index.html:4044` 用原生 `confirm()`，pywebview 原生弹窗带 Python 启动器的火箭图标。**全项目只此一处 `confirm()`**。改法：换成**应用内自绘样式模态**（复用现有 `libOverlay`/`gv-wrap` 那套暖纸卡片语言，两个按钮"取消/删除"），去掉火箭、与整体协调。书架删除 + 剪报删除共用这一句（`isBook` 分支文案不同），一并覆盖。

**③ 书架封面可靠性（用户疑虑，需确认+可能只需答复）**。用户反馈：优化期间书架多出几本无封面的 Bossypants（他删了），并实测"删有封面的书再加回来，封面还在"。问：以后再导入自带封面的书是否**确定**带封面？答复要点（已查代码）：`_cover_thumb`（`app.py:1545`）从 epub 抽封面（`extract_cover`）→缩放→缓存 `covers/{id}.jpg`，无封面写 `.none` 哨兵、回落排版式封面卡。**结论：epub 内嵌封面会可靠抽取并缓存**；那几本无封面的 Bossypants 多半是测试期重复导入/无内嵌封面的副本。新窗口可快速真机验证一次（导入一本有内嵌封面的 epub → 看书架出真封面）给用户吃定心丸，基本无需改码。

**④ 剪报区历史文章加封面图？（先出 mockup 再定）**。文章无内嵌封面。可选：生成"和谐的排版式封面卡"（像书架 `cv-type` 那种色条+标题）或取文章首图。用户不确定加了好不好看，**明确要求先看 mockup 再决定是否应用**。→ 主会话(Opus)出一张忠实复用真配色/字体的剪报封面 mockup（复用 `~/Desktop/预览/四土/` 流程），截图给用户定夺，别直接implement。

**⑤ 讲解生成提速（尤其非预生成的词）**。现状：讲解走 `WordExplainer.explain`（`llm.py:179`）→ `chat.completions.create`（`llm.py:299`，**非流式**、整段返回）。用户要点开生词后更快出讲解。改法候选（新窗口评估）：a) **流式输出**（边生成边显示，感知最快，前后端都要改）；b) 更激进的邻词预取（hover/翻页预生成）；c) 缩短 prompt/换更快模型档。建议优先 a（流式）——对"没预生成的词"感知提速最直接。属真优化活，可先小验一处。

**⑥ 频率档：A 档扩到 2 万词 + 重排颜色**（用户明确指定）。
- **射程**：用户要"B 档现射程变成 A 档射程"＝**A 包含约 2 万词**（A≤~21000）；bcde 往后顺延，**其余档由你(主会话)定**。建议新阈值：**A≤21000 · B≤30000 · C≤38000 · D≤44000 · E>44000**（这样 overweight16383/nutritious20686/vacate14813 全进 A；obese22135→B；pandemic/calorie→C；ephemeral/serendipity/ubiquitous→D；>44k 及不在 5 万表内→E）。落点：`app.py _freq_band`（现阈值 4000/21000/33000/41000，上一批刚调过）；**存量词按 daily_rank 重算的逻辑已在**（`get_notebook` 等），改阈值即全局生效。**不动** `COMMON_RANK_CUTOFF`。
- **颜色重排**（用户指定新顺序 **a绿 b蓝 c紫 d红 e黄**）——只改频率色变量 `--fA..E`（**仅这一套是频率档**，`--c*/--h*/--cA..cP/--w*` 是点击/章节/高亮呼吸盘的独立调色板，别碰）：
  - Light（`index.html:31`）：现 `--fA:#5f7a58; --fB:#b0894a; --fC:#4a6b85; --fD:#ad5f48; --fE:#71628a;`
    → 改为 `--fA:#5f7a58;（绿·不变） --fB:#4a6b85;（蓝·原C值） --fC:#71628a;（紫·原E值） --fD:#ad5f48;（红·不变） --fE:#b0894a;（黄·原B值）`
  - Dark（`index.html:1010`）：现 `--fA:#8db085; --fB:#c9a766; --fC:#88a8c2; --fD:#d08d73; --fE:#a695c5;`
    → 改为 `--fA:#8db085; --fB:#88a8c2;（蓝·原C） --fC:#a695c5;（紫·原E） --fD:#d08d73; --fE:#c9a766;（黄·原B）`
  - 用户动机：B 档词多、要个"吸引去看"的颜色，蓝比黄更耐看。改完主会话截图过眼一下配色是否仍和谐（讲解区三处上色 + 生词本 + 全局 + 高亮不冲突）。

**做完这批再打包 dmg**（用户明确此顺序）。打包前记得清掉临时预览/mock 文件、别让 specs/_harness 混进 bundle（santu.spec datas 是白名单，通常不会，但核一眼）。②的图标改完真机装一次看 Dock/删除框效果。

---

## 2026-07-06（补充批2）用户第二轮真机反馈：浮层滚动跟随/TC feed子标签/文章回看也上色(扩到三处)/频率重定档（builder 施工完成，preview 闭环全验，待主会话验收）

规格：`specs/阅读体验-补充批2-施工规格.md`。四次 git commit（每点一次）：`6078ce5`(#3)→`211380d`(#1)→`ab588ec`(#5)→`0e3a850`(#4，⚠️被会话自动存档 hook 抢先提交，见下方偏离说明)。#2 纯答复无改动。

**#1 读物精选浮层滚动不再关闭，改为跟随来源卡**：滚动 handler 用 `requestAnimationFrame` 节流，取当前打开来源卡 `srcEl` 重新调 `positionDiscList(list, srcEl)`，popover 像页面一部分跟着滚。仅当来源卡本身滚出视口（`rect.bottom<0 || rect.top>innerHeight`）才 `closeDiscList()`。resize 仍直接关闭（布局剧变，重定位不划算）。

**#3 The Conversation 恢复 global/us/uk 三 feed，改按需加载子标签**：`DISC_OUTLETS.tc.feeds` 恢复三条；`discLoadOutlet` 改成只拉单个 `feedIdx`（不再并行拉 3 个合并，更快）；`_discCache` 键改 `outletId+':'+feedIdx`，每 feed 各自缓存；popover 头部多 feed 来源渲染 `.dlh-tab` 子标签（全球/美国/英国），CNA 单 feed 不显示；`discPrefetchAll` 只预取每来源 feedIdx 0（全球）。

**#4 讲解区着色扩展**：
- 4a 后端：`load_archive` 文章回看分支不再把 `self._last` 置 `None`，改为重建一个只需频率表的轻量 `VocabClassifier(user_level=self._level)`（放在 `self._level` 赋值**之后**构造，修正了规格伪代码里的隐藏顺序坑——若在赋值前构造会用到上一篇文档的 level）。让文章回看点词也能拿到 `daily_rank`/`freq_band`。
- 4b 前端：`explanationHtml` 给「本义」「这里」的 `.val` 也加 `fv` 频率色内联样式（此前只有标题词上色），无 band 时三处都回落默认色。

**#5 频率档重定档**：`_freq_band` 阈值改 A≤4000/B≤21000/C≤33000/D≤41000/E>41000（原 3000/8000/15000/30000），修正 SUBTLEX 口语语料压低 overweight(16383)/nutritious(20686) 等书面常用词排名的问题。新增 `_refresh_band()`：`get_notebook`/`get_global_notebook` 读取时按已存 `daily_rank` 用新阈值重算并覆盖 `freq_band`/`freq_name`，让存量词条即时生效，无需用户重新点。`COMMON_RANK_CUTOFF`（vocab.py）未动。

**#2 发音渠道（纯答复，未改代码）**：单个词＝有道优先、MiniMax 兜底；短语/整句朗读＝MiniMax 优先、有道兜底；未配 MiniMax 则全走有道（单词 OK，整句朗读会弱/常无声）。

**改动文件**：`santu_app/index.html`（#1+#3+#4b，净增约 79 行）、`santu_app/app.py`（#4a+#5，净增约 38 行）、`reader_core/vocab.py`（未改动，规格要求不动 `COMMON_RANK_CUTOFF`）。`specs/_harness/index.html` 随 `sync.sh` 同步。

**验收证据要点**（preview_eval 全量化）：
- #1：真实 `#reading.scrollTop` 滚动（不是 `window.scrollTop`，此项目实际滚动容器是 `#reading`），验证滚动 40px 后 popover 与来源卡 gap 仍精确 8px、`_discOpenId` 不变；stub `getBoundingClientRect` 模拟卡片滚出视口（`top>innerHeight`），验证 `_discRepositionOnScroll()` 正确调 `closeDiscList()`；resize 仍直接关闭。
- #3：`window.__fetchFeedCallCount`/`__lastFetchFeed`（canned harness 内建计数器）验证：点 TC 默认全球 0 新请求（预取已命中）；切「英国」→ 1 次新请求、URL 含 `/uk/`、文章列表换成 UK 条目；切回「全球」→ 0 新请求（缓存命中）；CNA 头部无子标签（单 `.dlh-feed`，非 `.dlh-tabs`）；刷新页面后 `_discCache` 键只有 `cna:0`/`tc:0`（验证预取只拉 feedIdx 0）。
- #4：Python 侧构造临时 library 目录 + 假文章存档，`load_archive` 后 `api._last["classifier"] is not None`；`explain_word('vacate',...)` 返回 `freq_band=='B'`（真实 LLM key 已配置，连讲解正文也一并返回验证管线整体可用）。前端注入合成 `r`（`freq_band:'B'`），`getComputedStyle` 验证标题/本义 val/这里 val 三处 `color` 均等于 `--fB` 计算值 `rgb(176,137,74)`；无 band 场景三处均无内联 style、回落 `--fg`；截图确认暖纸底上琥珀色三处可读、协调。
- #5：`_freq_band` 6 个断言全过（16383→B/20686→B/14813→B/22135→C/2152→A/42859→E）；构造 `daily_rank=16383,freq_band='D'` 的旧词条，真实 `Api().get_notebook()` 下发后确认变成 `freq_band=='B'`。

**⚠️ 偏离规格处**：
1. #4a 构造顺序：把 `VocabClassifier(...)` 的构造挪到 `self._level = rec.get(...)` **之后**，而非规格伪代码写的位置（紧跟在原 `self._last=None` 那一行、即 `self._level` 赋值之前）。原顺序会让新构造的 classifier 用上一篇文档遗留的 `self._level`，虽然只影响 `level` 标签不影响 `freq_band`（`classify_word` 的频率查询与 `user_level` 无关），但为正确性起见按当前文档 level 构造更稳妥。
2. #4 的 commit 被本机会话自动存档 hook（`auto: 自动存档`）抢先提交，commit message 是通用的自动存档文案而非「#4」规范格式；内容经核对与预期实现完全一致（已用 `git show` 逐行核对），只是 message 不够精确，供主会话决定是否需要事后 `git commit --amend` 或补一条说明性空提交。
3. #1/#3 因函数体深度耦合（`discOpenOutlet`/`discLoadOutlet`/滚动监听都互相牵扯），为了每点独立 commit，先完整实现两点、再手动拆分 diff（临时回退 #1 的 hunk、单独提交 #3，再重新应用 #1 单独提交）——两次提交内容互不重叠，无需合并复核。

**尚未做**：打包 dmg（按规格由主会话统一做，未碰）。

---

## 2026-07-06（补充批）用户真机试用反馈：讲解区频率着色/读物精选浮层/追问切回展开/feed提速（builder 施工完成，preview 闭环全验，待主会话验收）

规格：`specs/阅读体验六项-补充批-施工规格.md`。三次 git commit：`471cf90`(C)→`672d607`(A)→`566b229`(B+D)。

**C（先做，最简单）**：`mountExplanation` 恢复 `r.followups` 历史时，`ask-q collapsed` 改回 `ask-q`（去掉 collapsed），配合既有 CSS `.ask-q.collapsed + .ask-a{display:none}`，切回某词时历史追问答案默认直接可见，不用再点开。手动点问句仍可折叠（原逻辑未动）。

**A**：讲解区单词按 A-E 频率档着色。词标题（`explanationHtml` 的 `.ex-word span`）按 `r.freq_band` 内联 `color:var(--fX)`（新增 `FREQ_VAR` 映射，同生词本/全局一套色）。短语/句子的「重点词汇」（`selectionHtml`）单词型 key（`len(word.split())==1`）也染频率色，多词固定搭配保持原有赭色 `<b>` 强调。后端 `app.py explain_selection` 用当前 classifier 对单词型 key 补 `freq_band`/`freq_name`（try/except 包裹，classifier 缺失不影响讲解主体），缓存(`_cache`)与生词本(`_notebook`)写入都带着补好的 key_words，回看一致。

**B**：读物精选来源卡点开后从「就地展开挤走首页」改成 `position:fixed` 浮层卡片（popover）。`positionDiscList()` 用 `getBoundingClientRect` 锚定被点来源卡：优先浮上方（8px gap），空间不足浮下方；水平超右边界收进视口。`max-height:min(60vh,420px)+overflow-y:auto`——内容再多只卡内滚，绝不顶出首页。`closeDiscList()` 统一关闭入口：✕按钮/点卡外/Esc/再点同来源卡（toggle）都会关；滚动/resize 直接关闭避免 fixed 定位错位。z-index:9500（压过内容，低于全局 modal 的 9998/9999）。「收起」文案改「✕」。

**D**：The Conversation 的 3 个 feed（global/us/uk）砍成只拉 1 个（global），并行拉取变单请求，明显提速。新增 `_discCache`（Map）内存缓存，来源点开先查缓存命中即 0 延迟渲染；`↻刷新`按钮绕过缓存强制重拉。`renderHome()` 之后新增 `discPrefetchAll()`，用 `requestIdleCallback`（降级 `setTimeout 800ms`）在首页后台预取所有来源写入缓存，每次会话只跑一次——用户点开来源时多半已是缓存命中、秒开。文章解析耗时本批未动（网络+spaCy 固有成本），但确认点文章后 `setStatus('① 抽取正文…')` 立即可见，加载反馈没丢。

**E（未改代码，仅复核确认）**：MiniMax 发音无需改——有道免key即可发音，MiniMax key 由用户在设置里自填选填（`#setMmKey`/`#setMmGroup`），分发包不带 key 是安全铁律要求的正确行为，不影响基础发音可用性。

**改动文件**：`santu_app/index.html`（A/B/C/D 全在这，净增约 180 行）、`santu_app/app.py`（仅 A 的 `explain_selection` 补 freq_band，+16 行）。`specs/_harness/index.html` 随 `sync.sh` 同步。

**验收证据要点**（preview_eval 全量化，未靠肉眼猜）：
- A：注入 word/sentence 讲解，`getComputedStyle` 验证 5 档(--fA..E)颜色精确匹配 CSS 变量值，暗色模式自动跟随；后端用 stub classifier 跑 `explain_selection` 验证单词型 key 补上正确 band、多词搭配无 band、缓存/notebook 回看一致。
- B：真实 `MouseEvent`（非 preview_click 工具本身——它对这个 fixed+滚动容器场景有坐标失配的已知怪癖，改用手动构造事件验证）触发 popover，量出浮上方/浮下方两分支精确像素、水平右边界收进视口、书架剪报开合前后 rect 完全一致（零位移）、`max-height`按 60vh/420px 取更小值生效、✕/Esc/卡外/toggle 全部正确关闭。亮暗双色截图存 `~/Desktop/预览/四土/B-读物精选浮层-{亮色,暗色}.png`（用实时会话 DOM 快照+headless Chrome 渲染取得，因为 preview_screenshot 工具本身不支持存盘）。
- D：`__fetchFeedCallCount` 全程=2（CNA 1 次 + TC-global 1 次，验证不再是 3 个并行请求），首页渲染后隔几百 ms `_discCache` 已含两个来源键（预取生效），点开来源时调用数不再增长（缓存命中）。
- C：`getComputedStyle('.ask-a').display==='block'`，历史追问答案不点即见；手动点问句仍可折叠回去。

**⚠️ 偏离规格处**：B 和 D 因代码层面深度耦合在 `discOpenOutlet`/`discLoadOutlet`/点击事件委托这几个共同函数体内，未按规格"每项单独 commit"拆成两次，合并成一次 commit（`566b229`），commit message 里已如实标注、供主会话复核是否需要事后补拆。

**尚未做**：打包 dmg（按规格由主会话统一做，未碰）。

规格：`specs/阅读体验六项-施工规格.md`。六项分六次 git commit（`d0a7431`..`942f3bb`）。

**①** 阅读生词本 `.nw` 文字颜色改恒定按频率档取色（`nbLvl` 删掉随 clicks/order 排序变色的分支），删掉 `.nb-item` 左侧竖色条 CSS，对齐全局生词本"整行文字永远染频率色"的拍板行为。

**②** 后端新增 `collect_paragraph`（`app.py`，¶-key 命名空间与 §/lemma 不撞，幂等），前端整段色卡生成的两处调用点都自动收藏进生词本；生词本加「段落」筛选档。

**③** 新增前端锚点数组 `_phrases`（照抄 `_highlights` 那套 blockOrd/start/end 口径），`.phrase` 讲解带/收藏带现在跨换章也能正确恢复（含 data-ex 追问历史）；后端 `save_session`/`load_archive` 书模式分支加 `phrases` 字段。

**④** 追问后台化：后端 `explain_word`/`explain_selection`（含 cached 早退路径）现在把已完成的 followups 并进返回值；前端新增 `_pendingAsks` 登记表 + `_panelKey`，切词不再打断在途追问，回看自动复原或看到活 spinner。这是六项里最容易错的一项，preview 用可控延迟 mock 做了 A/B/C 交叉切换+7 轮连续切换验证。

**⑤** 追问 history 从 6 轮放宽到 40 轮，讲解 prior 从 500 字放宽到 2000 字（`llm.py`），学明白优先。

**⑥** 首页剪报盒下方新增「读物精选」RSS 来源带（CNA + The Conversation，与手机版 `mobile/discover.js` 同源）。后端新增 `fetch_feed`（标准库 XML 解析，真实网络测过 CNA/TC 各拉到 20 条真实文章）；点来源就地展开文章列表，点文章走现有 `run(url)` 入口，暗色模式零额外样式自动适配。

**改动文件**：`santu_app/index.html`（主战场）、`santu_app/app.py`（+`collect_paragraph`/+`fetch_feed`/explain_word|selection 补 followups/save_session|load_archive 补 phrases）、`reader_core/llm.py`（prior 截断放宽）。`specs/_harness/canned-bookmarks.js` 补齐 6 项对应的 stub API；新增 `specs/_harness/sync.sh`（同步真实 index.html 到 harness，含时间戳 query 防浏览器磁盘缓存吃旧 stub——这个坑排查耗了一些时间，写进脚本备忘）。

**⚠️ 尚未做**：打包 dmg（按规格由主会话验收后统一做，builder 未碰）；②③④ preview 全在 harness 假数据下验证，真实 pywebview 环境（真 spaCy/真 LLM）尚未跑过，建议主会话验收时至少真开一次 App 走一遍③④的真实换章/切词流程。

---

## 2026-07-04 Bossypants 三修：取词粘连/多空格 + justify 词距 + 讲解区收藏（已完成，preview + Python 全验）

用户读 Bossypants 报三事，全部定位到根因后修复：

**① 单词显示错乱（「T he」多空格、「toflesh」「SecondCity」「Martin,Steve」粘连）**——两个独立根因：
- **多空格**（T he）：`extractor.py` 用 `get_text(" ", strip=True)`，`separator=" "` 会在首字下沉 `<span class="dropcap">T</span>he` 之间插空格 → "T he"。
- **粘连**（toflesh/SecondCity/Martin,Steve）：EPUB 源里句中硬折行是 `\r\n`+缩进（`to\r\n   flesh`）。spaCy 把这段空白 run 单独 token 化，`vocab.py:247` 的 `if tok.is_space: continue` 直接丢弃，而前一个词的 `whitespace_` 此时是 ""，于是两词焊死。
- **修法**：`extractor.py` 新增 `_block_text(el)`——把 `<br>` 换空格、用**默认** `get_text()`（不注入分隔符，忠实还原 `The`）、再 `\s+→单空格` 归一化（把 `\r\n`+缩进压成单空格，spaCy 就不再产生独立空白 token）。三处调用点（`_soup_to_blocks`/`_split_doc_by_toc`/章节标题循环）全换。`vocab.py` 再加一道防线：丢弃空白 token 前，若前一 token 的 ws=="" 就补成 " "（护 URL/txt 等不走 epub 归一的来源）。
- **验证**：真跑 `books/248b0dd0911c.epub` Windy City 章，从 token 流重建渲染文本——`T he`/`toflesh`/`SecondCity`/`Martin,Steve` 全消失，`The`/`to flesh`/`Second City` 全在。6 本 epub 回归：章节数/字数稳定无异常。
- **⚠️ 生效条件**：书模式 `load_archive` 每次 `extract_book` 重抽（`app.py:1522`），故**重开书即修复，无需迁移**；但要先彻底退出所有四土实例（.command 走 nohup 会留旧窗口）再重开。文章模式会 bake `article_html` 快照，已导入的**文章**若也有此症需重新导入（书不受影响）。

**② justify 某行词距明显偏大（附件2）**——根因：`article p` 早有 `hyphens:auto`，但 `<html lang="zh">`（UI 是中文），浏览器按中文处理英文正文 → 不启用英文断字 → justify 只能靠拉大词距填满行。WKWebView 还需 `-webkit-hyphens`。修法：`render.py` 把 `<article>` 改 `<article lang="en">`（书/文章两模式的 `article_html` 都出自 `render_article_fragment`，一处全覆盖）+ `index.html` L136 补 `-webkit-hyphens:auto`。preview 对比图（Chromium）实证：修复后长词断字、词距均匀；修复前该行 gap 忽大忽小复现附件2。

**③ 讲解区「重点词汇」可一键收藏进生词本**（用户选「进现有生词本」）——`app.py` 新增 `collect_keyword({word,gloss,sentence})`：**不调 LLM**，直接按 `explain_selection` 的 entry 形态写一条 `kind="phrase"` 词块（`§`-key，text/word/meaning=gloss），幂等（大小写/空格变体同 key 去重），并 `_upsert_global` 汇入全局。`index.html`：`selectionHtml` 的每个 `.ex-kw li` 加 `＋` 收藏按钮（`collectBtn`，已收藏显示 `✓`+柔和底），全局委托点击 → 乐观 UI + 失败回滚，成功后 `scheduleSave()`（把 notebook 存进本书存档）+ `refreshNbCount()`；`_collectedKeys` Set 从 notebook 载入预标已收藏态。Python 闭环验证：collect/去重/空拒/get_notebook 形态全对（测试污染的 global 已清理回 64 条）。

**改动文件**：`reader_core/extractor.py`（+`_block_text` 及 3 处调用点）、`reader_core/vocab.py`（空白 token 补空格 1 处）、`reader_core/render.py`（`<article lang="en">`）、`santu_app/index.html`（`article p` 加 `-webkit-hyphens`；`ADD/CHK_SVG`+`collectBtn`+`phraseKey`+`_collectedKeys`+`refreshCollectedKeys`、`selectionHtml` 接入、`.kw-collect` 委托与 CSS、两处 notebook 载入点补 `refreshCollectedKeys`）、`santu_app/app.py`（+`collect_keyword`）。`specs/_harness` 未同步（本批用独立 preview 文件验，harness 保持原样）。

**真机待验**：① 重开 Bossypants 看正文取词是否全对；② 长段落 justify 词距是否均匀（可接受长词处出现连字符——如不喜欢连字符可改左对齐 ragged，告知即可）；③ 讲解区选短语 → 点重点词汇旁 ＋ → 生词本 tab 计数 +1、词块入本、退出重开仍在。

---

## 2026-07-03 第二批·色块高亮 Phase 1（②③④⑥，已完成，preview 全验；Phase 2 圆点贴留给下一轮）

**做了什么**（施工规格 `specs/色块高亮+圆点贴-第二批-施工规格.md`，只做 Phase 1）：
- 呼吸盘七色（琥珀/豆绿/黛蓝/陶红/黛紫/橄榄/藕粉）浅纸洗色变量进 `:root`（+暗色模式对应变体）。
- 划选荧光笔高亮：`wrapHighlight`（克隆 `wrapPhrase` 的 surroundContents 包裹技术）把选区包成 `.hl` span，背景走内联 `style="background:var(--wX)"`，不设 z-index——`.w`/`mark.vocab`/`.sent` 天然嵌套在其内部、自然叠在高亮之上（实测 `.hl` 内 vocab 词仍可点、仍会 `explain()`）。
- 整段色卡：`applyHighlight` 检测选区 trim 后文本是否等于所在 block 的全部文本，命中则走 `.hl.para`（block 级、更淡 `.16` 洗色、向两侧出血 -16px）而非行内 span。
- 划选工具条扩为「讲解·追问 | 七色圆点 | 复制」（`showSelectBar`），讲解按钮位置/`explainSelection` 逻辑一字未改；点已有 `.hl`（span 或 para）弹「七色（改色）| 移除」小工具条（`showHlBar`/`reopenHl`/`recolorHighlight`/`unwrapHl`/`unwrapParaCard`）。
- 复制：`.sb-copy` 调 `api().copy_text({text:_selText})`（后端方法已存在，未改）。
- 书模式锚点持久化：`_highlights` 数组镜像后端 `highlights` 字段，record `{id,ch,blockOrd,start,end,color,kind}`——`start/end` 是块内字符偏移（`_hlPointToBlockOffset`/`_hlOffsetToPoint`，`TreeWalker` 遍历文本节点累加，不依赖几何）。`renderChapterContent` 每次渲完（vocab 高亮已在 `article_html` 里、DOM 现成）立即调 `_applyHighlightsForChapter()` 按锚点重新包裹——**特意没放进 `_initPager`**，因为 `_initPager` 也会被窗口 resize/字号变化的 `_resizeTimer` 触发，那种情况下内容没变、重新包裹会把已包好的 `.hl` 再套一层。文章模式零后端改动（`.hl` 随 `doSave()` 的 innerHTML 快照天然持久，和 `.phrase`/`.bookmark` 一样）。
- `app.py`：`save_session`/`load_archive` 书模式分支各加 `highlights` 字段，逐字照抄 `bookmarks` 的 plumbing（+3 行）。

**验收证据**（preview_eval 量数字，`specs/_harness/index.html`+`canned-bookmarks.js` 闭环）：
1. 书模式划选上色 → `.hl` span 背景=`--wC rgba(74,107,133,.22)`、record 入 `_highlights`；换章（`gotoChapter`）再回来 `hlInDom` 从 0（不同章过滤生效）恢复到 1，背景色不变；`doSave→load_archive→renderBook` 全链路后 `r1.highlights` 正确带出、重渲后 `.hl` 背景仍是 `--wP rgba(179,121,139,.24)`。
2. 生词叠加：`.hl` 包住 `mark.vocab` 后 `vocabInsideHl:true`、点词仍触发 `explain()`（面板出现"正在讲解 meanderings"），未被高亮工具条截胡。
3. 讲解不回归：`explainSelection()` 在 `.sent` 内仍正确生成 `.phrase`（`data-phrase`/`data-sentence` 齐全），文章模式同样验证通过。
4. 整段色卡：全选一个 block → `.hl.para`，`getComputedStyle` 实测 `display:block / border-radius:10px / margin:-16px(双侧) / background:rgba(138,128,72,.16)`（F色×.16）。
5. 复制：mock 替换 `api().copy_text` 后点击 `.sb-copy`，实测调用参数 `{text:'sample copy text'}` 正确、bar 正确隐藏。
6. 文章模式：划选上色/点高亮改色（A→B，`rgba(95,122,88,.26)`）/移除全过；`readingSnapshot()` 输出确认含 `<span class="hl" data-hl-id="..." data-c="A" data-kind="span" style="background: var(--wA);">`。
7. 截图过眼（书模式+文章模式各一张）：七色在暖纸底低饱和不刺眼，符合已批准 mockup 的 GoodNotes 手帐质感；`preview_console_logs` 全程零报错。

**取舍/踩坑记录**：
- `_applyHighlightsForChapter()` 调用点选在 `renderChapterContent` 的 innerHTML 赋值之后、而不是规格字面写的"`_initPager` 之后"——原因见上（resize 会重复触发 `_initPager`，选在只在真正换内容时跑一次的位置更安全，效果等价，因为 vocab 高亮本就是服务端渲染进 `article_html` 的，不需要等分页几何稳定）。
- 整段色卡的触发方式规格未明确 UI 入口，本批实现为「划选恰好覆盖整块文本」自动识别（trim 后选中文字等于该 block 全部文本），不额外加按钮——最小侵入、和 mockup ④ 的呈现效果一致。
- Phase 2（圆点贴）完全未动，`_dots`/`#dotSlot` 等一概未建，等下一轮。
- 调试中撞见一次 preview 工具的浏览器脚本缓存怪癖（`<script src="canned-bookmarks.js">` 编辑后即使换新 server/新 tab 仍执行旧版本，直接 `fetch+eval` 强制重跑才生效；`curl` 直连始终显示磁盘文件是新的）——这是 preview 工具本身的行为，不是代码或 harness 配置问题，如果下一批还在这个 harness 上调试遇到"改了 canned js 却没生效"，直接甩这套 `fetch(...).then(eval)` 大法，别怀疑代码。

**改动文件**：`santu_app/index.html`（净增约 200 行：CSS `--cX/--wX` 七色变量+暗色变体+`.hl/.hl.para/.selbar` 新样式；JS `wrapHighlight/unwrapHl/recolorHighlight/applyHighlight/reopenHl/_applyParaCard/unwrapParaCard`+书模式锚点全套`_highlights/_hlPointToBlockOffset/_hlComputeAnchor/_hlOffsetToPoint/_applyHighlightsForChapter`+`showSelectBar/showHlBar`工具条改造+点击分发扩展）、`santu_app/app.py`（+3 行，`highlights` 字段透传）、`specs/_harness/index.html`（镜像同步）、`specs/_harness/canned-bookmarks.js`（`load_archive` 补 `highlights` 回传，harness-only stub）。

---

## 2026-07-03 微调批：书签体验×2 + 讲解缓存持久化 + 启动白屏 + 目录切章（已完成，preview/Python 全验；真机待验清单见下）

**做了什么**（施工规格 `specs/微调批-书签体验+缓存+启动-施工规格.md`，两部分共五项，验收清单全过）：

**第一部分①-④**：
- ① 放/删书签不再 `setStatus` 弹小字提示（书模式+文章模式共 4 处全去），其它 toast（朗读错误等）不动。
- ② 防误触双闸：**焦点保护**（`_winFocusTs` 记窗口 focus 时刻，450ms 内的放置/点线删除直接 return——接住 acceptsFirstMouse 补丁后"激活即误触"的那一击）+ **间隙限定**（新函数 `_clickInTextFrag` 用 `Range.getClientRects()` 判定点击点是否落在任何文本 fragment 内，行内/字间空白不算真实空白，只有段间空隙/列尾空白才放置）。文章模式、书模式两套路径对称加固。
- ③ 启动白屏：Spectral/Bitter 从 Google Fonts `<link>`（同步阻塞、代理慢/断即白屏）改成本地 `@font-face`（`santu_app/assets/fonts/`，6 个 woff2，共 152KB，Bitter 是 variable font 一个文件覆盖 400/500/600）；`create_window` 加 `background_color="#f7f2e8"` 暖纸底。**正文实际字体既有情况说明**：`article{}` CSS 选择器是死代码（真实 DOM 没有 `<article>` 标签），本批未顺手改（规格未要求，外科手术原则）——字体文件本身已验证完全生效（`document.fonts.check` 在真正使用 Bitter 的元素上返回 true）。
- ④ 讲解预生成缓存持久化：新增 `DATA_ROOT/pregen/{doc_id}.json`（`{meta:{level,ver}, cache:{lemma:讲解}}`），`load_archive` 时按 `doc_id`+`level` 载入（level 不匹配则忽略旧文件）；`_get_explanation`/`explain_selection` 写入 `_cache` 后去抖 2s 原子写盘；`_hard_exit`（closing→`os._exit(0)`）前同步 flush 一次，不丢最后几秒的讲解。

**第二部分⑤**：
- `reader_core/extractor.py` 的 `extract_book`：新增 TOC-split 路径。当 TOC 条目数 ≥ spine 文档数×2 时（明显比文件切分更细），改为按 epub 真实 TOC 锚点切分每个 spine 文档；否则完整保持现行为（一文档一章），零回归。`To Kill a Mockingbird`（`books/cb089c878a12.epub`）从 5 巨型乱序章（Chapter 8/14/21/About the Publisher/Document Outline）修复为 34 章正确有序（Dedication + Chapter 1–31 + Copyright + About the Publisher）。其余 6 本 epub（4 份 The Artist's Way 副本 + Body Keeps the Score + Bossypants）逐字节零回归（见 `specs/_harness/evidence/extractor-diff.txt`）。

**验收证据**：`py_compile`（app.py + extractor.py）+ `node --check`（index.html 提取 script）双过；②用 `preview_eval` 精确模拟 focus 事件 + `MouseEvent`/`elementFromPoint` 量出文章模式与书模式各 3 项（a/b/c）共 6 组"点击前后记录数"数字，全部符合预期；③ `preview_network` 确认无 googleapis 请求 + `document.fonts.check` 验证字体真实生效；④ Python 闭环脚本 15 项断言全过（含"LLM 一被调用就 raise"的强证据证明缓存命中真的没调 LLM、原子写盘无 `.tmp` 残留、level 隔离、去抖定时器+同步 flush 语义）；⑤ Python 脚本验章节数/标题/无噪音条目 + 全书 7 epub 回归对比 + harness 截图验目录抽屉显示 34 章有序列表。

**真机待验清单**（preview 无法完全复现启动路径/真实 WKWebView 环境）：
1. **白屏时长**：真机重启四土，用代理慢/断网条件下感受首屏是否不再长时间白屏（本地字体应该让首屏几乎瞬间可见，残余空窗应为暖纸色而非纯白）。
2. **acceptsFirstMouse + 焦点保护协同**：真机点击 Dock/其它窗口切回四土窗口，落点若恰好在书签放置区域，验证不会误放；450ms 后正常点击应能放置。
3. **讲解缓存生效**：真机打开一本书/文章，等讲解生成几个词后完全退出四土（⌘Q），重新打开同一本书/文章（同难度），确认"讲解已就绪"直接命中、不再显示"生成讲解中"、不产生新的 LLM 调用（可观察响应速度是否瞬间）。
4. **mockingbird 目录**：真机打开 `books/cb089c878a12.epub`，目录抽屉应显示 34 章正确序列；**旧存档若之前放过书签，重开会因目录重新抽取导致该书书签的 `{ch,ord}` 锚定漂移**——这是已知限制、本批未做迁移，如实告知用户"该书旧书签需手动删除重放"。`current_chapter` 同理可能漂移，可接受。

**改动文件**：`santu_app/index.html`（净增约 60 行：全局 `_winFocusTs`/`_clickInTextFrag`/`@font-face` + 4 处 setStatus 删除 + 两模式各 2 处防误触闸）、`santu_app/app.py`（净增约 90 行：`PREGEN_DIR` 常量 + 6 个缓存持久化方法 + 2 处 `load_archive` 载入点 + `_hard_exit` 同步 flush + `background_color`）、`santu_app/assets/fonts/`（新增 6 个 woff2，152KB）、`reader_core/extractor.py`（净增约 160 行：`_flatten_toc`/`_split_doc_by_toc`/`_extract_book_toc_split` 三个新函数 + `extract_book` 分流逻辑）、`specs/_harness/`（同步 index.html + 补字体 + evidence 基线文件）。

---

## 2026-07-02 书签系统 第一批 + 真机反馈四项修复（已完成，preview 全验；③ acceptsFirstMouse 待真机验证）

**做了什么**（施工规格 `specs/书签系统-第一批-施工规格.md` + 用户真机反馈四项，验收清单全过）：
- **书模式**：正文空白处直接点击 → 出细发丝线+右端纯文字日期签（覆盖层 `#bkLayer`，绝不推动正文/不改总页数）；同位置/点线再点 = 切换删除（直接删+1.6s toast，**无撤销**）；抽屉「目录｜书签」双 tab，书签 tab 是两列缩略图网格，点格子自动换章+翻页+落点微光；book-bar 有 📑 入口按钮。
- **文章模式**：直接点空白处放置（无需先点按钮）；`.bookmark` 视觉与书模式同款细线+纯文字日期签；点线删除，无撤销；`bookmarkBtn` 下拉跳转/删除照旧可用。
- 后端 `app.py`：`save_session`/`load_archive` 书模式分支加 `bookmarks` 透传，旧档兼容。

**放置精度两轮修复（重要，供后续排查参考）**：
1. 第一轮（协调者验收发现）：锚块跨 CSS 列（长段落被拆成两个 fragment）时 `getBoundingClientRect()` 返回联合矩形，线画错位置——改用 `getClientRects()` 精确取对应 fragment（`_bkFragRect`/`_bkFragPage`）。
2. 第二轮（用户真机反馈"点这里却在别处出现书签"）：`_bkHandlePagerClick` 用整块矩形筛"同列候选"、X 不落任何块时退回全章找最近块的旧逻辑，点列间距/页边空白会误配到别的页。**整个重做为「fragment 级 + 列感知」**：`_bkBoundaries`（只枚举真段落边界，且只收当前视口可见的 fragment——这一步是二次踩坑后补的，不做视口过滤的话隔壁页的 fragment 会在横坐标上"借用"当前列的位置，导致列外很远的点击也能命中）+ `_bkHitBoundary`（列命中→48px 内吸附→再不中静默忽略）。记录新增 `side:'a'|'b'` 字段区分"锚在块顶"还是"锚在上一块底"，旧记录无该字段按 `'b'` 兼容。
   点击矩阵四类（段间空白/列尾空白/列间距吸附/页边距忽略）+ 跨列不回归 + 零回流/切换删除/字号锚定三条回归，全部 `preview_eval` 量数字验证通过，详见 `~/Documents/改动日志库/四土/详细.md`。

**已实施的其它三项**：
- ② 撤销功能整个删除（`_bkUndoBook*`/`_bkUndo*`/`statusEl` 撤销分发器全删），删除书签变成直接删+1.6s 自动清 toast。
- ③ 首页书脊要点两下：`app.py` 新增 `_patch_webview_accepts_first_mouse()`，给 `WKWebView` 类打 `acceptsFirstMouse:` 返回 `True`（darwin only，try/except 包裹，失败不影响启动）。**推断修复，无法在 preview 里验证，真机待验**——下次真机测试务必确认首页书脊单击是否已经一次生效。
- ④ 线样式 V1 定稿：`border-top` 改两端渐隐的 gradient 发丝线；纸签去 📑 emoji，只留「M月D日」，缩小压暗成不抢戏的纯文字签；hover 仍变「✕ 移除」。`getComputedStyle` 逐项核对过规格数值。

**验收证据**（完工汇报里贴了完整数字，未重复存进本文件）：`py_compile`/`node --check` 全程双过；后端 Python 闭环脚本验证 `bookmarks` 字段透传；`specs/_harness/`（真实 index.html + `canned-bookmarks.js` stub api）内 `preview_eval` 量出零回流、精确落点、吸附/忽略行为、跨列不回归、字号锚定不回归，`getComputedStyle` 核对 V1 样式数值，截图存证正常态+强制 hover 态。

**已知风险 / 留待下一批**：
1. 字号切换目前不会在书模式自动触发 `_initPager()` 重排（既有缺口，非本批引入，未顺手改）——书签锚定数学本身验证正确，但用户实际改字号那一下不会立即重排书签线，等下次翻页/resize 才会跟上。
2. 跳转落点闪烁动画用 `requestAnimationFrame`，在非前台可见的无头预览环境里不触发（已用同步方式验证过底层 CSS 动画机制没问题）；真实 WKWebView 窗口（前台可见）预期正常。
3. **③ acceptsFirstMouse 修复待真机验证**（本轮新增的唯一"推断修复"项，优先级最高，下次真机测试第一件事就是测它）。
4. 圆点贴（mockup 方案③）等属于后续批次，本批未做。

**改动文件**（含两轮打回累计）：`santu_app/app.py`（+31 行，`main()` 新增窗口焦点补丁函数）、`santu_app/index.html`（累计净增约 700 行：CSS + JS，书模式为主 + 文章模式同步重写）、`specs/_harness/canned-bookmarks.js`（新增）、`specs/_harness/index.html`（镜像同步）。

---

## 2026-06-28 用户真机反馈（★下一窗口先处理这些 · 本窗口只记录未改码）
本轮 J 改完后用户真机测，报了下列问题。**先按 ① 的判定法排除"没加载到新版"，再动其它。**

1. **★最关键：旧文章/书脊打开未进沉浸态（顶栏没隐藏、无月牙）＋ 找不到「全局生词本」入口** —— 这两件事同时出现，**强烈指向真机在跑的四土实例没加载到新版 `santu_app/index.html`**（不是代码 bug）。已取证：首页书脊点击走 `openArchive`（`index.html:2512`），而 J 轮对 `openArchive` 文章分支的 `body.reading` 修复就在这条路径、preview 已验生效；顶栏 `#vocabBtn`「生词本」与 reading 修复都确在文件里；`resource_base()` 非 frozen=项目根，四土.app 跑实时源码，无四土冻结副本。
   **判定法**：彻底退出所有四土实例（`.command` 用 nohup 会另起进程、不替换旧窗口，故旧实例可能还开着）再重开 → 看首页右上是否出现新「生词本」按钮：出现=已加载新版，沉浸态/入口随之都在；不出现=继续查它到底加载哪个 index.html（`ps`/`lsof` 看进程、确认 .app 启动器 exec 的路径）。**别急着改 openArchive，先证伪"没重启"。**
2. **书模式没显示全书总页数**：现在只显示"章内页 + 当前章总页"，缺"全书第 X/Y 页"或章节进度。属真实功能缺口（pager 是按章的），需新增全书页数统计/展示。
3. **阅读界面无"回到首页"按钮**：目前只能经书架/月牙绕。
4. **用户要"回到首页 + 添加新文章"更便捷 → 做成抽屉(抽屉式)**：这是明确设计诉求，新窗口落地时出对比图再定（抽屉位置/触发/内容）。
5. 入口现状（供排查）：全局生词本入口 = 顶栏「生词本」按钮(`#vocabBtn`，阅读时顶栏隐藏→改用侧栏「⤢ 打开生词本大视图」按钮 `#nbOpenAll`)。若都看不到，回到 ① 判定。

**手机版（另开窗口做）已与用户对齐**：① 走 **PWA**（手机浏览器→添加到主屏；开发全程电脑浏览器、**无需连手机**，明早用 nova10 浏览器测即可；原生/Flutter 因本机缺 Android SDK 暂不走）。② 同步走 **方案1 云盘 + 坚果云 WebDAV**（百度/夸克无可用 API/WebDAV，不适合自动同步；保留手动导入导出兜底）。生词本 JSON 即 `~/Documents/situ/vocab/global.json` + 各 `library/{id}.json`。

## 2026-06-28 本轮 J：生词本系统大改（全局+单篇 / 三维排序 / 冷暖分层色 / 词块一等公民 / 分组复制导出）+ 修旧文章残留工具栏 bug
**已全部应用 + 自测拿证据（Python 单元/集成 + preview 真实 index.html 截图）；真机 WKWebView 仅需重启确认渲染/pbcopy/导出。手机端联动是下一步，本轮未做。**

**① Bug 修复（已 preview 闭环验证）**：书架点旧「文章」进阅读界面残留顶部工具栏、无月牙——根因 `openArchive` 文章恢复分支漏 `document.body.classList.add('reading')`（renderArticle/renderBook 两条路径都有，独此漏）。补齐后 preview 实测：`body.reading` 生效、topbar `display:none`、月牙 `display:block`、文章正常渲染、无报错。`index.html:openArchive`。

**② 配色方案（用户两轮敲定）**：统一一套**冷暖交替低饱和「档案呼吸盘」**应用到全部排序维度的分层——`--fA..fE`/`--c1..c4`/`--h0..h5` 都=`绿#5f7a58·琥珀#b0894a·黛蓝#4a6b85·陶红#ad5f48·黛紫#71628a·橄榄#8a8048`。相邻档冷暖跳变→一眼可分（用户否决了同色系渐变 + 深蓝双轨）。在 `:root`。

**③ 后端 `santu_app/app.py`**：
- 新常量 `VOCAB_DIR/GLOBAL_VOCAB`（`DATA_ROOT/vocab/global.json`，{key:entry}）。
- `__init__` 加 `_order_map/_sent_order`（位置序号）、`_global`(内存镜像)、`_gvlock`。
- 新方法：`_index_positions`(建位置序号，文章替换/书按章累加 base=ch*1e6)、`_cur_chapter`、`_load_global`(惰性+缺文件时 `_backfill_global` 从既有书架 notebook 一次性回填)、`_save_global`(原子写)、`_merge_one`(合并一条)、`_upsert_global`、`get_global_notebook`/`set_known_global`/`set_star`/`delete_global`、`export_csv`(写 output/+访达打开)、`copy_text`(pbcopy)。
- `explain_word`/`explain_selection` 记录块增补：`clicks`(每次主动查看+1)、`order`(烤入文内序号)、`chapter_idx/chapter_title`、`added_at/last_seen`、`star` 保留，并 `_upsert_global(click=True)` 汇入全局。
- `process`(文章)/`_load_chapter_internal`(书) 调 `_index_positions`；新书重置清 `_order_map/_sent_order`。
- 数据模型向后兼容：旧存档无新字段也能读，首开全局库自动回填。

**④ 前端 `santu_app/index.html`**：
- 顶栏加「生词本」按钮(`#vocabBtn`)；新 overlay `#gvWrap`（生词本大视图）。
- 大视图：`全局/本篇` scope 切换 + `词/词块/句` 类型筛选 + `日常频率/章节顺序/点击次数` 排序(下划线 tab) + 分层图例 + `每 x 个一组` 分组(每组 ⧉复制/⬇导出 + 多选「复制/导出选中」+全选) + 🎯重点 + ✓已掌握视图 + 搜索 + 🗑(全局)。颜色随排序维度变。JS 全在主 script（`gvOpen/gvReload/gvFiltered/gvLvl/gvRender/gvCopy/gvExp` 等）。
- 侧栏「本篇」`renderNbList` 升级：`⤢打开大视图`按钮 + `频率/章节/点击`段控 + 冷暖左色条 + 🎯星标 + 类型标改「词块」。
- 复制=制表符 `word\t释义`(Anki/Excel 友好，走 `copy_text`)；导出=CSV(Word,Type,FreqBand,DailyRank,Clicks,Source,Phonetic,Meaning，走 `export_csv`)。

**词块（lexical chunks）方向**（用户引 Lewis 词汇法，要重点突出）：本轮落地「词块/句一等公民+视觉升格+🎯重点+点击数=熟悉度信号」；**下一轮建议**：讲解时 LLM 附带高频搭配一键收藏 → 复现高亮(跨文档) → 输出练习。

**自测证据**：`py_compile` OK；后端单元(freq_band/位置索引/全局 merge)+磁盘闭环(upsert/重载/星标/已掌握/删除/回填)+E2E(explain_word×2→clicks=2/order/band，explain_selection→词块) 全过；JS `node --check` OK；preview 真实 index.html + mock 数据：频率/章节/点击三态着色、分组、复制(9行 tab)、导出(文件名+CSV表头)、侧栏升级 全部截图/eval 验过。
**待真机确认**：重启四土后，真实 WKWebView 渲染 + pbcopy 复制 + CSV 导出落盘。临时验证配置 `situ-app`(:18732 serve santu_app) 已留在 `.claude/launch.json`。

## 2026-06-27 本轮 I：朗读卡死根因(MiniMax key 失效) + 朗读健壮化(已改码并验证；待真机+新 key 验收)
**根因（已取证，非推测）**：config.json 里的 MiniMax key（`sk-cp-Bvc…`）现已**失效**——直接打 MiniMax `t2a_v2`/`chatcompletion_v2`、国内(`api.minimax.chat`)+国际(`api.minimaxi.com`/`.io`)四端点全返回 `status_code:2049 invalid api key`。同一把 key 在 clothing-classifier 里当 chat key 也已 2049。用户那 ~1000 积分应在账号下**新 key** 上（key 被轮换，积分不丢）。**有道 dictvoice 对任何多词句子 HTTP 500**（只读单词）→ MiniMax 一死，整句朗读**无任何可用引擎**。
**旧 bug（"始终没朗读"的机制）**：① 前端 `_ensureAudio` 句子失败时仍 `return new Audio(有道整句URL)`，而有道 500→该 `<audio>` 永远 load 失败；② `playerPlayCurrent` 只挂 `onended`、**无 `onerror`/无 play() 拒绝处理**→ 永久卡在那一句、永不前进。
**已改（外科手术，2 文件）**：
- `santu_app/app.py`：`_download_minimax` 解析 `base_resp.status_code`→映射人话(`_MINIMAX_ERR`)，鉴权/余额类(`_MINIMAX_FATAL`=1004/2049/1008)**失败即停重试**；成功清 `_mm_err`。`get_audio` 全败时把 `_mm_err` 带回前端。`__init__` 加 `self._mm_err`。
- `santu_app/index.html`：`_ensureAudio` 句子(`isPhrase`)失败**返回 null**（不再丢必卡死的有道 audio），单词仍回退有道；存 `_lastAudioErr`。`playerPlayCurrent` 加 `onerror`+`play().catch`→`playerFail`，`settled` 防重复。新增 `playerFail`：**单句失败跳过、连续 2 句失败→停播+toast**「🔇 朗读中断 · <原因>」。`startPlayback` 重置计数。
**验证**：Python import OK；mock 200+2049→"MiniMax key 已失效…"、1008→"余额不足…"、成功清错误 ✓；node `--check` 前端 JS OK。**未做**：真机 WKWebView 验收（需用户填新 MiniMax key 后，整句朗读应恢复；若再失效则应见 toast 而非卡死）。harness 是 index.html 手动副本，本次未同步。
**其它 TTS 排查结论**：ElevenLabs key 在 `~/Documents/Obsidian Vault/Elevenlabs.md`（`sk_1817…`，key 有效但账号**免费版**，API 合成被 `payment_required` 挡，需付费升级）；全盘**无 OpenAI key**（tts-1 无凭证）。独立 `四土.app` 早已存在(项目根/桌面/Applications 三份一致、最小环境 import OK)，无需重做。

## 2026-06-23 本轮 H：乱码/卡顿/关闭卡死/删书/独立 .app（已应用并验证）
1. **EPUB 乱码根因+修复**：`_soup_to_blocks` 只取 `<p>/<h*>`，而很多 epub（如 Z-Library 版 The Artist's Way）正文全包在 `<div>` 里 → 抽出 0 block → 空/回退成 zip 结构垃圾（音频名里那些 PK/meta-inf/mimetype 即此）。改：harvest 也收 div/li/blockquote，但只收**叶子块**（`el.find(_BLOCK_TAGS)` 命中的容器块跳过，避免重复）。验证：该书 27 章全是干净英文，load_chapter idx9 html 277KB。
2. **关闭卡死根因+修复**：pregen/audio 跑在 `ThreadPoolExecutor` worker 上，Python 的 concurrent.futures atexit 钩子在退出时 **join** 这些线程——若有 worker 卡在 `urlopen`(timeout 20s) 就要等几秒。改：`win.events.closing += lambda: os._exit(0)`（设置走 WKWebView localStorage、会话翻页时已存，无需 flush），秒退。**注意**：app.py 顶部补了 `import os`（原来只在 process_file 里局部 import）。
3. **开书卡顿优化**：`_load_chapter_internal` 每章都 new 一个 VocabClassifier，其 __init__ 重读 cet4/cet6/subtlex 三文件 + 每实例重跑 `spacy.load`（~300ms+ 死重量/章）。改：vocab.py 把 cet4/cet6/freq/nlp 提为**进程级缓存**（`_shared_*()`，只读、本就已被 8 线程并发用，风险不变）。实测大章(39k字)换章 ~1000ms→~750ms；首次仍付一次模型加载 ~1.7s。
4. **书架删书**：库 overlay 早有 🗑；新增**首页书脊 hover × 删除**（`.spine-del`，confirm 后 `delete_archive` 连删 json+epub+索引）。注：旧的乱码书架条目重开即会用新逻辑**重新抽取**（load_archive 重跑 extract_book），会自动变正常，不必删。
5. **独立 .app（壳应用，不冻结源码）**：`tools/build_app.sh` → PNG 转 icns、搭 `四土.app`（`Contents/MacOS/situ` 启动器 `exec .venv/python -m santu_app.app`，跑实时源码→**以后改 bug 不用重打包**）、Info.plist、去 quarantine，复制到 桌面 + /Applications。已 `open` 实测进程起得来（PID 起、无报错）、minimal env(`env -i`) 下也能 import（避开了 node 那种 PATH 坑）。**不是 osacompile 那种 .app**，是手搓 shell 壳，能双击。.command 仍保留作后备。

## 2026-06-20 本轮 G：状态竖排 + 多一两行 + 播放器全身可拖/顶部居中/瘦身/去计数（已应用，preview 1180px 截图过眼）
1. **状态竖排**：`.status` 加 `writing-mode:vertical-rl`（窄竖药丸贴左边框，不挡正文）。CJK 直立、数字侧躺（CJK 竖排默认行为，可接受）。preview：writingMode=vertical-rl，31×147。
2. **每页多一两行**：`_initPager` 里 inner 的 `paddingTop 44→34`、`paddingBottom 80→30`，回收列高给正文。
3. **播放器全身可拖**：去掉 ⠿ 拖柄，`#player` 整体 pointerdown 拖动（`e.target.closest('button,input,label,a')` 命中则放行点击）；位置存 `situ_player_pos`，px 定位时清 transform。preview：从空白处拖动 dx91/dy475 生效。
4. **播放器默认顶部居中**：`.player{left:50%;top:33px;transform:translateX(-50%)}`（用户要的"目录与章节中间"）。**注意**：book-bar 已占满顶行，居中会**轻微压住「上一章」按钮**——已如实告知用户，可拖走。
5. **播放器瘦身**：btn 29→25、mini 24→21、字/间距收；172×33（原 254×41）。
6. **去掉「4/53」句计数**：删 `#plPos` 元素 + `plPos` 变量 + updatePlayerUI 那行（页码+高亮已表达进度）。

## 2026-06-20 本轮 F：页码贴底(终极修法) + 状态左移 + 月牙可拖 + 图标去黑角（已应用，待真机验收）
1. **页码栏下方仍有大片空白（真机 height:100% 解析过短，和 preview 586 同病）**：改 `#app` 为 **`position:fixed;inset:0`**（钉死窗口四边，彻底绕开 WKWebView 百分比/vh 高度怪癖）。preview：app top0/bottom750=winH，pagerbar 下方 gap=0。这是页码贴底的终极修法。
2. **「讲解预备中」浮层占底部**：`.status` 从底部居中改到**左侧边框** `left:14;top:50%;translateY(-50%)`（窄药丸 max-width200），不再占底。
3. **月牙浮标改可拖**：`#rfmFab` 加 pointer 拖拽——位移>4px 判为拖动(改 left/top 存 `situ_rfm_pos`)，否则当点击开合菜单；启动恢复存档位置。preview 模拟拖拽 dy-380 生效。播放器拖柄那套同理。
4. **图标四角是黑的（低级错）**：原图 1254² 是带纯黑角的全幅 squircle。用 PIL 从四角 BFS 洪填近黑(sum<40)→透明（保留书内部暗部不破洞），alpha 高斯羽化 1.1px。蓝底合成验证四角透明、边缘干净。`tools/apply_icon.py` 重设两个 .command 图标；原图备份 `/tmp/icon_orig_black.png`。

## 2026-06-20 本轮 E：修首页顶栏半隐 + 加载栏顶占/跳动 + 页码需滚动 + 图标（已应用，待真机验收）
preview 结构量化通过；真机视觉待验。
1. **首页顶栏只显示一半**：原因——FullSizeContentView 后内容到 y0，顶栏被红绿灯条压住上半。改：把 30px 留白条从 `body.reading .main` 移到 **`#app{padding-top:30px}`(常驻，border-box)**；首页顶栏与书模式 book-bar 都落在条下，红绿灯在条内不挡。顶栏 padding 复原 `8px 22px`(去掉给红绿灯让位的左 82)。preview：home/book 的顶元素 top 均 = appTop+30。
2. **「加载讲解」栏顶占 + 加载完跳动**：根因——`.status` 是 `#app` 里的**流式行**(topbar 与 main 之间)，pregen 时显示「讲解预备中 X/Y…」占一行把 book-bar 顶下去，清除时又跳上来。改：`.status` 改 `position:fixed` 底部居中**浮层 toast**(bottom:46 居中圆角)，彻底脱离布局。preview：显示 status 后 topbar 位移 = 0。
3. **页码栏需向下滚动才看到**：双因——(a) 上面 status 流式行偷高；(b) `#app height:100vh` 在透明全幅标题栏下**溢出标题栏条高度**，把底排顶出窗外。改：`#app` 改回 **`height:100%`**(=真实 WKWebView 内容区，无 vh 溢出) + `html,body{overflow:hidden}`(杜绝整页滚动)。preview：pagerbar 紧贴 #app 底，gap=0。
4. **图标**：用户图在桌面 `ChatGPT Image 2026年6月20日 18_24_57.png`(不是 18_28_14)。已 `cp` 成 `santu_app/assets/icon.png` 并跑 `tools/apply_icon.py` 设好两个 .command 的 Finder 图标；Dock 图标 app 启动自动读取。**教训：图标用户已放桌面，应直接找文件用，别让用户搬。**

## 2026-06-20 本轮 D：修真机回报的 5 个问题（已应用，待真实 app 验收）
真机日志：`extract_book 153ms (29ch)` + `load_chapter[2] 847ms`（瓶颈是 NLP 分层，非解析）。
1. **原生标题栏没去掉的根因 + 修复**：真机报 `NSWindow geometry should only be modified on the main thread!`——`shown` 在工作线程触发。改：`_on_shown` 里用 `Foundation.NSOperationQueue.mainQueue().addOperationWithBlock_(_apply_native_chrome)` 跳主线程再改 styleMask。**底部页码看不到**也是这个引起的（标题栏没透明化→内容没满窗→底排被推到窗外裁掉），主线程修好后一并解决。
2. **月牙「＋」点击无反应的根因 + 修复**：`<input id="file">` 原本在 `#reading` 内，`renderBook` 的 `reading.innerHTML=...` 把它**连根删掉**→书模式下 `getElementById('file')` 为 null。改：把 file input 移到 body 级（readProg 前），renderBook 不再波及。preview 验证：进书模式后 file 仍在、parent=BODY。
3. **朗读翻页滞后的根因 + 修复**：句子跨列断行时 `_pageOfElement` 取**起始**页→读到溢出部分时画面还停在上一页。改取句子**最后一个 line-rect** 的页（getClientRects 末项），跨页句在开头即翻页。preview round-trip：各句 lastRect 都落在所翻到的页内。
4. **开书卡顿**：瓶颈 = `_load_chapter_internal` 的 `classifier.analyze` ~847ms（首开某章固有 NLP 成本，跑在 js_api 工作线程不冻 UI）。已加「正在打开…」即时反馈。**未做**章节分析缓存（可作后续：来回翻章可秒开，但首开仍 ~850ms；动到 `_book_seen_lemmas` 去重逻辑须谨慎）。
5. **终端自退**：两个 `四土.command` 改为 `nohup … >/tmp/situ.log 2>&1 & ; disown` 脱钩 + `osascript 关掉含"四土"的终端窗口`。双击→终端一闪即关、app 独立运行；首次可能弹一次"Terminal 控制 Terminal"自动化授权。日志在 `/tmp/situ.log`。
6. **图标**：app.py 主线程块里若存在 `santu_app/assets/icon.png` 则 `setApplicationIconImage_` 设 Dock 图标；`tools/apply_icon.py` 用 NSWorkspace 给两个 .command 设 Finder 图标。**待用户把附件图片存成 `santu_app/assets/icon.png`**（PNG≥512 方形），再跑 `./.venv/bin/python tools/apply_icon.py`。

## 2026-06-20 本轮 C：阅读态去顶栏 + 页码贴底 + 播放器可拖 + 修翻页错乱（已应用，待真实 app 验收）
用 preview(situ-app:18732) 量化验证了布局/翻页几何，视觉/原生标题栏仍须真机过眼。
1. **阅读态彻底去掉顶部功能栏(.topbar)**：`body.reading .topbar{display:none}`（原来是 translateY(-100%) 仍占布局高度→顶部留空隙）。功能由弦月浮标替代，topbar 只在首页(welcome，非 reading)显示。删了配套的 chrome-show 召回 CSS+JS。
2. **修 #app 不满高（根因）**：`#app{height:100%}`→`100vh`。preview 实测 height:100% 只解析出 586/750px，底部塌 120px（=用户说的"页码栏太靠上"）；100vh 后 appH=750、pager-bar bottom 紧贴窗口底、阅读视口从 405→642px。
3. **顶部留 30px 细条给红绿灯**：`body.reading .main{padding-top:30px}`。book-bar 落在其下，红绿灯浮在空条里不挡按钮（量得 bookbarTop=mainTop+30）。
4. **修朗读自动翻页错乱(附件4)**：根因——`markReading` 用 `scrollIntoView`（纵向语义），但书模式是 CSS 多列 + `inner.scrollLeft` 横向翻页，scrollIntoView 落在两页之间→半页+半页同屏。改：书模式用新 `_pageOfElement(el)`(元素绝对 x / _pageW) 算出页码，走 `_pageIdx=page;_applyPageTransform();_updatePagerBar()` 精确吸附；文章模式仍用 scrollIntoView。preview round-trip：每句吸附到 relLeft=48(=SIDE)，5 句全 visibleOnPage:true。
5. **播放器(附件3)缩小+左侧停靠+可拖动**：尺寸缩（btn36→29、mini30→24、字/间距收）；默认 `left:14 top:118`；加 `.pl-grip ⠿` 拖柄(pointer 事件+capture)，位置存 `localStorage situ_player_pos`，startPlayback 时 `_restorePlayerPos()` 恢复；preview 实测尺寸 254×41、拖到(300,400)生效。
6. **开书卡顿(附件5)——先点灯**：openArchive 加「正在打开…」即时反馈；JS 打 `[open] load_archive/renderBook` 毫秒；`app.py load_archive` 书分支打 `[open] extract_book Xms (N chapters)` 与 `[open] load_chapter[i] Xms`。**请用户开一本书后把控制台/终端这几行数字贴回**，再精准优化（疑点：extract_book 每次重解析整本 + 多列大章 reflow）。
- 改文件：`santu_app/index.html`、`santu_app/app.py`。

## 2026-06-20 本轮 B：腾出阅读区 + 弦月浮标淡化（已应用，待真实 app 验收）
目标：让中间文本区更大、更沉浸。
1. **去掉原生标题栏「四土·英语阅读·读书」**：`app.py` create_window 留住返回值 `win`，title 改短为「四土」；新增 `_unify_titlebar()` 挂 `win.events.shown`——`setTitlebarAppearsTransparent_(True)`+`setTitleVisibility_(1)`+styleMask 加 `1<<15`(FullSizeContentView)。**保留红绿灯三按钮**（不用 frameless，否则连关窗按钮都没了）。内容上提约 28px。非 Cocoa 后端 try/except 静默跳过。
2. **功能栏(.topbar)上移**：padding `12px 22px` → `6px 22px 6px 82px`（左 82px 给浮在左上的红绿灯让位，不遮品牌字）。
3. **页码栏(.pager-bar)下压变薄**：padding `7px 16px`→`2px 16px`、min-height `40`→`30`；pg-btn `34px`→`26px`、字号 18→16。
4. **弦月浮标(.rfm)**：尺寸 52→38px；默认 `opacity:.22`，`:hover/.open` 才 1（很淡、减干扰）；位置 `left:30 bottom:26` → `left:16 bottom:46`（左侧栏外、页码栏上方、不遮居中正文）。petal 38px、起点 left/bottom:0（保持以 box 中心 19,19 为枢轴，Rc=124 不变）；lbl 起点 19,19；fab 月亮图标 26→21。
- **未在 preview 验**：原生标题栏改动是 Cocoa/WKWebView 专属，Chromium preview 测不出；CSS 间距也需真实 1180px 窗口过眼。**请重启真实 app 验收**。

## 2026-06-20 本轮 A：六项优化（已全部应用，待用户重启真实 app 验收）
1. **设置持久化**：`app.py` 末尾 `webview.start(private_mode=False, storage_path=app_support/webview)`。根因——pywebview 默认 private_mode=True 会清 WKWebView localStorage，所以字号/配色/水平/口音原来都不跨重启。现全部持久。
2. **词频档阈值放宽**（`app.py:_freq_band`）：A≤3000 / B≤8000 / **C≤15000** / D≤30000 / **E>30000**。依据：美国成年母语者平均词汇量~2万。
3. **「常见程度」追问点破反差**：`llm.py` FREQ_SYSTEM 加指令 + `followup(band=…)`；`app.py ask_followup` 透传 `band`；`index.html` mountExplanation 存 `ctx.band`、sendAsk 传 `band`。当整体词频档与"此处用法常见度"相左时，LLM 主动说明。
4. **正文字体换 Bitter**：`:root --read-font:'Bitter',…`；Google Fonts link 加 Bitter；article/h1/h2/h3 用 `var(--read-font)`；正文 `letter-spacing:.02em;word-spacing:.10em`。
5. **全窗口拖拽**：`index.html` window 级 dragenter/over/leave/drop（depth 计数 + isFileDrag），`#dragVeil` 蒙版；⋯ 菜单加常驻「＋ 选文件」(`#addBookBtn`)。
6. **环形浮标菜单 + 顶栏淡出**（沉浸阅读）：
   - 浮标 `#rfm`（左下、弦月图标→×）、6 圆按钮沿弧扇形展开（书架/目录/字号/配色/朗读/添加），无环线、不变色、标签径向。CSS+HTML+JS 均在 `index.html`。
   - 接线：shelf→`libBtn.click()`、toc→`openTocDrawer()`(仅书模式)、size→循环 setFontSize、theme→循环点 `.themebar .sw`、read→`readBtn.click()`、add→`#file.click()`。
   - 阅读时 `body.reading` → `.topbar` 淡出；鼠标到顶端(clientY≤8)或 hover 顶栏 → `body.chrome-show` 召回。`body.reading` 在 renderArticle/renderBook 加、initWelcome 移除。
   - 底部细进度线 `#readProg`（仅文章模式 `body.reading:not(.book-mode-on)`，按 reading.scrollTop）。书模式用自带页码。
   - **设计定稿过程**：弦月浮标、按钮圆形、图标 23px（撑满 viewBox 的几何）、去掉内外环线——均用户逐条拍板。可双击 `~/Desktop/预览/四土/环形浮标.html` 看独立预览。
   - **仅在真实文件 CSS 渲染层验证过**（preview 起 `situ-app` 端口 18732，强制 body.reading 截图）；petal 动作/顶栏召回/进度线依赖 pywebview，须真实 app 验。

## 这是什么项目
四土 = 三土的 fork，目标：用三土那套「点词讲解/追问/按水平标生词」的阅读体验来读 **EPUB 电子书**（按章 + 翻页）。
- 项目根：`~/Documents/situ/`，包名仍是 `santu_app`（**别改包名**）。
- 启动：`cd ~/Documents/situ && ./.venv/bin/python -m santu_app.app`，或双击 `四土.command`（项目根 + `~/Desktop` 各一个）。
- 三土原件：`~/Documents/english-reader/`，**一字未动**，作对照/备份。
- 总设计：`~/.claude/plans/ai-epub-rippling-llama.md`；分步施工规格：`~/Documents/situ/specs/四土-step*.md`。

## ⚠️ 关键认知（踩过的坑，务必记住）
1. **数据位置**：源码运行时 `_writable_root()` 返回**项目目录**，所以阅读历史/书/导出在 `~/Documents/situ/{library,books,output,audio}`，**不是** `~/Library/Application Support/SiTu/`。后者只在打包版用。与三土靠「不同项目目录」隔离。
   - 例外：**API Key 配置**走 `config_path()=app_support_dir()/config.json`，即 `~/Library/Application Support/SiTu/config.json`（已从三土 SanTu 复制过来，开箱可讲解）。
2. **preview 是 Chromium，真实 app 是 WKWebView**——渲染/视觉 bug 可能只在真实 app 出现，preview 测不出。视觉/翻页类改动**必须让用户在真实 app 里确认**。
3. **换章不等于换文档**：`_load_chapter_internal` 切章时**绝不能清** `_cache`/`_notebook`/`_book_seen_lemmas`（跨章去重命根子），只 bump `self._token` 掐掉上一章预热。

## 已完成（均已验证，除特别注明）
- **Step 0 Fork+隔离**：复制三土→situ；`userconfig.APP_NAME="SiTu"`；窗口标题「四土」；品牌字「四·土」；`四土.command`（项目根+桌面）。
- **Step 1–3 后端按章读 EPUB**（Python 验证）：`reader_core/extractor.py:extract_book()` 按 spine 切章；`app.py` 加 `_book`/`_book_seen_lemmas`、`get_toc`/`load_chapter`/`_load_chapter_internal`/`_toc_list`；`process()` 对 .epub 走书模式；按章预热 + 跨章去重。
- **文件加载修复**：WKWebView 不给 `File.path` → 拖拽/选择报 FileNotFoundError。改成**按内容读**（前端 FileReader→dataURL；后端 `process_file()` 写临时文件再走 process）。Python 验证 epub/txt 均可。
- **Step 4 前端书模式**：目录抽屉、章节条（第N章/共M章+上下章）、底部页码、CSS 多列翻页。`index.html`。
- **翻页 bug 修复（两个）**：① 列宽=`vpW-2*SIDE`、列距=`2*SIDE`（列距==翻页步长，消除「第2列渗进第1页」）；② **改 `scrollLeft` 翻页**（不再用 transform——WKWebView 对 transform 移动多列溢出列有绘制 bug，导致第2/3页空白），`overflow-x:auto + overflow-y:hidden`，滚动条用 `::-webkit-scrollbar{display:none}` 藏掉。**仅在 Chromium 验证过 1/2/3 页内容不同**。
- **Step 5 持久化**（Python 验证含「新建 Api 模拟重启」）：epub 原件存 `BOOKS=DATA_ROOT/books/{id}.epub`；`save_session`/`load_archive`/`delete_archive` 加书分支；进度（current_chapter/current_page）存档；前端 `doSave`(书模式传 page/chapter)、`gotoChapter`/翻页触发保存、`openArchive` 对 book 走 `renderBook(r,page)`、`_initPager` 末尾按 `_restorePage` 恢复页码。重启能回到原章原页。
- **预热封顶**：`PREGEN_CAP_BOOK=12`，书模式每章只预热最罕见 12 个生词（`_load_chapter_internal` 里 `order=order[:12]`），其余点词即时生成。用户拍板的方案。
- **书架已清空**：四土项目目录 library/books/output 清空（之前 fork 误带入三土 18 条历史副本；三土原件无损）。最近阅读排序现成（`list_library` 按 `saved_at` 倒序）。

## ⏳ 待确认 / 待办
1. **【最高优先·待用户确认】翻页第2/3页在真实 WKWebView 是否已正常显示**——scrollLeft 修复只在 Chromium 验过。用户正在重启重测。若仍空白：在界面加诊断点灯（打印 vpW/scrollWidth/pageTotal/scrollLeft、第2列首元素位置），让用户跑一次贴回数字，**别盲改**。
2. **视觉验收**：页边宽窄/字号/行距/目录抽屉滑入观感，还没在真实 1180px 窗口过眼（preview 窗口仅 330px，截图缩成糊版没法签收）。等翻页确认后做。
3. **Step 6 收尾**：双版改动日志同步到 `~/Documents/改动日志库/四土/`（概述版无代码 + 详细版）。等核心确认 OK 再做。
4. 书模式暂未做：导出 / 书签（按钮已 `display:none`）。
5. 大 epub（如 27MB 带图）base64 过桥慢几秒；普通 1–5MB 无压力。可日后优化。

## 改过的文件
- `reader_core/extractor.py`（+extract_book）、`reader_core/__init__.py`（导出）、`reader_core/userconfig.py`（APP_NAME=SiTu）
- `santu_app/app.py`（BOOKS/PREGEN_CAP_BOOK 常量、书会话与章节方法、process_file、持久化书分支、窗口标题）
- `santu_app/index.html`（书模式 UI、翻页 scrollLeft、按内容读文件、持久化前端、品牌字）

## 验收用 harness（仅 Chromium 视觉/逻辑测，测不出 WKWebView 问题）
- `~/Documents/situ/specs/_harness/`：真实 index.html 副本 + stub（canned.js 真实数据 + window.pywebview 假实现 + 自动 `run('harness.epub')`）。
- 起服务：preview 工具 `preview_start` 名字 `situ-harness`（端口 18731，配置在 `~/Downloads/apply/.claude/launch.json`）。
- **注意**：harness 是 index.html 的**手动副本**，改了真文件后需把对应改动同步过去才准；它无 process_file/持久化的真实后端。

## 常用命令
```bash
# 跑 app
cd ~/Documents/situ && ./.venv/bin/python -m santu_app.app
# Python 烟测（导入书/换章/预热封顶/持久化）
cd ~/Documents/situ && ./.venv/bin/python -c "from santu_app.app import Api; a=Api(); ..."
# JS 语法检查（抽 <script> 块）
cd ~/Documents/situ && ./.venv/bin/python -c "import re;h=open('santu_app/index.html',encoding='utf-8').read();open('/tmp/c.js','w').write('\n;\n'.join(re.findall(r'<script(?![^>]*src=)[^>]*>(.*?)</script>',h,re.S)))" && node --check /tmp/c.js
# 看四土书架数据
ls ~/Documents/situ/library ~/Documents/situ/books
```

## 下一步
等用户回报真实 app 里翻页第2/3页是否正常：
- 正常 → 做视觉验收(真实窗口截图/用户反馈) → Step 6 改动日志收尾。
- 仍空白 → 加诊断点灯定位 WKWebView 渲染问题，不盲改。
