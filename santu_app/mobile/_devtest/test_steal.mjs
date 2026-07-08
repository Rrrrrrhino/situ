/**
 * test_steal.mjs — 阶段10 Step2 stealFromDialog 自测
 * 直接 import 真实 js/core/llm.js 的 stealFromDialog（走真实 _loadReviewConfig →
 * settingsGet，用 fake-indexeddb 注入 .env 里的 DeepSeek key），对真实 DeepSeek 跑一组
 * 8-10 turn 的中式英语学习者 vs 地道 AI 对话，贴原始 JSON。
 * 运行：node _devtest/test_steal.mjs（在 mobile/ 目录下）
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { IDBFactory } from "fake-indexeddb";

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

// ── 用 fake-indexeddb 注入设置，让 llm.js 的 _loadReviewConfig 读到真实 key ──
globalThis.indexedDB = new IDBFactory();

const { setIDBFactory, openDB, settingsPut } = await import("../js/core/store.js");
setIDBFactory(new IDBFactory());
await openDB();
await settingsPut("provider", PROVIDER);
await settingsPut("api_key", API_KEY);
if (MODEL) await settingsPut("model", MODEL);
// review_provider/review_api_key/review_model/review_base_url 全留空 → _loadReviewConfig 跟随主配置

const { stealFromDialog, STEAL_SYSTEM, STEAL_TEMPLATE } = await import("../js/core/llm.js");

console.log(`\n=== 四土 阶段10 stealFromDialog 自测 ===`);
console.log(`Provider: ${PROVIDER}, Model: ${MODEL || "(默认，会自动读 provider 默认)"}, Key: ...${API_KEY.slice(-6)}\n`);

console.log("── STEAL_SYSTEM（来自 llm.js 真实导出，非另抄）──");
console.log(STEAL_SYSTEM.slice(0, 80) + "…\n");

// ═══════════════════════════════════════════════════════════════════
// 测试对话：8-10 turn 中式英语学习者 vs 地道 AI 对话者
// 故意设计：学习者水平不错但有几处直译中文腔；AI 说了几个值得偷学的地道表达
// （as far as I'm concerned / it really depends on / I couldn't agree more /
//  at the end of the day 等），也混入一句"AI 话太少不该硬凑"的边界感（最后一轮很短）。
// ═══════════════════════════════════════════════════════════════════
const dialog = [
  { speaker: "me", text: "I think work life balance is very important for young people in China." },
  { speaker: "ai", text: "I couldn't agree more. Honestly, at the end of the day, if you're burnt out all the time, your work quality suffers anyway." },
  { speaker: "me", text: "Yes, but many company think if you work more hours, you will have more achievement." },
  { speaker: "ai", text: "That's a pretty common misconception. It really depends on the industry, but in general, longer hours don't necessarily translate into better output." },
  { speaker: "me", text: "So what do you think is the best way to balance it?" },
  { speaker: "ai", text: "As far as I'm concerned, setting clear boundaries is key — like not checking emails after a certain hour. It sounds simple, but it makes a world of difference." },
  { speaker: "me", text: "I also think we need more holiday, because Chinese people work too much I feel." },
  { speaker: "ai", text: "Yeah, for what it's worth, a lot of Western countries do have more statutory leave. But culture plays a huge role too." },
  { speaker: "me", text: "Do you think remote work can help this problem?" },
  { speaker: "ai", text: "To some extent, yes." },
];

console.log("── 测试对话 dialog（8-10 turn）──");
dialog.forEach((t) => console.log(`  ${t.speaker === "me" ? "我" : "对方"}: ${t.text}`));
console.log("");

console.log("【测试】stealFromDialog 对真实 DeepSeek 跑一组\n");
try {
  const t0 = Date.now();
  const res = await stealFromDialog({ dialog });
  const elapsed = Date.now() - t0;
  console.log(`耗时: ${elapsed}ms\n`);
  console.log("=== 原始返回（完整 JSON）===");
  console.log(JSON.stringify(res, null, 2));
  console.log("");

  if (!res.ok) {
    console.error("FAIL: ok=false, error=" + res.error);
    process.exit(1);
  }

  console.log("=== 人工核验要点 ===");
  console.log(`steals 条数: ${res.steals.length}（挑选标准要求 2-4 条，宁缺毋滥）`);
  res.steals.forEach((s, i) => {
    console.log(`\n  [${i + 1}] expression: ${s.expression}`);
    console.log(`      quote:      ${s.quote}`);
    console.log(`      why:        ${s.why}`);
    console.log(`      example:    ${s.example}`);
  });

  const inRange = res.steals.length >= 0 && res.steals.length <= 4;
  console.log(`\n结果: ${inRange ? "PASS（条数在容许范围内，需人工核验质量见下）" : "FAIL"}`);
} catch (e) {
  console.error("ERROR:", e.message);
  process.exit(1);
}

// ═══════════════════════════════════════════════════════════════════
// 边界测试：对方 turns 全为空 → 不调 LLM，直接返回空数组
// ═══════════════════════════════════════════════════════════════════
console.log("\n\n【边界测试】对方 turns 全为空 → 应不调 LLM，直接返回 steals:[]");
{
  const onlyMe = [
    { speaker: "me", text: "I only recorded myself, no AI response." },
  ];
  const res2 = await stealFromDialog({ dialog: onlyMe });
  console.log(JSON.stringify(res2));
  const ok = res2.ok === true && Array.isArray(res2.steals) && res2.steals.length === 0;
  console.log(`结果: ${ok ? "PASS" : "FAIL"}`);
}

console.log("\n=== 自测完成 ===");
