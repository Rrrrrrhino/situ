/**
 * test_review.mjs — 阶段4.1 口语复盘大脑自测
 * 仿 test_llm.mjs，对真实 DeepSeek 跑两段并把原始 JSON 贴回。
 * 运行：node _devtest/test_review.mjs（在 mobile/ 目录下）
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── 读 .env ──────────────────────────────────────────────────────────────
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

// ── Provider 表 ───────────────────────────────────────────────────────────
const PROVIDERS = {
  deepseek: ["https://api.deepseek.com/v1", "deepseek-v4-pro"],
  zhipu:    ["https://open.bigmodel.cn/api/paas/v4", "glm-4-flash"],
  kimi:     ["https://api.moonshot.cn/v1", "moonshot-v1-8k"],
  openai:   ["https://api.openai.com/v1", "gpt-4o-mini"],
};
const [defaultUrl, defaultModel] = PROVIDERS[PROVIDER] || PROVIDERS.deepseek;
const BASE_URL    = defaultUrl;
const FINAL_MODEL = MODEL || defaultModel;

console.log(`\n=== 四土 口语复盘大脑 自测 ===`);
console.log(`Provider: ${PROVIDER}, Model: ${FINAL_MODEL}, Key: ...${API_KEY.slice(-6)}\n`);

// ── 通用 chat 函数 ────────────────────────────────────────────────────────
async function chatCreate(messages, { temperature = 0.3, wantJson = false, maxTokens = 2048 } = {}) {
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
  return { content, finish, elapsed, rawData: data };
}

// ── 逐字照搬规格 §1 的 prompt ────────────────────────────────────────────
const REVIEW_SYSTEM = `你是一位资深的英语口语外教，专门帮"中文母语"的学习者复盘他们自己说出口或写出来的英文。学习者会给你一段他本人产出的英文（可能是把口播录音转写来的，会有口语的不完整、重复、口头语，这些口语特征不要苛责）。你的任务：客观、具体地复盘，帮他下次说得更准、更地道。

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

const REVIEW_TEMPLATE = `【学习者产出的英文】
{transcript}
{context_block}
请严格按系统要求复盘，只输出那个 JSON 对象。`;

function buildMsg(transcript, context) {
  const contextBlock = context && context.trim()
    ? `\n\n【背景 / 对方说了什么 / 话题】\n${context.trim()}`
    : "";
  const userMsg = REVIEW_TEMPLATE
    .replace("{transcript}", transcript)
    .replace("{context_block}", contextBlock);
  return [
    { role: "system", content: REVIEW_SYSTEM },
    { role: "user",   content: userMsg },
  ];
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

/** 检验 original 是否逐字出现在 transcript 中 */
function checkOriginals(transcript, items, fieldName) {
  const missing = [];
  for (const item of items) {
    const orig = item.original || "";
    if (orig && !transcript.includes(orig)) {
      missing.push(`  !! original 无法在原文定位: "${orig}"`);
    }
  }
  return missing;
}

// ═══════════════════════════════════════════════════════════════════════
// 测试 (a)：有错的那段（规格里指定的段落）
// ═══════════════════════════════════════════════════════════════════════
console.log("【测试 (a)】有错的段落（规格指定）");
const transcriptA = `Yesterday I go to the park with my friend. The weather was very good so we very enjoy it. I want to improve my English level, so speaking more is the best way. Anyway, it is a meaningful day.`;
{
  const messages = buildMsg(transcriptA, "");
  let rawContent = "";
  try {
    let { content, finish, elapsed, rawData } = await chatCreate(messages, { wantJson: true, maxTokens: 2048 });
    rawContent = content;
    // 空答重试
    if (!content.trim() || finish === "length") {
      console.log("  ⚠ 空答或截断，重试（maxTokens 4096）…");
      ({ content, finish, elapsed, rawData } = await chatCreate(messages, { wantJson: false, maxTokens: 4096 }));
      rawContent = content;
    }
    console.log(`  耗时: ${elapsed}ms  finish: ${finish}`);
    console.log(`\n  ──── 原始 JSON 全文 (a) ────`);
    console.log(rawContent);
    console.log(`  ──── 解析结果 ────`);
    const d = extractJson(rawContent);
    console.log(`  strengths (${(d.strengths||[]).length} 条):`, JSON.stringify(d.strengths || []));
    console.log(`  errors (${(d.errors||[]).length} 条):`);
    for (const e of (d.errors || [])) {
      console.log(`    - original: "${e.original}"`);
      console.log(`      correction: "${e.correction}"  type: ${e.type}`);
      console.log(`      why: ${e.why}`);
    }
    console.log(`  naturalness (${(d.naturalness||[]).length} 条):`);
    for (const n of (d.naturalness || [])) {
      console.log(`    - original: "${n.original}"`);
      console.log(`      better: "${n.better}"`);
      console.log(`      why: ${n.why}`);
    }
    // 验收：original 是否可以在原文定位
    const errMissing = checkOriginals(transcriptA, d.errors || [], "errors");
    const natMissing = checkOriginals(transcriptA, d.naturalness || [], "naturalness");
    if (errMissing.length || natMissing.length) {
      console.log("  !! 部分 original 无法在原文定位:");
      [...errMissing, ...natMissing].forEach((m) => console.log(m));
    } else {
      console.log("  original 全部可在原文定位: OK");
    }
    // 检查是否抓到关键错误
    const errOriginals = (d.errors || []).map((e) => e.original || "").join(" ");
    const hasGoError = errOriginals.includes("I go") || errOriginals.includes("go to");
    const hasVeryEnjoy = errOriginals.includes("very enjoy");
    const natOriginals = (d.naturalness || []).map((n) => n.original || "").join(" ");
    const hasEnglishLevel = errOriginals.includes("English level") || natOriginals.includes("English level");
    const hasItIs = errOriginals.includes("it is") || natOriginals.includes("it is");
    console.log(`  抓到 "I go"(时态错): ${hasGoError ? "YES" : "NO"}`);
    console.log(`  抓到 "very enjoy"(very+动词): ${hasVeryEnjoy ? "YES" : "NO"}`);
    console.log(`  抓到 "English level"(中式表达): ${hasEnglishLevel ? "YES" : "NO"}`);
    console.log(`  抓到 "it is"(时态/自然度): ${hasItIs ? "YES" : "NO"}`);
    const totalIssues = (d.errors||[]).length + (d.naturalness||[]).length;
    console.log(`  结果: ${totalIssues > 0 ? "PASS (抓到了问题)" : "FAIL (一条都没抓到)"}\n`);
  } catch (e) {
    console.error("  ERROR:", e.message, "\n");
    if (rawContent) console.log("  原始内容:", rawContent.slice(0, 300));
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 测试 (b)：本来就不错的段落（验证不硬造问题）
// ═══════════════════════════════════════════════════════════════════════
console.log("【测试 (b)】不错的段落（验证不硬造错误）");
const transcriptB = `I've been trying to cut down on social media lately because I noticed it was taking up too much of my time. Instead, I've been reading more books, which has been really refreshing. I think it's important to be intentional about how you spend your time.`;
{
  const messages = buildMsg(transcriptB, "");
  let rawContent = "";
  try {
    let { content, finish, elapsed } = await chatCreate(messages, { wantJson: true, maxTokens: 2048 });
    rawContent = content;
    if (!content.trim() || finish === "length") {
      console.log("  ⚠ 空答或截断，重试…");
      ({ content, finish, elapsed } = await chatCreate(messages, { wantJson: false, maxTokens: 4096 }));
      rawContent = content;
    }
    console.log(`  耗时: ${elapsed}ms  finish: ${finish}`);
    console.log(`\n  ──── 原始 JSON 全文 (b) ────`);
    console.log(rawContent);
    console.log(`  ──── 解析结果 ────`);
    const d = extractJson(rawContent);
    console.log(`  strengths (${(d.strengths||[]).length} 条):`, JSON.stringify(d.strengths || []));
    console.log(`  errors (${(d.errors||[]).length} 条):`, JSON.stringify(d.errors || []));
    console.log(`  naturalness (${(d.naturalness||[]).length} 条):`, JSON.stringify(d.naturalness || []));
    const errCount = (d.errors||[]).length;
    const natCount = (d.naturalness||[]).length;
    // original 定位验证
    const errMissing = checkOriginals(transcriptB, d.errors || [], "errors");
    const natMissing = checkOriginals(transcriptB, d.naturalness || [], "naturalness");
    if (errMissing.length || natMissing.length) {
      console.log("  !! 部分 original 无法在原文定位:");
      [...errMissing, ...natMissing].forEach((m) => console.log(m));
    } else if (errCount + natCount > 0) {
      console.log("  original 全部可在原文定位: OK");
    }
    // 不错的段落，errors 应该很少（0-1 条），naturalness 也应该少
    const noCrammed = errCount <= 1;
    console.log(`  errors: ${errCount} 条，naturalness: ${natCount} 条`);
    console.log(`  结果: ${noCrammed ? "PASS (没有硬造大量错误)" : "注意: errors 较多，可能硬造了问题"}\n`);
  } catch (e) {
    console.error("  ERROR:", e.message, "\n");
    if (rawContent) console.log("  原始内容:", rawContent.slice(0, 300));
  }
}

console.log("=== 自测完成 ===");
