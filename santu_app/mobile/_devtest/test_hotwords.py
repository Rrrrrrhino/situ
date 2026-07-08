"""隔离单测：转写热词注入（火山 corpus）—— mock 火山端点，不联网、不起服务器。

覆盖：
  1. _hotwords_corpus：把词表拼成 corpus.context（JSON 字符串 {"hotwords":[{"word":...}]}），去重 + cap 100。
  2. 极速版 _transcribe_slice_flash：
     - 带热词时请求体正确注入 request.corpus.context；
     - corpus 报参数错（4xx / 非成功码）时，去 corpus 重试一次（第二次请求体不含 corpus）。
  3. 标准版 _transcribe_one_slice：corpus 提交报错 → 去 corpus 换 reqid 重试。

跑： cd ~/Documents/situ && ./.venv/bin/python santu_app/mobile/_devtest/test_hotwords.py
（不占运行中 App 的 18760 端口；纯函数 + monkeypatch _volc_request，无网络）
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]  # ~/Documents/situ
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from santu_app import server  # noqa: E402

# 一段最小 wav（44 字节头 + 一点点 PCM），只为让切片时长/超时计算不炸；转写结果由 mock 决定。
import io
import wave as _wave


def _tiny_wav(sec: float = 1.0, sr: int = 16000) -> bytes:
    buf = io.BytesIO()
    with _wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(b"\x00\x00" * int(sr * sec))
    return buf.getvalue()


PASS = 0
FAIL = 0


def check(name, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  ✓ {name}")
    else:
        FAIL += 1
        print(f"  ✗ {name}  {detail}")


# ── 1) _hotwords_corpus 格式 ──────────────────────────────────────────────────
print("[1] _hotwords_corpus 格式")

corpus = server._hotwords_corpus(["Fable 5", "Sesame", "deepseek", "DeepSeek", "  ", None])
check("返回含 context 字段", corpus and "context" in corpus, repr(corpus))
ctx = json.loads(corpus["context"])
words = [h["word"] for h in ctx["hotwords"]]
check("context 是 JSON 字符串且解析出 hotwords 数组", isinstance(ctx.get("hotwords"), list), repr(ctx))
check("保留词内空格（Fable 5）", "Fable 5" in words, repr(words))
check("按小写去重（DeepSeek 只留一条）", words.count("deepseek") + words.count("DeepSeek") == 1, repr(words))
check("空/None 被剔除", "" not in words and None not in words, repr(words))

check("空词表返回 None", server._hotwords_corpus([]) is None)
check("None 返回 None", server._hotwords_corpus(None) is None)

big = server._hotwords_corpus([f"w{i}" for i in range(250)])
check("cap 100", len(json.loads(big["context"])["hotwords"]) == 100)


# ── 2) 极速版：注入 + 参数错回退 ───────────────────────────────────────────────
print("[2] 极速版 _transcribe_slice_flash")

wav = _tiny_wav()
corpus = server._hotwords_corpus(["Fable 5", "Sesame"])

# 2a. 成功路径：断言请求体注入了 corpus.context
calls = []

def mock_ok(url, appid, token, reqid, body, *, is_submit, resource_id=None, timeout=20):
    calls.append(body)
    return {
        "status": 200, "volc_code": "20000000",
        "body": {"result": {"utterances": [
            {"text": "hello Fable 5", "start_time": 0, "end_time": 500},
        ]}},
    }

_orig = server._volc_request
server._volc_request = mock_ok
try:
    res = server._transcribe_slice_flash(wav, 0, "appid", "tok", corpus)
finally:
    server._volc_request = _orig

check("成功路径返回 utterances", res is not None and res[0] and res[0][0]["text"] == "hello Fable 5", repr(res))
sent = calls[0]["request"]
check("请求体注入 request.corpus", "corpus" in sent, repr(sent))
inj_ctx = json.loads(sent["corpus"]["context"])
inj_words = [h["word"] for h in inj_ctx["hotwords"]]
check("注入的热词正确（含 Fable 5 / Sesame）", "Fable 5" in inj_words and "Sesame" in inj_words, repr(inj_words))
check("成功路径只发 1 次请求（无重试）", len(calls) == 1, f"len={len(calls)}")

# 2b. 参数错：第一次带 corpus 报 4xx → 去 corpus 重试一次
calls2 = []

def mock_param_err(url, appid, token, reqid, body, *, is_submit, resource_id=None, timeout=20):
    calls2.append(body)
    if len(calls2) == 1:
        # 首次（带 corpus）：模拟参数错——非成功码 45000002
        return {"status": 400, "volc_code": "45000002", "body": {}}
    # 重试（去 corpus）：成功
    return {
        "status": 200, "volc_code": "20000000",
        "body": {"result": {"utterances": [
            {"text": "recovered without corpus", "start_time": 0, "end_time": 300},
        ]}},
    }

server._volc_request = mock_param_err
try:
    res2 = server._transcribe_slice_flash(wav, 0, "appid", "tok", corpus)
finally:
    server._volc_request = _orig

check("参数错后共发 2 次请求（重试）", len(calls2) == 2, f"len={len(calls2)}")
check("第 1 次带 corpus", "corpus" in calls2[0]["request"], repr(calls2[0]["request"]))
check("第 2 次去掉 corpus", "corpus" not in calls2[1]["request"], repr(calls2[1]["request"]))
check("重试后成功返回", res2 is not None and res2[0] and res2[0][0]["text"] == "recovered without corpus", repr(res2))

# 2c. 无热词：不注入 corpus，也不重试
calls3 = []

def mock_plain(url, appid, token, reqid, body, *, is_submit, resource_id=None, timeout=20):
    calls3.append(body)
    return {"status": 200, "volc_code": "20000000",
            "body": {"result": {"utterances": [{"text": "no hotwords", "start_time": 0, "end_time": 100}]}}}

server._volc_request = mock_plain
try:
    res3 = server._transcribe_slice_flash(wav, 0, "appid", "tok", None)
finally:
    server._volc_request = _orig

check("无热词：请求体无 corpus", "corpus" not in calls3[0]["request"], repr(calls3[0]["request"]))
check("无热词：只发 1 次（corpus is None，不进重试分支）", len(calls3) == 1, f"len={len(calls3)}")


# ── 3) 标准版：corpus 提交报错 → 去 corpus 重试 ───────────────────────────────
print("[3] 标准版 _transcribe_one_slice")

calls4 = []

def mock_std(url, appid, token, reqid, body, *, is_submit, resource_id=None, timeout=20):
    if is_submit:
        calls4.append(body)
        if len(calls4) == 1:
            return {"status": 400, "volc_code": "", "body": {}, "error": "bad corpus"}
        return {"status": 200, "volc_code": "", "body": {}}
    # query 轮询：一次就给结果
    return {"status": 200, "volc_code": "", "body": {
        "audio_info": {"duration": 300},
        "result": {"utterances": [{"text": "std recovered", "start_time": 0, "end_time": 300}]},
    }}

server._volc_request = mock_std
try:
    utts, warns = server._transcribe_one_slice(wav, 0, "appid", "tok", corpus)
finally:
    server._volc_request = _orig

check("标准版 submit 报错后重试（共 2 次 submit）", len(calls4) == 2, f"len={len(calls4)}")
check("标准版第 1 次 submit 带 corpus", "corpus" in calls4[0]["request"], repr(calls4[0]["request"]))
check("标准版重试 submit 去掉 corpus", "corpus" not in calls4[1]["request"], repr(calls4[1]["request"]))
check("标准版重试后转出文本", utts and utts[0]["text"] == "std recovered", repr(utts))


print(f"\n{'='*40}\n结果：{PASS} passed, {FAIL} failed")
sys.exit(1 if FAIL else 0)
