/**
 * test_review_v2.mjs — 阶段8 口语复盘大脑升级 自测
 * 仿 test_review.mjs，对真实 DeepSeek 跑三组并把原始 JSON 贴回：
 *   (a) 短文本有错段 → 单遍 REVIEW_V2_SINGLE
 *   (b) 长文本 ≥600 词，重复错误 → 两遍（检出分块并行 → 编辑），验证 count≥2 合并 + segments
 *   (c) 伪造错题清单 M1…M3，其中一条与文中错误同知识点 → 验证 repeatOf 命中
 * 运行：node _devtest/test_review_v2.mjs（在 mobile/ 目录下）
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

const PROVIDERS = {
  deepseek: ["https://api.deepseek.com/v1", "deepseek-v4-pro"],
  zhipu:    ["https://open.bigmodel.cn/api/paas/v4", "glm-4-flash"],
  kimi:     ["https://api.moonshot.cn/v1", "moonshot-v1-8k"],
  openai:   ["https://api.openai.com/v1", "gpt-4o-mini"],
};
const [defaultUrl, defaultModel] = PROVIDERS[PROVIDER] || PROVIDERS.deepseek;
const BASE_URL    = defaultUrl;
const FINAL_MODEL = MODEL || defaultModel;

console.log(`\n=== 四土 口语复盘大脑升级（阶段8）自测 ===`);
console.log(`Provider: ${PROVIDER}, Model: ${FINAL_MODEL}, Key: ...${API_KEY.slice(-6)}\n`);

// ── 通用 chat 函数（同 test_review.mjs） ──────────────────────────────────
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

function checkOriginals(transcript, items) {
  const missing = [];
  for (const item of items) {
    const orig = item.original || "";
    if (orig && !transcript.includes(orig)) missing.push(`  !! original 无法在原文定位: "${orig}"`);
  }
  return missing;
}

// ── 逐字照搬 spec §2 的三条 prompt ─────────────────────────────────────────

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
  "minor": [ 与 priority 同结构的对象 ]
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
- 所有中文解释简短、具体、不客套。`;

const REVIEW_V2_SINGLE_TEMPLATE = `【学习者产出的英文】
{transcript}
{context_block}
{mistakes_block}
请严格按系统要求复盘，只输出那个 JSON 对象。`;

const REVIEW_V2_DETECT_SYSTEM = `你是一位资深的英语口语外教，正在帮"中文母语"的学习者复盘他本人产出的一大段英文（口播或对话的转写，带口语特征不要苛责）。下面给你的是其中第 {i}/{n} 段。你的任务是"地毯式检出"：把这一段里所有真实存在的问题找全，交给下一环节去排优先级和整理——这一步宁可多报、不要漏报，但每一条都必须是真问题，绝不硬造。

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

const REVIEW_V2_DETECT_TEMPLATE = `【转写第 {i}/{n} 段】
{chunk}

请严格按系统要求检出，只输出那个 JSON 对象。`;

const REVIEW_V2_EDIT_SYSTEM = `你是一位资深的英语口语外教兼编辑。学习者说了一大段英文（完整转写附后），检出环节已把全部问题逐段找出（原始清单附后，可能有重复、有跨段的同类错误、也可能混入个别误报）。你的任务是像编辑一样把它整理成一份"能消化"的复盘：挑重点、合并同类、按话题分段，而不是平铺罗列。

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
  "minor": [ 与 priority 同结构 ]
}

整理要求：
- priority 是"今天最值得记住的"，最多 5 条、宁缺毋滥，按此优先：①真正的语法/用词/搭配错误 ②反复出现的问题 ③【近期错题】里再次犯的 ④一改就明显更地道的表达。
- 同一个知识点的多条检出必须合并成一条：count 记总次数，original 取最典型的一处，绝不一条条罗列。
- minor 放其余问题，按重要性排序，同样先合并同类。检出清单里明显误报的（其实没错的）直接丢弃。
- 每条的 original 必须逐字来自检出清单，correction / why 可以在检出的基础上改得更好。
- repeatOf：若该条与【近期错题】中某条是同一个知识点，填那条的编号字符串如 "M3"；否则填 null。
- 所有中文简短、具体、不客套。`;

const REVIEW_V2_EDIT_TEMPLATE = `【完整转写】
{transcript}
{context_block}
{mistakes_block}

【检出清单（逐段合并）】
{findings_block}

请严格按系统要求整理，只输出那个 JSON 对象。`;

function buildMistakesBlock(mistakes) {
  if (!mistakes || !mistakes.length) return "";
  const lines = mistakes.map((m, i) => `M${i + 1}. ${m.original} → ${m.correction}（${m.type}）`);
  return `\n\n【近期错题（未掌握，供判断是否重犯）】\n${lines.join("\n")}`;
}

function splitIntoChunks(text, targetMin = 800, targetMax = 1100) {
  const sentences = text.split(/(?<=[.?!\n])\s+/).filter((s) => s.trim());
  const chunks = [];
  let cur = [], curWords = 0;
  for (const sent of sentences) {
    const w = sent.split(/\s+/).filter(Boolean).length;
    if (curWords > 0 && curWords + w > targetMax) {
      chunks.push(cur.join(" ")); cur = [sent]; curWords = w;
    } else {
      cur.push(sent); curWords += w;
      if (curWords >= targetMin) { chunks.push(cur.join(" ")); cur = []; curWords = 0; }
    }
  }
  if (cur.length) chunks.push(cur.join(" "));
  return chunks.length ? chunks : [text];
}

// ═══════════════════════════════════════════════════════════════════════
// 测试 (a)：短文本有错段 → 单遍
// ═══════════════════════════════════════════════════════════════════════
console.log("【测试 (a)】短文本有错段（4.1 那段）→ 应走单遍 REVIEW_V2_SINGLE");
const transcriptA = `Yesterday I go to the park with my friend. The weather was very good so we very enjoy it. I want to improve my English level, so speaking more is the best way. Anyway, it is a meaningful day.`;
const wcA = transcriptA.split(/\s+/).filter(Boolean).length;
console.log(`  词数: ${wcA}（${wcA <= 350 ? "≤350 走单遍" : "应走两遍，异常"}）`);
{
  const userMsg = REVIEW_V2_SINGLE_TEMPLATE
    .replace("{transcript}", transcriptA)
    .replace("{context_block}", "")
    .replace("{mistakes_block}", "");
  const messages = [
    { role: "system", content: REVIEW_V2_SINGLE_SYSTEM },
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
    console.log(`  overall: ${d.overall}`);
    console.log(`  strengths (${(d.strengths || []).length}):`, JSON.stringify(d.strengths || []));
    console.log(`  priority (${(d.priority || []).length} 条):`);
    for (const p of (d.priority || [])) console.log(`    - [${p.type}] "${p.original}" → "${p.correction}" (count=${p.count}, repeatOf=${p.repeatOf})  why: ${p.why}`);
    console.log(`  minor (${(d.minor || []).length} 条):`);
    for (const m of (d.minor || [])) console.log(`    - [${m.type}] "${m.original}" → "${m.correction}"`);
    const missing = checkOriginals(transcriptA, [...(d.priority || []), ...(d.minor || [])]);
    console.log(missing.length ? missing.join("\n") : "  original 全部可在原文定位: OK");
    console.log(`  结果: ${(d.priority || []).length > 0 ? "PASS (抓到了问题)" : "注意：priority 为空"}\n`);
  } catch (e) {
    console.error("  ERROR:", e.message, "\n");
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 测试 (b)：长文本 ≥600 词，同一时态错重复 3 处 → 两遍（检出+编辑）
// ═══════════════════════════════════════════════════════════════════════
console.log("【测试 (b)】长文本 ≥600 词，重复错误 → 应走两遍（检出分块 → 编辑）");
const transcriptB = `
So today I want to talk about my weekend trip to the countryside with my family. On Saturday morning, we get up very early, like around six o'clock, because we want to avoid the traffic jam on the highway. My father he drive the car and my mother she sit in the front seat, and me and my sister we sit in the back. The journey take about three hours, which is longer than we expected, but the scenery along the way was really beautiful, so we didn't mind too much.

When we arrived at the village, the air was so fresh, totally different from the city. We stayed at a small guesthouse that my father book online last month. The owner is a very kind old lady, she cook us a big lunch with a lot of local vegetables and a chicken that she raised herself. Everything taste amazing, especially the soup, I never tasted something so delicious before.

In the afternoon, we go hiking on a small mountain near the village. The path was not too difficult, but there were a lot of stones so we need to be careful. My sister she fall down once but luckily she was okay, just a small scratch on her knee. From the top of the mountain, we can see the whole village and the river, it was a really amazing view, I take a lot of photos with my phone.

In the evening, we sit outside the guesthouse and watch the stars, because in the city we almost never see stars due to the light pollution. My father he tell us some stories about when he was young and lived in a village like this. It make me think about how different our life is now compared to before.

On Sunday, we get up again very early to catch the sunrise. Unfortunately it was a bit cloudy so we didn't see a very clear sunrise, but the sky still turn a beautiful orange color. After breakfast, we say goodbye to the owner and drive back to the city. On the way back, I was thinking that I definitely want to go back to countryside again sometimes, maybe next time we can stay longer, like a whole week instead of just two days. Overall it was a very meaningful trip and it remind me that sometimes we need to slow down and enjoy nature more, instead of always being busy in the city with work and study every single day.
`.trim();
const wcB = transcriptB.split(/\s+/).filter(Boolean).length;
console.log(`  词数: ${wcB}（${wcB > 350 ? "＞350 走两遍" : "应走单遍，异常"}）`);
{
  const chunks = splitIntoChunks(transcriptB);
  const n = chunks.length;
  console.log(`  分块数: ${n}（各块词数: ${chunks.map((c) => c.split(/\s+/).filter(Boolean).length).join(", ")}）`);

  const detectResults = await Promise.all(chunks.map(async (chunk, idx) => {
    const i = idx + 1;
    const sys = REVIEW_V2_DETECT_SYSTEM.replace("{i}", String(i)).replace("{n}", String(n));
    const tpl = REVIEW_V2_DETECT_TEMPLATE.replace("{i}", String(i)).replace("{n}", String(n)).replace("{chunk}", chunk);
    const messages = [{ role: "system", content: sys }, { role: "user", content: tpl }];
    const { content, finish, elapsed } = await chatWithFallback(messages, { maxTokens: 2048, retryTokens: 4096 });
    console.log(`\n  ──── 第${i}/${n}段 检出 原始 JSON ──── (耗时 ${elapsed}ms, finish=${finish})`);
    console.log(content);
    const d = extractJson(content);
    return {
      strengths: Array.isArray(d.strengths) ? d.strengths : [],
      findings: (Array.isArray(d.findings) ? d.findings : []).filter((f) => f && f.original && f.correction && f.type && f.why),
    };
  }));

  const allFindings = [], allStrengths = [];
  for (const r of detectResults) { allFindings.push(...r.findings); allStrengths.push(...r.strengths); }
  console.log(`\n  检出合计: ${allFindings.length} 条 findings, ${allStrengths.length} 条 strengths`);

  const findingsBlock = allFindings.map((f) => `- [${f.type}] ${f.original} → ${f.correction}（${f.why}）`).join("\n")
    + (allStrengths.length ? `\n亮点候选：${allStrengths.join("；")}` : "");

  const userMsg = REVIEW_V2_EDIT_TEMPLATE
    .replace("{transcript}", transcriptB)
    .replace("{context_block}", "")
    .replace("{mistakes_block}", "")
    .replace("{findings_block}", findingsBlock);
  const messages = [{ role: "system", content: REVIEW_V2_EDIT_SYSTEM }, { role: "user", content: userMsg }];
  try {
    const { content, finish, elapsed } = await chatWithFallback(messages, { maxTokens: 4096, retryTokens: 8192 });
    console.log(`\n  ──── 编辑遍 原始 JSON 全文 (b) ──── (耗时 ${elapsed}ms, finish=${finish})`);
    console.log(content);
    const d = extractJson(content);
    console.log(`\n  ──── 解析结果 ────`);
    console.log(`  topic: ${d.topic}`);
    console.log(`  overall: ${d.overall}`);
    console.log(`  segments (${(d.segments || []).length}):`, JSON.stringify(d.segments || []));
    console.log(`  priority (${(d.priority || []).length} 条):`);
    for (const p of (d.priority || [])) console.log(`    - [${p.type}] "${p.original}" → "${p.correction}" (count=${p.count}, seg=${p.seg}, repeatOf=${p.repeatOf})`);
    console.log(`  minor (${(d.minor || []).length} 条):`);
    for (const m of (d.minor || [])) console.log(`    - [${m.type}] "${m.original}" → "${m.correction}" (count=${m.count}, seg=${m.seg})`);
    const missing = checkOriginals(transcriptB, [...(d.priority || []), ...(d.minor || [])]);
    console.log(missing.length ? missing.join("\n") : "  original 全部可在原文定位: OK");
    const hasCountGe2 = [...(d.priority || []), ...(d.minor || [])].some((it) => (it.count || 1) >= 2);
    const segOk = (d.segments || []).length >= 2 && (d.segments || []).length <= 6;
    console.log(`  合并验证 (至少一条 count≥2): ${hasCountGe2 ? "PASS" : "FAIL"}`);
    console.log(`  segments 2-6 个: ${segOk ? "PASS" : "FAIL"} (实际 ${(d.segments || []).length} 个)`);
  } catch (e) {
    console.error("  ERROR:", e.message, "\n");
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 测试 (c)：伪造错题清单 M1…M3，一条与文中错误同知识点 → repeatOf 命中
// ═══════════════════════════════════════════════════════════════════════
console.log("\n【测试 (c)】伪造错题清单，验证 repeatOf 是否命中");
const transcriptC = `Yesterday I go to my friend's house and we watch a movie together. It was a very interesting movie about space travel. I very like the special effects in that movie.`;
const fakeMistakes = [
  { original: "I go to", correction: "I went to", type: "grammar" },      // M1：应与文中 "I go to" 命中
  { original: "make a decision", correction: "make a decision", type: "collocation" }, // M2：不相关
  { original: "look forward to", correction: "look forward to", type: "wordchoice" },  // M3：不相关
];
{
  const mistakesBlock = buildMistakesBlock(fakeMistakes);
  console.log(`  近期错题清单:\n${mistakesBlock}\n`);
  const userMsg = REVIEW_V2_SINGLE_TEMPLATE
    .replace("{transcript}", transcriptC)
    .replace("{context_block}", "")
    .replace("{mistakes_block}", mistakesBlock);
  const messages = [{ role: "system", content: REVIEW_V2_SINGLE_SYSTEM }, { role: "user", content: userMsg }];
  try {
    const { content, finish, elapsed } = await chatWithFallback(messages, { maxTokens: 3072, retryTokens: 6144 });
    console.log(`  耗时: ${elapsed}ms  finish: ${finish}`);
    console.log(`\n  ──── 原始 JSON 全文 (c) ────`);
    console.log(content);
    const d = extractJson(content);
    console.log(`\n  ──── 解析结果 ────`);
    console.log(`  priority (${(d.priority || []).length} 条):`);
    for (const p of (d.priority || [])) console.log(`    - [${p.type}] "${p.original}" → "${p.correction}" (repeatOf=${p.repeatOf})  why: ${p.why}`);
    console.log(`  minor (${(d.minor || []).length} 条):`);
    for (const m of (d.minor || [])) console.log(`    - [${m.type}] "${m.original}" → "${m.correction}" (repeatOf=${m.repeatOf})`);
    const hit = [...(d.priority || []), ...(d.minor || [])].some((it) => it.repeatOf === "M1");
    console.log(`  repeatOf="M1" 命中("I go to"同知识点): ${hit ? "PASS" : "FAIL/未命中（模型判断可能有出入，属正常波动）"}`);
  } catch (e) {
    console.error("  ERROR:", e.message, "\n");
  }
}

console.log("\n=== 自测完成 ===");
