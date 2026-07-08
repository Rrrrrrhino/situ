/**
 * extract.js — EPUB / TXT / HTML 解析，端口自 reader_core/extractor.py
 *
 * 导出：
 *   parseEpubFromArrayBuffer(buf) → {title, mode:'book', chapters:[{title,blocks}]}
 *   parseTxt(text, name)          → {title, mode:'article', blocks}
 *   extractFromHtml(html, url)    → {title, mode:'article', blocks}
 *
 * 逐条复刻 extractor.py 逻辑（_soup_to_blocks / extract_book / _from_text_file）。
 * 依赖：jszip（npm）、@mozilla/readability（npm）。
 */

import JSZip from "jszip";
import { Readability } from "@mozilla/readability";

// ── 常量 ────────────────────────────────────────────────────────────────────

/** 对照 extractor.py _BLOCK_TAGS */
const _BLOCK_TAGS = new Set(["h1","h2","h3","h4","h5","h6","p","div","li","blockquote"]);

/** 过滤短章的最小字符数（照 extract_book MIN_CHARS = 200） */
const MIN_CHARS = 200;

// ── 内部：DOM → blocks（端口 extractor.py._soup_to_blocks） ─────────────────

/**
 * 遍历 DOM element 的所有子树，提取"叶子块"。
 * 叶子块 = 块级标签但内部**不包含**另一块级标签（避免重复）。
 * 映射：h1→h2、h2/h3→保留、h4-6→h3、其余→p。
 * 空文本跳过。
 *
 * @param {Element} root  — 通常是 body 或 document.documentElement
 * @returns {{type:string,text:string}[]}
 */
function _domToBlocks(root) {
  const blocks = [];
  // 深度优先遍历
  const walk = (el) => {
    const name = el.tagName ? el.tagName.toLowerCase() : "";
    if (!name) return;
    if (_BLOCK_TAGS.has(name)) {
      // 检查内部是否还有块级子孙——如果有，就是容器块，跳过
      const hasBlockChild = !!el.querySelector(
        "h1,h2,h3,h4,h5,h6,p,div,li,blockquote"
      );
      if (hasBlockChild) {
        // 容器块：继续深入
        for (const child of el.children) walk(child);
        return;
      }
      // 叶子块
      const text = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (!text) return;
      let type;
      if (name === "h1") type = "h2";
      else if (name === "h2" || name === "h3") type = name;
      else if (name === "h4" || name === "h5" || name === "h6") type = "h3";
      else type = "p";
      blocks.push({ type, text });
    } else {
      // 非块级标签：继续往下找
      for (const child of el.children) walk(child);
    }
  };
  for (const child of root.children) walk(child);
  return blocks;
}

// ── 内部：解析 OPF，拿 spine / manifest / toc ────────────────────────────────

/**
 * 从 container.xml 读 OPF 路径。
 * @param {JSZip} zip
 * @returns {Promise<string>} opfPath（相对于 zip 根）
 */
async function _getOpfPath(zip) {
  const containerFile = zip.file("META-INF/container.xml");
  if (!containerFile) throw new Error("EPUB 缺少 META-INF/container.xml");
  const xml = await containerFile.async("string");
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "application/xml");
  const rootfile = doc.querySelector("rootfile");
  if (!rootfile) throw new Error("container.xml 没有 rootfile");
  return rootfile.getAttribute("full-path") || "";
}

/**
 * 解析 OPF 文件，返回 {bookTitle, manifest, spine, tocNcxId}。
 * manifest: Map<id, href>（href 相对于 opfDir）
 * spine: [id, ...]（顺序）
 */
async function _parseOpf(zip, opfPath) {
  const opfFile = zip.file(opfPath);
  if (!opfFile) throw new Error(`找不到 OPF 文件: ${opfPath}`);
  const xml = await opfFile.async("string");
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "application/xml");

  // 书名
  const titleEl = doc.querySelector("metadata title, dc\\:title, *|title");
  const bookTitle = titleEl ? titleEl.textContent.trim() : "";

  // manifest: id → href
  const manifest = new Map();
  doc.querySelectorAll("manifest item").forEach((item) => {
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    if (id && href) manifest.set(id, href);
  });

  // spine: 顺序的 idref 列表
  const spine = [];
  doc.querySelectorAll("spine itemref").forEach((ref) => {
    const idref = ref.getAttribute("idref");
    if (idref) spine.push(idref);
  });

  // NCX toc 的 id（用于后续查 TOC）
  const spineEl = doc.querySelector("spine");
  const tocNcxId = spineEl ? spineEl.getAttribute("toc") : null;

  return { bookTitle, manifest, spine, tocNcxId };
}

/**
 * 解析 NCX toc，返回 Map<filename_basename, toc_title>。
 * 若无 NCX 或解析失败，返回空 Map。
 */
async function _parseTocNcx(zip, opfDir, manifest, tocNcxId) {
  const tocByHref = new Map();
  try {
    const ncxId = tocNcxId;
    if (!ncxId) return tocByHref;
    const ncxHref = manifest.get(ncxId);
    if (!ncxHref) return tocByHref;
    const ncxPath = opfDir ? opfDir + "/" + ncxHref : ncxHref;
    const ncxFile = zip.file(ncxPath) || zip.file(ncxHref);
    if (!ncxFile) return tocByHref;
    const xml = await ncxFile.async("string");
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "application/xml");
    doc.querySelectorAll("navPoint").forEach((nav) => {
      const titleEl = nav.querySelector("navLabel text");
      const contentEl = nav.querySelector("content");
      const title = titleEl ? titleEl.textContent.trim() : "";
      const src = contentEl ? (contentEl.getAttribute("src") || "") : "";
      const basename = src.split("#")[0].split("/").pop();
      if (title && basename) {
        if (!tocByHref.has(basename)) tocByHref.set(basename, title);
      }
    });
  } catch (e) {
    // TOC 解析失败不阻断
    console.warn("TOC NCX 解析失败:", e);
  }
  return tocByHref;
}

/**
 * 也尝试解析 EPUB3 nav.xhtml 作为 TOC 后备。
 */
async function _parseTocNav(zip, opfDir, manifest) {
  const tocByHref = new Map();
  try {
    // 找 media-type=application/xhtml+xml 且 properties 含 nav 的 item
    // 简化：直接找文件名含 nav 的
    let navEntry = null;
    for (const [id, href] of manifest) {
      if (/nav/i.test(href) && /\.x?html?$/i.test(href)) {
        navEntry = href;
        break;
      }
    }
    if (!navEntry) return tocByHref;
    const navPath = opfDir ? opfDir + "/" + navEntry : navEntry;
    const navFile = zip.file(navPath) || zip.file(navEntry);
    if (!navFile) return tocByHref;
    const html = await navFile.async("string");
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "application/xhtml+xml");
    doc.querySelectorAll("nav[epub\\:type='toc'] a, nav a").forEach((a) => {
      const href = a.getAttribute("href") || "";
      const basename = href.split("#")[0].split("/").pop();
      const title = a.textContent.trim();
      if (title && basename && !tocByHref.has(basename)) {
        tocByHref.set(basename, title);
      }
    });
  } catch (e) {
    console.warn("nav TOC 解析失败:", e);
  }
  return tocByHref;
}

// ── 公开 API ─────────────────────────────────────────────────────────────────

/**
 * 解析 EPUB ArrayBuffer，返回按章结构化对象。
 * 端口自 extractor.py.extract_book。
 *
 * @param {ArrayBuffer} buf
 * @returns {Promise<{title:string, mode:'book', chapters:{title:string,blocks:{type:string,text:string}[]}[]}>}
 */
export async function parseEpubFromArrayBuffer(buf) {
  const zip = await JSZip.loadAsync(buf);

  const opfPath = await _getOpfPath(zip);
  const opfDir = opfPath.includes("/") ? opfPath.split("/").slice(0, -1).join("/") : "";

  const { bookTitle, manifest, spine, tocNcxId } = await _parseOpf(zip, opfPath);

  // 构建 TOC 映射（NCX 优先，EPUB3 nav 后备）
  const tocByHref = await _parseTocNcx(zip, opfDir, manifest, tocNcxId);
  if (tocByHref.size === 0) {
    const navToc = await _parseTocNav(zip, opfDir, manifest);
    navToc.forEach((v, k) => tocByHref.set(k, v));
  }

  // 按 spine 顺序提取章节
  const parser = new DOMParser();
  const rawChapters = [];
  for (let i = 0; i < spine.length; i++) {
    const idref = spine[i];
    const href = manifest.get(idref);
    if (!href) continue;
    const filePath = opfDir ? opfDir + "/" + href : href;
    const file = zip.file(filePath) || zip.file(href);
    if (!file) continue;

    let htmlStr;
    try {
      htmlStr = await file.async("string");
    } catch (e) {
      continue;
    }

    const doc = parser.parseFromString(htmlStr, "application/xhtml+xml");
    // 移除 script/style（同 Python 的 tag.decompose()）
    doc.querySelectorAll("script,style").forEach((t) => t.remove());

    const body = doc.body || doc.documentElement;
    const blocks = _domToBlocks(body);

    // 章节标题：首个 h1/h2/h3，否则 TOC，否则"第 N 章"
    let chapTitle = null;
    const firstH = doc.querySelector("h1,h2,h3");
    if (firstH) {
      const t = (firstH.textContent || "").replace(/\s+/g, " ").trim();
      if (t) chapTitle = t;
    }
    if (!chapTitle) {
      const basename = href.split("/").pop().split("?")[0];
      chapTitle = tocByHref.get(basename) || null;
    }
    if (!chapTitle) chapTitle = `第 ${i + 1} 章`;

    const text = blocks.map((b) => b.text).join("\n\n");
    rawChapters.push({ title: chapTitle, blocks, _text: text });
  }

  // 过滤正文 < 200 字的章（封面/版权/目录噪声）
  // 若全被过滤则保留原始（照 extract_book）
  const filtered = rawChapters.filter((c) => c._text.length >= MIN_CHARS);
  const chapters = (filtered.length > 0 ? filtered : rawChapters).map(({ title, blocks }) => ({
    title,
    blocks,
  }));

  const title = bookTitle || "（未知书名）";
  return { title, mode: "book", chapters };
}

/**
 * 解析纯文本，端口自 extractor.py._from_text_file。
 *
 * @param {string} text
 * @param {string} name  — 文件名（不含路径），用作默认标题
 * @returns {{title:string, mode:'article', blocks:{type:string,text:string}[]}}
 */
export function parseTxt(text, name) {
  const stem = (name || "文本").replace(/\.[^.]+$/, "");
  const lines = text.split(/\r?\n/);
  const blocks = [];
  let title = stem;
  let firstNonblank = false;
  const para = [];

  const flush = () => {
    if (para.length) {
      const t = para.join(" ").trim();
      if (t) blocks.push({ type: "p", text: t });
      para.length = 0;
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    if (!firstNonblank) {
      firstNonblank = true;
      // 首个非空短行（< 80 字，不以 .!?,;: 结尾）→ 作标题
      if (line.length < 80 && !/[.!?,;:]$/.test(line)) {
        title = line;
        continue;
      }
    }
    para.push(line);
  }
  flush();

  if (!blocks.length) {
    blocks.push({ type: "p", text: text });
  }

  return { title, mode: "article", blocks };
}

/**
 * 从 HTML 字符串提取正文 blocks，端口 _from_url（Readability 替代 trafilatura）。
 * 本阶段不做网络抓取，只处理传入的 HTML 字符串。
 *
 * @param {string} html   — 原始 HTML
 * @param {string} url    — 文章来源 URL（用于 Readability 上下文 + 作为 title 后备）
 * @returns {{title:string, mode:'article', blocks:{type:string,text:string}[]}}
 */
export function extractFromHtml(html, url) {
  // Readability 需要一个真实 Document 上下文
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  // 设置 baseURI 让 Readability 知道页面来源
  const base = doc.querySelector("base") || doc.createElement("base");
  base.href = url || "https://example.com";
  if (!doc.querySelector("base")) doc.head.appendChild(base);

  const reader = new Readability(doc);
  const article = reader.parse();

  let title = (article && article.title) || url || "（未知标题）";
  let blocks = [];

  if (article && article.content) {
    // Readability 返回 HTML 片段，再走 _domToBlocks
    const fragDoc = parser.parseFromString(article.content, "text/html");
    fragDoc.querySelectorAll("script,style").forEach((t) => t.remove());
    blocks = _domToBlocks(fragDoc.body || fragDoc.documentElement);
  }

  if (!blocks.length) {
    // fallback：直接走全文 DOM
    doc.querySelectorAll("script,style,nav,header,footer").forEach((t) => t.remove());
    blocks = _domToBlocks(doc.body || doc.documentElement);
  }

  return { title, mode: "article", blocks };
}
