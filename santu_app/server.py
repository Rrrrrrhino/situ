"""四土 手机版 HTTP 服务 —— 把现成的 Api 暴露成 PWA 可用的 /api/* 端点。

设计要点
--------
- **不改 app.py / index.html**：直接 import 现成的 `Api`，复用全部后端逻辑
  （EPUB 解析 / 词汇分层 / LLM 讲解 / 全局生词本 / 音频）。数据目录与桌面版
  共享同一份（`~/Documents/situ/{library,books,vocab,audio}`），所以生词本天然同步。
- **单用户单会话**：Api 本就是一次只持有一本书 / 一篇文章的设计；个人手机用一个
  全局 Api 实例即可。多标签页并发会互相打断当前文档状态——属边角情况，文档里注明。
- **并发**：Api 内部用锁 + 8 线程预热，本就为 pywebview 的工作线程并发设计；
  这里用 ThreadingWSGIServer 让 explain（~3s）不阻塞 get_pregen_status 等轮询。
- **桌面专属副作用方法不暴露**：export_csv / copy_text / reveal_in_finder /
  open_output_dir / read_clipboard / export_html 都依赖 macOS（pbcopy / 访达），
  在手机上改走「浏览器 Blob 下载 + navigator.clipboard」，故这里一律不挂出来。

启动： cd ~/Documents/situ && ./.venv/bin/python -m santu_app.server
"""
from __future__ import annotations

import json
import mimetypes
import sys
import threading
import time
import wave
from pathlib import Path
from socketserver import ThreadingMixIn
from wsgiref.simple_server import WSGIServer, WSGIRequestHandler, make_server

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from santu_app.app import Api, GLOBAL_VOCAB, VOCAB_DIR  # noqa: E402

PORT = 18760
MOBILE_DIR = HERE / "mobile"

# 阶段10：双轨对话录音落盘目录（Swift「四土对话录」写在这里；.gitignore 已排除）。
# 绝对锚死 ~/Documents/situ/…，与 Swift 引擎 HeadlessRunner.dualtrackDataDir() 保持同一份约定：
# 冻结进 四土.app 后 ROOT 指向包内只读区，若仍用 ROOT 推导，server 会读不到引擎落的盘。
DUALTRACK_DIR = Path.home() / "Documents" / "situ" / "data" / "dualtrack"

# 火山语音（阶段8 §7）：纯转发代理，绕开桌面浏览器直连的 CORS。
# 凭证只经手不落盘、不打日志——appid/token 由前端放进请求体，这里原样透传给火山。
_VOLC_SUBMIT_URL = "https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit"
_VOLC_QUERY_URL  = "https://openspeech.bytedance.com/api/v3/auc/bigmodel/query"
_VOLC_RESOURCE_ID = "volc.seedasr.auc"
# 极速版（2026-07-07 提速批）：一次请求同步返回识别结果，不排队不轮询，分钟级→秒级。
# 若极速版没跑通（未开通该资源/接口变动），_transcribe_slice 自动回退上面的标准版通道。
_VOLC_FLASH_URL = "https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash"
_VOLC_FLASH_RESOURCE_ID = "volc.bigasr.auc_turbo"

# 复述练习（阅读联动 2026-07-07）：主窗阅读页「复述」按钮递来的条子（进程内模块变量，
# 不落盘）。app.py set_retell_pending() 写入 → 复盘窗 GET /api/retell_pending 取一次即清。
_retell_lock = threading.Lock()
_retell_pending: dict | None = None


def set_retell_pending(payload: dict) -> None:
    """app.py 调（同进程 import 本模块）：存主窗要复述的 {title, text}。"""
    global _retell_pending
    with _retell_lock:
        _retell_pending = payload


def _retell_pop() -> dict:
    global _retell_pending
    with _retell_lock:
        p = _retell_pending
        _retell_pending = None
    return p or {}


# 唯一的会话实例（与桌面版共享磁盘数据，但内存里的"当前文档"是本服务独立的）。
# 惰性创建：Api() 初始化不轻（词表加载+预热线程池）。现前端一律走浏览器端
# LocalApi，本服务的 /api/<method> RPC 只剩兜底用途；四土桌面 App 在自己进程里
# 起本服务线程时（口语复盘窗口），没人调 RPC 就不该白付这份初始化。
_api = None
_api_lock = threading.Lock()


def _get_api() -> Api:
    global _api
    with _api_lock:
        if _api is None:
            _api = Api()
        return _api

# 暴露给前端的方法白名单： name -> 是否吃一个 args:dict 参数。
# 白名单本身就是安全闸——绝不 getattr 任意属性出来调。
EXPOSED: dict[str, bool] = {
    "get_config": False,
    "get_settings": False,
    "get_llm_defaults": False,  # 复盘窗读不到本地 key 时向主窗要默认（含原始 key，只经手不落盘）
    "save_settings": True,
    "test_settings": True,
    "process": True,
    "process_file": True,
    "get_toc": False,
    "load_chapter": True,
    "explain_word": True,
    "explain_selection": True,
    "ask_followup": True,
    "prewarm_word": True,
    "start_pregen": True,
    "get_pregen_status": False,
    "get_progress": False,
    "get_notebook": False,
    "get_global_notebook": False,
    "set_known_global": True,
    "delete_global": True,
    "set_star": True,
    "set_known": True,
    "get_audio": True,
    "list_library": False,
    "list_library_brief": False,   # 选材屏专用：不含 base64 封面的轻量目录（免数百 KB 白下）
    "load_archive": True,
    "delete_archive": True,
    "save_session": True,
}

_CORS = [
    ("Access-Control-Allow-Origin", "*"),
    ("Access-Control-Allow-Headers", "Content-Type"),
    ("Access-Control-Allow-Methods", "GET,POST,OPTIONS"),
]

mimetypes.add_type("application/manifest+json", ".webmanifest")
mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("image/svg+xml", ".svg")
mimetypes.add_type("font/woff2", ".woff2")


def _send_json(start, obj, status="200 OK"):
    body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
    headers = [("Content-Type", "application/json; charset=utf-8"),
               ("Cache-Control", "no-store"),
               ("Content-Length", str(len(body)))] + _CORS
    start(status, headers)
    return [body]


def _serve_static(path: str, start):
    """伺服 mobile/ 下的静态资源；防目录穿越。"""
    rel = "index.html" if path in ("/", "") else path.lstrip("/")
    target = (MOBILE_DIR / rel).resolve()
    try:
        target.relative_to(MOBILE_DIR.resolve())
    except ValueError:
        start("403 Forbidden", [("Content-Length", "0")] + _CORS)
        return [b""]
    if not target.is_file():
        start("404 Not Found", [("Content-Type", "text/plain; charset=utf-8")] + _CORS)
        return ["未找到：" + rel.encode("utf-8").decode("latin-1", "ignore") if False else b"not found"]
    ctype = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
    if ctype.startswith("text/") or ctype in ("application/javascript", "text/javascript",
                                              "application/manifest+json", "image/svg+xml"):
        ctype += "; charset=utf-8"
    data = target.read_bytes()
    # HTML / JS / CSS / manifest 不缓存（开发期改了立刻见新版）；图标 / 字体等可缓存。
    cache = "no-store" if target.suffix in (".html", ".js", ".css", ".webmanifest") else "public, max-age=3600"
    # service worker 必须允许根作用域
    extra = [("Service-Worker-Allowed", "/")] if target.name == "sw.js" else []
    start("200 OK", [("Content-Type", ctype), ("Cache-Control", cache),
                     ("Content-Length", str(len(data)))] + extra + _CORS)
    return [data]


def _read_body(environ) -> dict:
    try:
        length = int(environ.get("CONTENT_LENGTH") or 0)
    except (ValueError, TypeError):
        length = 0
    raw = environ["wsgi.input"].read(length) if length > 0 else b""
    if not raw:
        return {}
    try:
        val = json.loads(raw)
        return val if isinstance(val, dict) else {"_": val}
    except Exception:
        return {}


def application(environ, start_response):
    path = environ.get("PATH_INFO", "/") or "/"
    method = environ.get("REQUEST_METHOD", "GET").upper()

    if method == "OPTIONS":
        start_response("204 No Content", [("Content-Length", "0")] + _CORS)
        return [b""]

    # ---- 同步：导出 / 导入全局生词本 JSON（坚果云手动同步兜底） ----
    if path == "/api/vocab_export" and method in ("GET", "POST"):
        try:
            raw = GLOBAL_VOCAB.read_bytes() if GLOBAL_VOCAB.exists() else b"{}"
        except Exception:
            raw = b"{}"
        start_response("200 OK", [
            ("Content-Type", "application/json; charset=utf-8"),
            ("Content-Disposition", 'attachment; filename="situ-vocab-global.json"'),
            ("Content-Length", str(len(raw)))] + _CORS)
        return [raw]

    if path == "/api/vocab_import" and method == "POST":
        return _send_json(start_response, _vocab_import(_read_body(environ)))

    # ---- 火山语音转写代理（阶段8 §7：桌面浏览器无原生桥，直连火山会 CORS） ----
    # 透传火山真实 HTTP 状态码（而非固定 200），前端 subResp.status 判断才准确。
    if path == "/api/transcribe_submit" and method == "POST":
        result = _volc_submit(_read_body(environ))
        status = result.pop("_status", 200) or 200
        return _send_json(start_response, result, f"{status} " + ("OK" if status == 200 else "Error"))
    if path == "/api/transcribe_query" and method == "POST":
        result = _volc_query(_read_body(environ))
        status = result.pop("_status", 200) or 200
        return _send_json(start_response, result, f"{status} " + ("OK" if status == 200 else "Error"))
    # 单轨「录音说一段」统一走极速版（2026-07-07 统一批）：与双轨共用 _transcribe_slice
    # 的「极速版优先、失败回退标准版」逻辑，前端不再直连火山，只调这一个代理路由。
    if path == "/api/transcribe_flash" and method == "POST":
        result = _transcribe_flash_single(_read_body(environ))
        status = 200 if result.get("ok") else 400
        return _send_json(start_response, result, f"{status} " + ("OK" if status == 200 else "Error"))

    # ---- 双轨对话录音（阶段10） ----
    if path == "/api/dualtrack_list" and method == "GET":
        return _send_json(start_response, _dualtrack_list())
    if path == "/api/dualtrack_transcribe" and method == "POST":
        result = _dualtrack_transcribe(_read_body(environ))
        status = 200 if result.get("ok") else 400
        return _send_json(start_response, result, f"{status} " + ("OK" if status == 200 else "Error"))
    if path == "/api/dualtrack_done" and method == "POST":
        return _send_json(start_response, _dualtrack_done(_read_body(environ)))

    # ---- 复述练习（阅读联动）：主窗「复述」递来的条子，取一次即清 ----
    if path == "/api/retell_pending" and method == "GET":
        return _send_json(start_response, _retell_pop())

    # ---- 录音控制（阶段10.1：首页卡片拉起 headless 录音进程） ----
    if path == "/api/recorder_start" and method == "POST":
        result = _recorder_start()
        return _send_json(start_response, result, "200 OK" if result.get("ok") else "400 Error")
    if path == "/api/recorder_status" and method == "GET":
        return _send_json(start_response, _recorder_status())
    if path == "/api/recorder_stop" and method == "POST":
        result = _recorder_stop()
        return _send_json(start_response, result, "200 OK" if result.get("ok") else "400 Error")

    # ---- 通用 RPC ----
    if path.startswith("/api/"):
        name = path[len("/api/"):]
        if name not in EXPOSED:
            return _send_json(start_response, {"error": f"未知方法 {name}"}, "404 Not Found")
        # _get_api() 惰性初始化 Api()（词表加载）本身可能抛异常——务必放进 try，否则会变成
        # 裸 500（非 JSON），前端 subResp.json() 炸 → 只能当空列表（选材/书架偶发全空的隐患之一）。
        try:
            fn = getattr(_get_api(), name, None)
            if fn is None:
                result = {"error": f"方法不存在 {name}"}
            else:
                result = fn(_read_body(environ)) if EXPOSED[name] else fn()
        except Exception as e:
            import traceback
            traceback.print_exc()
            result = {"error": f"{type(e).__name__}: {e}"}
        return _send_json(start_response, result)

    # ---- 静态资源 ----
    return _serve_static(path, start_response)


def _volc_request(url: str, appid: str, token: str, reqid: str, body: dict, *, is_submit: bool,
                  resource_id: str | None = None, timeout: int = 20) -> dict:
    """转发一次火山请求，返回 {status:int, body:dict|None, volc_code:str, error?:str}。
    凭证/请求体不落盘不打日志。volc_code = 响应头 X-Api-Status-Code（极速版判成败靠它）。"""
    import urllib.request
    import urllib.error

    headers = {
        "Content-Type": "application/json",
        "X-Api-App-Key": appid,
        "X-Api-Access-Key": token,
        "X-Api-Resource-Id": resource_id or _VOLC_RESOURCE_ID,
        "X-Api-Request-Id": reqid,
    }
    if is_submit:
        headers["X-Api-Sequence"] = "-1"

    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    volc_code = ""
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            status = resp.status
            volc_code = resp.headers.get("X-Api-Status-Code") or ""
    except urllib.error.HTTPError as e:
        raw = e.read()
        status = e.code
        volc_code = (e.headers.get("X-Api-Status-Code") or "") if e.headers else ""
    except Exception as e:
        return {"status": 0, "body": None, "volc_code": "", "error": f"{type(e).__name__}: {e}"}

    try:
        parsed = json.loads(raw) if raw else {}
    except Exception:
        parsed = {}
    return {"status": status, "body": parsed, "volc_code": volc_code}


def _volc_submit(args: dict) -> dict:
    """POST /api/transcribe_submit —— 纯转发到火山 submit，凭证只经手不落盘。
    请求体里的 _reqid 是前端自造的 uuid（复用给 query 阶段）；这里直接透传给火山即可。"""
    appid = (args.get("appid") or "").strip()
    token = (args.get("token") or "").strip()
    if not appid or not token:
        return {"_status": 400, "error": "缺少 appid/token"}
    reqid = args.get("_reqid") or args.get("reqid")
    if not reqid:
        import uuid
        reqid = str(uuid.uuid4())
    body = {
        "user": args.get("user") or {"uid": "situ"},
        "audio": args.get("audio") or {},
        "request": args.get("request") or {"model_name": "bigmodel", "enable_itn": True, "enable_punc": True},
    }
    r = _volc_request(_VOLC_SUBMIT_URL, appid, token, reqid, body, is_submit=True)
    if r.get("error"):
        return {"_status": 502, "error": r["error"]}
    out = dict(r.get("body") or {})
    out["_status"] = r["status"]
    return out


def _volc_query(args: dict) -> dict:
    """POST /api/transcribe_query —— 纯转发到火山 query（复用 submit 阶段前端生成的同一个 request-id）。"""
    appid = (args.get("appid") or "").strip()
    token = (args.get("token") or "").strip()
    reqid = args.get("_reqid") or args.get("reqid")
    if not appid or not token or not reqid:
        return {"_status": 400, "error": "缺少 appid/token/reqid"}
    r = _volc_request(_VOLC_QUERY_URL, appid, token, reqid, {}, is_submit=False)
    if r.get("error"):
        return {"_status": 502, "error": r["error"]}
    out = dict(r.get("body") or {})
    out["_status"] = r["status"]
    return out


def _dualtrack_dir_for(name: str) -> Path | None:
    """路径安全：name 只允许是 data/dualtrack/ 下的直接子目录名（拒绝 .. / 绝对路径 / 分隔符）。"""
    if not name or "/" in name or "\\" in name or name in (".", ".."):
        return None
    candidate = (DUALTRACK_DIR / name).resolve()
    try:
        candidate.relative_to(DUALTRACK_DIR.resolve())
    except ValueError:
        return None
    return candidate


def _dualtrack_list() -> list:
    """扫 data/dualtrack/，返回有 ready 且未 hidden 的会话，按时间倒序。
    未消费（无 done）的全给；已消费的作为「最近历史」保留（done:true），
    全列表截到 5 条（未消费优先保留）——退出重进也能看到最近几条、可重转写。"""
    if not DUALTRACK_DIR.is_dir():
        return []
    out = []
    for child in DUALTRACK_DIR.iterdir():
        if not child.is_dir():
            continue
        if not (child / "ready").exists():
            continue
        if (child / "hidden").exists():
            continue
        meta_path = child / "meta.json"
        started_at, duration_sec = "", 0
        if meta_path.exists():
            try:
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
                started_at = meta.get("startedAt", "")
                duration_sec = meta.get("durationSec", 0)
            except Exception:
                pass
        out.append({"dir": child.name, "startedAt": started_at, "durationSec": duration_sec,
                    "done": (child / "done").exists()})
    out.sort(key=lambda r: r["startedAt"], reverse=True)
    undone = [r for r in out if not r["done"]]
    done = [r for r in out if r["done"]]
    kept = undone + done[: max(0, 5 - len(undone))]
    kept.sort(key=lambda r: r["startedAt"], reverse=True)
    return kept


def _dualtrack_done(args: dict) -> dict:
    """落 done 标记文件（不删音频，用户可回溯）。hide=true 时额外落 hidden 标记
    （chips 的 ✕ 用：从最近历史里彻底移除，音频仍留盘）。"""
    name = (args.get("dir") or "").strip()
    d = _dualtrack_dir_for(name)
    if not d or not d.is_dir():
        return {"ok": False, "error": "目录不存在或不合法"}
    try:
        (d / "done").write_text("", encoding="utf-8")
        if args.get("hide"):
            (d / "hidden").write_text("", encoding="utf-8")
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": f"{type(e).__name__}: {e}"}


def _recorder_app_path() -> Path | None:
    """解析「四土对话录.app」路径（阶段10.1 §2）：
    ① 环境变量 SITU_RECORDER_APP（存在且有效则用）；
    ② <项目根>/对话录/dist/四土对话录.app；
    ③ ~/Desktop/四土对话录.app。
    都不存在 → 返回 None，调用方据此返回真实错误。
    将来打 dmg 只需改①（把 SITU_RECORDER_APP 指向包内路径），此函数其余逻辑不用动。
    """
    import os
    env_path = os.environ.get("SITU_RECORDER_APP")
    if env_path:
        p = Path(env_path)
        if p.is_dir():
            return p
    candidates = [
        ROOT / "对话录" / "dist" / "四土对话录.app",
        Path.home() / "Desktop" / "四土对话录.app",
    ]
    for p in candidates:
        if p.is_dir():
            return p
    return None


_RECORDER_PID_FILE = DUALTRACK_DIR / ".recorder.pid"
_RECORDER_ERROR_FILE = DUALTRACK_DIR / ".recorder.error"


def _recorder_pid_info() -> dict | None:
    """读 .recorder.pid，校验其中 pid 确实活着且命令行含 DualTrackRecorder（防 pid 重用）。
    文件不存在 → None；文件存在但进程已死（脏文件）→ None（调用方视为可清掉重来）。"""
    if not _RECORDER_PID_FILE.exists():
        return None
    try:
        info = json.loads(_RECORDER_PID_FILE.read_text(encoding="utf-8"))
        pid = int(info.get("pid"))
    except Exception:
        return None
    if not _pid_is_recorder(pid):
        return None
    return info


def _pid_is_recorder(pid: int) -> bool:
    """`ps -p <pid> -o command=` 是否含 DualTrackRecorder（防 pid 被其它进程重用后误判）。"""
    import subprocess
    try:
        out = subprocess.run(["ps", "-p", str(pid), "-o", "command="],
                              capture_output=True, text=True, timeout=3)
    except Exception:
        return False
    return out.returncode == 0 and "DualTrackRecorder" in out.stdout


def _recorder_start() -> dict:
    """POST /api/recorder_start（阶段10.1 §2）。"""
    import subprocess

    existing = _recorder_pid_info()
    if existing is not None:
        return {"ok": False, "error": "已在录音中"}
    # pid 文件存在但进程已死：脏文件，清掉继续（_recorder_pid_info 已判定为 None 时不代表文件不存在）
    if _RECORDER_PID_FILE.exists():
        try:
            _RECORDER_PID_FILE.unlink()
        except Exception:
            pass

    app_path = _recorder_app_path()
    if app_path is None:
        return {"ok": False, "error": "找不到「四土对话录.app」，请检查 SITU_RECORDER_APP 或安装位置"}

    try:
        _RECORDER_ERROR_FILE.unlink()
    except FileNotFoundError:
        pass
    except Exception:
        pass

    DUALTRACK_DIR.mkdir(parents=True, exist_ok=True)
    # 直接 exec 包内二进制而不是 `open -n`：`open` 让 LaunchServices 当爹，录音器成了独立
    # TCC 主体（用户要给「四土对话录」单独授权，且 adhoc 重签一次失效一次）；直接 spawn 则
    # responsible process = 四土 → 屏幕录制/麦克风权限都记在「四土」一个名下（2026-07-07 用户要求）。
    recorder_bin = app_path / "Contents" / "MacOS" / "DualTrackRecorder"
    try:
        if recorder_bin.is_file():
            subprocess.Popen([str(recorder_bin), "--headless"],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        else:  # 兜底：包结构异常时退回老路
            subprocess.Popen(["open", "-n", str(app_path), "--args", "--headless"],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception as e:
        return {"ok": False, "error": f"启动失败：{type(e).__name__}: {e}"}

    # 轮询等 .recorder.pid 出现（≤5s，间隔 0.2s）
    deadline = time.time() + 5.0
    while time.time() < deadline:
        if _RECORDER_PID_FILE.exists():
            return {"ok": True}
        time.sleep(0.2)

    # 超时：读 .recorder.error（有则带真实原因）
    if _RECORDER_ERROR_FILE.exists():
        try:
            err = _RECORDER_ERROR_FILE.read_text(encoding="utf-8").strip()
        except Exception:
            err = "启动超时"
        return {"ok": False, "error": err}
    return {"ok": False, "error": "启动超时，未知原因（无 .recorder.error）"}


def _recorder_status() -> dict:
    """GET /api/recorder_status（阶段10.1 §2）。"""
    info = _recorder_pid_info()
    if info is not None:
        started_at = info.get("startedAt", "")
        elapsed = 0
        try:
            from datetime import datetime, timezone
            started_dt = datetime.fromisoformat(started_at.replace("Z", "+00:00"))
            elapsed = max(0, int((datetime.now(timezone.utc) - started_dt).total_seconds()))
        except Exception:
            pass
        return {"recording": True, "startedAt": started_at, "elapsedSec": elapsed}

    out = {"recording": False}
    if _RECORDER_ERROR_FILE.exists():
        try:
            out["error"] = _RECORDER_ERROR_FILE.read_text(encoding="utf-8").strip()
        except Exception:
            pass
    return out


def _recorder_stop() -> dict:
    """POST /api/recorder_stop（阶段10.1 §2）：SIGTERM → 轮询等进程退出且会话目录 ready 出现。"""
    import os
    import signal

    info = _recorder_pid_info()
    if info is None:
        return {"ok": False, "error": "当前没有在录音"}

    pid = int(info["pid"])
    dir_name = info.get("dir", "")
    try:
        os.kill(pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
    except Exception as e:
        return {"ok": False, "error": f"发送停止信号失败：{type(e).__name__}: {e}"}

    session_dir = _dualtrack_dir_for(dir_name) if dir_name else None
    deadline = time.time() + 10.0
    while time.time() < deadline:
        pid_gone = not _pid_is_recorder(pid)
        ready_ok = session_dir is not None and (session_dir / "ready").exists()
        if pid_gone and (session_dir is None or ready_ok):
            return {"ok": True, "dir": dir_name}
        time.sleep(0.2)

    return {"ok": False, "error": "停止超时，录音可能仍在进行"}


def _read_wav_pcm16_mono(path: Path) -> tuple[bytes, int]:
    """读一个 WAV 文件，返回 (pcm16 单声道字节, sampleRate)。非 16bit/单声道时按需转换（简单降混/截断，
    够用即可——Swift 端固定写 16k 单声道 16bit，这里做一次防御性归一化）。"""
    with wave.open(str(path), "rb") as w:
        sr = w.getframerate()
        n_channels = w.getnchannels()
        sampwidth = w.getsampwidth()
        raw = w.readframes(w.getnframes())
    if sampwidth != 2:
        # 非 16bit：不支持，返回空（上游按空轨处理）
        return b"", sr
    if n_channels > 1:
        # 简单降混：只取第一个声道
        import struct
        n_samples = len(raw) // (2 * n_channels)
        fmt = f"<{n_samples * n_channels}h"
        samples = struct.unpack(fmt, raw[: n_samples * n_channels * 2])
        mono = samples[0::n_channels]
        raw = struct.pack(f"<{len(mono)}h", *mono)
    return raw, sr


def _write_wav_pcm16_mono(pcm_bytes: bytes, sample_rate: int) -> bytes:
    """把一段 16bit 单声道 PCM 重新打包成完整 WAV（带 header），返回文件字节。"""
    import io
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        w.writeframes(pcm_bytes)
    return buf.getvalue()


def _slice_pcm16(pcm_bytes: bytes, sample_rate: int, slice_sec: int = 600) -> list:
    """按 slice_sec 秒把 16bit 单声道 PCM 切成多片，返回 [(wav_bytes, offset_ms), ...]。"""
    bytes_per_sec = sample_rate * 2  # 16bit = 2 bytes/sample, mono
    slice_bytes = bytes_per_sec * slice_sec
    if not pcm_bytes:
        return []
    out = []
    offset = 0
    while offset < len(pcm_bytes):
        chunk = pcm_bytes[offset: offset + slice_bytes]
        offset_ms = int(offset / bytes_per_sec * 1000)
        out.append((_write_wav_pcm16_mono(chunk, sample_rate), offset_ms))
        offset += slice_bytes
    return out


def _hotwords_corpus(hotwords) -> dict | None:
    """把热词词表拼成火山「大模型录音文件识别」的 corpus.context 注入体。

    官方格式（文档 6561/155739 + 大模型技术实践）：不走控制台预建词表（boosting_table_id/
    boosting_table_name）时，用 request.corpus.context 内联热词——context 是一个 **JSON 字符串**，
    其值形如 {"hotwords":[{"word":"deepseek"},{"word":"Fable 5"}]}。
    返回 {"context": "<json 字符串>"}；无有效热词返回 None（调用方据此决定是否注入）。"""
    if not hotwords:
        return None
    words = []
    seen = set()
    for w in hotwords:
        s = (str(w) if w is not None else "").strip()
        if not s:
            continue
        k = s.lower()
        if k in seen:
            continue
        seen.add(k)
        words.append({"word": s})
        if len(words) >= 100:  # 与前端同步的上限，防超长请求体
            break
    if not words:
        return None
    return {"context": json.dumps({"hotwords": words}, ensure_ascii=False)}


def _transcribe_slice_flash(wav_bytes: bytes, offset_ms: int, appid: str, token: str,
                            corpus: dict | None = None):
    """极速版转写单个切片：一次 POST 同步拿结果（不排队不轮询）。
    返回 (utterances, warnings)；返回 None = 极速版没跑通（未开通该资源/缺时间戳/接口异常），
    调用方应回退标准版通道。凭证只经手不落盘不打日志。"""
    import base64
    import uuid

    b64 = base64.b64encode(wav_bytes).decode("ascii")

    def _build_body(with_corpus: bool) -> dict:
        req = {
            "model_name": "bigmodel",
            "enable_itn": True,
            "enable_punc": True,
            "show_utterances": True,
        }
        if with_corpus and corpus:
            req["corpus"] = corpus
        return {
            "user": {"uid": "situ"},
            "audio": {"format": "wav", "data": b64},
            "request": req,
        }

    # 上传+识别在同一个请求里：超时按片长伸缩（10 分钟大片给足 5 分钟兜底，实际通常秒级返回）
    slice_sec = max(1, (len(wav_bytes) - 44) // 32000)
    timeout = min(300, max(60, slice_sec // 2 + 45))

    r = _volc_request(_VOLC_FLASH_URL, appid, token, str(uuid.uuid4()), _build_body(True),
                      is_submit=True, resource_id=_VOLC_FLASH_RESOURCE_ID, timeout=timeout)
    # 容错铁律：带 corpus 报参数错（HTTP 4xx 或非成功码，且不是"静音成功"）→ 去 corpus 重试一次，
    # 再走原有回退链。极速版是否支持 corpus 未真机验证，热词绝不能把转写整个搞挂。
    if corpus is not None:
        _code = r.get("volc_code") or ""
        _bad = (r.get("error")
                or (r.get("status") is not None and r.get("status") != 200)
                or (_code and _code not in ("20000000", "20000003")))
        if _bad:
            r = _volc_request(_VOLC_FLASH_URL, appid, token, str(uuid.uuid4()), _build_body(False),
                              is_submit=True, resource_id=_VOLC_FLASH_RESOURCE_ID, timeout=timeout)
    if r.get("error") or r.get("status") != 200:
        return None
    volc_code = r.get("volc_code") or ""
    # 20000000=成功；20000003=处理成功但整段静音/无有效人声——这也是成功（下面走空结果分支
    # 如实返回 []），绝不能当失败回退标准版：否则任何偏轻/静音的录音都白白排队走慢通道。
    # 只有这两个之外的非空码才是真失败（未开通/凭证/接口异常）→ 回退标准版兜底。
    if volc_code and volc_code not in ("20000000", "20000003"):
        return None

    result = (r.get("body") or {}).get("result") or {}
    utts_field = result.get("utterances")
    if not isinstance(utts_field, list):
        # 没有 utterances 字段：整片真无人声就如实返回空；有正文却没法定位时间轴 → 回退标准版
        if not (result.get("text") or "").strip():
            return [], []
        return None

    utterances = []
    for u in utts_field:
        text = (u.get("text") or "").strip()
        if not text:
            continue
        if u.get("start_time") is None:
            return None  # 缺时间戳，双轨交织没法做 → 回退标准版
        utterances.append({
            "text": text,
            "start": (u.get("start_time") or 0) + offset_ms,
            "end": (u.get("end_time") or 0) + offset_ms,
        })
    return utterances, []


def _transcribe_slice(wav_bytes: bytes, offset_ms: int, appid: str, token: str,
                      corpus: dict | None = None) -> tuple[list, list, dict]:
    """转写单个切片：先走极速版（秒级），没跑通再回退标准版（排队+轮询，分钟级）。
    返回 (utterances, warnings, meta)，meta = {engine: 'flash'|'standard', ms:int}。
    corpus = 热词注入体（见 _hotwords_corpus）；两条路各自带 corpus 报参数错会自动去 corpus 重试。"""
    t0 = time.time()
    flash = _transcribe_slice_flash(wav_bytes, offset_ms, appid, token, corpus)
    if flash is not None:
        utts, warns = flash
        return utts, warns, {"engine": "flash", "ms": int((time.time() - t0) * 1000)}
    utts, warns = _transcribe_one_slice(wav_bytes, offset_ms, appid, token, corpus)
    return utts, warns, {"engine": "standard", "ms": int((time.time() - t0) * 1000)}


def _transcribe_flash_single(args: dict) -> dict:
    """POST /api/transcribe_flash —— 口语复盘「录音说一段」单轨转写。
    收 base64 WAV（16k 单声道），复用 _transcribe_slice：极速版(auc_turbo)优先、
    失败自动回退标准版（与双轨对话录同一套 flash 通道）。凭证只经手不落盘不打日志。
    返回 {ok, text, engine:'flash'|'standard', ms, warning?}。"""
    import base64
    appid = (args.get("appid") or "").strip()
    token = (args.get("token") or "").strip()
    b64 = (args.get("audioBase64") or args.get("data") or "").strip()
    if not appid or not token:
        return {"ok": False, "error": "缺少 appid/token"}
    if not b64:
        return {"ok": False, "error": "没有录到音频"}
    try:
        wav_bytes = base64.b64decode(b64)
    except Exception:
        return {"ok": False, "error": "音频数据无法解码"}

    corpus = _hotwords_corpus(args.get("hotwords"))
    try:
        utts, warns, meta = _transcribe_slice(wav_bytes, 0, appid, token, corpus)
    except Exception as e:
        return {"ok": False, "error": f"转写异常：{e}"}

    text = " ".join(
        (u.get("text") or "").strip() for u in utts if (u.get("text") or "").strip()
    )
    # 有正文没转出、且带告警 = 真失败（凭证/未开通/网络），如实报错别让用户对着「没听清」猜
    if not text and warns:
        return {"ok": False, "error": "；".join(warns), "engine": meta.get("engine")}
    out = {"ok": True, "text": text, "engine": meta.get("engine"), "ms": meta.get("ms")}
    if warns:
        out["warning"] = "；".join(warns)
    return out


def _transcribe_one_slice(wav_bytes: bytes, offset_ms: int, appid: str, token: str,
                          corpus: dict | None = None) -> tuple[list, list]:
    """标准版转写单个切片：submit + 轮询 query。返回 (utterances, warnings)。
    轮询预算按切片时长伸缩（10 分钟大片给足 3 分钟，30×1s 的老预算只够短片）。"""
    import base64
    import uuid

    utterances: list = []
    warnings: list = []

    b64 = base64.b64encode(wav_bytes).decode("ascii")
    reqid = str(uuid.uuid4())

    def _build_body(with_corpus: bool) -> dict:
        req = {
            "model_name": "bigmodel",
            "enable_itn": True,
            "enable_punc": True,
            "show_utterances": True,
        }
        if with_corpus and corpus:
            req["corpus"] = corpus
        return {
            "user": {"uid": "situ"},
            "audio": {"format": "wav", "data": b64},
            "request": req,
        }

    sub = _volc_request(_VOLC_SUBMIT_URL, appid, token, reqid, _build_body(True), is_submit=True)
    # 容错：带 corpus 提交失败（参数错等）→ 去 corpus 换新 reqid 重试一次再走原有失败链
    if corpus is not None and (sub.get("error") or sub.get("status") not in (200,)):
        reqid = str(uuid.uuid4())
        sub = _volc_request(_VOLC_SUBMIT_URL, appid, token, reqid, _build_body(False), is_submit=True)
    if sub.get("error") or sub.get("status") not in (200,):
        warnings.append(f"提交失败（片偏移 {offset_ms}ms）：{sub.get('error') or sub.get('status')}")
        return utterances, warnings

    slice_sec = max(1, (len(wav_bytes) - 44) // 32000)  # 16k*16bit 单声道 = 32000 B/s
    attempts = min(240, max(30, slice_sec // 4 + 20))
    result_body = None
    for _ in range(attempts):
        time.sleep(1)
        q = _volc_request(_VOLC_QUERY_URL, appid, token, reqid, {}, is_submit=False)
        if q.get("error"):
            continue
        body_j = q.get("body") or {}
        header = body_j.get("header") or {}
        code = header.get("code")
        if code and code not in (0, 20000001, 20000002):
            warnings.append(f"转写失败（片偏移 {offset_ms}ms）：{header.get('message') or code}")
            return utterances, warnings
        if body_j.get("audio_info", {}).get("duration") is not None:
            result_body = body_j
            break
    if result_body is None:
        warnings.append(f"转写超时（片偏移 {offset_ms}ms）")
        return utterances, warnings

    result = result_body.get("result") or {}
    utts = result.get("utterances")
    if isinstance(utts, list) and utts:
        for u in utts:
            text = (u.get("text") or "").strip()
            if not text:
                continue
            utterances.append({
                "text": text,
                "start": (u.get("start_time") or 0) + offset_ms,
                "end": (u.get("end_time") or 0) + offset_ms,
            })
    else:
        # 防御回落：无 utterances 字段，整片降级为一条
        text = (result.get("text") or "").strip()
        if text:
            dur_ms = int((result_body.get("audio_info") or {}).get("duration") or 0)
            utterances.append({"text": text, "start": offset_ms, "end": offset_ms + dur_ms})
            warnings.append(f"片偏移 {offset_ms}ms 无 utterances 字段，已整段降级")
    return utterances, warnings


def _volc_transcribe_track(wav_path: Path, appid: str, token: str,
                           corpus: dict | None = None) -> dict:
    """对一个 WAV 文件（单轨）做完整转写：切片 → 各片并行（极速版优先，回退标准版）
    → 按片序合并 utterances（时间戳加片偏移）。
    返回 {utterances:[{text,start,end}], timing:{ms,engine}, warning?:str}。
    并行度 3：半小时录音 3 片同跑，墙钟≈最慢一片而不是三片之和。
    corpus = 热词注入体，逐片透传给 _transcribe_slice。"""
    if not wav_path.exists():
        return {"utterances": [], "warning": "音频文件不存在"}

    pcm, sr = _read_wav_pcm16_mono(wav_path)
    if not pcm:
        return {"utterances": [], "warning": "音频为空或格式不支持"}

    t0 = time.time()
    slices = _slice_pcm16(pcm, sr, slice_sec=600)
    utterances: list = []
    warnings: list = []
    engines: list = []

    if len(slices) == 1:
        wav_bytes, offset_ms = slices[0]
        utts, warns, meta = _transcribe_slice(wav_bytes, offset_ms, appid, token, corpus)
        utterances.extend(utts)
        warnings.extend(warns)
        engines.append(meta["engine"])
    else:
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=3) as pool:
            futures = [pool.submit(_transcribe_slice, w, o, appid, token, corpus) for w, o in slices]
            for fut in futures:  # 按片序取结果，utterances 保持时间递增
                utts, warns, meta = fut.result()
                utterances.extend(utts)
                warnings.extend(warns)
                engines.append(meta["engine"])

    engine = "flash" if all(e == "flash" for e in engines) else \
             ("standard" if all(e == "standard" for e in engines) else "mixed")
    if engine != "flash":
        warnings.append("极速版转写没跑通，走了慢速通道——若持续如此，去火山控制台确认已开通「录音文件识别-极速版」")

    out = {"utterances": utterances,
           "timing": {"ms": int((time.time() - t0) * 1000), "engine": engine}}
    if warnings:
        out["warning"] = "；".join(warnings)
    return out


def _dualtrack_transcribe(args: dict) -> dict:
    """POST /api/dualtrack_transcribe —— 读 me.wav/ai.wav，各自切片转写，合并返回。
    凭证只经手不落盘不打日志。"""
    name = (args.get("dir") or "").strip()
    appid = (args.get("appid") or "").strip()
    token = (args.get("token") or "").strip()
    if not appid or not token:
        return {"ok": False, "error": "缺少 appid/token"}
    d = _dualtrack_dir_for(name)
    if not d or not d.is_dir():
        return {"ok": False, "error": "目录不存在或不合法"}

    corpus = _hotwords_corpus(args.get("hotwords"))

    me_path = d / "me.wav"
    ai_path = d / "ai.wav"

    # 麦轨静音检测：me.wav 整轨无一个非零采样 = 引擎级静音（权限被吞/声道降混失败），
    # 直接告诉前端，别让用户对着笼统的「没转出内容」猜（2026-07-07 取证教训）。
    me_silent = False
    try:
        pcm, _sr = _read_wav_pcm16_mono(me_path)
        if pcm:
            import array as _array
            samples = _array.array("h")
            samples.frombytes(pcm)
            me_silent = (max(samples) == 0 and min(samples) == 0)
    except Exception:
        pass

    # 两轨并行转写（各自内部切片也并行）：墙钟≈最慢一轨最慢一片，不再是全部串行相加
    if me_silent:
        me_res = {"utterances": [], "warning": "整轨静音，已跳过转写"}
        ai_res = _volc_transcribe_track(ai_path, appid, token, corpus)
    else:
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=2) as pool:
            me_fut = pool.submit(_volc_transcribe_track, me_path, appid, token, corpus)
            ai_fut = pool.submit(_volc_transcribe_track, ai_path, appid, token, corpus)
            me_res = me_fut.result()
            ai_res = ai_fut.result()

    warnings = []
    if me_res.get("warning"):
        warnings.append("我的音轨：" + me_res["warning"])
    if ai_res.get("warning"):
        warnings.append("对方音轨：" + ai_res["warning"])

    out = {
        "ok": True,
        "me": me_res.get("utterances", []),
        "ai": ai_res.get("utterances", []),
        "meSilent": me_silent,
        "timing": {"me": me_res.get("timing"), "ai": ai_res.get("timing")},
    }
    if warnings:
        out["warnings"] = warnings
    return out


def _vocab_import(args: dict) -> dict:
    """合并 / 替换全局生词本（坚果云手动同步兜底）。

    复用 api 的 _gvlock 串行化，并把内存镜像置空以便惰性重载，避免与桌面/本服务
    的内存态分叉。合并按 key：保留较大的 clicks、合并 sources、保留 star/known。
    """
    payload = args.get("data")
    mode = (args.get("mode") or "merge").lower()
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except Exception:
            return {"ok": False, "error": "导入内容不是合法 JSON"}
    if not isinstance(payload, dict):
        return {"ok": False, "error": "导入内容应为 {key: entry} 的对象"}
    try:
        with _get_api()._gvlock:  # noqa: SLF001 — 故意复用同一把锁，绝不另起一套写盘
            cur = {}
            if GLOBAL_VOCAB.exists():
                try:
                    cur = json.loads(GLOBAL_VOCAB.read_text(encoding="utf-8"))
                except Exception:
                    cur = {}
            if mode == "replace":
                merged = dict(payload)
            else:
                merged = dict(cur)
                for k, e in payload.items():
                    if not isinstance(e, dict):
                        continue
                    old = merged.get(k)
                    if not isinstance(old, dict):
                        merged[k] = e
                        continue
                    m = dict(old)
                    for kk, vv in e.items():
                        if kk in ("clicks", "sources", "star", "known",
                                  "first_added", "last_seen", "followups"):
                            continue
                        if vv not in (None, "", []):
                            m[kk] = vv
                    m["clicks"] = max(old.get("clicks") or 0, e.get("clicks") or 0)
                    srcs = list(old.get("sources") or [])
                    seen = {s.get("doc_id") for s in srcs if isinstance(s, dict)}
                    for s in (e.get("sources") or []):
                        if isinstance(s, dict) and s.get("doc_id") not in seen:
                            srcs.append(s)
                    m["sources"] = srcs
                    if old.get("star") or e.get("star"):
                        m["star"] = True
                    if old.get("known") or e.get("known"):
                        m["known"] = True
                    fps = list(old.get("followups") or [])
                    for f in (e.get("followups") or []):
                        if f not in fps:
                            fps.append(f)
                    if fps:
                        m["followups"] = fps
                    merged[k] = m
            VOCAB_DIR.mkdir(parents=True, exist_ok=True)
            tmp = GLOBAL_VOCAB.with_suffix(".tmp")
            tmp.write_text(json.dumps(merged, ensure_ascii=False, indent=1), encoding="utf-8")
            tmp.replace(GLOBAL_VOCAB)
            _get_api()._global = None  # noqa: SLF001 — 强制下次惰性重载，丢弃过期内存镜像
        return {"ok": True, "count": len(merged)}
    except Exception as e:
        return {"ok": False, "error": f"{type(e).__name__}: {e}"}


class _ThreadingWSGIServer(ThreadingMixIn, WSGIServer):
    daemon_threads = True
    allow_reuse_address = True


class _QuietHandler(WSGIRequestHandler):
    def log_message(self, *a):  # 静音逐请求日志，保留 traceback
        pass


def _lan_ip() -> str:
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        s.close()


def main():
    httpd = make_server("0.0.0.0", PORT, application,
                        server_class=_ThreadingWSGIServer, handler_class=_QuietHandler)
    ip = _lan_ip()
    print("四土 · 手机版 已启动")
    print(f"  本机：     http://127.0.0.1:{PORT}")
    print(f"  同一 WiFi： http://{ip}:{PORT}   ← 手机浏览器打开这个")
    print("  Ctrl-C 停止")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止")


if __name__ == "__main__":
    main()
