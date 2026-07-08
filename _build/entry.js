// 打包入口：暴露 nlp + classifier + renderer 到全局 window.SituCore
import { analyze as nlpAnalyze, lemmatize } from "../santu_app/mobile/js/core/nlp.js";
import {
  VocabClassifier, LEVELS, DEFAULT_LEVEL, COMMON_RANK_CUTOFF,
  _spellingVariants, _STOPWORDS, _tierFor, _freqBand, setDataBase,
} from "../santu_app/mobile/js/core/classifier.js";
import { renderArticleFragment } from "../santu_app/mobile/js/core/renderer.js";

// 全局挂载（浏览器访问）
if (typeof globalThis !== "undefined") {
  globalThis.SituCore = {
    nlp: { analyze: nlpAnalyze, lemmatize },
    classifier: {
      VocabClassifier, LEVELS, DEFAULT_LEVEL, COMMON_RANK_CUTOFF,
      _spellingVariants, _STOPWORDS, _tierFor, _freqBand, setDataBase,
    },
    renderer: { renderArticleFragment },
  };
}

export {
  nlpAnalyze, lemmatize,
  VocabClassifier, LEVELS, DEFAULT_LEVEL, COMMON_RANK_CUTOFF,
  _spellingVariants, _STOPWORDS, _tierFor, _freqBand, setDataBase,
  renderArticleFragment,
};
