/**
 * classifier.js — 词汇分层大脑（端口自 vocab.py + app.py 的 _tier_for/_freq_band）
 *
 * 逐字对照 Python 源，规则与阈值完全一致：
 *   COMMON_RANK_CUTOFF = 8000
 *   LEVELS（cet4/cet4-6/cet6/kaoyan/ielts/toefl）
 *   _spelling_variants, _STOPWORDS, _classify_lemma, _is_flag
 *   _tier_for, _freq_band（来自 app.py 第 94–119 行）
 *   VocabClassifier.analyze / classify_word / sorted_hits
 */

import { analyze as nlpAnalyze, lemmatize } from "./nlp.js";

// ─── 常量（照 vocab.py） ──────────────────────────────────────────────────────

const COMMON_RANK_CUTOFF = 8000; // 与 _COMMON_TIER_CUTOFF（app.py:91）相同

/** vocab.py LEVELS */
const LEVELS = {
  "cet4":   { label: "CET-4",   known_rank: 4000 },
  "cet4-6": { label: "CET-4~6", known_rank: 5500 },
  "cet6":   { label: "CET-6",   known_rank: 6500 },
  "kaoyan": { label: "考研",    known_rank: 9000 },
  "ielts":  { label: "雅思",    known_rank: 13000 },
  "toefl":  { label: "托福",    known_rank: 18000 },
};
const DEFAULT_LEVEL = "cet4-6";

/** vocab.py _STOPWORDS（逐字） */
const _STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "if", "of", "at", "by", "for", "with",
  "about", "against", "between", "into", "through", "during", "before", "after",
  "above", "below", "to", "from", "up", "down", "in", "out", "on", "off", "over",
  "under", "again", "further", "then", "once", "here", "there", "when", "where",
  "why", "how", "all", "any", "both", "each", "few", "more", "most", "other",
  "some", "such", "no", "nor", "not", "only", "own", "same", "so", "than",
  "too", "very", "s", "t", "can", "will", "just", "don", "should", "now",
  "i", "me", "my", "myself", "we", "our", "ours", "ourselves", "you", "your",
  "yours", "yourself", "yourselves", "he", "him", "his", "himself", "she", "her",
  "hers", "herself", "it", "its", "itself", "they", "them", "their", "theirs",
  "themselves", "what", "which", "who", "whom", "this", "that", "these", "those",
  "am", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had",
  "having", "do", "does", "did", "doing", "would", "could", "should", "ought",
  "may", "might", "must", "shall",
]);

/** vocab.py _WORD_RE：纯字母（含连字符）*/
const _WORD_RE = /^[a-z]+(?:-[a-z]+)*$/;

// ─── 模块级词表缓存（process-wide，对应 Python _CET4/_CET6/_FREQ） ──────────

let _cet4 = null;  // Set<string>
let _cet6 = null;  // Set<string>
let _freq = null;  // Map<string, number>  word → rank(1=最常见)
let _wordlistsLoadPromise = null;

/**
 * 异步加载词表 JSON（仅首次触发 fetch，后续复用 promise）。
 * 词表放在 mobile/data/wordlists.json（构建期由 build-wordlists.mjs 生成）。
 */
async function _ensureWordlists() {
  if (_cet4) return; // 已加载
  if (!_wordlistsLoadPromise) {
    _wordlistsLoadPromise = (async () => {
      // 支持 Node（file:///）和 WebView（相对路径）两种场景
      const url = _resolveDataUrl("data/wordlists.json");
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Failed to load wordlists: ${resp.status}`);
      const data = await resp.json();
      _cet4 = new Set(data.cet4);
      _cet6 = new Set(data.cet6);
      _freq = new Map(Object.entries(data.subtlex).map(([w, r]) => [w, Number(r)]));
    })();
  }
  await _wordlistsLoadPromise;
}

/**
 * 解析词表 URL。
 *   浏览器：相对路径（相对 HTML 所在目录，即 mobile/）
 *   Node.js（devtest）：传入绝对路径覆盖，或通过 SituCore.setDataBase(url) 设置
 */
let _dataBase = null; // Node 环境由外部设置

function _resolveDataUrl(relPath) {
  if (_dataBase) return _dataBase + relPath;
  return relPath; // 浏览器：相对 HTML 页面
}

/** 供 Node 测试环境设置词表基础 URL（浏览器不需要调用） */
function setDataBase(base) {
  _dataBase = base.endsWith("/") ? base : base + "/";
}

// ─── 拼写变体（逐字端口 vocab.py._spelling_variants） ───────────────────────

function _spellingVariants(w) {
  const out = [w];
  if (w.endsWith("or") && !["ator","ctor","ssor","tor"].some(s => w.endsWith(s)))
    out.push(w.slice(0, -2) + "our");
  if (w.endsWith("our"))   out.push(w.slice(0, -3) + "or");
  if (w.endsWith("ize"))   out.push(w.slice(0, -3) + "ise");
  if (w.endsWith("ise"))   out.push(w.slice(0, -3) + "ize");
  if (w.endsWith("ization"))  out.push(w.slice(0, -7) + "isation");
  if (w.endsWith("isation"))  out.push(w.slice(0, -7) + "ization");
  if (w.endsWith("ter"))   out.push(w.slice(0, -2) + "re");
  if (w.endsWith("tre"))   out.push(w.slice(0, -2) + "er");
  if (w.endsWith("log"))   out.push(w + "ue");
  if (w.endsWith("logue")) out.push(w.slice(0, -2));
  return out;
}

// ─── 频率档（端口 app.py._tier_for / _freq_band） ───────────────────────────

/** app.py _tier_for（第 94–97 行） */
function _tierFor(rank) {
  if (rank != null && rank >= COMMON_RANK_CUTOFF) return "rare";
  return "common"; // known-common OR unknown → high-frequency
}

/** app.py _freq_band（第 104–119 行） */
function _freqBand(rank) {
  if (rank == null) return null;
  if (rank <= 3000)  return { label: "A", name: "最常用" };
  if (rank <= 8000)  return { label: "B", name: "常用" };
  if (rank <= 15000) return { label: "C", name: "较常用" };
  if (rank <= 30000) return { label: "D", name: "进阶" };
  return { label: "E", name: "生僻" };
}

// ─── VocabClassifier ─────────────────────────────────────────────────────────

class VocabClassifier {
  /**
   * @param {string} userLevel — "cet4" | "cet4-6" | "cet6" | "kaoyan" | "ielts" | "toefl"
   */
  constructor(userLevel = DEFAULT_LEVEL) {
    this.userLevel = userLevel in LEVELS ? userLevel : DEFAULT_LEVEL;
    const cfg = LEVELS[this.userLevel];
    this.knownRank = cfg.known_rank;
    this.includeCet6 = this.knownRank >= LEVELS["cet6"].known_rank;
    // 词表在 init() 时加载
    this._ready = false;
  }

  /** 必须在第一次 analyze 前调用（或直接调用 analyze，内部会 await） */
  async init() {
    if (this._ready) return;
    await _ensureWordlists();
    this._ready = true;
  }

  // ── 词形→层级（对应 _classify_lemma） ────────────────────────────────────

  _classifyLemma(lemma) {
    for (const v of _spellingVariants(lemma)) {
      if (_cet4.has(v)) return "cet4";
      if (_cet6.has(v)) return "cet6";
    }
    return "beyond";
  }

  // ── 是否标记为生词（对应 _is_flag） ──────────────────────────────────────

  _isFlag(lemma, rank) {
    for (const v of _spellingVariants(lemma)) {
      if (_cet4.has(v)) return false;
      if (this.includeCet6 && _cet6.has(v)) return false;
    }
    if (rank != null && rank <= this.knownRank) return false;
    return true;
  }

  /**
   * 分析文章（blocks 或纯文本）。
   *
   * @param {Array<{type:string, text:string}> | string} articleOrBlocks
   *   blocks 数组（每项有 .type 和 .text）或纯文本字符串。
   *
   * @returns {{ blocks: RenderBlock[], hits: Map<string,WordHit>, total_tokens: number }}
   *
   * 对应 vocab.py VocabClassifier.analyze
   */
  async analyze(articleOrBlocks) {
    await this.init();

    let blocks;
    if (typeof articleOrBlocks === "string") {
      blocks = _textToBlocks(articleOrBlocks);
    } else if (Array.isArray(articleOrBlocks)) {
      blocks = articleOrBlocks;
    } else {
      blocks = [articleOrBlocks];
    }

    /** @type {RenderBlock[]} */
    const renderBlocks = [];
    /** @type {Map<string, WordHit>} */
    const hits = new Map();
    let totalTokens = 0;

    for (const block of blocks) {
      const btype = block.type || "p";
      const btext = block.text || String(block);
      if (!btext.trim()) continue;

      // nlp.js 的 analyze 返回 [{text, tokens:[]}]
      const sentences = nlpAnalyze(btext);
      /** @type {Array<TokenData[]>} */
      const blockTokens = [];
      const blockSentences = [];

      for (const sent of sentences) {
        const sentText = sent.text.trim();
        blockSentences.push(sentText);

        /** @type {TokenData[]} */
        const sentTokens = [];

        for (const tok of sent.tokens) {
          // 跳过纯空白 token（对应 spaCy tok.is_space）
          if (tok.is_space) continue;

          const surface = tok.text;
          const lemma = tok.lemma; // already lowercased in nlp.js
          const ws = tok.ws || "";
          const pos = tok.pos;

          // 非纯字母词 / 标点 / 数字 → punct
          if (!_WORD_RE.test(lemma) || tok.is_punct || tok.like_num) {
            sentTokens.push({ text: surface, ws, kind: "punct" });
            continue;
          }

          totalTokens++;
          const rank = _freq.get(lemma) ?? null;

          // 停用词或极短词
          // wink 偶尔把功能词误还原（through→thru），按 surface 兜底查一次停用词，保持与 Python 意图一致
          if (_STOPWORDS.has(lemma) || _STOPWORDS.has(surface.toLowerCase()) || lemma.length <= 2) {
            sentTokens.push({ text: surface, ws, kind: "stop", lemma, pos, rank });
            continue;
          }

          // 专有名词
          if (pos === "PROPN") {
            sentTokens.push({ text: surface, ws, kind: "propn", lemma, pos, rank });
            continue;
          }

          const level = this._classifyLemma(lemma);
          const flagged = this._isFlag(lemma, rank);

          if (flagged) {
            if (!hits.has(lemma)) {
              hits.set(lemma, {
                lemma,
                surface_forms: new Set(),
                count: 0,
                level,
                daily_rank: rank,
                example_sentence: sentText,
              });
            }
            const h = hits.get(lemma);
            h.count++;
            h.surface_forms.add(surface);
            sentTokens.push({
              text: surface, ws, kind: "flag",
              lemma, level, pos, rank,
              freq: _tierFor(rank),
              sentence: sentText,
            });
          } else {
            sentTokens.push({ text: surface, ws, kind: "known", lemma, level, pos, rank });
          }
        }

        blockTokens.push(sentTokens);
      }

      renderBlocks.push({ type: btype, tokens: blockTokens, sentences: blockSentences });
    }

    return { blocks: renderBlocks, hits, total_tokens: totalTokens };
  }

  /**
   * 对单个点击词做词形还原 + 分类。
   * 对应 vocab.py VocabClassifier.classify_word
   *
   * 未知频率默认 tier="common"（与 Python 行为一致：'when unsure, treat as high-frequency'）
   */
  async classify_word(word, sentence = "") {
    await this.init();
    const surface = (word || "").trim();
    const lemma = lemmatize(surface, sentence);
    const level = this._classifyLemma(lemma);
    const rank = _freq.get(lemma) ?? null;
    let tier;
    if (rank != null && rank >= COMMON_RANK_CUTOFF) {
      tier = "rare";
    } else {
      tier = "common"; // known-common OR unknown → treat as high-frequency
    }
    return { lemma, level, freq_tier: tier, daily_rank: rank };
  }

  /**
   * 按日常频率排序 hits（最常见在前）。
   * 对应 vocab.py VocabClassifier.sorted_hits
   */
  sorted_hits(report) {
    const hitsMap = report.hits instanceof Map ? report.hits : new Map(Object.entries(report.hits));
    return Array.from(hitsMap.values()).sort((a, b) => {
      const ra = a.daily_rank ?? 1e9;
      const rb = b.daily_rank ?? 1e9;
      if (ra !== rb) return ra - rb;
      return b.count - a.count;
    });
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

/** 纯文本 → blocks（对应 vocab.py._text_to_blocks） */
function _textToBlocks(text) {
  return text
    .trim()
    .split(/\n\s*\n/)
    .filter(p => p.trim())
    .map(p => ({ type: "p", text: p.trim().replace(/\n/g, " ") }));
}

// ─── 导出 ─────────────────────────────────────────────────────────────────────

export {
  VocabClassifier,
  LEVELS,
  DEFAULT_LEVEL,
  COMMON_RANK_CUTOFF,
  _spellingVariants,
  _STOPWORDS,
  _tierFor,
  _freqBand,
  setDataBase,
};

/**
 * @typedef {{ type:string, tokens:TokenData[][], sentences:string[] }} RenderBlock
 * @typedef {{ lemma:string, surface_forms:Set<string>, count:number,
 *             level:string, daily_rank:number|null, example_sentence:string }} WordHit
 * @typedef {{ text:string, ws:string, kind:string, lemma?:string, level?:string,
 *             pos?:string, rank?:number|null, freq?:string, sentence?:string }} TokenData
 */
