/**
 * localapi.js — 本地 LocalApi 对象（替代 app.js 的 fetch('/api/...')）
 *
 * 实现 §6.1 全部接口。AI/音频由 llm.js / audio.js 提供真实实现。
 * 通过 index.js 并入 SituCore，并额外挂 window.LocalApi。
 *
 * 依赖：
 *   - ./extract.js  (parseEpubFromArrayBuffer, parseTxt, extractFromHtml)
 *   - ./store.js    (libraryList/Upsert/Delete, archiveGet/Put/Delete, vocabGetAll/Get/Put/Delete/Clear/ImportBatch, settingsGet/Put/GetAll)
 *   - ./classifier.js (VocabClassifier, _freqBand, _tierFor, DEFAULT_LEVEL)
 *   - ./renderer.js (renderArticleFragment)
 *   - ./llm.js      (explainWord, explainSelection, askFollowup)
 *   - ./audio.js    (getAudio)
 */

import { parseEpubFromArrayBuffer, parseTxt, extractFromHtml } from "./extract.js";
import {
  openDB,
  libraryList, libraryUpsert, libraryDelete,
  archiveGet, archivePut, archiveDelete,
  vocabGetAll, vocabGet, vocabPut, vocabDelete, vocabClear, vocabImportBatch,
  settingsGet, settingsPut, settingsGetAll,
  reviewsPut, reviewsList,
  mistakesPut, mistakesList, mistakesGet, mistakesDelete,
  trainingsPut,
  chunksPut, chunksList, chunksGet, chunksDelete,
} from "./store.js";
import { VocabClassifier, _freqBand, _tierFor, DEFAULT_LEVEL, LEVELS } from "./classifier.js";
import { renderArticleFragment } from "./renderer.js";
import { explainWord as _llmExplainWord, explainSelection as _llmExplainSelection, askFollowup as _llmAskFollowup, reviewSpeech as _llmReviewSpeech, reviewSpeechV2 as _llmReviewSpeechV2, checkWriting as _llmCheckWriting, chunkDrill as _llmChunkDrill, chunkTopic as _llmChunkTopic, stealFromDialog as _llmStealFromDialog, pickRetellChunks as _llmPickRetellChunks } from "./llm.js";
import { getAudio as _audioGetAudio } from "./audio.js";
import { httpGet, httpPost } from "./http.js";

// ── 运行时状态（整 session 共用一个 classifier 实例） ────────────────────────

let _classifier = null;         // VocabClassifier（lazy init）
let _currentLevel = null;       // 当前激活的 level 字符串

/** 当前打开的书籍，用于 get_toc / load_chapter */
let _bookCtx = null;
/*  {
      doc_id: string,
      title: string,
      source: string,
      level: string,
      chapters: {title:string, blocks:{type,text}[]}[],
      chapter_idx: number,
      toc: {idx:number, title:string}[],
    }
*/

/** 当前打开的文档 id（书或文章，用于 get_notebook 过滤） */
let _currentDocId = null;

// ── 初始化 ────────────────────────────────────────────────────────────────────

let _readyPromise = null;

async function _init() {
  await openDB();
  // 加载 level 偏好
  const level = await settingsGet("level", DEFAULT_LEVEL);
  _currentLevel = level in LEVELS ? level : DEFAULT_LEVEL;
  // lazy init classifier（wink 模型加载耗时，第一次 process/load 时再做）
}

/**
 * boot() 里 await LocalApi.ready() 后再 renderHome()。
 */
function ready() {
  if (!_readyPromise) _readyPromise = _init();
  return _readyPromise;
}

// ── 内部：确保 classifier 已初始化 ─────────────────────────────────────────

async function _getClassifier(level) {
  const lvl = level || _currentLevel || DEFAULT_LEVEL;
  if (_classifier && _currentLevel === lvl) return _classifier;
  _classifier = new VocabClassifier(lvl);
  await _classifier.init();
  _currentLevel = lvl;
  return _classifier;
}

// ── 内部：doc_id 生成 ────────────────────────────────────────────────────────

function _genDocId() {
  // 12 位 hex（时间 + 随机）
  const t = Date.now().toString(16).slice(-8);
  const r = Math.floor(Math.random() * 0xffff).toString(16).padStart(4, "0");
  return t + r;
}

// ── 内部：分析一章/一篇，返回渲染结果 ────────────────────────────────────────

async function _analyzeAndRender(blocks, level) {
  const clf = await _getClassifier(level);
  const report = await clf.analyze(blocks);
  const sortedHits = clf.sorted_hits(report);
  const articleHtml = renderArticleFragment(report);

  // vocab_list: Hit[]
  const vocabList = sortedHits.map((h) => ({
    word: [...h.surface_forms][0] || h.lemma,
    lemma: h.lemma,
    kind: "flag",
    level: h.level,
    freq_tier: _tierFor(h.daily_rank),
  }));

  return {
    article_html: articleHtml,
    vocab_list: vocabList,
    vocab_order_count: sortedHits.length,
    total_tokens: report.total_tokens,
    vocab_count: sortedHits.length,
  };
}

// ── 设置 / 配置 ───────────────────────────────────────────────────────────────

async function get_config() {
  const api_key = ((await settingsGet("api_key", "")) || "").trim();
  const provider = ((await settingsGet("provider", "")) || "").trim() || "deepseek";
  return {
    llm_enabled: Boolean(api_key),
    provider,
    themes: { warm: "暖纸" },
    default_theme: "warm",
  };
}

async function get_settings() {
  const level      = await settingsGet("level",          DEFAULT_LEVEL);
  const provider   = ((await settingsGet("provider",   "")) || "").trim() || "deepseek";
  const api_key    = ((await settingsGet("api_key",    "")) || "").trim();
  const model      = ((await settingsGet("model",      "")) || "").trim();
  const mm_key     = ((await settingsGet("minimax_key",   "")) || "").trim();
  const mm_group   = ((await settingsGet("minimax_group", "")) || "").trim();
  const volc_appid = ((await settingsGet("volc_appid",    "")) || "").trim();
  const volc_token = ((await settingsGet("volc_token",    "")) || "").trim();
  const volc_hotwords = (await settingsGet("volc_hotwords", "")) || "";  // 原样存（含换行），不 trim 掉内部结构
  // 复盘精批模型（阶段8 §6）：留空即跟随上面的主配置
  const review_provider = ((await settingsGet("review_provider", "")) || "").trim();
  const review_api_key  = ((await settingsGet("review_api_key",  "")) || "").trim();
  const review_model    = ((await settingsGet("review_model",    "")) || "").trim();
  const review_base_url = ((await settingsGet("review_base_url", "")) || "").trim();

  // 本地没填 key 时，探一次主窗默认（key 全局只填一次）：仅拿是否存在的布尔，绝不把 key 带进
  // 前端返回值/日志。本地一旦显式存过就以本地为准，不会走这条。
  let key_from_main = false;
  if (!api_key) {
    try {
      const resp = await httpPost("/api/get_llm_defaults", {}, {});
      const md = JSON.parse(await resp.text());
      key_from_main = Boolean(md && md.has_key);
    } catch (_) { /* 主窗不可达：维持"没 key"，不影响本地设置渲染 */ }
  }

  const masked    = api_key.length >= 4 ? "••••••" + api_key.slice(-4) : (api_key ? "••••" : "");
  const mm_masked = mm_key.length  >= 4 ? "••••••" + mm_key.slice(-4)  : (mm_key  ? "••••" : "");
  const volc_token_masked = volc_token.length >= 4 ? "••••••" + volc_token.slice(-4) : (volc_token ? "••••" : "");
  const review_key_masked = review_api_key.length >= 4 ? "••••••" + review_api_key.slice(-4) : (review_api_key ? "••••" : "");

  // 展示 providers 列表（照搬 app.py.get_settings）
  const PROV_LIST = [
    { id: "deepseek", base_url: "https://api.deepseek.com/v1",            default_model: "deepseek-v4-pro" },
    { id: "zhipu",    base_url: "https://open.bigmodel.cn/api/paas/v4",  default_model: "glm-4-flash" },
    { id: "kimi",     base_url: "https://api.moonshot.cn/v1",             default_model: "moonshot-v1-8k" },
    { id: "openai",   base_url: "https://api.openai.com/v1",              default_model: "gpt-4o-mini" },
  ];

  return {
    llm_enabled: Boolean(api_key) || key_from_main,
    provider,
    model,
    has_key: Boolean(api_key),
    key_from_main,  // true = 本地没填、正跟随主窗的 key
    key_masked: masked,
    providers: PROV_LIST,
    has_mm_key: Boolean(mm_key),
    mm_key_masked: mm_masked,
    mm_group,
    has_volc: Boolean(volc_appid && volc_token),
    volc_appid,
    volc_token_masked,
    volc_hotwords,
    // 复盘精批模型
    review_provider,
    review_model,
    review_base_url,
    has_review_key: Boolean(review_api_key),
    review_key_masked,
    config_path: "(本地版，存于 IndexedDB/localStorage)",
    level: level in LEVELS ? level : DEFAULT_LEVEL,
  };
}

async function save_settings({
  provider, api_key, model, minimax_key, minimax_group, level, volc_appid, volc_token, volc_hotwords,
  review_provider, review_api_key, review_model, review_base_url,
} = {}) {
  if (level && level in LEVELS) {
    await settingsPut("level", level);
    _currentLevel = level;
    _classifier = null;
  }
  if (provider) await settingsPut("provider",      provider);
  if (api_key)  await settingsPut("api_key",       api_key);
  if (model != null) await settingsPut("model",    model);
  if (minimax_key)   await settingsPut("minimax_key",   minimax_key);
  if (minimax_group != null) await settingsPut("minimax_group", minimax_group);
  if (volc_appid != null) await settingsPut("volc_appid", volc_appid.trim());
  if (volc_token) await settingsPut("volc_token", volc_token.trim());
  // 热词原样存（允许空串清空覆盖）
  if (volc_hotwords != null) await settingsPut("volc_hotwords", String(volc_hotwords));
  // 复盘精批模型：留空字符串代表"跟随主配置"，因此 provider/model/base_url 允许被写成空串（清空覆盖）
  if (review_provider != null) await settingsPut("review_provider", review_provider.trim());
  if (review_api_key)          await settingsPut("review_api_key",  review_api_key.trim());
  if (review_model != null)    await settingsPut("review_model",    review_model.trim());
  if (review_base_url != null) await settingsPut("review_base_url", review_base_url.trim());
  const key = ((await settingsGet("api_key", "")) || "").trim();
  return { ok: true, llm_enabled: Boolean(key) };
}

async function test_settings() {
  return { ok: true, message: "本地版无需测试" };
}

// ── 解析 / 加载 ───────────────────────────────────────────────────────────────

/**
 * process({source, level?})
 * source 若为 URL → 走原生桥抓 HTML，用 Readability 提取正文再当文章处理
 * source 若为文本内容 → 当作 TXT 处理（不常用路径）
 */
async function process({ source, level } = {}) {
  if (!source) return { error: "source 不能为空" };

  if (/^https?:\/\//.test(source)) {
    const url = source.trim();
    // 1) 抓 HTML（Flutter WebView 走原生 GET 桥，绕 CORS）
    let html;
    try {
      const resp = await httpGet(url);
      if (resp.status && resp.status >= 400) {
        return { error: `抓取失败：网站返回 HTTP ${resp.status}` };
      }
      html = await resp.text();
    } catch (e) {
      return { error: `抓取失败：${(e && e.message) || e}` };
    }
    if (!html || html.length < 200) {
      return { error: "抓取到的内容过短，可能不是文章页或该站需要登录" };
    }
    // 2) Readability 提取正文
    let parsed;
    try {
      parsed = extractFromHtml(html, url);
    } catch (e) {
      return { error: `正文提取失败：${(e && e.message) || e}` };
    }
    if (!parsed || !parsed.blocks || !parsed.blocks.length) {
      return { error: "未能从该网页抽取正文（可能是动态渲染页或非文章页）" };
    }
    // 3) 当文章处理（分层 + 渲染 + 存档）
    return _processArticle(parsed, url, level);
  }

  // 把纯文本当文章处理
  const parsed = parseTxt(source, "粘贴文本");
  return _processArticle(parsed, source, level);
}

/**
 * process_file({name, data_url, level?})
 */
async function process_file({ name, data_url, level } = {}) {
  if (!data_url) return { error: "data_url 不能为空" };
  const lvl = level || _currentLevel || DEFAULT_LEVEL;

  const isEpub =
    name && /\.epub$/i.test(name) ||
    data_url.startsWith("data:application/epub");

  let parsed;
  try {
    if (isEpub) {
      // data_url → ArrayBuffer
      const buf = await _dataUrlToArrayBuffer(data_url);
      parsed = await parseEpubFromArrayBuffer(buf);
    } else {
      // TXT / 粘贴文本
      const text = await _dataUrlToText(data_url);
      parsed = parseTxt(text, name || "文本");
    }
  } catch (e) {
    return { error: "解析失败：" + e.message };
  }

  if (parsed.mode === "book") {
    return _processBook(parsed, name, lvl);
  } else {
    return _processArticle(parsed, name, lvl);
  }
}

async function _processBook(parsed, source, level) {
  const { title, chapters } = parsed;
  const lvl = level || _currentLevel || DEFAULT_LEVEL;
  const doc_id = _genDocId();

  // 只渲染首章
  if (!chapters || chapters.length === 0) {
    return { error: "EPUB 未能提取到任何章节" };
  }
  const firstChapter = chapters[0];
  let rendered;
  try {
    rendered = await _analyzeAndRender(firstChapter.blocks, lvl);
  } catch (e) {
    return { error: "渲染失败：" + e.message };
  }

  const toc = chapters.map((c, i) => ({ idx: i, title: c.title }));

  // 存档：存解析后的 blocks（不存 EPUB 原文件）
  const archive = {
    id: doc_id,
    mode: "book",
    title,
    source: source || "",
    level: lvl,
    chapters, // [{title, blocks}]
    chapter_idx: 0,
    chapter_count: chapters.length,
    toc,
    saved_at: Math.floor(Date.now() / 1000),
    theme: "warm",
  };
  await archivePut(archive);

  // 更新书架索引
  await libraryUpsert({
    id: doc_id,
    mode: "book",
    title,
    source: source || "",
    saved_at: archive.saved_at,
    level: lvl,
    vocab_count: rendered.vocab_count,
  });

  // 更新当前 book context
  _bookCtx = { doc_id, title, source: source || "", level: lvl, chapters, chapter_idx: 0, toc };
  _currentDocId = doc_id;

  return {
    mode: "book",
    title,
    source: source || "",
    doc_id,
    toc,
    chapter_idx: 0,
    chapter_count: chapters.length,
    article_html: rendered.article_html,
    vocab_list: rendered.vocab_list,
    vocab_order_count: rendered.vocab_order_count,
    total_tokens: rendered.total_tokens,
    vocab_count: rendered.vocab_count,
    llm_enabled: false,
  };
}

async function _processArticle(parsed, source, level) {
  const { title, blocks } = parsed;
  const lvl = level || _currentLevel || DEFAULT_LEVEL;
  const doc_id = _genDocId();

  let rendered;
  try {
    rendered = await _analyzeAndRender(blocks, lvl);
  } catch (e) {
    return { error: "渲染失败：" + e.message };
  }

  const archive = {
    id: doc_id,
    mode: "article",
    title,
    source: source || "",
    level: lvl,
    article_html: rendered.article_html,
    saved_at: Math.floor(Date.now() / 1000),
    theme: "warm",
  };
  await archivePut(archive);

  await libraryUpsert({
    id: doc_id,
    mode: "article",
    title,
    source: source || "",
    saved_at: archive.saved_at,
    level: lvl,
    vocab_count: rendered.vocab_count,
  });

  _currentDocId = doc_id;
  _bookCtx = null;

  return {
    mode: "article",
    title,
    source: source || "",
    doc_id,
    total_tokens: rendered.total_tokens,
    vocab_count: rendered.vocab_count,
    article_html: rendered.article_html,
    vocab_list: rendered.vocab_list,
    vocab_order_count: rendered.vocab_order_count,
    llm_enabled: false,
  };
}

async function get_toc() {
  if (_bookCtx) return _bookCtx.toc;
  return [];
}

async function load_chapter({ idx } = {}) {
  if (!_bookCtx) return { error: "没有打开的书，请先打开一本书" };
  const { chapters, level, doc_id, toc } = _bookCtx;
  if (idx < 0 || idx >= chapters.length) return { error: "章节索引越界: " + idx };

  const chapter = chapters[idx];
  let rendered;
  try {
    rendered = await _analyzeAndRender(chapter.blocks, level);
  } catch (e) {
    return { error: "渲染章节失败：" + e.message };
  }

  _bookCtx.chapter_idx = idx;

  // 更新存档中的当前章
  try {
    const arc = await archiveGet(doc_id);
    if (arc) {
      arc.chapter_idx = idx;
      await archivePut(arc);
    }
  } catch {}

  return {
    chapter_idx: idx,
    article_html: rendered.article_html,
    vocab_list: rendered.vocab_list,
    total_tokens: rendered.total_tokens,
    vocab_count: rendered.vocab_count,
    vocab_order_count: rendered.vocab_order_count,
  };
}

// ── 书架 / 存档 ───────────────────────────────────────────────────────────────

async function list_library() {
  return libraryList();
}

async function load_archive({ id } = {}) {
  if (!id) return { error: "id 不能为空" };
  const arc = await archiveGet(id);
  if (!arc) return { error: "找不到存档: " + id };

  if (arc.mode === "book") {
    // 恢复 book context
    _bookCtx = {
      doc_id: id,
      title: arc.title,
      source: arc.source || "",
      level: arc.level || DEFAULT_LEVEL,
      chapters: arc.chapters || [],
      chapter_idx: arc.chapter_idx || 0,
      toc: arc.toc || [],
    };
    _currentDocId = id;

    // 渲染当前章
    const chapter = arc.chapters[arc.chapter_idx || 0];
    if (!chapter) return { error: "存档中找不到章节" };

    let rendered;
    try {
      rendered = await _analyzeAndRender(chapter.blocks, arc.level);
    } catch (e) {
      return { error: "渲染失败：" + e.message };
    }

    return {
      ok: true,
      mode: "book",
      title: arc.title,
      source: arc.source || "",
      doc_id: id,
      toc: arc.toc || [],
      chapter_idx: arc.chapter_idx || 0,
      chapter_count: (arc.chapters || []).length,
      current_page: arc.chapter_idx || 0,
      article_html: rendered.article_html,
      vocab_list: rendered.vocab_list,
      total_tokens: rendered.total_tokens,
      vocab_count: rendered.vocab_count,
      vocab_order_count: rendered.vocab_order_count,
      theme: arc.theme || "warm",
      llm_enabled: false,
    };
  } else {
    // 文章：直接返回存档 html
    _currentDocId = id;
    _bookCtx = null;
    const vocabInStore = await vocabGetAll();
    const notebookCount = vocabInStore.filter(
      (e) => (e.sources || []).some((s) => s.doc_id === id)
    ).length;
    return {
      ok: true,
      mode: "article",
      title: arc.title,
      source: arc.source || "",
      doc_id: id,
      article_html: arc.article_html || "",
      theme: arc.theme || "warm",
      level: arc.level || DEFAULT_LEVEL,
      notebook_count: notebookCount,
    };
  }
}

async function delete_archive({ id } = {}) {
  if (!id) return { error: "id 不能为空" };
  await archiveDelete(id);
  if (_currentDocId === id) { _currentDocId = null; _bookCtx = null; }
  return { ok: true };
}

async function save_session({ page, html, theme } = {}) {
  if (!_currentDocId) return { ok: false, error: "没有打开的文档" };
  try {
    const arc = await archiveGet(_currentDocId);
    if (!arc) return { ok: false, error: "找不到存档" };
    if (arc.mode === "book" && _bookCtx) {
      arc.chapter_idx = _bookCtx.chapter_idx;
    } else if (arc.mode === "article" && html != null) {
      arc.article_html = html;
    }
    if (theme) arc.theme = theme;
    arc.saved_at = Math.floor(Date.now() / 1000);
    await archivePut(arc);
    // 更新书架时间戳
    const libItem = { id: arc.id, mode: arc.mode, title: arc.title, source: arc.source,
      saved_at: arc.saved_at, level: arc.level, vocab_count: arc.vocab_count || 0 };
    await libraryUpsert(libItem);
    return { ok: true, id: _currentDocId };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── 生词本 ────────────────────────────────────────────────────────────────────

async function get_notebook() {
  const all = await vocabGetAll();
  if (!_currentDocId) return all;
  return all.filter((e) =>
    (e.sources || []).some((s) => s.doc_id === _currentDocId)
  );
}

async function get_global_notebook() {
  return vocabGetAll();
}

/** 内部：读取或创建词条（点词时可能还没有讲解）。 */
async function _touchEntry(key, patch = {}) {
  const existing = await vocabGet(key);
  const now = Math.floor(Date.now() / 1000);
  if (existing) {
    return { ...existing, ...patch, last_seen: now };
  }
  return {
    key,
    lemma: key,
    kind: "word",
    clicks: 0,
    added_at: now,
    last_seen: now,
    first_added: now,
    sources: [],
    ...patch,
  };
}

async function set_star({ key, star } = {}) {
  if (!key) return { error: "key 不能为空" };
  const entry = await _touchEntry(key, { star: star !== false });
  await vocabPut(entry);
  return { ok: true };
}

async function set_known({ key, known } = {}) {
  if (!key) return { error: "key 不能为空" };
  const entry = await _touchEntry(key, { known: known !== false });
  await vocabPut(entry);
  return { ok: true };
}

async function set_known_global({ key, known } = {}) {
  return set_known({ key, known });
}

async function delete_global({ key } = {}) {
  if (!key) return { error: "key 不能为空" };
  await vocabDelete(key);
  return { ok: true };
}

// ── 导入 / 导出 ───────────────────────────────────────────────────────────────

async function vocab_export() {
  const all = await vocabGetAll();
  return all;
}

async function vocab_import({ data, mode = "merge" } = {}) {
  if (!data) return { error: "data 不能为空" };
  let entries;
  try {
    entries = typeof data === "string" ? JSON.parse(data) : data;
    if (!Array.isArray(entries)) throw new Error("data 必须是数组");
  } catch (e) {
    return { error: "JSON 解析失败：" + e.message };
  }
  await vocabImportBatch(entries, mode);
  return { ok: true, count: entries.length };
}

// ── AI / 音频 ─────────────────────────────────────────────────────────────────

/**
 * explain_word — 端口 app.py.explain_word
 * 先 classify_word 拿 lemma/level/freq_tier/daily_rank/_freq_band，
 * 再调 llm.js.explainWord 拿 phonetic/pos/literal/contextual/explanation，
 * 合并后写入 globalvocab（kind=word，累加 clicks，记 sources）。
 */
async function explain_word({ word, sentence, lemma, level, freq, phrase, title } = {}) {
  word = (word || "").trim();
  if (!word) return { ok: false, error: "缺少 word" };

  // 1. classify（复用已有 classifier）
  let daily_rank = null;
  let lem   = (lemma || "").trim().toLowerCase() || word.toLowerCase();
  let lvl   = (level || "").trim();
  let tier  = (freq  || "").trim();
  const isPhrase = Boolean(phrase);

  if (!isPhrase && _classifier) {
    try {
      const info = _classifier.classify_word
        ? _classifier.classify_word(word, sentence || "")
        : null;
      if (info) {
        lem   = lem   || info.lemma   || lem;
        lvl   = lvl   || info.level   || lvl;
        tier  = tier  || info.freq_tier || tier;
        daily_rank = info.daily_rank != null ? info.daily_rank : daily_rank;
      }
    } catch (_) {}
  }
  if (!lem) lem = word.toLowerCase();

  // 2. 频率档
  let freq_band = null, freq_name = null;
  if (typeof _freqBand === "function" && daily_rank != null) {
    const fb = _freqBand(daily_rank);
    if (fb) { freq_band = fb.label; freq_name = fb.name; }
  }

  // 3. LLM 讲解
  const llmRes = await _llmExplainWord({
    word, sentence: sentence || "", lemma: lem, level: lvl, freq: tier,
    phrase: isPhrase, title: title || _currentTitle(),
  });
  if (!llmRes.ok) return llmRes;

  // 4. 合并返回形状（§6.1）
  const result = {
    ok: true,
    word,
    lemma: lem,
    level: lvl || "",
    freq_tier: tier || "common",
    phonetic:    llmRes.phonetic    || "",
    pos:         llmRes.pos         || "",
    literal:     llmRes.literal     || "",
    contextual:  llmRes.contextual  || "",
    explanation: llmRes.explanation || "",
  };
  if (daily_rank != null) result.daily_rank = daily_rank;
  if (freq_band)          result.freq_band  = freq_band;
  if (freq_name)          result.freq_name  = freq_name;

  // 5. 写 globalvocab（照搬 app.py.explain_word 的 _upsert_global 逻辑）
  if (!isPhrase && result.explanation) {
    const now = Math.floor(Date.now() / 1000);
    const existing = await vocabGet(lem);
    const entry = {
      ...(existing || {}),
      ...result,
      key:        lem,
      lemma:      lem,
      kind:       "word",
      clicks:     ((existing || {}).clicks || 0) + 1,
      last_seen:  now,
      first_added: (existing || {}).first_added || now,
      added_at:   (existing || {}).added_at    || now,
    };
    // 保留 star / known / followups
    if ((existing || {}).star)      entry.star      = existing.star;
    if ((existing || {}).known)     entry.known     = existing.known;
    if ((existing || {}).followups) entry.followups = existing.followups;
    // 追加来源
    const docId = _currentDocId;
    if (docId) {
      const srcs = entry.sources || [];
      if (!srcs.some((s) => s.doc_id === docId)) {
        srcs.push({ doc_id: docId, title: _currentTitle() || "" });
        entry.sources = srcs;
      }
    }
    await vocabPut(entry);

    // 回填 star/known 到返回值（UI 需要）
    if (entry.star)  result.star  = entry.star;
    if (entry.known) result.known = entry.known;
    result.cached = false;
  }

  return result;
}

/**
 * explain_selection — 端口 app.py.explain_selection
 * lemma 用 "§" + 规范化；不进"本篇"但写 globalvocab。
 */
async function explain_selection({ text, sentence, title } = {}) {
  text = (text || "").trim();
  if (!text) return { ok: false, error: "没有选中文字" };

  const key = "§" + text.toLowerCase().split(/\s+/).join(" ");

  // 命中缓存（globalvocab）
  const cached = await vocabGet(key);
  if (cached && cached.meaning) {
    return { ok: true, cached: true, ...cached };
  }

  const llmRes = await _llmExplainSelection({
    text, sentence: sentence || "", title: title || _currentTitle(),
  });
  if (!llmRes.ok) return llmRes;

  const res = {
    ok: true,
    word: text,
    text,
    lemma: key,
    kind:    llmRes.kind    || "phrase",
    meaning: llmRes.meaning || "",
    talk:    llmRes.talk    || "",
  };
  if (llmRes.key_words) res.key_words = llmRes.key_words;

  // 写 globalvocab
  const now = Math.floor(Date.now() / 1000);
  const existing = await vocabGet(key);
  const entry = {
    ...(existing || {}),
    ...res,
    key,
    clicks:      ((existing || {}).clicks || 0) + 1,
    last_seen:   now,
    first_added: (existing || {}).first_added || now,
    added_at:    (existing || {}).added_at    || now,
    sources:     (existing || {}).sources     || [],
  };
  const docId = _currentDocId;
  if (docId && !entry.sources.some((s) => s.doc_id === docId)) {
    entry.sources.push({ doc_id: docId, title: _currentTitle() || "" });
  }
  await vocabPut(entry);

  return res;
}

/**
 * ask_followup — 端口 app.py.ask_followup
 * 组多轮消息；把 q/a 追加进该词 globalvocab entry 的 followups。
 */
async function ask_followup({ word, lemma, sentence, question, label, prior, history, mode, band } = {}) {
  word = (word || "").trim();
  if (!word) return { ok: false, error: "缺少 word" };

  const res = await _llmAskFollowup({
    word, lemma: lemma || "", sentence: sentence || "",
    title: _currentTitle(),
    prior: prior || "", history: history || [],
    question: question || "", mode: mode || "", band: band || "",
  });
  if (!res.ok) return res;

  // 把 Q&A 追加进 globalvocab entry 的 followups
  if (res.answer) {
    const key = (lemma || word).trim().toLowerCase();
    const lbl = (label || question || "").trim();
    const existing = await vocabGet(key);
    if (existing) {
      const fups = existing.followups || [];
      fups.push({ q: lbl, a: res.answer });
      existing.followups = fups;
      existing.last_seen = Math.floor(Date.now() / 1000);
      await vocabPut(existing);
    }
  }

  return res;
}

/**
 * get_audio — 端口 app.py.get_audio
 */
async function get_audio({ word, accent } = {}) {
  return _audioGetAudio({ word: word || "", accent: accent || "uk" });
}

async function prewarm_word() { return { ok: true }; }
async function start_pregen() { return { ok: true, total: 0, done: 0 }; }
async function get_pregen_status() { return { done: 0, total: 0, running: false }; }
async function get_progress() { return ""; }

// ── 口语复盘（阶段4.1） ───────────────────────────────────────────────────────

/** 内部：生成 12 位 hex id（与 _genDocId 同逻辑）。 */
function _genId() {
  const t = Date.now().toString(16).slice(-8);
  const r = Math.floor(Math.random() * 0xffff).toString(16).padStart(4, "0");
  return t + r;
}

/**
 * review_speech — 口语复盘（阶段8：v2 大脑；阶段9：进行中词块注入 + 计数）
 * 取未掌握错题前 20 条 → reviewSpeechV2 → repeatOf 命中的旧 mistakes 累加 recurCount，
 * 其余 priority 条目自动建 mistakes（minor 不自动入库）→ 写 reviews 一条（version:2）。
 * @param {{text:string, context?:string, source?:string, retell?:{title?:string, head?:string, chunks?:{text:string}[]}}} args
 * @returns {Promise<{ok, reviewId, topic, overall, strengths, segments, priority, minor, chunkFeedback, model, warnings?, error?}>}
 */
async function review_speech({ text, context = "", source = "paste", retell = null } = {}) {
  text = (text || "").trim();
  if (!text) return { ok: false, error: "内容不能为空" };

  // 取未掌握错题前 20 条（按 lastSeen 倒序），编号 M1…M20
  const allMistakes = await mistakesList();
  const unmastered = allMistakes
    .filter((m) => !m.mastered)
    .sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0))
    .slice(0, 20);
  const mistakesForLlm = unmastered.map((m) => ({
    id: m.id, original: m.original, correction: m.correction, type: m.type,
  }));

  // 取进行中词块（未掌握，star 优先、再按 lastDrilled 最久优先，cap 10）传给 reviewSpeechV2
  const inProgressChunks = await _pickInProgressChunks(10);
  let chunksForLlm = inProgressChunks.map((c) => ({ id: c.id, text: c.text }));

  // 复述练习（阅读联动）：目标表达插到词块清单最前（临时题目，不入库——
  // chunkFeedback 靠 text 匹配回传，_applyChunkFeedback 对库里没有的 text 会优雅跳过）；
  // context 前置「在复述哪篇 + 原文开头」，让 LLM 知道语境。
  if (retell) {
    const retellChunks = (Array.isArray(retell.chunks) ? retell.chunks : [])
      .filter((c) => c && String(c.text || "").trim())
      .slice(0, 5)
      .map((c, i) => ({ id: "retell-" + i, text: String(c.text).trim() }));
    if (retellChunks.length) {
      const seen = new Set(retellChunks.map((c) => c.text));
      chunksForLlm = [...retellChunks, ...chunksForLlm.filter((c) => !seen.has(c.text))];
    }
    if (retell.title) {
      context = `复述练习：学习者刚读完《${retell.title}》，现在用自己的话复述它。` +
        (retell.head ? `\n【原文开头】${String(retell.head).slice(0, 2000)}…` : "") +
        (context ? `\n${context}` : "");
    }
  }

  const llmRes = await _llmReviewSpeechV2({ text, context, mistakes: mistakesForLlm, chunks: chunksForLlm });
  if (!llmRes.ok) return llmRes;

  const now = Date.now();
  const reviewId = _genId();
  const mistakeIds = [];

  // repeatOf "M{n}" → mistakesForLlm[n-1].id
  function _resolveRepeatOf(repeatOf) {
    if (!repeatOf) return null;
    const m = /^M(\d+)$/.exec(repeatOf);
    if (!m) return null;
    const idx = parseInt(m[1], 10) - 1;
    return mistakesForLlm[idx] ? mistakesForLlm[idx].id : null;
  }

  async function _materializePriorityItem(item) {
    const oldId = _resolveRepeatOf(item.repeatOf);
    if (oldId) {
      const old = await mistakesGet(oldId);
      if (old) {
        old.recurCount = (old.recurCount || 1) + 1;
        old.lastSeen = now;
        await mistakesPut(old);
        mistakeIds.push(oldId);
        return { ...item, mistakeId: oldId, recur: old.recurCount };
      }
    }
    // 新建 mistakes（severity 按 type：naturalness→naturalness，其余→error）
    const mid = _genId();
    const severity = item.type === "naturalness" ? "naturalness" : "error";
    const mistake = {
      id: mid,
      original: item.original,
      correction: item.correction,
      type: item.type,
      severity,
      why: item.why,
      reviewId,
      addedAt: now,
      lastSeen: now,
      reviewCount: 0,
      recurCount: 1,
      mastered: false,
      star: false,
    };
    await mistakesPut(mistake);
    mistakeIds.push(mid);
    return { ...item, mistakeId: mid };
  }

  const priorityWithId = [];
  for (const item of llmRes.priority) {
    priorityWithId.push(await _materializePriorityItem(item));
  }

  // minor 条目不自动入库，mistakeId:null
  const minorWithId = llmRes.minor.map((item) => ({ ...item, mistakeId: null }));

  // chunkFeedback：同一复盘同一词块只计一次，场次 id 用 reviewId（阶段9）
  const chunkFeedbackOut = await _applyChunkFeedback(llmRes.chunkFeedback || [], reviewId, llmRes.topic || "");

  // 写复盘记录（version:2）
  const review = {
    id: reviewId,
    createdAt: now,
    transcript: text,
    context: context || "",
    source: source || "paste",
    model: llmRes.model || "",
    version: 2,
    result: {
      topic: llmRes.topic,
      overall: llmRes.overall,
      strengths: llmRes.strengths,
      segments: llmRes.segments,
      priority: priorityWithId,
      minor: minorWithId,
      chunkFeedback: chunkFeedbackOut,
    },
    mistakeIds,
  };
  if (retell && retell.title) review.result.retellTitle = retell.title;
  await reviewsPut(review);

  const out = {
    ok: true,
    reviewId,
    topic: llmRes.topic,
    overall: llmRes.overall,
    strengths: llmRes.strengths,
    segments: llmRes.segments,
    priority: priorityWithId,
    minor: minorWithId,
    chunkFeedback: chunkFeedbackOut,
    model: llmRes.model,
  };
  if (retell && retell.title) out.retellTitle = retell.title;
  if (llmRes.warnings) out.warnings = llmRes.warnings;
  return out;
}

/**
 * save_mistake_from_item — "入错题本"按钮用：把一条 minor 条目手动建成 mistakes。
 * 同 original+correction 已存在则直接返回旧 id，不重复建。
 * @param {{original:string, correction:string, type:string, why:string, reviewId?:string}} args
 * @returns {Promise<{ok, mistakeId}>}
 */
async function save_mistake_from_item({ original, correction, type, why, reviewId } = {}) {
  original = (original || "").trim();
  correction = (correction || "").trim();
  if (!original || !correction) return { ok: false, error: "缺少 original/correction" };

  const all = await mistakesList();
  const existing = all.find((m) => m.original === original && m.correction === correction);
  if (existing) return { ok: true, mistakeId: existing.id };

  const now = Date.now();
  const mid = _genId();
  const severity = type === "naturalness" ? "naturalness" : "error";
  await mistakesPut({
    id: mid,
    original, correction,
    type: type || "wordchoice",
    severity,
    why: why || "",
    reviewId: reviewId || null,
    addedAt: now,
    lastSeen: now,
    reviewCount: 0,
    recurCount: 1,
    mastered: false,
    star: false,
  });
  return { ok: true, mistakeId: mid };
}

/**
 * list_mistakes — 列错题本，支持 view/type/q 筛选
 * @param {{type?:string, view?:string, q?:string}} args
 * @returns {Promise<Array>}
 */
async function list_mistakes({ type, view = "unmastered", q } = {}) {
  let all = await mistakesList();

  // view 筛选
  if (view === "unmastered") all = all.filter((m) => !m.mastered);
  else if (view === "mastered") all = all.filter((m) => m.mastered);
  else if (view === "star") all = all.filter((m) => m.star);
  // view="all" 不过滤

  // type 筛选
  if (type) all = all.filter((m) => m.type === type);

  // 关键词搜索
  if (q && q.trim()) {
    const kw = q.trim().toLowerCase();
    all = all.filter((m) =>
      (m.original || "").toLowerCase().includes(kw) ||
      (m.correction || "").toLowerCase().includes(kw) ||
      (m.why || "").toLowerCase().includes(kw)
    );
  }

  // 按 addedAt 倒序
  all.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  return all;
}

/**
 * set_mistake_mastered — 标掌握/取消掌握
 */
async function set_mistake_mastered({ id, mastered = true } = {}) {
  if (!id) return { ok: false, error: "id 不能为空" };
  const m = await mistakesGet(id);
  if (!m) return { ok: false, error: "找不到该条目" };
  m.mastered = Boolean(mastered);
  await mistakesPut(m);
  return { ok: true };
}

/**
 * set_mistake_star — 标重点/取消重点
 */
async function set_mistake_star({ id, star = true } = {}) {
  if (!id) return { ok: false, error: "id 不能为空" };
  const m = await mistakesGet(id);
  if (!m) return { ok: false, error: "找不到该条目" };
  m.star = Boolean(star);
  await mistakesPut(m);
  return { ok: true };
}

/**
 * delete_mistake — 删除一条错题
 */
async function delete_mistake({ id } = {}) {
  if (!id) return { ok: false, error: "id 不能为空" };
  await mistakesDelete(id);
  return { ok: true };
}

/**
 * list_reviews — 倒序列复盘历史（阶段8升级：搜 topic/transcript + 摘要字段）
 * @param {{q?:string}} args
 * @returns {Promise<Array<{id, createdAt, topic, snippet, source, wordCount, priorityCount, minorCount}>>}
 */
async function list_reviews({ q } = {}) {
  let all = await reviewsList();

  if (q && q.trim()) {
    const kw = q.trim().toLowerCase();
    all = all.filter((r) => {
      const topic = (r.result?.topic || "").toLowerCase();
      const transcript = (r.transcript || "").toLowerCase();
      return topic.includes(kw) || transcript.includes(kw);
    });
  }

  return all.map((r) => {
    const isV2 = r.version === 2;
    const transcript = r.transcript || "";
    const wordCount = transcript.trim() ? transcript.trim().split(/\s+/).filter(Boolean).length : 0;
    return {
      id: r.id,
      createdAt: r.createdAt,
      topic: isV2 ? (r.result?.topic || "") : "",
      snippet: transcript.slice(0, 60),
      source: r.source || "paste",
      wordCount,
      priorityCount: isV2 ? (r.result?.priority || []).length : (r.result?.errors || []).length,
      minorCount: isV2 ? (r.result?.minor || []).length : (r.result?.naturalness || []).length,
    };
  });
}

/**
 * get_review — 取一条完整复盘记录（历史屏重开用）
 * @param {{id:string}} args
 * @returns {Promise<object|{error:string}>}
 */
async function get_review({ id } = {}) {
  if (!id) return { error: "id 不能为空" };
  const all = await reviewsList();
  const row = all.find((r) => r.id === id);
  if (!row) return { error: "找不到该复盘记录" };
  return row;
}

// ── 词块系统（阶段9） ────────────────────────────────────────────────────────

/**
 * add_chunk — 攒词块（阅读/复盘/手动均走这个入口）
 * text 去首尾空白；同 text 已存在则返回旧 id（不重复建）。
 * @param {{text:string, meaning?:string, example?:string, source?:string, sourceRef?:string}} args
 * @returns {Promise<{ok, id}>}
 */
async function add_chunk({ text, meaning = "", example = "", source = "manual", sourceRef = "" } = {}) {
  text = (text || "").trim();
  if (!text) return { ok: false, error: "词块内容不能为空" };

  const all = await chunksList();
  const existing = all.find((c) => c.text === text);
  if (existing) return { ok: true, id: existing.id };

  const now = Date.now();
  const id = _genId();
  await chunksPut({
    id,
    text,
    meaning: meaning || "",
    example: example || "",
    source: source || "manual",
    sourceRef: sourceRef || "",
    addedAt: now,
    lastDrilled: 0,
    drillCount: 0,
    correctRefs: [],
    correctTopics: [],
    mastered: false,
    star: false,
  });
  return { ok: true, id };
}

/**
 * list_chunks — 列词块，支持 view/q 筛选
 * @param {{view?:string, q?:string}} args  view: unmastered(默认)|star|mastered|all
 * @returns {Promise<Array>}
 */
async function list_chunks({ view = "unmastered", q } = {}) {
  let all = await chunksList();

  if (view === "unmastered") all = all.filter((c) => !c.mastered);
  else if (view === "mastered") all = all.filter((c) => c.mastered);
  else if (view === "star") all = all.filter((c) => c.star);
  // view="all" 不过滤

  if (q && q.trim()) {
    const kw = q.trim().toLowerCase();
    all = all.filter((c) =>
      (c.text || "").toLowerCase().includes(kw) ||
      (c.meaning || "").toLowerCase().includes(kw)
    );
  }

  all.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  return all;
}

/** delete_chunk — 删除一条词块 */
async function delete_chunk({ id } = {}) {
  if (!id) return { ok: false, error: "id 不能为空" };
  await chunksDelete(id);
  return { ok: true };
}

/** set_chunk_star — 标重点/取消重点 */
async function set_chunk_star({ id, star } = {}) {
  if (!id) return { ok: false, error: "id 不能为空" };
  const c = await chunksGet(id);
  if (!c) return { ok: false, error: "找不到该词块" };
  c.star = star !== false;
  await chunksPut(c);
  return { ok: true };
}

/**
 * suggest_chunk_topic — 出一个能自然用上给定词块的即兴口语话题
 * @param {{ids:string[]}} args
 * @returns {Promise<{ok, topic_zh, opener_en, error?}>}
 */
async function suggest_chunk_topic({ ids = [] } = {}) {
  if (!ids.length) return { ok: false, error: "没有指定词块" };
  const chunks = [];
  for (const id of ids) {
    const c = await chunksGet(id);
    if (c) chunks.push({ text: c.text, meaning: c.meaning });
  }
  if (!chunks.length) return { ok: false, error: "找不到指定的词块" };
  return _llmChunkTopic({ chunks });
}

/** 内部：掌握规则铁律——correctRefs.length>=3（三个不同场次用对）时自动 mastered=true。 */
function _applyMasteryRule(chunk) {
  const justReached = !chunk.mastered && chunk.correctRefs.length >= 3;
  if (chunk.correctRefs.length >= 3) chunk.mastered = true;
  return justReached;
}

/**
 * 内部：挑"进行中词块"（未掌握，star 优先、再按 lastDrilled 最久优先），供 review_speech 调用。
 * @param {number} cap
 * @returns {Promise<Array>}
 */
async function _pickInProgressChunks(cap = 10) {
  const all = await chunksList();
  const unmastered = all.filter((c) => !c.mastered);
  unmastered.sort((a, b) => {
    const sa = a.star ? 1 : 0, sb = b.star ? 1 : 0;
    if (sa !== sb) return sb - sa; // star 优先
    return (a.lastDrilled || 0) - (b.lastDrilled || 0); // lastDrilled 最久优先
  });
  return unmastered.slice(0, cap);
}

/**
 * 内部：把一份 chunkFeedback（来自 reviewSpeechV2 或 chunkDrill）应用到对应 chunks 上——
 * drillCount+=1、lastDrilled=now；verdict==="correct" 时把 ref 加进 correctRefs（去重）、
 * topic 加进 correctTopics；correctRefs.length>=3 时 mastered=true 且该条 justMastered:true。
 * @param {{chunk:string, quote:string, verdict:string, comment:string}[]} feedbackItems
 * @param {string} ref  场次 id（drillId 或 reviewId）
 * @param {string} topic
 * @returns {Promise<Array>} feedbackItems 逐条附加 chunkId/progress/justMastered
 */
async function _applyChunkFeedback(feedbackItems, ref, topic) {
  const out = [];
  const all = await chunksList();
  const byText = new Map(all.map((c) => [c.text, c]));
  const now = Date.now();

  for (const item of feedbackItems) {
    const c = byText.get(item.chunk);
    if (!c) { out.push({ ...item, chunkId: null }); continue; }

    c.drillCount = (c.drillCount || 0) + 1;
    c.lastDrilled = now;

    let justMastered = false;
    if (item.verdict === "correct") {
      const refs = c.correctRefs || [];
      if (!refs.includes(ref)) {
        refs.push(ref);
        c.correctRefs = refs;
        const topics = c.correctTopics || [];
        if (topic) topics.push(topic);
        c.correctTopics = topics;
      }
      justMastered = _applyMasteryRule(c);
    }

    await chunksPut(c);
    out.push({
      ...item,
      chunkId: c.id,
      progress: { correct: (c.correctRefs || []).length, need: 3 },
      justMastered,
    });
  }
  return out;
}

/**
 * check_chunk_drill — 词块刻意练习：提交一段英文，对目标词块逐个裁决 + 更新计数
 * @param {{ids:string[], text:string, topic?:string}} args
 * @returns {Promise<{ok, drillId, topic, items, extraErrors, overall, model, error?}>}
 */
async function check_chunk_drill({ ids = [], text = "", topic = "" } = {}) {
  text = (text || "").trim();
  if (!text) return { ok: false, error: "内容不能为空" };
  if (!ids.length) return { ok: false, error: "没有指定要练的词块" };

  const chunks = [];
  for (const id of ids) {
    const c = await chunksGet(id);
    if (c) chunks.push({ text: c.text, meaning: c.meaning });
  }
  if (!chunks.length) return { ok: false, error: "找不到指定的词块" };

  const llmRes = await _llmChunkDrill({ chunks, text, topic });
  if (!llmRes.ok) return llmRes;

  const drillId = _genId();

  // 逐条更新 chunks：drillCount+=1/lastDrilled=now；verdict==="correct" 时计入 correctRefs/correctTopics
  const feedbackItems = llmRes.items.map((it) => ({
    chunk: it.chunk, quote: it.quote, verdict: it.verdict, comment: it.comment,
  }));
  const applied = await _applyChunkFeedback(feedbackItems, drillId, llmRes.topic || topic || "");

  // 合并回 used/examples（_applyChunkFeedback 只处理 verdict 相关字段）
  const items = llmRes.items.map((it, i) => ({
    chunk: it.chunk,
    chunkId: applied[i] ? applied[i].chunkId : null,
    used: it.used,
    quote: it.quote,
    verdict: it.verdict,
    comment: it.comment,
    examples: it.examples,
    progress: applied[i] ? applied[i].progress : { correct: 0, need: 3 },
    justMastered: applied[i] ? applied[i].justMastered : false,
  }));

  return {
    ok: true,
    drillId,
    topic: llmRes.topic,
    items,
    extraErrors: llmRes.extraErrors,
    overall: llmRes.overall,
    model: llmRes.model,
  };
}

// ── 写作训练（阶段4.2） ────────────────────────────────────────────────────────

/**
 * make_writing_drill — 出题（不调 LLM，本地拼串）
 * @param {{ids?:string[], count?:number}} args
 *   ids 给定时用这些错题本条目；否则自动挑 count(默认3)条未掌握的
 * @returns {Promise<{ok, items:{id,original,correction,type}[], prompt}>}
 */
async function make_writing_drill({ ids, count = 3 } = {}) {
  let candidates = [];

  if (ids && ids.length) {
    // 按给定 id 取
    for (const id of ids) {
      const m = await mistakesGet(id);
      if (m) candidates.push(m);
    }
  } else {
    // 自动挑 count 条未掌握的（按 addedAt 倒序）
    const all = await mistakesList();
    const unmastered = all.filter((m) => !m.mastered);
    unmastered.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    candidates = unmastered.slice(0, count);
  }

  if (!candidates.length) {
    return { ok: false, error: "错题本里没有未掌握的条目，先去复盘一段英文吧" };
  }

  const items = candidates.map((m) => ({
    id: m.id,
    original:   m.original   || "",
    correction: m.correction || "",
    type:       m.type       || "",
  }));

  const prompt = "用下面这几个表达，自然地写 3–5 句话（或一小段）：";

  return { ok: true, items, prompt };
}

/**
 * check_writing — 提交写作批改
 * @param {{itemIds:string[], text:string}} args
 * @returns {Promise<{ok, items:Array, overall:string, model:string, error?}>}
 */
async function check_writing({ itemIds = [], text = "" } = {}) {
  text = (text || "").trim();
  if (!text) return { ok: false, error: "内容不能为空" };
  if (!itemIds.length) return { ok: false, error: "没有指定要练的条目" };

  // 取 mistakes 条目
  const mistakeItems = [];
  for (const id of itemIds) {
    const m = await mistakesGet(id);
    if (m) mistakeItems.push({ id: m.id, original: m.original || "", correction: m.correction || "" });
  }
  if (!mistakeItems.length) return { ok: false, error: "找不到指定的错题本条目" };

  // 调 LLM 批改
  const llmRes = await _llmCheckWriting({
    items: mistakeItems.map((m) => ({ original: m.original, correction: m.correction })),
    text,
  });
  if (!llmRes.ok) return llmRes;

  const now = Date.now();

  // 写 trainings 一条
  const trainingId = _genId();
  await trainingsPut({
    id: trainingId,
    createdAt: now,
    mode: "writing",
    itemIds,
    text,
    result: { items: llmRes.items, overall: llmRes.overall },
    model: llmRes.model || "",
  });

  // 对 used&&correct 的条目 reviewCount++/lastSeen 更新（不自动标 mastered）
  // LLM 按 items_block 的顺序逐条回显，直接按位置对应 mistakeItems
  for (let i = 0; i < llmRes.items.length; i++) {
    const resItem = llmRes.items[i];
    if (!resItem.used || !resItem.correct) continue;
    const mi = mistakeItems[i];
    if (!mi) continue;
    const m = await mistakesGet(mi.id);
    if (!m) continue;
    m.reviewCount = (m.reviewCount || 0) + 1;
    m.lastSeen = now;
    await mistakesPut(m);
  }

  return {
    ok: true,
    trainingId,
    items: llmRes.items,
    overall: llmRes.overall,
    model: llmRes.model,
    itemIds,
  };
}

// ── 读物精选：RSS / Atom 抓取 ────────────────────────────────────────────────

/**
 * _decodeEntities — 解码 HTML 实体（如 &amp; &#039;）
 * 用一个临时 textarea 节点在浏览器端解码（服务器端不可用，但本项目跑在 WebView 里）。
 */
function _decodeEntities(str) {
  if (!str) return "";
  // 快路径：没有 & 就不需要解码
  if (!str.includes("&")) return str;
  try {
    const ta = document.createElement("textarea");
    ta.innerHTML = str;
    return ta.value;
  } catch (_) {
    // 降级：简单替换常见实体
    return str
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&#39;/g, "'");
  }
}

/**
 * _stripTags — 去 HTML 标签、解码实体、截断约 100 字
 */
function _stripTags(str, maxLen = 100) {
  if (!str) return "";
  const stripped = str.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const decoded = _decodeEntities(stripped);
  return decoded.length > maxLen ? decoded.slice(0, maxLen).replace(/\s+\S*$/, "") + "…" : decoded;
}

/**
 * fetch_feed — 抓 RSS / Atom 并返回前 30 条文章信息
 * @param {{ url: string }} args
 * @returns {Promise<{ok:true, feed_title:string, items:{title,link,date,summary}[]}|{error:string}>}
 */
async function fetch_feed({ url } = {}) {
  if (!url) return { error: "url 不能为空" };

  let resp;
  try {
    resp = await httpGet(url);
  } catch (e) {
    return { error: "网络请求失败：" + (e && e.message ? e.message : String(e)) };
  }

  if (resp.status >= 400) {
    if (resp.status === 404) return { error: "找不到该 RSS 源（404），请确认地址是否正确" };
    if (resp.status >= 500) return { error: "RSS 源服务器错误（" + resp.status + "），稍后再试" };
    return { error: "RSS 源返回错误：HTTP " + resp.status };
  }

  let text;
  try {
    text = await resp.text();
  } catch (e) {
    return { error: "读取响应失败：" + (e && e.message ? e.message : String(e)) };
  }

  if (!text || text.length < 30) {
    return { error: "RSS 源返回内容为空，请稍后重试" };
  }

  let doc;
  try {
    doc = new DOMParser().parseFromString(text, "application/xml");
  } catch (e) {
    return { error: "XML 解析失败：" + (e && e.message ? e.message : String(e)) };
  }

  // 检测解析是否出错（parseerror 是 Firefox 特有，Chrome 不报异常但可能有 parseerror 元素）
  const parseErr = doc.querySelector("parsererror");
  if (parseErr) {
    return { error: "RSS 格式无法解析（parseerror），请检查源地址" };
  }

  // 判断是 RSS（有 <channel>）还是 Atom（有 <feed>）
  const isAtom = !!doc.querySelector("feed");

  let feedTitle = "";
  const items = [];

  if (isAtom) {
    // ── Atom 格式 ──────────────────────────────────────────────────────────
    const feedEl = doc.querySelector("feed");
    const titleEl = feedEl ? feedEl.querySelector(":scope > title") : null;
    feedTitle = titleEl ? _decodeEntities(titleEl.textContent.trim()) : "";

    const entries = doc.querySelectorAll("entry");
    for (const entry of entries) {
      // title
      const titleNode = entry.querySelector("title");
      const title = titleNode ? _decodeEntities(titleNode.textContent.trim()) : "";

      // link：优先取 rel=alternate 的 href，其次取第一个 link 的 href
      let link = "";
      const altLink = entry.querySelector("link[rel='alternate']");
      if (altLink) {
        link = (altLink.getAttribute("href") || "").trim();
      } else {
        const firstLink = entry.querySelector("link");
        if (firstLink) {
          // Atom link 的值在 href 属性，不在文本内容
          link = (firstLink.getAttribute("href") || firstLink.textContent || "").trim();
        }
      }

      if (!link) continue;  // 过滤没有链接的条目

      // date：published 优先，fallback updated
      const pubNode = entry.querySelector("published") || entry.querySelector("updated");
      const date = pubNode ? pubNode.textContent.trim() : "";

      // summary：summary 优先，fallback content
      const sumNode = entry.querySelector("summary") || entry.querySelector("content");
      const summary = _stripTags(sumNode ? sumNode.textContent : "");

      items.push({ title, link, date, summary });
      if (items.length >= 30) break;
    }
  } else {
    // ── RSS 格式 ───────────────────────────────────────────────────────────
    const channel = doc.querySelector("channel");
    const titleEl = channel ? channel.querySelector(":scope > title") : null;
    feedTitle = titleEl ? _decodeEntities(titleEl.textContent.trim()) : "";

    const rssItems = doc.querySelectorAll("item");
    for (const item of rssItems) {
      // title
      const titleNode = item.querySelector("title");
      const title = titleNode ? _decodeEntities(titleNode.textContent.trim()) : "";

      // link：RSS <link> 的值在文本内容（注意：不是 href 属性）
      const linkNode = item.querySelector("link");
      let link = "";
      if (linkNode) {
        // <link> 可能是文本节点，也可能因命名空间问题返回空文本但有 textContent
        link = (linkNode.textContent || "").trim();
        // 若文本为空，尝试 nextSibling（部分解析器把 <link> 内容放到 textContent 相邻节点）
        if (!link && linkNode.nextSibling) {
          link = (linkNode.nextSibling.textContent || "").trim();
        }
      }
      // 备选：atom:link rel=alternate（有些 RSS 2.0 混用 Atom 命名空间）
      if (!link) {
        const atomLink = item.querySelector("[rel='alternate']");
        if (atomLink) link = (atomLink.getAttribute("href") || "").trim();
      }

      if (!link) continue;

      // date：pubDate
      const dateNode = item.querySelector("pubDate");
      const date = dateNode ? dateNode.textContent.trim() : "";

      // summary：description
      const descNode = item.querySelector("description");
      const summary = _stripTags(descNode ? descNode.textContent : "");

      items.push({ title, link, date, summary });
      if (items.length >= 30) break;
    }
  }

  return { ok: true, feed_title: feedTitle, items };
}

// ── 语音转写（阶段7；2026-07-07 统一批：单轨也走极速版）────────────────────────
// 单轨「录音说一段」与双轨对话录共用同一条服务端 flash 通道：POST /api/transcribe_flash，
// server.py 内 _transcribe_slice 极速版(auc_turbo)优先、失败自动回退标准版。凭证放 body、
// server 只转发不落盘；原生桥/浏览器都走 /api（httpPost 各自选 NativeHttp 或 fetch）。

/**
 * transcribe_audio — 把一段 base64 wav 音频转成文字（极速版优先，自动回退标准版）
 * @param {{audioBase64:string, format?:string}} args  audioBase64 不含 "data:" 前缀
 * @returns {Promise<{ok:true, text:string}|{ok:false, error:string}>}
 */
async function transcribe_audio({ audioBase64, format = "wav" } = {}) {
  const b64 = (audioBase64 || "").trim();
  if (!b64) return { ok: false, error: "没有录到音频" };

  const appid = ((await settingsGet("volc_appid", "")) || "").trim();
  const token = ((await settingsGet("volc_token", "")) || "").trim();
  if (!appid || !token) {
    return { ok: false, error: "还没配置火山语音的 App ID / Access Token，请到「设置 → 语音转写」里填写" };
  }
  const hotwords = _parseHotwords(await settingsGet("volc_hotwords", ""));

  let resp, j;
  try {
    resp = await httpPost("/api/transcribe_flash", {}, { appid, token, audioBase64: b64, format, hotwords });
    j = await resp.json();
  } catch (e) {
    return { ok: false, error: "转写失败：" + ((e && e.message) || e) };
  }
  if (resp.status !== 200 || !j || j.ok === false) {
    let msg = (j && j.error) || ("转写失败（HTTP " + (resp && resp.status) + "）");
    if (resp.status === 403 || resp.status === 401) msg += "（凭证或开通状态有误，请检查设置里的 App ID / Access Token）";
    return { ok: false, error: msg };
  }
  return { ok: true, text: (j.text || "") };
}

// ── 双轨对话录音（阶段10） ──────────────────────────────────────────────────

/**
 * list_dualtrack — 查有多少段对话录音待复盘（Swift「四土对话录」落盘在 data/dualtrack/）
 * @returns {Promise<Array<{dir:string, startedAt:string, durationSec:number}>>}
 */
async function list_dualtrack() {
  try {
    const resp = await httpGet("/api/dualtrack_list");
    if (resp.status !== 200) return [];
    const list = await resp.text().then((t) => { try { return JSON.parse(t); } catch (_) { return []; } });
    return Array.isArray(list) ? list : [];
  } catch (_) {
    return [];
  }
}

/**
 * 内部：归一化文本 → token 数组（小写、去标点、压空白）。
 * @param {string} text
 * @returns {string[]}
 */
function _bleedTokens(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * 内部：两个 [start,end] 区间的重叠时长（同单位，通常毫秒）。
 */
function _overlapMs(aStart, aEnd, bStart, bEnd) {
  const lo = Math.max(aStart, bStart);
  const hi = Math.min(aEnd, bEnd);
  return Math.max(0, hi - lo);
}

/**
 * 串音过滤（spec §3 第二道防线）：对 me 轨每条 utterance，同时满足以下两条才判为串音、丢弃——
 * ① 与 ai 轨 utterances 的时间重叠时长 / 该条自身时长 ≥ 0.5；
 * ② 归一化后 token 数 ≥ 3，且 me 条对「重叠的 ai 文本」的 containment
 *    （me∩ai 交集 token 数 / me token 数）≥ 0.6。
 * 宁放过不错杀：短插话（token<3）或相似度不够，必须存活。
 * 抽成独立纯函数，方便单测；不改动入参数组。
 * @param {Array<{text,start,end}>} me
 * @param {Array<{text,start,end}>} ai
 * @returns {{ kept: Array<{text,start,end}>, droppedCount: number }}
 */
export function filterBleed(me, ai) {
  const meList = me || [];
  const aiList = ai || [];
  const kept = [];
  let droppedCount = 0;

  for (const u of meList) {
    const start = u.start || 0;
    const end = u.end != null ? u.end : start;
    const dur = Math.max(1, end - start);

    // 找出与该条有时间重叠的 ai utterances，累加重叠时长 + 合并它们的文本做 containment 判断
    let overlapSum = 0;
    const overlappingAiTokens = new Set();
    for (const a of aiList) {
      const aStart = a.start || 0;
      const aEnd = a.end != null ? a.end : aStart;
      const ov = _overlapMs(start, end, aStart, aEnd);
      if (ov > 0) {
        overlapSum += ov;
        for (const t of _bleedTokens(a.text)) overlappingAiTokens.add(t);
      }
    }
    const overlapRatio = overlapSum / dur;

    const meTokens = _bleedTokens(u.text);
    let isBleed = false;
    if (overlapRatio >= 0.5 && meTokens.length >= 3) {
      const containCount = meTokens.filter((t) => overlappingAiTokens.has(t)).length;
      const containment = containCount / meTokens.length;
      if (containment >= 0.6) isBleed = true;
    }

    if (isBleed) {
      droppedCount++;
    } else {
      kept.push(u);
    }
  }

  return { kept, droppedCount };
}

/**
 * 内部：把两轨 utterances 交织成对话 turns。
 * 按 start 归并排序，speaker 标 me/ai；相邻同 speaker 合并成一个 turn。
 * @param {Array<{text,start,end}>} meUtts
 * @param {Array<{text,start,end}>} aiUtts
 * @returns {Array<{speaker:'me'|'ai', text:string}>}
 */
export function _interleaveDualtrack(meUtts, aiUtts) {
  const tagged = [
    ...(meUtts || []).map((u) => ({ ...u, speaker: "me" })),
    ...(aiUtts || []).map((u) => ({ ...u, speaker: "ai" })),
  ];
  tagged.sort((a, b) => (a.start || 0) - (b.start || 0));

  const dialog = [];
  for (const u of tagged) {
    const text = (u.text || "").trim();
    if (!text) continue;
    const last = dialog[dialog.length - 1];
    if (last && last.speaker === u.speaker) {
      last.text = (last.text + " " + text).trim();
    } else {
      dialog.push({ speaker: u.speaker, text });
    }
  }
  return dialog;
}

const _DUAL_CONTEXT_WORD_CAP = 20000;

/**
 * 内部：把用户填的热词原文（多行/逗号分隔）解析成去重非空词数组（cap 100）。
 * 换行与英文/中文逗号都当分隔符；保留词内空格（如 "casual talk"）；去首尾空白、按小写去重。
 * @param {string} raw
 * @returns {string[]}
 */
function _parseHotwords(raw) {
  if (!raw) return [];
  const seen = new Set();
  const out = [];
  for (const piece of String(raw).split(/[\n\r,，]+/)) {
    const w = piece.trim();
    if (!w) continue;
    const k = w.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(w);
    if (out.length >= 100) break;
  }
  return out;
}

/**
 * process_dualtrack — 双轨对话录音 → 转写 → 交织 → 口语复盘 + 偷学
 * @param {{dir:string, retell?:{title?:string, head?:string, chunks?:{text:string}[]}}} args
 * @returns {Promise<{ok, reviewId, ...review_speech 全量返回, dialog, steals, error?, warnings?}>}
 */
async function process_dualtrack({ dir, retell = null } = {}) {
  dir = (dir || "").trim();
  if (!dir) return { ok: false, error: "缺少 dir" };

  const appid = ((await settingsGet("volc_appid", "")) || "").trim();
  const token = ((await settingsGet("volc_token", "")) || "").trim();
  if (!appid || !token) {
    return { ok: false, error: "还没配置火山语音的 App ID / Access Token，请到「设置 → 语音转写」里填写" };
  }
  // 转写热词（专有名词）：解析成去重非空词数组随请求传后端注入火山 corpus
  const hotwords = _parseHotwords(await settingsGet("volc_hotwords", ""));

  // 1) 转写
  _emitDualProgress("transcribe");
  const _tTrans = Date.now();
  let subResp;
  try {
    subResp = await httpPost("/api/dualtrack_transcribe", {}, { dir, appid, token, hotwords });
  } catch (e) {
    return { ok: false, error: "转写请求失败：" + ((e && e.message) || e) };
  }
  let transcribeRes;
  try {
    transcribeRes = await subResp.json();
  } catch (_) {
    transcribeRes = null;
  }
  if (!transcribeRes || !transcribeRes.ok) {
    return { ok: false, error: (transcribeRes && transcribeRes.error) || "转写失败" };
  }

  const warnings = Array.isArray(transcribeRes.warnings) ? [...transcribeRes.warnings] : [];

  // 2) 串音过滤（第二道防线，交织之前跑，无条件启用，spec §3）
  const { kept: meFiltered, droppedCount } = filterBleed(transcribeRes.me, transcribeRes.ai);
  if (droppedCount > 0) {
    warnings.push(`已过滤 ${droppedCount} 条疑似串音`);
  }

  // 3) 交织
  const micSilentMsg =
    "你的麦克风轨是静音（录音引擎没收到麦克风信号），这段录音救不回来了——" +
    "重录一段试试；还不行就检查 系统设置→隐私与安全性→麦克风 里「四土对话录」是否勾上";
  const dialog = _interleaveDualtrack(meFiltered, transcribeRes.ai);
  if (!dialog.length) {
    return {
      ok: false,
      error: transcribeRes.meSilent
        ? micSilentMsg
        : "两轨都没转出内容——录音里可能没有人声，或火山转写没跑通（看设置里的凭证）",
    };
  }

  // 4) 我的话拼接 + 对话全文 context（超 20000 词截断+warning）
  const myText = dialog.filter((t) => t.speaker === "me").map((t) => t.text).join(" ").trim();
  if (!myText) {
    return {
      ok: false,
      error: transcribeRes.meSilent
        ? micSilentMsg
        : "只转出了对方的声音，没识别出你的话——你离麦克风太远？重录一段试试",
    };
  }
  let contextLines = dialog.map((t) => (t.speaker === "me" ? "我: " : "对方: ") + t.text);
  let context = contextLines.join("\n");
  const contextWords = context.trim().split(/\s+/).filter(Boolean);
  if (contextWords.length > _DUAL_CONTEXT_WORD_CAP) {
    context = contextWords.slice(0, _DUAL_CONTEXT_WORD_CAP).join(" ");
    warnings.push(`对话较长，已截断到前 ${_DUAL_CONTEXT_WORD_CAP} 词`);
  }

  const transcribeMs = Date.now() - _tTrans;

  // 5) 复盘 + 偷学：两次 LLM 调用互不依赖，并行跑（v4-pro 单次一两分钟，串行=白等一整段）
  _emitDualProgress("review");
  const _tLlm = Date.now();
  const [reviewRes, stealRes] = await Promise.all([
    review_speech({ text: myText, context, source: "dual", retell }),
    _llmStealFromDialog({ dialog }),
  ]);
  const llmMs = Date.now() - _tLlm;
  if (!reviewRes.ok) return reviewRes;

  const steals = stealRes.ok ? stealRes.steals : [];
  if (!stealRes.ok && stealRes.error) {
    warnings.push("偷学：" + stealRes.error);
  }

  // 计时点灯（下次实测就有精确账目；引擎标记来自 server 的极速/标准回退结果）
  const timing = { transcribeMs, llmMs, engine: transcribeRes.timing || null };
  console.log(`[dualtrack] 转写 ${Math.round(transcribeMs / 1000)}s · 复盘+偷学 ${Math.round(llmMs / 1000)}s`, timing.engine);

  // 6) dialog/steals/timing 存进该条 review 的 result（向后兼容，不 bump schema）——
  //    timing 让历史回看也带「复盘用时」标识
  const row = await get_review({ id: reviewRes.reviewId });
  if (row && !row.error) {
    row.result.dialog = dialog;
    row.result.steals = steals;
    row.result.timing = timing;
    await reviewsPut(row);
  }

  // 转写警告合并进 review 结果
  await _volcDualtrackDone(dir);

  const out = { ...reviewRes, dialog, steals, timing };
  if (warnings.length) out.warnings = [...(out.warnings || []), ...warnings];
  return out;
}

/** 处理中进度广播：review.js 的进度界面监听它切换「转写中/AI 复盘中」文案。 */
function _emitDualProgress(stage) {
  try {
    window.dispatchEvent(new CustomEvent("dual-progress", { detail: { stage } }));
  } catch (_) {}
}

/**
 * retell_targets — 复述练习的目标表达（阅读联动）。两级来源：
 * ① 全局生词本里 source 命中该篇的词（你读时查过的，star/点击多优先，cap 5）——
 *    走 server RPC（与桌面同盘），本 WebView 的 IndexedDB 生词本是空的；
 * ② 不足 3 个 → LLM 从原文现场挑补齐。两级都失败也 ok:true 空数组（题签卡照样能练）。
 * @param {{title?:string, text?:string}} args
 * @returns {Promise<{ok:true, chunks:{text:string,meaning:string}[]}>}
 */
/** 从原文里找出含该表达的第一句话（词条卡的「原文例句」）——本地定位，不让 LLM 编引文。 */
function _retellQuoteFor(text, chunk) {
  const t = String(text || ""), c = String(chunk || "").trim();
  if (!t || !c) return "";
  const sentences = t.replace(/\n+/g, " ").match(/[^.!?…]+[.!?…]+["'”’)]*/g) || [];
  const needle = c.toLowerCase().replace(/\s+/g, " ");
  for (const s of sentences) {
    if (s.toLowerCase().replace(/\s+/g, " ").includes(needle)) {
      const out = s.trim();
      return out.length > 240 ? "" : out; // 句子太长当没找到（卡片装不下）
    }
  }
  return "";
}

async function retell_targets({ title = "", text = "" } = {}) {
  let hits = [];
  try {
    const resp = await httpPost("/api/get_global_notebook", {}, {});
    const entries = JSON.parse(await resp.text());
    if (Array.isArray(entries) && title) {
      hits = entries
        .filter((e) => (e.sources || []).some((s) => s && s.title === title))
        .sort((a, b) => ((b.star ? 1 : 0) - (a.star ? 1 : 0)) || ((b.clicks || 0) - (a.clicks || 0)))
        .slice(0, 5)
        .map((e) => ({
          text: String(e.word || e.lemma || "").trim(),
          meaning: String(e.contextual || e.literal || "").trim().slice(0, 16),
        }))
        .filter((c) => c.text);
    }
  } catch (e) { console.warn("[retell] 生词本命中失败:", e); }

  // ② LLM 现挑（notebook 不足 3 个时）：失败重试 1 次（同 explainer 口径）；
  //    区分「调用失败/异常」(pickError) 与「正常挑出 0 个」——只有前者才该报失败让前端显重试。
  let pickError = false;
  if (hits.length < 3 && (text || "").trim()) {
    // pickRetellChunks 失败时是「返回 _pickError」而非抛异常——两种都当失败对待，重试 1 次。
    let picked = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try { picked = await _llmPickRetellChunks({ title, text }); }
      catch (e) { console.warn("[retell] LLM 挑词抛异常（第" + (attempt + 1) + "次）:", e); picked = { ok: false, chunks: [], _pickError: true }; }
      if (picked && picked._pickError) { console.warn("[retell] LLM 挑词失败（第" + (attempt + 1) + "次），重试中…"); continue; }
      break;  // 成功、或正常挑出 0 个（都不重试）
    }
    if (picked && picked._pickError) {
      pickError = true;
    } else if (picked) {
      const seen = new Set(hits.map((h) => h.text.toLowerCase()));
      for (const c of (picked.chunks || [])) {
        if (hits.length >= 5) break;
        if (!c.text || seen.has(c.text.toLowerCase())) continue;
        seen.add(c.text.toLowerCase());
        hits.push(c);
      }
    }
  }
  // 稳健兜底：一条都没取到、且 LLM 是「调用失败/异常」（非「正常挑出 0 个」）→ 明确 ok:false，
  //   让复盘窗显「目标表达没取到 [重试]」而非转圈后无声空白（报告结果要忠实）。
  if (!hits.length && pickError) {
    console.warn("[retell] 目标表达没取到（LLM 调用失败），返回 ok:false 触发前端重试");
    return { ok: false, error: "目标表达没取到（生成失败，可重试）", _pickError: true };
  }
  // 词条化：给每枚表达配「原文例句」（本地句子定位，找不到就留空，卡片优雅降级）
  hits = hits.map((c) => ({ ...c, quote: c.quote || _retellQuoteFor(text, c.text) }));
  return { ok: true, chunks: hits };
}

async function _volcDualtrackDone(dir) {
  try {
    await httpPost("/api/dualtrack_done", {}, { dir });
  } catch (_) {
    // 静默失败：done 标记只是避免重复出现在待复盘列表，失败不影响本次复盘结果
  }
}

/** dualtrack_done — 把一段录音标记为已消费/丢弃（复盘窗待复盘 chip 的 ✕ 用）。 */
async function dualtrack_done({ dir } = {}) {
  dir = (dir || "").trim();
  if (!dir) return { ok: false, error: "缺少 dir" };
  await _volcDualtrackDone(dir);
  return { ok: true };
}

// ── 录音控制（阶段10.1）──────────────────────────────────────────────────────
// 三个薄封装，直打 server.py 对应端点。网络失败（如手机版无 server）时直接抛出，
// 不吞掉——首页卡片据此判断"整卡不渲染"（spec §3）。

/**
 * recorder_start — 拉起 headless 录音进程。
 * @returns {Promise<{ok:boolean, error?:string}>}
 */
async function recorder_start() {
  const resp = await httpPost("/api/recorder_start", {}, {});
  return resp.json();
}

/**
 * recorder_stop — 停止当前录音。
 * @returns {Promise<{ok:boolean, dir?:string, error?:string}>}
 */
async function recorder_stop() {
  const resp = await httpPost("/api/recorder_stop", {}, {});
  return resp.json();
}

/**
 * recorder_status — 查当前是否在录音。
 * @returns {Promise<{recording:boolean, startedAt?:string, elapsedSec?:number, error?:string}>}
 */
async function recorder_status() {
  // 查证：某些浏览器对完全相同 URL 的高频 GET 会做内存级缓存复用，即便响应带
  // Cache-Control: no-store 也不例外（本机 headless Chrome 实测复现，5 次同 URL 请求
  // 稳定拿到过期 body）。这里每次挂一个时间戳 query 强制 URL 唯一，绕开该缓存层——
  // 本卡片"每 1s 轮询"是硬依赖新鲜数据的场景，不能指望响应头单独兜底。
  const resp = await httpGet("/api/recorder_status?_=" + Date.now());
  // httpGet 的返回只有 {status, text}（没有 json()——2026-07-07 教训：这里曾直接
  // resp.json() 抛错，被 _renderRecCard 的 catch 吞成「整卡不渲染」，录音卡自上线
  // 起从没渲染出来过）。与 list_dualtrack 一样走 text + JSON.parse。
  return JSON.parse(await resp.text());
}

// ── 内部：当前文章标题（供 LLM context 用） ──────────────────────────────────

function _currentTitle() {
  return _bookCtx ? _bookCtx.title : "";
}

// ── 内部：data_url 转换辅助 ───────────────────────────────────────────────────

function _dataUrlToArrayBuffer(dataUrl) {
  return new Promise((resolve, reject) => {
    try {
      const [header, b64] = dataUrl.split(",");
      if (!b64) return reject(new Error("无效的 data_url"));
      const binary = atob(b64);
      const buf = new ArrayBuffer(binary.length);
      const view = new Uint8Array(buf);
      for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
      resolve(buf);
    } catch (e) {
      reject(e);
    }
  });
}

async function _dataUrlToText(dataUrl) {
  if (!dataUrl.includes(",")) throw new Error("无效的 data_url");
  const [header, b64] = dataUrl.split(",");
  // 支持 base64 和 URI 编码
  if (header.includes("base64")) {
    const binary = atob(b64);
    // UTF-8 解码
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder("utf-8").decode(bytes);
  }
  return decodeURIComponent(b64);
}

// ── LocalApi 对象 ─────────────────────────────────────────────────────────────

export const LocalApi = {
  ready,
  // 配置
  get_config, get_settings, save_settings, test_settings,
  // 解析
  process, process_file, get_toc, load_chapter,
  // 书架
  list_library, load_archive, delete_archive, save_session,
  // 生词本
  get_notebook, get_global_notebook,
  set_star, set_known, set_known_global, delete_global,
  // 导入导出
  vocab_export, vocab_import,
  // AI/音频 stub
  explain_word, explain_selection, ask_followup, get_audio,
  prewarm_word, start_pregen, get_pregen_status, get_progress,
  // 口语复盘（阶段4.1 + 阶段8升级）
  review_speech, list_mistakes, set_mistake_mastered, set_mistake_star, delete_mistake, list_reviews,
  save_mistake_from_item, get_review,
  // 写作训练（阶段4.2）
  make_writing_drill, check_writing,
  // 读物精选（阶段5）
  fetch_feed,
  // 语音转写（阶段7）
  transcribe_audio,
  // 词块系统（阶段9）
  add_chunk, list_chunks, delete_chunk, set_chunk_star, suggest_chunk_topic, check_chunk_drill,
  // 双轨对话录音（阶段10）
  list_dualtrack, process_dualtrack, dualtrack_done, retell_targets,
  // 录音控制（阶段10.1）
  recorder_start, recorder_stop, recorder_status,
};
