/**
 * classify-test.node.mjs — Node 端自测
 *
 * 跑法：
 *   cd /Users/yizhang/Documents/situ/santu_app/mobile
 *   node _devtest/classify-test.node.mjs
 *
 * 验证：
 *   1. token 流（surface|lemma|pos|kind）抽样
 *   2. 被 flag 的生词清单
 *   3. ~3000 词长文 tokenize+classify 耗时
 */

import { createRequire } from "module";
import { fileURLToPath } from "url";
import { resolve, dirname } from "path";
import { readFileSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MOBILE_DIR = resolve(__dirname, "..");

// ── 加载 wink（Node CommonJS require）─────────────────────────────────────
const require = createRequire(import.meta.url);
const winkNLP = require("wink-nlp");
const winkModel = require("wink-eng-lite-web-model");

// ── 词表（直接读文件，不走 fetch）─────────────────────────────────────────
const WORDLISTS_PATH = resolve(MOBILE_DIR, "data/wordlists.json");
let _wordlistsCache = null;
function getWordlists() {
  if (!_wordlistsCache) {
    const raw = readFileSync(WORDLISTS_PATH, "utf-8");
    const data = JSON.parse(raw);
    _wordlistsCache = {
      cet4: new Set(data.cet4),
      cet6: new Set(data.cet6),
      freq: new Map(Object.entries(data.subtlex).map(([w, r]) => [w, Number(r)])),
    };
  }
  return _wordlistsCache;
}

// ── 分层常量（与 classifier.js 完全一致）──────────────────────────────────
const COMMON_RANK_CUTOFF = 8000;
const LEVELS = {
  "cet4":   { known_rank: 4000 },
  "cet4-6": { known_rank: 5500 },
  "cet6":   { known_rank: 6500 },
  "kaoyan": { known_rank: 9000 },
  "ielts":  { known_rank: 13000 },
  "toefl":  { known_rank: 18000 },
};
const DEFAULT_LEVEL = "cet4-6";

const _STOPWORDS = new Set([
  "a","an","the","and","or","but","if","of","at","by","for","with","about","against",
  "between","into","through","during","before","after","above","below","to","from",
  "up","down","in","out","on","off","over","under","again","further","then","once",
  "here","there","when","where","why","how","all","any","both","each","few","more",
  "most","other","some","such","no","nor","not","only","own","same","so","than","too",
  "very","s","t","can","will","just","don","should","now","i","me","my","myself","we",
  "our","ours","ourselves","you","your","yours","yourself","yourselves","he","him","his",
  "himself","she","her","hers","herself","it","its","itself","they","them","their",
  "theirs","themselves","what","which","who","whom","this","that","these","those","am",
  "is","are","was","were","be","been","being","have","has","had","having","do","does",
  "did","doing","would","could","should","ought","may","might","must","shall",
]);
const _WORD_RE = /^[a-z]+(?:-[a-z]+)*$/;

function _spellingVariants(w) {
  const out = [w];
  if (w.endsWith("or") && !["ator","ctor","ssor","tor"].some(s => w.endsWith(s))) out.push(w.slice(0,-2)+"our");
  if (w.endsWith("our"))   out.push(w.slice(0,-3)+"or");
  if (w.endsWith("ize"))   out.push(w.slice(0,-3)+"ise");
  if (w.endsWith("ise"))   out.push(w.slice(0,-3)+"ize");
  if (w.endsWith("ization"))  out.push(w.slice(0,-7)+"isation");
  if (w.endsWith("isation"))  out.push(w.slice(0,-7)+"ization");
  if (w.endsWith("ter"))   out.push(w.slice(0,-2)+"re");
  if (w.endsWith("tre"))   out.push(w.slice(0,-2)+"er");
  if (w.endsWith("log"))   out.push(w+"ue");
  if (w.endsWith("logue")) out.push(w.slice(0,-2));
  return out;
}

function _tierFor(rank) {
  if (rank != null && rank >= COMMON_RANK_CUTOFF) return "rare";
  return "common";
}

function _freqBand(rank) {
  if (rank == null) return null;
  if (rank <= 3000)  return { label: "A", name: "最常用" };
  if (rank <= 8000)  return { label: "B", name: "常用" };
  if (rank <= 15000) return { label: "C", name: "较常用" };
  if (rank <= 30000) return { label: "D", name: "进阶" };
  return { label: "E", name: "生僻" };
}

// ── wink 实例 ──────────────────────────────────────────────────────────────
const nlp = winkNLP(winkModel);
const its = nlp.its;

/**
 * 分析文本，返回句子数组。
 * 逐字对照 nlp.js 的修正逻辑（使用 precedingSpaces 重建 ws）。
 */
function analyzeText(text) {
  const doc = nlp.readDoc(text);

  // 收集全部 token 数据
  const tokenData = [];
  doc.tokens().each((tok) => {
    const type = tok.out(its.type);
    tokenData.push({
      text: tok.out(),
      lemma: (tok.out(its.lemma) || tok.out()).toLowerCase(),
      pos: tok.out(its.pos) || "X",
      is_punct: type === "punctuation",
      like_num: type === "number",
      is_space: type === "space",
      _pre: tok.out(its.precedingSpaces) || "",
    });
  });

  // ws[i] = tokenData[i+1]._pre
  for (let i = 0; i < tokenData.length; i++) {
    tokenData[i].ws = i + 1 < tokenData.length ? tokenData[i + 1]._pre : "";
  }

  // 按句子分组（顺序累积匹配）
  const sentences = [];
  let tokenIdx = 0;
  doc.sentences().each((sent) => {
    const sentText = sent.out();
    const sentTokens = [];
    let accumulated = "";
    while (tokenIdx < tokenData.length) {
      const tok = tokenData[tokenIdx];
      sentTokens.push(tok);
      tokenIdx++;
      accumulated += tok.text + tok.ws;
      if (accumulated.trimEnd() === sentText.trimEnd()) break;
      if (tokenIdx >= tokenData.length) break;
    }
    sentences.push({ text: sentText, tokens: sentTokens });
  });

  return sentences;
}

/**
 * 完整分类（tokenize + classify），返回 { renderBlock, hits, total_tokens }
 */
function classifyText(text, userLevel = DEFAULT_LEVEL) {
  const { cet4, cet6, freq } = getWordlists();
  const cfg = LEVELS[userLevel] || LEVELS[DEFAULT_LEVEL];
  const knownRank = cfg.known_rank;
  const includeCet6 = knownRank >= LEVELS["cet6"].known_rank;

  function classifyLemma(lemma) {
    for (const v of _spellingVariants(lemma)) {
      if (cet4.has(v)) return "cet4";
      if (cet6.has(v)) return "cet6";
    }
    return "beyond";
  }
  function isFlag(lemma, rank) {
    for (const v of _spellingVariants(lemma)) {
      if (cet4.has(v)) return false;
      if (includeCet6 && cet6.has(v)) return false;
    }
    if (rank != null && rank <= knownRank) return false;
    return true;
  }

  const sentences = analyzeText(text);
  const hits = new Map();
  let totalTokens = 0;

  const renderBlock = { type: "p", tokens: [], sentences: [] };
  for (const sent of sentences) {
    renderBlock.sentences.push(sent.text.trim());
    const sentTokens = [];
    for (const tok of sent.tokens) {
      if (tok.is_space) continue;
      const { text: surface, lemma, ws, pos } = tok;
      if (!_WORD_RE.test(lemma) || tok.is_punct || tok.like_num) {
        sentTokens.push({ text: surface, ws, kind: "punct" });
        continue;
      }
      totalTokens++;
      const rank = freq.get(lemma) ?? null;
      // surface 兜底查停用词（wink 偶尔误还原功能词，如 through→thru）
      if (_STOPWORDS.has(lemma) || _STOPWORDS.has(surface.toLowerCase()) || lemma.length <= 2) {
        sentTokens.push({ text: surface, ws, kind: "stop", lemma, pos, rank });
        continue;
      }
      if (pos === "PROPN") {
        sentTokens.push({ text: surface, ws, kind: "propn", lemma, pos, rank });
        continue;
      }
      const level = classifyLemma(lemma);
      const flagged = isFlag(lemma, rank);
      if (flagged) {
        if (!hits.has(lemma)) {
          hits.set(lemma, { lemma, count: 0, level, daily_rank: rank, example_sentence: sent.text });
        }
        const h = hits.get(lemma);
        h.count++;
        sentTokens.push({ text: surface, ws, kind: "flag", lemma, level, pos, rank, freq: _tierFor(rank) });
      } else {
        sentTokens.push({ text: surface, ws, kind: "known", lemma, level, pos, rank });
      }
    }
    renderBlock.tokens.push(sentTokens);
  }

  return { renderBlock, hits, total_tokens: totalTokens };
}

// ── 样例文本 ───────────────────────────────────────────────────────────────
const SAMPLE_SHORT = `The children were running faster than the mice. London's museums fascinated Dr. Smith, who studied better techniques. She didn't realize the implications of these analyses—they'd grown complicated. The phenomenon of cognitive dissonance manifests in peculiar ways. Photosynthesis allows plants to convert sunlight into glucose through a sophisticated biochemical process. Unprecedented economic volatility has exacerbated inequalities across demographics.`;

const SAMPLE_LONG = `In the realm of contemporary linguistics, the study of semantics and pragmatics has undergone a remarkable transformation. Scholars have increasingly recognized that language is not merely a static system of symbols but a dynamic and context-dependent phenomenon. The distinction between what is said and what is communicated—what philosophers of language term "implicature"—has become a central concern of pragmatic theory.

Ferdinand de Saussure's foundational insight that the linguistic sign is arbitrary, that the relationship between the signifier and the signified is conventional rather than natural, opened the door to structuralist analysis. His differentiation between "langue" (the abstract system of language) and "parole" (its concrete manifestations in speech) provided the conceptual vocabulary for decades of subsequent inquiry. Yet Saussure's framework, despite its elegance, was unable to account for the ways in which context, intention, and convention interact to produce meaning in actual communicative situations.

Ludwig Wittgenstein's later philosophy, particularly his notion of "language games," represented a significant departure from the view of language as a transparent medium for the expression of pre-linguistic thoughts. His insistence that meaning is use—that to understand a word is to know how it is employed in the practices of a community—anticipated many of the central themes of speech act theory and conversational analysis. Austin's distinction between locutionary, illocutionary, and perlocutionary acts elaborated on this insight by demonstrating that utterances do not merely describe states of affairs but perform social actions: promises, commands, declarations, and assessments.

Grice's cooperative principle and its associated maxims of quantity, quality, relation, and manner provided a framework for understanding how speakers communicate more than they literally say. The phenomenon of conversational implicature—whereby a speaker conveys information that is not semantically encoded in the words uttered—relies on the assumption of rationality and cooperation that underlies human communication. When someone responds to a question about whether they enjoyed a film by saying "The cinematography was impressive," the implicature that they did not find the film altogether satisfying is derived from the expectation of relevance and informativeness.

The emergence of cognitive linguistics in the latter decades of the twentieth century challenged the modular conception of language that had dominated generative grammar. Researchers such as Lakoff and Johnson argued that linguistic structure is not autonomous but is grounded in embodied experience and conceptual metaphor. Their analysis of spatial metaphors in abstract domains—we speak of arguments as "battles," of time as a "resource," of emotional states as "locations"—suggested that cognition and language are deeply intertwined, that the conceptual structures through which we understand the world are reflected in the grammatical and lexical patterns of natural languages.

Corpus linguistics has provided empirical grounding for many of these theoretical insights. By analyzing large collections of authentic language data, researchers have been able to identify patterns of usage that challenge idealized grammatical descriptions. The distinction between competence and performance, which generative linguists invoked to exclude usage data from theoretical consideration, has been called into question by corpus-based evidence that speakers' intuitions about grammaticality do not always align with their actual linguistic behavior. Frequency of exposure shapes our intuitions, our productive patterns, and our expectations about what counts as natural and felicitous expression.

Sociolinguistics has further complicated the picture by demonstrating that linguistic variation is not random but is systematically correlated with social factors: gender, age, ethnicity, class, and regional affiliation all influence the phonological, morphological, and syntactic choices that speakers make. Labov's pioneering studies of sound change in New York and on Martha's Vineyard revealed that linguistic change is not a gradual and uniform drift but is shaped by the social meanings that speakers attach to particular linguistic variants. The spread of an innovation through a speech community is conditioned by patterns of social interaction, prestige, and identity.

Critical discourse analysis has extended these sociolinguistic concerns to the analysis of power and ideology in language. Drawing on the work of Foucault, Althusser, and Gramsci, critical discourse analysts argue that language not only reflects but actively constructs and reproduces social hierarchies, normative expectations, and ideological assumptions. The ostensibly neutral vocabulary of bureaucratic and technical discourse often conceals or naturalizes relations of domination and exclusion. Analyzing the presuppositions, implicatures, and framing devices embedded in texts can reveal the ideological work that language performs in the reproduction of social order.

Translation theory occupies a peculiar position at the intersection of linguistics, literary studies, and philosophy. The fundamental problem of translation—how to convey the meaning of an utterance in one language through the resources of another—raises profound questions about the nature of meaning, the relationship between form and content, and the possibility of intercultural communication. Equivalence theories, which seek to define translation in terms of the reproduction of equivalent effects, run up against the difficulty that no two languages carve up conceptual space in exactly the same way. The untranslatability of certain words—the German "Schadenfreude," the Japanese "mono no aware," the Portuguese "saudade"—is often cited as evidence of the irreducible particularity of linguistic and cultural experience.`;

// ── 测试主体 ───────────────────────────────────────────────────────────────

console.log("╔══════════════════════════════════════════════════════════════╗");
console.log("║  四土 classify-test.node.mjs  Node 端自测                   ║");
console.log("╚══════════════════════════════════════════════════════════════╝\n");

// §1 Token 流抽样
console.log("── §1 Token 流抽样（验证 lemma 还原）──────────────────────────");
const shortSents = analyzeText(SAMPLE_SHORT);
const allToks = shortSents.flatMap(s => s.tokens).filter(t => !t.is_space && !t.is_punct);
const interestingToks = allToks.filter(t => t.lemma !== t.text.toLowerCase()).slice(0, 25);
console.log("surface".padEnd(16), "lemma".padEnd(16), "pos");
console.log("─".repeat(44));
for (const t of interestingToks) {
  console.log(t.text.padEnd(16), t.lemma.padEnd(16), t.pos);
}

// 关键词形还原验证
console.log("\n── 关键词形还原验证 ──────────────────────────────────────────");
const checks = {
  "children":    "child",
  "mice":        "mouse",
  "studied":     "study",
  "grown":       "grow",
  "better":      "good",
  "running":     "run",
  "fascinated":  "fascinate",
  "implications":"implication",
  "were":        "be",
};
for (const [surface, expected] of Object.entries(checks)) {
  const found = allToks.find(t => t.text.toLowerCase() === surface);
  const actual = found ? found.lemma : "(not found)";
  const ok = actual === expected ? "✓" : "✗";
  console.log(`  ${ok} ${surface.padEnd(16)} → ${actual.padEnd(16)} (expected: ${expected})`);
}

// §2 短文生词清单
console.log("\n── §2 短文生词（cet4-6 级别，被 flag 的词）───────────────────");
const t0 = Date.now();
const shortResult = classifyText(SAMPLE_SHORT, "cet4-6");
const shortMs = Date.now() - t0;
const sortedHits = Array.from(shortResult.hits.values())
  .sort((a,b) => (a.daily_rank??1e9) - (b.daily_rank??1e9));
console.log(`  total_tokens: ${shortResult.total_tokens}`);
console.log(`  flagged: ${sortedHits.length} words`);
console.log("  " + "word".padEnd(20) + "level".padEnd(8) + "rank".padEnd(8) + "freq_tier".padEnd(10) + "freq_band");
console.log("  " + "─".repeat(60));
for (const h of sortedHits.slice(0, 30)) {
  const band = _freqBand(h.daily_rank);
  console.log(
    " ", h.lemma.padEnd(18),
    h.level.padEnd(8),
    String(h.daily_rank ?? "—").padEnd(8),
    _tierFor(h.daily_rank).padEnd(10),
    band ? `${band.label}(${band.name})` : "—"
  );
}

// §3 长文耗时（~3000 词）
console.log("\n── §3 长文（~3000 词）tokenize+classify 耗时 ─────────────────");
const wordCount = SAMPLE_LONG.split(/\s+/).length;
console.log(`  输入词数（按空格切）: ${wordCount}`);
const t1 = Date.now();
const longResult = classifyText(SAMPLE_LONG, "cet4-6");
const longMs = Date.now() - t1;
console.log(`  tokenize + classify 耗时: ${longMs} ms`);
console.log(`  total_tokens (字母词): ${longResult.total_tokens}`);
console.log(`  flagged 生词: ${longResult.hits.size} 个`);
console.log(`  短文耗时: ${shortMs} ms`);

// §4 _freqBand 验证
console.log("\n── §4 _freqBand 验证（端口自 app.py）────────────────────────");
const bandTests = [[1000,"A"],[5000,"B"],[10000,"C"],[20000,"D"],[40000,"E"],[null,null]];
for (const [rank, expected] of bandTests) {
  const r = _freqBand(rank);
  const actual = r ? r.label : null;
  const ok = actual === expected ? "✓" : "✗";
  console.log(`  ${ok} rank=${String(rank).padEnd(8)} → band=${actual} (expected ${expected})`);
}

// §5 ws 验证（排版空白）
console.log("\n── §5 ws（排版空白）重建验证 ─────────────────────────────────");
const wsTestSents = analyzeText("Hello  world,  nice day.");
const wsToks = wsTestSents[0]?.tokens || [];
console.log("  token → ws (raw)");
for (const t of wsToks) {
  console.log(`  ${JSON.stringify(t.text).padEnd(12)} → ws=${JSON.stringify(t.ws)}`);
}
const reconstructed = wsToks.map(t => t.text + t.ws).join("");
console.log(`  重建: ${JSON.stringify(reconstructed)} (原文: "Hello  world,  nice day.")`);

// §6 功能词不被 flag 验证（修复 through→thru 误标 bug）
console.log("\n── §6 功能词 surface 兜底验证（through/into/over 不得被 flag）──");
const FUNC_WORD_TEXT = "The students walked through the forest, into a clearing, and over a bridge, where they sat down to study.";
const funcResult = classifyText(FUNC_WORD_TEXT, "cet4-6");
const flaggedLemmas = Array.from(funcResult.hits.keys());
const funcWordsToCheck = ["through", "into", "over", "down", "where", "they", "and"];
let funcPassed = true;
for (const w of funcWordsToCheck) {
  const wronglyFlagged = flaggedLemmas.some(l => l === w || l === w.toLowerCase());
  const ok = wronglyFlagged ? "✗" : "✓";
  if (wronglyFlagged) funcPassed = false;
  console.log(`  ${ok} "${w}" 不在生词列表 ${wronglyFlagged ? "(误标！)" : ""}`);
}
console.log(`  全部 flagged 词: [${flaggedLemmas.join(", ")}]`);
console.log(`  功能词漏过验证: ${funcPassed ? "全部通过 ✓" : "有误标 ✗"}`);

console.log("\n✓ 自测完成");
