# Spec · 四土 后端：EPUB 按章数据模型 + Api 书会话 + 按章预加载

> 项目根：`~/Documents/situ/`（三土的 fork，包名仍是 `santu_app`）。
> 运行/测试：`cd ~/Documents/situ && ./.venv/bin/python -c "..."`。
> 总设计见 `~/.claude/plans/ai-epub-rippling-llama.md`。本 spec 只做 **Step 1–3 后端**，**不碰前端 index.html、不碰持久化 save_session/load_archive**（那是下一批）。

## 目标
让 EPUB 导入后进入「书模式」：按章（EPUB spine 的每个文档=一章）切开，章节级目录，按章做词汇分层与 AI 预加载，并跨章去重。文章流（URL/TXT/HTML）保持现状不变。

## 范围铁律（外科手术式）
- 只增不改文章流。`extract_text()`、`_from_url/_from_text_file/_from_html_file`、现有 `process()` 对非 epub 的行为**一字不改**。
- `_from_epub`（拍平版）**保留不动**——CLI `read.py` 还在用它。书模式走**新增**函数。
- 不新造数据类：一「章」就是一个现有的 `Article`。

---

## Step 1 — extractor.py：按章抽取

新增函数 `extract_book(source: str) -> tuple[str, list[Article]]`，返回 `(book_title, chapters)`：

- 仅处理 `.epub`（其它后缀可 `raise ValueError`，调用方只在 epub 时调它）。
- 用 `ebooklib`，**按 `book.spine` 的阅读顺序**遍历（不要用 `get_items_of_type` 的无序集合）：对每个 spine idref → `book.get_item_with_id(idref)`，是 `ITEM_DOCUMENT` 才处理。
- 每个文档 → 一个 `Article`：
  - `blocks` = 复用现有 `_soup_to_blocks(soup)`（先 `decompose` 掉 script/style，与 `_from_epub` 一致）。
  - 章标题：优先该文档第一个 `<h1>/<h2>/<h3>` 的文本；没有就用 EPUB TOC（`book.toc`）里对应条目的 title；再没有就 `f"第 {i+1} 章"`。
  - `source` = `f"{epub路径}#chap{i}"`（带章序，便于持久化定位）。
- **过滤空章 / 极短章**：blocks 总文本 < ~200 字符的文档跳过（版权页、目录页噪声），但若过滤后一章不剩，则回退为不过滤。
- `book_title` 取 `book.get_metadata("DC","title")`，回退 `Path(source).stem`。

写个 sanity：用一本真实 epub（让用户提供，或在 `~/Downloads`/`~/Documents` 找 `*.epub`）跑通，打印章数 + 每章标题 + 前几章字数。**贴输出**。

---

## Step 2 — app.py：Api 书会话状态 + 方法

### 新增实例状态（在 `__init__`，`self._last = None` 附近）
```python
self._book = None              # dict: {"title","source","chapters":[Article], "current_idx":int}
self._book_seen_lemmas = set() # 跨章去重：已（在前面章节）排进预热的 lemma
```

### `process()` 改造（仅 epub 分支，非 epub 完全走老路）
在 `process()` 开头判断：`source` 以 `.epub` 结尾（`Path(source).suffix.lower()==".epub"`）→ 走书路径：
1. `self._set("① 拆分章节…")`；`title, chapters = extract_book(source)`。
2. 重置（同老 process 的「新文档」语义）：bump `self._token`、清 `_cache/_notebook/_inflight/_pregen`、**清空 `self._book_seen_lemmas`**。
3. `self._book = {"title":title,"source":source,"chapters":chapters,"current_idx":-1}`。
4. 调 `self._load_chapter_internal(0)`（见下）拿首章渲染结果。
5. 返回 dict，在文章返回字段基础上加：
   - `"mode": "book"`
   - `"toc": self._toc_list()`  （`[{"idx":i,"title":...}]`）
   - `"chapter_idx": 0`、`"chapter_count": len(chapters)`
   - 首章的 `article_html / vocab_list / total_tokens / vocab_count / vocab_order_count`
6. 非 epub 路径：在原返回 dict 里补一个 `"mode":"article"`（前端据此分流），其余不变。

### 新增 `get_toc(self) -> list`
返回 `self._toc_list()`；无书时返回 `[]`。

### 新增 `load_chapter(self, args: dict) -> dict`
`idx = int(args["idx"])`；校验范围；调 `self._load_chapter_internal(idx)` 并返回其结果（含 `article_html/vocab_list/...` + `chapter_idx`）。无书 → `{"error":...}`。

### 新增私有 `_load_chapter_internal(self, idx) -> dict`  ← 核心
**关键正确性**：换章 ≠ 换文档。**保留** `_cache/_notebook/_book_seen_lemmas`，只 bump `_token` 来掐掉上一章正在跑的预热。
```python
article = self._book["chapters"][idx]
classifier = VocabClassifier(user_level=self._level or "cet4-6")
report = classifier.analyze(article)
article_html = render_article_fragment(report)
vlist = vocab_list(report, classifier)
order = _build_pregen_order(report)
# 跨章去重：滤掉前面章节已排过的 lemma
order = [it for it in order if it["lemma"] not in self._book_seen_lemmas]
with self._lock:
    self._token += 1          # 停掉上一章的 pregen；但不清 cache/notebook
    self._inflight = {}
    self._pregen = {"done":0,"total":0,"running":False}
self._book["current_idx"] = idx
self._last = {                # 复用！explain_word/_get_explanation/start_pregen 都读 self._last
    "title": self._book["title"], "source": article.source,
    "report": report, "classifier": classifier, "vocab_order": order,
}
# 本章 lemma 并入 seen（下一章不再重排）
for it in order: self._book_seen_lemmas.add(it["lemma"])
self.start_pregen()           # 复用现成 8 线程预热，自动只处理本章 order
return { "chapter_idx": idx, "article_html": article_html,
         "vocab_list": vlist, "total_tokens": report.total_tokens,
         "vocab_count": len(report.hits), "vocab_order_count": len(order) }
```
- `self._title` / `self._doc_id` 等若 process 里有设置，按需在书路径也设置（保持 explain/save 不报错；先满足不崩，持久化下一批做）。

### `_toc_list()` 私有
```python
return [{"idx":i,"title":c.title} for i,c in enumerate(self._book["chapters"])] if self._book else []
```

---

## Step 3 — 按章预加载 + 跨章去重（基本靠复用）
- **不改** `start_pregen / _build_pregen_order / _pregen_one`。它们读 `self._last["vocab_order"]` 且 `start_pregen` 已过滤 `lemma not in self._cache` —— 配合上面把 `_last["vocab_order"]` 设成「本章且未在前面章节排过」的列表，预热量天然锁死在一章。
- 跨章去重双保险：`_book_seen_lemmas`（不重复排）+ `_cache`（不重复生成）。
- 确认换章时旧预热被 `_token` bump 掐断（`_pregen_one`/`start_pregen` 里已有 `if self._token != token: return` 检查）。

---

## 验证（必须贴证据）
1. **导入 epub**：构造 `Api()`，调 `process({"source": "<某本.epub>", "level":"cet4-6"})`，打印 `mode/chapter_count/len(toc)/首章 vocab_order_count`。
2. **换章 + 去重**：调 `load_chapter({"idx":1})`、`{"idx":2}`，打印每章 `vocab_order_count`，并打印 `len(self._book_seen_lemmas)` 单调增长；**验证靠后章节的 order 里不含前面出现过的高频常见词**（抽查几个，如 "the/and" 本就不会被 flag，挑一个第1章和第2章都该出现的中频词，确认第2章 order 里没有它）。
3. **预热量级**：`get_pregen_status()` 的 total ≈ 一章生词量级（几十～一两百），**不是全书几千**。
4. **数据隔离没破**：`app_support_dir()` 仍是 `.../SiTu`。
5. **文章流回归**：`process({"source":"<某 .txt>"})` 返回 `mode=="article"`，行为与三土一致（不报错、有 article_html）。
6. 若 LLM 未配 key，预热会返回 not-enabled——没关系，验证分层/去重/章节切换逻辑即可（不需要真花钱生成讲解）。

完成后在项目 `specs/` 旁写一句话进度，并把上述验证输出贴回汇报（贴数字，别贴结论）。
```

---

## 施工进度 (2026-06-19)

Step 1-3 全部完成。

**改动文件：**
- `reader_core/__init__.py`：导出 `extract_book`
- `reader_core/extractor.py`：新增 `extract_book()` 函数（~60行）
- `santu_app/app.py`：导入 `extract_book`；新增 `_book`/`_book_seen_lemmas` 状态；`process()` 加 epub 分支 + 非 epub 补 `mode:"article"`；新增 `get_toc`/`load_chapter`/_`load_chapter_internal`/`_toc_list`（~70行）

**验证输出（已贴数字）：** 见主会话汇报。
