"""Vocabulary classifier: lemmatize tokens, classify against CET-4/CET-6 wordlists,
rank unknowns by daily-context frequency (OpenSubtitles).

Operates on structured blocks (headings / paragraphs) so the renderer can preserve
the original article's visual hierarchy.
"""
from __future__ import annotations
import re
from pathlib import Path
from dataclasses import dataclass, field

from .userconfig import resource_base
DATA_DIR = resource_base() / "data"

_STOPWORDS = {
    "a", "an", "the", "and", "or", "but", "if", "of", "at", "by", "for", "with",
    "about", "against", "between", "into", "through", "during", "before", "after",
    "above", "below", "to", "from", "up", "down", "in", "out", "on", "off", "over",
    "under", "again", "further", "then", "once", "here", "there", "when", "where",
    "why", "how", "all", "any", "both", "each", "few", "more", "most", "other",
    "some", "such", "no", "nor", "not", "only", "own", "same", "so", "than",
    "too", "very", "s", "t", "can", "will", "just", "don", "should", "now",
    "i", "me", "my", "myself", "we", "our", "ours", "ourselves", "you", "your",
    "yours", "yourself", "yourselves", "he", "him", "his", "himself", "she", "her",
    "hers", "herself", "it", "its", "itself", "they", "them", "their", "theirs",
    "themselves", "what", "which", "who", "whom", "this", "that", "these", "those",
    "am", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had",
    "having", "do", "does", "did", "doing", "would", "could", "should", "ought",
    "may", "might", "must", "shall",
}

_WORD_RE = re.compile(r"^[a-z]+(?:-[a-z]+)*$")

# Frequency rank below this = "common in daily life" (heavier highlight)
COMMON_RANK_CUTOFF = 8000

# English levels → "known frequency rank": a learner at this level is assumed to
# know roughly the most common N words; words rarer than that (and not in the CET
# basics) get flagged as 生词. Smooth, needs no extra wordlists beyond CET4/6.
LEVELS = {
    "cet4":   {"label": "CET-4",   "known_rank": 4000},
    "cet4-6": {"label": "CET-4~6", "known_rank": 5500},
    "cet6":   {"label": "CET-6",   "known_rank": 6500},
    "kaoyan": {"label": "考研",    "known_rank": 9000},
    "ielts":  {"label": "雅思",    "known_rank": 13000},
    "toefl":  {"label": "托福",    "known_rank": 18000},
}
DEFAULT_LEVEL = "cet4-6"


def _spelling_variants(w: str) -> list[str]:
    out = [w]
    if w.endswith("or") and not w.endswith(("ator", "ctor", "ssor", "tor")):
        out.append(w[:-2] + "our")
    if w.endswith("our"):
        out.append(w[:-3] + "or")
    if w.endswith("ize"):
        out.append(w[:-3] + "ise")
    if w.endswith("ise"):
        out.append(w[:-3] + "ize")
    if w.endswith("ization"):
        out.append(w[:-7] + "isation")
    if w.endswith("isation"):
        out.append(w[:-7] + "ization")
    if w.endswith("ter"):
        out.append(w[:-2] + "re")
    if w.endswith("tre"):
        out.append(w[:-2] + "er")
    if w.endswith("log"):
        out.append(w + "ue")
    if w.endswith("logue"):
        out.append(w[:-2])
    return out


def _load_wordlist(path: Path) -> set[str]:
    words: set[str] = set()
    if not path.exists():
        return words
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = line.strip().lstrip("﻿")
        if not line or not line[0].isascii() or not line[0].isalpha():
            continue
        m = re.match(r"([A-Za-z][A-Za-z\-]*)", line)
        if not m:
            continue
        w = m.group(1).lower()
        if len(w) >= 2:
            words.add(w)
    return words


def _load_frequency(path: Path) -> dict[str, int]:
    freq: dict[str, int] = {}
    if not path.exists():
        return freq
    for i, line in enumerate(path.read_text(encoding="utf-8", errors="ignore").splitlines(), start=1):
        parts = line.split()
        if not parts:
            continue
        w = parts[0].lower()
        if w not in freq:
            freq[w] = i
    return freq


@dataclass
class WordHit:
    lemma: str
    surface_forms: set[str] = field(default_factory=set)
    count: int = 0
    level: str = "unknown"          # cet4 / cet6 / beyond
    daily_rank: int | None = None   # 1 = most common; None = not in 50k list
    example_sentence: str = ""      # first sentence the word appears in (context for explanation)

    @property
    def freq_tier(self) -> str:
        """Two tiers, per user request: 'common' (heavier color) vs 'rare' (lighter)."""
        if self.daily_rank is not None and self.daily_rank < COMMON_RANK_CUTOFF:
            return "common"
        return "rare"


@dataclass
class RenderBlock:
    type: str                       # 'h2' | 'h3' | 'p'
    tokens: list[list[dict]]        # tokens per sentence
    sentences: list[str]


@dataclass
class VocabReport:
    blocks: list[RenderBlock]
    hits: dict[str, WordHit]        # keyed by lemma
    total_tokens: int


def _text_to_blocks(text: str):
    """Convert a raw string into Block-like objects (paragraphs split on blank lines)."""
    from .extractor import Block
    paras = re.split(r"\n\s*\n", text.strip())
    return [Block("p", p.strip().replace("\n", " ")) for p in paras if p.strip()]


# The wordlists, the SUBTLEX frequency table, and the spaCy model are level-INDEPENDENT
# and immutable once loaded, but _load_chapter_internal builds a fresh VocabClassifier
# per chapter — so without caching every chapter reload re-read three files AND reran
# spacy.load(), ~300ms+ of dead weight per chapter switch. Cache them process-wide.
_CET4: "set[str] | None" = None
_CET6: "set[str] | None" = None
_FREQ: "dict[str, int] | None" = None
_NLP = None


def _shared_cet4() -> "set[str]":
    global _CET4
    if _CET4 is None:
        _CET4 = _load_wordlist(DATA_DIR / "cet4.txt")
    return _CET4


def _shared_cet6() -> "set[str]":
    global _CET6
    if _CET6 is None:
        _CET6 = _load_wordlist(DATA_DIR / "cet6.txt")
    return _CET6


def _shared_freq() -> "dict[str, int]":
    global _FREQ
    if _FREQ is None:
        _FREQ = _load_frequency(DATA_DIR / "subtlex.txt")
    return _FREQ


def _shared_nlp():
    global _NLP
    if _NLP is None:
        import spacy
        _NLP = spacy.load("en_core_web_sm", disable=["ner"])
    return _NLP


class VocabClassifier:
    def __init__(self, user_level: str = "cet4-6"):
        self.user_level = user_level if user_level in LEVELS else DEFAULT_LEVEL
        cfg = LEVELS[self.user_level]
        self.known_rank = cfg["known_rank"]
        self.include_cet6 = self.known_rank >= LEVELS["cet6"]["known_rank"]
        # shared, read-only resources (loaded once process-wide)
        self.cet4 = _shared_cet4()
        self.cet6 = _shared_cet6()
        self.freq = _shared_freq()

    @property
    def nlp(self):
        return _shared_nlp()

    def _classify_lemma(self, lemma: str) -> str:
        for variant in _spelling_variants(lemma):
            if variant in self.cet4:
                return "cet4"
            if variant in self.cet6:
                return "cet6"
        return "beyond"

    def _is_flag(self, lemma: str, rank: int | None) -> bool:
        """Flag as 生词 unless the word is a CET basic or common enough for the level."""
        for variant in _spelling_variants(lemma):
            if variant in self.cet4:
                return False
            if self.include_cet6 and variant in self.cet6:
                return False
        if rank is not None and rank <= self.known_rank:
            return False
        return True

    def analyze(self, article_or_text) -> VocabReport:
        """Accept an Article (with .blocks), a list of Block, or a raw string."""
        from .extractor import Article, Block
        if isinstance(article_or_text, Article):
            blocks = article_or_text.blocks
        elif isinstance(article_or_text, list):
            blocks = article_or_text
        elif isinstance(article_or_text, str):
            blocks = _text_to_blocks(article_or_text)
        else:
            blocks = list(article_or_text)

        render_blocks: list[RenderBlock] = []
        hits: dict[str, WordHit] = {}
        total_tokens = 0

        for block in blocks:
            btype = getattr(block, "type", "p")
            btext = getattr(block, "text", str(block))
            if not btext.strip():
                continue
            doc = self.nlp(btext)
            block_tokens: list[list[dict]] = []
            block_sentences: list[str] = []
            for sent in doc.sents:
                sent_text = sent.text.strip()
                block_sentences.append(sent_text)
                sent_tokens: list[dict] = []
                for tok in sent:
                    if tok.is_space:
                        # A whitespace run (newline / repeated spaces) is its own
                        # spaCy token; silently dropping it welds the neighbours
                        # ('to'+'flesh' -> 'toflesh'). Preserve the gap by giving
                        # the preceding token a single trailing space instead.
                        if sent_tokens and sent_tokens[-1].get("ws") == "":
                            sent_tokens[-1]["ws"] = " "
                        continue
                    surface = tok.text
                    lemma = tok.lemma_.lower()
                    if not _WORD_RE.match(lemma) or tok.is_punct or tok.like_num:
                        sent_tokens.append({"text": surface, "ws": tok.whitespace_, "kind": "punct"})
                        continue
                    total_tokens += 1
                    pos = tok.pos_
                    rank = self.freq.get(lemma)
                    if lemma in _STOPWORDS or len(lemma) <= 2:
                        sent_tokens.append({"text": surface, "ws": tok.whitespace_, "kind": "stop",
                                            "lemma": lemma, "pos": pos, "rank": rank})
                        continue
                    # Proper nouns (人名/地名/机构名): clickable but never auto-flagged or pre-generated
                    if pos == "PROPN":
                        sent_tokens.append({"text": surface, "ws": tok.whitespace_, "kind": "propn",
                                            "lemma": lemma, "pos": pos, "rank": rank})
                        continue
                    level = self._classify_lemma(lemma)
                    flagged = self._is_flag(lemma, rank)
                    if flagged:
                        if lemma not in hits:
                            hits[lemma] = WordHit(
                                lemma=lemma, level=level, daily_rank=rank,
                                example_sentence=sent_text,
                            )
                        h = hits[lemma]
                        h.count += 1
                        h.surface_forms.add(surface)
                        sent_tokens.append({
                            "text": surface, "ws": tok.whitespace_, "kind": "flag",
                            "lemma": lemma, "level": level, "pos": pos, "rank": rank,
                            "freq": hits[lemma].freq_tier,
                            "sentence": sent_text,
                        })
                    else:
                        sent_tokens.append({
                            "text": surface, "ws": tok.whitespace_, "kind": "known",
                            "lemma": lemma, "level": level, "pos": pos, "rank": rank,
                        })
                block_tokens.append(sent_tokens)
            render_blocks.append(RenderBlock(type=btype, tokens=block_tokens, sentences=block_sentences))

        return VocabReport(blocks=render_blocks, hits=hits, total_tokens=total_tokens)

    def classify_word(self, word: str, sentence: str = "") -> dict:
        """Lemmatize + classify a single clicked word (may be any word, not just
        auto-flagged vocab). Returns {lemma, level, freq_tier}.

        Per product spec, when daily frequency is unknown we default the tier to
        'common' (heavier color) — 'when unsure, treat as high-frequency'.
        """
        surface = (word or "").strip()
        lemma = surface.lower()
        try:
            if sentence:
                doc = self.nlp(sentence)
                match = None
                for tok in doc:
                    if tok.text.lower() == surface.lower():
                        match = tok
                        break
                if match is None:
                    match = self.nlp(surface)[0] if surface else None
            else:
                d = self.nlp(surface)
                match = d[0] if len(d) else None
            if match is not None:
                lemma = match.lemma_.lower() or lemma
        except Exception:
            pass

        level = self._classify_lemma(lemma)
        rank = self.freq.get(lemma)
        if rank is not None and rank >= COMMON_RANK_CUTOFF:
            tier = "rare"
        else:
            tier = "common"  # known-common OR unknown → treat as high-frequency
        return {"lemma": lemma, "level": level, "freq_tier": tier, "daily_rank": rank}

    def sorted_hits(self, report: VocabReport) -> list[WordHit]:
        """Sort by daily-context frequency (most common first), then by count."""
        def key(h: WordHit):
            rank = h.daily_rank if h.daily_rank is not None else 10**9
            return (rank, -h.count)
        return sorted(report.hits.values(), key=key)
