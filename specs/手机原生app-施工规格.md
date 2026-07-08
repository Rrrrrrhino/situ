# 四土 · 手机原生 App 施工规格

> 目标：把四土做成 **Mac 关机也能用的真·独立安卓 App**。出门、用流量、离线读书都行。
> 本规格是多次会话的总蓝图。施工方（builder / 后续会话）照此干，主会话(Opus)定方向 + 验收。
> 接续暗号：**「继续做四土原生 App，先读 specs/手机原生app-施工规格.md」**

---
## ✅ 状态（2026-06-29）：阶段 0/1A/1B/1C/1D 全部完成并验收
**整个后端"大脑"已端口成浏览器内纯 JS 并验过。** 模块在 `santu_app/mobile/js/core/`：nlp/classifier/renderer/extract/store/localapi/http/llm/audio + index.js（esbuild→`js/core.bundle.js`，`cd mobile && npm run build` 重打）。seam：`index.html` 引 bundle、`app.js` 的 `api()` 走 `window.LocalApi`、`boot()` 等 `LocalApi.ready()`。
- 1B 核心：preview 截图验，深蓝高亮 on-brand；through 误标已修。
- 1C 数据层：preview 真 EPUB 端到端（book 模式/22章/97生词高亮/章节导航/存档恢复）；6 本 EPUB 全解析、store 19/19。
- 1D AI 层：真 DeepSeek 验 explain/选区/追问(deep+freq)/有道发音，质量优；7 段 prompt 逐字。
- 注：`.env` 默认 `deepseek-chat`(=flash)，够用；要更佳设置里切 `deepseek-v4-pro`（已做空答重试）。

### ▶ 阶段 2 开工清单（下一步，需用户装机）
1. `flutter create` 壳工程（或克隆 `~/Downloads/apply/yulian/` 结构），加 `webview_flutter` 依赖。工具链已就绪：Flutter 3.44 / Android SDK 36 / JDK17（flutter doctor 的 Android✓）。
2. 全屏 WebView 加载打包进 assets 的 `mobile/index.html`。
3. **Dart 桥**：MethodChannel/JSChannel 实现 `window.NativeHttp.post(url,headers,body)` → Dart `http` 真发 → 回传（绕 CORS，AI 在 APK 内才真活）；+ 文件选择(导入 EPUB)、下载(导出生词本)。
4. 把 `mobile/` 全量（含 `js/core.bundle.js`、`data/wordlists.json`、`fonts/`、`icons/`）拷进 Flutter assets；确认 WebView 里 IndexedDB 持久化。
5. `flutter build apk` → 传 nova10 安装（用户出手 ~30s）。
6. 真机验收：断 Mac，全链路（读书+AI讲解+发音+生词本）；注意华为 WebView 版本(IndexedDB/ES2020)、key 在设置里填、MiniMax key 选填。
7. 阶段 3 收尾：图标 emoji→SVG（顶栏 ☰/📓 等，见任务#1）、退化 EPUB 小尾巴（任务#12）、真机视觉过眼。

---

---

## 0. 一句话架构

**复用现成的手机网页 UI（`santu_app/mobile/`，几乎不改），把 Python 后端"大脑"端口成在 WebView 内跑的纯 JS，打包成 Flutter WebView 安卓 App。** 外部网络请求（DeepSeek / MiniMax / 抓网页正文）走一条 Dart↔JS 原生 HTTP 桥绕开 CORS；其余逻辑（拆 EPUB、词汇分层、渲染、存储）全在 JS 里本地跑，数据存 IndexedDB。

为什么这样：
- 现有 `mobile/` UI 已经成熟好看，零重写最省力。
- 它与后端**唯一耦合点**是 `app.js` 里的 `api(method,args)`（`fetch('/api/'+method)`）。把这一个函数换成本地实现，UI 其余全不动。
- spaCy 是唯一难搬的依赖，已用 **wink-nlp** 实测替代成功（见 §3）。
- WebView + 原生 HTTP 桥彻底解决浏览器直连 LLM 的 CORS 问题，且离线可读。

替代方案（不采用，留档）：① 纯 PWA 托管到静态 HTTPS——CORS 调 LLM 过不去，且离线壳弱；② 后端搬云服务器——还是依赖服务器、要联网才能开书、有月费，违背"真·独立"；③ 纯 Kotlin WebView——更轻但脚手架手搓麻烦，Flutter 工具链本机已验证可出 APK（yulian），故走 Flutter。

---

## 1. 工具链现状（2026-06-29）
- Flutter：已装 `/opt/homebrew/bin/flutter`。
- JDK 17：已装 `/opt/homebrew/opt/openjdk@17`（本次）。
- Android SDK：已在 `/opt/homebrew/share/android-commandlinetools`（platforms/build-tools/platform-tools/ndk 齐，yulian 遗留）。
- 参照样板：`~/Downloads/apply/yulian/`（Flutter 安卓工程，曾真的 build 出 `build/app/outputs/flutter-apk/app-debug.apk`）。
- 目标机：华为 nova10（HarmonyOS，能侧载 APK；真机 WebView 版本待阶段 3 核）。

阶段 2 开工前先 `flutter doctor -v` + `flutter doctor --android-licenses`，把 flutter 指到上面 JDK/SDK。

---

## 2. 源码地图（要端口的"大脑"）
| Python 源 | 作用 | 端口到 |
|---|---|---|
| `reader_core/vocab.py` | 词汇分层（分词/还原/分类/频率档） | `web/js/core/classifier.js` + `nlp.js` |
| `reader_core/render.py` `render_article_fragment` | 生成 `.vocab/.sent/.w` 文章 HTML | `web/js/core/renderer.js` |
| `reader_core/llm.py` | DeepSeek 讲解/追问/选区 prompt | `web/js/core/llm.js` |
| `reader_core/extractor.py` | EPUB/网页→结构化 blocks（**阶段1C 必读**） | `web/js/core/extract.js` |
| `santu_app/app.py` `Api` 各方法 | 接口编排 + 存储 + 音频 | `web/js/core/localapi.js`（见 §6 契约） |
| `data/{cet4,cet6,subtlex}.txt` | 词表/词频 | 打包成 asset，见 §4 |

**铁律：prompt 逐字端口**（`llm.py` 的 SYSTEM_PROMPT/USER_TEMPLATE/FOLLOWUP_SYSTEM/DEEP_SYSTEM/FREQ_SYSTEM/SELECTION_SYSTEM/SELECTION_TEMPLATE 原样搬，一字不改），它们是产品价值所在。`_extract_json` 的容错也照搬。

---

## 3. NLP 选型（已定）
**wink-nlp + wink-eng-lite-web-model**（npm，浏览器可用，模型 3.8MB + 库 0.77MB ≈ 4.6MB）。

实测质量（样句含不规则形）：children→child、mice→mouse、better→good、grown→grow、studied→study、断句正确处理 "Dr. Smith"/破折号/缩写、London/Smith 识别为 PROPN。边角小错（analyses→analyzes、faster 不还原）对"高亮+查词"无关痛痒，可接受。

`nlp.js` 要把 wink 的输出**包装成等价于 spaCy 在 vocab.py 里用到的 token 流**：
- 逐 token：`text`(表层)、`lemma`(小写)、`pos`(PROPN/NOUN/…)、`is_punct`、`like_num`、`is_space`。
- `ws`（token 后的空白）：wink 不直接给 `whitespace_`。用 token 的字符偏移（`its.span` 起止）从原文切出"本 token 末尾到下一 token 起始"的空白来重建——渲染器靠它还原排版。
- 句子切分：`doc.sentences()`，每句给出其文本（填 `.sent` 的 `data-sentence`）与所属 token。
- 性能：长章节（数千词）tokenize 耗时要测（阶段1B）。书本就按章处理；必要时异步 + 进度提示，别卡 UI。

---

## 4. 词表/词频打包
- `cet4.txt`/`cet6.txt`：按 `vocab.py._load_wordlist` 规则解析成 `Set<string>`（小写、≥2 字母、跳过中文标题行）。
- `subtlex.txt`（5 万行 `word count`）：解析成 `Map<string, rank>`，rank = 行号（1 最常见），同 `_load_frequency`。
- 打包方式：构建期把三个 txt 预处理成一个紧凑 JSON（或直接随 asset 带 txt，启动时解析一次缓存）。约 1–2MB，进 IndexedDB 或随包只读。优先**构建期转 JSON**，启动即用免解析。
- 分类规则原样端口：`_spelling_variants`、`_STOPWORDS`、`LEVELS`、`COMMON_RANK_CUTOFF=8000`、`_classify_lemma`、`_is_flag`、`classify_word`；频率档 `_freq_band`/`_tier_for`（在 `app.py` 顶部，端口到 classifier.js）。默认 level `cet4-6`。

---

## 5. HTML 渲染契约（renderer.js 必须逐字对齐 app.js 的依赖）
照 `render.py.render_article_fragment`：
```
<article>
  <h2|h3|p>
    <span class="sent" data-sentence="整句文本">
      生词:  <mark class="vocab" data-cat="vocab" data-word data-lemma data-freq="common|rare" data-level data-idx>表层</mark>
      普通词:<span class="w">表层</span>           ← kind∈{known,stop,propn} 且含字母
      标点/数字/空白: 原样文本
      每个 token 后追加其 ws（空白）
    </span>
  </...>
</article>
```
`app.js.onWordTap` 依赖：点 `.vocab,.w` → 读 `dataset.lemma/level/freq` + 最近 `.sent` 的 `dataset.sentence`。选区讲解依赖 `.sent`。**这些 class/data-* 名一个都不能改。**

---

## 6. api() 接口契约（核心）
把 `app.js` 顶部的 `api()` 改成本地分发：
```js
async function api(method, args){ return LocalApi[method] ? LocalApi[method](args||{}) : {error:'未知方法 '+method}; }
```
`LocalApi` 各方法的精确 I/O 形状见 **§6.1 接口数据契约**（由后端审计填入，必须与现 Python 返回形状一致，否则 UI 渲染错位）。落盘从"文件"改为 **IndexedDB**：
- `library`：书架索引（list_library / save_session 写 / delete_archive）。
- `archives`：每本书/文章的存档（load_archive 读、save_session 写：书存当前章+进度，文章存阅读区 html 快照）。
- `globalvocab`：全局生词本 `{key: entry}`（get_global_notebook / set_star / set_known / delete_global / set_known_global / 追问写回）。
- `settings`：level/accent/fontSize/provider/model/api_key/minimax…（localStorage 亦可）。
- vocab_export/vocab_import：导出/导入 `globalvocab` JSON（手动跨设备同步）。

### 6.1 接口数据契约（从 app.py 反向审计，权威以 app.py 为准）
TS 记法。`?` 可缺省。

**设置/配置**
```ts
get_config() -> { llm_enabled:bool, provider:string, themes:Record<string,string>, default_theme:string }
get_settings() -> { llm_enabled:bool, provider:string|null, model:string, has_key:bool, key_masked:string,
  providers:{id,base_url,default_model}[], has_mm_key:bool, mm_key_masked:string, mm_group:string, config_path:string }
save_settings({provider?,api_key?,model?,minimax_key?,minimax_group?}) -> {ok, error?, llm_enabled?}
test_settings({api_key?,provider?,model?}) -> {ok, message}
```
**解析/加载**（article_html 来自 renderer.js = render.py.render_article_fragment）
```ts
process({source, level?}) / process_file({name, data_url, level?}) ->
  书:  { mode:"book", title, source, toc:{idx,title}[], chapter_idx, chapter_count,
         article_html, vocab_list:Hit[], vocab_order_count, llm_enabled }
  文章: { mode:"article", title, source, total_tokens, vocab_count,
         article_html, vocab_list:Hit[], vocab_order_count, llm_enabled }
  错误: { error }
get_toc() -> {idx,title}[]
load_chapter({idx}) -> { chapter_idx, article_html, vocab_list:Hit[], total_tokens, vocab_count, vocab_order_count } | {error}
// Hit = { word, lemma, kind, level, freq_tier:"common"|"rare" }
```
**讲解**
```ts
explain_word({word, sentence?, lemma?, level?, freq?, phrase?}) ->
  { ok, word, lemma, level, freq_tier, phonetic, pos, literal, contextual, explanation,
    daily_rank?, freq_band?("A".."E"), freq_name?, star?, known?, cached?, error? }
explain_selection({text, sentence?}) ->
  { ok, word, text?, lemma("§"+...), kind:"phrase"|"sentence", meaning,
    talk?, key_words?:{word,gloss}[], error? }   // key_words 仅 sentence
ask_followup({word, lemma, sentence?, question, label?, prior?, history:{q,a}[], mode?("deep"|"freq"|""), band?})
  -> { ok, answer?(轻Markdown), error? }
prewarm_word({word,...}) -> {ok}                    // 端口可 no-op
start_pregen() -> {ok,total,done,error?}            // 端口可 stub: {ok:true,total:0,done:0}
get_pregen_status() -> {done,total,running}         // 端口可 stub: {done:0,total:0,running:false}
get_progress() -> string                            // 进度标签，可返回 ""
```
**音频**
```ts
get_audio({word, accent?("uk"|"us")}) -> { ok, data?:"data:audio/mpeg;base64,...", error? }
// 单词优先有道(可直接 <audio> 播 URL，免桥)；词组优先 MiniMax(走桥, base64→dataURL)
```
**生词本**（key = lemma 或 "§…"）
```ts
get_global_notebook() -> Entry[]      // 全部（跨文档）
get_notebook() -> Entry[]             // 仅本篇：端口可简化为 global 里 sources 含当前 doc_id 的子集
set_star({key, star?}) / set_known({key, known?}) / set_known_global({key, known?}) / delete_global({key}) -> {ok}
// Entry = { lemma, word?, kind:"word"|"phrase"|"sentence", phonetic?, pos?, literal?, contextual?,
//   explanation?, meaning?, talk?, level?, freq_tier?, freq_band?, freq_name?, daily_rank?,
//   clicks, order?, chapter_idx?, chapter_title?, added_at, last_seen, first_added, star?, known?,
//   followups?:{q,a}[], sources?:{doc_id,title,chapter_title?,order?}[] }
```
**书架/存档**
```ts
list_library() -> { id, mode, title, source, saved_at, level, vocab_count }[]   // saved_at 倒序
load_archive({id}) ->
  书:  { ok, mode:"book", title, source, toc, chapter_idx, chapter_count, current_page,
         article_html, vocab_list, total_tokens, vocab_count, vocab_order_count, theme, llm_enabled }
  文章: { ok, mode:"article", title, source, article_html, theme, level, notebook_count }
  | { error }
delete_archive({id}) -> {ok}
save_session({page?, html?, theme?}) -> {ok, id?}
// 存档落盘(改 IndexedDB archives 表)：书存 {current_chapter, chapter_count, epub副本/解析缓存, notebook[]}；
// 文章存 {article_html 快照, notebook[]}；二者都 upsert library 索引(id/mode/title/source/saved_at/level/vocab_count)
vocab_export() -> globalvocab 全量 JSON（下载）
vocab_import({data, mode?:"merge"|"replace"}) -> {ok, count?, error?}  // merge 规则见 server.py._vocab_import
```

### 6.2 端口可简化（少写阶梯，经主会话确认）
- **pregen/prewarm 先 stub**：on-device 按需取讲解即可；`start_pregen/get_pregen_status/prewarm_word` 返回空状态，不做后台批量（省流量、省复杂度）。要预取留阶段3 按需。
- **`_cache` 与 `_notebook` 合并**：用一张 `explanations`（key→讲解）做即时缓存；"本篇生词本"由 `globalvocab` 按当前 doc_id 过滤得到，不再单独维护 `_notebook`。
- **doc_id**：JS 端生成（如 12 位 hex，源自标题+时间或内容 hash）。
- **theme/配色**：手机版固定暖纸，theme 字段存而不暴露切换（除非阶段3 要）。
- **books/{id}.epub 副本**：手机端把"解析后的章节文本/blocks"存进 archives 即可，不必留 EPUB 原文件（除非要重排版）。

---

## 7. 外部请求与 CORS（原生 HTTP 桥）
WebView 内 JS 不直接 fetch 外部 API（会被 CORS 挡）。约定一个桥：
```js
// JS 侧：window.NativeHttp.post(url, headersObj, bodyString) -> Promise<{status, body}>
```
Flutter 侧用 MethodChannel/JSChannel 实现：收到请求 → Dart `http` 真发 → 回传。覆盖：
- DeepSeek：`POST {base_url}/chat/completions`，`Authorization: Bearer {key}`（base_url/model 见 llm.py PROVIDERS，默认 deepseek `https://api.deepseek.com/v1` + `deepseek-v4-pro`）。
- MiniMax TTS：词组发音（端口 `app.py._download_minimax`）。
- 抓网页正文：`process({source:url})` 先 Dart 抓 HTML，再 JS 用 **Readability.js** 提正文→blocks（替代 trafilatura）。
- **单词发音(youdao)**：`https://dict.youdao.com/dictvoice?audio=<word>&type=<accent>` 是音频文件，`<audio src>` 可直接跨域播放，**不用走桥**（accent→type 映射照 app.py.get_audio）。
- ⚠ deepseek-v4-pro 是推理模型：max_tokens 给足，否则正文被 reasoning 吃掉变空（见全局 memory `reference_v4pro_reasoning_maxtokens_trap`）。
- 纯桌面浏览器无桥时这些请求会 CORS 失败——属预期，真测在 APK 里做。

---

## 8. 文件布局（建议）
```
santu_app/mobile/            ← 现有 UI，几乎不动（index.html/app.js/vocab.js/settings.js/style.css/fonts…）
  app.js                     ← 仅改 api() 一处 + 启动时挂 LocalApi/初始化 NLP、IndexedDB
  js/core/                   ← 新增：端口来的"大脑"
    nlp.js  classifier.js  renderer.js  extract.js  llm.js  audio.js  store.js  localapi.js
  vendor/                    ← wink-nlp、wink 模型、JSZip、Readability.js（自托管，不依赖 CDN）
  data/                      ← cet4/cet6/subtlex（或预处理后的 .json）
四土app/  (新 Flutter 工程，或克隆 yulian 结构)
  lib/main.dart              ← 单 WebView + 原生 HTTP 桥 + 文件选择 + 下载
  assets 指向 santu_app/mobile（构建期拷入）
```

---

## 9. 分阶段与验收
- **1A 规格**（本文）✓
- **1B 核心**：nlp.js + classifier.js + renderer.js + 一个 preview 测试页（样章→高亮文章）。**验收**：preview 截图，高亮词分布合理、深浅两档色对、点词能取到 lemma/句子；长章 tokenize 耗时可接受。
- **1C 数据层**：extract.js（EPUB via JSZip / TXT / URL via Readability）+ store.js（IndexedDB 四张表）+ localapi.js（§6 全部方法）。**验收**：preview 里真 EPUB 端到端——加书→按章读→书架→存档恢复→生词本增删，全不连 Mac（除 LLM）。
- **1D AI 层**：llm.js（prompt 逐字）+ audio.js。浏览器内 LLM 会 CORS 失败，先用临时本地代理或留到 APK 真测；youdao 发音可在 preview 直接验。
- **2 打包**：Flutter WebView 壳 + Dart 桥 + 打包 asset（UI+模型+词表）+ `flutter build apk` + 侧载 nova10。**验收**：真机断开 Mac、整链路通（读书+AI 讲解+发音+生词本）。
- **3 收尾**：图标 emoji→成套 SVG、真机视觉过眼、性能、maskable 图标、App 名/图标、HANDOFF + 中央改动日志。

---

## 10. 风险与对策
1. **wink-nlp 长章性能**：阶段1B 实测；超 1–2s 就分块/异步 + 进度。
2. **EPUB 多样性**：只支持无 DRM；阶段1C 拿库里现成 EPUB（`~/Documents/situ/books/`）测多本。
3. **网页正文提取**：Readability 不如 trafilatura，先验常见站点；不行再补规则。
4. **词形还原与桌面有微差**：手动同步可能产生个别重复 entry，可接受；同步以"手机自存一份"为主。
5. **华为 WebView 版本**：HarmonyOS WebView 需支持 IndexedDB/ES2020；阶段3 真机核，必要时降级语法。
6. **数据隐私/Key**：key 存设备本地（localStorage / Flutter secure storage），不进代码、不上传。
7. **生词本与桌面同步**：仅手动 export/import；不做实时云同步（除非用户后续要）。

---

## 11. 待确认/默认
- 同步：默认"手机自存 + 手动导出导入"，不做云同步。
- 朗读整篇播放器：桌面有（逐句播放+高亮），手机版当前只点读；是否做留阶段3 按需。
- 外壳：Flutter WebView（已定）。
- 生词本跨端：以手机为主，电脑那份独立。
