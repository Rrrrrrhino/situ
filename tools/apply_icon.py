#!/usr/bin/env python3
"""把 santu_app/assets/icon.png 设为两个 .command 启动器的 Finder 图标。

用法（必须用项目 venv 的 python，里面有 pyobjc/AppKit）：
    cd ~/Documents/situ && ./.venv/bin/python tools/apply_icon.py

Dock / 程序坞图标由 app.py 在启动时自动读取同一张 icon.png，无需这里处理。
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ICON = ROOT / "santu_app" / "assets" / "icon.png"

def main() -> int:
    if not ICON.exists():
        print(f"✗ 找不到图标：{ICON}\n  请先把图片存成这个路径（PNG，建议 ≥512×512 方形）。")
        return 1
    from AppKit import NSWorkspace, NSImage
    img = NSImage.alloc().initByReferencingFile_(str(ICON))
    if img is None:
        print("✗ 图片无法读取，确认是有效的 PNG。")
        return 1
    targets = [
        Path.home() / "Desktop" / "四土.command",
        ROOT / "四土.command",
    ]
    ws = NSWorkspace.sharedWorkspace()
    any_done = False
    for t in targets:
        if t.exists():
            ok = ws.setIcon_forFile_options_(img, str(t), 0)
            print(("✓ 已设图标：" if ok else "✗ 设置失败："), t)
            any_done = any_done or bool(ok)
        else:
            print("· 跳过（文件不存在）：", t)
    if any_done:
        print("\n完成。Finder 里图标若没立刻刷新，可注销重登或重启 Finder。")
    return 0

if __name__ == "__main__":
    sys.exit(main())
