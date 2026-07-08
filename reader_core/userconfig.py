"""User-level config + writable data location.

The packaged .app bundle is read-only and gets replaced on update, so anything
the user creates (their API key, reading history, audio cache) must live OUTSIDE
the bundle. We keep it under the OS's standard per-user app-data directory:

    macOS:   ~/Library/Application Support/SanTu/
    Windows: %APPDATA%/SanTu/
    Linux:   ~/.config/SanTu/

`config.json` holds the LLM credentials the user enters in the in-app Settings
panel. Friends who get the packaged app never touch a .env file.
"""
from __future__ import annotations
import json
import os
import sys
from pathlib import Path

APP_NAME = "SiTu"  # 四土（与三土 SanTu 数据目录隔离）


def resource_base() -> Path:
    """Root for bundled READ-ONLY resources (word lists, index.html, icon).

    Frozen by PyInstaller → the temp extraction dir (sys._MEIPASS).
    Running from source → the project root."""
    if getattr(sys, "frozen", False):
        base = getattr(sys, "_MEIPASS", None)
        if base:
            return Path(base)
    return Path(__file__).resolve().parent.parent


def app_support_dir() -> Path:
    if sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support" / APP_NAME
    elif sys.platform.startswith("win"):
        base = Path(os.getenv("APPDATA") or Path.home()) / APP_NAME
    else:
        base = Path(os.getenv("XDG_CONFIG_HOME") or (Path.home() / ".config")) / APP_NAME
    return base


def config_path() -> Path:
    return app_support_dir() / "config.json"


def load_user_config() -> dict:
    p = config_path()
    if p.exists():
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}
    return {}


def save_user_config(cfg: dict) -> None:
    d = app_support_dir()
    d.mkdir(parents=True, exist_ok=True)
    config_path().write_text(
        json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8"
    )
