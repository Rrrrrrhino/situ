/**
 * renderer.js — 端口自 render.py.render_article_fragment
 *
 * 严格对照 §5 HTML 渲染契约，class/data-* 名一个都不改：
 *   .vocab  data-cat data-word data-lemma data-freq data-level data-idx
 *   .w      普通内容词
 *   .sent   data-sentence
 * app.js.onWordTap 依赖这些属性名。
 */

const _CONTENT_WORD_RE = /[A-Za-z]/;

/**
 * 转义 HTML 属性值中的特殊字符（对应 Python html.escape(s, quote=True)）
 */
function _esc(s) {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/**
 * 渲染文章片段，返回 <article>…</article> HTML 字符串。
 *
 * @param {{ blocks: RenderBlock[], hits: Map, total_tokens: number }} report
 *   VocabClassifier.analyze() 的返回值
 * @returns {string}
 *
 * 完全对照 render.py.render_article_fragment 的逻辑：
 *   - block.type → <h2|h3|p>
 *   - 段落里多句之间插一个空格分隔
 *   - 每句包在 <span class="sent" data-sentence="…">
 *   - kind=="flag"  → <mark class="vocab" data-cat="vocab" data-word data-lemma data-freq data-level data-idx>
 *   - kind in {known,stop,propn} 且含字母 → <span class="w">
 *   - 其余（punct/数字/空白）→ 原样转义文本
 *   - 每个 token 后追加 ws（原文空白）
 */
function renderArticleFragment(report) {
  const parts = ["<article>"];
  let idx = 0;

  for (const block of report.blocks) {
    const tag = ["h2", "h3", "p"].includes(block.type) ? block.type : "p";
    parts.push(`<${tag}>`);

    for (let si = 0; si < block.tokens.length; si++) {
      // 段落内多句之间插空格（与 Python 完全一致）
      if (si > 0 && tag === "p") parts.push(" ");

      const sentText = block.sentences[si] || "";
      parts.push(`<span class="sent" data-sentence="${_esc(sentText)}">`);

      const sentTokens = block.tokens[si];
      for (const tok of sentTokens) {
        const textEsc = _esc(tok.text);
        const ws = _esc(tok.ws || "");
        const kind = tok.kind;

        if (kind === "flag") {
          parts.push(
            `<mark class="vocab" data-cat="vocab"` +
            ` data-word="${_esc(tok.text)}"` +
            ` data-lemma="${_esc(tok.lemma)}"` +
            ` data-freq="${_esc(tok.freq || "rare")}"` +
            ` data-level="${_esc(tok.level || "")}"` +
            ` data-idx="${idx}">${textEsc}</mark>`
          );
          idx++;
        } else if (
          ["known", "stop", "propn"].includes(kind) &&
          _CONTENT_WORD_RE.test(tok.text)
        ) {
          parts.push(`<span class="w">${textEsc}</span>`);
        } else {
          // punct / 数字 / 空白 → 原样
          parts.push(textEsc);
        }

        // token 后追加空白（渲染排版关键）
        parts.push(ws);
      }

      parts.push("</span>");
    }

    parts.push(`</${tag}>`);
  }

  parts.push("</article>");
  return parts.join("");
}

export { renderArticleFragment };
