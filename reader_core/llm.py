"""LLM word explanation — contextual, warm, etymology-aware.

Provider-agnostic via OpenAI-compatible APIs (DeepSeek / Zhipu / Kimi / OpenAI).
Configure via .env:
    LLM_PROVIDER=deepseek|zhipu|kimi|openai
    LLM_API_KEY=...
    LLM_MODEL=deepseek-chat   (optional; sensible default per provider)
    LLM_BASE_URL=...          (optional override)
"""
from __future__ import annotations
import os
import re
import json
from dataclasses import dataclass, asdict
from pathlib import Path

PROVIDERS = {
    "deepseek": ("https://api.deepseek.com/v1", "deepseek-v4-pro"),
    "zhipu":    ("https://open.bigmodel.cn/api/paas/v4", "glm-4-flash"),
    "kimi":     ("https://api.moonshot.cn/v1", "moonshot-v1-8k"),
    "openai":   ("https://api.openai.com/v1", "gpt-4o-mini"),
}


@dataclass
class WordExplanation:
    word: str            # surface form clicked
    lemma: str           # dictionary form
    phonetic: str        # IPA, e.g. /ˌrev.ɚˈbɝː.ɚ.eɪt/
    pos: str             # 词性，如 v. / n. / adj.
    literal: str         # 本义 / 核心意思（中文）
    contextual: str      # 在当前语境中的意思（中文）
    explanation: str     # 有温度的讲解：本义如何引申到这里
    ok: bool = True
    error: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


SYSTEM_PROMPT = """你是一位博学又温暖的英语老师，最擅长把一个单词讲"活"。
你面对的是中国 CET-4/6 水平的学习者。你讲单词时，不只给一个干巴巴的中文意思，
而是会带着学生看见这个词的来历、画面和情感，让人记得住、有共鸣。
你只输出严格的 JSON，不输出任何额外文字。"""


USER_TEMPLATE = """请讲解英文单词 **{word}**（原形：{lemma}）在下面这句话里的用法。

【这句话】
{sentence}

【文章主题】{title}

请输出严格 JSON，字段如下：
{{
  "phonetic": "国际音标（IPA），带斜杠，如 /ˈsʌm.θɪŋ/。给通行的美式读音，务必准确，拿不准的音节宁可从简也不要造。",
  "pos": "在这句话里的词性，用简短中文+缩写，如 '动词 v.' / '形容词 adj.'",
  "literal": "这个词的本义/核心意思（中文，简洁，10-20字）。如果有有意思的词根/构词，可一并点出。",
  "contextual": "它在这句话里的具体意思（中文，结合上下文给最贴切的解释，15-30字）。不要照抄 literal——要体现这句话给它添了什么：具体指什么、带什么色彩。",
  "explanation": "一段有温度的讲解（中文，60-120字）：把本义和这里的语境意思连起来，讲清楚这个词是怎么从本义'引申'到这里的；可以用一点画面感、联想或词根故事帮助记忆。语气亲切、像老师在旁边轻声点拨，不要堆术语，不要复述前面的字段。"
}}

特别注意：若这个词在句中其实是**短语动词或固定搭配的一部分**（如 give up 里的 give、take …into account 里的 take），contextual 和 explanation 都要按**整个搭配**在此处的意思来讲，并点明「单看这个词会误解」。

只输出 JSON。"""


FOLLOWUP_SYSTEM = """你是一位博学又温暖的英语老师，正和一位 CET-4/6 水平的中国学生，围绕一篇英文文章里的某个词或词组做"追问式"讲解。
你的回答要：紧扣这个词/词组在【这句话】里的真实语境；用中文讲解，给英文例句时随手配一句简短中文翻译；语气亲切口语、像在旁边轻声点拨；不堆术语、不跑题、不要重复学生已经看到的讲解。
学生的目标是真正把这个词学透、用对，所以**该讲透就讲透、不要怕长**：把来龙去脉、用法边界、典型搭配、例句都讲清楚，宁可详尽也不要点到为止。可用很轻的 Markdown（**加粗**、换行、短横线列表）让较长的解析有层次，但不要输出 JSON 或代码块。"""


# 词汇深解：脱离当前语境，给一个词建立"词感/画面"的长解析。
# 刻意不引入其它相近生词做辨析——避免给学生凭空种下新的混淆（interference）。
DEEP_SYSTEM = """你是一位博学又温暖的英语老师，正帮一位 CET-4/6 水平的中国学生**建立一个英语词真正的"词感"**。学生对这个词不太熟、或和别的词记混了，需要你**脱离当前文章的语境**，把这个词本身讲透——它到底什么意思、给人什么画面和感觉。
请用中文，结构清楚、可以长，按下面几块来讲（每块用 **加粗小标题** 起头）：
**核心画面**：一两句话点出这个词最本质的意象/感觉，让学生"看见"它，而不是背一条干巴巴的中文释义。
**最常见的几种用法**：挑这个词在真实英语里最高频的 2–3 种含义/用法，每种都说清在什么场景下用，并各配 1 个地道英文例句 + 一句简短中文翻译，让学生从例句里"摸到"这个词。
**串起来的感觉**：用一句话把上面这些用法背后共通的内核串起来，帮学生形成一个统一的直觉。
要求：例句地道、画面感强；讲"感受和画面"而不是堆术语；**绝对不要**为了辨析而引入其它相近的生词（这会造成新的混淆），只聚焦这一个词本身。轻 Markdown 即可，不要 JSON 或代码块。"""


# 常见程度：只评判"当前语境下这个具体用法"的常见度，固定 5 档。
# 回答必须以可机器解析的一行起头：@@FREQ@@ <档位> | <领域，可留空>
FREQ_SYSTEM = """你是一位英语语料与语用专家，面对一位 CET-4/6 水平的中国学生。学生想知道：这个词/词组**在【这句话】里的这个具体含义和用法**，在真实英语里到底有多常见——好决定要不要专门去习得它。
请只评判**当前语境下的这个用法**（不是这个词所有意思的笼统常见度）。从下面 5 档里选**恰好一档**：极其常见 / 非常常见 / 常见 / 罕见 / 极其罕见。
你的回答**必须**严格以这样一行开头（程序要解析它，格式不能变）：
@@FREQ@@ <档位> | <领域或语体，可留空>
其中 <档位> 必须是上面 5 个词之一；若这个用法只在某个具体领域/行业/语体里才常见（如 财经、法律、口语、学术、文学），就在 | 后写出来；若是跨语境普遍如此，就连 | 一起省略。
然后空一行，用中文讲清楚：为什么落在这一档、通常在哪些场合会遇到它；再给 2–3 个能体现这个用法的英文例句，每句配一句简短中文翻译，让学生对这个用法留下画面和印象。可用轻 Markdown，但不要 JSON 或代码块。
若我在下面提供了这个词的【整体词频档】（A 最常用→E 生僻，来自语料排名），而它与你对**当前用法**常见度的判断明显相左（例如这个词整体偏生僻、但它在此处的这个用法其实相当常见，或反之），请在开头那行之后**先用一句话点破这个反差并简述原因**（如"这个词整体冷僻，但你遇到的这个用法是它最常见的意思"）——这正是学生最容易困惑、也最需要你解释清楚的地方。"""


SELECTION_SYSTEM = """你是一位博学又温暖的英语老师，面对的是 CET-4/6 水平的中国学习者。
学生从一篇英文文章里手动选中了一段文字——可能是一个短语/固定搭配，也可能是一整句话或一个从句。
你要先判断它属于「短语」还是「句子」，再据此给出讲解。你只输出严格的 JSON，不输出任何额外文字。"""


SELECTION_TEMPLATE = """学生选中的文字是：
**{text}**

它所在的句子（上下文）：
{sentence}

【文章主题】{title}

请先判断 kind（硬规则，照办即可）：
- 选中文字达到 **6 个英文单词或以上**，一律 kind = "sentence"——不管它看起来像不像短语、完不完整。
- 只有 5 个词以内、且不含主谓结构的短语 / 固定搭配，才是 kind = "phrase"。
- 拿不准时，宁可判 "sentence"。

然后据此输出严格 JSON。

【如果 kind = "phrase"】
{{
  "kind": "phrase",
  "meaning": "这个短语在当前语境中的意思（中文，简洁贴切，15-45字）。",
  "talk": "一段有温度的讲解（中文，60-150字）：讲清这个短语的用法、为什么这么搭配、语气色彩；若它本身是值得记的固定搭配/高频表达，点出来。不要只复述意思。"
}}

【如果 kind = "sentence"】
{{
  "kind": "sentence",
  "meaning": "这段文字在语境里的**完整**意思（中文，30-110字）。务必覆盖学生所选的全部内容，绝不能只翻译开头。若学生只选了句子的一部分、结构或意思不完整（例如以介词/连词截断，像 '…flows of' 这样断在半截），请结合上下文把缺失的部分补足，让「含义」呈现这段文字所在的**完整句子**的意思；可在末尾用（……）简短标注你补足的部分。",
  "key_words": [
    {{"word": "句中核心或较难的词/短语（英文，原形）", "gloss": "简短中文释义（10字内）"}}
  ],
  "talk": "一段讲解（中文，100-220字）：不要只把句意再重申一遍。要把上面 key_words 里的重点词逐个讲清；若句中有出色、高频或地道的表达——无论是单词、短语还是句式结构——都点出来并稍作讲解，让学生学到能复用的东西。语气亲切，像老师在旁边点拨。"
}}

key_words 列 2-5 个最值得学的即可，宁缺毋滥。只输出 JSON。"""


class WordExplainer:
    def __init__(self, env_path: Path | None = None):
        self._env_path = env_path
        self._load()

    def _load(self):
        """(Re)read credentials. Precedence: environment / .env (for dev & CLI)
        first, then the in-app user config file (for the packaged app, where
        friends enter their own key in Settings instead of editing .env)."""
        from dotenv import load_dotenv
        if self._env_path and self._env_path.exists():
            load_dotenv(self._env_path, override=False)
        else:
            load_dotenv(override=False)
        try:
            from .userconfig import load_user_config
            cfg = load_user_config()
        except Exception:
            cfg = {}

        self.provider = (os.getenv("LLM_PROVIDER") or cfg.get("provider") or "").lower().strip()
        self.api_key = (os.getenv("LLM_API_KEY") or cfg.get("api_key") or "").strip()
        self.model = (os.getenv("LLM_MODEL") or cfg.get("model") or "").strip()
        self.base_url = (os.getenv("LLM_BASE_URL") or cfg.get("base_url") or "").strip()

        if self.provider in PROVIDERS:
            default_url, default_model = PROVIDERS[self.provider]
            if not self.base_url:
                self.base_url = default_url
            if not self.model:
                self.model = default_model

        self.enabled = bool(self.api_key and self.base_url and self.model)
        self._client = None

    def reload(self):
        """Pick up credentials the user just saved in the Settings panel."""
        self._load()

    @property
    def client(self):
        if self._client is None:
            from openai import OpenAI
            self._client = OpenAI(api_key=self.api_key, base_url=self.base_url, timeout=30)
        return self._client

    def explain(self, word: str, lemma: str, sentence: str, title: str = "") -> WordExplanation:
        if not self.enabled:
            return WordExplanation(word, lemma, "", "", "", "", "", ok=False,
                                   error="还没填 API Key，点右上角「设置」填入后即可讲解")
        prompt = USER_TEMPLATE.format(
            word=word, lemma=lemma,
            sentence=sentence[:600], title=(title or "（无）")[:120],
        )
        try:
            resp = self._create(prompt, want_json=True)
        except Exception:
            try:
                resp = self._create(prompt, want_json=False)
            except Exception as e:
                return WordExplanation(word, lemma, "", "", "", "", "", ok=False, error=str(e))

        content = resp.choices[0].message.content or "{}"
        data = _extract_json(content)
        return WordExplanation(
            word=word, lemma=lemma,
            phonetic=str(data.get("phonetic", "")).strip(),
            pos=str(data.get("pos", "")).strip(),
            literal=str(data.get("literal", "")).strip(),
            contextual=str(data.get("contextual", "")).strip(),
            explanation=str(data.get("explanation", "")).strip(),
            ok=True,
        )

    def explain_stream(self, word: str, lemma: str, sentence: str, title: str = "",
                       on_update=None) -> WordExplanation:
        """explain() 的流式版：边收流边把已解析出的字段喂给 on_update(fields)，
        fields = {字段名: {"text": 已到的内容, "done": 该字段是否收完}}，
        最终返回与 explain() 完全同形的 WordExplanation。任何流式环节失败
        （连接、解析、空结果）都整体回落到非流式 explain()，讲解质量与内容不变。"""
        if not self.enabled:
            return WordExplanation(word, lemma, "", "", "", "", "", ok=False,
                                   error="还没填 API Key，点右上角「设置」填入后即可讲解")
        prompt = USER_TEMPLATE.format(
            word=word, lemma=lemma,
            sentence=sentence[:600], title=(title or "（无）")[:120],
        )
        try:
            stream = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.6,
                response_format={"type": "json_object"},
                stream=True,
            )
            buf = ""
            for chunk in stream:
                if not chunk.choices:
                    continue
                delta = chunk.choices[0].delta.content
                if not delta:
                    continue   # 推理模型的 reasoning_content 等一概忽略，只收正文
                buf += delta
                if on_update is not None:
                    try:
                        on_update(_partial_str_fields(buf, _WORD_FIELDS))
                    except Exception:
                        pass
            data = _extract_json(buf)
            if not data:
                raise ValueError("stream produced no parsable JSON")
            return WordExplanation(
                word=word, lemma=lemma,
                phonetic=str(data.get("phonetic", "")).strip(),
                pos=str(data.get("pos", "")).strip(),
                literal=str(data.get("literal", "")).strip(),
                contextual=str(data.get("contextual", "")).strip(),
                explanation=str(data.get("explanation", "")).strip(),
                ok=True,
            )
        except Exception:
            return self.explain(word, lemma, sentence, title)

    def explain_selection(self, *, text: str, sentence: str = "", title: str = "") -> dict:
        """Explain a manually-selected span. The model first decides whether the span
        is a 短语(phrase) or a 句子(sentence) and answers in the matching shape:
          phrase   → {ok, kind:"phrase",   meaning, talk}
          sentence → {ok, kind:"sentence", meaning, key_words:[{word,gloss}], talk}
        Returns {ok:False, error} on failure."""
        if not self.enabled:
            return {"ok": False, "error": "还没填 API Key，点右上角「设置」填入后即可讲解"}
        text = (text or "").strip()
        if not text:
            return {"ok": False, "error": "没有选中文字"}
        prompt = SELECTION_TEMPLATE.format(
            text=text[:2000], sentence=(sentence or text)[:1200],
            title=(title or "（无）")[:120],
        )
        try:
            resp = self._create_sel(prompt, want_json=True)
        except Exception:
            try:
                resp = self._create_sel(prompt, want_json=False)
            except Exception as e:
                return {"ok": False, "error": str(e)[:160]}
        content = resp.choices[0].message.content or "{}"
        data = _extract_json(content)
        kind = str(data.get("kind", "")).strip().lower()
        if kind not in ("phrase", "sentence"):
            # fall back to a simple heuristic if the model omitted/garbled the kind
            tail = text.rstrip()[-1:] if text else ""
            kind = "sentence" if (len(text.split()) >= 5 or tail in ".?!；;") else "phrase"
        # safety net: a long span is sentence-level material no matter what the model guessed
        # (it stubbornly mislabels long fragments like "...has made efforts to control... of" as 短语)
        if len(text.split()) >= 6:
            kind = "sentence"
        out = {
            "ok": True, "kind": kind,
            "meaning": str(data.get("meaning", "")).strip(),
            "talk": str(data.get("talk", "")).strip(),
        }
        if kind == "sentence":
            clean = []
            for k in (data.get("key_words") or []):
                if isinstance(k, dict):
                    w = str(k.get("word", "")).strip()
                    g = str(k.get("gloss", "")).strip()
                    if w:
                        clean.append({"word": w, "gloss": g})
            out["key_words"] = clean
        return out

    def followup(self, *, word: str, lemma: str = "", sentence: str = "",
                 title: str = "", prior: str = "", history=None, question: str = "",
                 mode: str = "", band: str = "") -> dict:
        """Free-form, context-aware follow-up Q&A about a word/phrase. Multi-turn:
        `history` is a list of {"q","a"} prior turns. `mode` swaps the system prompt
        for the special quick-ask buttons: "deep"=词汇深解 (decontextualized深解),
        "freq"=常见程度 (5-level frequency verdict); anything else = the default
        context-bound tutor. Returns {"ok","answer"} or {"ok":False,"error":...}.
        Plain text (light Markdown), not JSON."""
        if not self.enabled:
            return {"ok": False, "error": "还没填 API Key，点右上角「设置」填入后即可追问"}
        word = (word or "").strip()
        if not word:
            return {"ok": False, "error": "缺少要追问的词"}
        mode = (mode or "").strip().lower()
        system = {"deep": DEEP_SYSTEM, "freq": FREQ_SYSTEM}.get(mode, FOLLOWUP_SYSTEM)
        ctx = f"我们在讨论的词/词组：**{word}**"
        if lemma and lemma.lower() != word.lower():
            ctx += f"（原形：{lemma}）"
        if sentence:
            ctx += f"\n【这句话】{sentence[:600]}"
        if title:
            ctx += f"\n【文章主题】{title[:120]}"
        if prior:
            ctx += f"\n【学生已看到的讲解】{prior[:2000]}"
        # Only the freq verdict cares about the corpus band — feed it so the model can
        # point out a contradiction between overall rarity and this usage's commonness.
        if mode == "freq" and band:
            ctx += f"\n【这个词的整体词频档】{band}（A 最常用→E 生僻，来自语料排名，和'当前用法常见度'是两回事）"
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": ctx + "\n\n（接下来我会就这个词向你追问，请始终扣住以上语境作答。）"},
            {"role": "assistant", "content": "好的，我已经记住这个词在这句话里的语境了，你问吧。"},
        ]
        for turn in (history or []):
            q = (turn.get("q") or "").strip()
            a = (turn.get("a") or "").strip()
            if q:
                messages.append({"role": "user", "content": q})
            if a:
                messages.append({"role": "assistant", "content": a})
        messages.append({"role": "user", "content": (question or "").strip() or "就这个词再多讲一点。"})
        try:
            resp = self.client.chat.completions.create(
                model=self.model, messages=messages, temperature=0.7,
            )
            ans = (resp.choices[0].message.content or "").strip()
            if not ans:
                return {"ok": False, "error": "没收到回答，请重试"}
            return {"ok": True, "answer": ans}
        except Exception as e:
            return {"ok": False, "error": str(e)[:160]}

    def validate(self) -> tuple[bool, str]:
        """Quick credential check for the Settings panel's 测试 button.
        Returns (ok, message)."""
        if not self.api_key:
            return False, "还没填 API Key"
        if not (self.base_url and self.model):
            return False, "请选择服务商"
        try:
            self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": "ping"}],
                max_tokens=1,
                temperature=0,
            )
            return True, "Key 有效，连接成功 ✓"
        except Exception as e:
            msg = str(e)
            low = msg.lower()
            if "401" in msg or "auth" in low or "invalid" in low or "key" in low:
                return False, "Key 无效或未授权，请检查后重填"
            if "insufficient" in low or "balance" in low or "quota" in low or "402" in msg:
                return False, "账户余额不足，请充值后再试"
            return False, f"连接失败：{msg[:120]}"

    def _create(self, prompt: str, want_json: bool):
        kwargs = dict(
            model=self.model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            temperature=0.6,
        )
        if want_json:
            kwargs["response_format"] = {"type": "json_object"}
        return self.client.chat.completions.create(**kwargs)

    def _create_sel(self, prompt: str, want_json: bool):
        kwargs = dict(
            model=self.model,
            messages=[
                {"role": "system", "content": SELECTION_SYSTEM},
                {"role": "user", "content": prompt},
            ],
            temperature=0.6,
        )
        if want_json:
            kwargs["response_format"] = {"type": "json_object"}
        return self.client.chat.completions.create(**kwargs)


# 流式增量解析要盯的讲解字段（与 USER_TEMPLATE 的输出 JSON 一一对应，按渲染顺序）
_WORD_FIELDS = ("phonetic", "pos", "literal", "contextual", "explanation")


def _partial_str_fields(buf: str, keys) -> dict:
    """从一段【不完整的】JSON 文本里尽力抽出各字符串字段的当前值。
    对每个已出现的 key 返回 {"text": 目前收到的值, "done": 收尾引号是否已到}。
    末尾悬着半个转义符时按「再等等」处理，不产出坏字符。"""
    out = {}
    for key in keys:
        m = re.search(r'"%s"\s*:\s*"' % re.escape(key), buf)
        if not m:
            continue
        rest = buf[m.end():]
        raw = []
        done = False
        i = 0
        while i < len(rest):
            c = rest[i]
            if c == "\\":
                if i + 1 < len(rest):
                    raw.append(rest[i:i + 2])
                    i += 2
                    continue
                break          # 悬空转义符在流边缘，等下一个 chunk
            if c == '"':
                done = True
                break
            raw.append(c)
            i += 1
        s = "".join(raw)
        try:
            s = json.loads('"' + s + '"')   # 统一反转义（\n、\"、\uXXXX…）
        except Exception:
            s = s.replace('\\"', '"').replace("\\n", "\n")
        out[key] = {"text": s, "done": done}
    return out


def _extract_json(content: str) -> dict:
    content = content.strip()
    if content.startswith("```"):
        content = content.split("\n", 1)[1] if "\n" in content else content
        if content.endswith("```"):
            content = content[:-3]
        if content.startswith("json"):
            content = content[4:]
    try:
        return json.loads(content)
    except Exception:
        start = content.find("{")
        end = content.rfind("}")
        if start >= 0 and end > start:
            try:
                return json.loads(content[start:end + 1])
            except Exception:
                pass
        return {}
