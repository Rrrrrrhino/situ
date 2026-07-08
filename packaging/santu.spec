# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for 四土 situ (self-contained macOS app).

Build:  .venv/bin/pyinstaller packaging/santu.spec --noconfirm
Output: dist/四土.app
"""
import os
from PyInstaller.utils.hooks import collect_all, collect_data_files, collect_submodules

# SPECPATH is injected by PyInstaller = directory containing this .spec
ROOT = os.path.abspath(os.path.join(SPECPATH, os.pardir))
ENTRY = os.path.join(SPECPATH, "santu_entry.py")

datas = []
binaries = []
hiddenimports = []

# Heavy 3rd-party packages with data files / dynamic imports.
for pkg in [
    "spacy", "en_core_web_sm", "thinc", "blis", "srsly", "catalogue",
    "cymem", "preshed", "murmurhash", "wasabi", "spacy_legacy", "spacy_loggers",
    "trafilatura", "courlan", "htmldate", "justext", "ebooklib", "lxml",
]:
    try:
        d, b, h = collect_all(pkg)
        datas += d
        binaries += b
        hiddenimports += h
    except Exception as e:  # package not present / nothing to collect
        print("[spec] skip collect_all", pkg, "->", e)

# certifi CA bundle (used by our SSL audio + LLM HTTPS calls)
datas += collect_data_files("certifi")

# Our own resources (read-only). resource_base() expects these layouts.
datas += [
    (os.path.join(ROOT, "data", "cet4.txt"), "data"),
    (os.path.join(ROOT, "data", "cet6.txt"), "data"),
    (os.path.join(ROOT, "data", "subtlex.txt"), "data"),
    (os.path.join(ROOT, "santu_app", "index.html"), "santu_app"),
    # index.html 用相对路径加载正文字体（assets/fonts/*.woff2）+ 窗口图标（assets/icon.png），
    # 必须整个 assets/ 跟进包，否则冻结后阅读字体退化成系统衬线、窗口无图标。
    (os.path.join(ROOT, "santu_app", "assets"), os.path.join("santu_app", "assets")),
]

# 口语复盘窗口（阶段10.2）：进程内 server 伺服 santu_app/mobile/ 的整套前端。
# 只发运行需要的文件；node_modules/_devtest/js core 源码（已打进 core.bundle.js）不进包。
_MOBILE_SRC = os.path.join(ROOT, "santu_app", "mobile")
_MOBILE_SKIP_DIRS = {"node_modules", "_devtest", ".claude", "core", "vendor"}
_MOBILE_SKIP_FILES = {"package.json", "package-lock.json", "CHANGELOG.md"}
for _dirpath, _dirnames, _filenames in os.walk(_MOBILE_SRC):
    _dirnames[:] = [d for d in _dirnames if d not in _MOBILE_SKIP_DIRS]
    for _fn in _filenames:
        if _fn in _MOBILE_SKIP_FILES or _fn.startswith("."):
            continue
        datas.append((os.path.join(_dirpath, _fn), os.path.relpath(_dirpath, ROOT)))

hiddenimports += collect_submodules("reader_core")
hiddenimports += ["santu_app", "santu_app.app", "santu_app.server", "reader_core", "webview"]

a = Analysis(
    [ENTRY],
    pathex=[ROOT],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter", "PyInstaller"],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="四土",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    icon=os.path.join(ROOT, "santu_app", "assets", "icon.icns"),
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    name="四土",
)

app = BUNDLE(
    coll,
    name="四土.app",
    icon=os.path.join(ROOT, "santu_app", "assets", "icon.icns"),
    bundle_identifier="com.situ.reader",
    info_plist={
        "CFBundleName": "四土",
        "CFBundleDisplayName": "四土",
        "CFBundleShortVersionString": "1.0",
        "CFBundleVersion": "1.0",
        "NSHighResolutionCapable": True,
        "LSMinimumSystemVersion": "10.15",
        "LSApplicationCategoryType": "public.app-category.education",
        # 复盘窗（WKWebView）若将来走页面内直录会用到；当前主录音流程走「四土对话录」
        # 引擎（权限也记在引擎名下），本声明只是把路铺平，无副作用。
        "NSMicrophoneUsageDescription": "复盘录音（页面内直录）需要访问麦克风。",
    },
)
