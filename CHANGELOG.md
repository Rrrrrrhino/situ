# 四土 · CHANGELOG

---

## 2026-07-08 · 修复：复盘窗 WebView 抢占系统麦、干扰微信等通话软件（Opus）

> 用户报告：开着四土时用微信桌面版语音通话，对方听我方声音忽大忽小；关掉四土即恢复。取证坐实（系统
> `log show` 见 `com.apple.WebKit.GPU` 挂 `AVAUVoiceIOInitializeListenersForBundleID`，微信侧 `AVAUVoiceIOChatFlavor`）。

- **根因**：复盘/练习窗 WKWebView 的 `getUserMedia` 写死 `echoCancellation:true`。macOS 上该开关会让 WebKit
  拉起**系统级 VoiceProcessing IO(AUVoiceIO)**，对共享麦克风套系统 AGC，与微信的通话 VoiceProcessing 抢同一支
  麦的增益 → 对方听我方忽大忽小。**非原生 DualTrackRecorder**（它只在主动录音时占麦、录完 exit）。
- **修法**：桌面复盘窗(`window.REVIEW_ONLY`)一律不请求浏览器级语音处理（`echoCancellation/noiseSuppression/
  autoGainControl` 全 false，桌面主录音本有原生 AEC，这层多余）；手机版(独立设备、放外放音)保留 true。
  改 `santu_app/mobile/review-practice.js` + `review-input.js` 两处 getUserMedia；同步 cp 进冻结版
  `/Applications/四土.app` 的烘焙副本。语法+服务器实际吐出+冻结包副本均已复核。
- **生效**：需彻底重开复盘窗（旧进程加载旧码+残留热 VPIO）。记忆卡 `reference_situ_webview_vpio_hijacks_mic`。

## 2026-07-08 · 仅标记·批ε：右栏整块做成可折叠抽屉（Opus，待真机验收）

> 用户诉求：仅标记＝沉浸捕猎态，右栏那一竖列内容分散注意力，希望能收起、想看时再拉出；且把整块
> （讲解／生词本／收获本就共用一区）做成抽屉，讲解态、仅标记态都能自由开关。把手样式经四轮打磨
> （对比图见 `previews/仅标记-收获抽屉-*.html`，含可交互版）→ 用户上传参考图，最终＝**左圆角拉手 tab · 悬停浮现**。
> **只动 `index.html`**（右栏 chrome 显隐，核批划痕层/批α 收获管线一律没碰）。

- **整块抽屉**：`.panel`（372px）加 `transition:margin-right .22s`；`body.drawer-collapsed .panel{margin-right:-372px}`
  滑出，正文（`.reading` flex:1）自动占满。无弹跳、印刷品克制。
- **把手＝左圆角拉手 tab**（把手样式经四轮：细握把→四把手对比图→四款可交互对比→用户上传参考图定，照图复刻）：
  `#drawerGrip` = `position:fixed` 44×82 圆角矩形（`border-radius:12px 0 0 12px`、右缘贴抽屉分隔线、
  `border-right:none` 与分隔线相融、纸底暖线边、柔灰 `--muted` 雪佛龙 SVG，hover 转 `--accent`）；
  `body.drawer-open` 时 `right:372px` 贴抽屉左缘、常显、兼作收起，雪佛龙 `rotate(180deg)` 翻成 ›；收起时回 `right:0`。
- **平时隐藏·悬停才现**（用户明确诉求：沉浸阅读不被把手打扰）：`.drawer-grip{opacity:0}` 默认藏；
  右缘 66px 透明热区 `.grip-hot`（仅 `body.reading.drawer-collapsed` 时 display:block）→
  `.grip-hot:hover ~ .drawer-grip, .drawer-grip:hover{opacity:1}` 悬停浮现；展开态 `opacity:1` 常显。
- **两态各记偏好**：`_drawerPref={ex:true,capt:false}`（讲解默认展开、仅标记默认收起）存 localStorage；
  `_drawerMode()` 按 `captMode` 取键，`toggleDrawer()` 翻转并记住，`toggleCaptMode` 里 `_applyDrawer()`
  切模式即按该模式偏好收/展。
- **自动拉出抽屉**（避免收起态点了没反馈）：`ensureDrawerOpen()` 挂在真·用户手势——点蓝词（`explain(m)` 后）、
  点短语带/讲解选区（`showPhrase`/`explainSelection`）、点「收获」钮（`artSheafBtn`/`bkSheafBtn`，两态都开）。
  程序化 `switchTab('ex')`（换文档复位）不触发，故仅标记默认收起不被打破。
- **验收**：CSS 几何用逐字照抄的抽屉 CSS 建 harness 截图（展开/收起两态：滑出+正文占满+握把移位均正确）；
  真文件载入预览确认 `toggleDrawer/_drawerPref/_applyDrawer` 全定义、`_applyDrawer()` 已跑、console 零报错
  （＝整段内联脚本语法无误）。主窗无 SW，`/Desktop/四土.app` 源码启动器可即时验，无需 build.sh。
- **未装 `/Applications/四土.app`**：该冻结包需 `bash packaging/build.sh` 重打包才更新；本批留待用户
  `/Desktop/四土.app` 过眼确认握把手感后再打包装机（避免拍板前的一次白建）。

## 2026-07-08 · 仅标记·批δ′：真机反馈修复轮（Opus，已装机）

> 用户真机测试批δ 后的第二轮反馈。**取证优先**（连续问题先拿数据坐实再改）。
> 动了 `index.html` + `app.py` + `mobile/js/core/audio.js`（bundle 重建）。build.sh EXIT=0、自检哈希一致。

- **收获区排序竞态修复（批δ⑤/⑥ 的真 bug）**：`scheduleSave` 防抖 **1500ms**，而 `get_sheaf` 惰性删除
  过滤读的是**落盘的** captures——原 `_shMaybeRefresh` 400ms 就刷新会读到旧磁盘、取消/删的条目残留。
  改：`_shMaybeRefresh` **先 `await doSave()` 再 openSheaf**，落盘后过滤才看得到删除。
- **换章后跳回原文的视角修复**：`gotoChapter` 内 `switchTab('ex')` 会把右栏切到讲解——`_shScrollToSrc`
  跨章后**补 `switchTab('sh')` 切回收获**，视角留在用户操作处。
- **收获「原文·第N章」标号错**：书籍 idx 常含封面/前言错位（顶栏也是 `bookToc[idx].title`＝"Chapter 1"
  但 idx=1）。`_shSrcRef` 改用 **`bookToc[it.ch].title`**（与顶栏一致），回落才用 `ch+1`。
- **词块生成「卡住~1分钟」根因＝90s 阈值**（`SHEAF_TRIGGER_SECS=90`，新增<6 条要等距上次>90s 才起批，
  切章不重置计时器）。新增后端 **`nudge_sheaf`**（绕过被动阈值、仍受单飞锁保护）：收获 tab 开着（用户在看）
  时 `openSheaf` 里有未生成划痕且没在跑就即时催生——「读完即得」在真看时兑现。
- **收获条目删除键（用户加码：收获区每条都要能删）**：每条收获右上加 `.sh-del`（hover 陶红，复用 `GV_SVG.del`），
  点它解开对应划痕（当前章 DOM span）+ 删记录 + 落盘刷新 → 该条消失；`_shDeleteEntry` 走 `CSS.escape` 选择器。
- **复盘窗喇叭无声 → 根因坐实 + 已修**：撇号先用 `esc` 往返测试排除（只转义 `&<>"`）。**取证定案**：复盘窗
  跑在 `127.0.0.1:18760`（server.py，同进程有原生 Api + 用户真凭证），但音频走的是**客户端引擎读本 WebView
  IndexedDB 的空凭证** → MiniMax=OFF → 词组退回有道、多半无音（curl `/api/get_audio` 对 "get one's arm
  broken" 直接 ok+33KB 证明原生引擎能出音）。**修**：`audio.js getAudio` **优先打 `/api/get_audio`**（原生引擎，
  有凭证+缓存），失败/无此路由（纯手机 PWA）再落客户端引擎——手机行为不变。`[audio]` 诊断日志保留。
- **定位提示改「词块级 + 可见」（真机 bug 修复 + 用户拍板 D·绿洗色）**：原 `_shScrollToSrc` 高亮**根本不可见**——
  带 `.8s` 过渡去设背景色（＝慢淡入）却 60ms 就清掉，峰值≈0。改：① 定位到**划过的那几个词**（整组
  `.capt[data-group]` span）而非整段；② 用户拍板 **D·绿洗色**——`_shCueChunk` 把词块从琥珀瞬时洗成橄榄绿
  （`rgba(95,122,88,.42)`）再 1.1s 淡回琥珀；③ 瞬时点亮走「先无过渡设值→双 rAF→挂过渡淡出」，避开旧 bug；
  ④ 划痕 span 没渲染时 `_shCueBlock` 整块淡绿兜底。mockup：`previews/收获-原文定位提示-mockup.html`（现状蓝/
  D绿洗色/D′绿描环，真实琥珀词块上对比；桌面副本已更新）。
- **讲解卡删除入口（用户拍板方案①）**：`mountExplanation` 仅主面板（isPanel）底部加「从生词本移除」
  （`.ex-del`，hover 陶红），key 用生词本同一套（词=lemma／短语句=§key），点后 `delete_global` + 反映
  内存 `_nbList` + `refreshNbCount`；生词本内联展开不重复挂。加上批δ 的生词本 tab／大视图，删除入口now齐。

---

## 2026-07-08 · 仅标记·批δ：收获集打磨 + 词块发音 + 删除入口 + 复述稳健（Opus，已装机）

> 规格：`specs/仅标记-批δ-收获集打磨与发音删除-施工规格.md`（用户真机测试反馈 + 两个新诉求）。
> 动了 `index.html` + `app.py` + `mobile/review-input.js` + `mobile/review.css` +
> `mobile/js/core/localapi.js` + `mobile/js/core/llm.js`（core 两文件已 `npm run build` 重建 bundle）。
> build.sh EXIT=0、自检哈希一致、grep 坐实新 id/函数全 baked。「讲解模式」=仅标记模式的对立面（沿用旧文案）。

- **① 书页「收获」钮**（批γ 收尾已改源码，本批装机验证）：renderBook 重建顶栏后 `bkSheafBtn` 监听
  在 renderBook 内重挂，不再挂到会被替换的旧元素上。**待真机点一下确认**。
- **② 复述「挑词」偶发静默空白 → 点灯 + 稳健兜底**（`localapi.js` retell_targets、`llm.js`
  pickRetellChunks）：pickRetellChunks 调用失败不再静默返回空，改带 `_pickError:true` + `console.warn`
  归因；retell_targets 区分「调用失败/异常」与「正常挑 0 个」——**只有前者**才 `ok:false`（触发复盘窗
  现成的「目标表达没取到 [重试]」分支），失败**重试 1 次**；notebook 有部分命中时仍出那几条不误报失败。
- **③ 词块发音小喇叭**（新诉求）：**a.** 复述题签卡每枚 chip 内加 `.rc-say`（复用 mobile `SVG.speaker`
  细线，15px），点它 `playAudio(text)` 只发音、`stopPropagation` 不展开 chip（`review-input.js`+`review.css`）；
  **b.** 阅读页右栏收获条目标题旁加 `.sh-say`（复用 `GV_SVG.say`，17px），点它 `speak(chunk)` 发整块音、
  不触发勾选/跳转（`index.html`）。导出的自包含 HTML 不带喇叭（静态无 JS）。无 key 时 get_audio 失败静默。
- **④ 换章后点收获里前章条目的「原文·第N章」→ 自动跳章定位**（`_shScrollToSrc` 改 async）：书模式跨章
  先 `await gotoChapter(ch)`、等 `_initPager`（180ms）分页就绪，再 `_jumpToPageOfEl(block)` 翻到该块所在
  列并呼吸高亮；不再提示「先翻页」。
- **⑤ 收获区排序 + 自动刷新**：**a.** `_shOrder` 排序键补 `start`（前端从 `_captures` 按 cid 反查偏移，
  不动批α 落盘 schema）→ 同段多条严格按 章→块→偏移；**b.** 收获 tab 开着时 `captureRange`/`uncapture`
  成功后防抖 400ms `openSheaf()`（`_shMaybeRefresh`），新划的从 `_shLiveHeads`（前端同后端合并口径求分组首条）
  即时冒骨架、取消的即时消失。
- **⑥ 取消划痕后收获区幽灵条目 → get_sheaf 惰性删除同步**（`app.py`）：get_sheaf 返回前用当前
  `_load_captures`→`_merge_captures` 的活 cid 集过滤 items/pending，**不落盘**（真正落盘删除仍由下次
  `_run_sheaf` 收口），即使没触发生成也永不返回幽灵条目。
- **⑦ 讲解模式下点过/收藏过的词块删除入口**（`index.html`+`app.py`）：右栏「生词本」tab 每行加 `.nb-del`
  小垃圾桶（复用 `GV_SVG.del`，hover 陶红）、生词本大视图「本篇」范围也放开 `.gv-del`（去掉 global 门控）；
  点击 `delete_global({key})` 直接删 + status 提示「已移除 X」（与大视图一致，不用原生 confirm）。
  后端 `delete_global` **顺带 pop `self._notebook`** 清 session 镜像，本篇+全局一并删干净、重开不复现。

---

## 2026-07-08 · 仅标记·批β+γ：收获集视图 + 导出 + 复述衔接（Opus，已装机）

> 规格：`specs/仅标记-批β-收获集视图-施工规格.md`。样机 previews/仅标记-捕获反馈-mockup.html ②③页
> 甲改组=完工样例。动了 `index.html`＋`app.py`＋（γ 用户拍板）`mobile/review-input.js`+`review.css`。

- **入口+tab**：文章页/书页胶囊「仅标记」右侧各加「收获」钮（`artSheafBtn`/`bkSheafBtn`，麦穗线稿）；
  右栏 `.panel` 加第三 tab「收获 N」（徽标=当前划痕分组数，划/取消即时更新）。点开=对照阅读
  （正文在左、收获集在右），不另起 overlay。
- **条目渲染（甲改·墨化，逐字照样机 CSS）**：372px 右栏改上下结构——词块标题（原档色衬线600）+
  淡底印刷章档签 + snapped 归位小注 + 例句竖排（虚线分隔·首句原文带「原文·第N段/章」srcmark）+
  释义/用法注（12px 细线左框）。整区变色=标题原档色、正文档色墨（深一阶）；例句核心词块仅加粗700
  无高亮底。**词形加粗匹配**：先整块直配、配不上丢首词配尾串再吃回一词（take a toll on→took a toll on
  也能加粗），JS `_shBold` 与 Python `_sheaf_bold` 同口径。
- **排序+揭晓**：seg 按章节序⇄按档位；揭晓=显影无门槛，打开即读，档色 transition:color .55s 洇入、
  条目错峰 90ms、每 tab session 只播一次；pending 条目从 `_captures` 合成骨架占位（中性标题+骨架条），
  轮询 get_sheaf 每 3s 到齐逐条补齐。
- **导出**：`export_sheaf_html({doc_id?})` → 完全自包含 HTML（双列甲改原版，内联全 CSS、零外链零JS）落
  OUTPUT_DIR + Finder 高亮显示；文件名「收获集-{标题20字}-{YYMMDD}.html」。
- **复述衔接（γ，用户拍板 A + 两条加码）**：条目 hover 出勾选框；选中 ≥1 条时底部浮「用这 N 条去复述 ›」
  → `open_review_retell({title,text,chunks})`（app.py 把 chunks 塞进 pending 条子载荷）。复盘窗
  `_setRetell` 现认 `payload.chunks`：**① 勾选送来的直接用、绝不再自动挑词**；**② 非勾选来源不再进屏
  自动生成，改为「挑几个值得练的词块 ›」按钮，点了才挑**（`generated` 标志门控；`_fetchRetellTargets`
  挑完置位）。只改 review-input.js（`<script src>` 直载、不进 bundle）+ review.css 一处按钮样式；
  retell 只在 REVIEW_ONLY 桌面复盘窗显示，手机端天生不受影响。
- **验收证据**：preview 真 CSS+真渲染函数喂 8 条 mock → 甲改墨化观感/三档色/snapped/词形加粗/pending
  骨架/双排序全过（截图过眼）；导出 HTML 真跑 3 条 → 自包含零外链、双列版式、三档色/归位注/出处齐全
  （截图过眼，桌面预览副本 ~/Desktop/预览/四土/收获集导出-样例.html）；复盘窗两状态真跑（源码起
  18799 驱动 #review）→ 无 chunks 显按钮、有 chunks 直接显 chips 无自动挑（截图过眼）；py_compile +
  node --check ×3 过；`bash packaging/build.sh` EXIT=0 装机，自检哈希一致，grep 坐实新 id baked。
- **热修（同日，用户真机测试后）**：书页「收获」钮点了没反应 → 根因=`renderBook` 用模板重建顶栏后
  `bkSheafBtn` 监听没重挂（加载时那次挂在被替换掉的旧元素上，`bkCaptBtn` 在 renderBook 内重挂故没坏）。
  修：renderBook 内 `bkCaptBtn` 监听旁补 `bkSheafBtn` 监听（index.html ~L5330）。已重打包装机、grep 坐实。
  文章页 artSheafBtn 是静态 HTML 不受影响。**其余真机反馈（挑词偶发失败/词块发音/跨章定位/排序/自动刷新/
  取消同步/讲解模式删除入口）整理成批δ**：`specs/仅标记-批δ-收获集打磨与发音删除-施工规格.md`（新窗口做）。

---

## 2026-07-08 · 仅标记·批α：收获集后台生成管线（Opus）

> 规格：`specs/仅标记-批α-生成管线-施工规格.md`。范围围栏严守：**只动 `santu_app/app.py`**
> ＋新建 `DATA_ROOT/sheaf/`；不碰 index.html（批β）、不碰 mobile/、不碰核批 captures 读写、零删除。

- **触发**（`save_session` 两分支各加一行 `_maybe_trigger_sheaf`）：写盘后算 captures 与 sheaf
  的差集，新增 ≥6 条 或 距上次生成 >90s 且有新增 → 起后台 daemon 线程跑批；同 doc 在跑则跳过
  （模块级 `_sheaf_running`+`_sheaf_lock`+`_sheaf_last_gen`）。没配 key 直接不起。
- **合并/删除同步**：同 group 合并为一条（text 按 blockOrd 序拼接，cid 取阅读序首条）；captures 里
  消失的 cid 从 items/pending 删除。`_merge_captures` 纯函数、可单测。
- **生成**：每批 ≤10 条合一次 `deepseek-chat`（**显式覆盖 model，绝不 v4-pro**）；temperature=0
  保分档一致性；max_tokens 3072；response_format json_object；失败重试 1 次，仍失败该批标
  `status:error` 留 pending 下轮再试。词块归位（snapped）＋三档 rubric（正反例写死进 prompt）＋
  释义＋用法注＋例句；原文句逐字置 `sents[0]`（src:true），例句由 LLM 现造（3 句、不与原文雷同）。
  每批落盘一次 → 批β 可渐次显影。单次最多 20 批（200 条）封顶防失控。
- **原子写**：`_write_sheaf` tmp+os.replace（学 index.json 半截坑）。
- **新桥方法**：`get_sheaf({doc_id})` 返回全量 JSON（带 running 标志）；`regen_sheaf({doc_id,cids?})`
  强制重跑（全部或指定条目，后台线程，前端轮询 get_sheaf）。
- **验收证据**：① 单测（mock LLM，6 captures 含跨段同 group+已取消一条）→ items 合并/删除同步/
  pending 收敛全过；② 真跑 DeepSeek 10 条真实划痕 → 归位/例句/tier 全符 §4（`three counties away`
  被正确判非词块给三档）；③ 一致性重跑 **0/9 不一致**；④ py_compile 过。**装机不归 α（批β 一起装）**。

---

## 2026-07-08 · 复述原文抽屉显影阅读器高亮 + 「书架没取回来」根因收口（fable5）

**「Load failed 时有时无」定案（取证，非猜测）**
- 根因＝**已装的 /Applications/四土.app 是 08:44 的冻结包**，而当天 11:27 进源码的
  选材退避重试（0/0.5/1.2/2.5s，专等 Api() 1-3s 词表冷启动）与 SW 拆除都不在包里——
  Opus 改源码看不到效果，正是 `reference_situ_frozen_app_stale` 那条：**改源码必须
  `bash packaging/build.sh` 重打包**（脚本自带装 /Applications + 哈希自检）。
- 「完全退出」不是问题：ps 取证当时**零个四土进程**，用户平时关窗即已退干净。

**复述原文抽屉带出阅读高亮（review-input.js + review.css）**
- `_pickRetellItem` 抽段时同步收 runs：文本节点归属最近块内 `.hl:not(.para)`
  （data-c 色键，缺键旧高亮按 F）相邻同色合并；块本身 `.hl.para` 记段级色键。
  `text` 仍是纯文本（复盘 LLM 与词条定位零变化），`hl` 只在真有高亮时携带。
- `_setRetell` 存 `hl`（text 超 60k 截断时对不上号，整篇弃色）；sessionStorage 随存。
- 抽屉渲染：`r.hl` 在场则荧光笔=`mark.rt-hl`（洗色 var(--wX)）、整段色卡=`p.rt-para`
  （更淡 var(--wpX)=.16）；色键过 `/^[A-FP]$/` 白名单再进 style。
- review.css：`--wA..--wP` 抄主窗亮/暗两套原值，`--wpA..--wpP` 亮=.16 暗=.14；
  mark 圆角+box-decoration-break:clone，para 卡负外边距整块洗色。
- 验证：预览服务器实测（真库「America at 250」F 色段卡显影 rgba(138,128,72,.16)✓；
  合成三段测 C/D/F span runs 与 A 段卡全对✓；日/夜两版截图过眼✓）；node --check 过。

## 2026-07-08 · 「仅标记＋收获集」核批：划痕层装机（设计三件套同批落定）

**设计层（specs/仅标记-收获集-总体设计.md + previews/仅标记-捕获反馈-mockup.html）**
- 九条定案：仅标记开关/方案D捕获反馈/揭晓=显影零门槛/三档 rubric 锚死/整区变色·墨化
  （标题原档色 #5f7a58/#b0894a/#8d8271，正文档色墨 #4f6849/#8a683a/#6b6357）/句内词块仅加粗/
  粗划精修/收获集形态（右栏对照+双排序+导出自包含HTML）/复述衔接；读书会远期搁置。
- 样机三页：①捕获手感 A/B/C/D（用户拍板 D）②收获集揭晓 ③整区变色 甲/甲改/乙 对比（定甲改）。

**核批代码（index.html + app.py，已 build.sh 装机自检一致）**
- `index.html`：`:root` 加 `--captSet/--captDeep`；`.capt` 划痕 CSS（不规则圆角+clone 跨行、
  captDraw 220ms 显影、captSettle 300ms 沉定）+ `#captTally` 拾数 + `.capt-on` 开态；
  `#artTools`/书页 `#barTools` 各加「仅标记」钮；设置面板加 `captSndChk` 纸声开关。
- 捕获层 JS（划选段落卡之后新段）：`captMode` 状态（localStorage 持久）、`toggleCaptMode/
  _syncCaptBtns`、`captureRange`（复用 `_wrapRangeAcrossBlocks` 全套 + 新增 `_captSnapTextNodes`
  文本级词界吸附 + 跨已有划痕守卫）、`captureWord`、`uncapture`（同 group 整组）、
  `_captFeedback`（方案D 动画）、`_captTick`（WebAudio 带通噪声耳语纸声）、`_captBump` 拾数、
  `_applyCapturesForChapter`（书模式换章按锚点重包，照抄 _phrases 口径）、`_captResetForDoc`。
- 三个闸门：reading click（点划痕=取消/点词=收词/其余静默）、document mouseup（划选即收、
  不弹 selbar）、hover-prewarm（captMode 下 return——阅读中零 LLM 调用）。
- 持久化：doSave 双分支加 `captures:_captures`；renderBook/openArchive(文章)/renderArticle
  三处装载/重置；`renderChapterContent` 加 `_applyCapturesForChapter()`。
- `app.py`：save_session 书/文两分支记 `captures` 字段；load_archive 书/文两分支回传。

**验证**
- 浏览器 stub 桥（静态服务 48952 + Proxy 假 api）全链路真实事件路径：划收（吸附半词→
  "fits and starts"）✓ 单击收词（sentence 上下文入 record）✓ 再点取消✓ 拾数增减✓
  save 载荷含 captures + 快照含 .capt✓ 关模式 selbar/讲解零回归✓；截图过眼；
  node --check + py_compile 过；冒烟后服务器已停。
- 书模式划痕逻辑复用批二已验的锚点机制，真书还原留真机验收。

**接续**：批α（生成管线）/批β（收获集视图）规格已立，Opus 串行施工，暗号见 HANDOFF。

---

## 2026-07-07 深夜³ · 口语复盘系统优化：IA 大改版 + 印刷品化 + 夜间版式（已装机，待真机验收）

**结构批α（fable5，commits b01417a / 8d298b7）**
- **拆文件**：review.js(2667行) → review.js(壳) + review-input/result/library/practice 五个平级脚本。
- **头部声明制**：`_setScreen(view,title,{root})` 一处集中管标题/返回键；头部收敛为
  「‹ | 标题 | 积累 | (夜) | ⚙」常驻，十几处手工 hidden 切换全删，子屏进出不再忽隐忽现。
- **积累合体**：错题本+词块库 → 一张「积累」屏顶部 seg 二 tab，4-tab 视图/搜索/多选/操作
  共用一份实现；**多选可跨 tab（错题+词块同场）**。
- **练习引擎统一**：`_showPracticeScreen({kind:'mistake'|'chunk'|'mixed',items})`，写作训练
  与词块练习合一套；mixed 并行调 check_writing+check_chunk_drill 合并展示；话题按钮仅 chunk。
- **根屏重排**：正文新增「最近复盘」3 条+「全部 ›」，历史入口从头部搬进正文。
- **复述选材修**：/api/list_library 失败不再装作空书架——报错原因外显+「再试一次」；
  原文抽取改按叶子块级元素收集段落（DOMParser 无布局时 innerText 退化成 textContent 的坑），
  不再整篇黏成一堵墙。

**视觉批β（fable5，commit faba8a2，风格圣经过检）**
- **印刷品化（仅独立窗，body.review-only 门控，手机版零变化）**：版心 ~704px 居中；
  细线版框替代卡片阴影（圆角≤6px）；主按钮印章化（收窄居中、铅字字距）；seg/chips 档案
  标签化；总评改题眉小字+左细线；录音中=静止印章红点+等宽计时（呼吸动画删除）。
- **夜间版式**：`html[data-night=1]` 全套夜纸令牌（夜纸#1d2028/暖纸白墨/青灰蓝油墨），
  默认跟随系统外观，头部月亮钮手动切换并记住（localStorage situ_night）。
- **复述原文抽屉阅读态**：按段渲染、衬线 15px/1.78 行距、46vh 内滚动——像原阅读界面。
- **目标表达词条化**：LLM 挑词新增「用法骨架」（如 hold off (on sth)）；原文例句**本地
  句子定位**（不让 LLM 编引文，找不到/超240字优雅留空）；点 chip 展开词条卡
  （词块+中文义+骨架+原文句内 mark 高亮）；取词失败给「重试」不再静默消失；
  抽屉开合态记忆，chips 到货重绘不再合上。
- **复述→词块库闭环**：结果屏词块反馈区，库外的复述目标表达带「存为词块」（source=retell，
  义/例句随词条带入），入积累后可练到掌握。

**Opus 并行批（commits 53bf613 / a985eb0+304f4f8 / 317c2ea）**
- **转写热词注入**：设置新增「转写热词」多行输入（volc_hotwords）→ 极速/标准两条转写路
  注入火山 `request.corpus.context`（内联 hotwords JSON）；带 corpus 报参数错自动去 corpus
  重试，热词绝不拖垮转写；单轨路一并接入。22 断言 mock 单测全过。
- **DeepSeek key 全局只填一次**：复盘窗本地没 key 时向 `/api/get_llm_defaults` 借主窗的
  key/provider/model 当默认（内存不落盘）；本地显式保存过则以本地为准；设置里提示
  「正在使用主窗口的 key」。
- **书架接口加固**：RPC dispatch 的 `Api()` 惰性初始化挪进 try（失败也回 JSON error 不再裸
  500）；index.json 改 tmp+os.replace 原子写（并发读不再可能读到半截 JSON→空书架）；
  _read_index 解析失败点灯 stderr。9 断言单测全过。

**待真机验收**：① 复盘窗整体新 IA+新皮（亮/暗各过一眼，月亮钮在右上）；② 选材列表还空不空
（现在若失败会显示原因，复现请把红字发回来）；③ 热词：设置里填 Fable 5/Sesame 录一段验
（若掉慢速通道=极速版不支持 corpus，会自动去热词重试，报回即可）；④ key 全局默认。
**遗留**：转写稿按内容块分割（segments 雏形）未做——要动 LLM v2 schema，单独一批更稳。

## 2026-07-07 夜 · 阅读联动「复述练习」全链路（已装机，待真机验收）

- **三入口一张题签卡**：复盘窗「说一说读过的」选材屏（server 同盘读最近文章）；
  主窗文章页/书页工具胶囊新增「复述」按钮一键带当前篇/章（app.py open_review_retell →
  server retell_pending 条子 → 复盘窗三处自动接）。
- **题签卡**：印章眉题+衬线书名+「原文 ▾」折叠抽屉+目标表达档案标签（①该篇你查过的生词
  star/clicks 优先 ②不足 LLM 现场挑补齐，失败不挡练）+✕；sessionStorage 持久。
- **复盘注入**：书名+原文开头进 context、目标表达走现成词块反馈机制逐条裁决；
  结果/历史 meta 带「复述《书名》」。后端 prompt 零新增。
- 坑：load_archive 文章字段是 article_html 不是 html。
- spec：specs/口语复盘-阅读联动-施工方案.md；mockup 在桌面预览/四土。

---

## 2026-07-07 深夜² · 复盘用时常显 + 录音历史保留 + 文案统一「复盘」（已装机）

- **复盘用时常显**：结果页 meta 行带「复盘用时 X 分 Y 秒（转写 Z 秒·极速/慢速通道）」，
  存进历史回看也有；引擎标记一眼验证火山极速版是否真用上。
- **录音历史**：输入屏保留最近 5 条录音（已复盘的带标签、变灰、可点选重新转写），
  退出重进不再丢；默认选中最新未复盘那条；✕ 从历史移除（音频留盘）。
- **文案**：按钮统一「复盘」；处理中整屏「复盘中… m:ss」走秒；失败恢复输入屏+精准报错。
- 热词注入规格已写好（specs/口语复盘-热词注入-施工规格.md），移交 Opus 窗口施工。

---

## 2026-07-07 深夜 · 转写+复盘全链路提速（6分钟录音≈10分钟 → 预期2分钟内，已装机）

- **转写切火山「极速版」**（server.py）：`recognize/flash` + `volc.bigasr.auc_turbo`，一次请求
  同步返回，不排队不轮询；没跑通自动回退原标准版通道并提示去控制台开通极速版资源。
- **复盘两遍制阈值 350→800 词**（llm.js）：350-800 词检出只有一块，两遍制白付一次串行 v4-pro
  推理调用；单遍 token 预算同步上调。
- **复盘+偷学并行**（localapi.js）：两次互不依赖的 LLM 调用 Promise.all 同跑。
- **进度点灯**（review.js）：处理中分段进度+走秒；完成 toast「转写 X 秒 · 复盘 Y 秒」真实账目。
- ⚠️ 坑入册：改 `mobile/js/core/*.js` 必须 `npm run build` 重建 core.bundle.js 再打包，
  否则新逻辑不进冻结包（打包自检查不出）。

---

## 2026-07-07 晚 · 自动停录修复 + 权限收敛且跨更新存活 + 语料可选中 + 转写并行（已装机）

- **自动停录**（关放音窗口/退全屏掐死 SCStream，71s/166s 两次实锤）：didStopWithError 改为
  自动重启续录（退避 5 次，重取 SCShareableContent），重启后按墙钟给 SCStream 供的轨补零对齐
  时间轴；麦引擎观察 AVAudioEngineConfigurationChange（插拔耳机）同样自动重启+补零；
  全部失败才诚实收尾保数据。
- **权限**：①两个 build 脚本弃 ad-hoc，改签钥匙串稳定自签证书「KuaiLu Codesign」→ TCC 跨
  更新存活，不再每次重授权；②server 直接 exec 录音器二进制（弃 open -n）→ responsible
  process = 四土 → 麦克风/屏幕录制只记「四土」一个名下；权限指引文案同步改。
- **语料 chip 可点选**：点选任意一段（墨框+提示跟随），「转写并复盘」转写选中那段；默认最新。
- **转写并行**：两轨并行 + 轨内 600s 切片并行×3，轮询预算按片长伸缩——半小时录音墙钟≈最慢
  单片，不再串行相加。
- 须最后一次授权（adhoc→稳定证书签名变更所致）：麦克风+屏幕录制与系统录音 勾「四土」。

---

## 2026-07-07 傍晚 · 双轨麦轨全零根修 + 复盘输入屏一条龙（已装机，须重新授权「四土对话录」）

**根因（复现坐实）**：Background Music 虚拟声卡让 VPIO 聚合出 7 声道输入格式，Recorder 按
原生格式 tap 后 AVAudioConverter 7→1 降混**静默产出整场全零**（输入有信号、输出全零、状态成功）
→ me.wav 纯静音 →「没转出内容」。权限/96k采样率两条嫌疑线均已数据证伪。

修三层：
- Recorder.swift：tap 显式单声道（根修）+ micPeak 看门狗（全零→meta 写 micSilent+日志报警）；已重编。
- server.py：转写前测 me.wav 整轨零 → meSilent 回传 + 静音轨跳过火山转写（省 30s 白等）。
- localapi.js：「没转出内容」按根因分成三条精准报错（麦轨静音/两轨全空/只有对方声音）。

输入屏改版（独立窗）：录音卡改名「录音语料」；删「背景/话题」；文本区改「转写后的文本」；
录完就地成 chip（✕ 可丢弃），主按钮「转写并复盘」一键本屏转写（稿落文本区）+复盘直达结果，
dualList 子屏不再出现在桌面流程；_startRecWatch 盯状态翻转自动刷屏。手机版零变化。

验证：CLI 三模式对照实验 + meSilent 端点实测 + preview 双态闭环 + 截图过眼 + 全语法检查 +
core.bundle 重打 + packaging/build.sh EXIT=0 + 装机产物 grep 坐实。
⚠️ Swift 重签 → 用户须重勾「四土对话录」的 屏幕录制与系统录音 + 麦克风，四土 App 退出重开。

---

## 2026-07-07 午后 · 复盘录音入口统一：双轨一扇门（已打包装机 14:56）

根因（用户确认+代码坐实）：ChatGPT 对话「只录到我」= 点的是复盘窗单麦「录音说一段」
（getUserMedia 物理上录不到系统外放的 AI 声）；双轨入口「对话录音」卡只在 mobile 首页，
而复盘独立窗（REVIEW_ONLY）首页被永久盖住——双轨入口在用户真实路径里等于不存在。

修（用户拍板：主入口只留双轨）：
- `review.js _showInputScreen`：顶部新增 `#recCardSlot`，REVIEW_ONLY 渲染双轨录音卡
  （新 `_loadRecCard`，整卡复用 app.js 首页卡全局函数，含权限指引与录音中计时轮询接续）；
  同时不再渲染单麦「录音说一段」按钮。
- 单麦路保留给手机版复盘 + 词块练习作答（门控不删码）；失败不静默降级单麦，明说+指引。
- `app.js` 录音卡文案 → 「和 AI 语音对话、或自己说一段独白，双轨录下，完了来复盘」。

验证：preview 双态闭环（REVIEW_ONLY true/false）+ 截图过眼 + node --check ×2 +
build.sh EXIT=0 + 装机产物 grep 坐实 baked。待用户真机录一段 ChatGPT 对话验收。

另：口语复盘子界面整体优化方案已定盘 → `specs/口语复盘-系统优化-施工方案.md`（交 Opus 执行）。

---

## 2026-07-07 夜·补 · 复盘窗 ⚙ 设置点了没反应（浮层压序）

取证：设置浮层其实每次都打开了——所有 .overlay 同 z-index:45，同级按 DOM 顺序绘制，
ovSettings 在 HTML 里排在 ovReview 之前 → 永远展开在复盘屏身后。修：openOverlay 每次发
递增 z-index，最新打开者浮最上。preview 实测 settings z=47 > review z=46、整屏可见；
已重打包装机。

---

## 2026-07-07 夜 · 复盘窗点击失灵根因修复 + 独立窗化 + 麦克风免重复授权 + 封面竞态 + 来源起名（commit `e8d8645`）

### ① 复盘窗顶栏按钮全点不动（根因：拖窗补丁误伤）

真机取证链：Chrome 同页正常 → computer-use 实点复现（顶栏死/正文活/返回键点下缘偶尔中）→
hitTest 视图层干净 → 合成 NSEvent 直达 DOM → 锁定 `_patch_webview_titlebar_drag`：
类级补丁把**所有** pywebview 窗口顶部 30px 的 mouseDown 吞成 performWindowDrag（本为主窗
隐藏标题栏的拖拽带设计），复盘窗网页顶栏恰在带内。修：门控 `styleMask & (1<<15)`
（NSFullSizeContentView），只有内容铺进标题栏的主窗才走拖窗。合成事件双窗验证：
普通窗顶条 cssY 6/15/25 三点全达 DOM，fullsize 窗仍吞（主窗拖拽保留）。

### ② 复盘独立窗 UX（去掉多余的空 home 界面）

`window.REVIEW_ONLY`（boot 时 hash==#review 立旗）：输入屏藏返回键（MutationObserver 盯
#reviewTitle，子屏自动复显）；输入屏 back 不再退到从未渲染的空 home 壳；boot 先
renderHome 垫底；头部新增 ⚙ 设置入口（`renderSettings`，火山 appid/LLM 配置有处可填）。
手机版 REVIEW_ONLY=false 行为零变化。

### ③ 录音每次都弹「允许使用麦克风」

pywebview UIDelegate 未实现 macOS12+ `webView:requestMediaCapturePermissionForOrigin:…`
→ WebKit 对每次 getUserMedia 自弹授权框。新增 `_patch_webview_media_permission`：
来源为本机(127.0.0.1/localhost)一律 Grant，其他来源维持 Prompt。pyobjc WebKit
_metadata.py:2127 收录该 selector，block 桥接安全；App 级 TCC 首次弹窗保留。

### ④ 剪报封面「先失败后又有了」

根因：save_session 内同步单次下载（timeout 8s），慢图（globalnews 大图）首拉超时→静默无
封面；后续任一次 save 幂等重试成功→封面又冒出来。修：`_cache_article_cover` 12s×2 重试；
下载挪 daemon 线程（save 桥调用不再被慢图卡住最长 8s）；process/save_session 的索引条目
记下 `image` 源地址；`list_library` 发现「有 image 无缓存」的条目每会话后台补抓一次——
漏网封面下次进首页自动愈合。

### ⑤ 自定义来源起名（globalnews.ca → Global News）

globalnews 的 feed `<title>` 为空（curl 坐实）→ 原逻辑回落 host。修：feed 无名时抓站点
首页 `og:site_name` / `<title>`（globalnews 实测得 "Global News"），再不行才回落首字母
大写的 host；用户已存条目已同步修正。

### 验证

合成事件门控探针（NORM 达 DOM / FULL 吞）、preview 复盘窗全流程闭环+截图、真实 globalnews
起名单测、py_compile + node --check；build.sh EXIT=0 自检一致、新码已 baked、装机验活。

---

## 2026-07-07 晚 · 读物精选「自定义来源」入口 + 点开文章全程丝滑（commit `01b1c63`）

### 一、自定义 RSS/Atom 来源（HANDOFF 待办 C）

- **后端**（app.py）：`add_feed_source / list_feed_sources / remove_feed_source`，持久化
  `DATA_ROOT/feed_sources.json`；内置源（DISC_OUTLETS）不动。添加时先拉 URL 试解析
  RSS(`<rss>/<RDF>`)/Atom(`<feed>`)；不是 feed 则在 HTML 里做 **feed 自动发现**
  （`<link rel=alternate type=application/rss|atom+xml>` → urljoin → 再解析），
  找不到才报「这不是 RSS/Atom 源，试试站点的 /feed 或 /rss 地址」。名字/简介取 feed 自身
  `<title>/<description>`（截 40/48 字，剥 HTML 标签），url 归一化去重。
- **前端**（index.html）：来源带尾部新增「＋ 添加来源」幽灵瓦片（虚线边、无油墨条、muted 字），
  点击**就地变输入卡**（同尺寸，URL 输入线 + 添加/取消；Enter 提交、Esc 取消、错误就地红字；
  `renderDiscOutlets` 重入时保值保焦点）。自定义卡与内置卡同形态，band 色按
  `amber/clay/plum/olive/mauve` 轮转（避开内置 navy/green）；hover 右上角出 ✕，
  走 `.cfm` 确认框移除（只删入口，剪报不动）。`allOutlets()`＝内置+自定义，渲染/预取/
  打开/浮层重定位全部统一走它；添加成功立即 `discLoadOutlet` 预取。

### 二、丝滑打开三连（点击响应 / 预取 / 封面占位）

1. **骨架页即时响应**：`run(source, preview)`——点精选文章（或粘贴 URL）立刻
   `renderArticleSkeleton`：真标题即刻上屏（RSS item 的 title 随 `data-title` 传入）、
   doc-meta 行轮询 `get_progress()`（350ms）活显「①抽取正文…②词汇分层…」、正文位置
   9 条浅墨呼吸线（`skBreath` 1.5s）。process 返回后 `.reading-inner.ink-in` 0.25s
   淡入显影，标题原位不动。`_runSeq` 守卫：等待中 `goHome`/再点别篇 → 旧结果作废不渲染，
   goHome 顺手 `setBusy(false)` 防「解析」卡死。
2. **文章预取**（新桥 `prewarm_article` + extractor `fetch_url_html_cached`）：
   浮层渲染完静默预取最上两篇；悬停 `.da` 行 180ms 预取该篇。缓存 TTL 5 分钟、上限 12 条、
   **每 URL 一把 threading.Lock 在途去重**（预取未归时用户点击，`_from_url` 等同一次抓取，
   不重复打网络）。`prewarm_article` 回传 og:image，前端 `new Image()` 预热 WebKit 缓存。
   实测：命中后 `extract_text` 41ms（网络等待 2-4s → 0）。
3. **封面占位不跳版**：`renderArticle` 封面改
   `<div class="doc-cover-wrap"><img class="doc-cover" onload→.ld onerror→wrap.remove></div>`，
   wrap 先按 `aspect-ratio:1200/630` 留位（低调 `color-mix` 底），onload 淡入 0.4s 并释放
   为真实比例——正文不再被迟到的图顶下去。旧存档裸 `.doc-cover` 样式未动，兼容。

### 验证

- 后端隔离单测（scratchpad，FEEDS_FILE monkeypatch）：aeon.co feed 直加✓、nautil.us
  首页自动发现 /feed✓、重复去重✓、非 feed 报错✓、list/remove✓、缓存二拉 0ms✓、
  extract_text 免网络 41ms✓。
- 前端 mock 桥闭环：添加/错误/Esc/移除确认/tc 子标签/↻刷新/top-2+悬停预取/骨架 120ms
  上屏/进度活更/显影/封面 1.90 淡入/中途回首页不拽回，全过；1280 宽 6 源两行网格 +
  亮暗双色 + 骨架页截图过眼。
- `bash packaging/build.sh` EXIT=0，自检一致（`6cc9bdd7…`），装机启动验活。

---

## 2026-07-07 凌晨（阶段10.2b）· 正式原生 App 落地 + 录音卡「从未渲染」硬 bug + 权限指引重写

### 背景

用户两点反馈：① 要的是正常的原生 App（Dock/应用程序文件夹里打开），不是桌面 .command；② 点录音
提示「需要系统权限」，但去系统设置找「四土」找不到，测试卡死。

### 根因与修复

1. **录音卡自阶段10.1 上线起从没渲染出来过（所有环境）**：`localapi.js recorder_status()` 对
   `httpGet` 的返回调 `.json()`，而 `httpGet` 只返回 `{status, text}`——必抛
   `resp.json is not a function`，被 `_renderRecCard` 的 catch 吞成「整卡不渲染」的优雅降级。
   改为 `JSON.parse(await resp.text())`（与 `list_dualtrack` 同款）。教训已记：优雅降级会把硬 bug
   伪装成「环境没配好」。
2. **权限找不到是因为授权对象不是「四土」**：录音由后台引擎「四土对话录」执行，TCC 记在它名下，
   且屏幕录制必须去 系统设置→隐私与安全性→屏幕录制与系统录音 手动开。卡片失败态现在渲染分步指引
   （对象是谁、开哪两处、列表没有先点一次让它申请），原始报错弱化附底部；toast 同步改短版指引。
   中英报错都识别（declined/denied/TCC/-3801/SCStream/权限/麦克风/屏幕录制）。
3. **打包链条为复盘窗补全**：spec 带上 `santu_app/mobile` 运行文件（滤 node_modules/js core 源码/
   _devtest/package*.json）+ `santu_app.server` hiddenimport + `NSMicrophoneUsageDescription`；
   `server.py DUALTRACK_DIR` 绝对锚 `~/Documents/situ/data/dualtrack`（与 Swift 引擎同一约定，
   冻结后不再错指包内只读区）；selftest 追加断言（mobile 进包 / dualtrack 锚家目录）。
4. **冻结版数据根**：`_writable_root()` 冻结时若存在 `~/Documents/situ/library` 则继续用
   `~/Documents/situ`（本机 dev/.command/手机版/引擎共用一份，装正式版书架不变空）；
   没有这份数据的机器（分发给朋友）照旧 Application Support。
5. **单实例守卫**：`_kill_other_instances` 的 pgrep 同时匹配 `santu_app.app`（源码跑法）与
   `/四土.app/Contents/MacOS/`（冻结跑法；带斜杠锚定，不会误伤「四土对话录.app」）。
6. **复盘服务自愈**：`_ensure_review_server` 的已启动旗标改为「连一下才算数」，线程被外力弄死后
   下次点按钮自动重建，不再哑火。

### 产物与验证

- `bash packaging/build.sh` → 四土.app 178M / 四土-mac.dmg 103M；冻结 SANTU_SELFTEST 全绿
  （spaCy 词表 + mobile 进包 + dualtrack 家目录锚）；已替换安装 `/Applications/四土.app` 并启动
  验活（pywebview :42001 监听正常）。
- preview 实测：伪造 TCC 报错文件 → 首页卡片渲染出完整分步指引（截图过眼，暖纸+藏青风格统一）；
  清除伪造文件后交付。
- 已知边界：pywebview cocoa 未实现 WKWebView 媒体捕获授权回调（venv 源码 grep 证实）→ 原生复盘窗
  「页面内直录」暂不可用，主录音流程走首页卡片（Swift 引擎）；Chrome 网页版兜底可直录。

---

## 2026-07-07 凌晨（阶段10.2）· 口语复盘并入真四土 + 「空白死页」三症状根因修复

### 背景

用户凌晨反馈三件事：① 双击「四土口语复盘.command」打开的网页整页空白、左右上角按钮点了毫无反应；
② 桌面「四土对话录」双击完全没动静；③ 最核心的不满——复盘一直是「浏览器里开的网页版」，不在
真正的四土 App 里。用户明令本批不派 builder、由主会话全权修复。

### 根因（先取证后动手，三条都拿到实锤）

1. **空白死页 = IndexedDB 多标签升级卡死**。`DB_VERSION` 当天连升两次（v3→4→5），而全项目没有任何
   `onversionchange` 处理——Chrome 里白天测试留下的旧标签页永远握着旧版本连接，22:47 新开的页面
   `indexedDB.open(v5)` 走进 `onblocked` → `LocalApi.ready()` reject → `boot()` 里这个 await 没有
   try/catch、且按钮绑定 `bindGlobal()` 排在它后面 → boot 无声中止：壳是静态 HTML 所以在，主区空白，
   所有按钮没有监听。旁证逐一证伪了其它假设：server 冷启动实测 0.33s（1.8s sleep 足够）、SW 缓存是
   22:47 当场新建的新代码、五个 JS 文件 node --check 全过、默认浏览器是 Chrome（排除 Safari 解析差异）。
2. **对话录双击「无反应」= 其实早就启动着**。取证发现昨晚双击拉起的进程已连跑 3 小时——启动一直是
   成功的，只是菜单栏图标被 30+ 个图标挤到屏幕外（阶段10 已实测 X=-21），人看不见；今天再双击，
   macOS 对已运行的 App 只做激活，于是「更没反应」。
3. **复盘确实不在真四土里**。整套复盘/词块/录音卡只做在 `santu_app/mobile/`（手机版前端），桌面
   `index.html` 里 grep「复盘/对话录音」为零；所谓桌面入口是拿 Chrome 开手机版网页。

### 做了什么

1. **`mobile/js/core/store.js`** — `openDB` 的 `onsuccess` 里给连接挂 `onversionchange`：别的页面要
   升级就立刻关掉自己这条连接并置空缓存，下次事务自动按新版本重开。多标签互卡从机制上根治。
   （esbuild 重建 `core.bundle.js`。）
2. **`mobile/app.js` `boot()` 加固** — `bindGlobal()` 提到最前（初始化再怎么失败按钮也不能死）；
   `LocalApi.ready()` 包 try/catch，失败 toast「关掉其他四土标签页后刷新」；新增 **`#review` 直达**：
   带着 `#review` hash 打开就直接进复盘屏（等 `document load` 完再进，防 `renderReview` 还没解析到
   的竞态）——给四土原生窗口用。
3. **`server.py`** — 模块级 `api = Api()` 改成带锁惰性单例 `_get_api()`。现前端一律走浏览器端
   LocalApi，`/api/<method>` RPC 只剩兜底；四土在自己进程里起本服务线程时不再白付一份词表+线程池
   初始化。独立运行（.command 路径）行为不变，冒烟三路（静态/recorder/RPC）通过。
4. **`app.py`** — 新增 `Api.open_review()` + `_ensure_review_server()`：先清 18760 上任何外部/孤儿
   进程（「先清端口再总是新起」铁律），在本进程内起 server 守护线程（连通自检、幂等、进程退出线程
   随之消亡不留孤儿），再 `webview.create_window("四土 · 口语复盘", http://127.0.0.1:18760/#review)`。
   已开着再点只聚焦不重开（窗口 closed 事件登记回收）。
5. **桌面 `index.html`** — 首页右上 `#homeUtils` 新增「口语复盘」按钮（与生词本/⚙设置同款 ghost、
   同一排），点击调 `open_review()`，失败原因走 setStatus 说出来。
6. **`对话录/AppDelegate.swift`** — 人工双击（非 `--headless`）启动完成后弹 NSAlert：「四土对话录
   已在待命……打开四土 → 首页右上口语复盘 → 开始录音」。server 拉起录音的 headless 路线零改动。
   `bash build.sh` 重建+签名校验+部署桌面。
7. **`mobile/` → `四土app/assets/mobile/` 全量 rsync**（md5 核对一致）；APK 未重打，下批要真机就重打。

### 验收证据

- 真实 pywebview（WKWebView）E2E：`open_review()` → `{ok:true}`；复盘窗口内 DOM
  `{shown:true, backWired:true, hash:"#review"}`；二次调用 `{ok:true, focused:true}` 不开第二扇窗。
- `_ensure_review_server()` 对着一个活的外部 server 实测：抢占成功、端口自检通过、幂等、测试进程
  退出后 18760 无残留。
- preview 浏览器实测 `indexedDB.open('situ_mobile', 6)` 即刻 success（修复前会永久 onblocked）。
- 桌面首页按钮行截图过眼：三枚 ghost 按钮同排同款，风格统一。

### 数据边界备忘

复盘历史/词块/错题本/设置存在**各自 WebView 的 IndexedDB**：四土原生复盘窗与 Chrome 网页版互不
相通。旧记录仍在 Chrome（双击 .command 可回看）；四土窗口首次使用需重填火山/LLM 设置（之后跨重启
留存）。想搬历史可做一次性迁移批（server 中转 dump），本批未做。

---

## 2026-07-06 深夜（阶段10.1）· 录音并入四土首页（菜单栏图标不可见的解法）

### 背景

菜单栏图标在用户机器上无解——菜单栏 30+ 图标超宽，macOS 把新图标排到屏幕外（CGWindowList 实测
Y=-37），程序本身启动完全正常。用户拍板：录音控制放进四土首页（书架屏），菜单栏 App 降级为可选
副入口；同时为将来「整个打成一个 dmg 分发」铺路。

### 做了什么

1. **`对话录/Sources/DualTrackRecorder/` —— Swift 加 headless 模式**
   - `main.swift`：`CommandLine.arguments` 含 `--headless` 时走新文件 `HeadlessRunner.swift`
     的无 UI 路线，否则走既有菜单栏路线（零改动）。
   - `HeadlessRunner.swift`（新文件）：`NSApp.setActivationPolicy(.prohibited)`（纯后台）；
     仍经 `NSApplication` + delegate 的 `didFinishLaunching` 启动（阶段10 的启动竞态教训继续
     遵守——不在 `run()` 前建任何东西）；`recorderDidStart` 写 `.recorder.pid`（JSON：
     pid/dir/startedAt）；`recorderDidStop` 删 pid 文件、`exit(0)`；`recorderDidFail` 把错误
     写 `.recorder.error`（覆盖写，不弹 NSAlert）、删 pid、`exit(1)`；`SIGTERM`/`SIGINT` 走
     `DispatchSourceSignal` → `recorder.stop()` 正常收尾。
   - `Recorder.swift` 只加一行：`currentSessionDirName` 只读计算属性（供 headless 写 pid 文件
     用），阶段10 原有逻辑零改动。

2. **`santu_app/server.py` —— 三个录音控制端点**
   - `_recorder_app_path()`：三级路径回落（① `SITU_RECORDER_APP` 环境变量 ② `对话录/dist/`
     ③ `~/Desktop/`），为将来 dmg 打包预留唯一改点。
   - `POST /api/recorder_start`：脏 pid 文件自愈（校验 `ps -p <pid> -o command=` 含
     `DualTrackRecorder`，防 pid 重用）；`open -n` 拉起 headless（TCC 权限记在「四土对话录」
     名下）；轮询等 `.recorder.pid`（≤5s）；超时读 `.recorder.error` 附真实原因。
   - `GET /api/recorder_status`：pid 存活 → `{recording:true, startedAt, elapsedSec}`；否则
     `{recording:false}`（若有残留 error 附带）。
   - `POST /api/recorder_stop`：SIGTERM → 轮询等进程退出 + 会话目录 `ready` 出现（≤10s，超时
     不 SIGKILL，宁慢不丢数据）。

3. **首页对话录音卡（`santu_app/mobile/{app.js,style.css}` + `js/core/localapi.js`）**
   - `localapi.js` 三个薄封装 `recorder_start/stop/status`；`recorder_status` 额外挂时间戳
     query 防个别浏览器对同 URL 高频 GET 的缓存复用（预防性加固，取证已排除是本次问题根因，
     详见下方"踩坑"）。
   - `renderHome()`「书架」sec-h 之前插「对话录音」卡：先 `recorder_status()`，请求失败（如
     手机版无 server）→ 整卡不渲染，书架照旧；未录音态细线麦克风图标 + 深蓝主按钮；录音中态
     红点呼吸 + 「已录 M:SS」，每 1s 轮询、态由 status 驱动（刷新页面也能恢复）；停止成功 →
     toast + 「去复盘 →」；失败 → toast 真实 error（含权限关键词追加设置引导）；上次失败原因
     残留时小字灰显、不挡开始按钮。
   - 深蓝主按钮用 `--rev-ui:#16335c`（不是默认 `.btn` 的暖金 `--gold`），红点呼吸复用既有
     `--danger` 陶红，不新造颜色。
   - `go(nav)` 离开 home 屏时清录音卡轮询 interval，防泄漏。

### 踩坑记录

- **本环境无屏幕录制/麦克风权限，headless 首次触发系统授权弹窗会挂起**（`AVCaptureDevice.
  requestAccess` 的 completion 在无人交互环境下不回调）——这是环境限制不是代码 bug，真机上
  用户点弹窗即可继续；spec 已把"首次授权"列为需真机验收项。
- **一次取证走了弯路**：怀疑"浏览器对同 URL 高频 GET 缓存复用导致轮询卡在旧状态"，用 Chrome
  `--headless=new --virtual-time-budget=N` 复测多次稳定复现；后来发现 `--virtual-time-budget`
  会让 JS 定时器虚拟时间快进但网络往返仍按真实时钟走，两者时间轴脱节是伪影根源——去掉该参数、
  用真实时钟重测，8 次轮询全部正确、`elapsedSec` 正常递增。结论：**真实浏览器轮询没有这个问题**，
  之前加的时间戳 query 参数是无害的预防性加固，保留但不依赖它解决"问题"（因为原问题不存在）。

### 验收证据（本会话内，非真机）

- Swift `swift build -c release` 零警告；`build.sh` 打包+codesign 通过。
- headless 完整成功链路真实跑通过一次（意外获得系统授权时）：日志显示
  `麦轨 AEC 启动成功 → startCapture OK aec=true → recorderDidStart → .recorder.pid 已写 →
  收到 SIGTERM → finalize done → recorderDidStop 正常退出`；`recorder_start`→`{ok:true}`、
  `recorder_status` 中途正确显示 `recording:true`+递增 `elapsedSec`、`recorder_stop`→
  `{ok:true,dir:...}`，会话目录含 `ai.wav`/`me.wav`/`meta.json`/`ready` 完整落盘。
- 失败路径也真实触发过一次：`recorder_start` 在 5.5s 内返回真实 TCC 拒绝原因并落盘
  `.recorder.error`，无进程残留。
- server 三端点 curl 逐条过（脏 pid 自愈、路径三级回落、无录音时 stop 报错）。
- 首页卡三态（未录/录音中/带 error）截图三张 + console 零报错；status 失败时整卡不渲染、
  书架正常；轮询清理用 setInterval/clearInterval 计数验证（`go('vocab')` 后确认多清了一次）。
- `npm run build` 重出 bundle；rsync 到 `四土app/assets/mobile/` 后关键文件 md5 一致。

### 需用户真机验收（本环境测不了）

1. 首页点「开始录音」→ 首次授权（麦克风弹窗 + 屏幕录制手动开）→ 真录一段外放对话 → 停止 →
   复盘页走完整闭环。
2. AEC 外放不串音（阶段10 遗留验收项，这次经首页入口一起验）。

---

## 2026-07-06 晚（阶段10 修复）· 对话录双击无反应：启动竞态修复

- **根因**（取证：sample 调用栈 + CGWindowList 量窗口坐标 + 日志时间线）：NSStatusItem 在
  AppDelegate 属性初始化器里创建（`app.run()` 之前），触发 AppKit 抢跑 finishLaunching，
  delegate 丢 `applicationDidFinishLaunching` 回调 → `setup()` 不执行 → 图标窗口死在屏幕外
  （X=-21,Y=-37）。进程活着但菜单栏无图标，表现为「双击没反应」。时序竞态，故偶发（builder
  验证时曾成功一次，误判为环境问题）。
- **修复**：`statusItem` 延迟到 `didFinishLaunching → setup()` 里创建；补 SF Symbol 缺失时的
  标题兜底；`applicationDidFinishLaunching` 进入即打日志（便于未来取证）。
- **附带修复 build.sh 部署坑**：目标 .app 已存在时 `cp -R` 会把新包拷进旧包内部（嵌套 .app、
  签名报 unsealed）。改为先 `rm -rf` 再 `ditto`，并对桌面副本做 `codesign -v` 校验。
- **残留（非代码问题）**：用户菜单栏 31 个图标总宽超屏，新图标被排进不可见溢出区；需用户腾空间
  或后续把录音控制并入四土复盘页（候选方案，待拍板）。
- commit `3aab343`。

---

## 2026-07-06（阶段10）· 双轨对话录音 + 对话复盘 + 偷学：外放场景 AEC 双保险

### 做了什么

1. **`对话录/`（新 Swift SPM 包，菜单栏 App「四土对话录」）——麦轨改用系统级回声消除**
   - `Recorder.swift`：麦轨从 SCStream `captureMicrophone`（裸麦克风）改为独立
     `AVAudioEngine` + `inputNode.setVoiceProcessingEnabled(true)`（FaceTime 同款 VoiceProcessing
     I/O），并显式关闭其默认的其它音频 ducking（不压低 AI 外放音量）。SCStream 只保留系统声音轨
     （AI），`captureMicrophone` 改为 `!aecOK` 动态开关。
   - **失败回落**：`setVoiceProcessingEnabled`/`engine.start()` 任一 throw，记日志、清理引擎、
     回落到 SCStream 裸麦克风老路；`meta.json` 新增 `"aec": true/false` 字段。
   - `AudioTrackConverter.swift` 新增 `convert(_ pcmBuffer: AVAudioPCMBuffer)` 入口（AEC 路用），
     与既有 `convert(_ sampleBuffer: CMSampleBuffer)`（SCStream/回落路用）共享同一套
     `target`/`converter` 缓存逻辑。
   - `StatusMenuController.swift`：菜单文案改为状态驱动——录音中显示「回声消除已开启」；只有
     回落态才显示「回声消除不可用，外放会串音（建议耳机）」。**不再有「建议戴耳机录制」的常驻
     文案**（用户硬红线：绝不能让"戴耳机"看起来像主方案）。
   - `build.sh` 重新打包验证：编译零警告零错误、ad-hoc codesign 通过、`.app` 拷贝到桌面。

2. **`js/core/localapi.js` —— 串音过滤 `filterBleed`（第二道防线）**
   - 新增纯函数 `filterBleed(me, ai)`：对 me 轨每条 utterance，同时满足「时间重叠 ≥50%」+
     「归一化 token 数 ≥3 且对重叠 ai 文本的 containment ≥60%」才判定为串音丢弃；短插话/低相似度
     一律存活（宁放过不错杀）。丢弃条数计入 `warnings`（如「已过滤 2 条疑似串音」）。
   - 接入 `process_dualtrack`：转写结果先过 `filterBleed` 再交织，无条件启用。
   - 单测新增：`_devtest/test_dualtrack_interleave.mjs` 按 spec 写死的三条 fixture（逐字重复必丢/
     真实插话必活/短插话 token<3 必活）断言，另加两条边界（无重叠/空轨不误杀）+ 一条集成烟雾测试。

3. **`santu_app/mobile/{review.js,style.css}` —— 对话复盘 UI（Step 4 全部落地）**
   - 输入屏：`list_dualtrack` 非空时显示暖纸卡「有 N 段对话录音待复盘」（细线圆点图标），点开
     进列表屏（时间+时长），点某段进度态「转写中…约 X 分钟音频，耐心等」→ `process_dualtrack` →
     直接进结果屏；失败 toast 真实原因，会话保留可重试。
   - 结果屏（仅 `source==='dual'`）：原文卡位置换成**对话稿卡**——逐 turn 渲染，speaker 标签
     「我」（深蓝小签 `--rev-ui`）/「对方」（暖灰小签），我的 turn 复用 `_highlightTranscriptV2`
     做错误高亮，默认折叠露前 4 个 turn；**偷学**区块（橄榄绿系标题，复用 `--rev-good`）放在
     「用得好」之后：每条卡片 expression（衬线大字）+ quote（斜体引用）+ why + example +「存为
     词块」，区块头「全部入库」。
   - 历史屏：`source==='dual'` 条目加对话小图标（细线双气泡 SVG）；`_openReviewFromHistory`
     补传 `source`/`dialog`/`steals`，重开完整复现对话稿卡+偷学区。

### 为什么改

用户明确拍板：不接受"外放必须戴耳机"作为唯一方案——外放（不戴耳机）场景下麦克风必然会把
AI 的声音也录进去，光靠物理声道分离不够，需要系统级回声消除兜底；即便 AEC 有残留串音，转写
后再用文本相似度过滤兜第二道底，双保险后才敢在任何场景（含外放）声称"两轨分得清"。

### 验证方式（贴证据，非结论）

- Swift 编译：`swift build -c release` 两次（AEC 改造 + Log 探针）均 `Build complete`，零警告零错误。
- 打包：`build.sh` 全流程通过，`codesign -v` OK，`codesign -dv` 输出 `flags=0x2(adhoc)`。
- **Step 3 验证改用取证式**：`pkill -f DualTrackRecorder` 清孤儿实例（PPID=1，已跑 23:45）→
  `open` 后 `pgrep` 存活，但 Log 文件未出现——用 `sample` 抓栈证明进程稳态在 `mach_msg` 事件循环
  （非卡死）；诊断出根因是 **app bundle 身份触发的 TCC 交互在本 CC 沙盒环境里没有完整 WindowServer
  会话**（`System Events`/`osascript` 也查不到该进程，佐证同一限制），与代码逻辑无关：直接跑
  `.build/release/` 裸二进制（同一份代码，无 bundle 身份）→ Log 文件立即出现
  `StatusMenuController.setup 完成：NSStatusItem 建好，菜单已挂载`，稳定复现两次。
- `node _devtest/test_dualtrack_interleave.mjs`：21 断言全过（含新增的串音过滤 fixture）。
- `node _devtest/test_steal.mjs`：对真实 DeepSeek（自动升级 `deepseek-v4-pro`）跑通，4 条 steals
  （`translate into`/`make a world of difference`/`set clear boundaries`/`for what it's worth`）
  条条有增量、example 地道、无硬凑；边界测试（对方全空）PASS。
- Step 4 preview 闭环：临时起独立测试 server（同一份 `server.py`，绕开另一会话占用的 18760）+
  手工造 fixture 会话（两段合成 WAV + meta + ready）+ `window.fetch` 拦截 `dualtrack_transcribe`
  注入 mock 转写结果（含一条刻意串音）→ 浏览器真实走通：待复盘卡出现「有 2 段」→ 列表 → 进度态
  →（真实 DeepSeek）复盘结果：对话稿卡（我/对方标签+错误高亮）、toast「已过滤 1 条疑似串音」、
  偷学区块（3 条，橄榄绿标题）、单条「存为词块」和「全部入库」均验证真实写库（`list_chunks`
  查到 `source:'steal'` 记录，`text=expression`/`meaning=why`/`example` 字段对齐）、历史屏对话
  小图标 + 点击重开完整复现。回归测试：普通文本复盘（`source='paste'`）路径未受影响，原文卡+
  无偷学区，与阶段8/9 行为一致。全程 console 零报错。测试数据（fixture 会话目录、3 条 steal
  词块）已清理；2 条测试复盘记录因项目无 `delete_review` API 未清（不越界新增，留在测试用的
  preview 浏览器 profile 里，不影响用户真实数据）。
- `npm run build` → `js/core.bundle.js` 含最新 `filterBleed`；rsync 到 `四土app/assets/mobile/`
  后 `review.js`/`style.css`/`js/core.bundle.js`/`js/core/{llm,localapi}.js` md5 与源头一致。
  `四土对话录.app` 已拷贝到 `~/Desktop/`。**本批不打 APK**（Mac 专属功能，spec 明确指示）。

### 未做 / 待用户真机验收（明确列出，spec §6 Step 5 硬性要求）

1. **真实录音**：授权屏幕录制 + 麦克风权限后，录一段真实 Sesame/ChatGPT 语音对话，确认端到端
   落盘（`me.wav`/`ai.wav`/`meta.json`/`ready`）。
2. **外放（不戴耳机）录制**——本批最核心的验收项：复盘对话稿里 AI 的话不得跑进「我」的
   turn（AEC + 串音过滤双保险的最终裁判，本机 CC 环境无法产生真实音频信号来验证 AEC 实际降噪
   效果，只验证了代码逻辑和回落路径）。
3. **真实火山凭证**下 utterances 时间戳是否正常返回（若被降级整轨回落到无时间戳文本，需在
   下次真机使用时观察现象，交织粒度会退化为整轨一条）。

### 已知瑕疵（不影响功能，如实记录）

- 偷学卡片「存为词块」的 `chunkAdded` 状态是纯前端内存态，不持久化到 review 记录，历史屏重开后
  按钮会回到「存为词块」文案（点击不会重复入库，`add_chunk` 按 text 去重）——这与既有 priority/
  minor 卡片的行为一致，非本批引入的新问题，未在本批修（不在 spec 范围内）。

### 修了什么

1. **`santu_app/mobile/review.js`——录音转写的诚实性 + 防数据丢失**
   - `_flushSegment(st, isFinal)` 现在返回 `{ok, appended, error}`，不再吞掉失败/空文本信息。
   - `_stopRecord` 按真实结果分三路提示：追加成功 →「已转写」；请求成功但没识别出文字 →「没听清，请靠近麦克风重录」；请求失败 →「转写失败：{error}」。彻底移除此前**无条件** `toast('已转写')` 的假成功提示。
   - 转写失败时不再清空音频：失败的那段 WAV（`wavB64`）存进模块级 `RS._pendingWav`（只保留最近一段），录音按钮切换为「重试转写」态（新增 `.rev-rec-btn.retry` 样式，暖棕色区分于录音中的赭橙）。
   - 新增 `_retryPendingTranscribe()`：点击「重试转写」直接用保留的 `wavB64` 重新调 `transcribe_audio`，不需要重录；再失败仍保留 pending 可继续重试；成功后追加进 textarea 并清空 pending。
   - `_toggleRecord` 里开始新录音时清掉旧的 pending（用户明确放弃重试、转向新录音）。
   - 凭证缺失的错误文案（localapi.js `transcribe_audio`）本来就已指路到「设置 → 语音转写」，未改动。

2. **`santu_app/mobile/js/core/llm.js`——deepseek-chat 弱档别名自动升级**
   - `_loadConfig()` 与 `_loadReviewConfig()` 里：当 `provider==='deepseek'` 且加载出的 `model`/`review_model` 恰为 `deepseek-chat` 时，返回值改用 `deepseek-v4-pro`（只在**加载时**映射，不改写 IndexedDB 里的存储值），并打印一行 `console.log` 便于取证。
   - 其它 model 值（已是 `v4-pro`、留空走默认、或任何其它自定义值）原样通过，不受影响。

3. **`santu_app/mobile/settings.js`——设置屏文案同步**
   - 「模型」输入框 placeholder 从 `deepseek-chat` 改为 `deepseek-v4-pro`，并新增说明：「deepseek-chat 已是弱档别名，会被自动升级为 v4-pro」。

### 为什么改

主会话取证发现：录音转写失败时（如未配置火山凭证、或凭证失效）用户仍会看到「已转写」的假成功提示，且 `_flushSegment` 一开始就清空了当前分段的音频缓冲，导致转写失败=几分钟录音直接永久丢失、无法重试。另外 DeepSeek 官方已把 `deepseek-chat` 别名悄悄降级映射到弱档 `v4-flash`，多端 IndexedDB 里存的旧配置值无法逐一手改，需要在代码加载层统一纠正。

### 验证方式

- preview（`server.py` + 桌面浏览器）里用 AudioContext 振荡器合成音频、mock `getUserMedia`，先在**改动前**的代码上完整复现原始 bug（toast 显示"已转写"但 textarea 为空、按钮已复位，音频已被清空无法重试）；改动后重跑同一路径，确认 toast 变为「转写失败：...」、按钮变「重试转写」、pending 音频仍在，可重试；重试时再故意用假凭证验证仍走「再失败仍保留 pending」路径。
- llm 映射：动态 `import()` 加载 `llm.js`，用 IndexedDB 里的真实配置分别测试 `model = deepseek-chat / deepseek-v4-pro / ''（空） / deepseek-coder（其它值）` 四种取值，返回结果里的 `model` 字段全部符合预期（前者映射、后三者原样）。
- `node --check` 三个改动文件全过；`npm run build` 重出 bundle 并确认新逻辑（`_pendingWav`/`_retryPendingTranscribe`/deepseek 映射）都进了 `js/core.bundle.js`；rsync 同步到 `四土app/assets/mobile/` 后三文件 md5 与源头一致；`flutter build apk --release --split-per-abi --target-platform android-arm64` 打包成功（19.0MB），`unzip -p` 抽验 APK 内 `review.js`/`core.bundle.js`/`settings.js` 均含新逻辑；APK 已拷贝到 `~/Desktop/四土手机版/四土.apk`。

### 未做 / 待验证

- 未做真机验证（本批只在浏览器 preview 里验证，真机上火山转写失败态的实际观感待用户下次真机使用时确认）。
- 「重试转写」按钮的暖棕色是本批新定的视觉细节（`#9a3324`），未经用户对比确认，纯照 spec"细线图标风格照旧"的最小合理延伸。
