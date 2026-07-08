#!/bin/bash
# 一键打包 四土.app（自包含，含 Python + spaCy 模型 + 所有依赖），并做成拖拽安装的 DMG。
# 用法：在项目根目录运行  bash packaging/build.sh
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PY="$ROOT/.venv/bin"

echo "▸ 清理旧产物…"
rm -rf packaging/dist packaging/build

echo "▸ PyInstaller 打包中（首次较慢，几分钟）…"
"$PY/pyinstaller" packaging/santu.spec --noconfirm \
    --distpath packaging/dist --workpath packaging/build

APP="packaging/dist/四土.app"
if [ ! -d "$APP" ]; then echo "✗ 打包失败，未生成 $APP"; exit 1; fi

echo "▸ 稳定证书签名（TCC 权限跨更新存活）…"
# 不再 ad-hoc：ad-hoc 的 TCC 记录按 cdhash 记，每次重打包用户就要重新给一遍
# 麦克风/屏幕录制权限。「KuaiLu Codesign」是钥匙串里的稳定自签证书，签名不变权限就不掉。
codesign --force --deep --sign "KuaiLu Codesign" "$APP" \
    || { echo "  ⚠️ 稳定证书签名失败，回落 ad-hoc（权限会随更新失效）"; codesign --force --deep --sign - "$APP" || echo "  （签名失败，可忽略）"; }

# ============================================================================
# 安装到 /Applications（默认执行；SKIP_INSTALL=1 时跳过，仅出 dist + DMG 用于分发）
# ----------------------------------------------------------------------------
# ⚠️ 「更新后没更新」反复出现的根因修复：build.sh 过去只产出 packaging/dist/四土.app，
#    从不覆盖 /Applications。而 Dock/启动台启动的是 /Applications/四土.app（冻结旧包），
#    所以改了源码、重跑 build.sh，用户看到的仍是旧界面。此段把「重建 = 安装 = 生效」焊死：
#    杀掉在跑实例 → 原子覆盖安装 → 刷 LaunchServices/图标缓存 → 校验 baked==源码。
# ============================================================================
if [ "${SKIP_INSTALL:-0}" != "1" ]; then
  TARGET="/Applications/四土.app"
  echo "▸ 关闭正在运行的 四土（优雅退出 + 按路径兜底 kill；冻结包进程名=编译二进制，只能按路径杀）…"
  osascript -e 'tell application id "com.situ.reader" to quit' 2>/dev/null || true
  osascript -e 'quit app "四土"' 2>/dev/null || true
  sleep 1
  pkill -f "/Applications/四土.app/Contents/MacOS"        2>/dev/null || true
  pkill -f "$ROOT/packaging/dist/四土.app/Contents/MacOS" 2>/dev/null || true
  pkill -f "$ROOT/四土.app/Contents/MacOS"                2>/dev/null || true
  sleep 1

  echo "▸ 原子覆盖安装到 $TARGET …"
  rm -rf "$TARGET"
  ditto "$APP" "$TARGET"

  echo "▸ 刷新 LaunchServices + Dock 图标缓存…"
  LSREG="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
  { [ -x "$LSREG" ] && "$LSREG" -f "$TARGET" 2>/dev/null; } || true
  touch "$TARGET"
  killall Dock 2>/dev/null || true

  # 自检（永久防呆）：装进去的 baked index.html 必须逐字等于当前源码，否则等于「装了个寂寞」
  BAKED="$TARGET/Contents/Resources/santu_app/index.html"
  if [ -f "$BAKED" ]; then
    SRC_SUM=$(shasum "$ROOT/santu_app/index.html" | awk '{print $1}')
    DST_SUM=$(shasum "$BAKED" | awk '{print $1}')
    if [ "$SRC_SUM" = "$DST_SUM" ]; then
      echo "  ✓ 自检通过：已装包 index.html 与源码逐字一致（$SRC_SUM）"
    else
      echo "  ⚠️ 自检失败：已装包 index.html ≠ 源码！可能 spec 漏打 santu_app 或打了缓存旧文件"
      echo "     源码=$SRC_SUM  已装=$DST_SUM  —— 请检查 packaging/santu.spec 的 datas"
    fi
  else
    echo "  ⚠️ 未找到 baked index.html（$BAKED）——冻结包结构可能变了，请核对 spec"
  fi
  echo "✓ 已安装到 /Applications 并刷新缓存。**从 Dock/启动台重开 四土 即最新版。**"
else
  echo "▸ SKIP_INSTALL=1 → 跳过 /Applications 安装（仅产出 dist 与 DMG，用于分发给他人）。"
fi

echo "▸ 组装 DMG 内容（App + Applications 快捷方式，供拖拽安装）…"
STAGE="packaging/dist/dmg-stage"
rm -rf "$STAGE"; mkdir -p "$STAGE"
cp -R "$APP" "$STAGE/"
ln -s /Applications "$STAGE/Applications"

echo "▸ 生成 DMG…"
DIST_DMG="packaging/dist/四土-mac.dmg"
rm -f "$DIST_DMG"
hdiutil create -volname "四土" -srcfolder "$STAGE" -ov -format UDZO "$DIST_DMG" >/dev/null
rm -rf "$STAGE"

echo "✓ 完成："
echo "    应用： $ROOT/$APP"
echo "    分发： $ROOT/$DIST_DMG   ← 发这个 .dmg 给朋友"
du -sh "$APP" "$DIST_DMG"
