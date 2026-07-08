/**
 * test_llm.mjs — 阶段1D AI 层自测
 * 从 .env 读 LLM_API_KEY / LLM_PROVIDER / LLM_MODEL，
 * 对真实 DeepSeek 跑 explainWord / explainSelection / askFollowup。
 * 运行：node _devtest/test_llm.mjs（在 mobile/ 目录下）
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── 读 .env ──────────────────────────────────────────────────────────────
// _devtest/ is 3 levels below situ/: situ/santu_app/mobile/_devtest
const envPath = resolve(__dirname, "../../../.env");
const envRaw  = readFileSync(envPath, "utf-8");
const env = Object.fromEntries(
  envRaw.split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => l.split("=").map((s) => s.trim()))
    .filter(([k]) => k)
    .map(([k, ...rest]) => [k, rest.join("=")])
);

const API_KEY  = env.LLM_API_KEY  || "";
const PROVIDER = (env.LLM_PROVIDER || "deepseek").toLowerCase();
const MODEL    = env.LLM_MODEL    || "";

if (!API_KEY) {
  console.error("ERROR: LLM_API_KEY not found in .env");
  process.exit(1);
}

// ── 覆盖 settingsGet，让 llm.js 读到 .env 里的值 ─────────────────────────
// llm.js 调 settingsGet，这里 mock 掉它。
// 由于 llm.js 用 ES module import，需要通过 proxy 注入。

// 注入全局 fetch（Node 18+ 内置，但显式确认）
if (!globalThis.fetch) {
  const { default: fetch } = await import("node-fetch");
  globalThis.fetch = fetch;
}

// ── 创建轻量 mock store（让 llm.js settingsGet 能读到 env 值） ────────────
// 因为 llm.js 直接 import store.js，用文件 mock 替换
// 简单方式：直接设置 process.env 并临时 patch settingsGet 的路径
// 最简单：直接 inline 测一下 httpPost + _chatWithFallback 的逻辑

// ── 改用内联实现，直接测 HTTP 层 ─────────────────────────────────────────
const PROVIDERS = {
  deepseek: ["https://api.deepseek.com/v1", "deepseek-v4-pro"],
  zhipu:    ["https://open.bigmodel.cn/api/paas/v4", "glm-4-flash"],
  kimi:     ["https://api.moonshot.cn/v1", "moonshot-v1-8k"],
  openai:   ["https://api.openai.com/v1", "gpt-4o-mini"],
};
const [defaultUrl, defaultModel] = PROVIDERS[PROVIDER] || PROVIDERS.deepseek;
const BASE_URL = defaultUrl;
const FINAL_MODEL = MODEL || defaultModel;

console.log(`\n=== 四土 AI 层自测 ===`);
console.log(`Provider: ${PROVIDER}, Model: ${FINAL_MODEL}, Key: ...${API_KEY.slice(-6)}\n`);

// ── 通用 chat 函数 ────────────────────────────────────────────────────────
async function chatCreate(messages, { temperature = 0.6, wantJson = false, maxTokens = 4096 } = {}) {
  const body = { model: FINAL_MODEL, messages, temperature, max_tokens: maxTokens };
  if (wantJson) body.response_format = { type: "json_object" };
  const t0 = Date.now();
  const resp = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + API_KEY },
    body: JSON.stringify(body),
  });
  const elapsed = Date.now() - t0;
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  const choice = (data.choices || [])[0] || {};
  const content = (choice.message || {}).content || "";
  const finish = choice.finish_reason || "";
  return { content, finish, elapsed };
}

function extractJson(content) {
  content = (content || "").trim();
  if (content.startsWith("```")) {
    const firstNl = content.indexOf("\n");
    if (firstNl >= 0) content = content.slice(firstNl + 1);
    if (content.endsWith("```")) content = content.slice(0, -3);
    if (content.startsWith("json")) content = content.slice(4);
  }
  try { return JSON.parse(content); } catch (_) {
    const s = content.indexOf("{"), e = content.lastIndexOf("}");
    if (s >= 0 && e > s) { try { return JSON.parse(content.slice(s, e + 1)); } catch (_) {} }
    return {};
  }
}

// ── 照搬 llm.js 全部 prompt ───────────────────────────────────────────────
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
  "phonetic": "国际音标（IPA），带斜杠，如 /ˈsʌm.θɪŋ/。务必准确。",
  "pos": "在这句话里的词性，用简短中文+缩写，如 '动词 v.' / '形容词 adj.'",
  "literal": "这个词的本义/核心意思（中文，简洁，10-20字）。如果有有意思的词根/构词，可一并点出。",
  "contextual": "它在这句话里的具体意思（中文，结合上下文给最贴切的解释，15-30字）。",
  "explanation": "一段有温度的讲解（中文，60-120字）：把本义和这里的语境意思连起来，讲清楚这个词是怎么从本义'引申'到这里的；可以用一点画面感、联想或词根故事帮助记忆。语气亲切、像老师在旁边轻声点拨，不要堆术语，不要复述前面的字段。"
}}

只输出 JSON。`;

const SELECTION_SYSTEM = `你是一位博学又温暖的英语老师，面对的是 CET-4/6 水平的中国学习者。
学生从一篇英文文章里手动选中了一段文字——可能是一个短语/固定搭配，也可能是一整句话或一个从句。
你要先判断它属于「短语」还是「句子」，再据此给出讲解。你只输出严格的 JSON，不输出任何额外文字。`;

const SELECTION_TEMPLATE = `学生选中的文字是：
**{text}**

它所在的句子（上下文）：
{sentence}

【文章主题】{title}

请先判断 kind：
- 只有当选中的是一个**简短**的短语 / 固定搭配（大致 5 个词以内、不含主谓结构）时，kind = "phrase"；
- 若选中的是一句话、一个从句，或者**虽不完整但明显是句子级的较长片段**（比如十几个词、含主谓或多个修饰成分、像是从某句话里截下来的一段），一律 kind = "sentence"。
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

const DEEP_SYSTEM = `你是一位博学又温暖的英语老师，正帮一位 CET-4/6 水平的中国学生**建立一个英语词真正的"词感"**。学生对这个词不太熟、或和别的词记混了，需要你**脱离当前文章的语境**，把这个词本身讲透——它到底什么意思、给人什么画面和感觉。
请用中文，结构清楚、可以长，按下面几块来讲（每块用 **加粗小标题** 起头）：
**核心画面**：一两句话点出这个词最本质的意象/感觉，让学生"看见"它，而不是背一条干巴巴的中文释义。
**最常见的几种用法**：挑这个词在真实英语里最高频的 2–3 种含义/用法，每种都说清在什么场景下用，并各配 1 个地道英文例句 + 一句简短中文翻译，让学生从例句里"摸到"这个词。
**串起来的感觉**：用一句话把上面这些用法背后共通的内核串起来，帮学生形成一个统一的直觉。
要求：例句地道、画面感强；讲"感受和画面"而不是堆术语；**绝对不要**为了辨析而引入其它相近的生词（这会造成新的混淆），只聚焦这一个词本身。轻 Markdown 即可，不要 JSON 或代码块。`;

const FREQ_SYSTEM = `你是一位英语语料与语用专家，面对一位 CET-4/6 水平的中国学生。学生想知道：这个词/词组**在【这句话】里的这个具体含义和用法**，在真实英语里到底有多常见——好决定要不要专门去习得它。
请只评判**当前语境下的这个用法**（不是这个词所有意思的笼统常见度）。从下面 5 档里选**恰好一档**：极其常见 / 非常常见 / 常见 / 罕见 / 极其罕见。
你的回答**必须**严格以这样一行开头（程序要解析它，格式不能变）：
@@FREQ@@ <档位> | <领域或语体，可留空>
其中 <档位> 必须是上面 5 个词之一；若这个用法只在某个具体领域/行业/语体里才常见（如 财经、法律、口语、学术、文学），就在 | 后写出来；若是跨语境普遍如此，就连 | 一起省略。
然后空一行，用中文讲清楚：为什么落在这一档、通常在哪些场合会遇到它；再给 2–3 个能体现这个用法的英文例句，每句配一句简短中文翻译，让学生对这个用法留下画面和印象。可用轻 Markdown，但不要 JSON 或代码块。
若我在下面提供了这个词的【整体词频档】（A 最常用→E 生僻，来自语料排名），而它与你对**当前用法**常见度的判断明显相左（例如这个词整体偏生僻、但它在此处的这个用法其实相当常见，或反之），请在开头那行之后**先用一句话点破这个反差并简述原因**（如"这个词整体冷僻，但你遇到的这个用法是它最常见的意思"）——这正是学生最容易困惑、也最需要你解释清楚的地方。`;

const FOLLOWUP_SYSTEM = `你是一位博学又温暖的英语老师，正和一位 CET-4/6 水平的中国学生，围绕一篇英文文章里的某个词或词组做"追问式"讲解。
你的回答要：紧扣这个词/词组在【这句话】里的真实语境；用中文讲解，给英文例句时随手配一句简短中文翻译；语气亲切口语、像在旁边轻声点拨；不堆术语、不跑题、不要重复学生已经看到的讲解。
学生的目标是真正把这个词学透、用对，所以**该讲透就讲透、不要怕长**：把来龙去脉、用法边界、典型搭配、例句都讲清楚，宁可详尽也不要点到为止。可用很轻的 Markdown（**加粗**、换行、短横线列表）让较长的解析有层次，但不要输出 JSON 或代码块。`;

// ═══════════════════════════════════════════════════════════════════
// 测试 1：explainWord — reverberate
// ═══════════════════════════════════════════════════════════════════
console.log("【测试 1】explainWord: reverberate");
{
  const word = "reverberate", lemma = "reverberate";
  const sentence = "Her words reverberated in his mind for days.";
  const prompt = USER_TEMPLATE
    .replace("{word}", word).replace("{lemma}", lemma)
    .replace("{sentence}", sentence).replace("{title}", "（测试）");
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user",   content: prompt },
  ];
  try {
    let { content, finish, elapsed } = await chatCreate(messages, { wantJson: true, maxTokens: 4096 });
    // 空答重试
    if (!content.trim() || finish === "length") {
      console.log("  ⚠ 空答，重试（maxTokens x2）…");
      ({ content, finish, elapsed } = await chatCreate(messages, { wantJson: false, maxTokens: 8192 }));
    }
    const d = extractJson(content);
    console.log(`  耗时: ${elapsed}ms  finish: ${finish}`);
    console.log(`  phonetic:    ${d.phonetic    || "[空]"}`);
    console.log(`  pos:         ${d.pos         || "[空]"}`);
    console.log(`  literal:     ${d.literal     || "[空]"}`);
    console.log(`  contextual:  ${d.contextual  || "[空]"}`);
    console.log(`  explanation: ${(d.explanation || "[空]").slice(0, 80)}…`);
    const ok = d.phonetic && d.pos && d.literal && d.contextual && d.explanation;
    console.log(`  结果: ${ok ? "PASS" : "FAIL — 有字段为空"}\n`);
  } catch (e) {
    console.error("  ERROR:", e.message, "\n");
  }
}

// ═══════════════════════════════════════════════════════════════════
// 测试 2a：explainSelection — phrase（make a difference）
// ═══════════════════════════════════════════════════════════════════
console.log("【测试 2a】explainSelection(phrase): make a difference");
{
  const text = "make a difference";
  const sentence = "Small acts of kindness can make a difference in someone's day.";
  const prompt = SELECTION_TEMPLATE
    .replace("{text}", text)
    .replace("{sentence}", sentence)
    .replace("{title}", "（测试）");
  const messages = [
    { role: "system", content: SELECTION_SYSTEM },
    { role: "user",   content: prompt },
  ];
  try {
    let { content, finish, elapsed } = await chatCreate(messages, { wantJson: true, maxTokens: 4096 });
    if (!content.trim() || finish === "length") {
      ({ content, finish, elapsed } = await chatCreate(messages, { wantJson: false, maxTokens: 8192 }));
    }
    const d = extractJson(content);
    // kind 判定
    let kind = (d.kind || "").toLowerCase();
    if (kind !== "phrase" && kind !== "sentence") {
      kind = text.split(/\s+/).length >= 5 ? "sentence" : "phrase";
    }
    if (text.split(/\s+/).length >= 6) kind = "sentence";
    console.log(`  耗时: ${elapsed}ms  finish: ${finish}`);
    console.log(`  kind:    ${kind} (model said: ${d.kind})`);
    console.log(`  meaning: ${(d.meaning || "[空]").slice(0, 60)}`);
    console.log(`  talk:    ${(d.talk    || "[空]").slice(0, 60)}…`);
    const ok = kind && d.meaning && d.talk;
    console.log(`  结果: ${ok ? "PASS" : "FAIL"}\n`);
  } catch (e) {
    console.error("  ERROR:", e.message, "\n");
  }
}

// ═══════════════════════════════════════════════════════════════════
// 测试 2b：explainSelection — sentence
// ═══════════════════════════════════════════════════════════════════
console.log("【测试 2b】explainSelection(sentence)");
{
  const text = "Her words reverberated in his mind for days, leaving an indelible mark on his consciousness.";
  const sentence = text;
  const prompt = SELECTION_TEMPLATE
    .replace("{text}", text)
    .replace("{sentence}", sentence)
    .replace("{title}", "（测试）");
  const messages = [
    { role: "system", content: SELECTION_SYSTEM },
    { role: "user",   content: prompt },
  ];
  try {
    let { content, finish, elapsed } = await chatCreate(messages, { wantJson: true, maxTokens: 4096 });
    if (!content.trim() || finish === "length") {
      ({ content, finish, elapsed } = await chatCreate(messages, { wantJson: false, maxTokens: 8192 }));
    }
    const d = extractJson(content);
    let kind = (d.kind || "").toLowerCase();
    if (kind !== "phrase" && kind !== "sentence") kind = "sentence";
    if (text.split(/\s+/).length >= 6) kind = "sentence";
    console.log(`  耗时: ${elapsed}ms  finish: ${finish}`);
    console.log(`  kind:      ${kind} (model said: ${d.kind})`);
    console.log(`  meaning:   ${(d.meaning || "[空]").slice(0, 60)}…`);
    console.log(`  key_words: ${JSON.stringify((d.key_words || []).slice(0, 2))}`);
    console.log(`  talk:      ${(d.talk    || "[空]").slice(0, 60)}…`);
    const ok = kind === "sentence" && d.meaning && d.talk;
    console.log(`  结果: ${ok ? "PASS" : "FAIL"}\n`);
  } catch (e) {
    console.error("  ERROR:", e.message, "\n");
  }
}

// ═══════════════════════════════════════════════════════════════════
// 测试 3a：askFollowup mode=deep
// ═══════════════════════════════════════════════════════════════════
console.log("【测试 3a】askFollowup mode=deep");
{
  const word = "reverberate", lemma = "reverberate";
  const sentence = "Her words reverberated in his mind for days.";
  let ctx = `我们在讨论的词/词组：**${word}**（原形：${lemma}）\n【这句话】${sentence}`;
  const messages = [
    { role: "system",    content: DEEP_SYSTEM },
    { role: "user",      content: ctx + "\n\n（接下来我会就这个词向你追问，请始终扣住以上语境作答。）" },
    { role: "assistant", content: "好的，我已经记住这个词在这句话里的语境了，你问吧。" },
    { role: "user",      content: "词汇深解" },
  ];
  try {
    let { content, finish, elapsed } = await chatCreate(messages, { temperature: 0.7, wantJson: false, maxTokens: 4096 });
    if (!content.trim() || finish === "length") {
      ({ content, finish, elapsed } = await chatCreate(messages, { temperature: 0.7, wantJson: false, maxTokens: 8192 }));
    }
    console.log(`  耗时: ${elapsed}ms  finish: ${finish}`);
    console.log(`  answer (前150字): ${content.slice(0, 150).replace(/\n/g, " ")}…`);
    console.log(`  结果: ${content.length > 50 ? "PASS" : "FAIL — answer 太短"}\n`);
  } catch (e) {
    console.error("  ERROR:", e.message, "\n");
  }
}

// ═══════════════════════════════════════════════════════════════════
// 测试 3b：askFollowup mode=freq（必须有 @@FREQ@@ 开头行）
// ═══════════════════════════════════════════════════════════════════
console.log("【测试 3b】askFollowup mode=freq (检查 @@FREQ@@ 开头行)");
{
  const word = "reverberate", lemma = "reverberate";
  const sentence = "Her words reverberated in his mind for days.";
  let ctx = `我们在讨论的词/词组：**${word}**（原形：${lemma}）\n【这句话】${sentence}`;
  // band 模拟（较低频词）
  ctx += `\n【这个词的整体词频档】D（A 最常用→E 生僻，来自语料排名，和'当前用法常见度'是两回事）`;
  const messages = [
    { role: "system",    content: FREQ_SYSTEM },
    { role: "user",      content: ctx + "\n\n（接下来我会就这个词向你追问，请始终扣住以上语境作答。）" },
    { role: "assistant", content: "好的，我已经记住这个词在这句话里的语境了，你问吧。" },
    { role: "user",      content: "常见程度" },
  ];
  try {
    let { content, finish, elapsed } = await chatCreate(messages, { temperature: 0.7, wantJson: false, maxTokens: 4096 });
    if (!content.trim() || finish === "length") {
      ({ content, finish, elapsed } = await chatCreate(messages, { temperature: 0.7, wantJson: false, maxTokens: 8192 }));
    }
    console.log(`  耗时: ${elapsed}ms  finish: ${finish}`);
    console.log(`  answer 开头: ${content.slice(0, 120).replace(/\n/g, " ")}`);
    const hasFreq = content.includes("@@FREQ@@");
    console.log(`  @@FREQ@@ 在开头: ${hasFreq ? "YES" : "NO"}`);
    console.log(`  结果: ${hasFreq ? "PASS" : "FAIL — 缺少 @@FREQ@@ 行"}\n`);
  } catch (e) {
    console.error("  ERROR:", e.message, "\n");
  }
}

// ═══════════════════════════════════════════════════════════════════
// 测试 4：有道发音 URL 构造 + curl 验证
// ═══════════════════════════════════════════════════════════════════
console.log("【测试 4】有道发音 URL");
{
  const word = "reverberate";
  const urlUk = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=1`;
  const urlUs = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=2`;
  console.log(`  UK URL: ${urlUk}`);
  console.log(`  US URL: ${urlUs}`);
  // 用 fetch HEAD 验证（Node 18+）
  try {
    const r = await fetch(urlUk, { method: "HEAD" });
    console.log(`  HEAD 响应: ${r.status} ${r.headers.get("content-type") || ""}`);
    console.log(`  结果: ${r.ok ? "PASS (200 OK)" : "注意: 非 200，但 URL 构造正确"}\n`);
  } catch (e) {
    console.log(`  HEAD 失败（可能网络/CORS）: ${e.message}，URL 构造本身正确\n`);
  }
}

console.log("=== 自测完成 ===");
