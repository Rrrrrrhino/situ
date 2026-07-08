/**
 * llm.js — DeepSeek / 兼容 OpenAI 接口的讲解层
 *
 * 端口自 reader_core/llm.py（prompt 逐字，一字不改）。
 * 从 store.js settingsGet 读取 provider/api_key/model/base_url。
 * 外部 HTTP 走 http.js（桥 or fetch）。
 *
 * 导出：
 *   explainWord(args)      → §6.1 explain_word 返回形状
 *   explainSelection(args) → §6.1 explain_selection 返回形状
 *   askFollowup(args)      → §6.1 ask_followup 返回形状
 */

import { httpPost } from "./http.js";
import { settingsGet } from "./store.js";

// ── Provider 表（照搬 llm.py PROVIDERS） ──────────────────────────────────
const PROVIDERS = {
  deepseek: ["https://api.deepseek.com/v1", "deepseek-v4-pro"],
  zhipu:    ["https://open.bigmodel.cn/api/paas/v4", "glm-4-flash"],
  kimi:     ["https://api.moonshot.cn/v1", "moonshot-v1-8k"],
  openai:   ["https://api.openai.com/v1", "gpt-4o-mini"],
};

// ── Prompts（逐字端口，一字不改） ─────────────────────────────────────────

const SYSTEM_PROMPT = `你是一位博学又温暖的英语老师，最擅长把一个单词讲"活"。
你面对的是中国 CET-4/6 水平的学习者。你讲单词时，不只给一个干巴巴的中文意思，
而是会带着学生看见这个词的来历、画面和情感，让人记得住、有共鸣。
你只输出严格的 JSON，不输出任何额外文字。`;

const USER_TEMPLATE = `请讲解英文单词 **{word}**（原形：{lemma}）在下面这句话里的用法。

【这句话】
{sentence}

【文章主题】{title}

请输出严格 JSON，字段如下：
{{
  "phonetic": "国际音标（IPA），带斜杠，如 /ˈsʌm.θɪŋ/。给通行的美式读音，务必准确，拿不准的音节宁可从简也不要造。",
  "pos": "在这句话里的词性，用简短中文+缩写，如 '动词 v.' / '形容词 adj.'",
  "literal": "这个词的本义/核心意思（中文，简洁，10-20字）。如果有有意思的词根/构词，可一并点出。",
  "contextual": "它在这句话里的具体意思（中文，结合上下文给最贴切的解释，15-30字）。不要照抄 literal——要体现这句话给它添了什么：具体指什么、带什么色彩。",
  "explanation": "一段有温度的讲解（中文，60-120字）：把本义和这里的语境意思连起来，讲清楚这个词是怎么从本义'引申'到这里的；可以用一点画面感、联想或词根故事帮助记忆。语气亲切、像老师在旁边轻声点拨，不要堆术语，不要复述前面的字段。"
}}

特别注意：若这个词在句中其实是**短语动词或固定搭配的一部分**（如 give up 里的 give、take …into account 里的 take），contextual 和 explanation 都要按**整个搭配**在此处的意思来讲，并点明「单看这个词会误解」。

只输出 JSON。`;

const FOLLOWUP_SYSTEM = `你是一位博学又温暖的英语老师，正和一位 CET-4/6 水平的中国学生，围绕一篇英文文章里的某个词或词组做"追问式"讲解。
你的回答要：紧扣这个词/词组在【这句话】里的真实语境；用中文讲解，给英文例句时随手配一句简短中文翻译；语气亲切口语、像在旁边轻声点拨；不堆术语、不跑题、不要重复学生已经看到的讲解。
学生的目标是真正把这个词学透、用对，所以**该讲透就讲透、不要怕长**：把来龙去脉、用法边界、典型搭配、例句都讲清楚，宁可详尽也不要点到为止。可用很轻的 Markdown（**加粗**、换行、短横线列表）让较长的解析有层次，但不要输出 JSON 或代码块。`;

// 词汇深解：脱离当前语境，给一个词建立"词感/画面"的长解析。
// 刻意不引入其它相近生词做辨析——避免给学生凭空种下新的混淆（interference）。
const DEEP_SYSTEM = `你是一位博学又温暖的英语老师，正帮一位 CET-4/6 水平的中国学生**建立一个英语词真正的"词感"**。学生对这个词不太熟、或和别的词记混了，需要你**脱离当前文章的语境**，把这个词本身讲透——它到底什么意思、给人什么画面和感觉。
请用中文，结构清楚、可以长，按下面几块来讲（每块用 **加粗小标题** 起头）：
**核心画面**：一两句话点出这个词最本质的意象/感觉，让学生"看见"它，而不是背一条干巴巴的中文释义。
**最常见的几种用法**：挑这个词在真实英语里最高频的 2–3 种含义/用法，每种都说清在什么场景下用，并各配 1 个地道英文例句 + 一句简短中文翻译，让学生从例句里"摸到"这个词。
**串起来的感觉**：用一句话把上面这些用法背后共通的内核串起来，帮学生形成一个统一的直觉。
要求：例句地道、画面感强；讲"感受和画面"而不是堆术语；**绝对不要**为了辨析而引入其它相近的生词（这会造成新的混淆），只聚焦这一个词本身。轻 Markdown 即可，不要 JSON 或代码块。`;

// 常见程度：只评判"当前语境下这个具体用法"的常见度，固定 5 档。
// 回答必须以可机器解析的一行起头：@@FREQ@@ <档位> | <领域，可留空>
const FREQ_SYSTEM = `你是一位英语语料与语用专家，面对一位 CET-4/6 水平的中国学生。学生想知道：这个词/词组**在【这句话】里的这个具体含义和用法**，在真实英语里到底有多常见——好决定要不要专门去习得它。
请只评判**当前语境下的这个用法**（不是这个词所有意思的笼统常见度）。从下面 5 档里选**恰好一档**：极其常见 / 非常常见 / 常见 / 罕见 / 极其罕见。
你的回答**必须**严格以这样一行开头（程序要解析它，格式不能变）：
@@FREQ@@ <档位> | <领域或语体，可留空>
其中 <档位> 必须是上面 5 个词之一；若这个用法只在某个具体领域/行业/语体里才常见（如 财经、法律、口语、学术、文学），就在 | 后写出来；若是跨语境普遍如此，就连 | 一起省略。
然后空一行，用中文讲清楚：为什么落在这一档、通常在哪些场合会遇到它；再给 2–3 个能体现这个用法的英文例句，每句配一句简短中文翻译，让学生对这个用法留下画面和印象。可用轻 Markdown，但不要 JSON 或代码块。
若我在下面提供了这个词的【整体词频档】（A 最常用→E 生僻，来自语料排名），而它与你对**当前用法**常见度的判断明显相左（例如这个词整体偏生僻、但它在此处的这个用法其实相当常见，或反之），请在开头那行之后**先用一句话点破这个反差并简述原因**（如"这个词整体冷僻，但你遇到的这个用法是它最常见的意思"）——这正是学生最容易困惑、也最需要你解释清楚的地方。`;

const SELECTION_SYSTEM = `你是一位博学又温暖的英语老师，面对的是 CET-4/6 水平的中国学习者。
学生从一篇英文文章里手动选中了一段文字——可能是一个短语/固定搭配，也可能是一整句话或一个从句。
你要先判断它属于「短语」还是「句子」，再据此给出讲解。你只输出严格的 JSON，不输出任何额外文字。`;

const SELECTION_TEMPLATE = `学生选中的文字是：
**{text}**

它所在的句子（上下文）：
{sentence}

【文章主题】{title}

请先判断 kind（硬规则，照办即可）：
- 选中文字达到 **6 个英文单词或以上**，一律 kind = "sentence"——不管它看起来像不像短语、完不完整。
- 只有 5 个词以内、且不含主谓结构的短语 / 固定搭配，才是 kind = "phrase"。
- 拿不准时，宁可判 "sentence"。

然后据此输出严格 JSON。

【如果 kind = "phrase"】
{{
  "kind": "phrase",
  "meaning": "这个短语在当前语境中的意思（中文，简洁贴切，15-45字）。",
  "talk": "一段有温度的讲解（中文，60-150字）：讲清这个短语的用法、为什么这么搭配、语气色彩；若它本身是值得记的固定搭配/高频表达，点出来。不要只复述意思。"
}}

【如果 kind = "sentence"】
{{
  "kind": "sentence",
  "meaning": "这段文字在语境里的**完整**意思（中文，30-110字）。务必覆盖学生所选的全部内容，绝不能只翻译开头。若学生只选了句子的一部分、结构或意思不完整（例如以介词/连词截断，像 '…flows of' 这样断在半截），请结合上下文把缺失的部分补足，让「含义」呈现这段文字所在的**完整句子**的意思；可在末尾用（……）简短标注你补足的部分。",
  "key_words": [
    {{"word": "句中核心或较难的词/短语（英文，原形）", "gloss": "简短中文释义（10字内）"}}
  ],
  "talk": "一段讲解（中文，100-220字）：不要只把句意再重申一遍。要把上面 key_words 里的重点词逐个讲清；若句中有出色、高频或地道的表达——无论是单词、短语还是句式结构——都点出来并稍作讲解，让学生学到能复用的东西。语气亲切，像老师在旁边点拨。"
}}

key_words 列 2-5 个最值得学的即可，宁缺毋滥。只输出 JSON。`;

// ── 读取 LLM 配置（从 store.js settings） ────────────────────────────────

// 复盘窗（独立 WebView）没配 key 时，向主窗 /api/get_llm_defaults 要一份默认（含原始 key）。
// 一进程缓存一次：拿到就复用，避免每次 LLM 调用都发一趟 RPC。key 只放内存，绝不写进本 WebView
// 的持久层（settingsPut），保证"本地一旦显式保存过就以本地为准"。
let _mainDefaultsPromise = null;
async function _fetchMainDefaults() {
  if (!_mainDefaultsPromise) {
    _mainDefaultsPromise = (async () => {
      try {
        const resp = await httpPost("/api/get_llm_defaults", {}, {});
        const j = JSON.parse(await resp.text());
        return j && typeof j === "object" ? j : {};
      } catch (_) {
        return {};  // 主窗不可达（如纯手机版无 server）：静默降级，维持"没 key"状态
      }
    })();
  }
  return _mainDefaultsPromise;
}

async function _loadConfig() {
  const provider = ((await settingsGet("provider", "")) || "").toLowerCase().trim();
  let   api_key  = ((await settingsGet("api_key",  "")) || "").trim();
  let   model    = ((await settingsGet("model",     "")) || "").trim();
  let   base_url = ((await settingsGet("base_url",  "")) || "").trim();
  let   usingMainDefault = false;

  // 本地读不到 key → 借主窗的默认（provider/model/base_url 也一并借，让默认成套；
  // 本地只要显式填过的项就各自压过默认）。这样 key 全局只需在主窗设置里填一次。
  if (!api_key) {
    const md = await _fetchMainDefaults();
    if (md.api_key) {
      api_key = md.api_key;
      usingMainDefault = true;
      if (!base_url && md.base_url) base_url = md.base_url;
      if (!model && md.model) model = md.model;
      // provider 用于选默认 url/model；本地没填就跟主窗
      if (!provider && md.provider) {
        const [du, dm] = PROVIDERS[md.provider.toLowerCase()] || PROVIDERS.deepseek;
        if (!base_url) base_url = du;
        if (!model) model = dm;
      }
    }
  }

  const effProvider = provider || "deepseek";
  const [defaultUrl, defaultModel] = PROVIDERS[effProvider] || PROVIDERS.deepseek;
  if (effProvider === "deepseek" && model === "deepseek-chat") {
    console.log("[llm] deepseek-chat 已是弱档别名(v4-flash)，本次加载自动升级为 deepseek-v4-pro");
    model = "deepseek-v4-pro";
  }
  return {
    provider: effProvider,
    api_key,
    model:    model    || defaultModel,
    base_url: base_url || defaultUrl,
    enabled:  Boolean(api_key),
    usingMainDefault,
  };
}

// ── 读取"复盘精批模型"配置（阶段8 §6）：缺哪项回落主配置对应项 ────────────

async function _loadReviewConfig() {
  const mainCfg = await _loadConfig();

  const rProvider = ((await settingsGet("review_provider", "")) || "").toLowerCase().trim();
  const rApiKey   = ((await settingsGet("review_api_key",  "")) || "").trim();
  let   rModel    = ((await settingsGet("review_model",    "")) || "").trim();
  const rBaseUrl  = ((await settingsGet("review_base_url", "")) || "").trim();

  if (!rProvider && !rApiKey && !rModel && !rBaseUrl) {
    // 全部留空：完全跟随主配置
    return mainCfg;
  }

  const provider = rProvider || mainCfg.provider;
  if (provider === "deepseek" && rModel === "deepseek-chat") {
    console.log("[llm] review_model=deepseek-chat 已是弱档别名(v4-flash)，本次加载自动升级为 deepseek-v4-pro");
    rModel = "deepseek-v4-pro";
  }
  const [defaultUrl, defaultModel] = PROVIDERS[rProvider] || PROVIDERS[mainCfg.provider] || PROVIDERS.deepseek;
  const api_key  = rApiKey   || mainCfg.api_key;
  return {
    provider,
    api_key,
    model:    rModel   || defaultModel,
    base_url: rBaseUrl || defaultUrl,
    enabled:  Boolean(api_key),
  };
}

// ── _extractJson：照搬 llm.py._extract_json 的容错逻辑 ────────────────────

function _extractJson(content) {
  content = (content || "").trim();
  if (content.startsWith("```")) {
    const firstNl = content.indexOf("\n");
    if (firstNl >= 0) content = content.slice(firstNl + 1);
    if (content.endsWith("```")) content = content.slice(0, -3);
    if (content.startsWith("json")) content = content.slice(4);
  }
  try {
    return JSON.parse(content);
  } catch (_) {
    const start = content.indexOf("{");
    const end   = content.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try { return JSON.parse(content.slice(start, end + 1)); } catch (_) {}
    }
    return {};
  }
}

// ── 内部：发一次 chat completions 请求 ───────────────────────────────────

async function _chatCreate({ cfg, messages, temperature = 0.6, wantJson = false, maxTokens = 4096 }) {
  const body = {
    model: cfg.model,
    messages,
    temperature,
    max_tokens: maxTokens,
  };
  if (wantJson) {
    body.response_format = { type: "json_object" };
  }
  const resp = await httpPost(
    cfg.base_url.replace(/\/$/, "") + "/chat/completions",
    { Authorization: "Bearer " + cfg.api_key },
    body,
  );
  if (resp.status >= 400) {
    const txt = await resp.text();
    throw new Error(`HTTP ${resp.status}: ${txt.slice(0, 200)}`);
  }
  const data = await resp.json();
  const choice = (data.choices || [])[0] || {};
  const content = (choice.message || {}).content || "";
  const finishReason = choice.finish_reason || "";
  return { content, finishReason, data };
}

// ── 内部：带 want_json→降级重试 + 空答重试（v4-pro 推理模型坑） ──────────

async function _chatWithFallback({ cfg, messages, temperature = 0.6, maxTokens = 4096 }) {
  // 第一次：带 json_object mode
  let result;
  try {
    result = await _chatCreate({ cfg, messages, temperature, wantJson: true, maxTokens });
  } catch (_) {
    // 降级：不带 json_object
    result = await _chatCreate({ cfg, messages, temperature, wantJson: false, maxTokens });
  }
  // 空答重试（v4-pro 推理模型 reasoning 吃掉 token 导致正文为空）
  if (!result.content.trim() || result.finishReason === "length") {
    try {
      result = await _chatCreate({ cfg, messages, temperature, wantJson: false, maxTokens: maxTokens * 2 });
    } catch (_) {}
  }
  return result.content;
}

// ── 公开：explainWord ─────────────────────────────────────────────────────

/**
 * 端口 app.py.explain_word（LLM 部分）
 * @param {{word:string, sentence?:string, lemma?:string, level?:string, freq?:string, phrase?:boolean, title?:string}} args
 * @returns {Promise<{ok:boolean, phonetic?:string, pos?:string, literal?:string, contextual?:string, explanation?:string, error?:string}>}
 */
export async function explainWord({ word, sentence = "", lemma = "", level = "", freq = "", phrase = false, title = "" } = {}) {
  const cfg = await _loadConfig();
  if (!cfg.enabled) {
    return { ok: false, error: "还没填 API Key，点右上角「设置」填入后即可讲解" };
  }

  const lem = lemma || word.toLowerCase();
  const prompt = USER_TEMPLATE
    .replace("{word}", word)
    .replace("{lemma}", lem)
    .replace("{sentence}", (sentence || "").slice(0, 600))
    .replace("{title}", (title || "（无）").slice(0, 120));

  const messages = [
    { role: "system",  content: SYSTEM_PROMPT },
    { role: "user",    content: prompt },
  ];

  let content;
  try {
    content = await _chatWithFallback({ cfg, messages, temperature: 0.6, maxTokens: 4096 });
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 160) };
  }

  const data = _extractJson(content);
  return {
    ok: true,
    word,
    lemma: lem,
    level: level || "",
    freq_tier: freq || "common",
    phonetic:    String(data.phonetic    || "").trim(),
    pos:         String(data.pos         || "").trim(),
    literal:     String(data.literal     || "").trim(),
    contextual:  String(data.contextual  || "").trim(),
    explanation: String(data.explanation || "").trim(),
  };
}

// ── 公开：explainSelection ────────────────────────────────────────────────

/**
 * 端口 app.py.explain_selection（LLM 部分）
 * @param {{text:string, sentence?:string, title?:string}} args
 * @returns {Promise<{ok:boolean, kind?:string, meaning?:string, talk?:string, key_words?:Array, error?:string}>}
 */
export async function explainSelection({ text = "", sentence = "", title = "" } = {}) {
  const cfg = await _loadConfig();
  if (!cfg.enabled) {
    return { ok: false, error: "还没填 API Key，点右上角「设置」填入后即可讲解" };
  }
  text = (text || "").trim();
  if (!text) return { ok: false, error: "没有选中文字" };

  const prompt = SELECTION_TEMPLATE
    .replace("{text}", text.slice(0, 2000))
    .replace("{sentence}", (sentence || text).slice(0, 1200))
    .replace("{title}", (title || "（无）").slice(0, 120));

  const messages = [
    { role: "system", content: SELECTION_SYSTEM },
    { role: "user",   content: prompt },
  ];

  let content;
  try {
    content = await _chatWithFallback({ cfg, messages, temperature: 0.6, maxTokens: 4096 });
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 160) };
  }

  const data = _extractJson(content);

  // kind 判定（照搬 llm.py.explain_selection）
  let kind = String(data.kind || "").trim().toLowerCase();
  if (kind !== "phrase" && kind !== "sentence") {
    const tail = text.trimEnd().slice(-1);
    kind = (text.split(/\s+/).length >= 5 || ".?!；;".includes(tail)) ? "sentence" : "phrase";
  }
  // safety net：长片段强制 sentence
  if (text.split(/\s+/).length >= 6) kind = "sentence";

  const out = {
    ok: true,
    kind,
    meaning: String(data.meaning || "").trim(),
    talk:    String(data.talk    || "").trim(),
  };
  if (kind === "sentence") {
    const clean = [];
    for (const k of (data.key_words || [])) {
      if (k && typeof k === "object") {
        const w = String(k.word  || "").trim();
        const g = String(k.gloss || "").trim();
        if (w) clean.push({ word: w, gloss: g });
      }
    }
    out.key_words = clean;
  }
  return out;
}

// ── 公开：askFollowup ─────────────────────────────────────────────────────

/**
 * 端口 app.py.ask_followup（LLM 部分）
 * @param {{word:string, lemma?:string, sentence?:string, question?:string, label?:string, prior?:string, history?:{q,a}[], mode?:string, band?:string, title?:string}} args
 * @returns {Promise<{ok:boolean, answer?:string, error?:string}>}
 */
export async function askFollowup({
  word = "", lemma = "", sentence = "", title = "",
  prior = "", history = [], question = "",
  mode = "", band = "",
} = {}) {
  const cfg = await _loadConfig();
  if (!cfg.enabled) {
    return { ok: false, error: "还没填 API Key，点右上角「设置」填入后即可追问" };
  }
  word = (word || "").trim();
  if (!word) return { ok: false, error: "缺少要追问的词" };

  mode = (mode || "").trim().toLowerCase();
  const systemMap = { deep: DEEP_SYSTEM, freq: FREQ_SYSTEM };
  const system = systemMap[mode] || FOLLOWUP_SYSTEM;

  // 构建上下文（照搬 llm.py.followup）
  let ctx = `我们在讨论的词/词组：**${word}**`;
  if (lemma && lemma.toLowerCase() !== word.toLowerCase()) ctx += `（原形：${lemma}）`;
  if (sentence) ctx += `\n【这句话】${sentence.slice(0, 600)}`;
  if (title)    ctx += `\n【文章主题】${title.slice(0, 120)}`;
  if (prior)    ctx += `\n【学生已看到的讲解】${prior.slice(0, 500)}`;
  if (mode === "freq" && band) {
    ctx += `\n【这个词的整体词频档】${band}（A 最常用→E 生僻，来自语料排名，和'当前用法常见度'是两回事）`;
  }

  const messages = [
    { role: "system",    content: system },
    { role: "user",      content: ctx + "\n\n（接下来我会就这个词向你追问，请始终扣住以上语境作答。）" },
    { role: "assistant", content: "好的，我已经记住这个词在这句话里的语境了，你问吧。" },
  ];
  for (const turn of (history || [])) {
    const q = (turn.q || "").trim();
    const a = (turn.a || "").trim();
    if (q) messages.push({ role: "user",      content: q });
    if (a) messages.push({ role: "assistant", content: a });
  }
  messages.push({ role: "user", content: (question || "").trim() || "就这个词再多讲一点。" });

  let content;
  try {
    // 追问是纯文本，不要 json_object mode，直接调（给足 max_tokens 防截断）
    const result = await _chatCreate({ cfg, messages, temperature: 0.7, wantJson: false, maxTokens: 4096 });
    content = result.content;
    // 空答重试
    if (!content.trim() || result.finishReason === "length") {
      const r2 = await _chatCreate({ cfg, messages, temperature: 0.7, wantJson: false, maxTokens: 8192 });
      if (r2.content.trim()) content = r2.content;
    }
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 160) };
  }

  if (!content.trim()) return { ok: false, error: "没收到回答，请重试" };
  return { ok: true, answer: content.trim() };
}

// ── 口语复盘 Prompt（逐字端口，一字不改，阶段4.1） ────────────────────────

export const REVIEW_SYSTEM = `你是一位资深的英语口语外教，专门帮"中文母语"的学习者复盘他们自己说出口或写出来的英文。学习者会给你一段他本人产出的英文（可能是把口播录音转写来的，会有口语的不完整、重复、口头语，这些口语特征不要苛责）。你的任务：客观、具体地复盘，帮他下次说得更准、更地道。

你只能输出一个 JSON 对象，结构如下（不要输出任何额外文字，不要 markdown 代码块）：
{
  "strengths": ["具体夸某个词 / 某个表达用得好，1-3 条；没有就给空数组"],
  "errors": [
    {
      "original": "学习者原文里出错的最小连续片段，必须逐字照抄原文",
      "correction": "改正后的说法",
      "type": "grammar | wordchoice | collocation 三选一",
      "why": "一句中文，说清为什么错或背后的规则"
    }
  ],
  "naturalness": [
    {
      "original": "学习者原文里的连续片段，必须逐字照抄原文",
      "better": "母语者更自然的说法",
      "why": "一句中文，说清语感差别 / 为什么这样更自然"
    }
  ]
}

判定与口吻要求：
- errors 只放"真正的错误"：语法错、用错词（词不达意）、搭配错。naturalness 放"没有语法错、但母语者一般不这么说"的表达。两者都没有就如实给空数组。
- original 字段必须是学习者原文里"逐字、连续"出现的片段（系统要用它在原文里高亮定位）：原样照抄，不要改写、不要翻译、不要加引号或省略号。
- 中等严格、抓大放小：抓真错和"有意义的地道升级"即可。口语填充词（you know / like）、轻微重复、可接受的口语化表达，不要挑。
- 绝不为了凑数硬造问题。如果这段英文本来就不错，errors / naturalness 就少给或给空数组。
- strengths 要具体（夸到具体的词或表达），不要泛泛地说"整体不错"。
- 所有 why、解释一律用简短中文，一句话讲清即可。`;

export const REVIEW_TEMPLATE = `【学习者产出的英文】
{transcript}
{context_block}
请严格按系统要求复盘，只输出那个 JSON 对象。`;

// ── 公开：reviewSpeech ────────────────────────────────────────────────────

/**
 * 口语复盘（阶段4.1）
 * @param {{text:string, context?:string}} args
 * @returns {Promise<{ok:boolean, strengths:string[], errors:Array, naturalness:Array, model:string, error?:string}>}
 */
export async function reviewSpeech({ text = "", context = "" } = {}) {
  const cfg = await _loadConfig();
  if (!cfg.enabled) {
    return { ok: false, error: "未配置 API Key，去设置里填" };
  }

  text = (text || "").trim();
  if (!text) return { ok: false, error: "没有输入英文内容" };

  const contextBlock = context && context.trim()
    ? `\n\n【背景 / 对方说了什么 / 话题】\n${context.trim()}`
    : "";

  const userMsg = REVIEW_TEMPLATE
    .replace("{transcript}", text.slice(0, 3000))
    .replace("{context_block}", contextBlock);

  const messages = [
    { role: "system", content: REVIEW_SYSTEM },
    { role: "user",   content: userMsg },
  ];

  let content;
  try {
    content = await _chatWithFallback({ cfg, messages, temperature: 0.3, maxTokens: 2048 });
    // 空答重试（v4-pro 推理模型坑）
    if (!content || !content.trim()) {
      content = await _chatWithFallback({ cfg, messages, temperature: 0.3, maxTokens: 4096 });
    }
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 160) };
  }

  if (!content || !content.trim()) {
    return { ok: false, error: "没收到复盘结果，请重试" };
  }

  const data = _extractJson(content);

  // 强制三个字段为数组；errors 条目缺字段时丢弃
  const strengths = Array.isArray(data.strengths) ? data.strengths.filter((s) => typeof s === "string" && s.trim()) : [];

  const errors = (Array.isArray(data.errors) ? data.errors : [])
    .filter((e) => e && typeof e === "object" && e.original && e.correction && e.type && e.why);

  const naturalness = (Array.isArray(data.naturalness) ? data.naturalness : [])
    .filter((n) => n && typeof n === "object" && n.original && n.better && n.why);

  return {
    ok: true,
    strengths,
    errors,
    naturalness,
    model: cfg.model,
  };
}

// ── 写作训练批改 Prompt（逐字端口，一字不改，阶段4.2） ────────────────────────

export const WRITING_CHECK_SYSTEM = `你是一位资深英语写作老师，正在帮"中文母语"的学习者做针对性的造句 / 写作训练。学习者刚复习了几个表达（来自他的错题本），现在用它们写了一段英文。你要逐条检查他有没有真的用上、有没有用对，给出鼓励但具体的反馈。

你只能输出一个 JSON 对象（不要任何额外文字，不要 markdown 代码块）：
{
  "items": [
    {
      "target": "要练的表达，原样回显",
      "used": true 或 false,
      "correct": true 或 false 或 null,
      "quote": "他文中实际用到该表达的片段，逐字照抄；没用到则空字符串",
      "feedback": "一句中文：用对了就具体夸一句；用错了说清怎么改；没用上就提示怎么用"
    }
  ],
  "overall": "一到两句中文总评：整体是否自然、最值得表扬的一点、最该改进的一点"
}

要求：
- used：宽松匹配——时态、单复数、词形变化都算"用上了"。
- correct：仅判断"这个目标表达本身用得对不对"；used=false 时 correct 给 null。
- 只盯这几个目标表达，别去揪文中其它无关小错（那是复盘的事，不在这里做）。
- quote 必须逐字照抄学习者原文片段，便于定位。
- 鼓励但具体，所有反馈用简短中文。`;

export const WRITING_CHECK_TEMPLATE = `【要练的表达】
{items_block}

【学习者写的英文】
{text}

请逐条检查并只输出那个 JSON 对象。`;

// ── 公开：checkWriting ────────────────────────────────────────────────────────

/**
 * 写作训练批改（阶段4.2）
 * @param {{items:{original:string,correction:string}[], text:string}} args
 * @returns {Promise<{ok:boolean, items:Array, overall:string, model:string, error?:string}>}
 */
export async function checkWriting({ items = [], text = "" } = {}) {
  const cfg = await _loadConfig();
  if (!cfg.enabled) {
    return { ok: false, error: "未配置 API Key，去设置里填" };
  }

  text = (text || "").trim();
  if (!text) return { ok: false, error: "没有输入英文内容" };
  if (!Array.isArray(items) || !items.length) return { ok: false, error: "没有要练的表达" };

  // 构建 items_block：每行 "- {original} → {correction}"
  const itemsBlock = items
    .map((it) => `- ${it.original} → ${it.correction}`)
    .join("\n");

  const userMsg = WRITING_CHECK_TEMPLATE
    .replace("{items_block}", itemsBlock)
    .replace("{text}", text.slice(0, 3000));

  const messages = [
    { role: "system", content: WRITING_CHECK_SYSTEM },
    { role: "user",   content: userMsg },
  ];

  let content;
  try {
    content = await _chatWithFallback({ cfg, messages, temperature: 0.3, maxTokens: 1536 });
    // 空答重试（v4-pro 推理模型坑）
    if (!content || !content.trim()) {
      content = await _chatWithFallback({ cfg, messages, temperature: 0.3, maxTokens: 3072 });
    }
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 160) };
  }

  if (!content || !content.trim()) {
    return { ok: false, error: "没收到批改结果，请重试" };
  }

  const data = _extractJson(content);

  // 校验：items 强制成数组，缺字段的条目丢弃不整体失败
  const rawItems = Array.isArray(data.items) ? data.items : [];
  const cleanItems = rawItems
    .filter((it) => it && typeof it === "object" && it.target != null)
    .map((it) => ({
      target:   String(it.target   ?? "").trim(),
      used:     Boolean(it.used),
      correct:  it.correct != null ? Boolean(it.correct) : null,
      quote:    String(it.quote    ?? "").trim(),
      feedback: String(it.feedback ?? "").trim(),
    }));

  return {
    ok: true,
    items: cleanItems,
    overall: String(data.overall ?? "").trim(),
    model: cfg.model,
  };
}

// ── 口语复盘大脑升级（阶段8，逐字端口，一字不改） ─────────────────────────

export const REVIEW_V2_SINGLE_SYSTEM = `你是一位资深的英语口语外教，专门帮"中文母语"的学习者复盘他本人产出的英文（口播录音转写或和 AI 的对话转写，可能带口语的不完整、重复、口头语，这些口语特征不要苛责）。你的任务：把最值得他记住的问题挑出来讲透，而不是把所有毛病平铺罗列。

你只能输出一个 JSON 对象（不要任何额外文字，不要 markdown 代码块）：
{
  "topic": "用 4-8 个中文字概括这段在聊什么，如：聊AI对就业的影响",
  "overall": "两三句中文总评：先一句整体印象（具体、不客套），再点出今天最值得记住的一件事",
  "strengths": ["具体夸到某个词/表达，最多 3 条；没有就空数组"],
  "priority": [
    {
      "original": "原文里出问题的最小连续片段，逐字照抄",
      "correction": "改正后的说法",
      "type": "grammar | wordchoice | collocation | naturalness 四选一",
      "why": "两句以内中文：为什么错/为什么不自然，把规则或语感差别讲清",
      "count": 1,
      "repeatOf": null
    }
  ],
  "minor": [ 与 priority 同结构的对象 ],
  "chunkFeedback": [
    {
      "chunk": "他正在练的词块，原样回显",
      "quote": "他文中使用（或明显试图使用）该词块的片段，逐字照抄",
      "verdict": "correct | unnatural | collocation | grammar | context 五选一",
      "comment": "一两句中文：对就确认对在哪，错就说清怎么改"
    }
  ]
}

判定要求：
- priority 是"今天最值得记住的"，最多 5 条、宁缺毋滥，按此优先：①真正的语法/用词/搭配错误 ②全文反复出现的问题 ③【近期错题】里再次犯的 ④一改就明显更地道的表达。
- minor 放其余真实存在但优先级低的问题，按重要性排序。
- 同一个知识点的重复错误必须合并成一条：count 记它在全文出现的总次数，original 取最典型的一处，绝不一条条罗列。
- type=naturalness 表示没有语法错、但母语者一般不这么说；correction 填更自然的说法。
- original 必须是原文里"逐字、连续"出现的片段（系统靠它在原文里高亮定位）：原样照抄，不要改写、不要翻译、不要加引号或省略号。
- repeatOf：若该条与【近期错题】中某条是同一个知识点（同一条规则、同一个搭配），填那条的编号字符串如 "M3"；否则填 null。没有给你错题清单时一律 null。
- 口语填充词（you know / like）、轻微重复、可接受的口语化表达，不要挑。绝不为了凑数硬造问题：这段英文本来不错，priority / minor 就少给或给空数组。
- strengths 要具体（夸到具体的词或表达），不要泛泛说"整体不错"。
- 所有中文解释简短、具体、不客套。
- 【进行中的词块】给出时：检查他有没有用到（或明显试图用）其中的词块，用到的逐条给 chunkFeedback（verdict 标准：correct=形式搭配语境全对；unnatural=没语法错但母语者不这么用；collocation=搭配错；grammar=语法错；context=用错场合）。没用到的词块不要出现在 chunkFeedback 里，绝不硬凑；没给词块清单时 chunkFeedback 给空数组。词块相关的问题只进 chunkFeedback，不要重复放进 priority / minor。`;

export const REVIEW_V2_SINGLE_TEMPLATE = `【学习者产出的英文】
{transcript}
{context_block}
{mistakes_block}
{chunks_block}
请严格按系统要求复盘，只输出那个 JSON 对象。`;

export const REVIEW_V2_DETECT_SYSTEM = `你是一位资深的英语口语外教，正在帮"中文母语"的学习者复盘他本人产出的一大段英文（口播或对话的转写，带口语特征不要苛责）。下面给你的是其中第 {i}/{n} 段。你的任务是"地毯式检出"：把这一段里所有真实存在的问题找全，交给下一环节去排优先级和整理——这一步宁可多报、不要漏报，但每一条都必须是真问题，绝不硬造。

你只能输出一个 JSON 对象（不要任何额外文字，不要 markdown 代码块）：
{
  "strengths": ["这一段里具体用得好的词/表达，最多 2 条；没有就空数组"],
  "findings": [
    {
      "original": "原文里出问题的最小连续片段，逐字照抄",
      "correction": "改正后的说法",
      "type": "grammar | wordchoice | collocation | naturalness 四选一",
      "why": "一句中文说清为什么"
    }
  ]
}

判定要求：
- 找全所有：语法错、用错词、搭配错，以及"没有语法错、但母语者一般不这么说"的表达（type=naturalness，correction 填更自然的说法）。
- original 必须是这一段原文里"逐字、连续"出现的片段：原样照抄，不要改写、不要加引号或省略号。
- 口语填充词（you know / like）、轻微重复、可接受的口语化表达，不要挑。
- why 一句话即可，详细讲解是下一环节的事。`;

export const REVIEW_V2_DETECT_TEMPLATE = `【转写第 {i}/{n} 段】
{chunk}

请严格按系统要求检出，只输出那个 JSON 对象。`;

export const REVIEW_V2_EDIT_SYSTEM = `你是一位资深的英语口语外教兼编辑。学习者说了一大段英文（完整转写附后），检出环节已把全部问题逐段找出（原始清单附后，可能有重复、有跨段的同类错误、也可能混入个别误报）。你的任务是像编辑一样把它整理成一份"能消化"的复盘：挑重点、合并同类、按话题分段，而不是平铺罗列。

你只能输出一个 JSON 对象（不要任何额外文字，不要 markdown 代码块）：
{
  "topic": "用 4-8 个中文字概括整段在聊什么",
  "overall": "两三句中文总评：先一句整体印象（具体、不客套），再点出今天最值得记住的一件事",
  "strengths": ["从各段亮点里挑最值得夸的，最多 3 条"],
  "segments": ["按内容把这次输出分成 2-6 个话题段，每段一个 4-10 字中文标题，按原文顺序排列"],
  "priority": [
    {
      "original": "逐字照抄检出清单里某条的 original（系统靠它定位，不许改写、不许新造）",
      "correction": "改正后的说法",
      "type": "grammar | wordchoice | collocation | naturalness",
      "why": "两句以内中文，把规则/语感差别讲透（可以比检出清单里的更详细）",
      "count": 1,
      "seg": "该条主要出现在哪个话题段，逐字用 segments 里的标题",
      "repeatOf": null
    }
  ],
  "minor": [ 与 priority 同结构 ],
  "chunkFeedback": [
    {
      "chunk": "他正在练的词块，原样回显",
      "quote": "他文中使用（或明显试图使用）该词块的片段，逐字照抄",
      "verdict": "correct | unnatural | collocation | grammar | context 五选一",
      "comment": "一两句中文：对就确认对在哪，错就说清怎么改"
    }
  ]
}

整理要求：
- priority 是"今天最值得记住的"，最多 5 条、宁缺毋滥，按此优先：①真正的语法/用词/搭配错误 ②反复出现的问题 ③【近期错题】里再次犯的 ④一改就明显更地道的表达。
- 同一个知识点的多条检出必须合并成一条：count 记总次数，original 取最典型的一处，绝不一条条罗列。
- minor 放其余问题，按重要性排序，同样先合并同类。检出清单里明显误报的（其实没错的）直接丢弃。
- 每条的 original 必须逐字来自检出清单，correction / why 可以在检出的基础上改得更好。
- repeatOf：若该条与【近期错题】中某条是同一个知识点，填那条的编号字符串如 "M3"；否则填 null。
- 所有中文简短、具体、不客套。
- 【进行中的词块】给出时：检查他有没有用到（或明显试图用）其中的词块，用到的逐条给 chunkFeedback（verdict 标准：correct=形式搭配语境全对；unnatural=没语法错但母语者不这么用；collocation=搭配错；grammar=语法错；context=用错场合）。没用到的词块不要出现在 chunkFeedback 里，绝不硬凑；没给词块清单时 chunkFeedback 给空数组。词块相关的问题只进 chunkFeedback，不要重复放进 priority / minor。`;

export const REVIEW_V2_EDIT_TEMPLATE = `【完整转写】
{transcript}
{context_block}
{mistakes_block}
{chunks_block}

【检出清单（逐段合并）】
{findings_block}

请严格按系统要求整理，只输出那个 JSON 对象。`;

// ── 内部：拼 mistakes_block（M1…Mn，编号即上层传入数组顺序） ────────────────

function _buildMistakesBlock(mistakes) {
  if (!Array.isArray(mistakes) || !mistakes.length) return "";
  const lines = mistakes.map((m, i) => `M${i + 1}. ${m.original} → ${m.correction}（${m.type}）`);
  return `\n\n【近期错题（未掌握，供判断是否重犯）】\n${lines.join("\n")}`;
}

// ── 内部：拼 chunks_block（阶段9 §2d 插入③） ──────────────────────────────

function _buildChunksBlock(chunks) {
  if (!Array.isArray(chunks) || !chunks.length) return "";
  const lines = chunks.map((c) => `- ${c.text}`);
  return `\n\n【进行中的词块（他正在刻意练习，留意是否用到）】\n${lines.join("\n")}`;
}

// ── 内部：按句子边界把长文本切成 ~800-1100 词的块（绝不切断句子） ──────────

function _splitIntoChunks(text, targetMin = 800, targetMax = 1100) {
  // 先按句子边界（句号/问号/换行）切成候选片段
  const sentences = text.split(/(?<=[.?!\n])\s+/).filter((s) => s.trim());
  const chunks = [];
  let cur = [];
  let curWords = 0;
  for (const sent of sentences) {
    const w = sent.split(/\s+/).filter(Boolean).length;
    if (curWords > 0 && curWords + w > targetMax) {
      chunks.push(cur.join(" "));
      cur = [sent];
      curWords = w;
    } else {
      cur.push(sent);
      curWords += w;
      if (curWords >= targetMin) {
        chunks.push(cur.join(" "));
        cur = [];
        curWords = 0;
      }
    }
  }
  if (cur.length) chunks.push(cur.join(" "));
  return chunks.length ? chunks : [text];
}

// ── 内部：单个 chat 调用 + 空答重试（v4-pro 坑），返回 _extractJson 结果 ────

async function _reviewChatJson({ cfg, messages, maxTokens, retryTokens }) {
  let content;
  try {
    content = await _chatWithFallback({ cfg, messages, temperature: 0.3, maxTokens });
    if (!content || !content.trim()) {
      content = await _chatWithFallback({ cfg, messages, temperature: 0.3, maxTokens: retryTokens });
    }
  } catch (e) {
    return { _error: String(e).slice(0, 160) };
  }
  if (!content || !content.trim()) return { _error: "没收到结果" };
  return _extractJson(content);
}

// ── 内部：词块裁决五档集合（阶段9） ────────────────────────────────────────

const _CHUNK_VERDICTS = new Set(["correct", "unnatural", "collocation", "grammar", "context"]);

// ── 内部：清洗 chunkFeedback 条目（chunk 不在传入清单的丢弃、verdict 非法丢弃）──

function _cleanChunkFeedback(items, chunkList) {
  const validTexts = new Set((Array.isArray(chunkList) ? chunkList : []).map((c) => c.text));
  const out = [];
  for (const it of (Array.isArray(items) ? items : [])) {
    if (!it || typeof it !== "object") continue;
    const chunk = String(it.chunk || "").trim();
    const verdict = String(it.verdict || "").trim();
    if (!chunk || !validTexts.has(chunk)) continue;
    if (!_CHUNK_VERDICTS.has(verdict)) continue;
    out.push({
      chunk,
      quote: String(it.quote || "").trim(),
      verdict,
      comment: String(it.comment || "").trim(),
    });
  }
  return out;
}

// ── 内部：清洗 priority/minor 条目（校验必需字段 + count + seg + repeatOf） ──

function _cleanReviewItems(items, { segments = null } = {}) {
  const out = [];
  for (const it of (Array.isArray(items) ? items : [])) {
    if (!it || typeof it !== "object") continue;
    const original   = String(it.original   || "").trim();
    const correction = String(it.correction || "").trim();
    const type       = String(it.type       || "").trim();
    const why        = String(it.why        || "").trim();
    if (!original || !correction || !type || !why) continue;
    let count = parseInt(it.count, 10);
    if (!Number.isFinite(count) || count < 1) count = 1;
    let repeatOf = null;
    if (typeof it.repeatOf === "string" && /^M\d+$/.test(it.repeatOf.trim())) {
      repeatOf = it.repeatOf.trim();
    }
    const clean = { original, correction, type, why, count, repeatOf };
    if (segments) {
      const seg = String(it.seg || "").trim();
      clean.seg = segments.includes(seg) ? seg : "";
    }
    out.push(clean);
  }
  return out;
}

/**
 * reviewSpeechV2 — 口语复盘大脑升级（阶段8；阶段9加 chunks 词块注入）
 * ≤800 词单遍（REVIEW_V2_SINGLE）；>800 词两遍（检出 REVIEW_V2_DETECT 并行分块 → 编辑 REVIEW_V2_EDIT）。
 * 阈值 350→800（2026-07-07 提速批）：350-800 词时检出反正只有一块，两遍制=白付一次串行的
 * 推理模型调用（v4-pro 单次一两分钟）；只有真正多块并行检出时两遍制才划算。
 * @param {{text:string, context?:string, mistakes?:{id,original,correction,type}[], chunks?:{id,text}[]}} args
 * @returns {Promise<{ok, topic, overall, strengths, segments, priority, minor, chunkFeedback, model, warnings?, error?}>}
 */
export async function reviewSpeechV2({ text = "", context = "", mistakes = [], chunks: chunkList = [] } = {}) {
  const cfg = await _loadReviewConfig();
  if (!cfg.enabled) {
    return { ok: false, error: "未配置 API Key，去设置里填" };
  }

  let transcript = (text || "").trim();
  if (!transcript) return { ok: false, error: "没有输入英文内容" };

  const warnings = [];

  // 总上限 12000 词，超出截断
  const allWords = transcript.split(/\s+/).filter(Boolean);
  if (allWords.length > 12000) {
    transcript = allWords.slice(0, 12000).join(" ");
    warnings.push("内容过长，已截断到前 12000 词");
  }

  const contextBlock = context && context.trim()
    ? `\n\n【背景 / 对方说了什么 / 话题】\n${context.trim()}`
    : "";
  const mistakesBlock = _buildMistakesBlock(mistakes);
  const chunksBlock = _buildChunksBlock(chunkList);

  const wordCount = transcript.split(/\s+/).filter(Boolean).length;

  let raw;
  if (wordCount <= 800) {
    // ── 单遍 ──────────────────────────────────────────────────────────────
    const userMsg = REVIEW_V2_SINGLE_TEMPLATE
      .replace("{transcript}", transcript)
      .replace("{context_block}", contextBlock)
      .replace("{mistakes_block}", mistakesBlock)
      .replace("{chunks_block}", chunksBlock);
    const messages = [
      { role: "system", content: REVIEW_V2_SINGLE_SYSTEM },
      { role: "user",   content: userMsg },
    ];
    // 单遍上限放宽到 800 词后正文更长，token 预算同步上调（v4-pro reasoning 先吃 token）
    raw = await _reviewChatJson({ cfg, messages, maxTokens: 4096, retryTokens: 8192 });
    if (raw._error) return { ok: false, error: raw._error };
  } else {
    // ── 两遍：检出（分块并行）→ 编辑 ─────────────────────────────────────────
    const chunks = _splitIntoChunks(transcript);
    const n = chunks.length;
    const detectResults = await Promise.all(chunks.map(async (chunk, idx) => {
      const i = idx + 1;
      const sys = REVIEW_V2_DETECT_SYSTEM.replace("{i}", String(i)).replace("{n}", String(n));
      const tpl = REVIEW_V2_DETECT_TEMPLATE
        .replace("{i}", String(i)).replace("{n}", String(n))
        .replace("{chunk}", chunk);
      const messages = [
        { role: "system", content: sys },
        { role: "user",   content: tpl },
      ];
      let d = await _reviewChatJson({ cfg, messages, maxTokens: 2048, retryTokens: 4096 });
      if (d._error) {
        // 失败重试一次
        d = await _reviewChatJson({ cfg, messages, maxTokens: 2048, retryTokens: 4096 });
      }
      if (d._error) {
        warnings.push(`第${i}段检出失败`);
        return { strengths: [], findings: [] };
      }
      return {
        strengths: Array.isArray(d.strengths) ? d.strengths.filter((s) => typeof s === "string" && s.trim()) : [],
        findings: (Array.isArray(d.findings) ? d.findings : []).filter(
          (f) => f && typeof f === "object" && f.original && f.correction && f.type && f.why
        ),
      };
    }));

    const allFindings = [];
    const allStrengths = [];
    for (const r of detectResults) {
      allFindings.push(...r.findings);
      allStrengths.push(...r.strengths);
    }

    if (!allFindings.length && !allStrengths.length && warnings.length === n) {
      return { ok: false, error: "检出全部失败，请重试", warnings };
    }

    const findingsBlock = allFindings
      .map((f) => `- [${f.type}] ${f.original} → ${f.correction}（${f.why}）`)
      .join("\n") + (allStrengths.length ? `\n亮点候选：${allStrengths.join("；")}` : "");

    const userMsg = REVIEW_V2_EDIT_TEMPLATE
      .replace("{transcript}", transcript)
      .replace("{context_block}", contextBlock)
      .replace("{mistakes_block}", mistakesBlock)
      .replace("{chunks_block}", chunksBlock)
      .replace("{findings_block}", findingsBlock);
    const messages = [
      { role: "system", content: REVIEW_V2_EDIT_SYSTEM },
      { role: "user",   content: userMsg },
    ];
    raw = await _reviewChatJson({ cfg, messages, maxTokens: 4096, retryTokens: 8192 });
    if (raw._error) return { ok: false, error: raw._error, warnings };
  }

  // ── 统一整理返回形状 ──────────────────────────────────────────────────────
  const topic = String(raw.topic || "").trim();
  const overall = String(raw.overall || "").trim();
  const strengths = Array.isArray(raw.strengths) ? raw.strengths.filter((s) => typeof s === "string" && s.trim()) : [];
  const segments = Array.isArray(raw.segments) ? raw.segments.filter((s) => typeof s === "string" && s.trim()) : [];

  let priority = _cleanReviewItems(raw.priority, { segments: segments.length ? segments : null });
  let minor    = _cleanReviewItems(raw.minor,    { segments: segments.length ? segments : null });

  // priority 超 5 条时截取前 5，余下并入 minor 头部
  if (priority.length > 5) {
    const overflow = priority.slice(5);
    priority = priority.slice(0, 5);
    minor = [...overflow, ...minor];
  }

  // chunkFeedback：chunk 不在传入清单的丢弃、verdict 非法丢弃（阶段9）
  const chunkFeedback = _cleanChunkFeedback(raw.chunkFeedback, chunkList);

  const result = {
    ok: true,
    topic,
    overall,
    strengths,
    segments,
    priority,
    minor,
    chunkFeedback,
    model: cfg.model,
  };
  if (warnings.length) result.warnings = warnings;
  return result;
}

// ── 词块刻意练习 Prompt（阶段9，逐字端口，一字不改） ───────────────────────

export const CHUNK_DRILL_SYSTEM = `你是一位资深的英语口语外教，正在帮"中文母语"的学习者做词块（chunk）刻意练习。学习者刚拿到几个目标词块，现场说或写了一段英文来使用它们（口语转写可能带不完整、重复、口头语，不要苛责）。你要逐个词块裁决他用得对不对——他最需要的是确定性的反馈：到底哪里对、哪里不对、正确的用法长什么样。

你只能输出一个 JSON 对象（不要任何额外文字，不要 markdown 代码块）：
{
  "topic": "用 4-8 个中文字概括他这段在说什么",
  "items": [
    {
      "chunk": "目标词块，原样回显",
      "used": true 或 false,
      "quote": "他文中实际使用该词块的片段，逐字照抄；没用到则空字符串",
      "verdict": "correct | unnatural | collocation | grammar | context 五选一；used=false 时为 null",
      "comment": "两句以内中文：correct 时确认对在哪里（形式/搭配/语境都要点到）；其余档说清错在哪、正确该怎么说；没用到就提示一个自然的用法方向",
      "examples": ["该词块的典型正确例句；verdict 不是 correct 时必须给 2-3 条；correct 时给 0-1 条拓展用法"]
    }
  ],
  "extraErrors": [
    { "original": "目标词块之外的明显错误片段，逐字照抄原文", "correction": "改正后的说法", "why": "一句中文" }
  ],
  "overall": "一两句中文总评"
}

verdict 判定标准：
- correct = 这个词块本身用得完全对：形式对（时态/单复数/词形）、搭配对、语境合适，三者都对才给。
- unnatural = 没有语法错，但母语者不会在这里这么用（语域不合，或搭配生硬但能懂）。
- collocation = 词块内部或前后搭配用错（如介词错、动宾搭配错）。
- grammar = 词块相关的语法错（时态/主谓一致/词形）。
- context = 词块形式没错，但用错了场合、词不达意。
- used 宽松匹配：时态、单复数、词形变化都算"用上了"。
- 裁决要果断：对就是对、错就是错，不许含糊其辞——学习者要的是确定性。
- examples 必须地道、常用、贴近口语，别造书面腔。
- extraErrors 只放目标词块之外"明显"的错（真语法错/用词错），最多 3 条；轻微问题不放，主战场是那几个词块。
- 所有中文简短、具体、不客套。`;

export const CHUNK_DRILL_TEMPLATE = `【目标词块】
{chunks_block}

【学习者的英文】
{text}
{context_block}
请逐个词块裁决，只输出那个 JSON 对象。`;

export const CHUNK_TOPIC_SYSTEM = `给定几个英语词块，出一个即兴口语话题，让"中文母语"的学习者能自然地一次用上所有这些词块。话题要贴近日常生活或观点表达，别出成作文题。只输出一个 JSON 对象（不要任何额外文字）：
{ "topic_zh": "一两句中文话题描述", "opener_en": "一句英文开场提示，帮他起头" }`;

export const CHUNK_TOPIC_TEMPLATE = `【词块】
{chunks_block}

请出题，只输出那个 JSON 对象。`;

// ── 内部：拼 CHUNK_DRILL/CHUNK_TOPIC 的 chunks_block（每行 "- text（meaning）"） ──

function _buildChunkDrillBlock(chunks) {
  return (Array.isArray(chunks) ? chunks : [])
    .map((c) => `- ${c.text}` + (c.meaning ? `（${c.meaning}）` : ""))
    .join("\n");
}

// ── 公开：chunkDrill（阶段9） ─────────────────────────────────────────────

/**
 * chunkDrill — 词块刻意练习裁决
 * @param {{chunks:{text:string,meaning?:string}[], text:string, topic?:string}} args
 * @returns {Promise<{ok, topic, items, extraErrors, overall, model, error?}>}
 */
export async function chunkDrill({ chunks = [], text = "", topic = "" } = {}) {
  const cfg = await _loadReviewConfig();
  if (!cfg.enabled) {
    return { ok: false, error: "未配置 API Key，去设置里填" };
  }

  text = (text || "").trim();
  if (!text) return { ok: false, error: "没有输入英文内容" };
  if (!Array.isArray(chunks) || !chunks.length) return { ok: false, error: "没有要练的词块" };

  const chunksBlock = _buildChunkDrillBlock(chunks);
  const contextBlock = topic && topic.trim()
    ? `\n\n【本次练习话题】\n${topic.trim()}`
    : "";

  const userMsg = CHUNK_DRILL_TEMPLATE
    .replace("{chunks_block}", chunksBlock)
    .replace("{text}", text.slice(0, 3000))
    .replace("{context_block}", contextBlock);

  const messages = [
    { role: "system", content: CHUNK_DRILL_SYSTEM },
    { role: "user",   content: userMsg },
  ];

  let content;
  try {
    content = await _chatWithFallback({ cfg, messages, temperature: 0.3, maxTokens: 3072 });
    if (!content || !content.trim()) {
      content = await _chatWithFallback({ cfg, messages, temperature: 0.3, maxTokens: 6144 });
    }
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 160) };
  }
  if (!content || !content.trim()) {
    return { ok: false, error: "没收到裁决结果，请重试" };
  }

  const data = _extractJson(content);
  const validTexts = new Set(chunks.map((c) => c.text));

  const items = (Array.isArray(data.items) ? data.items : [])
    .filter((it) => it && typeof it === "object" && validTexts.has(String(it.chunk || "").trim()))
    .map((it) => {
      let verdict = it.used ? String(it.verdict || "").trim() : null;
      if (it.used && !_CHUNK_VERDICTS.has(verdict)) verdict = "unnatural";
      return {
        chunk: String(it.chunk || "").trim(),
        used: Boolean(it.used),
        quote: String(it.quote || "").trim(),
        verdict,
        comment: String(it.comment || "").trim(),
        examples: Array.isArray(it.examples) ? it.examples.filter((e) => typeof e === "string" && e.trim()) : [],
      };
    });

  const extraErrors = (Array.isArray(data.extraErrors) ? data.extraErrors : [])
    .filter((e) => e && typeof e === "object" && e.original && e.correction && e.why)
    .slice(0, 3)
    .map((e) => ({
      original: String(e.original).trim(),
      correction: String(e.correction).trim(),
      why: String(e.why).trim(),
    }));

  return {
    ok: true,
    topic: String(data.topic || "").trim(),
    items,
    extraErrors,
    overall: String(data.overall || "").trim(),
    model: cfg.model,
  };
}

// ── 公开：chunkTopic（阶段9） ─────────────────────────────────────────────

/**
 * chunkTopic — 出一个能自然用上给定词块的即兴口语话题
 * @param {{chunks:{text:string,meaning?:string}[]}} args
 * @returns {Promise<{ok, topic_zh, opener_en, error?}>}
 */
export async function chunkTopic({ chunks = [] } = {}) {
  const cfg = await _loadConfig();
  if (!cfg.enabled) {
    return { ok: false, error: "未配置 API Key，去设置里填" };
  }
  if (!Array.isArray(chunks) || !chunks.length) return { ok: false, error: "没有词块" };

  const chunksBlock = _buildChunkDrillBlock(chunks);
  const userMsg = CHUNK_TOPIC_TEMPLATE.replace("{chunks_block}", chunksBlock);

  const messages = [
    { role: "system", content: CHUNK_TOPIC_SYSTEM },
    { role: "user",   content: userMsg },
  ];

  let content;
  try {
    content = await _chatWithFallback({ cfg, messages, temperature: 0.6, maxTokens: 512 });
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 160) };
  }
  if (!content || !content.trim()) {
    return { ok: false, error: "没出成话题，请重试" };
  }

  const data = _extractJson(content);
  return {
    ok: true,
    topic_zh: String(data.topic_zh || "").trim(),
    opener_en: String(data.opener_en || "").trim(),
  };
}

// ── 偷学 Prompt（阶段10 §5，逐字端口，一字不改） ───────────────────────────

export const STEAL_SYSTEM = `你是一位资深的英语口语外教。下面是"中文母语"学习者和一位母语级对话者（AI 或真人）的对话转写。你的任务是替学习者从【对方】的话里"偷学"：挑出最值得他学走、马上能用的地道表达。

你只能输出一个 JSON 对象（不要任何额外文字，不要 markdown 代码块）：
{
  "steals": [
    {
      "expression": "值得偷学的表达（词块/搭配/句式），从对方原话提取，还原成原形（如动词用原形）",
      "quote": "对方用到它的那句原话，逐字照抄",
      "why": "一句中文：它好在哪、什么场合用",
      "example": "一条贴近日常生活的新英文例句，示范怎么用"
    }
  ]
}

挑选标准：
- 只挑 2-4 条，宁缺毋滥。优先：①学习者自己没用过、但按他本轮表现出的水平"跳一跳够得着"的 ②口语高频、真的常用的 ③比学习者已有说法明显更地道的。
- 不挑：生僻词、书面腔、单个普通单词、学习者本轮已经自己用对的表达、以及转写噪音（不完整的句子碎片）。
- 从学习者本轮的话可以看出他的水平：挑对他有增量的，不挑他明显早就会的。
- 对方的话太少或没有值得偷的，就少给或给空数组，绝不硬凑。
- 所有中文简短、具体。`;

export const STEAL_TEMPLATE = `【对话转写（"我"=学习者，"对方"=母语级对话者）】
{dialog}

请挑出值得学习者偷学的表达，只输出那个 JSON 对象。`;

// ── 内部：拼 STEAL_TEMPLATE 的 {dialog}（"我: …"/"对方: …" 逐行） ──────────

function _buildDialogBlock(dialog) {
  return (Array.isArray(dialog) ? dialog : [])
    .map((t) => (t.speaker === "me" ? "我: " : "对方: ") + t.text)
    .join("\n");
}

// ── 公开：stealFromDialog（阶段10） ─────────────────────────────────────────

/**
 * stealFromDialog — 从对话转写里挑值得学习者偷学的表达
 * @param {{dialog:{speaker:'me'|'ai', text:string}[]}} args
 * @returns {Promise<{ok, steals:{expression,quote,why,example}[], model, error?}>}
 */
export async function stealFromDialog({ dialog = [] } = {}) {
  // 对方 turns 全为空 → 不调 LLM，直接返回空数组
  const aiTurns = dialog.filter((t) => t.speaker === "ai" && (t.text || "").trim());
  if (!aiTurns.length) {
    return { ok: true, steals: [] };
  }

  const cfg = await _loadReviewConfig();
  if (!cfg.enabled) {
    return { ok: false, error: "未配置 API Key，去设置里填" };
  }

  const dialogBlock = _buildDialogBlock(dialog);
  const userMsg = STEAL_TEMPLATE.replace("{dialog}", dialogBlock);

  const messages = [
    { role: "system", content: STEAL_SYSTEM },
    { role: "user",   content: userMsg },
  ];

  let content;
  try {
    content = await _chatWithFallback({ cfg, messages, temperature: 0.3, maxTokens: 1536 });
    if (!content || !content.trim()) {
      content = await _chatWithFallback({ cfg, messages, temperature: 0.3, maxTokens: 3072 });
    }
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 160) };
  }
  if (!content || !content.trim()) {
    return { ok: false, error: "没收到偷学结果，请重试" };
  }

  const data = _extractJson(content);
  const steals = (Array.isArray(data.steals) ? data.steals : [])
    .filter((s) => s && typeof s === "object" && String(s.expression || "").trim() && String(s.why || "").trim())
    .slice(0, 4)
    .map((s) => ({
      expression: String(s.expression || "").trim(),
      quote: String(s.quote || "").trim(),
      why: String(s.why || "").trim(),
      example: String(s.example || "").trim(),
    }));

  return { ok: true, steals, model: cfg.model };
}

// ── 复述练习：从原文挑目标表达（阅读联动，2026-07-07） ─────────────────────

export const RETELL_PICK_SYSTEM = `从下面这篇英文文章里挑 5 个「中文母语学习者在口语中最值得复用」的表达（动词短语/搭配/句式起手，不要生僻词、不要单个普通单词）。text 必须逐字取自文章。只输出一个 JSON 对象（不要任何额外文字，不要 markdown 代码块）：
{"chunks":[{"text":"表达原形(逐字取自文章)","meaning":"简短中文义(10字内)","pattern":"可复用的用法骨架，如 hold off (on sth) / be in the thick of sth"}]}`;

/**
 * pickRetellChunks — 复述练习兜底：LLM 从原文挑 5 个可复用表达。
 * 失败/超时由调用方静默兜底（题签卡无 chips 也能练），这里只管尽力。
 * @param {{title?:string, text:string}} args
 * @returns {Promise<{ok:boolean, chunks:{text:string,meaning:string}[]}>}
 */
export async function pickRetellChunks({ title = "", text = "" } = {}) {
  const cfg = await _loadConfig();
  if (!cfg.enabled || !(text || "").trim()) return { ok: false, chunks: [] };

  const body = (title ? `【标题】${title}\n\n` : "") + text.trim().split(/\s+/).slice(0, 1500).join(" ");
  const messages = [
    { role: "system", content: RETELL_PICK_SYSTEM },
    { role: "user",   content: body },
  ];

  let content;
  try {
    content = await _chatWithFallback({ cfg, messages, temperature: 0.4, maxTokens: 1024 });
  } catch (e) {
    // 点灯：调用失败（超时/断网/服务端错）不再静默，带 _pickError 让上层归因并触发重试/报失败。
    console.warn("[retell] pickRetellChunks LLM 调用失败:", e);
    return { ok: false, chunks: [], _pickError: true };
  }
  const data = _extractJson(content);
  const chunks = (Array.isArray(data.chunks) ? data.chunks : [])
    .filter((c) => c && typeof c === "object" && String(c.text || "").trim())
    .slice(0, 5)
    .map((c) => ({
      text: String(c.text).trim(),
      meaning: String(c.meaning || "").trim().slice(0, 16),
      pattern: String(c.pattern || "").trim().slice(0, 48),
    }));
  return { ok: true, chunks };
}

// 导出 PROVIDERS 供外部（如 save_settings）使用
export { PROVIDERS };
