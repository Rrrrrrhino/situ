#!/bin/bash
# 双击此文件启动「四土」桌面应用（三土 fork，支持 EPUB 按章阅读）
cd "$(dirname "$0")"
# 把 GUI 进程从终端脱钩：app 独立运行，终端窗口可立刻关掉而不杀进程。
nohup ./.venv/bin/python -m santu_app.app >/tmp/situ.log 2>&1 &
disown
# 关掉这扇仅用于启动的终端窗口（进程已脱钩，关窗不影响 app）。
osascript -e 'tell application "Terminal" to close (every window whose name contains "四土")' >/dev/null 2>&1 &
