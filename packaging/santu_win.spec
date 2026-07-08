# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for 三土 (self-contained Windows app).

Build (on Windows):  pyinstaller packaging/santu_win.spec --noconfirm
Output: dist/三土/三土.exe  (onedir — zip the whole 三土 folder to share)
"""
import os
from PyInstaller.utils.hooks import collect_all, collect_data_files, collect_submodules

# SPECPATH is injected by PyInstaller = directory containing this .spec
ROOT = os.path.abspath(os.path.join(SPECPATH, os.pardir))
ENTRY = os.path.join(SPECPATH, "santu_entry.py")

datas = []
binaries = []
hiddenimports = []

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
    except Exception as e:
        print("[spec] skip collect_all", pkg, "->", e)

datas += collect_data_files("certifi")

datas += [
    (os.path.join(ROOT, "data", "cet4.txt"), "data"),
    (os.path.join(ROOT, "data", "cet6.txt"), "data"),
    (os.path.join(ROOT, "data", "subtlex.txt"), "data"),
    (os.path.join(ROOT, "santu_app", "index.html"), "santu_app"),
]

hiddenimports += collect_submodules("reader_core")
hiddenimports += ["santu_app", "santu_app.app", "reader_core", "webview"]
# pywebview on Windows uses the Edge WebView2 (clr / edgechromium) backend
hiddenimports += collect_submodules("webview")

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
    name="三土",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    icon=os.path.join(ROOT, "santu_app", "三土.ico"),
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    name="三土",
)
