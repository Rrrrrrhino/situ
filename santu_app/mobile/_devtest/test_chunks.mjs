/**
 * test_chunks.mjs — 阶段9 词块系统 自测
 * 仿 test_review_v2.mjs，对真实 DeepSeek 跑三组并把原始 JSON 贴回：
 *   (a) 给 3 个词块，写一段故意一对一错一没用的英文 → 看五档裁决是否准、
 *       错的那条 examples 是否 2-3 条且地道、没用的 used=false（CHUNK_DRILL）
 *   (b) review_speech 场景：传 2 个进行中词块、转写里用对其中 1 个 →
 *       看 chunkFeedback 只含用到的那条、verdict=correct、
 *       词块问题没有重复出现在 priority/minor（REVIEW_V2_SINGLE + chunks_block）
 *   (c) 同一词块三个不同场次 correct → 断言 mastered=true、justMastered 只在第三次为 true
 *       （本地纯逻辑模拟 _applyChunkFeedback 的掌握规则，不需要额外调用 LLM）
 * 运行：node _devtest/test_chunks.mjs（在 mobile/ 目录下）
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
let   MODEL    = env.LLM_MODEL    || "";

if (!API_KEY) {
  console.error("ERROR: LLM_API_KEY not found in .env");
  process.exit(1);
}

// deepseek-chat 已是弱档别名(v4-flash)，照 llm.js._loadConfig 的自动升级逻辑，本测试也升级到 v4-pro
if (PROVIDER === "deepseek" && MODEL === "deepseek-chat") {
  console.log("[test] deepseek-chat 已是弱档别名(v4-flash)，自动升级为 deepseek-v4-pro（照抄 llm.js 逻辑）");
  MODEL = "deepseek-v4-pro";
}

const PROVIDERS = {
  deepseek: ["https://api.deepseek.com/v1", "deepseek-v4-pro"],
  zhipu:    ["https://open.bigmodel.cn/api/paas/v4", "glm-4-flash"],
  kimi:     ["https://api.moonshot.cn/v1", "moonshot-v1-8k"],
  openai:   ["https://api.openai.com/v1", "gpt-4o-mini"],
};
const [defaultUrl, defaultModel] = PROVIDERS[PROVIDER] || PROVIDERS.deepseek;
const BASE_URL    = defaultUrl;
const FINAL_MODEL = MODEL || defaultModel;

console.log(`\n=== 四土 词块系统（阶段9）自测 ===`);
console.log(`Provider: ${PROVIDER}, Model: ${FINAL_MODEL}, Key: ...${API_KEY.slice(-6)}\n`);

// ── 通用 chat 函数（同 test_review_v2.mjs） ───────────────────────────────
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
  return { content, finish, elapsed };
}

async function chatWithFallback(messages, { maxTokens, retryTokens }) {
  let r;
  try {
    r = await chatCreate(messages, { wantJson: true, maxTokens });
  } catch (_) {
    r = await chatCreate(messages, { wantJson: false, maxTokens });
  }
  if (!r.content.trim() || r.finish === "length") {
    try { r = await chatCreate(messages, { wantJson: false, maxTokens: retryTokens }); } catch (_) {}
  }
  return r;
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

// ── 逐字照搬 spec §2a/§2b（CHUNK_DRILL）+ §2d 插入后的 REVIEW_V2_SINGLE ────

const CHUNK_DRILL_SYSTEM = `你是一位资深的英语口语外教，正在帮"中文母语"的学习者做词块（chunk）刻意练习。学习者刚拿到几个目标词块，现场说或写了一段英文来使用它们（口语转写可能带不完整、重复、口头语，不要苛责）。你要逐个词块裁决他用得对不对——他最需要的是确定性的反馈：到底哪里对、哪里不对、正确的用法长什么样。

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

const CHUNK_DRILL_TEMPLATE = `【目标词块】
{chunks_block}

【学习者的英文】
{text}
{context_block}
请逐个词块裁决，只输出那个 JSON 对象。`;

const REVIEW_V2_SINGLE_SYSTEM = `你是一位资深的英语口语外教，专门帮"中文母语"的学习者复盘他本人产出的英文（口播录音转写或和 AI 的对话转写，可能带口语的不完整、重复、口头语，这些口语特征不要苛责）。你的任务：把最值得他记住的问题挑出来讲透，而不是把所有毛病平铺罗列。

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

const REVIEW_V2_SINGLE_TEMPLATE = `【学习者产出的英文】
{transcript}
{context_block}
{mistakes_block}
{chunks_block}
请严格按系统要求复盘，只输出那个 JSON 对象。`;

function buildChunkDrillBlock(chunks) {
  return chunks.map((c) => `- ${c.text}` + (c.meaning ? `（${c.meaning}）` : "")).join("\n");
}
function buildChunksBlock(chunks) {
  if (!chunks || !chunks.length) return "";
  const lines = chunks.map((c) => `- ${c.text}`);
  return `\n\n【进行中的词块（他正在刻意练习，留意是否用到）】\n${lines.join("\n")}`;
}

// ═══════════════════════════════════════════════════════════════════════
// 测试 (a)：CHUNK_DRILL — 3 个词块，一对一错一没用
// ═══════════════════════════════════════════════════════════════════════
console.log("【测试 (a)】CHUNK_DRILL 裁决：3 词块，一段故意一对一错一没用的英文");
const targetChunks = [
  { text: "be inclined to", meaning: "倾向于" },
  { text: "on the fence", meaning: "犹豫不决/骑墙" },
  { text: "it boils down to", meaning: "归根结底是" },
];
// 故意设计：
//  - "be inclined to" 用对（形式/搭配/语境都对）
//  - "on the fence" 用错（搭配/语法：漏了系动词，写成 "I on the fence about it"）
//  - "it boils down to" 完全没用到
const drillText = `I've been thinking about whether to change my job recently. Honestly I am inclined to stay at my current company because the team is great, but at the same time I on the fence about it because the salary hasn't increased for two years. My friend told me I should just talk to my manager directly.`;
console.log(`  目标词块: ${targetChunks.map((c) => c.text).join(" / ")}`);
console.log(`  学习者英文: ${drillText}\n`);
{
  const chunksBlock = buildChunkDrillBlock(targetChunks);
  const userMsg = CHUNK_DRILL_TEMPLATE
    .replace("{chunks_block}", chunksBlock)
    .replace("{text}", drillText)
    .replace("{context_block}", "");
  const messages = [
    { role: "system", content: CHUNK_DRILL_SYSTEM },
    { role: "user", content: userMsg },
  ];
  try {
    const { content, finish, elapsed } = await chatWithFallback(messages, { maxTokens: 3072, retryTokens: 6144 });
    console.log(`  耗时: ${elapsed}ms  finish: ${finish}`);
    console.log(`\n  ──── 原始 JSON 全文 (a) ────`);
    console.log(content);
    const d = extractJson(content);
    console.log(`\n  ──── 解析结果 ────`);
    console.log(`  topic: ${d.topic}`);
    for (const it of (d.items || [])) {
      console.log(`  - chunk="${it.chunk}" used=${it.used} verdict=${it.verdict} quote="${it.quote}"`);
      console.log(`    comment: ${it.comment}`);
      console.log(`    examples (${(it.examples || []).length}): ${JSON.stringify(it.examples || [])}`);
    }
    console.log(`  extraErrors (${(d.extraErrors || []).length}):`, JSON.stringify(d.extraErrors || []));
    console.log(`  overall: ${d.overall}`);

    const beInclined = (d.items || []).find((it) => it.chunk === "be inclined to");
    const onFence = (d.items || []).find((it) => it.chunk === "on the fence");
    const boilsDown = (d.items || []).find((it) => it.chunk === "it boils down to");
    console.log(`\n  ──── 断言 ────`);
    console.log(`  be inclined to → used=true, verdict=correct: ${beInclined && beInclined.used && beInclined.verdict === "correct" ? "PASS" : "FAIL(实际 used=" + (beInclined && beInclined.used) + " verdict=" + (beInclined && beInclined.verdict) + ")"}`);
    console.log(`  on the fence → used=true, verdict≠correct: ${onFence && onFence.used && onFence.verdict !== "correct" ? "PASS" : "FAIL(实际 used=" + (onFence && onFence.used) + " verdict=" + (onFence && onFence.verdict) + ")"}`);
    console.log(`  on the fence examples 2-3条: ${onFence && (onFence.examples || []).length >= 2 && (onFence.examples || []).length <= 3 ? "PASS" : "FAIL(实际 " + (onFence && (onFence.examples || []).length) + " 条)"}`);
    console.log(`  it boils down to → used=false: ${boilsDown && boilsDown.used === false ? "PASS" : "FAIL(实际 used=" + (boilsDown && boilsDown.used) + ")"}`);
  } catch (e) {
    console.error("  ERROR:", e.message, "\n");
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 测试 (b)：review_speech 场景 — 2 个进行中词块，转写里用对其中 1 个
// ═══════════════════════════════════════════════════════════════════════
console.log("\n\n【测试 (b)】REVIEW_V2_SINGLE + chunks_block：2 进行中词块，只用对 1 个");
const inProgressChunks = [
  { id: "c1", text: "make up for" },
  { id: "c2", text: "run into" },
];
const reviewText = `Yesterday I ran into my old classmate at the supermarket, we haven't seen each other for like five years. We talked for almost an hour to catch up. I think I need to study harder these two weeks to make up my missed classes.`;
console.log(`  进行中词块: ${inProgressChunks.map((c) => c.text).join(" / ")}`);
console.log(`  转写: ${reviewText}`);
console.log(`  （"run into" 用对(过去式 ran into，形式/搭配/语境都对)；"make up for" 写成了 "make up"，漏了 for，算用错）\n`);
{
  const chunksBlock = buildChunksBlock(inProgressChunks);
  const userMsg = REVIEW_V2_SINGLE_TEMPLATE
    .replace("{transcript}", reviewText)
    .replace("{context_block}", "")
    .replace("{mistakes_block}", "")
    .replace("{chunks_block}", chunksBlock);
  const messages = [
    { role: "system", content: REVIEW_V2_SINGLE_SYSTEM },
    { role: "user", content: userMsg },
  ];
  try {
    const { content, finish, elapsed } = await chatWithFallback(messages, { maxTokens: 3072, retryTokens: 6144 });
    console.log(`  耗时: ${elapsed}ms  finish: ${finish}`);
    console.log(`\n  ──── 原始 JSON 全文 (b) ────`);
    console.log(content);
    const d = extractJson(content);
    console.log(`\n  ──── 解析结果 ────`);
    console.log(`  topic: ${d.topic}`);
    console.log(`  priority (${(d.priority || []).length} 条):`);
    for (const p of (d.priority || [])) console.log(`    - [${p.type}] "${p.original}" → "${p.correction}"`);
    console.log(`  minor (${(d.minor || []).length} 条):`);
    for (const m of (d.minor || [])) console.log(`    - [${m.type}] "${m.original}" → "${m.correction}"`);
    console.log(`  chunkFeedback (${(d.chunkFeedback || []).length} 条):`);
    for (const cf of (d.chunkFeedback || [])) console.log(`    - chunk="${cf.chunk}" verdict=${cf.verdict} quote="${cf.quote}" comment=${cf.comment}`);

    const cf = d.chunkFeedback || [];
    const runIntoFb = cf.find((it) => it.chunk === "run into");
    const makeUpFb = cf.find((it) => it.chunk === "make up for");
    console.log(`\n  ──── 断言 ────`);
    console.log(`  chunkFeedback 只含用到的词块（1或2条，取决于模型是否判"make up"也算试图使用）: ${cf.length >= 1 && cf.length <= 2 ? "PASS" : "FAIL(实际 " + cf.length + " 条)"}`);
    console.log(`  "run into" 在 chunkFeedback 中且 verdict=correct: ${runIntoFb && runIntoFb.verdict === "correct" ? "PASS" : "FAIL(实际 " + (runIntoFb ? runIntoFb.verdict : "未出现") + ")"}`);
    // 词块问题不应重复出现在 priority/minor 的 original 里（粗略检查是否有 original 恰好等于词块原文）
    const allPM = [...(d.priority || []), ...(d.minor || [])];
    const dupInPM = allPM.some((it) => it.original === "run into" || it.original === "make up for");
    console.log(`  词块问题没有重复出现在 priority/minor: ${!dupInPM ? "PASS" : "FAIL(发现重复)"}`);
  } catch (e) {
    console.error("  ERROR:", e.message, "\n");
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 测试 (c)：掌握规则 — 同一词块三个不同场次 correct → mastered=true，
// justMastered 只在第三次为 true（纯本地逻辑模拟 _applyChunkFeedback，无需再调 LLM）
// ═══════════════════════════════════════════════════════════════════════
console.log("\n\n【测试 (c)】掌握规则：同一词块三个不同场次 correct → mastered=true，justMastered 只在第三次为 true");
{
  // 模拟 localapi.js _applyMasteryRule + _applyChunkFeedback 的核心逻辑（chunks 表行为）
  function applyMasteryRule(chunk) {
    const justReached = !chunk.mastered && chunk.correctRefs.length >= 3;
    if (chunk.correctRefs.length >= 3) chunk.mastered = true;
    return justReached;
  }
  function applyOneFeedback(chunk, ref, topic, verdict) {
    chunk.drillCount = (chunk.drillCount || 0) + 1;
    chunk.lastDrilled = Date.now();
    let justMastered = false;
    if (verdict === "correct") {
      const refs = chunk.correctRefs || [];
      if (!refs.includes(ref)) {
        refs.push(ref);
        chunk.correctRefs = refs;
        const topics = chunk.correctTopics || [];
        if (topic) topics.push(topic);
        chunk.correctTopics = topics;
      }
      justMastered = applyMasteryRule(chunk);
    }
    // 快照本次调用后的计数，供事后断言（不依赖全局变量的"最终值"）
    return { justMastered, refsCountAfter: chunk.correctRefs.length };
  }

  const chunk = {
    id: "test-chunk-1", text: "be inclined to", meaning: "倾向于", example: "",
    source: "manual", sourceRef: "", addedAt: Date.now(), lastDrilled: 0,
    drillCount: 0, correctRefs: [], correctTopics: [], mastered: false, star: false,
  };

  const results = [];
  results.push(applyOneFeedback(chunk, "review-001", "聊工作", "correct"));
  console.log(`  第1次 correct（场次 review-001）→ correctRefs=${JSON.stringify(chunk.correctRefs)} mastered=${chunk.mastered} justMastered=${results[0].justMastered}`);
  results.push(applyOneFeedback(chunk, "review-002", "聊旅行", "correct"));
  console.log(`  第2次 correct（场次 review-002）→ correctRefs=${JSON.stringify(chunk.correctRefs)} mastered=${chunk.mastered} justMastered=${results[1].justMastered}`);
  // 同一场次重复不应计入两次（去重验证）：故意用同一 ref review-002 再来一次
  results.push(applyOneFeedback(chunk, "review-002", "聊旅行", "correct"));
  console.log(`  同场次重复 correct（仍是 review-002，验证去重）→ correctRefs=${JSON.stringify(chunk.correctRefs)}（应仍是2个不重复）`);
  results.push(applyOneFeedback(chunk, "review-003", "聊天气", "correct"));
  console.log(`  第3次 correct（场次 review-003）→ correctRefs=${JSON.stringify(chunk.correctRefs)} mastered=${chunk.mastered} justMastered=${results[3].justMastered}`);

  console.log(`\n  ──── 断言 ────`);
  console.log(`  最终 mastered=true: ${chunk.mastered === true ? "PASS" : "FAIL"}`);
  console.log(`  correctRefs 去重后长度=3: ${chunk.correctRefs.length === 3 ? "PASS" : "FAIL(实际 " + chunk.correctRefs.length + ")"}`);
  console.log(`  第1次 justMastered=false: ${results[0].justMastered === false ? "PASS" : "FAIL"}`);
  console.log(`  第2次 justMastered=false: ${results[1].justMastered === false ? "PASS" : "FAIL"}`);
  console.log(`  同场次重复(第3调用) justMastered=false 且当时计数仍为2(不增加): ${results[2].justMastered === false && results[2].refsCountAfter === 2 ? "PASS" : "FAIL(实际 justMastered=" + results[2].justMastered + " refsCountAfter=" + results[2].refsCountAfter + ")"}`);
  console.log(`  第3个不同场次(review-003) justMastered=true: ${results[3].justMastered === true ? "PASS" : "FAIL"}`);
}

console.log("\n=== 自测完成 ===");
