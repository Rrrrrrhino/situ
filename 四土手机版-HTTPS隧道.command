#!/bin/bash
# 四土 · 手机版 HTTPS 隧道 —— 真·可安装 PWA（离线壳 + 出门用流量也能开）。
# 安卓 Chrome 的 service worker / 独立 PWA 安装必须 HTTPS，局域网 http 给不了，故用此。
SITU="$HOME/Documents/situ"
PY="$SITU/.venv/bin/python"
PORT=18760
cd "$SITU" || { echo "找不到 $SITU"; exit 1; }

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "未安装 cloudflared。先运行： brew install cloudflared"; exit 1
fi

# 确保本地服务在跑
if ! lsof -ti:$PORT >/dev/null 2>&1; then
  echo "本地服务未运行，正在启动…"
  nohup "$PY" -m santu_app.server > /tmp/situ-mobile.log 2>&1 &
  sleep 1.8
fi

clear
echo "──────────────────────────────────────────────"
echo "   四土 · 手机版 HTTPS 隧道"
echo ""
echo "   几秒后会出现一个 https://xxxx.trycloudflare.com 网址。"
echo "   📱 手机浏览器打开那个 https 网址 → 添加到主屏"
echo "      = 真·独立 PWA（离线壳、出门用流量也能开）。"
echo ""
echo "   ⚠ 该网址每次启动都不同；关掉此窗口即断开隧道。"
echo "──────────────────────────────────────────────"
echo ""
# --protocol http2：走 TCP 而非 QUIC/UDP。本机走 Clash 代理时 QUIC 会被打断，
# http2 实测可穿透（2026-06-29 验证：能服务到 app + /api）。
exec cloudflared tunnel --protocol http2 --url "http://127.0.0.1:$PORT"
