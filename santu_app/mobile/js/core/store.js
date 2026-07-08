/**
 * store.js — IndexedDB 封装，7 张表：
 *   library     书架索引
 *   archives    存档（书的章节blocks + 文章html快照）
 *   globalvocab 全局生词本 {key: Entry}
 *   settings    设置 KV
 *   reviews     口语复盘记录 (阶段4.1)
 *   mistakes    错题本 (阶段4.1)
 *   chunks      词块系统 (阶段9)
 *
 * 提供原子 CRUD；Node 测试用 fake-indexeddb 注入（通过 setIDBFactory）。
 */

const DB_NAME = "situ_mobile";
const DB_VERSION = 5; // v5（阶段9）：新增 chunks 表（词块刻意练习），索引 addedAt。

let _db = null;
let _idbFactory = null; // 可被测试替换（fake-indexeddb）

/**
 * 注入替代 IDBFactory（供 Node 测试用）。
 * 必须在 openDB() 之前调用。
 */
export function setIDBFactory(factory) {
  _idbFactory = factory;
  _db = null; // 重置，下次 openDB 重新开
}

function _getFactory() {
  return _idbFactory || (typeof indexedDB !== "undefined" ? indexedDB : null);
}

// ── 开库 ─────────────────────────────────────────────────────────────────────

export function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const factory = _getFactory();
    if (!factory) return reject(new Error("IndexedDB 不可用"));
    const req = factory.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      // library: 书架索引，keyPath=id，索引 saved_at
      if (!db.objectStoreNames.contains("library")) {
        const lib = db.createObjectStore("library", { keyPath: "id" });
        lib.createIndex("saved_at", "saved_at");
      }
      // archives: 存档，keyPath=id
      if (!db.objectStoreNames.contains("archives")) {
        db.createObjectStore("archives", { keyPath: "id" });
      }
      // globalvocab: key→Entry
      if (!db.objectStoreNames.contains("globalvocab")) {
        db.createObjectStore("globalvocab", { keyPath: "key" });
      }
      // settings: key→value
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "key" });
      }
      // reviews: 口语复盘记录，keyPath=id，索引 createdAt（阶段4.1）
      if (!db.objectStoreNames.contains("reviews")) {
        const rev = db.createObjectStore("reviews", { keyPath: "id" });
        rev.createIndex("createdAt", "createdAt");
      }
      // mistakes: 错题本，keyPath=id，索引 addedAt（阶段4.1）
      if (!db.objectStoreNames.contains("mistakes")) {
        const mis = db.createObjectStore("mistakes", { keyPath: "id" });
        mis.createIndex("addedAt", "addedAt");
      }
      // trainings: 写作训练历史，keyPath=id，索引 createdAt（阶段4.2）
      if (!db.objectStoreNames.contains("trainings")) {
        const tr = db.createObjectStore("trainings", { keyPath: "id" });
        tr.createIndex("createdAt", "createdAt");
      }
      // chunks: 词块系统，keyPath=id，索引 addedAt（阶段9）
      if (!db.objectStoreNames.contains("chunks")) {
        const ch = db.createObjectStore("chunks", { keyPath: "id" });
        ch.createIndex("addedAt", "addedAt");
      }
    };
    req.onsuccess = (e) => {
      _db = e.target.result;
      // 别的页面要升级本库时（versionchange），立刻关掉自己这条连接并重置缓存，
      // 下次事务自动按新版本重开。没有这一步，旧标签页会把新页面的 open 永远
      // 卡在 onblocked——2026-07-07 用户桌面 Chrome 空白页+按钮全死的根因。
      _db.onversionchange = () => {
        try { _db.close(); } catch (_) { /* 已关就算了 */ }
        _db = null;
      };
      resolve(_db);
    };
    req.onerror = (e) => reject(e.target.error);
    req.onblocked = () => reject(new Error("IndexedDB 被阻塞，请关闭其他同源标签"));
  });
}

// ── 内部事务辅助 ──────────────────────────────────────────────────────────────

function _tx(storeName, mode, fn) {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      tx.onerror = (e) => reject(e.target.error);
      resolve(fn(tx.objectStore(storeName), tx));
    });
  });
}

/** 包装 IDB 请求为 Promise */
function _req(r) {
  return new Promise((resolve, reject) => {
    r.onsuccess = (e) => resolve(e.target.result);
    r.onerror = (e) => reject(e.target.error);
  });
}

// ── library ───────────────────────────────────────────────────────────────────

/**
 * 列出全部书架项，按 saved_at 倒序。
 * @returns {Promise<Array>}
 */
export function libraryList() {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("library", "readonly");
      const store = tx.objectStore("library");
      const req = store.getAll();
      req.onsuccess = (e) => {
        const items = e.target.result || [];
        items.sort((a, b) => (b.saved_at || 0) - (a.saved_at || 0));
        resolve(items);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  });
}

/**
 * 写入（upsert）一条书架项。
 * @param {{id:string, mode:string, title:string, source:string, saved_at:number, level:string, vocab_count:number}} item
 */
export function libraryUpsert(item) {
  return _tx("library", "readwrite", (store) => _req(store.put(item)));
}

/** 删除一条书架项（不影响 archives 和 globalvocab）。 */
export function libraryDelete(id) {
  return _tx("library", "readwrite", (store) => _req(store.delete(id)));
}

// ── archives ──────────────────────────────────────────────────────────────────

/**
 * 读取一条存档。
 * @param {string} id
 * @returns {Promise<object|undefined>}
 */
export function archiveGet(id) {
  return _tx("archives", "readonly", (store) => _req(store.get(id)));
}

/**
 * 写入（upsert）一条存档。
 * @param {object} archive — 必须含 id 字段
 */
export function archivePut(archive) {
  return _tx("archives", "readwrite", (store) => _req(store.put(archive)));
}

/** 删除一条存档及对应书架项。 */
export async function archiveDelete(id) {
  await _tx("archives", "readwrite", (store) => _req(store.delete(id)));
  await libraryDelete(id);
}

// ── globalvocab ───────────────────────────────────────────────────────────────

/**
 * 获取全部生词本条目。
 * @returns {Promise<Array>}
 */
export function vocabGetAll() {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("globalvocab", "readonly");
      const req = tx.objectStore("globalvocab").getAll();
      req.onsuccess = (e) => resolve(e.target.result || []);
      req.onerror = (e) => reject(e.target.error);
    });
  });
}

/**
 * 获取单条生词本条目。
 * @param {string} key — lemma 或 "§…"
 */
export function vocabGet(key) {
  return _tx("globalvocab", "readonly", (store) => _req(store.get(key)));
}

/**
 * 写入（upsert）生词本条目。
 * @param {object} entry — 必须含 key 字段
 */
export function vocabPut(entry) {
  return _tx("globalvocab", "readwrite", (store) => _req(store.put(entry)));
}

/** 删除生词本条目。 */
export function vocabDelete(key) {
  return _tx("globalvocab", "readwrite", (store) => _req(store.delete(key)));
}

/** 清空生词本（replace 模式导入时用）。 */
export function vocabClear() {
  return _tx("globalvocab", "readwrite", (store) => _req(store.clear()));
}

/**
 * 批量写入生词本（merge 或 replace）。
 * merge 规则（照 server.py._vocab_import）：
 *   - 新条目覆盖旧条目，但 star/known 以"已有的 OR 新的"为准。
 *   - clicks 取较大值。
 * @param {Array} entries
 * @param {'merge'|'replace'} mode
 */
export async function vocabImportBatch(entries, mode = "merge") {
  if (mode === "replace") {
    await vocabClear();
    for (const e of entries) await vocabPut(e);
    return;
  }
  // merge
  for (const entry of entries) {
    const existing = await vocabGet(entry.key);
    if (existing) {
      const merged = {
        ...existing,
        ...entry,
        // star/known 取 OR
        star: !!(existing.star || entry.star),
        known: !!(existing.known || entry.known),
        // clicks 取较大值
        clicks: Math.max(existing.clicks || 0, entry.clicks || 0),
      };
      await vocabPut(merged);
    } else {
      await vocabPut(entry);
    }
  }
}

// ── settings ──────────────────────────────────────────────────────────────────

/**
 * 读取设置（也支持 localStorage 后备，与 app.js 原有逻辑兼容）。
 * @param {string} key
 * @param {*} defaultVal
 */
export async function settingsGet(key, defaultVal = null) {
  try {
    const row = await _tx("settings", "readonly", (store) => _req(store.get(key)));
    if (row != null) return row.value;
    // localStorage 后备
    const ls = typeof localStorage !== "undefined" ? localStorage.getItem("situ_" + key) : null;
    return ls != null ? JSON.parse(ls) : defaultVal;
  } catch {
    return defaultVal;
  }
}

/**
 * 写入设置（同步写 localStorage，方便与 app.js 现有读取兼容）。
 * @param {string} key
 * @param {*} value
 */
export async function settingsPut(key, value) {
  await _tx("settings", "readwrite", (store) => _req(store.put({ key, value })));
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("situ_" + key, JSON.stringify(value));
    }
  } catch {}
}

/**
 * 批量读取全部设置行，返回 {key: value} 对象。
 */
export function settingsGetAll() {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("settings", "readonly");
      const req = tx.objectStore("settings").getAll();
      req.onsuccess = (e) => {
        const result = {};
        (e.target.result || []).forEach((r) => (result[r.key] = r.value));
        resolve(result);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  });
}

// ── reviews（口语复盘记录，阶段4.1） ─────────────────────────────────────────

/**
 * 写入（upsert）一条复盘记录。
 * @param {object} review — 含 id/createdAt/transcript/context/source/model/result/mistakeIds
 */
export function reviewsPut(review) {
  return _tx("reviews", "readwrite", (store) => _req(store.put(review)));
}

/**
 * 获取全部复盘记录，按 createdAt 倒序。
 * @returns {Promise<Array>}
 */
export function reviewsList() {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("reviews", "readonly");
      const req = tx.objectStore("reviews").getAll();
      req.onsuccess = (e) => {
        const items = e.target.result || [];
        items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        resolve(items);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  });
}

// ── mistakes（错题本，阶段4.1） ───────────────────────────────────────────────

/**
 * 写入（upsert）一条错题本条目。
 * @param {object} mistake — 含 id/original/correction/type/severity/why/reviewId/addedAt 等
 */
export function mistakesPut(mistake) {
  return _tx("mistakes", "readwrite", (store) => _req(store.put(mistake)));
}

/**
 * 获取全部错题本条目。
 * @returns {Promise<Array>}
 */
export function mistakesList() {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("mistakes", "readonly");
      const req = tx.objectStore("mistakes").getAll();
      req.onsuccess = (e) => resolve(e.target.result || []);
      req.onerror = (e) => reject(e.target.error);
    });
  });
}

/**
 * 获取单条错题本条目。
 * @param {string} id
 */
export function mistakesGet(id) {
  return _tx("mistakes", "readonly", (store) => _req(store.get(id)));
}

/**
 * 删除一条错题本条目。
 * @param {string} id
 */
export function mistakesDelete(id) {
  return _tx("mistakes", "readwrite", (store) => _req(store.delete(id)));
}

// ── trainings（写作训练历史，阶段4.2） ────────────────────────────────────────

/**
 * 写入（upsert）一条写作训练记录。
 * @param {object} training — 含 id/createdAt/mode/itemIds/text/result/model
 */
export function trainingsPut(training) {
  return _tx("trainings", "readwrite", (store) => _req(store.put(training)));
}

/**
 * 获取全部写作训练记录，按 createdAt 倒序。
 * @returns {Promise<Array>}
 */
export function trainingsList() {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("trainings", "readonly");
      const req = tx.objectStore("trainings").getAll();
      req.onsuccess = (e) => {
        const items = e.target.result || [];
        items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        resolve(items);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  });
}

// ── chunks（词块系统，阶段9） ──────────────────────────────────────────────

/**
 * 写入（upsert）一条词块。
 * @param {object} chunk — 含 id/text/meaning/example/source/sourceRef/addedAt/lastDrilled/
 *   drillCount/correctRefs/correctTopics/mastered/star
 */
export function chunksPut(chunk) {
  return _tx("chunks", "readwrite", (store) => _req(store.put(chunk)));
}

/**
 * 获取全部词块。
 * @returns {Promise<Array>}
 */
export function chunksList() {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("chunks", "readonly");
      const req = tx.objectStore("chunks").getAll();
      req.onsuccess = (e) => resolve(e.target.result || []);
      req.onerror = (e) => reject(e.target.error);
    });
  });
}

/**
 * 获取单条词块。
 * @param {string} id
 */
export function chunksGet(id) {
  return _tx("chunks", "readonly", (store) => _req(store.get(id)));
}

/**
 * 删除一条词块。
 * @param {string} id
 */
export function chunksDelete(id) {
  return _tx("chunks", "readwrite", (store) => _req(store.delete(id)));
}
