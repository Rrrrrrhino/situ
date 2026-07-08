"""Extract clean, structured article content from a URL, .epub, .txt, or .html file.

Returns an Article whose `blocks` preserve heading / paragraph structure so the
renderer can show titles and subheadings with proper visual hierarchy.
"""
from __future__ import annotations
import re
import threading
import time
from pathlib import Path
from dataclasses import dataclass, field


@dataclass
class Block:
    type: str   # 'h1' | 'h2' | 'h3' | 'p'
    text: str


@dataclass
class Article:
    title: str
    blocks: list[Block]
    source: str
    image: str | None = None      # og:image URL（剪报盒封面 C 用；无则回落排版式）
    sitename: str | None = None   # 站点名（如 "The Conversation"，剪报盒来源小标用）

    @property
    def text(self) -> str:
        """Flatten to plain text (used as fallback / for char counts)."""
        return "\n\n".join(b.text for b in self.blocks)


_BROWSER_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
)


def extract_text(source: str) -> Article:
    if source.startswith(("http://", "https://")):
        return _from_url(source)
    p = Path(source).expanduser().resolve()
    suffix = p.suffix.lower()
    if suffix == ".epub":
        return _from_epub(p)
    if suffix in (".html", ".htm"):
        return _from_html_file(p)
    return _from_text_file(p)


# ---------------------------------------------------------------- URL

def _fetch_url_html(url: str, retries: int = 3) -> str:
    """Download a URL robustly. CNA and others intermittently drop the TLS
    handshake (SSLEOFError); retry with backoff, with a couple of fallbacks."""
    import requests
    try:
        import certifi
        verify = certifi.where()
    except Exception:
        verify = True

    headers = {
        "User-Agent": _BROWSER_UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Connection": "keep-alive",
    }

    last_err: Exception | None = None
    for attempt in range(retries):
        try:
            with requests.Session() as s:
                s.headers.update(headers)
                r = s.get(url, timeout=25, verify=verify)
                r.raise_for_status()
                if r.text and len(r.text) > 200:
                    return r.text
                last_err = RuntimeError("响应内容过短")
        except Exception as e:
            last_err = e
            time.sleep(1.2 * (attempt + 1))  # backoff

    # Fallback 1: trafilatura's own fetcher (different TLS stack)
    try:
        import trafilatura
        html = trafilatura.fetch_url(url)
        if html:
            return html
    except Exception as e:
        last_err = e

    raise RuntimeError(f"下载失败（已重试 {retries} 次）：{last_err}")


# 读物精选丝滑打开：悬停/开列表时 prewarm_article 先把 HTML 抓进这层短时缓存，
# 用户点开时 _from_url 直接命中——省掉点击后最大头的网络等待。
# 每 URL 一把锁做在途去重：预取还没回来用户就点了，点击方等同一次抓取，不重复打网络。
_HTML_CACHE: dict[str, tuple[float, str]] = {}
_HTML_CACHE_TTL = 300.0   # 秒。RSS 列表页停留几分钟内点开都算「刚看到就点」
_HTML_CACHE_MAX = 12      # 条。整页 HTML 几百 KB 一条，封顶防内存爬坡
_HTML_LOCKS: dict[str, threading.Lock] = {}
_HTML_LOCKS_GUARD = threading.Lock()


def fetch_url_html_cached(url: str) -> str:
    now = time.time()
    hit = _HTML_CACHE.get(url)
    if hit and now - hit[0] < _HTML_CACHE_TTL:
        return hit[1]
    with _HTML_LOCKS_GUARD:
        lock = _HTML_LOCKS.setdefault(url, threading.Lock())
    with lock:
        hit = _HTML_CACHE.get(url)   # 等锁期间别人可能已抓完
        if hit and time.time() - hit[0] < _HTML_CACHE_TTL:
            return hit[1]
        html = _fetch_url_html(url)
        _HTML_CACHE[url] = (time.time(), html)
        if len(_HTML_CACHE) > _HTML_CACHE_MAX:
            oldest = min(_HTML_CACHE, key=lambda k: _HTML_CACHE[k][0])
            _HTML_CACHE.pop(oldest, None)
            _HTML_LOCKS.pop(oldest, None)
        return html


def _from_url(url: str) -> Article:
    import trafilatura
    html = fetch_url_html_cached(url)
    meta = trafilatura.extract_metadata(html)
    md = trafilatura.extract(
        html, output_format="markdown",
        include_comments=False, include_tables=False,
        include_formatting=True, favor_precision=True,
    )
    if not md:
        # last resort: plain extract
        md = trafilatura.extract(html, include_comments=False, include_tables=False)
    if not md:
        raise RuntimeError("无法抽取正文（可能是动态渲染页或非文章页）")
    title = (meta.title if meta else None) or url
    blocks = _markdown_to_blocks(md, drop_title=title)
    return Article(title=title, blocks=blocks, source=url,
                   image=(meta.image if meta else None),
                   sitename=(meta.sitename if meta else None))


# ---------------------------------------------------------------- markdown → blocks

_MD_HEADING = re.compile(r"^(#{1,6})\s+(.*)$")
_MD_IMAGE = re.compile(r"!\[[^\]]*\]\([^)]*\)")
_MD_LINK = re.compile(r"\[([^\]]+)\]\([^)]*\)")
_MD_EMPH = re.compile(r"(\*\*|\*|__|_|`)")


def _clean_inline(s: str) -> str:
    s = _MD_IMAGE.sub("", s)
    s = _MD_LINK.sub(r"\1", s)        # keep link text, drop URL
    s = _MD_EMPH.sub("", s)           # strip bold/italic/code markers
    return s.strip()


def _markdown_to_blocks(md: str, drop_title: str | None = None) -> list[Block]:
    blocks: list[Block] = []
    paragraph: list[str] = []

    def flush():
        if paragraph:
            text = " ".join(paragraph).strip()
            if text:
                blocks.append(Block("p", text))
            paragraph.clear()

    for raw in md.splitlines():
        line = raw.rstrip()
        if not line.strip():
            flush()
            continue
        m = _MD_HEADING.match(line)
        if m:
            flush()
            level = len(m.group(1))
            text = _clean_inline(m.group(2))
            if not text:
                continue
            # Map markdown heading levels to a compact h2/h3 hierarchy
            htype = "h2" if level <= 2 else "h3"
            blocks.append(Block(htype, text))
        else:
            paragraph.append(_clean_inline(line))
    flush()

    # If the very first block duplicates the page title, drop it
    if blocks and drop_title:
        first = blocks[0].text.strip().lower()
        if first and first == drop_title.strip().lower():
            blocks.pop(0)

    # Drop tiny noise blocks (single short tokens like "Advertisement")
    cleaned = [b for b in blocks if not (b.type == "p" and len(b.text) < 3)]
    return cleaned or blocks


# ---------------------------------------------------------------- local files

def _from_html_file(p: Path) -> Article:
    import trafilatura
    html = p.read_text(encoding="utf-8", errors="ignore")
    md = trafilatura.extract(html, output_format="markdown",
                             include_comments=False, include_tables=False)
    if md:
        return Article(title=p.stem, blocks=_markdown_to_blocks(md), source=str(p))
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "html.parser")
    return Article(title=p.stem, blocks=_soup_to_blocks(soup), source=str(p))


def _from_text_file(p: Path) -> Article:
    text = p.read_text(encoding="utf-8", errors="ignore")
    lines = text.splitlines()
    blocks: list[Block] = []
    title = p.stem
    # Treat a short standalone first line as the title
    para: list[str] = []

    def flush():
        if para:
            t = " ".join(para).strip()
            if t:
                blocks.append(Block("p", t))
            para.clear()

    first_nonblank_seen = False
    for i, raw in enumerate(lines):
        line = raw.strip()
        if not line:
            flush()
            continue
        if not first_nonblank_seen:
            first_nonblank_seen = True
            # Heuristic: first line, short and no terminal punctuation → title
            if len(line) < 80 and not line.endswith((".", "!", "?", ",", ";", ":")):
                title = line
                continue
        para.append(line)
    flush()
    if not blocks:
        blocks = [Block("p", text)]
    return Article(title=title, blocks=blocks, source=str(p))


def _from_epub(p: Path) -> Article:
    from ebooklib import epub, ITEM_DOCUMENT
    from bs4 import BeautifulSoup
    book = epub.read_epub(str(p))
    blocks: list[Block] = []
    for item in book.get_items_of_type(ITEM_DOCUMENT):
        soup = BeautifulSoup(item.get_content(), "html.parser")
        for tag in soup(["script", "style"]):
            tag.decompose()
        blocks.extend(_soup_to_blocks(soup))
    title_meta = book.get_metadata("DC", "title")
    title = title_meta[0][0] if title_meta else p.stem
    if not blocks:
        blocks = [Block("p", "（未能从此 EPUB 抽取到正文）")]
    return Article(title=title, blocks=blocks, source=str(p))


def _flatten_toc(items) -> list[tuple[str, str, str]]:
    """把 ebooklib 的 book.toc（可能嵌套 Section/Link 元组）拍平成有序列表
    [(title, href_basename, fragment), ...]。容器条目（如 "Part One"）本身
    若带 href 也保留为普通条目——它们在正文里往往也有对应的锚点/标题页。"""
    out: list[tuple[str, str, str]] = []
    for it in items:
        if hasattr(it, "href") and hasattr(it, "title"):
            href = it.href or ""
            basename, _, frag = href.partition("#")
            basename = basename.split("/")[-1]
            if it.title and basename:
                out.append((it.title, basename, frag))
            continue
        if isinstance(it, tuple) and len(it) == 2:
            sec, children = it
            if hasattr(sec, "href") and hasattr(sec, "title"):
                href = sec.href or ""
                basename, _, frag = href.partition("#")
                basename = basename.split("/")[-1]
                if sec.title and basename:
                    out.append((sec.title, basename, frag))
            out.extend(_flatten_toc(children))
            continue
        if hasattr(it, "__iter__"):
            out.extend(_flatten_toc(it))
    return out


_NOISE_TOC_TITLES = {"document outline"}


def _split_doc_by_toc(soup, doc_entries: list[tuple[int, str]], carry_entry: int | None):
    """把一个 spine 文档的正文块，按文档内 TOC 锚点切分给各 TOC 条目。

    doc_entries: 本文档内的 [(toc_index, fragment_id), ...]，按 TOC 顺序（=文档顺序）。
    carry_entry: 进入本文档时"仍未闭合"的上一条目 toc_index（文档开头、遇到第一个锚点
                 之前的引导块归入它；整本书第一个文档、还没有任何条目时为 None，退化到
                 用 doc_entries[0] 兜底，再退化到 -1 表示"无主"块随后被首条目吸收）。

    返回 (blocks_by_entry: dict[toc_index, list[Block]], last_entry_in_doc)。
    """
    frag_to_entry = {frag: idx for idx, frag in doc_entries if frag}
    current = carry_entry if carry_entry is not None else (doc_entries[0][0] if doc_entries else None)
    blocks_by_entry: dict[int, list[Block]] = {}

    for el in soup.find_all(True):
        # 锚点可能挂在 id 或 name 属性上（老式 <a name="...">）
        anchor_id = el.get("id") or el.get("name")
        if anchor_id and anchor_id in frag_to_entry:
            current = frag_to_entry[anchor_id]
        # 叶子块判定与 _soup_to_blocks 一致：无嵌套块级子孙才收文本，避免容器块重复
        if el.name not in _BLOCK_TAGS:
            continue
        if el.find(_BLOCK_TAGS):
            continue
        text = _block_text(el)
        if not text:
            continue
        name = el.name
        if name == "h1":
            blk = Block("h2", text)
        elif name in ("h2", "h3"):
            blk = Block(name, text)
        elif name in ("h4", "h5", "h6"):
            blk = Block("h3", text)
        else:
            blk = Block("p", text)
        key = current if current is not None else -1
        blocks_by_entry.setdefault(key, []).append(blk)

    return blocks_by_entry, current


def extract_book(source: str) -> tuple[str, list[Article]]:
    """Extract an EPUB as an ordered list of chapters.

    Normal path: one Article per spine doc (unchanged — the vast majority of
    well-packaged EPUBs already split one chapter = one HTML file, so this
    stays the default and every existing book keeps its exact chapter count).

    TOC-split path: some EPUBs (e.g. a few big rips of "To Kill a Mockingbird")
    pack the ENTIRE book into a handful of giant spine documents while the
    real chapter list lives only in the EPUB's TOC (nav/ncx). When the TOC is
    clearly finer-grained than the spine (>= 2x as many entries), each spine
    document is instead split at its TOC anchors so chapters match the book's
    real table of contents. Any failure here falls back to the normal path —
    this is purely additive and never makes an already-fine book worse.

    Returns (book_title, chapters). Chapters with less than ~200 chars of text
    are filtered out (cover/copyright/TOC noise); if filtering leaves nothing,
    the unfiltered list is returned so the caller always gets at least something.
    """
    p = Path(source).expanduser().resolve()
    if p.suffix.lower() != ".epub":
        raise ValueError(f"extract_book only handles .epub, got: {source}")

    from ebooklib import epub, ITEM_DOCUMENT
    from bs4 import BeautifulSoup

    book = epub.read_epub(str(p))

    # Book title
    title_meta = book.get_metadata("DC", "title")
    book_title = title_meta[0][0] if title_meta else p.stem

    # Build a TOC mapping: href-basename → title  (best-effort fallback for chapter titles)
    toc_by_href: dict[str, str] = {}
    def _walk_toc(items):
        for item in items:
            if hasattr(item, "href") and hasattr(item, "title"):
                basename = item.href.split("#")[0].split("/")[-1]
                if item.title and basename:
                    toc_by_href[basename] = item.title
            if hasattr(item, "__iter__"):
                _walk_toc(item)
            elif isinstance(item, tuple) and len(item) == 2:
                _walk_toc([item[1]])
    try:
        _walk_toc(book.toc)
    except Exception:
        pass

    spine_items = []
    for idref, _linear in book.spine:
        item = book.get_item_with_id(idref)
        if item is not None and item.get_type() == ITEM_DOCUMENT:
            spine_items.append(item)

    # ---- try the TOC-split path when the TOC is clearly finer than the spine ----
    try:
        flat_toc = _flatten_toc(book.toc)
    except Exception:
        flat_toc = []

    if flat_toc and len(flat_toc) >= len(spine_items) * 2:
        try:
            chapters = _extract_book_toc_split(source, spine_items, flat_toc)
            if chapters:
                MIN_CHARS = 200
                filtered = [c for c in chapters if len(c.text) >= MIN_CHARS]
                return book_title, (filtered if filtered else chapters)
        except Exception:
            pass  # 新路径出任何问题一律回退现行为，绝不阻断打开书

    # ---- normal path: one Article per spine doc (unchanged) ----
    chapters: list[Article] = []
    for i, item in enumerate(spine_items):
        soup = BeautifulSoup(item.get_content(), "html.parser")
        for tag in soup(["script", "style"]):
            tag.decompose()

        blocks = _soup_to_blocks(soup)

        # Chapter title: first heading, then TOC fallback, then ordinal
        chap_title = None
        for h in soup.find_all(["h1", "h2", "h3"]):
            t = _block_text(h)
            if t:
                chap_title = t
                break
        if not chap_title:
            basename = (item.file_name or "").split("/")[-1]
            chap_title = toc_by_href.get(basename) or f"第 {i + 1} 章"

        chap_source = f"{source}#chap{i}"
        chapters.append(Article(title=chap_title, blocks=blocks, source=chap_source))

    # Filter out empty / extremely short chapters (cover/copyright/TOC noise)
    MIN_CHARS = 200
    filtered = [c for c in chapters if len(c.text) >= MIN_CHARS]
    return book_title, (filtered if filtered else chapters)


def _extract_book_toc_split(source: str, spine_items, flat_toc: list[tuple[str, str, str]]) -> list[Article]:
    """TOC-split 路径主体：按 (title, href_basename, fragment) 顺序切分各 spine 文档。"""
    from bs4 import BeautifulSoup

    # toc_index -> title / accumulated blocks，按 flat_toc 原序输出最终章节
    titles = [t for t, _, _ in flat_toc]
    blocks_acc: dict[int, list[Block]] = {i: [] for i in range(len(flat_toc))}

    # 按文档分组：basename -> [(toc_index, fragment), ...]（保持 flat_toc 顺序）
    by_doc: dict[str, list[tuple[int, str]]] = {}
    for idx, (_title, basename, frag) in enumerate(flat_toc):
        by_doc.setdefault(basename, []).append((idx, frag))

    carry_entry: int | None = None   # 上一文档末尾"仍未闭合"的条目，跨文档延续
    unassigned: list[Block] = []      # 全书第一个锚点之前的引导块（罕见），并入首条目

    for item in spine_items:
        basename = (item.file_name or "").split("/")[-1]
        doc_entries = by_doc.get(basename, [])
        soup = BeautifulSoup(item.get_content(), "html.parser")
        for tag in soup(["script", "style"]):
            tag.decompose()

        if not doc_entries:
            # 本文档不含任何 TOC 锚点（例如纯封面页）：整份内容归入 carry_entry
            # （上一条目的延续），完全没有 carry_entry 时先暂存，等首条目出现再吸收。
            leftover_blocks = _soup_to_blocks(soup)
            if not leftover_blocks:
                continue
            if carry_entry is not None:
                blocks_acc[carry_entry].extend(leftover_blocks)
            else:
                unassigned.extend(leftover_blocks)
            continue

        blocks_by_entry, last_entry = _split_doc_by_toc(soup, doc_entries, carry_entry)
        for idx, blks in blocks_by_entry.items():
            if idx == -1:
                unassigned.extend(blks)
            else:
                blocks_acc[idx].extend(blks)
        carry_entry = last_entry

    if unassigned and flat_toc:
        blocks_acc[0] = unassigned + blocks_acc[0]

    chapters: list[Article] = []
    for idx, title in enumerate(titles):
        if title.strip().lower() in _NOISE_TOC_TITLES:
            continue
        blks = blocks_acc.get(idx, [])
        if len(blks) < 3:   # 空条目（切出 <3 块）过滤，同 5. 的噪音过滤要求
            continue
        chap_source = f"{source}#chap{idx}"
        chapters.append(Article(title=title, blocks=blks, source=chap_source))

    return chapters


# Block-level tags we harvest text from. Many EPUBs (e.g. Z-Library rips of
# "The Artist's Way") wrap every paragraph in <div> instead of <p>, so harvesting
# only <p>/<h*> yields EMPTY chapters. We also take div/li/blockquote, but ONLY
# when they're "leaf" blocks (no nested block descendant) so a wrapper <div> that
# merely contains paragraphs doesn't duplicate all of its children's text.
_BLOCK_TAGS = ("h1", "h2", "h3", "h4", "h5", "h6", "p", "div", "li", "blockquote")

_WS_RUN = re.compile(r"\s+")


def _block_text(el) -> str:
    """Faithful plain text of a leaf block.

    Two things this gets right that ``el.get_text(" ", strip=True)`` got wrong:

    1. No injected inter-node spaces. A drop-cap ``<span>T</span>he`` must read
       ``The``, not ``T he`` — so we reconstruct inline runs WITHOUT a separator
       (the source already carries the real spaces inside its text nodes).
    2. Every whitespace run collapses to a single space. EPUBs hard-wrap prose
       with ``\\r\\n`` + indentation mid-sentence (``The Second\\n   City``); left
       intact, spaCy turns that run into a standalone space-token which the
       renderer drops, gluing the neighbours (``SecondCity`` / ``toflesh``).
       Collapsing here keeps word boundaries correct downstream.

    ``<br>`` becomes a space so an explicit line break doesn't weld two words.
    """
    for br in el.find_all("br"):
        br.replace_with(" ")
    return _WS_RUN.sub(" ", el.get_text()).strip()


def _soup_to_blocks(soup) -> list[Block]:
    blocks: list[Block] = []
    body = soup.body or soup
    for el in body.find_all(_BLOCK_TAGS):
        # container blocks (those wrapping other blocks) are skipped — their text
        # is emitted by the leaf descendants, so emitting it here would duplicate.
        if el.find(_BLOCK_TAGS):
            continue
        text = _block_text(el)
        if not text:
            continue
        name = el.name
        if name == "h1":
            blocks.append(Block("h2", text))
        elif name in ("h2", "h3"):
            blocks.append(Block(name, text))
        elif name in ("h4", "h5", "h6"):
            blocks.append(Block("h3", text))
        else:  # p, div, li, blockquote
            blocks.append(Block("p", text))
    return blocks


# ---------------------------------------------------------------- cover art

def extract_cover(source: str) -> bytes | None:
    """Pull the cover image bytes out of an EPUB with a fast, direct zip read
    (no full ebooklib parse — opening a 3MB epub via ebooklib is ~500ms; this is
    tens of ms). Returns the raw image bytes, or None when the book has no
    usable cover. Candidate order, most-authoritative first:
      1. the OPF `<meta name="cover" content="…">` pointer (EPUB2 convention),
      2. a manifest item with `properties="cover-image"` (EPUB3),
      3. any image item whose id/href hints "cover",
      4. the first image in the manifest (last-ditch).
    """
    import zipfile
    from xml.etree import ElementTree as ET

    p = Path(source).expanduser().resolve()
    if p.suffix.lower() != ".epub" or not p.exists():
        return None

    def _localname(el) -> str:
        return el.tag.rsplit("}", 1)[-1].lower()

    try:
        with zipfile.ZipFile(str(p)) as z:
            names = z.namelist()

            # locate the OPF (via container.xml, else the first .opf in the zip)
            opf_path = None
            try:
                root = ET.fromstring(z.read("META-INF/container.xml"))
                for el in root.iter():
                    if _localname(el) == "rootfile" and el.get("full-path"):
                        opf_path = el.get("full-path")
                        break
            except Exception:
                pass
            if not opf_path:
                opf_path = next((n for n in names if n.lower().endswith(".opf")), None)
            if not opf_path:
                return None

            opf_dir = opf_path.rsplit("/", 1)[0] if "/" in opf_path else ""
            opf = ET.fromstring(z.read(opf_path))

            manifest: dict[str, tuple[str, str, str]] = {}   # id -> (href, media_type, properties)
            cover_meta_id = None
            for el in opf.iter():
                t = _localname(el)
                if t == "meta" and (el.get("name") or "").lower() == "cover":
                    cover_meta_id = el.get("content")
                elif t == "item":
                    manifest[el.get("id") or ""] = (
                        el.get("href") or "",
                        (el.get("media-type") or "").lower(),
                        (el.get("properties") or "").lower(),
                    )

            def _resolve(href: str) -> str | None:
                if not href:
                    return None
                raw = (opf_dir + "/" + href) if opf_dir else href
                parts: list[str] = []
                for seg in raw.split("/"):
                    if seg == "..":
                        if parts:
                            parts.pop()
                    elif seg not in ("", "."):
                        parts.append(seg)
                return "/".join(parts)

            candidates: list[tuple[str, str, str]] = []
            if cover_meta_id and cover_meta_id in manifest:
                candidates.append(manifest[cover_meta_id])
            for it in manifest.values():
                if "cover-image" in it[2]:
                    candidates.append(it)
            for iid, it in manifest.items():
                if it[1].startswith("image") and ("cover" in iid.lower() or "cover" in it[0].lower()):
                    candidates.append(it)
            for it in manifest.values():
                if it[1].startswith("image"):
                    candidates.append(it)
                    break

            # build a case-insensitive lookup for zip entry names (epub paths sometimes
            # differ in case from the manifest href on case-sensitive filesystems)
            lower_names = {n.lower(): n for n in names}
            seen: set[str] = set()
            for href, _mt, _props in candidates:
                zp = _resolve(href)
                if not zp or zp in seen:
                    continue
                seen.add(zp)
                real = zp if zp in names else lower_names.get(zp.lower())
                if not real:
                    continue
                try:
                    data = z.read(real)
                except Exception:
                    continue
                if data and len(data) > 200:
                    return data
    except Exception:
        return None
    return None
