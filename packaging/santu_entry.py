"""PyInstaller entry point for the self-contained 三土.app.

Keeps the same runtime behaviour as `python -m santu_app.app`, but as a frozen
bundle so friends can just double-click — no Python, no venv, no terminal.

Set SANTU_SELFTEST=1 to run a headless smoke test (spaCy load + classify) and
exit, instead of opening the window. Used to validate the frozen bundle.
"""
import multiprocessing
import os
import sys

multiprocessing.freeze_support()


def _selftest():
    """Exercise the heavy/native paths inside the frozen bundle."""
    print("[selftest] frozen=", getattr(sys, "frozen", False))
    from reader_core.userconfig import resource_base
    print("[selftest] resource_base=", resource_base())
    from reader_core.vocab import VocabClassifier
    vc = VocabClassifier()
    info = vc.classify_word("ubiquitous", "It became ubiquitous overnight.")
    print("[selftest] classify_word ->", info)
    from reader_core import render  # noqa: F401
    # 阶段10.2：口语复盘窗口依赖——server 模块可导入、mobile 前端在包内、录音目录锚在家目录
    from pathlib import Path
    from santu_app import server as srv
    print("[selftest] mobile_dir=", srv.MOBILE_DIR, "exists=", srv.MOBILE_DIR.is_dir())
    print("[selftest] mobile_index=", (srv.MOBILE_DIR / "index.html").is_file(),
          "bundle=", (srv.MOBILE_DIR / "js" / "core.bundle.js").is_file())
    print("[selftest] dualtrack_dir=", srv.DUALTRACK_DIR)
    assert srv.MOBILE_DIR.is_dir() and (srv.MOBILE_DIR / "index.html").is_file(), "mobile 前端没进包"
    assert str(srv.DUALTRACK_DIR).startswith(str(Path.home())), "dualtrack 目录没锚在家目录"
    print("[selftest] OK")


if __name__ == "__main__":
    if os.getenv("SANTU_SELFTEST") == "1":
        _selftest()
    else:
        from santu_app.app import main
        main()
