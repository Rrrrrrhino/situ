/**
 * js/core/index.js — SituCore 打包入口
 *
 * 平铺重导出所有需要挂到 window.SituCore 的符号。
 * esbuild 用 --global-name=SituCore 时这些导出会直接成为 window.SituCore.xxx。
 *
 * 打包命令（在 mobile/ 目录下）：
 *   npm run build
 *
 * 测试页访问方式（保持契约不变）：
 *   const { VocabClassifier, renderArticleFragment, setDataBase } = window.SituCore;
 */

// ── classifier.js ──────────────────────────────────────────────────────────
export {
  VocabClassifier,
  LEVELS,
  DEFAULT_LEVEL,
  COMMON_RANK_CUTOFF,
  _spellingVariants,
  _STOPWORDS,
  _tierFor,
  _freqBand,
  setDataBase,
} from "./classifier.js";

// ── renderer.js ───────────────────────────────────────────────────────────
export { renderArticleFragment } from "./renderer.js";

// ── nlp.js ────────────────────────────────────────────────────────────────
export { analyze, lemmatize } from "./nlp.js";

// ── extract.js ────────────────────────────────────────────────────────────
export { parseEpubFromArrayBuffer, parseTxt, extractFromHtml } from "./extract.js";

// ── store.js ──────────────────────────────────────────────────────────────
export {
  openDB, setIDBFactory,
  libraryList, libraryUpsert, libraryDelete,
  archiveGet, archivePut, archiveDelete,
  vocabGetAll, vocabGet, vocabPut, vocabDelete, vocabClear, vocabImportBatch,
  settingsGet, settingsPut, settingsGetAll,
  reviewsPut, reviewsList,
  mistakesPut, mistakesList, mistakesGet, mistakesDelete,
  chunksPut, chunksList, chunksGet, chunksDelete,
} from "./store.js";

// ── localapi.js ───────────────────────────────────────────────────────────
export { LocalApi } from "./localapi.js";

// ── http.js ───────────────────────────────────────────────────────────────
export { httpPost } from "./http.js";

// ── llm.js ────────────────────────────────────────────────────────────────
export { explainWord, explainSelection, askFollowup, reviewSpeech, chunkDrill, chunkTopic, PROVIDERS as LLM_PROVIDERS } from "./llm.js";

// ── audio.js ──────────────────────────────────────────────────────────────
export { getAudio } from "./audio.js";
