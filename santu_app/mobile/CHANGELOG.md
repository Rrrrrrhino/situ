# 四土手机版 CHANGELOG

## 2026-07-06 深夜 — 阶段10.1：首页对话录音卡

- `app.js` `renderHome()` 「书架」之前插「对话录音」卡：未录/录音中（红点呼吸+计时）/停止成功
  （去复盘链接）三态，先 `recorder_status()` 判活，请求失败整卡不渲染；每 1s 轮询、态由 status
  驱动；离开 home 屏清 interval。
- `js/core/localapi.js` 加 `recorder_start/stop/status` 三个薄封装（打 server.py 新增的
  `/api/recorder_*` 端点）。
- `style.css` 新增 `.rec-card` 系列：深蓝主按钮（`--rev-ui`，非默认暖金 `.btn`）、红点呼吸
  keyframe（复用既有 `--danger` 陶红）。
- 详细技术记录见项目根 `CHANGELOG.md` 同日期条目。

## 2026-07-06 — 阶段9：词块系统（lexical chunk 刻意练习 + 确定性正误反馈）

### 新增功能
- **数据模型**：新表 `chunks`（`DB_VERSION` 4→5），字段含 text/meaning/example/source/sourceRef/addedAt/
  lastDrilled/drillCount/correctRefs/correctTopics/mastered/star。掌握铁律：`correctRefs.length>=3`（三个
  不同场次用对）时自动 `mastered=true`，同一场次同一词块只计一次。
- **词块刻意练习裁决**：新增 `chunkDrill`（五档裁决 correct/unnatural/collocation/grammar/context，错档给
  2-3 条地道例句、correct 档给 0-1 条拓展）与 `chunkTopic`（出即兴口语话题帮他起头）两条 prompt，逐字照抄
  规格 §2a/2b/2c。
- **日常复盘自动盯词块**：阶段8 复盘 prompt（`REVIEW_V2_SINGLE_SYSTEM`/`REVIEW_V2_EDIT_SYSTEM`/两个 TEMPLATE）
  逐字插入 3 处——JSON 结构加 `chunkFeedback` 数组、判定要求追加一条盯词块规则、模板拼 `{chunks_block}`；
  其余一个字不动。`review_speech` 调用前自动取「进行中词块」（未掌握，star 优先、lastDrilled 最久优先，
  cap 10）传给大脑，结果里的 chunkFeedback 同步更新对应词块的 drillCount/correctRefs/进度。
- **词块库屏**：复盘头部新增「词块」按钮；tab（未掌握/重点/已掌握/全部）+ 搜索 + 条目（衬线英文/中文义/
  进度点 ●●○ 2/3/star/来源 chip 读·盘·手·偷）+ 展开显示例句/加重点/删除；「＋添加」小 sheet + 「练一组」
  （自动配 star 优先+lastDrilled 最久优先取4个）+ 「挑几个练」（复用错题本多选模式，2-5 个）。
- **选词块练习 → 裁决结果屏**：可选「给我个话题」→ 大 textarea + 复用录音按钮（转写追加）→ 提交裁决 →
  逐词块卡片（verdict 胶囊 + quote + comment + examples + 进度点，`justMastered` 时胶囊换「🎉 已掌握」+
  轻微入场动画）→ extraErrors 小节 → 「再练一组 / 回词块库」。
- **复盘结果屏词块反馈区**：chunkFeedback 非空时插在「重点区」之后，卡片样式同裁决结果屏。
- **「存为词块」按钮**：复盘结果屏 priority/minor 卡片 + 错题本条目（text=correction、meaning=why 截断、
  source="review"）；阅读讲解面板动作区（text=当前词/短语、meaning 取讲解中文义第一句、source="reading"，
  sourceRef=当前文章 id），只加按钮和一次 `add_chunk` 调用，不改讲解逻辑。
- verdict 五档中文标签：完全正确/不够自然/搭配错/语法错/语境不合；胶囊配色沿用暖纸/深蓝/赭橙/暖金/橄榄绿
  现有令牌，未新增色。

### 修改文件
- `js/core/store.js` — `DB_VERSION` 4→5，新增 `chunks` 表（索引 addedAt）+ `chunksPut/List/Get/Delete`。
- `js/core/llm.js` — 新增 `CHUNK_DRILL_SYSTEM/TEMPLATE`、`CHUNK_TOPIC_SYSTEM/TEMPLATE`（逐字，阶段9）、
  `chunkDrill`/`chunkTopic`/`_buildChunkDrillBlock`/`_cleanChunkFeedback`/`_CHUNK_VERDICTS`；
  `REVIEW_V2_SINGLE_SYSTEM`/`REVIEW_V2_EDIT_SYSTEM`/两个 TEMPLATE 三处逐字插入（其余一字未动）；
  `reviewSpeechV2` 加 `chunks` 参数 + `_buildChunksBlock` + 返回 `chunkFeedback`。
- `js/core/localapi.js` — 新增 `add_chunk/list_chunks/delete_chunk/set_chunk_star/suggest_chunk_topic/
  check_chunk_drill`、内部 `_pickInProgressChunks`/`_applyChunkFeedback`/`_applyMasteryRule`；`review_speech`
  升级：取进行中词块传给 `reviewSpeechV2`、chunkFeedback 落库进 `result.chunkFeedback`、返回值带 chunkFeedback。
- `js/core/index.js` — 重导出 `chunksPut/List/Get/Delete`、`chunkDrill`/`chunkTopic`。
- `review.js` — 新增词块库屏（`_showChunksScreen`/`_renderChunksList`/`_loadAndRenderChunks`/
  `_openAddChunkSheet`/多选态 `_enter/_exitChunkSelectMode`）、选词块练习屏（`_showChunkPickScreen`/
  `_doChunkDrill`，含专用录音按钮 `_bindChunkRecBtn`/`_stopChunkRecord`/`_flushSegmentToTextarea`）、
  裁决结果屏（`_showChunkResultScreen`）、词块反馈区块（`_buildChunkFeedbackSection`/`_chunkVerdictPill`/
  `_progressDots`）、「存为词块」共用逻辑（`_onSaveChunkFromItem`）；`_onBack`/`RS` 状态/各屏头部按钮
  显隐加 `chunks`/`chunkPick`/`chunkResult` 三个 view 的路由。
- `app.js` — `actionsRow()` 加「存为词块」按钮，`wireExplainCommon()` 绑定 `saveCurAsChunk`（只加按钮和一次
  `add_chunk` 调用，不改讲解逻辑）。
- `index.html` — `ovReview` 头部新增「词块」按钮（`#reviewChunksBtn`，细线双方块 SVG）。
- `style.css` — 新增「词块系统（阶段9）」整段：verdict 胶囊/进度点/词块库列表/选词块练习屏/裁决结果屏/
  词块反馈区块/「存为词块」按钮系列样式，全部复用既有 `--rev-*`/`--gold`/`--ok`/`--star` 等令牌。

### 自测（`_devtest/test_chunks.mjs`，对真实 DeepSeek deepseek-v4-pro 跑通）
- (a) CHUNK_DRILL 三词块一对一错一没用 → 五档裁决准确、错档 examples 2-3 条地道、没用的 used=false，全部 PASS。
- (b) REVIEW_V2_SINGLE + 2 进行中词块，只用对 1 个 → chunkFeedback 只含用到的词块、verdict=correct、
  没有重复出现在 priority/minor，全部 PASS。
- (c) 掌握规则本地模拟：三个不同场次 correct → mastered=true，justMastered 只在第三次为 true，同场次
  重复 correct 不重复计数，全部 PASS。

## 2026-07-06 — 阶段8：口语复盘大脑升级（分级检出/编辑 + 跨次记忆 + 历史屏 + 精批模型 + 桌面录音代理）

### 新增功能
- **复盘大脑升级为分级管线**：≤350 词单遍（`REVIEW_V2_SINGLE`）出 topic/overall/strengths/priority(≤5,宁缺毋滥)/minor；
  >350 词两遍——按句子边界切 ~800-1100 词块并行「检出」（`REVIEW_V2_DETECT`，宁多报不漏报）→ 全文+检出清单
  一次「编辑」（`REVIEW_V2_EDIT`，挑重点/合并同类/分 2-6 个话题段）。三条 prompt 逐字照搬规格。
- **跨次记忆**：调用前取错题本未掌握条目按 lastSeen 倒序前 20 条编号 M1…M20 传给 LLM；结果 `repeatOf` 命中时
  不新建错题只给旧条目 `recurCount+1`，结果带回 `recur` 供 UI 显示「⚠️ 第 N 次」徽章；重复错误合并成一条并显示「×N」次数徽章。
- **结果屏 v2**：总评卡（深蓝）+ 原文卡默认折叠（展开全文）+ 重点区（priority，×N/重犯徽章）+ 用得好 + 完整清单
  （按话题段可折叠，minor 条目可「入错题本」）。
- **历史屏**：复盘头部新增「历史」按钮（细线时钟图标）；按日分组列表，支持搜索 topic/原文（防抖280ms）；
  点条目重开（v2 走新渲染，v1 旧数据降级渲染不崩）。
- **设置新增「复盘精批模型」卡**：provider/model/API Key/Base URL 四项全留空则跟随主「讲解 AI」配置。
- **桌面浏览器录音转写**：`server.py` 新增 `/api/transcribe_submit`、`/api/transcribe_query` 纯转发代理（凭证只经手
  不落盘不打日志），`transcribe_audio` 无原生桥（桌面浏览器）时自动走代理绕 CORS；录音改为边录边降采样到
  16k Int16（不再攒 Float32 整段防长录爆内存），每满 10 分钟自动分段转写追加进文本框、总上限 60 分钟。

### 修改文件
- `js/core/llm.js` — 新增 `REVIEW_V2_SINGLE/DETECT/EDIT_SYSTEM/TEMPLATE` 六个常量（逐字照搬）、`_buildMistakesBlock`/
  `_splitIntoChunks`/`_reviewChatJson`/`_cleanReviewItems`/`_loadReviewConfig`/`reviewSpeechV2`；旧 `reviewSpeech`(v1)
  与 `REVIEW_SYSTEM` 原样保留未删。
- `js/core/store.js` — `DB_VERSION` 3→4（reviews 行加 version:2 结构、mistakes 行加 recurCount，均行内字段无需
  新增 store/index）。
- `js/core/localapi.js` — `review_speech` 切到 v2 管线（取错题→调 reviewSpeechV2→repeatOf 解析/recurCount 累加→
  priority 自动建错题/minor 不自动入库→写 reviews version:2）；新增 `save_mistake_from_item`（去重）、`get_review`；
  `list_reviews` 升级支持 q 搜索+新摘要字段；`get_settings`/`save_settings` 补 review_* 四项；`transcribe_audio`
  加桥检测分支（无原生桥走 `/api/transcribe_submit`/`_query` 并把 appid/token/_reqid 放进请求体）。
- `review.js` — 结果屏重写为 v2 渲染（`_showResultScreen`/`_buildPrioritySection`/`_buildMinorSection`/
  `_highlightTranscriptV2`/`_looseFind` 高亮鲁棒化），v1 降级渲染独立成 `_showResultScreenV1`/`_highlightTranscript`/
  `_buildSection`；新增历史屏（`_showHistoryScreen`/`_loadAndRenderHistory`/`_openReviewFromHistory`）；
  录音器重写为流式降采样+自动分段（`_downsampleToInt16`/`_flushSegment`/`_encodeInt16WavBase64`），
  `_SEG_SECONDS=600`（10分钟）/`_TOTAL_CAP_SECONDS=3600`（60分钟）。
- `settings.js` — 新增「复盘精批模型」卡 + `#setSaveRev` 保存绑定。
- `style.css` — 新增 `.rev-head-btns`/`.rev-overall-card`/`.rev-transcript-card.collapsed`/`.rev-expand-btn`/
  `.rev-badge-count`/`.rev-badge-recur`/`.rev-seg-*`/`.rev-minor-card`/`.rev-save-mistake-btn`/`.hist-*`。
- `index.html` — `ovReview` 头部新增「历史」按钮（`#reviewHistoryBtn`，细线时钟 SVG）。
- `server.py` — 新增 `_volc_submit`/`_volc_query`/`_volc_request` 纯转发代理 + 路由 `/api/transcribe_submit`/
  `/api/transcribe_query`（透传真实 HTTP 状态码）。
- `_devtest/test_review_v2.mjs` — 新增自测脚本，对真实 DeepSeek 跑 (a)(b)(c) 三组。

### 验收结果
- Step 1：`node _devtest/test_review_v2.mjs` 对真实 DeepSeek 跑通 (a)(b)(c) 三组，priority/minor 判断合理、
  count 合并（一条 count=5）、segments 5 个话题段、repeatOf="M1" 命中同知识点错误；`_devtest/test_store.mjs`
  19 条既有用例全过（DB_VERSION 4 无回归）。
- Step 2：`node --check` 全部改动文件通过；`npm run build` 成功（core.bundle.js 4.2MB）。
- Step 3：preview 浏览器闭环——真实调用验证短文本单遍/长文本两遍全流程渲染、×N 与重犯徽章（真实抓到
  「⚠️ 第 3 次」重犯）、minor「入错题本」写入成功、历史屏分组/搜索/重开（含插入一条 v1 旧数据验证降级渲染
  不崩）、精批模型留空走主配置（model 字段验证一致）；console 全程零报错。
- Step 4：`/api/transcribe_submit`/`_query` 代理经 curl + 浏览器双重验证，正确透传火山真实错误码/消息，
  服务端零日志零落盘；用合成 AudioContext 振荡器流替代真麦克风驱动完整录音状态机（分段阈值临时调 8 秒），
  验证「录音中不中断、每段静默转写、stop 后最终段转写、按钮正确复位」全部符合预期；降采样/WAV 编码逻辑
  单测通过（采样连续性、header 字段、样本值回环）。**10 分钟真实档位（约19MB WAV/26MB base64）未用真实
  火山凭证做长录实测**，仅验证了协议/状态机与体积估算，请用户真机验证一次。
- Step 5：`flutter build apk --release --split-per-abi --target-platform android-arm64` 成功（19.0MB），
  APK 内验证 review.js/core.bundle.js 确实含新代码；已拷贝至 `~/Desktop/四土手机版/四土.apk`（不用 adb 装，
  用户自装）。

## 2026-07-03 — 提示词大审：点词/划选讲解两处升级（与桌面 reader_core/llm.py 同步）

- `USER_TEMPLATE`（点词讲解）：新增短语动词/固定搭配识别——点 give up 里的 give 时按整个搭配讲并点明「单看会误解」；`contextual` 不得照抄 `literal`；音标明确美式通行读音、拿不准不硬造。
- `SELECTION_TEMPLATE`（划选讲解）：「短语 vs 句子」判据改为硬数字（≥6 个英文单词一律 sentence），与代码层护栏完全一致，从源头消掉长片段误判成短语的问题。
- `js/core.bundle.js` — npm run build 重打（4.2MB）。真实句子（Rural escapism 一文 "…give up modern conveniences"）新旧对比实测通过。

## 2026-07-01 — 阶段7：语音训练（录音→转写→灌进口语复盘）

### 新增功能
口语复盘输入屏新增「🎤 录音」按钮：点击录一段英文 → 停止后自动编码 16k WAV → 送火山「大模型录音文件识别」(volc.seedasr.auc) 异步转写 → 文字自动填入 `#revText` → 用户点「复盘」走现有闭环。凭证（App ID / Access Token）在设置屏填写，只存 IndexedDB，不进代码。

### 修改文件
- `四土app/android/app/src/main/AndroidManifest.xml` — 在 INTERNET 权限下加 `RECORD_AUDIO` + `MODIFY_AUDIO_SETTINGS`
- `四土app/lib/main.dart` — InAppWebView 加 `onPermissionRequest` 回调，一律授予麦克风（系统弹窗由安卓首次 getUserMedia 时弹出）
- `js/core/localapi.js` — import 加 `httpPost`；末尾新增 `_VOLC_SUBMIT/_VOLC_QUERY/_VOLC_RID/_uuid` 常量和 `transcribe_audio` 函数（submit+轮询 query，完成判定=`audio_info.duration` 出现）；`get_settings` 补读 `volc_appid/volc_token/has_volc/volc_token_masked`；`save_settings` 加 `volc_appid/volc_token` 写入；LocalApi export 注册 `transcribe_audio`
- `js/core.bundle.js` — npm run build 重打（4.2MB）
- `settings.js` — 「朗读音色」卡之后插入「语音转写（火山，可选）」卡（App ID + Access Token 输入+保存按钮+说明文字）；`wireSettings` 加 `#setSaveVolc` 绑定
- `review.js` — `_RS` 加 `mic/stop` SVG 图标；`_showInputScreen` textarea 后插 `#revRec` 录音按钮；末尾绑定 `$('#revRec').onclick = _toggleRecord`；`_showResultScreen/_showMistakesScreen` 开头加 `if (_recState) _stopRecord()` 清理；新增模块级录音器（`_recState/_toggleRecord/_stopRecord/_resetRecBtn/_encodeWavBase64`）
- `style.css` — 新增 `.rev-rec-btn` 样式（深蓝 `--rev-ui` 描边透明底；录音态赭橙 `#b5622f`）

### 验收结果
- `node --check` 三个文件全部通过（localapi.js / review.js / settings.js）
- `npm run build` 成功（4.2MB，无报错）
- `flutter build apk --release --split-per-abi --target-platform android-arm64` 成功（19.0MB）
- `adb install -r app-arm64-v8a-release.apk` Success
- APK 已复制到 `~/Desktop/四土手机版/四土.apk`（18M）
- 真机需用户手动：设置屏填 App ID + Access Token → 口语复盘录一句英文 → 验证是否填入文本框

## 2026-06-29 — 阶段 4.2：错题本写作训练

### 新增功能
从错题本挑几条 → 用它们写一段英文 → AI 逐条批改 → 标记掌握。纯浏览器可验。

### 修改文件
- `js/core/llm.js` — 追加 `WRITING_CHECK_SYSTEM`/`WRITING_CHECK_TEMPLATE`（逐字照搬规格 §1）+ `checkWriting()` 函数，结构镜像 `reviewSpeech`，maxTokens≥1536/空答重试
- `js/core/store.js` — bump DB_VERSION 2→3，新增 `trainings` 表（keyPath=id，索引 createdAt）及 `trainingsPut`/`trainingsList` helper
- `js/core/localapi.js` — import 新增 `trainingsPut`/`_llmCheckWriting`；新增 `make_writing_drill`（本地出题不调 LLM）/ `check_writing`（调 LLM + 写 trainings + reviewCount++）两个方法并挂入 LocalApi 对象；reviewCount 更新按位置索引对应，不按字符串匹配（LLM target 含完整行）
- `review.js` — RS 状态加 drillItems/checkResult/mistakesState.selecting/selectedIds；错题本列表加「挑几条练」按钮进多选态（_enterSelectMode/_exitSelectMode/_toggleSelectItem/_refreshSelectBar/_onConfirmDrill）；_showDrillScreen 训练屏（目标提示卡+textarea+提交）；_showCheckResultScreen 批改结果屏（逐条状态标+quote高亮+feedback+总评卡+标掌握按钮+底栏）；复盘结果底栏「练这几条」接到训练屏
- `style.css` — 追加写作训练 CSS：.mst-select-bar / .drill-* / .chk-* 等，复用 --rev-* 变量体系，橄榄绿✓/赭橙✗/灰—三色状态
- `js/core.bundle.js` — npm run build 重打（4.1MB）

### 新增文件
- `_devtest/test_writing.mjs` — 对真实 DeepSeek 跑批改自测（3目标表达，2用对1没用上，原始 JSON 可直接观察）

### 验收结果
- `node --check` 全部文件通过（llm.js / store.js / localapi.js / review.js / test_writing.mjs）
- `npm run build` 成功（4.1MB）
- 真实 DeepSeek 自测：原始 JSON 中 used/correct/quote 判定与预期完全一致，overall 合理；总判定 PASS
- preview 闭环：
  - `make_writing_drill` 返回 ok=true，items 包含正确 original/correction
  - `check_writing` used=true/correct=true 的条目 reviewCount++ 正确（按位置索引匹配）
  - 错题本「挑几条练」→ 多选态 → 训练屏（2条目标卡+textarea+提交）正常
  - 批改结果屏：状态标（✓/—）、quote、feedback、总评卡、标掌握按钮全部正确显示
  - 点「标掌握」→ mastered=true，按钮文本变「✓ 已掌握」；「已掌握」视图能看到该条
  - 复盘底栏「练这几条」路由到训练屏（带本次复盘的 mistakeId 条目）
  - console 零 error
- 未碰：阅读 / 4.1 复盘大脑逻辑 / 桌面 app.py / APK 壳工程

## 2026-06-29 — 阶段 4.1：口语复盘大脑

### 新增文件
- `js/core/llm.js` — 追加 `REVIEW_SYSTEM`/`REVIEW_TEMPLATE`（逐字照搬规格 §1）+ `reviewSpeech()` 函数
- `js/core/store.js` — bump DB_VERSION 1→2，新增 `reviews`/`mistakes` 两张表及全套 helper（reviewsPut/reviewsList/mistakesPut/mistakesList/mistakesGet/mistakesDelete）
- `js/core/localapi.js` — 新增 review_speech/list_mistakes/set_mistake_mastered/set_mistake_star/delete_mistake/list_reviews 六个方法，并挂入 LocalApi 对象
- `js/core/index.js` — 导出新 store helpers 与 reviewSpeech
- `review.js` — 复盘三屏 UI（输入/结果/错题本），使用 overlay 模式复用现有视图机制
- `_devtest/test_review.mjs` — 真实 DeepSeek 自测脚本

### 改动文件
- `index.html` — 抽屉新增「口语复盘」导航入口；新增 `ovReview` overlay；加载 review.js
- `app.js` — `go()` 函数加 `review` 分支 + `openReview()` helper
- `style.css` — 追加复盘专属 CSS（暖纸底、赭橙/暖金/橄榄绿三类低饱和档案色，深蓝 `#16335c` UI 强调）
- `js/core.bundle.js` — 重打包（含新 store/llm 导出）

### 验收结果
- node --check 全文件通过（store.js/llm.js/localapi.js/index.js/review.js/test_review.mjs）
- npm run build 成功（4.1 MB，无报错）
- 真实 DeepSeek 自测：(a) 段抓到 go/very enjoy/English level/it is 全部4类问题，original 逐字可定位；(b) 段 errors=0/naturalness=0，不硬造
- preview 闭环：输入屏→复盘→结果屏（原文高亮+三栏）→错题本（5条）→标掌握/标重点/删除各操作成功，console 零报错

## 2026-06-29 — 阶段 2：Flutter 壳 + APK 打包

### 新建工程
- `~/Documents/situ/四土app/`：Flutter WebView 壳工程（com.situ.reader）
  - 以 `yulian/` 经过验证的 android/ 脚手架为蓝本，照搬 gradle 配置
  - AGP 8.11.1 / Kotlin 2.3.20 / NDK 25.2.9519653（NDK 28 source.properties 损坏，回退 25）
  - `flutter_inappwebview` ^6.1.5（InAppLocalhostServer 伺服 assets/mobile + callHandler 返回 Promise）
  - `http` ^1.6.0（Dart 侧真发 HTTP POST）

### lib/main.dart
- `InAppLocalhostServer(documentRoot: 'assets/mobile', port: 18761)` 伺服整个手机端 payload
- WebView 加载 `http://localhost:18761/index.html`（IndexedDB 拿稳定 http:// 源）
- `AT_DOCUMENT_START` UserScript 注入 NativeHttp shim（在 app.js 之前就绪）
- `nativeHttpPost` handler：收 (url, headersMap, bodyStr) → Dart http.post → 返回 {status, body}
  - 超时 90s；任何异常返回 {status:0, body:'...'}，不抛

### assets/mobile（按白名单拷入）
- 根目录：index.html / app.js / vocab.js / settings.js / style.css / fonts.css / manifest.webmanifest / sw.js
- js/（含 core.bundle.js 4.1MB + core/ 子目录）
- data/wordlists.json（855KB）
- fonts/（Bitter woff2 x2）
- icons/（icon-192/512/maskable-512.png）
- vendor/（空目录，略过）

### android/ 改动
- applicationId / namespace 改 `com.situ.reader`（去掉 com.example）
- AndroidManifest.xml：App 名「四土」、只加 INTERNET（本阶段不加 RECORD_AUDIO）
- NDK 固定 25.2.9519653（NDK 28 损坏，AGP 9.x → 8.11.1 避免 proguard 废弃错误）

### 打包结果
- `flutter build apk --debug` 成功
- 产出：`四土app/build/app/outputs/flutter-apk/app-debug.apk`，152MB
- flutter_inappwebview 版本：6.1.5（android: 1.1.3）

### 验收
- Step 0 payload：situ-mobile preview 截图正常，console 零报错，首页"四·土"渲染完整
- dart analyze main.dart：No issues found
- flutter pub get：Got dependencies!
- flutter build apk --debug：✓ Built（见上）

### 未决问题（阶段 3 处理）
- NDK 27.0.12077973 warning（inappwebview_android 1.1.3 期望，但 NDK 25 build 成功，warning 非 failure）
- proguard-android.txt 在高版 AGP 废弃 warning（通过降 AGP 到 8.11.1 已规避 failure）
- 真机安装 / 断 Mac 全链路验收（华为 nova10 侧载，用户出手）
- 图标：阶段 3 换成套 SVG

## 2026-06-29 — 阶段 1D AI 层

### 新增文件
- `js/core/http.js`：统一 HTTP POST 工具
  - `httpPost(url, headersObj, bodyObj)` — Flutter WebView 走 `window.NativeHttp.post`，Node/浏览器走 `fetch`
- `js/core/llm.js`：DeepSeek/兼容 OpenAI 讲解层（端口 llm.py，prompt 逐字）
  - PROVIDERS 表：deepseek/zhipu/kimi/openai（与 llm.py 完全一致）
  - 所有 7 条 prompt 常量逐字端口（SYSTEM_PROMPT/USER_TEMPLATE/FOLLOWUP_SYSTEM/DEEP_SYSTEM/FREQ_SYSTEM/SELECTION_SYSTEM/SELECTION_TEMPLATE）
  - `_extractJson(content)` 容错照搬 llm.py._extract_json
  - `explainWord(args)` — JSON mode + 空答重试（v4-pro 推理模型坑）
  - `explainSelection(args)` — kind 判定 + 长片段强制 sentence（照搬 llm.py）
  - `askFollowup(args)` — 多轮 messages 组装，mode=deep/freq 切换 system prompt
  - 配置从 store.js settingsGet 读取，缺 key 时返回友好错误
- `js/core/audio.js`：单词/词组发音（端口 app.py.get_audio）
  - 有道单词优先（直接 URL，`<audio>` 跨域可播）；词组 MiniMax 优先
  - MiniMax TTS：hex→Uint8Array→base64 dataURL；错误码→提示（1004/2049/1008）
  - `getAudio({word, accent})` 返回 `{ok, data?}` 形状与 §6.1 一致
- `_devtest/test_llm.mjs`：对真实 DeepSeek 跑 6 项自测（全 PASS）

### 修改文件
- `js/core/localapi.js`：
  - 顶部 import 新增 llm.js/audio.js
  - `get_config/get_settings`：改为真实读 api_key/provider，返回真实 llm_enabled
  - `save_settings`：实际持久化 provider/api_key/model/minimax_key/minimax_group 到 IndexedDB
  - `explain_word`：真实实现——classify + llm.js.explainWord + 写 globalvocab（clicks/sources）
  - `explain_selection`：真实实现——llm.js.explainSelection + 写 globalvocab
  - `ask_followup`：真实实现——llm.js.askFollowup + 追加 followups 到 globalvocab entry
  - `get_audio`：真实实现——委托 audio.js.getAudio
- `js/core/index.js`：追加 http/llm/audio 导出
- `js/core.bundle.js`：npm run build 重打，mtime 2026-06-29 08:24

### 验收结果（Node 自测）
- `node --check` 5 个文件全通过
- `npm run build` 成功，bundle 4.1MB
- test 1 explainWord(reverberate)：phonetic/pos/literal/contextual/explanation 全非空，耗时 243ms — PASS
- test 2a explainSelection(phrase 'make a difference')：kind=phrase，meaning/talk 齐 — PASS
- test 2b explainSelection(sentence)：kind=sentence，meaning/key_words/talk 齐 — PASS
- test 3a askFollowup mode=deep：answer 长度正常 — PASS
- test 3b askFollowup mode=freq：@@FREQ@@ 开头行存在 — PASS
- test 4 有道 URL：HEAD 200 audio/mpeg — PASS

## 2026-06-29 — 阶段 1C 数据层

### 新增文件
- `js/core/extract.js`：EPUB/TXT/HTML 解析（端口 extractor.py）
  - `parseEpubFromArrayBuffer(buf)` — JSZip 解压 + OPF + spine + NCX/nav TOC + _soup_to_blocks 仿写
  - `parseTxt(text, name)` — 仿 _from_text_file，短行做标题、空行分段
  - `extractFromHtml(html, url)` — Readability.js 提正文 → _domToBlocks
- `js/core/store.js`：IndexedDB 封装，4 张表（library/archives/globalvocab/settings）
  - libraryList/Upsert/Delete、archiveGet/Put/Delete
  - vocabGetAll/Get/Put/Delete/Clear/ImportBatch（含 merge 规则）
  - settingsGet/Put/GetAll（含 localStorage 后备）
  - `setIDBFactory()` 注入 fake-indexeddb 供 Node 测试
- `js/core/localapi.js`：LocalApi 对象，实现 §6.1 全部接口
  - 实做：get_config/get_settings/save_settings/test_settings
  - 实做：process/process_file/get_toc/load_chapter
  - 实做：list_library/load_archive/delete_archive/save_session
  - 实做：get_notebook/get_global_notebook/set_star/set_known/set_known_global/delete_global
  - 实做：vocab_export/vocab_import（merge/replace 两种模式）
  - Stub：explain_word/explain_selection/ask_followup/get_audio/prewarm_word/start_pregen/get_pregen_status/get_progress
- `_devtest/test_epub.mjs`：6本 EPUB Node 解析测试（passed=6）
- `_devtest/test_store.mjs`：IndexedDB round-trip 测试（passed=19）

### 修改文件
- `js/core/index.js`：追加 extract/store/localapi 导出
- `index.html`：在 app.js 前加 `<script src="js/core.bundle.js">` + `window.LocalApi` 挂载脚本
- `app.js`：
  - `api()` 改为分发到 `window.LocalApi`
  - `boot()` 开头 `await window.LocalApi.ready()` 再 renderHome

### 依赖新增
- `jszip` — EPUB 解压
- `@mozilla/readability` — HTML 正文提取
- `jsdom`（devDependencies）— Node 测试 DOM 环境
- `fake-indexeddb`（devDependencies）— Node 测试 IndexedDB

### 验收结果
- `node --check` 全部 4 个新 js 通过
- `npm run build` 成功，bundle 4.1MB
- Node EPUB 解析：6/6 本全过，无空章，无报错
- Node store round-trip：19/19 全过（library upsert 去重、archive get/put、vocab merge、settings）
- 浏览器端到端：真 EPUB（Body Keeps the Score）导入→渲染首章→load_chapter(1)→save_session→load_archive→set_star/set_known/delete_global 全部正常
- console 无来自 index.html 的新错误
