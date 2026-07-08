#!/bin/bash
# 四土 · 手机版 启动器（局域网）。双击即起服务；手机连同一 WiFi、浏览器打开显示的网址。
SITU="$HOME/Documents/situ"
PY="$SITU/.venv/bin/python"
PORT=18760
cd "$SITU" || { echo "找不到 $SITU"; exit 1; }

# 释放端口、杀掉旧实例（避免孤儿服务占端口看不到新版）
lsof -ti:$PORT 2>/dev/null | xargs kill 2>/dev/null
sleep 0.5
# 后台脱钩启动
nohup "$PY" -m santu_app.server > /tmp/situ-mobile.log 2>&1 &
sleep 1.8

IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo 127.0.0.1)
URL="http://$IP:$PORT"
clear
echo "──────────────────────────────────────────────"
echo "   四土 · 手机版 已启动 ✓"
echo ""
echo "   📱 手机（连同一 WiFi）浏览器打开："
echo ""
echo "        $URL"
echo ""
echo "      打开后 →「分享 / 菜单」→ 添加到主屏"
echo ""
echo "   💻 这台 Mac 预览： http://127.0.0.1:$PORT"
echo "──────────────────────────────────────────────"
echo "   停止服务： lsof -ti:$PORT | xargs kill"
echo ""

# 有 qrencode 就出二维码方便手机扫（没有则忽略）
if command -v qrencode >/dev/null 2>&1; then
  echo "   扫码直接在手机打开："
  qrencode -t ANSIUTF8 "$URL"
fi

# Mac 上自动开预览，确认能跑
open "http://127.0.0.1:$PORT" 2>/dev/null
