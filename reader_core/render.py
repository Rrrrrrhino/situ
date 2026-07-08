"""Render the annotated article.

Two entry points:
  - render_article_fragment(report): the <article> HTML fragment (vocab highlighted),
    consumed by the in-app reader which injects it and wires up click-to-explain.
  - render_full_html(...): a standalone, self-contained HTML document for the
    "open in browser" / CLI path, embedding any explanations already fetched.
"""
from __future__ import annotations
import html
from pathlib import Path
from .vocab import VocabReport, WordHit, VocabClassifier

# Color themes — whole-word font color, two daily-frequency tiers (heavier / lighter).
# Default is deep blue per user preference.
THEMES = {
    "blue":        {"label": "深蓝", "common": "#1c5a99", "rare": "#8fb4d6"},
    "indigo":      {"label": "靛蓝", "common": "#39407a", "rare": "#9a9fce"},
    "teal":        {"label": "蓝绿", "common": "#1f6f6b", "rare": "#8ec4bf"},
    "terracotta":  {"label": "赭石", "common": "#a04d1f", "rare": "#cf9b74"},
}
DEFAULT_THEME = "blue"


def _esc(s: str) -> str:
    return html.escape(s or "", quote=True)


# ----------------------------------------------------------- article fragment

_CONTENT_WORD_RE = __import__("re").compile(r"[A-Za-z]")


def render_article_fragment(report: VocabReport) -> str:
    """Return the <article>…</article> HTML.

    Structure lets ANY word be clicked:
      - each sentence is wrapped in <span class="sent" data-sentence="…">
      - auto-detected vocab words → <mark class="vocab" data-word data-lemma
        data-freq (common|rare) data-level data-idx>
      - other content words → <span class="w">word</span>
      - punctuation / whitespace / numbers → raw text
    The clicked word's sentence context is read from the closest .sent.
    """
    # lang="en" so the browser hyphenates the English prose: the page root is
    # lang="zh" (the UI is Chinese), which otherwise disables `hyphens:auto` for
    # the body text and leaves justified lines with huge inter-word gaps.
    parts: list[str] = ['<article lang="en">']
    idx = 0
    for block in report.blocks:
        tag = block.type if block.type in ("h2", "h3", "p") else "p"
        parts.append(f"<{tag}>")
        for si, sent_tokens in enumerate(block.tokens):
            if si > 0 and tag == "p":
                parts.append(" ")
            sent_text = block.sentences[si] if si < len(block.sentences) else ""
            parts.append(f'<span class="sent" data-sentence="{_esc(sent_text)}">')
            for tok in sent_tokens:
                text_esc = _esc(tok["text"])
                ws = _esc(tok.get("ws", ""))
                kind = tok.get("kind")
                if kind == "flag":
                    parts.append(
                        f'<mark class="vocab" data-cat="vocab"'
                        f' data-word="{_esc(tok["text"])}"'
                        f' data-lemma="{_esc(tok["lemma"])}"'
                        f' data-freq="{_esc(tok.get("freq", "rare"))}"'
                        f' data-level="{_esc(tok.get("level", ""))}"'
                        f' data-idx="{idx}">{text_esc}</mark>'
                    )
                    idx += 1
                elif kind in ("known", "stop", "propn") and _CONTENT_WORD_RE.search(tok["text"]):
                    parts.append(f'<span class="w">{text_esc}</span>')
                else:
                    parts.append(text_esc)
                parts.append(ws)
            parts.append("</span>")
        parts.append(f"</{tag}>")
    parts.append("</article>")
    return "".join(parts)


def vocab_list(report: VocabReport, classifier: VocabClassifier) -> list[dict]:
    """Structured vocab data (sorted by daily frequency), for the study panel / export."""
    out: list[dict] = []
    for h in classifier.sorted_hits(report):
        out.append({
            "lemma": h.lemma,
            "level": h.level,
            "daily_rank": h.daily_rank,
            "count": h.count,
            "freq_tier": h.freq_tier,
            "surface_forms": sorted(h.surface_forms),
            "example_sentence": h.example_sentence,
        })
    return out


# ----------------------------------------------------------- standalone HTML (browser/CLI)

def render_full_html(
    title: str,
    source: str,
    report: VocabReport,
    classifier: VocabClassifier,
    out_path: Path,
    explanations: dict[str, dict] | None = None,
    theme: str = DEFAULT_THEME,
) -> Path:
    """Self-contained page for 'open in browser'. Words already explained (passed in
    `explanations`, keyed by lemma) get a hover tooltip; all vocab words are colored."""
    explanations = explanations or {}
    th = THEMES.get(theme, THEMES[DEFAULT_THEME])
    article_html = render_article_fragment(report)
    vlist = vocab_list(report, classifier)

    # Build vocab table rows
    rows = []
    for v in vlist:
        ex = explanations.get(v["lemma"], {})
        gloss = ex.get("contextual") or ex.get("literal") or ""
        level_label = {"cet4": "CET-4", "cet6": "CET-6", "beyond": "CET-6+"}.get(v["level"], v["level"])
        rank = v["daily_rank"] if v["daily_rank"] else "—"
        rows.append(
            f'<tr data-rank="{v["daily_rank"] or 999999}" data-count="{v["count"]}" '
            f'data-level="{v["level"]}" data-freq="{v["freq_tier"]}">'
            f'<td><strong>{_esc(v["lemma"])}</strong></td>'
            f'<td><span class="lvl">{_esc(level_label)}</span></td>'
            f'<td class="rank">{rank}</td>'
            f'<td class="rank">{v["count"]}</td>'
            f'<td>{_esc(gloss)}</td>'
            f'</tr>'
        )

    # Tooltip data for explained words, injected as a JS map
    import json as _json
    tip_map = {lem: {
        "phonetic": ex.get("phonetic", ""), "pos": ex.get("pos", ""),
        "literal": ex.get("literal", ""), "contextual": ex.get("contextual", ""),
        "explanation": ex.get("explanation", ""),
    } for lem, ex in explanations.items()}
    tip_json = _json.dumps(tip_map, ensure_ascii=False)

    css = _FULL_CSS.replace("__COMMON__", th["common"]).replace("__RARE__", th["rare"])
    swatches = "".join(
        f'<button class="sw{" active" if k==theme else ""}" data-theme="{k}" '
        f'style="background:{v["common"]}" title="{v["label"]}"></button>'
        for k, v in THEMES.items()
    )
    theme_css_vars = "".join(
        f'body[data-theme="{k}"] mark.vocab{{color:{v["rare"]}}}'
        f'body[data-theme="{k}"] mark.vocab[data-freq="common"]{{color:{v["common"]}}}'
        for k, v in THEMES.items()
    )

    page = f"""<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><title>{_esc(title)} · 三土</title>
<style>{css}{theme_css_vars}</style></head>
<body data-theme="{theme}">
<div id="tip" class="tip"></div>
<div class="container">
<header>
  <h1>{_esc(title)}</h1>
  <div class="meta">{_esc(source)}　·　{report.total_tokens} 词　·　生词 {len(vlist)} 个</div>
  <div class="themebar">配色：{swatches}</div>
</header>
{article_html}
<section class="study">
  <h2>生词本</h2>
  <div class="desc">按日常出现频率排序。已在 app 里点开过的词带中文释义。</div>
  <table class="vocab-table">
    <thead><tr><th data-sort="rank">词</th><th>层级</th><th data-sort="rank">日常频率</th>
    <th data-sort="count">次数</th><th>释义</th></tr></thead>
    <tbody>{"".join(rows)}</tbody>
  </table>
</section>
</div>
<script>
const TIPS = {tip_json};
const tip = document.getElementById('tip');
function moveTip(e){{const p=14,w=tip.offsetWidth,h=tip.offsetHeight;let x=e.clientX+p,y=e.clientY+p;if(x+w>innerWidth-8)x=e.clientX-w-p;if(y+h>innerHeight-8)y=e.clientY-h-p;tip.style.left=x+'px';tip.style.top=y+'px';}}
document.querySelectorAll('mark.vocab').forEach(m=>{{
  const lem=m.dataset.lemma, t=TIPS[lem];
  if(!t) return;
  m.style.cursor='help';
  m.addEventListener('mouseenter',e=>{{tip.innerHTML=`<div class='w'>${{lem}} <span class='ph'>${{t.phonetic||''}}</span></div>`+(t.contextual?`<div class='c'>${{t.contextual}}</div>`:'')+(t.explanation?`<div class='ex'>${{t.explanation}}</div>`:'');tip.style.display='block';moveTip(e);}});
  m.addEventListener('mousemove',moveTip);
  m.addEventListener('mouseleave',()=>tip.style.display='none');
}});
document.querySelectorAll('.themebar .sw').forEach(b=>b.addEventListener('click',()=>{{
  document.body.dataset.theme=b.dataset.theme;
  document.querySelectorAll('.themebar .sw').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
}}));
</script>
</body></html>"""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(page, encoding="utf-8")
    return out_path


def render_standalone(
    title: str,
    source: str,
    body_html: str,
    out_path: Path,
    explanations: dict[str, dict] | None = None,
    theme: str = DEFAULT_THEME,
) -> Path:
    """Self-contained page built from a reading-area snapshot (body_html), used for
    'export' and for sharing. Words present in `explanations` (keyed by lemma) get a
    hover tooltip; 🔊 plays real-person audio. Works without a live report."""
    explanations = explanations or {}
    th = THEMES.get(theme, THEMES[DEFAULT_THEME])
    import json as _json
    tips = {lem: {"phonetic": ex.get("phonetic", ""), "pos": ex.get("pos", ""),
                  "literal": ex.get("literal", ""), "contextual": ex.get("contextual", ""),
                  "explanation": ex.get("explanation", "")}
            for lem, ex in explanations.items()}
    tip_json = _json.dumps(tips, ensure_ascii=False)
    theme_vars = "".join(
        f'body[data-theme="{k}"] .vocab{{color:{v["rare"]}}}'
        f'body[data-theme="{k}"] .vocab[data-freq="common"]{{color:{v["common"]}}}'
        for k, v in THEMES.items()
    )
    swatches = "".join(
        f'<button class="sw{" active" if k==theme else ""}" data-theme="{k}" '
        f'style="background:{v["common"]}" title="{v["label"]}"></button>'
        for k, v in THEMES.items()
    )
    page = f"""<!doctype html><html lang="zh"><head><meta charset="utf-8">
<title>{_esc(title)} · 三土</title><style>{_STANDALONE_CSS}{theme_vars}</style></head>
<body data-theme="{theme}">
<div id="tip" class="tip"></div>
<div class="container">
  <div class="themebar">配色：{swatches}</div>
  {body_html}
</div>
<script>
const TIPS={tip_json};
const tip=document.getElementById('tip');
function mv(e){{const p=14,w=tip.offsetWidth,h=tip.offsetHeight;let x=e.clientX+p,y=e.clientY+p;if(x+w>innerWidth-8)x=e.clientX-w-p;if(y+h>innerHeight-8)y=e.clientY-h-p;tip.style.left=x+'px';tip.style.top=y+'px';}}
document.querySelectorAll('.vocab').forEach(m=>{{
  const t=TIPS[m.dataset.lemma]; if(!t)return; m.style.cursor='help';
  m.addEventListener('mouseenter',e=>{{tip.innerHTML=`<div class='w'>${{m.dataset.lemma}} <span class='ph'>${{t.phonetic||''}}</span></div>`+(t.contextual?`<div class='c'>${{t.contextual}}</div>`:'')+(t.explanation?`<div class='ex'>${{t.explanation}}</div>`:'');tip.style.display='block';mv(e);}});
  m.addEventListener('mousemove',mv); m.addEventListener('mouseleave',()=>tip.style.display='none');
}});
document.querySelectorAll('.phrase[data-ex]').forEach(p=>{{
  let d={{}}; try{{d=JSON.parse(p.dataset.ex||'{{}}');}}catch(e){{}}
  const body=(d.meaning?`<div class='c'>${{d.meaning}}</div>`:'')+(d.talk?`<div class='ex'>${{(d.talk||'').replace(/\\*\\*/g,'')}}</div>`:'');
  if(!body)return;
  p.addEventListener('mouseenter',e=>{{tip.innerHTML=`<div class='w'>${{p.dataset.phrase||''}}</div>`+body;tip.style.display='block';mv(e);}});
  p.addEventListener('mousemove',mv); p.addEventListener('mouseleave',()=>tip.style.display='none');
}});
let _a=null;
document.querySelectorAll('.say').forEach(b=>b.addEventListener('click',ev=>{{ev.stopPropagation();const w=b.dataset.say;if(!w)return;if(_a)_a.pause();_a=new Audio('https://dict.youdao.com/dictvoice?audio='+encodeURIComponent(w)+'&type=2');_a.play().catch(()=>{{}});}}));
document.querySelectorAll('.themebar .sw').forEach(b=>b.addEventListener('click',()=>{{document.body.dataset.theme=b.dataset.theme;document.querySelectorAll('.themebar .sw').forEach(x=>x.classList.remove('active'));b.classList.add('active');}}));
</script></body></html>"""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(page, encoding="utf-8")
    return out_path


_STANDALONE_CSS = """
:root{--bg:#faf9f5;--fg:#26241f;--muted:#9a968c;--border:#e6e2d8;--accent:#1c5a99}
body[data-theme="blue"]{--accent:#1c5a99}body[data-theme="indigo"]{--accent:#39407a}
body[data-theme="teal"]{--accent:#1f6f6b}body[data-theme="terracotta"]{--accent:#a04d1f}
html,body{margin:0;background:var(--bg);color:var(--fg)}
.container{max-width:720px;margin:0 auto;padding:36px 28px 120px}
.themebar{display:flex;gap:6px;align-items:center;font-size:12px;color:var(--muted);margin-bottom:22px}
.themebar .sw{width:18px;height:18px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px var(--border);cursor:pointer;padding:0}
.themebar .sw.active{box-shadow:0 0 0 2px var(--fg)}
.doc-title{font:600 27px/1.3 -apple-system,"PingFang SC",sans-serif;margin:0 0 6px}
.doc-meta{color:var(--muted);font-size:12px;margin-bottom:28px;font-family:-apple-system,sans-serif}
article{font:17px/1.85 Georgia,"PingFang SC",serif}
article h2{font-size:21px;font-weight:600;margin:1.7em 0 .55em;font-family:-apple-system,sans-serif}
article h3{font-size:17.5px;font-weight:600;color:#3a382f;margin:1.4em 0 .45em;font-family:-apple-system,sans-serif}
article p{margin:0 0 1.15em;text-align:justify}
/* vocab words are <mark>, whose UA default is a loud yellow block — kill it so the
   export matches the in-app reader (soft text-color highlight, no background band). */
.vocab{background:none;color:var(--vr,#7da9d0)}.vocab[data-freq="common"]{color:var(--vc)}
mark.vocab{font-style:normal}
.say{border:none;background:none;cursor:pointer;font-size:13px;opacity:.6;color:var(--accent);
  display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;padding:0}
.say:hover{opacity:1}.say .say-i,.say svg{display:block;width:16px;height:16px}
/* manually highlighted phrases / sentences — same warm amber "marker" as in-app,
   but read-only here (no interactive 讲 handle). Rides the background channel so a
   blue vocab word inside keeps its color. */
.phrase{background:rgba(214,164,82,.30);border-radius:4px;padding:.5px 0;
  -webkit-box-decoration-break:clone;box-decoration-break:clone}
.phrase[data-ex]{cursor:help}
.bookmark{display:flex;align-items:center;gap:10px;margin:22px 0;color:var(--accent);font:500 12px/1 -apple-system,"PingFang SC",sans-serif;user-select:none}
.bookmark::before,.bookmark::after{content:"";flex:1;height:1px;background:var(--accent);opacity:.35}
.bk-mid{display:inline-flex;align-items:center;gap:6px}
.bk-label{white-space:nowrap;padding:3px 11px;border:1px solid var(--accent);border-radius:999px}
.bk-x{display:none}
.tip{position:fixed;display:none;max-width:340px;padding:11px 14px;background:#1c1c1a;color:#f3efe6;font-size:13px;border-radius:8px;box-shadow:0 8px 28px rgba(0,0,0,.3);z-index:9999;pointer-events:none;line-height:1.6}
.tip .w{font-weight:600;color:#fff;margin-bottom:3px}.tip .ph{font-weight:400;color:#9fc4e6;font-size:12px}
.tip .c{color:#ffe;margin-bottom:4px}.tip .ex{color:#c9c2b4;font-size:12px}
"""


_FULL_CSS = """
:root{--bg:#fafaf7;--fg:#2a2a28;--muted:#999;--border:#e3e0d6}
html,body{margin:0;padding:0;background:var(--bg);color:var(--fg);font:17px/1.85 -apple-system,BlinkMacSystemFont,"PingFang SC",Georgia,"Helvetica Neue",serif}
.container{max-width:720px;margin:0 auto;padding:44px 28px 120px}
header h1{font-size:27px;line-height:1.32;margin:0 0 8px;font-weight:600}
header .meta{color:var(--muted);font-size:12px;margin-bottom:14px}
.themebar{font-size:12px;color:var(--muted);display:flex;align-items:center;gap:6px;margin-bottom:26px}
.themebar .sw{width:18px;height:18px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px var(--border);cursor:pointer;padding:0}
.themebar .sw.active{box-shadow:0 0 0 2px var(--fg)}
article h2{font-size:21px;font-weight:600;margin:1.8em 0 .6em;line-height:1.4}
article h3{font-size:17px;font-weight:600;margin:1.5em 0 .5em;color:#444}
article p{margin:0 0 1.15em;text-align:justify;hyphens:auto}
mark.vocab{background:none;color:__RARE__;transition:color .15s}
mark.vocab[data-freq="common"]{color:__COMMON__}
.tip{position:fixed;display:none;max-width:340px;padding:11px 14px;background:#1c1c1a;color:#f3efe6;font-size:13px;border-radius:8px;box-shadow:0 8px 28px rgba(0,0,0,.3);z-index:9999;pointer-events:none;line-height:1.6}
.tip .w{font-weight:600;color:#fff;margin-bottom:3px}
.tip .ph{font-weight:400;color:#9fc4e6;font-size:12px}
.tip .c{color:#ffe;margin-bottom:4px}
.tip .ex{color:#c9c2b4;font-size:12px}
.study{margin-top:72px;border-top:1px solid var(--border);padding-top:30px}
.study h2{font-size:18px;margin:0 0 4px}
.study .desc{color:var(--muted);font-size:12px;margin-bottom:16px}
.study table{width:100%;border-collapse:collapse;font-size:13px}
.study th,.study td{padding:6px 8px;text-align:left;border-bottom:1px solid #eee;vertical-align:top}
.study th{font-weight:500;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.04em;cursor:pointer}
.study .rank{color:var(--muted);font-variant-numeric:tabular-nums;font-size:12px}
.study .lvl{display:inline-block;padding:1px 6px;border-radius:3px;font-size:11px;background:#eef1f5;color:#3a5a7a}
"""
