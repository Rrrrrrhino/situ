/**
 * nlp.js — wink-nlp 包装层，对外提供等价于 spaCy 的 token 流
 *
 * 端口目标（来自 vocab.py 的 spaCy 用法）：
 *   analyze(text) → 句子数组，每句含 tokens
 *   每 token：{ text, lemma(小写), pos, is_punct, like_num, is_space, ws }
 *   ws = token 后到下一 token 前的原文空白（渲染器靠它还原排版）
 *
 * ws 重建策略：
 *   wink 没有 whitespace_，但有 its.precedingSpaces（本 token 前的空白）。
 *   ws[i] = precedingSpaces[i+1]（下一 token 的前置空白）。
 *
 * 加载方式：由 esbuild 打包成 core.bundle.js，挂到 window.SituCore。
 */

import winkNLP from "wink-nlp";
import model from "wink-eng-lite-web-model";

let _nlp = null;
let _its = null;

function _getInstance() {
  if (!_nlp) {
    _nlp = winkNLP(model);
    _its = _nlp.its;
  }
  return { nlp: _nlp, its: _its };
}

/**
 * 解析文本，返回句子数组。
 * 每个句子对象：{ text: string, tokens: Token[] }
 * 每个 Token：{ text, lemma, pos, is_punct, like_num, is_space, ws }
 *
 * @param {string} text
 * @returns {Array<{text:string, tokens:Array<{text:string,lemma:string,pos:string,is_punct:boolean,like_num:boolean,is_space:boolean,ws:string}>}>}
 */
function analyze(text) {
  const { nlp, its } = _getInstance();
  const doc = nlp.readDoc(text);

  // 收集全部 token 数据（含 precedingSpaces 用于重建 ws）
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
      // precedingSpaces = 本 token 前的空白
      _pre: tok.out(its.precedingSpaces) || "",
    });
  });

  // ws[i] = tokens[i+1]._pre（即本 token 末到下一 token 起的原文空白）
  for (let i = 0; i < tokenData.length; i++) {
    tokenData[i].ws = i + 1 < tokenData.length ? tokenData[i + 1]._pre : "";
  }

  // 按句子分组：wink sentences() 返回句子文本；
  // 我们用累积索引追踪每句在 tokenData 里的边界
  // wink 不直接给 token→sentence 映射，所以用字符偏移：
  // 把每句的文本在原文里定位，再匹配 token（按顺序累积跑）
  const sentences = [];
  let tokenIdx = 0;

  doc.sentences().each((sent) => {
    const sentText = sent.out();
    // 用文本长度在原文中定位（贪心顺序扫）
    // wink 保证 sentences 顺序与 tokens 顺序一致，直接顺序分配即可
    // 策略：从 tokenIdx 开始，把属于这句的 tokens 取出（直到累计 text+ws 覆盖 sentText）
    const sentTokens = [];
    let accumulated = "";

    while (tokenIdx < tokenData.length) {
      const tok = tokenData[tokenIdx];
      // 尝试把这个 token 加进去
      const candidate = accumulated + tok.text + tok.ws;
      sentTokens.push(tok);
      tokenIdx++;
      accumulated = candidate;
      // 当 accumulated 去掉末尾空白后包含 sentText 时，本句结束
      if (accumulated.trimEnd() === sentText.trimEnd()) break;
      // 防止超出（空格 token 可能在句末）
      if (tokenIdx >= tokenData.length) break;
    }

    sentences.push({ text: sentText, tokens: sentTokens });
  });

  return sentences;
}

/**
 * 对单个词做词形还原。
 * 如果提供了 sentence 上下文，在句子里找最近 match，lemma 更准。
 *
 * @param {string} word
 * @param {string} [sentence]
 * @returns {string}
 */
function lemmatize(word, sentence) {
  const { nlp, its } = _getInstance();
  const surface = (word || "").trim();
  if (!surface) return surface.toLowerCase();

  if (sentence) {
    const doc = nlp.readDoc(sentence);
    let match = null;
    doc.tokens().each((tok) => {
      if (match) return;
      if (tok.out().toLowerCase() === surface.toLowerCase()) {
        match = tok.out(its.lemma);
      }
    });
    if (match) return match.toLowerCase();
  }

  // fallback：直接对单词 readDoc
  const doc = nlp.readDoc(surface);
  let lemma = surface.toLowerCase();
  doc.tokens().each((tok) => {
    lemma = (tok.out(its.lemma) || surface).toLowerCase();
  });
  return lemma;
}

export { analyze, lemmatize };
