/**
 * test_dualtrack_interleave.mjs — 阶段10 Step1 交织逻辑自测（纯函数，无需网络/DeepSeek）
 * 断言：归并排序正确、相邻同 speaker 合并、时间戳片偏移正确（用伪造带偏移的 utterances 模拟）。
 * 阶段10 追加：串音过滤 filterBleed 单测（spec §3/§6 硬性 fixture）。
 * 运行：node _devtest/test_dualtrack_interleave.mjs（在 mobile/ 目录下）
 */
import { _interleaveDualtrack, filterBleed } from "../js/core/localapi.js";

let passed = 0, failed = 0;
function ok(label, cond, actual) {
  if (cond) { console.log(`  ✓ ${label}`); passed++; }
  else { console.error(`  ✗ ${label}  actual=${JSON.stringify(actual)}`); failed++; }
}

console.log("\n── 基本归并排序 + speaker 标注 ──");
{
  const me = [{ text: "Hello", start: 0, end: 1000 }];
  const ai = [{ text: "Hi there", start: 500, end: 1500 }];
  const dialog = _interleaveDualtrack(me, ai);
  ok("2 条 turn", dialog.length === 2, dialog);
  ok("第一条是 me（start=0 更早）", dialog[0].speaker === "me" && dialog[0].text === "Hello", dialog[0]);
  ok("第二条是 ai（start=500）", dialog[1].speaker === "ai" && dialog[1].text === "Hi there", dialog[1]);
}

console.log("\n── 相邻同 speaker 合并 ──");
{
  // me 连续两句话，中间夹一句 ai 之前 —— 验证"相邻"是按最终排序后的相邻，不是按轨内原始顺序
  const me = [
    { text: "I went to", start: 0, end: 500 },
    { text: "the store yesterday", start: 600, end: 1200 },
  ];
  const ai = [{ text: "Nice", start: 2000, end: 2300 }];
  const dialog = _interleaveDualtrack(me, ai);
  ok("合并后共 2 条 turn（me 两句合一）", dialog.length === 2, dialog);
  ok("第一条 me 合并了两句", dialog[0].speaker === "me" && dialog[0].text === "I went to the store yesterday", dialog[0]);
  ok("第二条 ai", dialog[1].speaker === "ai" && dialog[1].text === "Nice", dialog[1]);
}

console.log("\n── 交替 speaker 不合并 ──");
{
  const me = [{ text: "A", start: 0, end: 100 }, { text: "C", start: 2000, end: 2100 }];
  const ai = [{ text: "B", start: 1000, end: 1100 }];
  const dialog = _interleaveDualtrack(me, ai);
  ok("3 条 turn（A/B/C 交替不合并）", dialog.length === 3, dialog);
  ok("顺序 me/ai/me", dialog.map((d) => d.speaker).join(",") === "me,ai,me", dialog);
}

console.log("\n── 时间戳片偏移正确性（模拟服务端切片后加偏移的效果）──");
{
  // 模拟：第一片 me utterance start=590000ms（片内），偏移 0；第二片 ai utterance start=5000ms + 600000ms 偏移
  const me = [{ text: "near end of slice 1", start: 590000, end: 595000 }];
  const ai = [{ text: "start of slice 2", start: 5000 + 600000, end: 8000 + 600000 }];
  const dialog = _interleaveDualtrack(me, ai);
  ok("按绝对时间排序：me(590000) 在前", dialog[0].speaker === "me", dialog);
  ok("ai(605000) 在后", dialog[1].speaker === "ai" && dialog[1].text === "start of slice 2", dialog[1]);
}

console.log("\n── 空轨 / 全空文本过滤 ──");
{
  const dialog = _interleaveDualtrack([{ text: "  ", start: 0, end: 100 }], []);
  ok("空白文本被过滤掉，结果为空数组", dialog.length === 0, dialog);
}
{
  const dialog = _interleaveDualtrack([], []);
  ok("两轨都空 → 空数组", dialog.length === 0, dialog);
}

console.log("\n── 串音过滤 filterBleed（spec §3/§6 硬性 fixture，单位：毫秒）──");
{
  // ai 轨：0–5s 说 "The weather is really lovely today"
  const ai = [{ text: "The weather is really lovely today", start: 0, end: 5000 }];
  // me 轨三条：
  // ① 0.2–5.1s 几乎逐字重复 ai 的话（时间重叠 ≥0.5 且 containment ≥0.6，token≥3）→ 必须被丢
  // ② 6–9s 是自己真实的话（与 ai 无重叠）→ 必须存活
  // ③ 2–3s 与 ai 有重叠，但只有 2 个 token（"yeah exactly"），token<3 门槛不满足 → 必须存活
  const me = [
    { text: "the weather is really lovely today", start: 200, end: 5100 },
    { text: "I think so too, let's go out", start: 6000, end: 9000 },
    { text: "yeah exactly", start: 2000, end: 3000 },
  ];

  const { kept, droppedCount } = filterBleed(me, ai);

  ok("丢弃计数 = 1（只有①被判串音）", droppedCount === 1, droppedCount);
  ok("存活 2 条", kept.length === 2, kept);
  ok("①（逐字重复）不在存活列表里",
    !kept.some((u) => u.text === "the weather is really lovely today"), kept);
  ok("②（真实插话）存活", kept.some((u) => u.text === "I think so too, let's go out"), kept);
  ok("③（短插话 token<3）存活", kept.some((u) => u.text === "yeah exactly"), kept);
}

console.log("\n── 串音过滤：完全不重叠 / 空轨 → 全部存活，丢弃数为 0 ──");
{
  const me = [{ text: "totally unrelated sentence here", start: 100000, end: 103000 }];
  const ai = [{ text: "The weather is really lovely today", start: 0, end: 5000 }];
  const { kept, droppedCount } = filterBleed(me, ai);
  ok("无重叠不误杀", droppedCount === 0 && kept.length === 1, { droppedCount, kept });

  const { kept: kept2, droppedCount: dropped2 } = filterBleed(me, []);
  ok("ai 轨为空不误杀", dropped2 === 0 && kept2.length === 1, { dropped2, kept2 });
}

console.log("\n── process_dualtrack 交织前接入串音过滤（集成烟雾测试）──");
{
  const ai = [{ text: "The weather is really lovely today", start: 0, end: 5000 }];
  const me = [
    { text: "the weather is really lovely today", start: 200, end: 5100 },
    { text: "I think so too, let's go out", start: 6000, end: 9000 },
  ];
  const { kept } = filterBleed(me, ai);
  const dialog = _interleaveDualtrack(kept, ai);
  ok("交织结果里没有串音那条", !dialog.some((t) => t.speaker === "me" && t.text.includes("lovely today") && t.text.toLowerCase() === "the weather is really lovely today"), dialog);
  ok("交织结果保留了真实插话", dialog.some((t) => t.speaker === "me" && t.text === "I think so too, let's go out"), dialog);
}

console.log(`\n${passed} 通过，${failed} 失败\n`);
process.exit(failed > 0 ? 1 : 0);
