"""三土 — desktop reading app (pywebview).

Parse is fast (extraction + vocab layering only). Explanations are fetched on
demand when a word is clicked / navigated to, OR pre-generated in the background
(hybrid mode). Any word is clickable, not just auto-detected vocab. Results are
accumulated into a session notebook exportable to a self-contained HTML page.

Run:  python -m santu_app.app
"""
from __future__ import annotations
import json
import os
import sys
import threading
import time
import uuid
import webbrowser
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import webview

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from reader_core import (  # noqa: E402
    extract_text, extract_book, VocabClassifier, WordExplainer,
    render_article_fragment, vocab_list, render_full_html, render_standalone,
    THEMES, DEFAULT_THEME,
)
from reader_core.userconfig import (  # noqa: E402
    app_support_dir, load_user_config, save_user_config, config_path,
)
from reader_core.llm import PROVIDERS  # noqa: E402


def _writable_root() -> Path:
    """Where to keep user-created data (reading history, audio cache, exports).

    When running from a packaged .app, ROOT lives inside the read-only bundle and
    is wiped on update — so user data goes under Application Support instead. When
    running from source (dev), keep using the project folder unchanged."""
    in_bundle = (".app/Contents/" in str(ROOT)) or getattr(sys, "frozen", False)
    if in_bundle:
        # 数据一直住在 ~/Documents/situ 的机器（本机：dev、.command、手机版 server、
        # Swift 对话录引擎共用这一份），冻结 App 见到它就继续用——否则装正式版第一眼
        # 书架全空，像丢了数据。分发到没有这份目录的机器则照旧走 Application Support。
        legacy = Path.home() / "Documents" / "situ"
        if (legacy / "library").is_dir():
            return legacy
        return app_support_dir()
    return ROOT


DATA_ROOT = _writable_root()
LIBRARY = DATA_ROOT / "library"
BOOKS = DATA_ROOT / "books"       # 持久化用户导入的 epub 原件
COVERS = DATA_ROOT / "covers"     # 从 epub 抽出的封面缩略图缓存（{id}.jpg / {id}.none 兜底哨兵）
AUDIO_DIR = DATA_ROOT / "audio"   # permanent pronunciation cache (tiny mp3s, ~5-15KB each)
OUTPUT_DIR = DATA_ROOT / "output"
VOCAB_DIR = DATA_ROOT / "vocab"   # 跨文档「全局生词本」
PREGEN_DIR = DATA_ROOT / "pregen"  # 按书落盘的讲解预生成缓存（lemma -> 讲解），重启不再重新调 LLM
PREGEN_CACHE_VER = 1
GLOBAL_VOCAB = VOCAB_DIR / "global.json"  # {key: entry}，key = lemma（词）或 "§…"（词块/句）
FEEDS_FILE = DATA_ROOT / "feed_sources.json"  # 读物精选：用户自定义 RSS/Atom 来源（内置源在前端 DISC_OUTLETS，不进这里）
SHEAF = DATA_ROOT / "sheaf"        # 「收获集」后台生成物（仅标记批α）：{doc_id}.json，批β 消费

PREGEN_CAP_BOOK = 12   # 书模式每章最多预热的生词数（最罕见优先），其余点词即时生成

# ──────────────────────────────────────────────────────────────────────────
# 仅标记·收获集 后台生成管线（批α）—— 详见 specs/仅标记-批α-生成管线-施工规格.md
# 「读完即得」是本功能的魔法时刻：读书时只划痕（零 LLM），此处把攒下的划痕批量做成
# 词块归位＋三档分级＋释义＋例句，落 SHEAF/{doc_id}.json 供批β 显影渲染。
# ──────────────────────────────────────────────────────────────────────────
_sheaf_running: set[str] = set()          # 正在跑批的 doc_id，防同 doc 并发多线程重复生成
_sheaf_lock = threading.Lock()            # 只护 _sheaf_running / _sheaf_last_gen 两个模块字典
_sheaf_last_gen: dict[str, float] = {}    # doc_id -> 上次成功起批的墙钟（触发节流用）

SHEAF_BATCH = 10                          # 每次 LLM 请求最多几条 capture（规格 §3.2 ≤10）
SHEAF_TRIGGER_NEW = 6                     # 攒够几条新划痕立刻起批（规格 §3.1）
SHEAF_TRIGGER_SECS = 90                   # 距上次生成超过这么多秒且有新增也起批
SHEAF_MAX_BATCHES = 20                    # 单次后台跑最多几批（20×10=200 条封顶，防失控空转）
SHEAF_MODEL = "deepseek-chat"             # 例句/释义/分档是非推理任务：deepseek-chat(=v4-flash)
#                                            绝不用 v4-pro（慢＋reasoning 吃 max_tokens 坑，见 memory
#                                            reference_v4pro_reasoning_maxtokens_trap）

# 三档 rubric 写死进 prompt（配正反例），档义永久固定——一致性红线全靠这段兜底：
# 同一表达任何时候重跑必须落同档，否则用户两次后就不再信颜色，整套分级作废（总设计决策4）。
SHEAF_SYSTEM = """你是一位资深英语母语语感顾问，专为中国学习者把「值得收藏的英文表达」做成学习卡片。
用户读英文时随手划了一些片段（可能只划中一个词，也可能划了半个词块），你要为每一条：
① 把它「归位」到所在的最完整、最自然的词块／搭配；② 按下面三档 rubric 打一个永久固定的档位；
③ 给一句地道中文释义、一句用法注、几句地道英文例句。

【三档 rubric —— 判据 = 通用度 × 地道度 × 可迁移性，相对通用英语，与用户个人水平无关】
- 一档（高频且地道）：母语者日常口语书面通吃、可迁移场景广。
  正例：take a toll on、stay put。
  反例：不能只因「由常见词组成」就给一档——"three counties away" 根本不是词块，不该收。
- 二档（常用）：常见但语域略窄或频率略低。
  正例：in fits and starts、play the long game。
- 三档（低频／偏文学）：欣赏为主、日常输出可迁移性低。
  正例："a town that time itself seemed to have forgotten"。
【一致性红线】同一表达任何时候都必须落同一档——严格对照上面的正反例来定，不要凭当下语感摇摆。

【词块归位】用户划的可能不准。归位到它所在的最自然词块：
- 只划中 "toll" 且原句是 "took a heavy toll on them" → 归位到 "take a toll on"。
- 用户已经划中完整词块时，chunk 原样返回、不要画蛇添足地扩大。
- 若划中的根本不构成可收藏的表达（如普通专有名词、随意的词串），chunk 照原样返回、档位给三档。

【例句要求】examples 里给 3 句英文例句：地道、典型语境、每句 12–20 词；
绝不要造与原文句雷同的例句；例句要覆盖不同语境，帮助迁移使用。

只输出严格 JSON，不要任何额外文字、不要 markdown 代码围栏。"""


def _sheaf_user_prompt(entries: list[dict]) -> str:
    """把一批 merged capture 拼成用户消息。entries 每条含 idx/text/sentence。"""
    lines = []
    for e in entries:
        sent = (e.get("sentence") or "").strip()
        lines.append(
            f'#{e["idx"]}  划中片段：「{e["text"]}」'
            + (f'\n     原文句：{sent[:400]}' if sent else '\n     （无原文句上下文）')
        )
    body = "\n".join(lines)
    return f"""下面是 {len(entries)} 条用户划下的片段，逐条处理，按 #编号 一一对应。

{body}

请输出严格 JSON 对象，形如：
{{"items": [
  {{
    "idx": 0,                       // 与上面的 #编号 对应，务必回填、不得漏条或改序
    "chunk": "take a toll on",      // 归位后的完整词块；用户已划完整时与原片段相同
    "tier": 1,                       // 1|2|3，严格按 rubric 与正反例
    "def": "对……造成损耗、伤害（长期而渐进的）",   // 中文释义，简洁一句
    "note": "主语常是压力、劳作、岁月；on 后接被磨损的人或物。",   // 中文用法注，≤40字
    "examples": ["English example one …", "English example two …", "English example three …"]
  }}
]}}
每条都必须给 idx/chunk/tier/def/note/examples，examples 恰好 3 句英文。"""


# 档位呈现：标题原档色 + 正文「档色墨」深一阶 + 淡底印刷章（逐字取自样机 :root 与 ③页甲改组）
SHEAF_TIER = {
    1: {"c": "#5f7a58", "ink": "#4f6849", "chipbg": "rgba(95,122,88,.13)", "label": "一档 · 高频且地道"},
    2: {"c": "#b0894a", "ink": "#8a683a", "chipbg": "rgba(176,137,74,.15)", "label": "二档 · 常用"},
    3: {"c": "#8d8271", "ink": "#6b6357", "chipbg": "rgba(141,130,113,.14)", "label": "三档 · 低频 · 偏文学"},
}


def _sheaf_srcref(item: dict) -> str:
    """原文出处小注：书模式=第 N 章；文章模式 blockOrd 含 h1，显示时减 1 = 第 N 段。"""
    ch = item.get("ch")
    if ch is not None:
        return f"原文 · 第 {int(ch) + 1} 章"
    bo = item.get("blockOrd")
    if bo is None or bo < 0:
        return "原文"
    return f"原文 · 第 {max(1, int(bo))} 段"


def _sheaf_bold(sentence: str, chunk: str) -> str:
    """把例句里的核心词块加粗（无高亮底，仅 <b>）。原句常是词形变化过的，故先整块直配、
    配不上就丢首词配尾串再向左吃回一个词（同前端 _shBold 口径）。都配不上原样转义返回。"""
    from html import escape
    import re

    def wrap(s, a, b):
        return escape(s[:a]) + "<b>" + escape(s[a:b]) + "</b>" + escape(s[b:])

    s = sentence or ""
    c = (chunk or "").strip()
    if not c:
        return escape(s)
    i = s.lower().find(c.lower())
    if i >= 0:
        return wrap(s, i, i + len(c))
    words = c.split()
    if len(words) >= 2:
        tail = " ".join(words[1:])
        j = s.lower().find(tail.lower())
        if j >= 0:
            start = j
            m = re.search(r"(\S+\s*)$", s[:j])
            if m:
                start = j - len(m.group(1))
            return wrap(s, start, j + len(tail))
    return escape(s)


def _render_sheaf_standalone(title: str, items: list[dict]) -> str:
    """自包含收获集 HTML（双列·甲改·墨化）。内联全部 CSS，无外链无 JS。"""
    from html import escape
    rows = []
    for it in items:
        tier = it.get("tier") if it.get("tier") in (1, 2, 3) else 2
        sents = it.get("sents") or []
        lis = []
        for j, s in enumerate(sents):
            mark = (f'<span class="srcmark">{escape(_sheaf_srcref(it))}</span>'
                    if s.get("src") else "")
            lis.append(f'<li>{_sheaf_bold(s.get("en", ""), it.get("chunk", ""))}{mark}</li>')
        snap = (f'<div class="snap">你划的是「<b>{escape(it.get("raw", ""))}</b>」—— 已归位到它所在的完整词块</div>'
                if it.get("snapped") else "")
        rows.append(f'''<div class="entry" data-tier="{tier}">
  <div class="ex-col">
    <div class="chunk-line"><span class="chunk">{escape(it.get("chunk", ""))}</span><span class="tier-chip">{escape(SHEAF_TIER[tier]["label"])}</span></div>
    {snap}
    <ul class="sents">{"".join(lis)}</ul>
  </div>
  <div class="def-col"><div class="def">{escape(it.get("def", ""))}</div><div class="note">{escape(it.get("note", ""))}</div></div>
</div>''')
    tier_css = "\n".join(
        f'.entry[data-tier="{t}"] .chunk{{color:{v["c"]}}}'
        f'.entry[data-tier="{t}"] :is(.sents,.sents li,.def,.note){{color:{v["ink"]}}}'
        f'.entry[data-tier="{t}"] .tier-chip{{color:{v["c"]};background:{v["chipbg"]}}}'
        for t, v in SHEAF_TIER.items())
    return f'''<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>收获集 · {escape(title)}</title>
<style>
:root{{--bg:#f7f2e8;--paper:#fffdf7;--fg:#34302a;--muted:#a89c86;--border:#e9e0cd;--accent:#9c7a3e;
--read-font:Georgia,"Songti SC",serif;--han:"PingFang SC",system-ui,sans-serif}}
*{{box-sizing:border-box}}
body{{margin:0;background:var(--bg);color:var(--fg);font:15px/1.6 var(--han);padding:34px 20px 80px}}
.wrap{{max-width:820px;margin:0 auto}}
h1{{font:600 20px/1.4 var(--han);letter-spacing:.04em;margin:0 0 4px}}
.sub{{font:12.5px var(--han);color:var(--muted);margin:0 0 26px}}
.entry{{display:grid;grid-template-columns:1fr 236px;gap:0 22px;background:var(--paper);
border:1px solid var(--border);border-radius:12px;padding:18px 22px 16px;margin-bottom:14px}}
.chunk-line{{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:8px}}
.chunk{{font:600 16.5px/1.4 var(--read-font)}}
.tier-chip{{font:11px var(--han);letter-spacing:.06em;border-radius:5px;padding:2px 8px}}
.snap{{font:12px var(--han);color:var(--muted);margin:-3px 0 8px}}
.snap b{{color:var(--accent);font-weight:600}}
.sents{{margin:0;padding:0;list-style:none;font-family:var(--read-font);font-size:14px;line-height:1.72}}
.sents li{{padding:4px 0;border-bottom:1px dashed var(--border)}}
.sents li:last-child{{border-bottom:none}}
.sents b{{font-weight:700;color:inherit}}
.srcmark{{font:10.5px var(--han);color:var(--muted);margin-left:8px;letter-spacing:.05em}}
.def-col{{font-family:var(--han);border-left:1px solid var(--border);padding-left:20px;align-self:start}}
.def{{font-size:14.5px;line-height:1.8}}
.note{{font-size:12px;line-height:1.8;color:var(--muted);margin-top:8px}}
{tier_css}
@media(max-width:640px){{.entry{{grid-template-columns:1fr}}.def-col{{border-left:none;border-top:1px solid var(--border);
padding-left:0;padding-top:12px;margin-top:10px}}}}
</style></head><body><div class="wrap">
<h1>收获集 · {escape(title)}</h1>
<p class="sub">共 {len(items)} 条 · 四土「仅标记」导出</p>
{"".join(rows)}
</div></body></html>'''

_BROWSER_UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
               "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Safari/605.1.15")

# Read-aloud / pronunciation accent. A single global toggle (英音/美音) the frontend
# passes on every audio request, so it applies uniformly to single words AND the
# full-article reader.
#   • single word → 有道 dictvoice type (1 = 英音 / 2 = 美音) — most reliable.
#   • phrase / sentence / article → MiniMax voice_id (有道 is weak on long text).
# The 英音 narrator is the user-approved baseline; the 美音 voice can be retuned here.
_YOUDAO_TYPE = {"uk": "1", "us": "2"}
_MINIMAX_VOICE = {"uk": "English_expressive_narrator",   # 英音 baseline (unchanged)
                  "us": "English_Trustworth_Man"}        # 美音（可在此一行替换音色）
# MiniMax returns HTTP 200 even on failure, with the real reason in base_resp.status_code.
# These map the common ones to a message the UI can show, so a dead key / empty balance
# is no longer a silent "stuck" — the reader tells the user what to fix.
_MINIMAX_ERR = {
    1004: "MiniMax 鉴权失败，请到设置检查 key/GroupId",
    2049: "MiniMax key 已失效，请到设置更新（账号里的积分仍在新 key 上）",
    1008: "MiniMax 余额不足，请充值或更换 key",
    1002: "MiniMax 触发限流，请稍后再试",
}
_MINIMAX_FATAL = {1004, 2049, 1008}   # won't fix on retry — stop hammering the API
def _accent_of(args) -> str:
    a = ((args or {}).get("accent") or "uk").strip().lower()
    return a if a in ("uk", "us") else "uk"


def _safe_filename(s: str) -> str:
    import re
    s = re.sub(r"[/\\:*?\"<>|]", "_", s).strip()
    return s[:80] or "article"


_COMMON_TIER_CUTOFF = 8000


def _tier_for(rank) -> str:
    if rank is not None and rank >= _COMMON_TIER_CUTOFF:
        return "rare"
    return "common"  # known-common OR unknown → high-frequency


# Five frequency bands for the notebook badge, by daily_rank (1 = most common word in
# English). ONLY single words get a band; phrases & sentences are excluded entirely.
# When a word's rank is unknown (not in the 50k frequency list) we return None and show
# NO badge — better to omit than to mislabel an out-of-list word as "rare".
def _freq_band(rank) -> dict | None:
    if rank is None:
        return None
    # 第三轮反馈 ⑥ 重定档：用户要「原 B 档射程变成 A 档射程」＝ A 含约 2 万词。
    # SUBTLEX 口语语料压低了 overweight(≈16383)/nutritious(≈20686)/vacate(≈14813)
    # 这类书面常用词的排名，把它们纳入 A「最常用」；bcde 顺延。
    # (obese22135→B；pandemic/calorie→C；ephemeral/serendipity/ubiquitous→D；>44k→E)
    if rank <= 21000:
        return {"label": "A", "name": "最常用"}
    if rank <= 30000:
        return {"label": "B", "name": "常用"}
    if rank <= 38000:
        return {"label": "C", "name": "较常用"}
    if rank <= 44000:
        return {"label": "D", "name": "进阶"}
    return {"label": "E", "name": "生僻"}


def _ensure_band(e: dict) -> dict:
    """Backfill a single word's frequency band for LEGACY notebook entries saved
    before/without banding (stored daily_rank & freq_band = None) — those show up
    ungraded (gray) even though the word IS in the frequency table. Idempotent:
    entries that already have a band, or aren't single words, are returned as-is.
    Phrases & sentences intentionally never get a band. Words genuinely absent
    from the 50k list (proper nouns, rare/derived forms) correctly stay unbanded."""
    if e.get("freq_band"):
        return e
    if (e.get("kind") or "word") != "word":
        return e
    rank = e.get("daily_rank")
    if rank is None:
        lemma = (e.get("lemma") or e.get("word") or "").strip().lower()
        if lemma:
            try:
                from reader_core.vocab import _shared_freq
                rank = _shared_freq().get(lemma)
            except Exception:
                rank = None
    band = _freq_band(rank)
    if band:
        e["daily_rank"] = rank
        e["freq_band"] = band["label"]
        e["freq_name"] = band["name"]
    return e


def _refresh_band(e: dict) -> dict:
    """补充批2 #5：阈值调整后，已收藏词条里存的 freq_band 是按旧阈值算的（如
    overweight 存着旧档 'D'），不会自动变。读取/下发时按已存的 daily_rank 用新
    阈值重算并覆盖 freq_band/freq_name，让存量词立即生效，无需用户重新点。
    先走 _ensure_band 补全 legacy（无 daily_rank）条目，再对有 daily_rank 的重算。"""
    e = _ensure_band(e)
    rank = e.get("daily_rank")
    if rank is not None:
        band = _freq_band(rank)
        if band:
            e["freq_band"] = band["label"]
            e["freq_name"] = band["name"]
    return e


def _build_pregen_order(report) -> list[dict]:
    """Every auto-highlighted vocab word (kind == 'flag'), rarest-first.

    Aligned exactly with what the reader sees highlighted in the article — so
    there's no gap between "highlighted" and "pre-generated". Ordered from the
    most obscure word to the most common (unknown-rank counts as rarest), because
    the obscure words are the ones a reader is most likely to click, and we want
    those warmed in the cache first so the first click feels instant."""
    seen: set[str] = set()
    order: list[dict] = []
    for block in report.blocks:
        for si, sent_tokens in enumerate(block.tokens):
            sent_text = block.sentences[si] if si < len(block.sentences) else ""
            for tok in sent_tokens:
                if tok.get("kind") != "flag":
                    continue
                lemma = tok.get("lemma")
                if not lemma or lemma in seen:
                    continue
                seen.add(lemma)
                rank = tok.get("rank")
                order.append({
                    "word": tok["text"], "lemma": lemma,
                    "sentence": tok.get("sentence", sent_text),
                    "level": tok.get("level", ""),
                    "tier": tok.get("freq") or _tier_for(rank),
                    "_rank": rank if rank is not None else 10 ** 9,
                })
    order.sort(key=lambda d: d["_rank"], reverse=True)  # rarest (incl. unknown) first
    for d in order:
        d.pop("_rank", None)
    return order


class Api:
    def __init__(self):
        self._progress = ""
        self._plock = threading.Lock()
        # .env 显式锚定到数据根（本机＝~/Documents/situ）：冻结包里 load_dotenv 的默认
        # 查找（从 llm.py 文件位置向上走）够不到项目根的 .env，会静默回落 config.json →
        # 默认模型 deepseek-v4-pro（推理模型，讲解慢好几秒）。锚定后冻结/源码解析出同一个模型。
        # 分发机器没有这份 .env，照旧走设置面板的 config.json，行为不变。
        self._explainer = WordExplainer(env_path=DATA_ROOT / ".env")
        self._last = None  # dict: title, source, report, classifier, vocab_order
        self._book = None              # dict: {"title","source","chapters":[Article],"current_idx":int}
        self._book_seen_lemmas: set[str] = set()  # cross-chapter dedup: lemmas already queued in prior chapters
        self._cover_heal_tried: set[str] = set()  # 封面补漏：每会话每篇只后台补抓一次
        self._mm_err = ""              # last MiniMax failure reason, surfaced to the UI (key 失效 / 额度耗尽 …)

        # Explanation cache (everything generated) vs notebook (only words the
        # user actively viewed). Pre-generation fills _cache; clicking/navigating
        # to a word copies it into _notebook so the vocab list stays meaningful.
        self._cache: dict[str, dict] = {}      # lemma -> explanation dict
        self._notebook: dict[str, dict] = {}   # lemma -> explanation dict (user-viewed)
        self._lock = threading.Lock()          # guards cache + notebook + inflight + pregen
        self._inflight: dict[str, threading.Event] = {}
        self._pregen = {"done": 0, "total": 0, "running": False}
        self._token = 0                         # invalidates stale pregen on re-parse
        # ⑤ 点击插队：用户点开生词(explain_word)时把这个时间戳往后推一个窗口，
        # 后台 8 线程预生成会在该窗口内让路(暂不发新 API 调用)，把 API 并发让给用户这一击，
        # 冷词点击更快出讲解。用户停手后预生成自动恢复满速。
        self._click_priority_until = 0.0
        self._CLICK_PRIORITY_WINDOW = 3.0       # 秒，约一次 LLM 调用时长

        # D 流式讲解：explain_word_start 起后台线程流式生成，前端 explain_word_poll
        # 轮询取增量字段；sid -> {"fields","done","result","ts"}。由 self._lock 保护。
        self._streams: dict[str, dict] = {}
        self._stream_seq = 0

        # 讲解预生成缓存持久化（按书落盘，见 _pregen_path / _load_pregen_cache /
        # _flush_pregen_cache）：_cache 每新增一条，去抖 2s 后原子写盘，避免同一页
        # 每次重启都要重新调 LLM。独立锁只保护落盘竞态，不与 self._lock 嵌套持有。
        self._pregen_flock = threading.Lock()
        self._pregen_flush_timer: threading.Timer | None = None
        self._pregen_dirty = False

        # 「章节顺序」排序用：当前文档/章节里 lemma 与句子的首次出现序号
        # （书模式带章节基数 chapter_idx*1e6，故跨章可单调排序）。点词时把序号烤进 entry。
        self._order_map: dict[str, int] = {}    # lemma -> 文内单调序号
        self._sent_order: dict[str, int] = {}   # 句子原文 -> 文内单调序号（词块/句用）
        # 全局生词本：内存镜像 + 独立锁（写穿盘，避免依赖退出时 flush——退出走 os._exit(0)）
        self._global: dict[str, dict] | None = None
        self._gvlock = threading.Lock()

        # Reading history / library
        self._doc_id = None
        self._snapshot = ""    # latest reading-area HTML snapshot (with user highlights)
        self._level = DEFAULT_THEME  # placeholder, set on parse

        # 生词屏保：启动时后台刷新今天的「昨日三词」PNG（每天最多一次）。放在 App 里做而非
        # launchd——App 有用户授予的 ~/Documents 访问权，launchd 会被 macOS TCC 挡在门外。
        threading.Thread(target=self._maybe_refresh_screensaver, daemon=True).start()

    def _maybe_refresh_screensaver(self):
        """今天还没生成过就跑一次 screensaver/run.sh（gen + Chrome 渲染）。失败静默。"""
        try:
            import subprocess, datetime
            png = ROOT / "screensaver" / "png" / "today.png"
            if png.exists():
                mt = datetime.date.fromtimestamp(png.stat().st_mtime)
                if mt == datetime.date.today():
                    return   # 今天已生成，跳过
            run = ROOT / "screensaver" / "run.sh"
            if run.exists():
                subprocess.run(["bash", str(run)], timeout=90,
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception:
            pass

    # ---- progress ----
    def _set(self, msg: str):
        with self._plock:
            self._progress = msg

    def get_progress(self) -> str:
        with self._plock:
            return self._progress

    # ---- clipboard ----
    def read_clipboard(self) -> str:
        try:
            import subprocess
            if sys.platform == "darwin":
                return subprocess.run(["pbpaste"], capture_output=True, text=True).stdout
            if sys.platform.startswith("win"):
                out = subprocess.run(
                    ["powershell", "-NoProfile", "-Command", "Get-Clipboard"],
                    capture_output=True, text=True,
                )
                return out.stdout
            # linux
            return subprocess.run(
                ["xclip", "-selection", "clipboard", "-o"],
                capture_output=True, text=True,
            ).stdout
        except Exception:
            return ""

    def get_config(self) -> dict:
        return {
            "llm_enabled": self._explainer.enabled,
            "provider": self._explainer.provider,
            "themes": dict(THEMES),
            "default_theme": DEFAULT_THEME,
        }

    # ---- settings: in-app LLM credentials (so friends never edit .env) ----
    def get_settings(self) -> dict:
        ex = self._explainer
        key = ex.api_key or ""
        masked = ("•" * 6 + key[-4:]) if len(key) >= 4 else ("••••" if key else "")
        mm_key, mm_gid = self._minimax_creds()
        mm_masked = ("•" * 6 + mm_key[-4:]) if len(mm_key) >= 4 else ("••••" if mm_key else "")
        return {
            "llm_enabled": ex.enabled,
            "provider": ex.provider or "deepseek",
            "model": ex.model or "",
            "has_key": bool(key),
            "key_masked": masked,
            "providers": [
                {"id": pid, "base_url": url, "default_model": model}
                for pid, (url, model) in PROVIDERS.items()
            ],
            # MiniMax neural pronunciation (optional; falls back to 有道 when unset)
            "has_mm_key": bool(mm_key),
            "mm_key_masked": mm_masked,
            "mm_group": mm_gid,
            "config_path": str(config_path()),
        }

    def get_llm_defaults(self, args: dict | None = None) -> dict:
        """复盘窗（独立 WebView，自己的 IndexedDB）读不到本地 LLM key 时，向主窗要一份默认。

        返回主窗当前生效的 provider/model/base_url + **原始** api_key（复盘窗要拿它真发请求，
        不能给 masked 版）。key 只经手不落盘不打日志——与凭证透传约定一致，调用方（浏览器端）
        拿到后只放进内存 config，绝不写进复盘窗的持久层。has_key 让前端不必凭 key 是否为空猜。"""
        ex = self._explainer
        return {
            "provider": ex.provider or "deepseek",
            "api_key": ex.api_key or "",
            "model": ex.model or "",
            "base_url": ex.base_url or "",
            "has_key": bool(ex.api_key),
        }

    def save_settings(self, args: dict) -> dict:
        args = args or {}
        provider = (args.get("provider") or "").lower().strip()
        api_key = (args.get("api_key") or "").strip()
        model = (args.get("model") or "").strip()
        if provider and provider not in PROVIDERS:
            return {"ok": False, "error": "未知的服务商"}
        cfg = load_user_config()
        if provider:
            cfg["provider"] = provider
        # only overwrite the stored key when a non-empty one is supplied, so the
        # user can re-save other fields without retyping their key
        if api_key:
            cfg["api_key"] = api_key
        cfg["model"] = model  # empty = use provider default
        # MiniMax pronunciation creds (optional). Key only overwritten when given;
        # GroupId is always synced (empty string disables MiniMax → 有道 fallback).
        mm_key = (args.get("minimax_key") or "").strip()
        if mm_key:
            cfg["minimax_key"] = mm_key
        if "minimax_group" in args:
            cfg["minimax_group"] = (args.get("minimax_group") or "").strip()
        try:
            save_user_config(cfg)
        except Exception as e:
            return {"ok": False, "error": f"保存失败：{e}"}
        self._explainer.reload()
        return {"ok": True, "llm_enabled": self._explainer.enabled}

    def test_settings(self, args: dict | None = None) -> dict:
        """Validate whatever was just passed (without persisting) so the user can
        check a key before saving. Falls back to the saved credentials."""
        args = args or {}
        api_key = (args.get("api_key") or "").strip()
        provider = (args.get("provider") or "").lower().strip()
        model = (args.get("model") or "").strip()
        if api_key or provider:
            from reader_core.llm import WordExplainer as _WE
            probe = _WE.__new__(_WE)
            probe.provider = provider or "deepseek"
            probe.api_key = api_key or self._explainer.api_key
            probe.model = model
            probe.base_url = ""
            if probe.provider in PROVIDERS:
                durl, dmodel = PROVIDERS[probe.provider]
                probe.base_url = durl
                if not probe.model:
                    probe.model = dmodel
            probe._client = None
            probe._env_path = None
            ok, msg = probe.validate()
        else:
            ok, msg = self._explainer.validate()
        return {"ok": ok, "message": msg}

    # ---- parse ----
    def process(self, args: dict) -> dict:
        try:
            source = args["source"]
            level = args.get("level", "cet4-6")

            # ---- EPUB / book path ----
            if Path(source).suffix.lower() == ".epub":
                self._set("① 拆分章节…")
                title, chapters = extract_book(source)

                # New book: reset everything (including cross-chapter seen set)
                with self._lock:
                    self._token += 1
                    self._cache = {}
                    self._notebook = {}
                    self._inflight = {}
                    self._pregen = {"done": 0, "total": 0, "running": False}
                self._book_seen_lemmas = set()
                self._order_map = {}; self._sent_order = {}

                self._book = {
                    "title": title, "source": source,
                    "chapters": chapters, "current_idx": -1,
                }
                self._doc_id = uuid.uuid4().hex[:12]
                self._snapshot = ""
                self._level = level

                # 把 epub 原件复制进数据目录，重启后仍可续读
                import shutil
                BOOKS.mkdir(parents=True, exist_ok=True)
                stored = BOOKS / f"{self._doc_id}.epub"
                try:
                    shutil.copy2(source, stored)
                except Exception:
                    stored = Path(source)   # 兜底：存不了就先用原路径
                self._book["epub_path"] = str(stored)
                self._book["display_source"] = Path(source).name

                self._set("")

                chap_result = self._load_chapter_internal(0)
                return {
                    "mode": "book",
                    "title": title,
                    "source": source,
                    "toc": self._toc_list(),
                    "chapter_idx": 0,
                    "chapter_count": len(chapters),
                    "llm_enabled": self._explainer.enabled,
                    **chap_result,
                }

            # ---- Article / non-epub path (unchanged) ----
            self._set("① 抽取正文…")
            article = extract_text(source)

            self._set("② 词汇分层…")
            classifier = VocabClassifier(user_level=level)
            report = classifier.analyze(article)
            self._index_positions(report, None)   # 文内位置序号（章节顺序排序用）

            article_html = render_article_fragment(report)
            vlist = vocab_list(report, classifier)
            order = _build_pregen_order(report)

            # New document: invalidate any running pre-generation, reset caches
            with self._lock:
                self._token += 1
                self._cache = {}
                self._notebook = {}
                self._inflight = {}
                self._pregen = {"done": 0, "total": 0, "running": False}

            self._last = {
                "title": article.title, "source": article.source,
                "report": report, "classifier": classifier, "vocab_order": order,
                "image": getattr(article, "image", None),
                "sitename": getattr(article, "sitename", None),
            }
            self._doc_id = uuid.uuid4().hex[:12]
            self._snapshot = ""
            self._level = level
            self._set("")
            # 文章一解析完就立即写库索引 → 立刻进剪报盒历史，不等前端 save_session 的异步存盘。
            # （否则打开后极快关闭时，renderHome 读索引可能早于 save_session 落盘 → 该篇漏记；
            #   完整快照 .json 仍由前端 renderArticle→doSave 写，这里只保证索引条目不被竞态漏掉。）
            try:
                _idx = [it for it in self._read_index() if it.get("id") != self._doc_id]
                _idx.insert(0, {
                    "id": self._doc_id, "mode": "article",
                    "title": article.title, "source": article.source,
                    "saved_at": time.time(), "level": level,
                    "vocab_count": len(report.hits),
                    "sitename": getattr(article, "sitename", None),
                    "image": getattr(article, "image", None),
                })
                self._write_index(_idx)
            except Exception:
                pass
            return {
                "mode": "article",
                "title": article.title,
                "source": article.source,
                "total_tokens": report.total_tokens,
                "vocab_count": len(report.hits),
                "article_html": article_html,
                "vocab_list": vlist,
                "vocab_order_count": len(order),
                "llm_enabled": self._explainer.enabled,
                "image": getattr(article, "image", None),
            }
        except Exception as e:
            self._set("")
            return {"error": f"{type(e).__name__}: {e}"}

    def process_file(self, args: dict) -> dict:
        """Load a dropped / picked file by CONTENT, not path.

        pywebview's WKWebView does not expose File.path (browser security), so a
        dragged .epub only yields its name and the path lookup fails. The frontend
        therefore reads the file via FileReader and sends a data: URL here; we write
        it to a temp file (preserving the suffix so .epub → book mode) and reuse
        process(). The original filename is kept so a .txt without a title line still
        shows a sensible name instead of a random temp name."""
        import base64, os, tempfile
        try:
            name = (args.get("name") or "upload").strip()
            data_url = args.get("data_url") or ""
            level = args.get("level", "cet4-6")
            b64 = data_url.split(",", 1)[1] if "," in data_url else data_url
            raw = base64.b64decode(b64)
            suffix = os.path.splitext(name)[1].lower() or ".txt"
            tmp_dir = tempfile.mkdtemp(prefix="situ_upload_")
            # keep the real filename inside a temp dir → nice title fallback, no clashes
            tmp_path = os.path.join(tmp_dir, os.path.basename(name) or ("upload" + suffix))
            with open(tmp_path, "wb") as f:
                f.write(raw)
            return self.process({"source": tmp_path, "level": level})
        except Exception as e:
            self._set("")
            return {"error": f"{type(e).__name__}: {e}"}

    # ---- book / chapter navigation ----

    def _toc_list(self) -> list:
        # chars=本章正文字数：前端据此估算「全局页码」（各章字数 ÷ 当前章实测每页字数）
        return [{"idx": i, "title": c.title, "chars": len(c.text)}
                for i, c in enumerate(self._book["chapters"])] if self._book else []

    def get_toc(self) -> list:
        return self._toc_list()

    def load_chapter(self, args: dict) -> dict:
        if not self._book:
            return {"error": "当前没有打开的书"}
        try:
            idx = int(args["idx"])
        except (KeyError, ValueError, TypeError):
            return {"error": "缺少有效的 idx 参数"}
        chapters = self._book["chapters"]
        if idx < 0 or idx >= len(chapters):
            return {"error": f"章节序号 {idx} 超出范围（共 {len(chapters)} 章）"}
        return self._load_chapter_internal(idx)

    def _load_chapter_internal(self, idx: int) -> dict:
        """Switch to chapter `idx`.

        Critical correctness rule: switching chapters must NOT clear _cache,
        _notebook, or _book_seen_lemmas — those carry cross-chapter dedup state.
        Only bump _token to cancel the previous chapter's pregen threads.
        """
        article = self._book["chapters"][idx]
        classifier = VocabClassifier(user_level=self._level or "cet4-6")
        self._set(f"② 词汇分层（第 {idx + 1} 章）…")
        report = classifier.analyze(article)
        self._index_positions(report, idx)        # 累加本章位置序号（章节顺序排序用）
        article_html = render_article_fragment(report)
        vlist = vocab_list(report, classifier)
        order = _build_pregen_order(report)
        # Cross-chapter dedup: drop lemmas already queued in previous chapters
        order = [it for it in order if it["lemma"] not in self._book_seen_lemmas]
        # Book mode: cap AI pre-generation to the rarest few per chapter (order is
        # rarest-first). The rest still generate instantly on click — this avoids
        # paying to pre-explain a whole chapter of words the reader never taps.
        order = order[:PREGEN_CAP_BOOK]
        with self._lock:
            self._token += 1          # cancel previous chapter's pregen; keep cache/notebook
            self._inflight = {}
            self._pregen = {"done": 0, "total": 0, "running": False}
        self._book["current_idx"] = idx
        # Reuse self._last so existing explain_word/_get_explanation/start_pregen work unchanged
        self._last = {
            "title": self._book["title"],
            "source": article.source,
            "report": report,
            "classifier": classifier,
            "vocab_order": order,
        }
        # Accumulate this chapter's lemmas into seen (next chapter won't re-queue them)
        for it in order:
            self._book_seen_lemmas.add(it["lemma"])
        self._set("")
        self.start_pregen()   # reuse existing 8-thread pregen; reads self._last["vocab_order"]
        return {
            "chapter_idx": idx,
            "article_html": article_html,
            "vocab_list": vlist,
            "total_tokens": report.total_tokens,
            "vocab_count": len(report.hits),
            "vocab_order_count": len(order),
        }

    # ---- core: get (cached or freshly generated) explanation, concurrency-safe ----
    def _get_explanation(self, word: str, lemma: str, sentence: str,
                         level: str, tier: str, token: int | None = None,
                         on_update=None) -> dict:
        # on_update 非空时走流式生成（explain_stream 边收边回调增量字段），
        # 缓存/在途去重/落盘与非流式完全同一条路，结果形状不变。
        # Cache hit?
        with self._lock:
            if lemma in self._cache:
                d = dict(self._cache[lemma]); d["cached"] = True
                if word: d["word"] = word   # reflect the surface form just clicked, so audio says the inflected word
                return d
            ev = self._inflight.get(lemma)
            owner = ev is None
            if owner:
                ev = threading.Event()
                self._inflight[lemma] = ev

        if not owner:
            # Someone else is generating this lemma; wait for it.
            ev.wait(timeout=35)
            with self._lock:
                if lemma in self._cache:
                    d = dict(self._cache[lemma]); d["cached"] = True
                    if word: d["word"] = word
                    return d
            # else fall through and generate ourselves

        try:
            if not self._explainer.enabled:
                return {"ok": False, "error": "还没填 API Key，点右上角「设置」填入后即可讲解",
                        "word": word, "lemma": lemma}
            title = self._last["title"] if self._last else ""
            if on_update is not None:
                exp = self._explainer.explain_stream(word, lemma, sentence, title, on_update=on_update)
            else:
                exp = self._explainer.explain(word=word, lemma=lemma, sentence=sentence, title=title)
            result = exp.to_dict()
            result.update({"lemma": lemma, "level": level, "freq_tier": tier})
            if exp.ok:
                with self._lock:
                    self._cache[lemma] = result
                self._schedule_pregen_flush()
            return result
        finally:
            with self._lock:
                e = self._inflight.pop(lemma, None)
            if e is not None:
                e.set()

    # ---- explain a word on demand (any word, lemma optional) ----
    def _resolve_word_args(self, args: dict):
        """explain_word / explain_word_start 共用的参数解析：
        返回 (word, lemma, sentence, level, tier, daily_rank, is_phrase)。"""
        word = (args.get("word") or "").strip()
        sentence = (args.get("sentence") or "").strip()
        lemma = (args.get("lemma") or "").strip().lower()
        level = (args.get("level") or "").strip()
        tier = (args.get("freq") or "").strip()
        # A manually-selected phrase is not a dictionary word: skip word-classification
        # and keep it out of the single-word notebook (its "memory" lives as the
        # highlighted band in the article instead).
        is_phrase = bool(args.get("phrase"))

        # Resolve lemma / level / freq tier via the active classifier when possible
        classifier = self._last["classifier"] if self._last else None
        daily_rank = None
        if classifier is not None and not is_phrase:
            info = classifier.classify_word(word, sentence)
            lemma = lemma or info["lemma"]
            level = level or info["level"]
            tier = tier or info["freq_tier"]
            daily_rank = info.get("daily_rank")
        if not lemma:
            lemma = word.lower()
        return word, lemma, sentence, level, tier, daily_rank, is_phrase

    def explain_word(self, args: dict) -> dict:
        self._click_priority_until = time.time() + self._CLICK_PRIORITY_WINDOW  # ⑤ 让后台预生成给这一击让路
        word, lemma, sentence, level, tier, daily_rank, is_phrase = self._resolve_word_args(args)
        result = self._get_explanation(word, lemma, sentence, level, tier or "common")
        return self._record_word_view(result, word, lemma, daily_rank, is_phrase)

    def _record_word_view(self, result: dict, word: str, lemma: str,
                          daily_rank, is_phrase: bool) -> dict:
        """主动查看后的生词本记账（clicks/order/章节/频率档/全局汇入），
        explain_word 与流式 explain_word_start 的收尾共用这一段。"""
        # Actively viewed → record into the user's notebook (words only, not phrases)
        if not is_phrase and result.get("ok", True) and result.get("explanation"):
            ci, ct = self._cur_chapter()
            with self._lock:
                prev = self._notebook.get(lemma) or {}
                entry = {k: v for k, v in result.items() if k != "cached"}
                entry["kind"] = "word"
                if prev.get("followups"):        # keep any earlier follow-up Q&A
                    entry["followups"] = prev["followups"]
                # frequency band (words only). Keep a previously-known rank if this
                # pass couldn't resolve one (e.g. classifier unavailable on a restore).
                rank = daily_rank if daily_rank is not None else prev.get("daily_rank")
                band = _freq_band(rank)
                if rank is not None:
                    entry["daily_rank"] = rank
                if band:
                    entry["freq_band"] = band["label"]
                    entry["freq_name"] = band["name"]
                # 点击次数 / 文内位置 / 章节 / 时间 / 重点（三维排序 + 分层着色 + 全局汇总用）
                entry["clicks"] = (prev.get("clicks") or 0) + 1
                opos = self._order_map.get(lemma)
                entry["order"] = opos if opos is not None else prev.get("order")
                if ci is not None:
                    entry["chapter_idx"] = ci
                if ct:
                    entry["chapter_title"] = ct
                entry["added_at"] = prev.get("added_at") or time.time()
                entry["last_seen"] = time.time()
                if prev.get("star"):
                    entry["star"] = True
                self._notebook[lemma] = entry
                gentry = dict(entry)
                # surface the band to the explanation panel too (next to the phonetic)
                if rank is not None:
                    result["daily_rank"] = rank
                if band:
                    result["freq_band"] = band["label"]
                    result["freq_name"] = band["name"]
                if entry.get("followups"):
                    result["followups"] = entry["followups"]   # ④ 回看必复原：讲解结果带上已完成的追问历史
            self._upsert_global(lemma, gentry, click=True)   # 汇入全局生词本（点击 +1）
        return result

    # ---- D 流式讲解：start 起流 → 前端 poll 增量渲染 → done 返回完整结果 ----
    def explain_word_start(self, args: dict) -> dict:
        """流式讲解入口。缓存命中（或 LLM 未配置）直接整段返回 {"mode":"done","result":…}；
        未命中起后台线程流式生成，返回 {"mode":"stream","sid":…,"meta":{词/频率档}}，
        前端拿 sid 轮询 explain_word_poll。结果、缓存、生词本记账与 explain_word 完全一致。"""
        self._click_priority_until = time.time() + self._CLICK_PRIORITY_WINDOW  # ⑤ 点击插队同样生效
        word, lemma, sentence, level, tier, daily_rank, is_phrase = self._resolve_word_args(args)
        with self._lock:
            cached = lemma in self._cache
        if cached or not self._explainer.enabled:
            # 秒回路径不值得开一条流；直接复用非流式全流程（含记账）
            return {"mode": "done",
                    "result": self._record_word_view(
                        self._get_explanation(word, lemma, sentence, level, tier or "common"),
                        word, lemma, daily_rank, is_phrase)}
        st = {"fields": {}, "done": False, "result": None, "ts": time.time()}
        with self._lock:
            self._stream_seq += 1
            sid = str(self._stream_seq)
            # 顺手清掉超过 10 分钟没人来收尸的旧流（前端崩了/被关了）
            now = time.time()
            for k in [k for k, v in self._streams.items() if now - v["ts"] > 600]:
                del self._streams[k]
            self._streams[sid] = st

        def worker():
            try:
                result = self._get_explanation(
                    word, lemma, sentence, level, tier or "common",
                    on_update=lambda fields: self._stream_put(sid, fields))
                result = self._record_word_view(result, word, lemma, daily_rank, is_phrase)
            except Exception as e:
                result = {"ok": False, "error": str(e)[:160], "word": word, "lemma": lemma}
            with self._lock:
                st["result"] = result
                st["done"] = True

        threading.Thread(target=worker, daemon=True).start()
        meta = {"word": word, "lemma": lemma}
        band = _freq_band(daily_rank)
        if band:
            meta["freq_band"] = band["label"]
            meta["freq_name"] = band["name"]
        return {"mode": "stream", "sid": sid, "meta": meta}

    def _stream_put(self, sid: str, fields: dict):
        with self._lock:
            st = self._streams.get(sid)
            if st is not None:
                st["fields"] = fields

    def explain_word_poll(self, args: dict) -> dict:
        sid = str((args or {}).get("sid") or "")
        with self._lock:
            st = self._streams.get(sid)
            if st is None:
                return {"ok": False, "gone": True}
            if st["done"]:
                res = st["result"]
                del self._streams[sid]
                return {"ok": True, "done": True, "result": res}
            return {"ok": True, "done": False, "fields": dict(st["fields"])}

    # ---- explain a manually-selected phrase / sentence on demand ----
    def explain_selection(self, args: dict) -> dict:
        """A manually-selected span is not a dictionary word: the model decides whether
        it is a 短语 or a 句子 and answers in the matching shape. The result is cached
        and recorded into the notebook (under a "§"-prefixed key) so phrases & sentences
        are reviewable alongside words."""
        self._click_priority_until = time.time() + self._CLICK_PRIORITY_WINDOW  # ⑤ 选取讲解同样插队
        text = (args.get("text") or args.get("word") or "").strip()
        if not text:
            return {"ok": False, "error": "没有选中文字"}
        sentence = (args.get("sentence") or "").strip()
        key = "§" + " ".join(text.lower().split())   # stable notebook/cache key for this span

        with self._lock:
            if key in self._cache:
                d = dict(self._cache[key]); d["cached"] = True
                fu = (self._notebook.get(key) or {}).get("followups")
                if fu:
                    d["followups"] = fu   # ④ 回看必复原：带上该 §-key 已完成的追问历史
                return d
        if not self._explainer.enabled:
            return {"ok": False, "error": "还没填 API Key，点右上角「设置」填入后即可讲解"}
        title = self._last["title"] if self._last else ""
        res = self._explainer.explain_selection(text=text, sentence=sentence, title=title)
        if not res.get("ok"):
            return res
        res.update({"text": text, "word": text, "lemma": key, "sentence": sentence})
        # A：重点词汇里的单词型 key（非多词固定搭配）补频率档，讲解区渲染时按 A-E 染色；
        # 多词搭配没有 band，前端保持原有赭色强调。classifier 缺失/异常不影响讲解主体。
        try:
            classifier = self._last["classifier"] if self._last else None
            if classifier is not None:
                for k in (res.get("key_words") or []):
                    kw = (k.get("word") or "").strip()
                    if kw and len(kw.split()) == 1 and kw.isalpha():
                        info = classifier.classify_word(kw, sentence)
                        band = _freq_band(info.get("daily_rank"))
                        if band:
                            k["freq_band"] = band["label"]
                            k["freq_name"] = band["name"]
        except Exception:
            pass
        ci, ct = self._cur_chapter()
        with self._lock:
            base = {k: v for k, v in res.items() if k != "cached"}
            base.setdefault("kind", "phrase")     # 模型未判定时默认词块；句子由模型给 kind="sentence"
            self._cache[key] = dict(base)
            prev = self._notebook.get(key) or {}
            entry = dict(base)
            if prev.get("followups"):
                entry["followups"] = prev["followups"]
            entry["clicks"] = (prev.get("clicks") or 0) + 1
            spos = self._sent_order.get(sentence)
            entry["order"] = spos if spos is not None else prev.get("order")
            if ci is not None:
                entry["chapter_idx"] = ci
            if ct:
                entry["chapter_title"] = ct
            entry["added_at"] = prev.get("added_at") or time.time()
            entry["last_seen"] = time.time()
            if prev.get("star"):
                entry["star"] = True
            self._notebook[key] = entry
            gentry = dict(entry)
            if entry.get("followups"):
                res["followups"] = entry["followups"]   # ④ 回看必复原：讲解结果带上已完成的追问历史
        self._schedule_pregen_flush()
        self._upsert_global(key, gentry, click=True)   # 词块/句也汇入全局生词本
        return res

    def collect_keyword(self, args: dict) -> dict:
        """Save a 讲解区「重点词汇」item (word + 中文释义) straight into the 生词本
        as a 词块 entry — no LLM call. Idempotent: re-collecting an existing key is a
        no-op. The entry mirrors the shape explain_selection writes, so a collected
        phrase renders / sorts / groups / exports identically to one the user
        selected-and-explained; clicking it later can still fetch a full 讲解."""
        word = (args.get("word") or "").strip()
        if not word:
            return {"ok": False, "error": "没有要收藏的词组"}
        gloss = (args.get("gloss") or "").strip()
        sentence = (args.get("sentence") or "").strip()
        key = "§" + " ".join(word.lower().split())   # same key scheme as explain_selection
        ci, ct = self._cur_chapter()
        with self._lock:
            if key in self._notebook:
                return {"ok": True, "key": key, "already": True}
            entry = {
                "text": word, "word": word, "lemma": key, "kind": "phrase",
                "meaning": gloss, "clicks": 1,
                "added_at": time.time(), "last_seen": time.time(),
            }
            spos = self._sent_order.get(sentence) if sentence else None
            if spos is not None:
                entry["order"] = spos
            if ci is not None:
                entry["chapter_idx"] = ci
            if ct:
                entry["chapter_title"] = ct
            self._notebook[key] = entry
            gentry = dict(entry)
        self._upsert_global(key, gentry, click=True)   # 也汇入全局生词本
        return {"ok": True, "key": key, "collected": True}

    def collect_paragraph(self, args: dict) -> dict:
        """Whole-paragraph highlight (整段色卡) auto-收藏 into the notebook as a
        「段落」entry — no LLM call, just the raw原文. Mirrors collect_keyword's
        shape/idempotency but uses a "¶"-prefixed key so it never collides with
        word ("lemma") or phrase/sentence ("§"...) keys. Re-收藏 the same paragraph
        is a no-op (same key)."""
        text = (args.get("text") or "").strip()
        if not text:
            return {"ok": False, "error": "没有要收藏的段落"}
        key = "¶" + " ".join(text.lower().split())   # own namespace, dedup by normalized text
        ci, ct = self._cur_chapter()
        with self._lock:
            if key in self._notebook:
                return {"ok": True, "key": key, "already": True}
            entry = {
                "text": text, "word": text, "lemma": key, "kind": "para",
                "meaning": "", "clicks": 1,
                "added_at": time.time(), "last_seen": time.time(),
            }
            if ci is not None:
                entry["chapter_idx"] = ci
            if ct:
                entry["chapter_title"] = ct
            self._notebook[key] = entry
            gentry = dict(entry)
        self._upsert_global(key, gentry, click=True)   # 也汇入全局生词本
        return {"ok": True, "key": key, "collected": True}

    # ---- warm an explanation into cache WITHOUT touching the notebook ----
    def prewarm_word(self, args: dict) -> dict:
        """Generate + cache an explanation but never record it in the notebook.
        Used by hover-prefetch so merely hovering a word doesn't pollute the
        vocab list. Cheap & idempotent: re-warming a cached word is a no-op."""
        word = (args.get("word") or "").strip()
        if not word:
            return {"ok": False}
        sentence = (args.get("sentence") or "").strip()
        lemma = (args.get("lemma") or "").strip().lower()
        level = (args.get("level") or "").strip()
        tier = (args.get("freq") or "").strip()
        classifier = self._last["classifier"] if self._last else None
        if classifier is not None:
            info = classifier.classify_word(word, sentence)
            lemma = lemma or info["lemma"]
            level = level or info["level"]
            tier = tier or info["freq_tier"]
        if not lemma:
            lemma = word.lower()
        self._get_explanation(word, lemma, sentence, level, tier or "common")
        return {"ok": True}

    # ---- open-ended, context-aware follow-up Q&A about a word/phrase ----
    def ask_followup(self, args: dict) -> dict:
        word = (args.get("word") or "").strip()
        if not word:
            return {"ok": False, "error": "缺少要追问的词"}
        lemma = (args.get("lemma") or "").strip()
        sentence = (args.get("sentence") or "").strip()
        question = (args.get("question") or "").strip()
        prior = (args.get("prior") or "").strip()
        history = args.get("history") or []
        mode = (args.get("mode") or "").strip()
        band = (args.get("band") or "").strip()
        # A short label for quick-ask buttons (e.g. "词汇深解"); the full instruction
        # still goes to the model as `question`, but the thread/notebook show the label.
        label = (args.get("label") or "").strip() or question
        title = self._last["title"] if self._last else ""
        res = self._explainer.followup(
            word=word, lemma=lemma, sentence=sentence, title=title,
            prior=prior, history=history, question=question, mode=mode, band=band,
        )
        # Persist the Q&A onto the notebook so every follow-up — quick-button or
        # free-form — is reviewable alongside its word/phrase and survives save/restore.
        # The target entry normally already exists (explain_word / explain_selection
        # create it); if somehow missing, build a minimal one so nothing is lost.
        if res.get("ok") and res.get("answer"):
            key = (lemma or word).strip().lower()
            with self._lock:
                entry = self._notebook.get(key)
                if entry is None:
                    if key.startswith("§"):
                        entry = {"word": word, "text": word, "lemma": key,
                                 "kind": "phrase", "meaning": prior}
                    else:
                        entry = {"word": word, "lemma": key,
                                 "kind": "word", "explanation": prior}
                    self._notebook[key] = entry
                entry.setdefault("followups", []).append(
                    {"q": label, "a": res["answer"]})
        return res

    # ---- background hybrid pre-generation ----
    def start_pregen(self, args: dict | None = None) -> dict:
        if not self._last:
            return {"ok": False, "error": "还没有解析文章"}
        if not self._explainer.enabled:
            return {"ok": False, "error": "未配置 LLM"}
        token = self._token
        order = self._last.get("vocab_order", [])
        with self._lock:
            total = len(order)
            done = sum(1 for it in order if it["lemma"] in self._cache)
            self._pregen = {"done": done, "total": total, "running": True}
        todo = [it for it in order if it["lemma"] not in self._cache]

        def manager():
            try:
                with ThreadPoolExecutor(max_workers=8) as ex:
                    futs = []
                    for it in todo:
                        if self._token != token:
                            break
                        futs.append(ex.submit(self._pregen_one, it, token))
                    for f in futs:
                        try:
                            f.result()
                        except Exception:
                            pass
            finally:
                with self._lock:
                    if self._token == token:
                        self._pregen["running"] = False

        threading.Thread(target=manager, daemon=True).start()
        return {"ok": True, "total": total, "done": done}

    def _pregen_one(self, item: dict, token: int):
        if self._token != token:
            return
        # ⑤ 点击插队：用户正等一击讲解时，后台预生成让路——先不发新 API 调用，
        # 等优先窗口过去（或用户停手/换文档）再继续。已在 _cache 的词直接跳过不受影响。
        while time.time() < self._click_priority_until:
            if self._token != token:
                return
            if item["lemma"] in self._cache:
                return
            time.sleep(0.2)
        self._get_explanation(item["word"], item["lemma"], item["sentence"],
                              item.get("level", ""), item.get("tier", "rare"), token)
        with self._lock:
            if self._token == token:
                self._pregen["done"] += 1

    def get_pregen_status(self) -> dict:
        with self._lock:
            return dict(self._pregen)

    # ---------- 位置序号（「章节顺序」排序用） ----------
    def _index_positions(self, report, chapter_idx):
        """把当前 report 里每个 lemma / 句子的首次出现位置记入 _order_map / _sent_order。
        书模式带章节基数（chapter_idx*1_000_000），故跨章节单调可排；点词时把序号烤进 entry。"""
        base = (chapter_idx or 0) * 1_000_000
        omap, smap = {}, {}
        pos = 0
        for block in report.blocks:
            for si, sent_tokens in enumerate(block.tokens):
                stext = block.sentences[si] if si < len(block.sentences) else ""
                if stext and stext not in smap:
                    smap[stext] = base + pos
                for tok in sent_tokens:
                    lem = tok.get("lemma")
                    if lem and lem not in omap:
                        omap[lem] = base + pos
                    pos += 1
        if chapter_idx is None:          # 文章：整篇替换
            self._order_map, self._sent_order = omap, smap
        else:                            # 书：累加，保留早前章节的序号
            self._order_map.update(omap)
            self._sent_order.update(smap)

    def _cur_chapter(self):
        """(chapter_idx, chapter_title)；文章模式返回 (None, '')。"""
        if self._book:
            i = self._book.get("current_idx", 0)
            chs = self._book.get("chapters") or []
            t = chs[i].title if 0 <= i < len(chs) else ""
            return i, t
        return None, ""

    # ---------- 讲解预生成缓存持久化（按书落盘：DATA_ROOT/pregen/{doc_id}.json） ----------
    def _pregen_path(self, doc_id: str) -> Path:
        return PREGEN_DIR / f"{doc_id}.json"

    def _load_pregen_cache(self, doc_id: str, level: str):
        """打开书/文章时调用：若磁盘缓存存在且 meta.level 与当前难度一致，整体载入
        self._cache（词块/句子讲解与单词共用同一 _cache，key 形态不同，一并受益）。
        level 不匹配 → 忽略旧文件（后续重新生成会覆盖写）。任何异常静默跳过，绝不
        阻断打开书这条主路径。调用方须已持有 self._lock（与 process/load_archive 的
        既有加锁段共用，避免竞态）。"""
        if not doc_id:
            return
        p = self._pregen_path(doc_id)
        if not p.exists():
            return
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            meta = data.get("meta") or {}
            if meta.get("level") != level:
                return
            cache = data.get("cache")
            if isinstance(cache, dict):
                # setdefault：不覆盖调用方已从 notebook 载入的条目（那些字段更全，
                # 含 followups/clicks 等交互态；pregen 缓存只补上 notebook 里没有的
                # 那部分——预生成过但用户还没点开看过的词）。
                for k, v in cache.items():
                    self._cache.setdefault(k, v)
        except Exception:
            pass

    def _flush_pregen_cache(self):
        """立即原子写盘（.tmp → rename），供去抖定时器与退出前同步 flush 共用。
        自己拿 self._lock 读一份 _cache/doc_id/level 快照，不长时间持锁做 IO。"""
        with self._lock:
            doc_id = self._doc_id
            level = self._level
            cache_snapshot = dict(self._cache)
        if not doc_id or not cache_snapshot:
            return
        try:
            PREGEN_DIR.mkdir(parents=True, exist_ok=True)
            p = self._pregen_path(doc_id)
            tmp = p.with_suffix(".tmp")
            payload = {"meta": {"level": level, "ver": PREGEN_CACHE_VER}, "cache": cache_snapshot}
            tmp.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
            tmp.replace(p)
        except Exception:
            pass
        finally:
            with self._pregen_flock:
                self._pregen_dirty = False

    def _schedule_pregen_flush(self):
        """_cache 每新增一条讲解后调用：去抖 2s 落盘，避免逐词都触发一次磁盘 IO。
        窗口 closing 走 os._exit(0)，不会等线程 join，所以退出前必须另外同步 flush 一次
        （见 app.py 里 _hard_exit），这里的定时器只覆盖正常使用中的持久化。"""
        with self._pregen_flock:
            self._pregen_dirty = True
            if self._pregen_flush_timer is not None:
                self._pregen_flush_timer.cancel()
            t = threading.Timer(2.0, self._flush_pregen_cache)
            t.daemon = True
            self._pregen_flush_timer = t
            t.start()

    def flush_pregen_cache_sync(self):
        """供 closing handler 调用：取消 pending 的去抖定时器，同步落盘一次（此时不能
        再起线程——os._exit 即将杀掉进程，起的线程根本没机会跑）。"""
        with self._pregen_flock:
            if self._pregen_flush_timer is not None:
                self._pregen_flush_timer.cancel()
                self._pregen_flush_timer = None
            dirty = self._pregen_dirty
        if dirty:
            self._flush_pregen_cache()

    # ---------- 全局生词本（跨文档汇总） ----------
    def _load_global(self) -> dict:
        """惰性载入全局库内存镜像；文件不存在时从既有书架 notebook 一次性回填。
        调用方须已持有 self._gvlock。"""
        if self._global is None:
            if GLOBAL_VOCAB.exists():
                try:
                    self._global = json.loads(GLOBAL_VOCAB.read_text(encoding="utf-8"))
                except Exception:
                    self._global = {}
            else:
                self._global = {}
                self._backfill_global()
        return self._global

    def _save_global(self):
        """原子写盘（.tmp → rename）。调用方须已持有 self._gvlock。"""
        VOCAB_DIR.mkdir(parents=True, exist_ok=True)
        tmp = GLOBAL_VOCAB.with_suffix(".tmp")
        tmp.write_text(json.dumps(self._global, ensure_ascii=False, indent=1), encoding="utf-8")
        tmp.replace(GLOBAL_VOCAB)

    def _backfill_global(self):
        """首次启用全局库时，把书架里所有单篇 notebook 合并进来（保留各自 clicks / 来源）。
        调用方须已持有 self._gvlock 且 self._global 已是 {}。"""
        g = self._global
        for p in sorted(LIBRARY.glob("*.json")):
            if p.name == "index.json":
                continue
            try:
                rec = json.loads(p.read_text(encoding="utf-8"))
            except Exception:
                continue
            did, dtitle, saved = rec.get("id"), rec.get("title", ""), rec.get("saved_at")
            for e in (rec.get("notebook") or []):
                key = e.get("lemma") or e.get("key")
                if key:
                    self._merge_one(g, key, e, did, dtitle, saved, click=False)
        self._save_global()

    @staticmethod
    def _merge_one(g, key, e, did, dtitle, saved, *, click):
        """把一条 entry 就地并入全局 dict g[key]。click=True 时点击数 +1（主动查看）。"""
        cur = g.get(key) or {}
        merged = dict(cur)
        for k, v in e.items():           # 用最新讲解字段刷新，但不覆盖聚合字段
            if k in ("clicks", "sources", "known", "star", "first_added", "last_seen", "followups"):
                continue
            if v not in (None, "", []):
                merged[k] = v
        merged["kind"] = e.get("kind") or cur.get("kind") or ("phrase" if str(key).startswith("§") else "word")
        merged["clicks"] = (cur.get("clicks") or 0) + 1 if click else max(cur.get("clicks") or 0, e.get("clicks") or 0)
        merged["first_added"] = cur.get("first_added") or e.get("added_at") or saved or time.time()
        merged["last_seen"] = time.time() if click else (cur.get("last_seen") or e.get("last_seen") or saved or merged["first_added"])
        srcs = list(cur.get("sources") or [])
        if did and not any(s.get("doc_id") == did for s in srcs):
            srcs.append({"doc_id": did, "title": dtitle,
                         "chapter_title": e.get("chapter_title", ""), "order": e.get("order")})
        merged["sources"] = srcs
        if cur.get("known") or e.get("known"):
            merged["known"] = True
        if cur.get("star") or e.get("star"):
            merged["star"] = True
        g[key] = merged

    def _upsert_global(self, key, entry, *, click):
        """单条 entry 写入全局库并落盘（线程安全）。"""
        meta = self._cur_meta() or {}
        with self._gvlock:
            g = self._load_global()
            self._merge_one(g, key, entry, self._doc_id, meta.get("title", ""), None, click=click)
            self._save_global()

    def get_notebook(self) -> list:
        with self._lock:
            return [_refresh_band(e) for e in reversed(list(self._notebook.values()))]

    # ---- 全局生词本 API ----
    def get_global_notebook(self) -> list:
        """跨所有读过材料汇总的生词/词块/句。前端负责筛选/排序/分组/导出。
        读取时顺带回填旧条目缺失的频率档、并按当前阈值重算已存 daily_rank 的档位
        （_refresh_band，就地幂等），让阈值调整对存量词立即生效。"""
        with self._gvlock:
            g = self._load_global()
            return [_refresh_band(e) for e in g.values()]

    def set_known_global(self, args: dict) -> dict:
        key = (args or {}).get("key", "")
        known = bool((args or {}).get("known"))
        with self._gvlock:
            g = self._load_global()
            e = g.get(key)
            if e is not None:
                if known:
                    e["known"] = True
                else:
                    e.pop("known", None)
                self._save_global()
        return {"ok": True}

    def delete_global(self, args: dict) -> dict:
        """从全局生词本移除该 key，并顺带清掉当前单篇 notebook 里的同键镜像
        （右栏「生词本」tab / 本篇删除都走这条，删完两处一致）。"""
        key = (args or {}).get("key", "")
        with self._gvlock:
            g = self._load_global()
            if key in g:
                del g[key]
                self._save_global()
        with self._lock:
            self._notebook.pop(key, None)
        return {"ok": True}

    def set_star(self, args: dict) -> dict:
        """🎯 重点标记。以全局库为准，同时同步到当前单篇 notebook（若该 key 在场）。"""
        key = (args or {}).get("key", "")
        star = bool((args or {}).get("star"))
        with self._gvlock:
            g = self._load_global()
            e = g.get(key)
            if e is not None:
                if star:
                    e["star"] = True
                else:
                    e.pop("star", None)
                self._save_global()
        with self._lock:
            d = self._notebook.get(key)
            if d is not None:
                if star:
                    d["star"] = True
                else:
                    d.pop("star", None)
        return {"ok": True}

    def set_known(self, args: dict) -> dict:
        """Mark a notebook entry as 已掌握 (or undo it). Keyed by the entry's lemma
        (a word) or its '§…' selection key (a phrase / sentence). The flag rides along
        in the entry, so it persists through save/restore and the frontend simply
        files known items into their own view."""
        key = (args or {}).get("key", "")
        known = bool((args or {}).get("known"))
        with self._lock:
            entry = self._notebook.get(key)
            if entry is not None:
                if known:
                    entry["known"] = True
                else:
                    entry.pop("known", None)
        return {"ok": True}

    # ---- pronunciation: permanent local cache (download once, replay from memory) ----
    def _audio_file(self, word: str, src: str = "yd", accent: str = "uk") -> Path:
        """Cache path for a word's mp3. MiniMax-generated audio is namespaced
        with a `.mm.` infix so it never collides with older 有道 files — that way
        the quality upgrade applies even to words cached before MiniMax was set.
        The accent (uk/us) is part of the key so the two pronunciations coexist."""
        import re, hashlib
        safe = re.sub(r"[^a-z0-9]+", "-", word.lower()).strip("-") or "word"
        # Full sentences (read-aloud) make filenames that can blow past the OS
        # 255-char limit, so anything long is truncated and disambiguated with a
        # short content hash — keeps the cache stable & collision-free.
        if len(safe) > 80:
            h = hashlib.md5(word.lower().encode("utf-8")).hexdigest()[:10]
            safe = safe[:80].rstrip("-") + "-" + h
        # .mm2 = HD/English-boost generation; bumping the infix invalidates the
        # earlier (mis-pronounced) turbo cache so words regenerate cleanly.
        acc = ".us" if accent == "us" else ".uk"
        base = ".mm2" if src == "mm" else ""
        return AUDIO_DIR / f"{safe}{base}{acc}.mp3"

    def _minimax_creds(self) -> tuple[str, str]:
        cfg = load_user_config()
        return ((cfg.get("minimax_key") or "").strip(),
                (cfg.get("minimax_group") or "").strip())

    def _download_minimax(self, text: str, key: str, gid: str, retries: int = 2,
                          voice_id: str = "English_expressive_narrator") -> bytes | None:
        """High-quality neural pronunciation via MiniMax T2A. Works for ANY text
        (phrases / inflected forms / proper nouns that 有道 has no entry for),
        which is exactly where the old path went silent. Returns mp3 bytes."""
        import urllib.request, urllib.parse, ssl, certifi
        url = "https://api.minimax.chat/v1/t2a_v2?GroupId=" + urllib.parse.quote(gid)
        # Give the synthesizer a clean sentence boundary so it doesn't clip the
        # final weak syllable (the "completed → complete" bug). Punctuation is
        # used for prosody only — it is never spoken.
        say = text.strip()
        if say and say[-1] not in ".?!":
            say = say + "."
        body = json.dumps({
            "model": "speech-02-hd",          # HD = accurate phonetics (turbo dropped endings)
            "text": say,
            "stream": False,
            "language_boost": "English",      # force English G2P — fixes "transactions" gibberish
            "english_normalization": True,    # read numbers/units the English way
            "voice_setting": {"voice_id": voice_id,
                              "speed": 0.95, "vol": 1.0, "pitch": 0},
            "audio_setting": {"sample_rate": 32000, "bitrate": 128000, "format": "mp3"},
        }).encode("utf-8")
        ctx = ssl.create_default_context(cafile=certifi.where())
        req = urllib.request.Request(
            url, data=body, method="POST",
            headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"},
        )
        for i in range(retries + 1):
            try:
                with urllib.request.urlopen(req, timeout=20, context=ctx) as r:
                    payload = json.loads(r.read().decode("utf-8"))
                hexaudio = ((payload.get("data") or {}).get("audio") or "")
                if hexaudio and len(hexaudio) > 400:
                    self._mm_err = ""                    # success → clear any prior error
                    return bytes.fromhex(hexaudio)
                # HTTP 200 but no audio → the real reason is in base_resp. Record a
                # human message, and for permanent failures (bad key / no balance)
                # stop retrying — retrying an invalid key just wastes 3 round-trips.
                sc = (payload.get("base_resp") or {}).get("status_code")
                if sc:
                    self._mm_err = _MINIMAX_ERR.get(sc, f"MiniMax 合成失败（code {sc}）")
                    if sc in _MINIMAX_FATAL:
                        return None
            except Exception:
                self._mm_err = "MiniMax 连接失败（网络或超时）"
                time.sleep(0.5 * (i + 1))
        return None

    def _download_audio(self, word: str, retries: int = 2, accent: str = "uk") -> bytes | None:
        import urllib.request, urllib.parse, ssl, certifi
        # type=1 英音 / type=2 美音
        url = ("https://dict.youdao.com/dictvoice?audio="
               + urllib.parse.quote(word) + "&type=" + _YOUDAO_TYPE.get(accent, "1"))
        ctx = ssl.create_default_context(cafile=certifi.where())
        req = urllib.request.Request(url, headers={"User-Agent": _BROWSER_UA})
        for i in range(retries + 1):
            try:
                with urllib.request.urlopen(req, timeout=10, context=ctx) as r:
                    data = r.read()
                if data and len(data) > 200:   # guard against error/empty bodies
                    return data
            except Exception:
                time.sleep(0.4 * (i + 1))
        return None

    @staticmethod
    def _serve_bytes(data: bytes) -> dict:
        import base64
        return {"ok": True, "data": "data:audio/mpeg;base64," + base64.b64encode(data).decode()}

    def _audio_minimax(self, word: str, mm_key: str, mm_gid: str, accent: str = "uk") -> dict | None:
        """Serve MiniMax audio for `word`, caching per accent. None on failure."""
        f = self._audio_file(word, "mm", accent)
        if f.exists():
            try:
                return self._serve_bytes(f.read_bytes())
            except Exception:
                pass
        data = self._download_minimax(word, mm_key, mm_gid,
                                      voice_id=_MINIMAX_VOICE.get(accent, _MINIMAX_VOICE["uk"]))
        if not data:
            return None
        try:
            AUDIO_DIR.mkdir(parents=True, exist_ok=True)
            f.write_bytes(data)
        except Exception:
            pass
        return self._serve_bytes(data)

    def _audio_youdao(self, word: str, accent: str = "uk") -> dict | None:
        """Serve 有道 dictvoice audio for `word`, caching per accent. None on failure."""
        f = self._audio_file(word, "yd", accent)
        if f.exists():
            try:
                return self._serve_bytes(f.read_bytes())
            except Exception:
                pass
        data = self._download_audio(word, accent=accent)
        if not data:
            return None
        try:
            AUDIO_DIR.mkdir(parents=True, exist_ok=True)
            f.write_bytes(data)
        except Exception:
            return self._serve_bytes(data)   # disk write failed; still serve
        return self._serve_bytes(data)

    def get_audio(self, args: dict) -> dict:
        """Return the word's pronunciation as a base64 data URI, downloading &
        caching it permanently on first request. Failures are NOT cached so a
        later click can retry. Plays from in-memory data → reliable replay.

        Source strategy is per-word-type, because the two engines have opposite
        strengths:
          • single word  → 有道 dictionary FIRST (real headword audio, full
            endings — MiniMax's narrator voice clips final syllables like
            "transactions"→"transaction", "completed"→"complete"). MiniMax is
            only a fallback for words 有道 has no entry for.
          • phrase / multi-word → MiniMax FIRST (有道 is weak on phrases and
            often returns nothing, which was the original "no sound" bug),
            有道 as fallback.
        If MiniMax isn't configured, everything just uses 有道."""
        word = (args or {}).get("word", "").strip().lower()
        if not word:
            return {"ok": False}
        accent = _accent_of(args)   # 英音(uk) / 美音(us) — one global toggle from the UI

        mm_key, mm_gid = self._minimax_creds()
        mm_on = bool(mm_key and mm_gid)
        is_phrase = (" " in word) or ("-" in word)

        if mm_on and is_phrase:
            order = [lambda: self._audio_minimax(word, mm_key, mm_gid, accent),
                     lambda: self._audio_youdao(word, accent)]
        elif mm_on:
            order = [lambda: self._audio_youdao(word, accent),
                     lambda: self._audio_minimax(word, mm_key, mm_gid, accent)]
        else:
            order = [lambda: self._audio_youdao(word, accent)]

        for attempt in order:
            res = attempt()
            if res:
                return res
        # Everything failed. If MiniMax left a specific reason (bad key / no balance),
        # pass it through so the read-aloud can tell the user exactly what to fix
        # instead of silently stalling.
        return {"ok": False, "error": (self._mm_err if (mm_on and self._mm_err) else "音频下载失败")}

    def _ensure_vocab_explanations(self, snapshot: str, out: dict[str, dict]) -> None:
        """Parse a reading snapshot and make sure EVERY highlighted vocab word has an
        explanation in `out` (keyed by lemma), generating the still-missing ones. Each
        word's sentence context is read from its enclosing <span class="sent" data-sentence>.
        No-op when the LLM isn't configured. Results are cached, so repeat exports are cheap."""
        if not snapshot or not getattr(self._explainer, "enabled", False):
            return
        import re, html as _html
        # positions of every sentence boundary, so each vocab mark can find its context
        sent_marks = [(m.start(), _html.unescape(m.group(1)))
                      for m in re.finditer(r'data-sentence="([^"]*)"', snapshot)]
        seen: set[str] = set()
        todo: list[dict] = []
        for m in re.finditer(r'<mark\b[^>]*class="[^"]*\bvocab\b[^"]*"[^>]*>', snapshot):
            tag = m.group(0)
            def attr(name, t=tag):
                a = re.search(r'%s="([^"]*)"' % name, t)
                return _html.unescape(a.group(1)) if a else ""
            lemma = (attr("data-lemma") or attr("data-word")).strip().lower()
            if not lemma or lemma in out or lemma in seen:
                continue
            seen.add(lemma)
            # nearest sentence opened before this mark
            sent = ""
            for pos, txt in sent_marks:
                if pos < m.start():
                    sent = txt
                else:
                    break
            todo.append({"word": attr("data-word") or lemma, "lemma": lemma,
                         "sentence": sent, "level": attr("data-level"),
                         "tier": attr("data-freq") or "rare"})
        if not todo:
            return
        token = self._token
        def one(it):
            try:
                r = self._get_explanation(it["word"], it["lemma"], it["sentence"],
                                          it["level"], it["tier"] or "rare", token)
                if r and r.get("explanation"):
                    out[it["lemma"]] = {k: v for k, v in r.items() if k != "cached"}
            except Exception:
                pass
        with ThreadPoolExecutor(max_workers=8) as ex:
            list(ex.map(one, todo))

    # ---- export (uses the latest reading snapshot, works for fresh & restored) ----
    def export_html(self, args: dict) -> dict:
        meta = self._cur_meta()
        if not meta:
            return {"error": "还没有解析任何文章"}
        theme = (args or {}).get("theme", DEFAULT_THEME)
        snapshot = (args or {}).get("html") or self._snapshot
        if not snapshot:
            return {"error": "没有可导出的内容"}
        out_dir = OUTPUT_DIR
        out_dir.mkdir(parents=True, exist_ok=True)
        title = meta["title"]
        html_path = out_dir / f"{_safe_filename(title)}.html"
        with self._lock:
            notebook = dict(self._notebook)
        # Every highlighted vocab word should carry a hover explanation in the export —
        # not just the ones the user clicked. Build the tip set from the pregenerated
        # cache, fill in any still-missing vocab words from the snapshot, then let the
        # user's own notebook entries win (they may carry follow-up Q&A etc.).
        exp_for_render: dict[str, dict] = {}
        with self._lock:
            exp_for_render.update(self._cache)
        try:
            self._ensure_vocab_explanations(snapshot, exp_for_render)
        except Exception:
            pass
        exp_for_render.update(notebook)
        render_standalone(title, meta["source"], snapshot, html_path,
                          explanations=exp_for_render, theme=theme)
        # Reveal the freshly-written file in Finder (highlighted inside its folder),
        # instead of popping a browser tab — that's the "convenient open-folder" the
        # user asked for, and it makes the export's location obvious.
        try:
            self.reveal_in_finder(str(html_path.resolve()))
        except Exception:
            pass
        return {"ok": True, "path": str(html_path.resolve()),
                "dir": str(out_dir.resolve())}

    def open_output_dir(self, args: dict | None = None) -> dict:
        """Open the export folder on its own (e.g. a toolbar 'open folder' button)."""
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        try:
            import subprocess
            target = str(OUTPUT_DIR.resolve())
            if sys.platform == "darwin":
                subprocess.run(["open", target], check=False)
            elif sys.platform.startswith("win"):
                subprocess.run(["explorer", target], check=False)
            else:
                subprocess.run(["xdg-open", target], check=False)
            return {"ok": True, "dir": target}
        except Exception as e:
            return {"error": str(e)}

    # ---- reading history / library ----
    def _cur_meta(self) -> dict | None:
        if self._book:
            return {"title": self._book["title"],
                    "source": self._book.get("display_source", "")}
        if self._last:
            return {"title": self._last["title"], "source": self._last["source"]}
        return getattr(self, "_restored_meta", None)

    def _index_path(self) -> Path:
        return LIBRARY / "index.json"

    def _read_index(self) -> list:
        p = self._index_path()
        if p.exists():
            try:
                return json.loads(p.read_text(encoding="utf-8"))
            except Exception as e:
                # 读到半截 JSON（并发写时的竞态）会静默返回 []，让书架/选材列表莫名全空。
                # 点灯：留下痕迹，下次再空能追溯到是解析失败而非真没数据。
                print(f"[situ] _read_index 解析失败（可能读到半截写入）：{type(e).__name__}: {e}",
                      file=sys.stderr, flush=True)
                return []
        return []

    def _write_index(self, items: list):
        # 原子写：先写 tmp 再 os.replace 换名（同目录 rename 原子）。避免复盘窗 server 线程
        # 并发读 index.json 时读到半截内容 → json.loads 失败 → _read_index 静默返回 []。
        LIBRARY.mkdir(parents=True, exist_ok=True)
        p = self._index_path()
        tmp = p.with_name(p.name + f".tmp.{os.getpid()}")
        data = json.dumps(items, ensure_ascii=False, indent=2)
        try:
            tmp.write_text(data, encoding="utf-8")
            os.replace(tmp, p)
        except Exception:
            # 失败清理残留 tmp，别在 library 目录留垃圾；异常照旧上抛给调用方
            try:
                tmp.unlink(missing_ok=True)
            except Exception:
                pass
            raise

    def save_session(self, args: dict) -> dict:
        """Persist the current reading snapshot + notebook to the library (upsert)."""
        meta = self._cur_meta()
        if not meta or not self._doc_id:
            return {"ok": False}

        # ---- 书模式分支 ----
        if self._book and self._doc_id:
            theme = (args or {}).get("theme", DEFAULT_THEME)
            page = int((args or {}).get("page", 0) or 0)
            bookmarks = (args or {}).get("bookmarks")
            highlights = (args or {}).get("highlights")
            dots = (args or {}).get("dots")
            phrases = (args or {}).get("phrases")
            with self._lock:
                notebook = list(reversed(list(self._notebook.values())))
            LIBRARY.mkdir(parents=True, exist_ok=True)
            record = {
                "id": self._doc_id, "mode": "book",
                "title": self._book["title"], "source": self._book.get("display_source", ""),
                "saved_at": time.time(), "level": self._level, "theme": theme,
                "epub_path": self._book.get("epub_path", ""),
                "current_chapter": self._book.get("current_idx", 0),
                "current_page": page,
                "chapter_count": len(self._book["chapters"]),
                "notebook": notebook,
                "bookmarks": bookmarks if bookmarks is not None else [],
                "highlights": highlights if highlights is not None else [],
                "dots": dots if dots is not None else [],
                "phrases": phrases if phrases is not None else [],
                "captures": (args or {}).get("captures") or [],
            }
            (LIBRARY / f"{self._doc_id}.json").write_text(
                json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
            items = [it for it in self._read_index() if it.get("id") != self._doc_id]
            items.insert(0, {"id": self._doc_id, "mode": "book", "title": record["title"],
                             "source": record["source"], "saved_at": record["saved_at"],
                             "level": self._level, "vocab_count": len(notebook)})
            self._write_index(items)
            self._maybe_trigger_sheaf(self._doc_id, record["captures"])
            return {"ok": True, "id": self._doc_id}

        # ---- 文章模式分支 ----
        html = (args or {}).get("html", "")
        theme = (args or {}).get("theme", DEFAULT_THEME)
        if html:
            self._snapshot = html
        with self._lock:
            notebook = list(reversed(list(self._notebook.values())))
        LIBRARY.mkdir(parents=True, exist_ok=True)
        record = {
            "id": self._doc_id, "mode": "article", "title": meta["title"], "source": meta["source"],
            "saved_at": time.time(), "level": self._level, "theme": theme,
            "article_html": self._snapshot, "notebook": notebook,
            "captures": (args or {}).get("captures") or [],
        }
        (LIBRARY / f"{self._doc_id}.json").write_text(
            json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
        # ④ 剪报封面：把文章 og:image 缓存成缩略图（幂等，失败静默回落 B）。
        # 放后台线程：慢图曾把整个 save_session 桥调用卡住最长 8s，且首拉失败会让历史
        # 先显示「无封面」——现在下载不挡存档，失败还有 list_library 补漏兜底。
        sitename = (self._last or {}).get("sitename") if self._last else None
        image_url = (self._last or {}).get("image") if self._last else None
        if image_url:
            threading.Thread(target=self._cache_article_cover,
                             args=(self._doc_id, image_url), daemon=True).start()
        # upsert index（记下 image 源地址，补漏时用）
        items = [it for it in self._read_index() if it.get("id") != self._doc_id]
        items.insert(0, {
            "id": self._doc_id, "mode": "article", "title": meta["title"], "source": meta["source"],
            "saved_at": record["saved_at"], "level": self._level,
            "vocab_count": len(notebook), "sitename": sitename, "image": image_url,
        })
        self._write_index(items)
        self._maybe_trigger_sheaf(self._doc_id, record["captures"])
        return {"ok": True, "id": self._doc_id}

    # ──────────────────────────────────────────────────────────────────────
    # 仅标记·收获集 后台生成管线（批α）
    # ──────────────────────────────────────────────────────────────────────
    def _sheaf_path(self, doc_id: str) -> Path:
        return SHEAF / f"{doc_id}.json"

    def _load_sheaf(self, doc_id: str) -> dict:
        """读收获集落盘；不存在或半截损坏都回空骨架（读到半截静默返回空 = 下轮整批重生成）。"""
        p = self._sheaf_path(doc_id)
        if p.exists():
            try:
                d = json.loads(p.read_text(encoding="utf-8"))
                d.setdefault("doc_id", doc_id)
                d.setdefault("items", [])
                d.setdefault("pending", [])
                return d
            except Exception as e:
                print(f"[situ] _load_sheaf 解析失败（可能读到半截写入）：{type(e).__name__}: {e}",
                      file=sys.stderr, flush=True)
        return {"doc_id": doc_id, "updated_at": time.time(), "items": [], "pending": []}

    def _write_sheaf(self, doc_id: str, data: dict) -> None:
        """原子写（tmp + os.replace，学 index.json 踩过的并发半截坑）。"""
        SHEAF.mkdir(parents=True, exist_ok=True)
        p = self._sheaf_path(doc_id)
        tmp = p.with_name(p.name + f".tmp.{os.getpid()}")
        payload = json.dumps(data, ensure_ascii=False, indent=2)
        try:
            tmp.write_text(payload, encoding="utf-8")
            os.replace(tmp, p)
        except Exception:
            try:
                tmp.unlink(missing_ok=True)
            except Exception:
                pass
            raise

    def _load_captures(self, doc_id: str) -> list:
        """从核批写好的 library/{doc_id}.json 里取 captures（只读，绝不改它的写入方）。"""
        p = LIBRARY / f"{doc_id}.json"
        if not p.exists():
            return []
        try:
            return json.loads(p.read_text(encoding="utf-8")).get("captures") or []
        except Exception:
            return []

    @staticmethod
    def _merge_captures(captures: list) -> list[dict]:
        """同 group 合并为一个条目（text 按 blockOrd 序拼接）；无 group 的每条自成一组。
        返回按阅读序（ch, blockOrd, start）排好的 merged 列表，cid=组内首条 id。"""
        groups: dict[str, list[dict]] = {}
        order: list[str] = []
        for c in captures:
            cid = c.get("id")
            if not cid:
                continue
            key = c.get("group") or f"__solo__{cid}"
            if key not in groups:
                groups[key] = []
                order.append(key)
            groups[key].append(c)

        def _ck(c):  # 组内 / 组间统一的阅读序键
            return ((c.get("ch") if c.get("ch") is not None else -1),
                    c.get("blockOrd") or 0,
                    c.get("start") if c.get("start") is not None else 0)

        merged = []
        for key in order:
            members = sorted(groups[key], key=_ck)
            head = members[0]
            text = " ".join((m.get("text") or "").strip() for m in members if (m.get("text") or "").strip())
            sentence = next(((m.get("sentence") or "").strip() for m in members
                             if (m.get("sentence") or "").strip()), "")
            merged.append({
                "cid": head.get("id"),
                "text": text,
                "sentence": sentence,
                "ch": head.get("ch"),
                "blockOrd": head.get("blockOrd"),
                "ts": head.get("ts"),
            })
        merged.sort(key=lambda m: ((m["ch"] if m["ch"] is not None else -1),
                                   m["blockOrd"] or 0))
        return merged

    def _sheaf_llm_call(self, entries: list[dict]) -> list[dict]:
        """一批 ≤10 条 → 一次 deepseek-chat 调用 → 返回按 idx 对齐的原始结果列表。
        失败重试 1 次；两次都失败抛异常给调用方（该批标 error 留 pending）。
        （单测通过 monkeypatch 本方法注入 mock LLM——这是唯一的网络接缝。）"""
        user = _sheaf_user_prompt(entries)
        last_err = None
        for attempt in range(2):
            try:
                resp = self._explainer.client.chat.completions.create(
                    model=SHEAF_MODEL,
                    messages=[{"role": "system", "content": SHEAF_SYSTEM},
                              {"role": "user", "content": user}],
                    temperature=0,   # 分档一致性红线：尽量确定性，同表达重跑落同档
                    max_tokens=3072,
                    response_format={"type": "json_object"},
                )
                content = resp.choices[0].message.content or "{}"
                from reader_core.llm import _extract_json
                data = _extract_json(content)
                items = data.get("items") if isinstance(data, dict) else None
                if not isinstance(items, list):
                    raise ValueError("LLM 未返回 items 数组")
                return items
            except Exception as e:
                last_err = e
        raise last_err or RuntimeError("sheaf LLM 调用失败")

    def _sheaf_build_items(self, entries: list[dict]) -> list[dict]:
        """调 LLM 并把结果组装成落盘 item（词块归位/分档/例句 + 原文句置 sents[0]）。
        整批失败时，每条回一个 status:error 的占位 item（留在 pending，下轮再试）。"""
        try:
            raw = self._sheaf_llm_call(entries)
        except Exception as e:
            print(f"[situ] sheaf 批生成失败（{len(entries)}条）：{type(e).__name__}: {e}",
                  file=sys.stderr, flush=True)
            return [self._sheaf_error_item(e) for e in entries]
        by_idx = {}
        for r in raw:
            if isinstance(r, dict) and isinstance(r.get("idx"), int):
                by_idx[r["idx"]] = r
        out = []
        for e in entries:
            r = by_idx.get(e["idx"])
            if not isinstance(r, dict):
                out.append(self._sheaf_error_item(e))
                continue
            out.append(self._sheaf_assemble_one(e, r))
        return out

    @staticmethod
    def _sheaf_error_item(entry: dict) -> dict:
        return {
            "cid": entry["cid"], "raw": entry["text"], "chunk": entry["text"],
            "snapped": False, "tier": 2, "def": "", "note": "", "sents": [],
            "ch": entry.get("ch"), "blockOrd": entry.get("blockOrd"),
            "ts": entry.get("ts"), "status": "error",
        }

    @staticmethod
    def _sheaf_assemble_one(entry: dict, r: dict) -> dict:
        raw = entry["text"]
        chunk = (str(r.get("chunk") or "").strip()) or raw
        try:
            tier = int(r.get("tier"))
        except (TypeError, ValueError):
            tier = 2
        if tier not in (1, 2, 3):
            tier = 2
        # 原文句放 sents[0]（src:true，逐字用真实原文，绝不让 LLM 改写它）；例句英文接后。
        sents = []
        if (entry.get("sentence") or "").strip():
            sents.append({"en": entry["sentence"].strip(), "src": True})
        for ex in (r.get("examples") or []):
            ex = str(ex or "").strip()
            if ex:
                sents.append({"en": ex})
            if len(sents) >= 4:
                break
        return {
            "cid": entry["cid"], "raw": raw, "chunk": chunk,
            "snapped": chunk.strip().lower() != raw.strip().lower(),
            "tier": tier,
            "def": str(r.get("def") or "").strip(),
            "note": str(r.get("note") or "").strip()[:40],
            "sents": sents,
            "ch": entry.get("ch"), "blockOrd": entry.get("blockOrd"),
            "ts": entry.get("ts"), "status": "done",
        }

    def _run_sheaf(self, doc_id: str, *, force_all: bool = False,
                   force_cids: set[str] | None = None) -> dict:
        """收获集生成核心（同步）：合并 captures → 删除同步 → 分批生成 → 原子落盘。
        force_all=全部重跑；force_cids=只重跑指定条目；都不传=只补未生成的（增量）。
        返回最终 sheaf dict。可被后台线程或 regen_sheaf 直接调。"""
        merged = self._merge_captures(self._load_captures(doc_id))
        by_cid = {m["cid"]: m for m in merged}
        live_cids = set(by_cid)

        sheaf = self._load_sheaf(doc_id)
        # ① 删除同步：captures 里已消失的 cid（用户取消了标记）→ 从 items/pending 移除。
        sheaf["items"] = [it for it in sheaf["items"] if it.get("cid") in live_cids]
        sheaf["pending"] = [c for c in sheaf["pending"] if c in live_cids]
        # ② 强制重跑：清掉目标 items，改回 pending。
        if force_all:
            sheaf["items"] = []
        elif force_cids:
            sheaf["items"] = [it for it in sheaf["items"] if it.get("cid") not in force_cids]

        done_cids = {it["cid"] for it in sheaf["items"] if it.get("status") == "done"}
        # ③ 待生成 = 活着但没 done 的（按阅读序），补进 pending 去重。
        todo_cids = [m["cid"] for m in merged if m["cid"] not in done_cids]
        sheaf["pending"] = todo_cids[:]  # pending 就是「已见但尚未生成」的全集

        if not todo_cids:
            sheaf["updated_at"] = time.time()
            self._write_sheaf(doc_id, sheaf)
            return sheaf

        items_by_cid = {it["cid"]: it for it in sheaf["items"]}
        batches = 0
        for start in range(0, len(todo_cids), SHEAF_BATCH):
            if batches >= SHEAF_MAX_BATCHES:
                print(f"[situ] sheaf 达单次批数上限（{SHEAF_MAX_BATCHES}批），剩余留 pending 下轮续",
                      file=sys.stderr, flush=True)
                break
            batches += 1
            chunk_cids = todo_cids[start:start + SHEAF_BATCH]
            entries = []
            for i, cid in enumerate(chunk_cids):
                m = by_cid[cid]
                entries.append({"idx": i, "cid": cid, "text": m["text"],
                                "sentence": m["sentence"], "ch": m["ch"],
                                "blockOrd": m["blockOrd"], "ts": m["ts"]})
            built = self._sheaf_build_items(entries)
            for it in built:
                items_by_cid[it["cid"]] = it
            # 每批落盘一次：读完开册时能渐次显影（批β 的骨架→ink-in），而非全等到最后。
            sheaf["items"] = [items_by_cid[m["cid"]] for m in merged if m["cid"] in items_by_cid]
            sheaf["pending"] = [c for c in todo_cids
                                if c not in items_by_cid or items_by_cid[c].get("status") != "done"]
            sheaf["updated_at"] = time.time()
            self._write_sheaf(doc_id, sheaf)
        return sheaf

    def _maybe_trigger_sheaf(self, doc_id: str, captures: list) -> None:
        """save_session 写盘后调：算 captures 与 sheaf 的差集，够阈值就起后台线程跑一批。
        触发：新增 ≥6 条，或 距上次生成 >90 秒且有新增（规格 §3.1）。同 doc 在跑则跳过。"""
        if not doc_id:
            return
        try:
            merged = self._merge_captures(captures or [])
            if not merged:
                return
            sheaf = self._load_sheaf(doc_id)
            known = {it["cid"] for it in sheaf["items"] if it.get("status") == "done"}
            new_cnt = sum(1 for m in merged if m["cid"] not in known)
            if new_cnt <= 0:
                return
            last = _sheaf_last_gen.get(doc_id, 0.0)
            hot = new_cnt >= SHEAF_TRIGGER_NEW or (time.time() - last) > SHEAF_TRIGGER_SECS
            if not hot:
                return
        except Exception as e:
            print(f"[situ] _maybe_trigger_sheaf 差集计算失败：{type(e).__name__}: {e}",
                  file=sys.stderr, flush=True)
            return
        if not getattr(self._explainer, "enabled", False):
            return  # 没配 key，起了也白搭；批β 会显「填 key 后生成」
        with _sheaf_lock:
            if doc_id in _sheaf_running:
                return
            _sheaf_running.add(doc_id)
            _sheaf_last_gen[doc_id] = time.time()
        threading.Thread(target=self._sheaf_worker, args=(doc_id,),
                         daemon=True, name=f"situ-sheaf-{doc_id[:8]}").start()

    def _sheaf_worker(self, doc_id: str, **kw) -> None:
        try:
            self._run_sheaf(doc_id, **kw)
        except Exception as e:
            print(f"[situ] sheaf 后台线程崩溃：{type(e).__name__}: {e}",
                  file=sys.stderr, flush=True)
        finally:
            with _sheaf_lock:
                _sheaf_running.discard(doc_id)

    def get_sheaf(self, args: dict) -> dict:
        """批β 用：取某文档的收获集全量 JSON（含 items/pending/updated_at）。
        doc_id 省略时回落到当前正在读的这篇（右栏收获 tab 直接调 get_sheaf({}) 即可）。"""
        doc_id = ((args or {}).get("doc_id") or "").strip() or (self._doc_id or "")
        if not doc_id:
            return {"ok": False, "error": "缺 doc_id"}
        sheaf = self._load_sheaf(doc_id)
        # ⑥ 惰性删除同步：即使没达生成阈值（纯取消划痕），也用当前 captures 的活 cid 集合
        #    过滤掉幽灵条目——只影响本次返回视图，不落盘（真正落盘删除仍由下次 _run_sheaf 收口）。
        live_cids = {m["cid"] for m in self._merge_captures(self._load_captures(doc_id))}
        sheaf["items"] = [it for it in sheaf.get("items", []) if it.get("cid") in live_cids]
        sheaf["pending"] = [c for c in sheaf.get("pending", []) if c in live_cids]
        with _sheaf_lock:
            running = doc_id in _sheaf_running
        return {"ok": True, "running": running, "title": self._sheaf_title(doc_id), **sheaf}

    def regen_sheaf(self, args: dict) -> dict:
        """强制重跑：cids 传了只重跑这些条目，不传则全部重跑。后台线程跑，前端轮询 get_sheaf。"""
        doc_id = ((args or {}).get("doc_id") or "").strip() or (self._doc_id or "")
        if not doc_id:
            return {"ok": False, "error": "缺 doc_id"}
        cids = (args or {}).get("cids")
        with _sheaf_lock:
            if doc_id in _sheaf_running:
                return {"ok": True, "running": True, "note": "已有批在跑"}
            _sheaf_running.add(doc_id)
            _sheaf_last_gen[doc_id] = time.time()
        kw = {"force_cids": set(cids)} if cids else {"force_all": True}
        threading.Thread(target=self._sheaf_worker, args=(doc_id,), kwargs=kw,
                         daemon=True, name=f"situ-sheaf-regen-{doc_id[:8]}").start()
        return {"ok": True, "running": True}

    def nudge_sheaf(self, args: dict) -> dict:
        """收获 tab 开着（用户正盯着看）时前端催一把：只要有活着但没生成的划痕、且没在跑，
        就立刻起批，不等 90s/6 条被动阈值——把「读完即得」在用户真在看时兑现。
        仍受同 doc 单飞锁保护（绝不并发重复跑）；没有待生成的 / 没配 key 直接返回不起线程。"""
        doc_id = ((args or {}).get("doc_id") or "").strip() or (self._doc_id or "")
        if not doc_id:
            return {"ok": False, "error": "缺 doc_id"}
        if not getattr(self._explainer, "enabled", False):
            return {"ok": True, "running": False}   # 没 key，起了也白搭（批β 显「填 key 后生成」）
        try:
            merged = self._merge_captures(self._load_captures(doc_id))
            sheaf = self._load_sheaf(doc_id)
            done = {it["cid"] for it in sheaf.get("items", []) if it.get("status") == "done"}
            todo = [m for m in merged if m["cid"] not in done]
        except Exception as e:
            print(f"[situ] nudge_sheaf 差集计算失败：{type(e).__name__}: {e}", file=sys.stderr, flush=True)
            return {"ok": False, "error": str(e)}
        if not todo:
            return {"ok": True, "running": False}   # 已全生成，无需催
        with _sheaf_lock:
            if doc_id in _sheaf_running:
                return {"ok": True, "running": True}
            _sheaf_running.add(doc_id)
            _sheaf_last_gen[doc_id] = time.time()
        threading.Thread(target=self._sheaf_worker, args=(doc_id,),
                         daemon=True, name=f"situ-sheaf-nudge-{doc_id[:8]}").start()
        return {"ok": True, "running": True}

    def _sheaf_title(self, doc_id: str) -> str:
        """收获集导出/呈现用的书名：优先当前 meta，回落 library 记录标题。"""
        if doc_id == self._doc_id:
            m = self._cur_meta()
            if m and m.get("title"):
                return m["title"]
        p = LIBRARY / f"{doc_id}.json"
        if p.exists():
            try:
                return json.loads(p.read_text(encoding="utf-8")).get("title") or "收获集"
            except Exception:
                pass
        return "收获集"

    def export_sheaf_html(self, args: dict) -> dict:
        """把收获集导出成完全自包含 HTML（内联全部 CSS，双列版式=样机③页甲改原版；
        无外链、无 JS 依赖），落 OUTPUT_DIR 并在 Finder 里高亮显示（学 export_html 做法）。"""
        doc_id = ((args or {}).get("doc_id") or "").strip() or (self._doc_id or "")
        if not doc_id:
            return {"error": "缺 doc_id"}
        sheaf = self._load_sheaf(doc_id)
        items = [it for it in sheaf.get("items", []) if it.get("status") == "done"]
        if not items:
            return {"error": "收获集还没有可导出的条目"}
        title = self._sheaf_title(doc_id)
        html = _render_sheaf_standalone(title, items)
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        import datetime
        stamp = datetime.date.today().strftime("%y%m%d")
        fname = f"收获集-{_safe_filename(title)[:20]}-{stamp}.html"
        out = OUTPUT_DIR / fname
        out.write_text(html, encoding="utf-8")
        try:
            self.reveal_in_finder(str(out.resolve()))
        except Exception:
            pass
        return {"ok": True, "path": str(out.resolve()), "dir": str(OUTPUT_DIR.resolve())}

    def open_external(self, args: dict) -> dict:
        """在系统默认浏览器打开外部链接（供文章来源超链接「跳转原文」用）。
        只放行 http/https，避免被诱导打开本地文件 / 自定义 scheme。"""
        url = (args or {}).get("url", "").strip()
        if not (url.startswith("http://") or url.startswith("https://")):
            return {"ok": False, "error": "仅支持 http/https 链接"}
        try:
            webbrowser.open(url)
            return {"ok": True}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def _cover_thumb(self, book_id: str) -> str | None:
        """真封面缩略图（base64 data URL），首次请求时从 epub 抽取 + 缩放 + 落盘缓存。
        没有可用封面时写一个 `{id}.none` 哨兵，避免每次首页渲染都重开 epub 白忙。"""
        if not book_id:
            return None
        import base64
        jpg = COVERS / f"{book_id}.jpg"
        none_marker = COVERS / f"{book_id}.none"
        if jpg.exists():
            try:
                return "data:image/jpeg;base64," + base64.b64encode(jpg.read_bytes()).decode()
            except Exception:
                return None
        if none_marker.exists():
            return None
        COVERS.mkdir(parents=True, exist_ok=True)
        epub_p = BOOKS / f"{book_id}.epub"
        if not epub_p.exists():
            return None

        def _mark_none():
            try:
                none_marker.write_bytes(b"")
            except Exception:
                pass

        try:
            from reader_core.extractor import extract_cover
            raw = extract_cover(str(epub_p))
        except Exception:
            raw = None
        if not raw:
            _mark_none()
            return None
        try:
            import io
            from PIL import Image
            im = Image.open(io.BytesIO(raw))
            if im.mode not in ("RGB", "L"):
                im = im.convert("RGB")
            w, h = im.size
            target_w = 300   # hero 显示 172px，Retina 2x → 300 足够清晰，JPEG 后 ~15-30KB
            if w > target_w:
                im = im.resize((target_w, max(1, round(h * target_w / w))), Image.LANCZOS)
            buf = io.BytesIO()
            im.convert("RGB").save(buf, format="JPEG", quality=82, optimize=True)
            data = buf.getvalue()
            jpg.write_bytes(data)
            return "data:image/jpeg;base64," + base64.b64encode(data).decode()
        except Exception:
            _mark_none()
            return None

    def _cache_article_cover(self, doc_id: str, image_url: str | None) -> None:
        """④ 剪报封面 C：把文章 og:image 下载 + 缩放 + 落盘缓存到 covers/{id}.jpg。
        无图 / 下载失败 → 静默跳过（不写 .none，前端自然回落排版式 B）。幂等：已缓存则不重拉。
        慢源（如 globalnews 的大图）单次 8s 常超时 → 12s + 一次重试，减少「历史里先没封面、
        过一会又有了」的闪变；配合 list_library 的补漏，漏网的下次进首页自动补上。"""
        if not doc_id or not image_url:
            return
        jpg = COVERS / f"{doc_id}.jpg"
        if jpg.exists():
            return
        try:
            import requests
            try:
                import certifi
                verify = certifi.where()
            except Exception:
                verify = True
            raw = None
            last = None
            for _attempt in range(2):
                try:
                    resp = requests.get(image_url, timeout=12, verify=verify, headers={
                        "User-Agent": ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                                       "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15")})
                    resp.raise_for_status()
                    raw = resp.content
                    break
                except Exception as e:
                    last = e
            if raw is None:
                raise last or RuntimeError("下载失败")
            COVERS.mkdir(parents=True, exist_ok=True)
            import io
            from PIL import Image
            im = Image.open(io.BytesIO(raw))
            if im.mode not in ("RGB", "L"):
                im = im.convert("RGB")
            w, h = im.size
            target_w = 460   # 剪报卡显示 ~210px，Retina 2x 足够；横幅裁进卡由前端 object-fit 处理
            if w > target_w:
                im = im.resize((target_w, max(1, round(h * target_w / w))), Image.LANCZOS)
            buf = io.BytesIO()
            im.convert("RGB").save(buf, format="JPEG", quality=82, optimize=True)
            jpg.write_bytes(buf.getvalue())
        except Exception:
            pass   # 无封面就无封面，回落 B，不阻断保存

    def _read_cached_cover(self, doc_id: str) -> str | None:
        """读已缓存的封面缩略图（base64 data URL）。文章封面只读缓存、不即时抓取。"""
        if not doc_id:
            return None
        jpg = COVERS / f"{doc_id}.jpg"
        if not jpg.exists():
            return None
        try:
            import base64
            return "data:image/jpeg;base64," + base64.b64encode(jpg.read_bytes()).decode()
        except Exception:
            return None

    def list_library(self) -> list:
        items = self._read_index()
        items.sort(key=lambda x: x.get("saved_at", 0), reverse=True)
        for it in items:
            if it.get("mode") == "book":
                cov = self._cover_thumb(it.get("id", ""))
                if cov:
                    it["cover"] = cov
            elif it.get("mode") == "article":
                cov = self._read_cached_cover(it.get("id", ""))   # ④ 有 og:image 缓存则显图(C)，否则前端回落 B
                if cov:
                    it["cover"] = cov
                elif it.get("image"):
                    # 补漏：存档时没下下来的封面（网络慢/超时），进首页时后台悄悄补抓，
                    # 下次渲染就有了。每会话每篇只试一次，不空转。
                    did = it.get("id", "")
                    if did and did not in self._cover_heal_tried:
                        self._cover_heal_tried.add(did)
                        threading.Thread(target=self._cache_article_cover,
                                         args=(did, it["image"]), daemon=True).start()
        return items

    def list_library_brief(self) -> list:
        """口语复盘「选材屏」专用：只回目录元信息（标题/来源/时间/mode），不附 base64 封面。
        选材屏只画标题/来源/日期、根本不显示封面；而 list_library 会给每条内嵌 base64 缩略图，
        整包能到数百 KB，白下拖慢、还是 WebKit fetch 偶发 abort（Load failed）的高嫌疑点。
        直接返回索引原始条目（image 只是 URL 字段，小），不做任何封面富化。"""
        items = self._read_index()
        items.sort(key=lambda x: x.get("saved_at", 0), reverse=True)
        return items

    # ---- 首页「读物精选」RSS 来源带：拉某个 feed 的最新文章列表 ----
    def fetch_feed(self, args: dict) -> dict:
        """拉一个 RSS(<item>) 或 Atom(<entry>) feed，返回前 ~20 条 {title,url,date,summary}。
        标准库 xml.etree.ElementTree 解析（不新增打包依赖，不用 feedparser）。单条解析失败
        就跳过，不让一条脏 item 拖垮整个 feed。点文章走现成 process({source:url})，
        extract_text 已支持 http(s) 抓正文（见 extractor.py extract_text L37）。"""
        url = (args or {}).get("url", "").strip()
        if not url:
            return {"ok": False, "error": "缺少 url"}
        import xml.etree.ElementTree as ET
        import requests
        try:
            import certifi
            verify = certifi.where()
        except Exception:
            verify = True
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
            ),
            "Accept": "application/rss+xml,application/atom+xml,application/xml;q=0.9,*/*;q=0.8",
        }
        # 慢源（如 CNA 的 RSS）首拉常 >8s 超时 → 拉长到 12s 并给一次重试，减少「加载失败」。
        last_err = None
        root = None
        for _attempt in range(2):
            try:
                with requests.Session() as s:
                    s.headers.update(headers)
                    resp = s.get(url, timeout=12, verify=verify)
                    resp.raise_for_status()
                    root = ET.fromstring(resp.content)
                last_err = None
                break
            except Exception as e:
                last_err = e
        if last_err is not None or root is None:
            return {"ok": False, "error": f"抓取失败：{last_err}"}

        def _tag(el):
            # strip XML namespace: '{http://...}title' -> 'title'
            t = el.tag
            return t.split("}", 1)[1] if "}" in t else t

        items = []
        # Atom: <feed><entry>...</entry></feed>；RSS: <rss><channel><item>...</item></channel></rss>
        is_atom = _tag(root) == "feed"
        entries = root.findall(".//{*}entry") if is_atom else root.findall(".//{*}item")
        for entry in entries[:20]:
            try:
                title = ""
                link = ""
                date = ""
                summary = ""
                for child in entry:
                    tag = _tag(child)
                    if tag == "title":
                        title = (child.text or "").strip()
                    elif tag == "link":
                        if is_atom:
                            href = child.get("href", "")
                            rel = child.get("rel", "alternate")
                            if href and (not link or rel == "alternate"):
                                link = href.strip()
                        else:
                            link = (child.text or "").strip()
                    elif tag in ("pubDate", "published", "updated") and not date:
                        date = (child.text or "").strip()
                    elif tag in ("description", "summary") and not summary:
                        summary = (child.text or "").strip()
                if not title or not link:
                    continue
                items.append({"title": title, "url": link, "date": date, "summary": summary[:240]})
            except Exception:
                continue   # 单条脏数据跳过，不拖垮整个 feed
        return {"ok": True, "items": items}

    # ---- 读物精选：自定义来源（持久化 DATA_ROOT/feed_sources.json，内置源不动）----
    def _read_feed_sources(self) -> list:
        try:
            return json.loads(FEEDS_FILE.read_text(encoding="utf-8"))
        except Exception:
            return []

    def _write_feed_sources(self, lst: list) -> None:
        FEEDS_FILE.write_text(json.dumps(lst, ensure_ascii=False, indent=1), encoding="utf-8")

    def list_feed_sources(self) -> list:
        return self._read_feed_sources()

    def remove_feed_source(self, args: dict) -> dict:
        sid = (args or {}).get("id", "")
        lst = [s for s in self._read_feed_sources() if s.get("id") != sid]
        self._write_feed_sources(lst)
        return {"ok": True}

    def add_feed_source(self, args: dict) -> dict:
        """验证并保存一个自定义来源。输入可以是 feed 地址，也可以是普通网页地址——
        后者自动做 feed 发现（<link rel=alternate type=…rss/atom…>），找到就用；
        真不是 feed 才提示用户。名字/简介取自 feed 自身的 <title>/<description>。"""
        import re, hashlib
        url = ((args or {}).get("url", "") or "").strip()
        if not url:
            return {"ok": False, "error": "请先粘贴一个地址"}
        if not re.match(r"^https?://", url, re.I):
            url = "https://" + url

        import xml.etree.ElementTree as ET
        import requests
        from urllib.parse import urljoin, urlparse
        try:
            import certifi
            verify = certifi.where()
        except Exception:
            verify = True
        headers = {
            "User-Agent": _BROWSER_UA,
            "Accept": "application/rss+xml,application/atom+xml,application/xml;q=0.9,*/*;q=0.8",
        }

        def _fetch(u: str):
            with requests.Session() as s:
                s.headers.update(headers)
                resp = s.get(u, timeout=12, verify=verify)
                resp.raise_for_status()
                return resp.content

        def _try_parse_feed(content: bytes):
            """能解析成 RSS/Atom 就返回 (name, desc)，否则 None。"""
            try:
                root = ET.fromstring(content)
            except Exception:
                return None
            tag = root.tag.split("}", 1)[1] if "}" in root.tag else root.tag
            if tag == "feed":       # Atom
                t = root.find("{*}title"); st = root.find("{*}subtitle")
                return ((t.text or "").strip() if t is not None else "",
                        (st.text or "").strip() if st is not None else "")
            if tag in ("rss", "RDF"):   # RSS 2.0 / RSS 1.0(RDF)
                ch = root.find("{*}channel")
                if ch is None:
                    ch = root.find("channel")
                if ch is None:
                    return None
                name = desc = ""
                for c in ch:
                    ct = c.tag.split("}", 1)[1] if "}" in c.tag else c.tag
                    if ct == "title":
                        name = (c.text or "").strip()
                    elif ct == "description":
                        desc = (c.text or "").strip()
                return (name, desc)
            return None

        try:
            content = _fetch(url)
        except Exception as e:
            return {"ok": False, "error": f"打不开这个地址：{e}"}

        feed_url = url
        parsed = _try_parse_feed(content)
        if parsed is None:
            # 不是 feed → 在 HTML 里找 <link rel="alternate" type="…rss/atom…" href>
            html = content.decode("utf-8", "ignore")
            found = None
            for m in re.finditer(r"<link\b[^>]*>", html[:200_000], re.I):
                tag_html = m.group(0)
                if not re.search(r"rel=[\"']?alternate", tag_html, re.I):
                    continue
                if not re.search(r"type=[\"']?application/(rss|atom)\+xml", tag_html, re.I):
                    continue
                hm = re.search(r"href=[\"']([^\"'>\s]+)[\"']?", tag_html, re.I)
                if hm:
                    found = urljoin(url, hm.group(1))
                    break
            if not found:
                return {"ok": False, "error": "这不是 RSS/Atom 源，也没找到它的 feed——试试站点的 /feed 或 /rss 地址"}
            try:
                content = _fetch(found)
            except Exception as e:
                return {"ok": False, "error": f"找到 feed 但打不开：{e}"}
            parsed = _try_parse_feed(content)
            if parsed is None:
                return {"ok": False, "error": "站点声明的 feed 解析不了，换个地址试试"}
            feed_url = found

        host = urlparse(feed_url).netloc.replace("www.", "")
        name = re.sub(r"\s+", " ", parsed[0]).strip()
        if not name:
            # feed 自己没起名（如 globalnews.ca 的 <title> 是空的）→ 去站点首页拿
            # og:site_name / <title>（如 "Global News"）；再不行才回落首字母大写的 host。
            try:
                sp = urlparse(feed_url)
                home = _fetch(f"{sp.scheme}://{sp.netloc}").decode("utf-8", "ignore")[:200_000]
                m = (re.search(r"<meta[^>]+property=[\"']og:site_name[\"'][^>]+content=[\"']([^\"'<>]+)[\"']", home, re.I)
                     or re.search(r"<meta[^>]+content=[\"']([^\"'<>]+)[\"'][^>]+property=[\"']og:site_name[\"']", home, re.I)
                     or re.search(r"<title[^>]*>([^<|–—-]{2,60})", home, re.I))
                if m:
                    name = re.sub(r"\s+", " ", m.group(1)).strip()
            except Exception:
                pass
        if not name:
            label = host.split(".")[0]
            name = (label[:1].upper() + label[1:]) if label else host
        desc = re.sub(r"<[^>]+>", "", re.sub(r"\s+", " ", parsed[1])).strip()
        if len(name) > 40:
            name = name[:40].rstrip() + "…"
        if len(desc) > 48:
            desc = desc[:48].rstrip() + "…"
        if not desc:
            desc = host

        lst = self._read_feed_sources()
        norm = feed_url.rstrip("/").lower()
        for s in lst:
            if (s.get("url", "").rstrip("/").lower()) == norm:
                return {"ok": False, "error": "这个来源已经在架上了"}
        sid = "u" + hashlib.md5(norm.encode()).hexdigest()[:8]
        src = {"id": sid, "name": name, "desc": desc, "url": feed_url}
        lst.append(src)
        self._write_feed_sources(lst)
        return {"ok": True, "source": src}

    # ---- 读物精选：文章预取（悬停/开列表时提前抓好 HTML，点开近乎秒出）----
    def prewarm_article(self, args: dict) -> dict:
        """只做两件事：① 把文章 HTML 抓进 extractor 的短时缓存（process 复用，免去
        点击后最大头的网络等待）；② 回传 og:image 地址让前端预热图片进 WebKit 缓存
        （图文同现）。不碰 LLM、不写库、幂等。"""
        url = ((args or {}).get("url", "") or "").strip()
        if not url.startswith(("http://", "https://")):
            return {"ok": False}
        try:
            from reader_core.extractor import fetch_url_html_cached
            html = fetch_url_html_cached(url)
            import trafilatura
            meta = trafilatura.extract_metadata(html)
            return {"ok": True, "image": (meta.image if meta else None)}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def load_archive(self, args: dict) -> dict:
        doc_id = (args or {}).get("id", "")
        p = LIBRARY / f"{doc_id}.json"
        if not p.exists():
            return {"error": "存档不存在"}
        rec = json.loads(p.read_text(encoding="utf-8"))

        # ---- 书模式分支 ----
        if rec.get("mode") == "book":
            epub_path = rec.get("epub_path", "")
            if not epub_path or not Path(epub_path).exists():
                return {"error": "这本书的文件已丢失（可能数据目录被清理），请重新导入。"}
            import time as _time
            _t0 = _time.perf_counter()
            title, chapters = extract_book(epub_path)
            _t1 = _time.perf_counter()
            print(f"[open] extract_book {(_t1-_t0)*1000:.0f}ms ({len(chapters)} chapters)")
            nb = {item["lemma"]: item for item in rec.get("notebook", []) if item.get("lemma")}
            with self._lock:
                self._token += 1
                self._cache = dict(nb); self._notebook = dict(nb)
                self._inflight = {}; self._pregen = {"done": 0, "total": 0, "running": False}
            self._book_seen_lemmas = set()
            self._book = {"title": title, "source": rec.get("source", ""), "chapters": chapters,
                          "current_idx": -1, "epub_path": epub_path,
                          "display_source": rec.get("source", "")}
            self._doc_id = rec["id"]; self._level = rec.get("level", "cet4-6")
            with self._lock:
                self._load_pregen_cache(self._doc_id, self._level)  # 讲解缓存持久化：命中即免调 LLM
            self._restored_meta = {"title": title, "source": rec.get("source", "")}
            idx = max(0, min(int(rec.get("current_chapter", 0)), len(chapters) - 1))
            _t2 = _time.perf_counter()
            chap = self._load_chapter_internal(idx)
            print(f"[open] load_chapter[{idx}] {(_time.perf_counter()-_t2)*1000:.0f}ms")
            return {"ok": True, "mode": "book", "title": title,
                    "toc": self._toc_list(), "chapter_idx": idx,
                    "chapter_count": len(chapters),
                    "current_page": int(rec.get("current_page", 0) or 0),
                    "theme": rec.get("theme", DEFAULT_THEME),
                    "bookmarks": rec.get("bookmarks") or [],
                    "highlights": rec.get("highlights") or [],
                    "dots": rec.get("dots") or [],
                    "phrases": rec.get("phrases") or [],
                    "captures": rec.get("captures") or [],
                    "llm_enabled": self._explainer.enabled, **chap}

        # ---- 文章模式分支 ----
        # 重置书状态，防止 _cur_meta 仍以为在书模式
        self._book = None
        nb = {item["lemma"]: item for item in rec.get("notebook", []) if item.get("lemma")}
        with self._lock:
            self._token += 1
            self._cache = dict(nb)
            self._notebook = dict(nb)
            self._inflight = {}
            self._pregen = {"done": 0, "total": 0, "running": False}
        self._restored_meta = {"title": rec["title"], "source": rec["source"]}
        self._doc_id = rec["id"]
        self._snapshot = rec.get("article_html", "")
        self._level = rec.get("level", DEFAULT_THEME)
        # 补充批2 #4a：文章回看此前把 self._last 置 None，导致点词没有 classifier→
        # 没有 daily_rank/freq_band→讲解区不上色、无角标。重建一个只需频率表的轻量
        # classifier（classify_word 只依赖频率表 + spaCy，不需要整篇分析报告），
        # 让文章回看点词也能拿到 freq_band，短语/句「重点词汇」上色在回看文章里同样生效。
        # 放在 self._level 赋值之后构造，确保用的是这篇文章自己的 level。
        try:
            classifier = VocabClassifier(user_level=self._level or "cet4-6")
        except Exception:
            classifier = None
        self._last = {"title": rec["title"], "source": rec["source"],
                      "classifier": classifier, "vocab_order": [], "report": None}
        with self._lock:
            self._load_pregen_cache(self._doc_id, self._level)  # 讲解缓存持久化：命中即免调 LLM
        return {
            "ok": True, "mode": "article", "title": rec["title"], "source": rec["source"],
            "article_html": rec.get("article_html", ""),
            "theme": rec.get("theme", DEFAULT_THEME),
            "level": rec.get("level", ""),
            "notebook_count": len(nb),
            "captures": rec.get("captures") or [],
        }

    def delete_archive(self, args: dict) -> dict:
        doc_id = (args or {}).get("id", "")
        p = LIBRARY / f"{doc_id}.json"
        try:
            if p.exists():
                p.unlink()
        except Exception:
            pass
        # 连带删除 epub 原件（书模式）
        try:
            epub_p = BOOKS / f"{doc_id}.epub"
            if epub_p.exists():
                epub_p.unlink()
        except Exception:
            pass
        # 连带删除封面缩略图缓存 + none 哨兵
        for suffix in (".jpg", ".none"):
            try:
                cp = COVERS / f"{doc_id}{suffix}"
                if cp.exists():
                    cp.unlink()
            except Exception:
                pass
        self._write_index([it for it in self._read_index() if it.get("id") != doc_id])
        return {"ok": True}

    def export_csv(self, args: dict) -> dict:
        """把前端拼好的 CSV 文本写进 output/ 并在访达中打开。用户无 Tauri，走原生写文件最稳。"""
        csv = (args or {}).get("csv", "")
        if not csv:
            return {"error": "没有可导出的内容"}
        name = _safe_filename((args or {}).get("filename") or "生词表") or "生词表"
        if not name.lower().endswith(".csv"):
            name += ".csv"
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        path = OUTPUT_DIR / name
        path.write_text("﻿" + csv, encoding="utf-8")   # BOM：保证 Excel 正确识别 UTF-8
        try:
            self.reveal_in_finder(str(path.resolve()))
        except Exception:
            pass
        return {"ok": True, "path": str(path)}

    def copy_text(self, args: dict) -> dict:
        """复制到系统剪贴板（macOS pbcopy；WKWebView 下 navigator.clipboard 常被禁，走原生最稳）。"""
        text = (args or {}).get("text", "")
        try:
            import subprocess
            if sys.platform == "darwin":
                p = subprocess.run(["pbcopy"], input=text, text=True)
                return {"ok": p.returncode == 0}
            if sys.platform.startswith("win"):
                subprocess.run(["clip"], input=text.encode("utf-16"), shell=True)
                return {"ok": True}
            subprocess.run(["xclip", "-selection", "clipboard"], input=text, text=True)
            return {"ok": True}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def reveal_in_finder(self, path: str) -> dict:
        try:
            import subprocess
            target = str(Path(path).resolve())
            if sys.platform == "darwin":
                subprocess.run(["open", "-R", target], check=False)
            elif sys.platform.startswith("win"):
                subprocess.run(["explorer", "/select,", target], check=False)
            else:
                subprocess.run(["xdg-open", str(Path(target).parent)], check=False)
            return {"ok": True}
        except Exception as e:
            return {"error": str(e)}

    def open_review(self) -> dict:
        """「口语复盘」原生窗口（2026-07-07：复盘并入真四土，不再跳浏览器）。

        复盘/词块/对话录音的前端整套住在 santu_app/mobile/（JS 大脑 + IndexedDB），
        依赖同源的手机版 server 当静态托管 + 火山代理 + 录音遥控。这里在本进程内
        起该 server 的守护线程，再开第二个 pywebview 窗口指过去；窗口存储与主窗
        同一 storage_path，历史/设置跨重启留存在四土名下。
        """
        try:
            err = _ensure_review_server()
            if err:
                return {"ok": False, "error": err}
            global _review_window
            if _review_window is not None:
                try:  # 已开着就聚焦，不再开第二扇
                    _review_window.show()
                    return {"ok": True, "focused": True}
                except Exception:
                    _review_window = None  # 已被用户关掉——重开
            win = webview.create_window(
                title="四土 · 口语复盘",
                url="http://127.0.0.1:18760/#review",
                width=1080, height=800, min_size=(720, 560),
                background_color="#f7f2e8",
            )
            _review_window = win

            def _forget(*_a):
                global _review_window
                _review_window = None
            win.events.closed += _forget
            return {"ok": True}
        except Exception as e:
            return {"ok": False, "error": f"{type(e).__name__}: {e}"}

    def open_review_retell(self, args: dict) -> dict:
        """阅读页「复述」按钮（阅读联动 2026-07-07）：把当前篇目递给复盘窗做复述练习。

        条子放在 server 模块变量里（同进程 import，先递再开窗，无竞态）；复盘窗的
        输入屏渲染/录音看守/窗口聚焦三处都会来取（GET /api/retell_pending，取一次即清）。
        """
        title = ((args or {}).get("title") or "").strip()
        text = ((args or {}).get("text") or "").strip()
        if not title and not text:
            return {"ok": False, "error": "没有可复述的内容"}
        # 收获集勾选来的目标词块（批β γ）：随条子带过去，让复述直接以这些为目标表达。
        # 复盘窗 _setRetell 若识别 payload.chunks 就优先用它，识别不了则回落原有 retell_targets
        # 自动挑（向后兼容，不破坏批⁶ 现状）。
        payload = {"title": title[:200], "text": text[:60000]}
        chunks = (args or {}).get("chunks")
        if isinstance(chunks, list) and chunks:
            clean = []
            for c in chunks[:8]:
                if not isinstance(c, dict):
                    continue
                t = str(c.get("text") or "").strip()
                if t:
                    clean.append({"text": t[:80],
                                  "meaning": str(c.get("meaning") or "").strip()[:40],
                                  "quote": str(c.get("quote") or "").strip()[:300]})
            if clean:
                payload["chunks"] = clean
        from santu_app import server as _rs
        _rs.set_retell_pending(payload)
        return self.open_review()


_review_window = None
_review_server_started = False
_review_server_lock = threading.Lock()


def _ensure_review_server() -> str | None:
    """确保 18760 上跑着**本进程**的手机版 server 线程；成功返回 None，失败返回原因。

    端口若被外部进程占着（此前双击 .command 留下的独立 server、乃至孤儿旧代码），
    一律清掉再自己起——「先清端口再总是新起」，绝不把窗口指向来历不明的旧 server。
    """
    global _review_server_started
    with _review_server_lock:
        import socket
        import subprocess
        if _review_server_started:
            # 旗标不可尽信：线程可能被外力弄死（测试脚本清端口、系统回收……）。
            # 连一下才算数；连不上就当没起过，走下面的全流程重建。
            try:
                with socket.create_connection(("127.0.0.1", 18760), timeout=0.3):
                    return None
            except OSError:
                _review_server_started = False
        try:
            out = subprocess.run(["lsof", "-ti:18760"], capture_output=True,
                                 text=True, timeout=3).stdout
            for tok in out.split():
                try:
                    os.kill(int(tok), 15)
                except (ValueError, OSError):
                    pass
            if out.strip():
                time.sleep(0.6)  # 给旧进程一点退出时间，避免 bind 撞车
        except Exception:
            pass  # lsof 不可用就直接试 bind，失败会在下面报出来
        try:
            from santu_app import server as _mobile_server
            from wsgiref.simple_server import make_server as _make
            httpd = _make("127.0.0.1", 18760, _mobile_server.application,
                          server_class=_mobile_server._ThreadingWSGIServer,
                          handler_class=_mobile_server._QuietHandler)
        except OSError as e:
            return f"复盘服务端口被占且清不掉：{e}"
        except Exception as e:
            return f"复盘服务启动失败：{type(e).__name__}: {e}"
        threading.Thread(target=httpd.serve_forever, daemon=True,
                         name="situ-review-server").start()
        # 自检：能连上才算起来了
        for _ in range(40):
            try:
                with socket.create_connection(("127.0.0.1", 18760), timeout=0.2):
                    break
            except OSError:
                time.sleep(0.1)
        else:
            return "复盘服务起了但端口一直连不上"
        _review_server_started = True
        # 预热 Api()：词表加载有 1-3s 冷启动（spec 口语复盘-阅读联动 §2）。趁复盘窗刚开、
        # 用户还没点「说一说读过的」时在后台先跑掉，免得首个 /api 请求撞在冷启动上、
        # 被 WebKit 判成 Load failed。纯预热、幂等，跑不成也不影响后续按需初始化。
        threading.Thread(target=_mobile_server._get_api, daemon=True,
                         name="situ-review-api-warm").start()
        return None


def _kill_other_instances():
    """单实例保证 —— 必须在 pywebview 启动它的 HTTP 服务器之前调用。

    页面是经 pywebview 内置 HTTP 服务器伺服的，而该服务器绑定的是一个固定端口
    （我们传 private_mode=False，好让 localStorage 的来源——即所有应用内设置——能跨
    重启留存）。固定端口意味着第二个实例无法绑定它：它会以
    `OSError: [Errno 48] Address already in use` 退出，其窗口也就加载不出页面。更糟的
    是，对 nohup 脱钩启动的进程按 ⌘Q 并不总能回收它，于是孤儿进程会一直占着端口，导致
    此后每一次重启都伺服不出新代码——无论重启多少次都只看到旧界面。这里把其它四土实例
    杀掉，使本次启动总能抢到端口、渲染当前的 index.html。
    """
    import signal
    import subprocess
    import time

    me = os.getpid()
    try:
        out = subprocess.run(
            # 两种形态都算「四土实例」：源码跑法（python -m santu_app.app）+ 冻结跑法
            # （四土.app/Contents/MacOS/四土）。注意别误伤「四土对话录.app」——用
            # 「/四土.app/」带斜杠锚定，对话录的路径是「…/四土对话录.app/…」，不含它。
            ["pgrep", "-f", r"santu_app\.app|/四土\.app/Contents/MacOS/"],
            capture_output=True, text=True, timeout=3,
        ).stdout
    except Exception:
        return  # pgrep 不可用 / 非 posix —— 绝不因此卡住自己的启动
    others = []
    for tok in out.split():
        try:
            pid = int(tok)
        except ValueError:
            continue
        if pid != me:
            others.append(pid)
    if not others:
        return
    for pid in others:
        try:
            os.kill(pid, signal.SIGTERM)
        except OSError:
            pass
    # 等它们退出（好让内核释放监听套接字），再强杀掉残留的。
    # 正常情况下瞬间就死（窗口 closing → os._exit）。
    alive = list(others)
    deadline = time.time() + 2.0
    while time.time() < deadline:
        alive = [p for p in alive if _pid_alive(p)]
        if not alive:
            break
        time.sleep(0.05)
    for pid in alive:
        try:
            os.kill(pid, signal.SIGKILL)
        except OSError:
            pass
    time.sleep(0.2)  # 给套接字彻底释放留一点余量


def _pid_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def _versioned_index(index_html: Path) -> Path:
    """缓存破除（cache-busting）—— 解决“改了 index.html 却怎么都看不到新版”。

    pywebview 在 private_mode=False（我们为持久化设置而设）下会用固定端口 42001
    （webview/__init__.py 的 DEFAULT_HTTP_PORT），而它内置的 bottle 服务静态文件时
    本想设的 no-cache 头被 static_file 返回的新响应覆盖丢失 → 真实响应只有
    Last-Modified/ETag、没有 Cache-Control。于是 WKWebView 对
    http://127.0.0.1:42001/index.html 启用启发式缓存并持久化，旧 HTML 一直命中——
    改代码、杀进程、重启全都看不到新版（顶栏不隐藏、无月牙、无生词本入口的真根因）。

    解法是给资源名加内容指纹：把 index.html 复制成 index.<mtime>.html 再交给
    WKWebView 加载。内容一变 mtime 变 → 文件名变 → URL 变 → 旧缓存键永不命中、必拉
    新版；内容没变文件名不变、仍可正常缓存不浪费。origin 仍是 :42001，localStorage
    里的字号/配色等设置照常持久。"""
    try:
        mtime = int(index_html.stat().st_mtime)
        versioned = index_html.with_name(f"index.{mtime}.html")
        if not versioned.exists():
            import shutil
            for old in index_html.parent.glob("index.*.html"):  # 清掉旧指纹副本
                try:
                    old.unlink()
                except OSError:
                    pass
            shutil.copy2(index_html, versioned)  # copy2 保留 mtime，故同版不重复复制
        return versioned
    except Exception:
        return index_html  # 任何意外都回退原文件，绝不阻断启动


def _patch_webview_accepts_first_mouse() -> None:
    """真机反馈①：首页书脊要点两下才有反应——推断根因是 macOS 窗口未获得焦点时的
    click-through：第一下点击只把窗口带到前台/激活（AppKit 默认行为），第二下才真正
    传到 WKWebView 触发点击。给 WKWebView 类打 acceptsFirstMouse: 返回 True，让"激活窗口
    的那一下"同时也算数，一击生效。

    实现细节：AppKit 的 NSResponder 已经声明了 acceptsFirstMouse: 的 ObjC 方法签名
    （BOOL 返回），用一个普通 Python 函数直接 objc.classAddMethod 会因为签名推断成
    返回 object 类型而报「签名不兼容」——必须用 objc.selector 显式声明签名 b'B@:@'
    （B=BOOL 返回，@:@=self/_cmd/一个 NSEvent 参数）。

    只对 darwin 生效；pyobjc/WebKit 缺失或签名不兼容时静默跳过，绝不阻断启动——
    这是「推断修复」，无法在 preview 里验证，真机待验。"""
    if sys.platform != "darwin":
        return
    try:
        import objc
        import WebKit

        def _accepts_first_mouse(self, event):
            return True

        sel = objc.selector(_accepts_first_mouse, selector=b"acceptsFirstMouse:", signature=b"B@:@")
        objc.classAddMethod(WebKit.WKWebView, b"acceptsFirstMouse:", sel)
    except Exception as exc:
        print("acceptsFirstMouse patch skipped:", exc)


_TITLEBAR_DRAG_STRIP_H = 30.0  # 顶部可拖拽带高度，与 index.html #app 的 padding-top:30px 对齐


def _patch_webview_titlebar_drag() -> None:
    """让顶部那条 30px 空白带能拖动窗口（不隐藏红绿灯的前提下）。

    背景：为保留深色模式下顶栏也跟随主题的暖纸/深色，窗口用了 NSFullSizeContentView
    让 WKWebView 铺满整窗（含标题栏区）。此时想拖窗，早期做法是在顶栏盖一层透明 NSView——
    但 WKWebView 有自己的事件通道，会在 AppKit 兄弟视图 hitTest 之前把 mouseDown 直接送进
    网页层，覆盖视图根本拦不住（症状：一拖就选中下方文字、弹出选色条）。`-webkit-app-region`
    也只有 Chromium 认、WKWebView 不认。

    正解：包住 WebKitHost 自己的 mouseDown_——点在顶部 30px 带里就调 NSWindow 的
    performWindowDragWithEvent_ 发起原生窗口拖动，并且**不链回 super**（于是不会选文字）；
    点在别处则原样交回原实现。红绿灯在标题栏层、事件根本到不了这里，无需特判。

    mouseDown: 被 NSResponder 声明为返回 void，普通 Python 函数会被推断成返回 object 而报
    签名不兼容，必须用 objc.selector 显式声明 b'v@:@'。只对 darwin 生效，任何异常静默跳过。"""
    if sys.platform != "darwin":
        return
    try:
        import objc
        from webview.platforms.cocoa import BrowserView

        WebKitHost = BrowserView.WebKitHost
        if getattr(WebKitHost, "_situ_drag_patched", False):
            return
        orig_mouseDown = WebKitHost.mouseDown_  # 先捕获原实现，供非拖拽区链回

        def _mouseDown_(self, event):
            try:
                win = self.window()
                # locationInWindow：窗口基坐标，左下为原点、y 向上。铺满整窗时 webview 的
                # frame 高即窗口内容高 H；顶部 30px 带 = y >= H - STRIP_H。
                h = self.frame().size.height
                loc = event.locationInWindow()
                in_strip = loc.y >= h - _TITLEBAR_DRAG_STRIP_H
                # ⚠️ 只有「内容铺进标题栏」(NSFullSizeContentView) 的主窗才有这条空白拖拽带。
                # classAddMethod 是类级补丁，会命中**所有** pywebview 窗口——普通带框窗
                # （如「口语复盘」）顶部 30px 是网页自己的工具栏按钮，绝不能吞成拖窗
                # （曾致复盘窗顶栏按钮全点不动、返回键要碰运气点下缘才生效）。
                full_size = bool(win.styleMask() & (1 << 15)) if win is not None else False
                if (
                    win is not None
                    and in_strip
                    and full_size
                    and hasattr(win, "performWindowDragWithEvent_")
                ):
                    win.performWindowDragWithEvent_(event)
                    return
            except Exception:
                pass  # 判定出错就退回默认行为，绝不吞掉正常点击
            orig_mouseDown(self, event)

        sel = objc.selector(_mouseDown_, selector=b"mouseDown:", signature=b"v@:@")
        objc.classAddMethod(WebKitHost, b"mouseDown:", sel)
        WebKitHost._situ_drag_patched = True
    except Exception as exc:
        print("titlebar drag patch skipped:", exc)


def _patch_webview_media_permission() -> None:
    """让「口语复盘」窗内的录音不再每次都弹「允许使用麦克风」。

    根因：pywebview 的 WKUIDelegate 没实现 macOS 12+ 的
    webView:requestMediaCapturePermissionForOrigin:initiatedByFrame:type:decisionHandler:
    ——WebKit 收不到宿主决定，就对每次 getUserMedia 都弹自己的授权框（不持久）。
    补上该回调：来源是本机（127.0.0.1/localhost，即我们自己的复盘 server）一律放行；
    其他来源保持系统默认（弹询问）。App 级麦克风 TCC 弹窗不受影响，首次仍会正常弹一次。

    decisionHandler 是 ObjC block（签名 @?），WKPermissionDecision: 0=Prompt 1=Grant 2=Deny。
    任何异常静默跳过——补丁失败只是回到「每次都问」，不伤功能。"""
    if sys.platform != "darwin":
        return
    try:
        import objc
        from webview.platforms.cocoa import BrowserView

        Delegate = BrowserView.BrowserDelegate
        if getattr(Delegate, "_situ_media_patched", False):
            return

        def _req_media_(self, webview_, origin, frame, mediatype, handler):
            decision = 0  # WKPermissionDecisionPrompt：非本机来源维持系统默认
            try:
                host = str(origin.host())
                if host in ("127.0.0.1", "localhost"):
                    decision = 1  # WKPermissionDecisionGrant
            except Exception:
                pass
            handler(decision)

        sel = objc.selector(
            _req_media_,
            selector=b"webView:requestMediaCapturePermissionForOrigin:initiatedByFrame:type:decisionHandler:",
            signature=b"v@:@@@q@?",
        )
        objc.classAddMethod(
            Delegate,
            b"webView:requestMediaCapturePermissionForOrigin:initiatedByFrame:type:decisionHandler:",
            sel,
        )
        Delegate._situ_media_patched = True
    except Exception as exc:
        print("media permission patch skipped:", exc)


def main():
    _kill_other_instances()  # 在页面被伺服前抢占 pywebview 的固定端口
    _patch_webview_accepts_first_mouse()  # 首页书脊要点两下才响应：窗口未聚焦时的 click-through 修复
    _patch_webview_titlebar_drag()  # 顶部 30px 带拖动窗口（包 WebKitHost.mouseDown_，须在建窗前打）
    _patch_webview_media_permission()  # 复盘窗录音：本机来源直接放行，不再每次弹麦克风询问
    from reader_core.userconfig import resource_base
    index_html = resource_base() / "santu_app" / "index.html"
    if not index_html.exists():  # dev fallback
        index_html = Path(__file__).resolve().parent / "index.html"
    api = Api()
    win = webview.create_window(
        title="四土",
        url=str(_versioned_index(index_html)),
        js_api=api,
        width=1180,
        height=820,
        min_size=(820, 560),
        background_color="#f7f2e8",  # 暖纸底：HTML/CSS 加载完成前的空窗残余不再刺眼纯白
    )

    def _apply_native_chrome():
        # Runs ON THE MAIN THREAD (see _on_shown). NSWindow geometry + the app icon
        # may only be touched there — doing it from the `shown` worker thread throws
        # NSInternalInconsistencyException.
        try:
            nswin = win.native
            # Reclaim the native title bar's ~28px strip: transparent titlebar + let
            # content run full height under it, KEEPING the traffic-light buttons so
            # the window stays closable / movable. (frameless=True would hide those.)
            nswin.setTitlebarAppearsTransparent_(True)
            nswin.setTitleVisibility_(1)  # NSWindowTitleHidden
            nswin.setStyleMask_(nswin.styleMask() | (1 << 15))  # NSFullSizeContentView
        except Exception as exc:  # non-Cocoa backend or API drift — keep the bar
            print("titlebar unify skipped:", exc)
        # 顶栏拖拽不在这里做——见 _patch_webview_titlebar_drag()（包 WebKitHost.mouseDown_，
        # 在 main() 里于建窗前打好）。覆盖式透明 NSView 拦不住 WKWebView 的鼠标事件，已弃用。
        # Dock + app-switcher icon: use the book artwork if the user dropped it in.
        try:
            from reader_core.userconfig import resource_base
            icon_png = resource_base() / "santu_app" / "assets" / "icon.png"
            if not icon_png.exists():
                icon_png = Path(__file__).resolve().parent / "assets" / "icon.png"
            if icon_png.exists():
                from AppKit import NSImage, NSApplication
                img = NSImage.alloc().initByReferencingFile_(str(icon_png))
                if img:
                    NSApplication.sharedApplication().setApplicationIconImage_(img)
        except Exception as exc:
            print("dock icon skipped:", exc)

    def _on_shown():
        # `shown` fires on a worker thread — hop to the Cocoa main queue before
        # touching window geometry / the app icon.
        try:
            from Foundation import NSOperationQueue
            NSOperationQueue.mainQueue().addOperationWithBlock_(_apply_native_chrome)
        except Exception as exc:
            print("native-chrome dispatch skipped:", exc)

    win.events.shown += _on_shown

    def _hard_exit():
        # Quit instantly. pregen / audio run on ThreadPoolExecutor workers, which
        # Python's concurrent.futures atexit hook JOINS on interpreter shutdown — if
        # any worker is mid-`urlopen` (DeepSeek/TTS, up to 20s timeout) the window
        # lingers for seconds after the user hits close. Settings live in WKWebView
        # localStorage and sessions are saved on navigation, so there's nothing left
        # to flush; os._exit skips the join and the window vanishes at once.
        # 讲解预生成缓存是例外：它去抖 2s 落盘，os._exit 会跳过 join 直接杀掉挂起的
        # 定时器——退出前必须同步 flush 一次（此刻不能再起线程，直接调用写盘函数本身，
        # 是纯内存读+一次小文件写，不会明显拖慢退出）。
        try:
            api.flush_pregen_cache_sync()
        except Exception:
            pass
        os._exit(0)

    win.events.closing += _hard_exit
    # private_mode defaults to True in pywebview, which wipes WKWebView localStorage
    # on every quit — that's why font size / theme / level / accent didn't persist.
    # Persist to a dedicated store so all in-app settings survive restarts.
    storage = app_support_dir() / "webview"
    storage.mkdir(parents=True, exist_ok=True)
    webview.start(private_mode=False, storage_path=str(storage))


if __name__ == "__main__":
    main()
