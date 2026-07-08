# Spec · 四土 Step 5：书的持久化（保存进度 + 书架显示 + 重开续读）

> 项目根 `~/Documents/situ/`，改 `santu_app/app.py` + `santu_app/index.html`。
> 背景：书是「内容上传」进来的（`process_file` 写临时文件），临时文件重启即没；所以**必须把 epub 存进数据目录**，像真实电子书库一样；进度（第几章、第几页）存档案 JSON。文章流的持久化**保持原样不改**。
> 现有机制已读懂（别重写）：`save_session`/`load_archive`/`list_library`/`delete_archive`（app.py 969-1061）、`doSave`/`renderShelf`/`spineHtml`/`openArchive`（index.html）。书模式要**复用**这套，只加书分支。

## 用户反馈（要解决的）
1. 读完/读到一半，书没被保存 → 重启丢失。
2. 首页书脊（`#shelf`）空着，应显示最近读过的书/文章。
→ 本质都是「书没进 library」。修了①②自然都好。

---

## 后端 app.py

### A. 常量
在 `LIBRARY = DATA_ROOT / "library"`（48 行附近）旁加：
```python
BOOKS = DATA_ROOT / "books"   # 持久化用户导入的 epub 原件
```

### B. process() 书分支：把 epub 存档 + 记原始名
在书分支（283-305 行）里，`self._doc_id = uuid.uuid4().hex[:12]` 之后、`_load_chapter_internal(0)` 之前：
```python
import shutil
BOOKS.mkdir(parents=True, exist_ok=True)
stored = BOOKS / f"{self._doc_id}.epub"
try:
    shutil.copy2(source, stored)
except Exception:
    stored = Path(source)   # 兜底：存不了就先用原路径（重开可能失效，但不崩）
self._book["epub_path"] = str(stored)
self._book["display_source"] = Path(source).name   # "My Book.epub"，比 #chap 路径好看
```
（`source` 对上传来说是 `situ_upload_xxx/My Book.epub`，`Path(source).name` 正好是真名。）

### C. `_cur_meta()` 书模式给好看的 source
改 `_cur_meta`（970 行）：书模式优先用 book 的标题与 display_source——
```python
def _cur_meta(self):
    if self._book:
        return {"title": self._book["title"],
                "source": self._book.get("display_source", "")}
    if self._last:
        return {"title": self._last["title"], "source": self._last["source"]}
    return getattr(self, "_restored_meta", None)
```

### D. `save_session()` 加书分支
在 `save_session`（991）开头，`meta=self._cur_meta()` 之后，若 `self._book` 则走书存档并直接 return：
```python
if self._book and self._doc_id:
    theme = (args or {}).get("theme", DEFAULT_THEME)
    page = int((args or {}).get("page", 0) or 0)
    with self._lock:
        notebook = list(reversed(list(self._notebook.values())))
    LIBRARY.mkdir(parents=True, exist_ok=True)
    record = {
        "id": self._doc_id, "mode": "book",
        "title": self._book["title"], "source": self._book.get("display_source",""),
        "saved_at": time.time(), "level": self._level, "theme": theme,
        "epub_path": self._book.get("epub_path",""),
        "current_chapter": self._book.get("current_idx", 0),
        "current_page": page,
        "chapter_count": len(self._book["chapters"]),
        "notebook": notebook,
    }
    (LIBRARY / f"{self._doc_id}.json").write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
    items = [it for it in self._read_index() if it.get("id") != self._doc_id]
    items.insert(0, {"id": self._doc_id, "mode": "book", "title": record["title"],
                     "source": record["source"], "saved_at": record["saved_at"],
                     "level": self._level, "vocab_count": len(notebook)})
    self._write_index(items)
    return {"ok": True, "id": self._doc_id}
```
文章分支保持原样（可顺手在文章 record + index item 里补 `"mode":"article"`，便于前端分流；非必须）。

### E. `load_archive()` 加书分支
读 rec 后，若 `rec.get("mode")=="book"`：重建 book、恢复笔记、加载存档章、返回 mode:book + current_page。
```python
if rec.get("mode") == "book":
    epub_path = rec.get("epub_path","")
    if not epub_path or not Path(epub_path).exists():
        return {"error": "这本书的文件已丢失（可能数据目录被清理），请重新导入。"}
    title, chapters = extract_book(epub_path)
    nb = {item["lemma"]: item for item in rec.get("notebook", []) if item.get("lemma")}
    with self._lock:
        self._token += 1
        self._cache = dict(nb); self._notebook = dict(nb)
        self._inflight = {}; self._pregen = {"done":0,"total":0,"running":False}
    self._book_seen_lemmas = set()
    self._book = {"title": title, "source": rec.get("source",""), "chapters": chapters,
                  "current_idx": -1, "epub_path": epub_path,
                  "display_source": rec.get("source","")}
    self._doc_id = rec["id"]; self._level = rec.get("level","cet4-6")
    self._restored_meta = {"title": title, "source": rec.get("source","")}
    idx = max(0, min(int(rec.get("current_chapter",0)), len(chapters)-1))
    chap = self._load_chapter_internal(idx)
    return {"ok": True, "mode": "book", "title": title,
            "toc": self._toc_list(), "chapter_idx": idx,
            "chapter_count": len(chapters),
            "current_page": int(rec.get("current_page",0) or 0),
            "theme": rec.get("theme", DEFAULT_THEME),
            "llm_enabled": self._explainer.enabled, **chap}
```
文章分支：原逻辑加 `"mode":"article"` 到返回 dict。注意：进入书分支前要先把 `self._book=None`（在文章分支）以免读文章后 `_cur_meta` 仍以为在书模式——即文章分支开头补 `self._book=None`。

### F. `delete_archive()` 连带删 epub
删 `LIBRARY/{id}.json` 后，也删 `BOOKS/{id}.epub`（存在才删，try/except 包住）。

---

## 前端 index.html

### G. doSave 带上书的章/页
`doSave`（1599）：
```js
async function doSave(){
  try{
    if(bookMode){
      await api().save_session({theme:document.body.dataset.theme, page:_pageIdx, chapter:bookIdx});
    }else{
      const html=/* 原有取 snapshot 逻辑 */;
      await api().save_session({html, theme:document.body.dataset.theme});
    }
  }catch(e){}
}
```
（书模式不需要 html 快照——后端靠 epub 重渲染。）

### H. 书模式触发保存
- `renderBook(r)` 末尾调一次 `doSave()`（让书一导入就进书架）。
- `gotoChapter(idx)` 加载成功后调 `scheduleSave()`（防抖，复用现有 `saveTimer`/`scheduleSave` 模式；没有就 `clearTimeout(saveTimer);saveTimer=setTimeout(doSave,1200)`）。
- 翻页 `pageNext()`/`pagePrev()` 末尾也 `scheduleSave()`（记住页码）。

### I. openArchive / load_archive 消费端分流到书模式 + 恢复页码
找到 `openArchive`（约 1634，`load_archive` 调用处）：
```js
async function openArchive(id){
  let r; try{ r=await api().load_archive({id}); }catch(e){ return; }
  if(r.error){ setStatus('❌ '+r.error, true); return; }
  if(r.theme) applyTheme(r.theme);     // 若原有此逻辑则保留
  if(r.mode==='book'){ renderBook(r, r.current_page||0); }
  else { /* 原有文章恢复逻辑不变 */ }
}
```

### J. renderBook 支持初始页码恢复（关键易错点）
`renderBook(r, startPage=0)`：把 startPage 存全局 `_restorePage=startPage||0`，传给章节渲染。
分页是异步的（`renderChapterContent` 里 `setTimeout(_initPager,100)`），所以**页码恢复必须在 `_initPager` 算出 `_pageTotal` 之后**：在 `_initPager()` 末尾（`_updatePagerBar()` 之前）加：
```js
if(_restorePage){ _pageIdx=Math.max(0,Math.min(_restorePage,_pageTotal-1)); _restorePage=0; }
```
（`_restorePage` 顶部声明 `let _restorePage=0;`。只在恢复存档时被设为非 0，普通换章/导入仍从第 0 页起。）

### K. 书脊区分（可选，做了更好）
`spineHtml`/`renderShelf` 已按 index 渲染，书会自动出现。可选：书的 index item 有 `mode:'book'`，给书脊加个细标识（如不同 band 颜色或一个 📖）；不做也行，**别为此重构**。

---

## 验证（贴证据）
**后端（python 直接验证，最关键）**：
1. `Api().process_file({name:'X.epub',data_url:...})` → 读到第 2 章：`load_chapter({idx:2})`，再 `save_session({page:3})`。确认 `SiTu/books/{id}.epub` 存在、`SiTu/library/{id}.json` 里 `mode==book, current_chapter==2, current_page==3`、index.json 里有该书。
2. **新建一个 Api()（模拟重启）** → `list_library()` 含这本书 → `load_archive({id})` 返回 `mode==book, chapter_idx==2, current_page==3, toc长度对`，且 `vocab` 笔记数恢复。**这条是核心：证明重启后能续读。**
3. `delete_archive({id})` 后 `BOOKS/{id}.epub` 和 library json 都没了。
4. 文章流回归：`process({source:'某.txt'})` + `save_session` + 新 Api `load_archive` 仍按文章模式工作（mode==article 或无 mode），未被书分支带歪。

**前端（harness 或说明）**：JS 语法检查通过；说明 doSave 在导入/换章/翻页都会触发、openArchive 对 book 走 renderBook 并恢复页码的代码路径。

完成在本 spec 末尾写一句话进度，汇报贴：改了哪些函数、上面验证 1/2/3/4 的实际输出（贴数字/路径），有无偏离。

---

**2026-06-19 施工完成**：A–F（app.py）+ G–K（index.html）全部按规格实现；4 条验证全通过（见下方）；JS `node --check` 通过；无偏离。
