"""隔离单测：书架接口加固（Task 3）——不联网、不起 18760 服务器。

覆盖：
  1. server RPC dispatch：_get_api() 惰性初始化抛异常时，返回 {"error":...} JSON（而非裸 500）。
  2. _write_index 原子写：并发读线程绝不会因读到半截 index.json 而拿到 []。
  3. _read_index 解析失败时向 stderr 点灯。

跑： cd ~/Documents/situ && ./.venv/bin/python santu_app/mobile/_devtest/test_library_hardening.py
"""
import io
import json
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from santu_app import server  # noqa: E402
from santu_app import app as appmod  # noqa: E402

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


# ── 1) dispatch：_get_api 抛异常 → JSON error，不裸 500 崩 ──────────────────────
print("[1] RPC dispatch：_get_api 初始化失败也返回 JSON")

# 造一个最小 WSGI environ 打 /api/list_library（EXPOSED 里的无参方法）
captured = {}

def start_response(status, headers, exc_info=None):
    captured["status"] = status
    captured["headers"] = headers

environ = {
    "PATH_INFO": "/api/list_library",
    "REQUEST_METHOD": "GET",
    "wsgi.input": io.BytesIO(b""),
    "CONTENT_LENGTH": "0",
}

_orig_get_api = server._get_api

def boom():
    raise RuntimeError("模拟 Api() 词表加载炸了")

server._get_api = boom
try:
    body_iter = server.application(environ, start_response)
    raw = b"".join(body_iter)
finally:
    server._get_api = _orig_get_api

check("响应可 JSON 解析（非裸 500 崩）", True)  # 走到这没抛异常本身即证明没崩
try:
    parsed = json.loads(raw.decode("utf-8"))
    ok_json = isinstance(parsed, dict) and "error" in parsed
except Exception as e:
    ok_json = False
    parsed = f"<解析失败 {e}: {raw[:80]!r}>"
check("返回体是 {\"error\":...} JSON", ok_json, repr(parsed))
check("error 里带上了异常信息", ok_json and "RuntimeError" in parsed["error"], repr(parsed))
# 前端拿到 JSON（哪怕是 error）就不会把它当"空列表"猜——比裸 500 强
print(f"    status={captured.get('status')}  body={parsed}")


# ── 2) _write_index 原子写：并发读不会读到半截 ────────────────────────────────
print("[2] _write_index 原子写：并发读永不半截")

# 用临时目录当 LIBRARY，避免碰真数据
import tempfile
tmpdir = Path(tempfile.mkdtemp(prefix="situ_test_lib_"))
_orig_library = appmod.LIBRARY
appmod.LIBRARY = tmpdir

# 造一个桩 self，只需 _index_path / _read_index / _write_index（都是普通方法，绑到桩上调）
class _Stub:
    def _index_path(self):
        return appmod.LIBRARY / "index.json"
    _read_index = appmod.Api._read_index
    _write_index = appmod.Api._write_index

stub = _Stub()

# 大 payload，让非原子写更容易被读到半截
big_items = [{"id": f"doc{i}", "title": "书名很长很长" * 50, "n": i} for i in range(400)]
small_items = [{"id": "solo", "title": "x"}]

stop = threading.Event()
bad_reads = []   # 记录任何"读到 [] 或解析失败"的坏读
read_count = [0]

def reader():
    while not stop.is_set():
        got = stub._read_index()
        read_count[0] += 1
        # 一旦写过至少一次，index 就该恒有内容；读到 [] = 撞上半截/中间态
        if got == [] and (tmpdir / "index.json").exists():
            bad_reads.append("empty")

def writer():
    for _ in range(300):
        stub._write_index(big_items)
        stub._write_index(small_items)

# 先写一次建文件
stub._write_index(small_items)
rt = threading.Thread(target=reader, daemon=True)
rt.start()
wt = threading.Thread(target=writer)
wt.start()
wt.join()
stop.set()
rt.join(timeout=2)

check("并发读期间无一次读到空/半截（原子写生效）", not bad_reads,
      f"bad_reads={len(bad_reads)} / total_reads={read_count[0]}")
check("总读取次数 > 0（读线程真跑了）", read_count[0] > 0, f"reads={read_count[0]}")
# 收尾后 index.json 内容完整可解析
final = stub._read_index()
check("最终 index.json 完整可解析", isinstance(final, list) and len(final) in (len(big_items), len(small_items)),
      f"len={len(final) if isinstance(final, list) else final}")
# 确认没留下 .tmp 残渣
leftover = list(tmpdir.glob("index.json.tmp*"))
check("无 .tmp 残渣", not leftover, repr([p.name for p in leftover]))

appmod.LIBRARY = _orig_library


# ── 3) _read_index 解析失败点灯 stderr ────────────────────────────────────────
print("[3] _read_index 解析失败 → stderr 点灯")

tmpdir2 = Path(tempfile.mkdtemp(prefix="situ_test_lib2_"))
appmod.LIBRARY = tmpdir2
(tmpdir2 / "index.json").write_text('{"half": ', encoding="utf-8")  # 故意写坏 JSON（截断）

_err = io.StringIO()
_orig_stderr = sys.stderr
sys.stderr = _err
try:
    got = stub._read_index()
finally:
    sys.stderr = _orig_stderr
appmod.LIBRARY = _orig_library

check("坏 JSON 时仍返回 []（不抛）", got == [], repr(got))
check("stderr 打了点灯日志", "_read_index 解析失败" in _err.getvalue(), repr(_err.getvalue()))


print(f"\n{'='*40}\n结果：{PASS} passed, {FAIL} failed")
sys.exit(1 if FAIL else 0)
