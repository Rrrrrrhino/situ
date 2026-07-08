/**
 * test_writing.mjs — 阶段4.2 写作训练批改大脑自测
 * 仿 test_review.mjs，对真实 DeepSeek 跑一例并把原始 JSON 贴回。
 * 运行：node _devtest/test_writing.mjs（在 mobile/ 目录下）
 *
 * 测试场景：3 个目标表达
 *   - improve my English  → work on my English / practice my English
 *   - cut down on         → cut down on（本来就对，练用法）
 *   - make a difference   → make a difference
 * 学习者写的英文中：
 *   - "cut down on" 用对了（used&&correct）
 *   - "make a difference" 用对了（used&&correct）
 *   - "improve my English" 没用上（not used）
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

console.log(`\n=== 四土 写作训练批改大脑 自测 ===`);
console.log(`Provider: ${PROVIDER}, Model: ${FINAL_MODEL}, Key: ...${API_KEY.slice(-6)}\n`);

// ── 通用 chat 函数 ────────────────────────────────────────────────────────
async function chatCreate(messages, { temperature = 0.3, wantJson = false, maxTokens = 1536 } = {}) {
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
const WRITING_CHECK_SYSTEM = `你是一位资深英语写作老师，正在帮"中文母语"的学习者做针对性的造句 / 写作训练。学习者刚复习了几个表达（来自他的错题本），现在用它们写了一段英文。你要逐条检查他有没有真的用上、有没有用对，给出鼓励但具体的反馈。

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

const WRITING_CHECK_TEMPLATE = `【要练的表达】
{items_block}

【学习者写的英文】
{text}

请逐条检查并只输出那个 JSON 对象。`;

function buildMsg(targetItems, text) {
  const itemsBlock = targetItems
    .map((it) => `- ${it.original} → ${it.correction}`)
    .join("\n");
  const userMsg = WRITING_CHECK_TEMPLATE
    .replace("{items_block}", itemsBlock)
    .replace("{text}", text);
  return [
    { role: "system", content: WRITING_CHECK_SYSTEM },
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

// ── 测试场景 ──────────────────────────────────────────────────────────────
// 3 个目标表达：
//   improve my English  → work on my English（没用上）
//   cut down on         → cut down on（用对了）
//   make a difference   → make a difference（用对了）
// 学习者写的英文：只用了 "cut down on" 和 "make a difference"，没用 "improve my English"

const targetItems = [
  { original: "improve my English", correction: "work on my English / practice my English" },
  { original: "cut down on",        correction: "cut down on（本身正确，注意后接名词）" },
  { original: "make a difference",  correction: "make a difference（后接 to sb./sth. 更完整）" },
];

const studentText = `I've decided to cut down on the time I spend on my phone every day.
It's hard at first, but I believe it can truly make a difference to my focus and productivity.
Small changes like this really do add up over time.`;

console.log("【目标表达】");
targetItems.forEach((it, i) => console.log(`  ${i + 1}. ${it.original} → ${it.correction}`));
console.log("\n【学习者写的英文】");
console.log(studentText);
console.log("\n【预期】");
console.log("  - 'improve my English': used=false, correct=null");
console.log("  - 'cut down on': used=true, correct=true");
console.log("  - 'make a difference': used=true, correct=true");
console.log();

const messages = buildMsg(targetItems, studentText);
let rawContent = "";

try {
  let { content, finish, elapsed, rawData } = await chatCreate(messages, { wantJson: true, maxTokens: 1536 });
  rawContent = content;

  // 空答重试（v4-pro 推理模型坑）
  if (!content.trim() || finish === "length") {
    console.log("  ⚠ 空答或截断，重试（maxTokens 3072）…");
    ({ content, finish, elapsed } = await chatCreate(messages, { wantJson: false, maxTokens: 3072 }));
    rawContent = content;
  }

  console.log(`耗时: ${elapsed}ms  finish: ${finish}`);
  console.log("\n──── 原始 JSON 全文 ────");
  console.log(rawContent);
  console.log("──── 解析结果 ────");

  const d = extractJson(rawContent);

  // 逐条展示
  const items = Array.isArray(d.items) ? d.items : [];
  console.log(`\nitems (${items.length} 条):`);
  for (const it of items) {
    console.log(`  target:   "${it.target}"`);
    console.log(`  used:     ${it.used}`);
    console.log(`  correct:  ${it.correct}`);
    console.log(`  quote:    "${it.quote}"`);
    console.log(`  feedback: ${it.feedback}`);
    console.log();
  }
  console.log(`overall: ${d.overall}`);

  // ── 验收判定 ─────────────────────────────────────────────────────────
  console.log("\n──── 验收 ────");

  // 找三条 target（宽松匹配）
  const find = (keyword) => items.find((it) =>
    (it.target || "").toLowerCase().includes(keyword.toLowerCase())
  );

  const itImprove = find("improve my English");
  const itCutDown = find("cut down on");
  const itDiff    = find("make a difference");

  let pass = true;

  // improve my English：应 used=false
  if (itImprove) {
    const ok = itImprove.used === false;
    console.log(`  'improve my English' used=false: ${ok ? "PASS" : "FAIL (used=" + itImprove.used + ")"}`);
    console.log(`    correct=${itImprove.correct}, quote="${itImprove.quote}"`);
    if (!ok) pass = false;
  } else {
    console.log("  'improve my English': 未在 items 中找到 - WARN");
  }

  // cut down on：应 used=true, correct=true
  if (itCutDown) {
    const okUsed    = itCutDown.used === true;
    const okCorrect = itCutDown.correct === true;
    console.log(`  'cut down on' used=true: ${okUsed ? "PASS" : "FAIL"}`);
    console.log(`  'cut down on' correct=true: ${okCorrect ? "PASS" : "FAIL"}`);
    console.log(`    quote="${itCutDown.quote}"`);
    if (!okUsed || !okCorrect) pass = false;
    // quote 应能在原文定位
    if (itCutDown.quote && !studentText.includes(itCutDown.quote)) {
      console.log(`    !! quote 无法在原文定位`);
      pass = false;
    }
  } else {
    console.log("  'cut down on': 未在 items 中找到 - WARN");
  }

  // make a difference：应 used=true, correct=true
  if (itDiff) {
    const okUsed    = itDiff.used === true;
    const okCorrect = itDiff.correct === true;
    console.log(`  'make a difference' used=true: ${okUsed ? "PASS" : "FAIL"}`);
    console.log(`  'make a difference' correct=true: ${okCorrect ? "PASS" : "FAIL"}`);
    console.log(`    quote="${itDiff.quote}"`);
    if (!okUsed || !okCorrect) pass = false;
    if (itDiff.quote && !studentText.includes(itDiff.quote)) {
      console.log(`    !! quote 无法在原文定位`);
      pass = false;
    }
  } else {
    console.log("  'make a difference': 未在 items 中找到 - WARN");
  }

  console.log(`\noverall 非空: ${(d.overall || "").trim() ? "OK" : "FAIL"}`);
  console.log(`\n总判定: ${pass ? "PASS" : "部分 FAIL，见上"}`);

} catch (e) {
  console.error("ERROR:", e.message);
  if (rawContent) console.log("原始内容:", rawContent.slice(0, 400));
}

console.log("\n=== 自测完成 ===");
