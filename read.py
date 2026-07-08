#!/usr/bin/env python3
"""三土 CLI — 把英文文章/书生成带生词高亮的自包含 HTML。

讲解是 app 里点词即时生成的；CLI 默认只做词汇分层 + 高亮。
可加 --explain N 预先讲解最高频的 N 个生词（会调用 LLM）。

用法:
    ./read.py <URL 或 文件路径> [--level cet4|cet6|cet4-6] [--explain N] [--theme blue|indigo|teal|terracotta] [--open]
"""
from __future__ import annotations
import argparse
import json
import sys
import webbrowser
from pathlib import Path

from reader_core import (
    extract_text, VocabClassifier, WordExplainer,
    vocab_list, render_full_html, THEMES, DEFAULT_THEME,
)


def _safe_filename(s: str) -> str:
    import re
    s = re.sub(r"[/\\:*?\"<>|]", "_", s).strip()
    return s[:80] or "article"


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="把英文文章/书生成带生词高亮的 HTML")
    p.add_argument("source", help="URL / 本地路径（.epub / .txt / .html）")
    p.add_argument("--level", default="cet4-6", choices=["cet4", "cet6", "cet4-6"])
    p.add_argument("--explain", type=int, default=0, metavar="N",
                   help="预先讲解最高频的 N 个生词（调用 LLM，默认 0=不调）")
    p.add_argument("--theme", default=DEFAULT_THEME, choices=list(THEMES.keys()))
    p.add_argument("--out", default=None)
    p.add_argument("--open", dest="open_browser", action="store_true")
    args = p.parse_args(argv)

    print(f"[1/3] 抽取正文：{args.source}")
    article = extract_text(args.source)
    print(f"      标题：{article.title}　段落：{len(article.blocks)}")

    print(f"[2/3] 词汇分层（基线 = {args.level}）")
    classifier = VocabClassifier(user_level=args.level)
    report = classifier.analyze(article)
    print(f"      共 {report.total_tokens} 词，标记 {len(report.hits)} 个生词")

    explanations: dict[str, dict] = {}
    if args.explain > 0:
        explainer = WordExplainer()
        if not explainer.enabled:
            print("      ⚠️ 未配置 LLM，跳过讲解")
        else:
            hits = classifier.sorted_hits(report)[: args.explain]
            print(f"      讲解最高频 {len(hits)} 个生词（{explainer.provider}）…")
            for h in hits:
                exp = explainer.explain(
                    word=sorted(h.surface_forms)[0] if h.surface_forms else h.lemma,
                    lemma=h.lemma, sentence=h.example_sentence, title=article.title,
                )
                if exp.ok:
                    explanations[h.lemma] = exp.to_dict()

    out_path = Path(args.out) if args.out else Path(__file__).parent / "output" / f"{_safe_filename(article.title)}.html"
    print(f"[3/3] 渲染 HTML → {out_path}")
    render_full_html(article.title, article.source, report, classifier, out_path,
                     explanations=explanations, theme=args.theme)

    json_path = out_path.with_suffix(".vocab.json")
    json_path.write_text(json.dumps({
        "title": article.title, "source": article.source,
        "total_tokens": report.total_tokens,
        "vocab": vocab_list(report, classifier),
        "explanations": explanations,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"      生词本 JSON → {json_path}")

    if args.open_browser:
        webbrowser.open(out_path.resolve().as_uri())
    return 0


if __name__ == "__main__":
    sys.exit(main())
