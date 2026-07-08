#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== 四土对话录 build.sh ==="
echo "Project: $SCRIPT_DIR"

# 与 kuailu 一致：用 macOS 15.5 SDK 避开默认 SDK 与 Swift 模块版本不一致的问题
if [ -d "/Library/Developer/CommandLineTools/SDKs/MacOSX15.5.sdk" ]; then
    export SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX15.5.sdk
fi

echo ""
echo "--- Step 1: swift build -c release ---"
swift build -c release

BINARY=".build/release/DualTrackRecorder"
if [ ! -f "$BINARY" ]; then
    echo "ERROR: Binary not found at $BINARY"
    exit 1
fi
echo "Binary built: $BINARY"

APP_DIR="$SCRIPT_DIR/dist/四土对话录.app"
echo ""
echo "--- Step 2: Assembling $APP_DIR ---"

rm -rf "$APP_DIR"
mkdir -p "$APP_DIR/Contents/MacOS"
mkdir -p "$APP_DIR/Contents/Resources"

cp "$BINARY" "$APP_DIR/Contents/MacOS/DualTrackRecorder"
cp "$SCRIPT_DIR/Resources/Info.plist" "$APP_DIR/Contents/Info.plist"

echo ""
echo "--- Step 3: codesign（稳定自签证书，TCC 跨构建存活） ---"
# 不再用 ad-hoc：ad-hoc 的 TCC 记录按 cdhash 记，每次重编即失效、用户每次都要重授权；
# 「KuaiLu Codesign」是钥匙串里的稳定自签证书（快录项目建的），designated requirement 跨构建不变。
codesign --force --deep -s "KuaiLu Codesign" "$APP_DIR"

echo ""
echo "--- Step 4: Verify codesign ---"
codesign -v "$APP_DIR" && echo "codesign OK"
codesign -dv "$APP_DIR" 2>&1 || true

echo ""
echo "--- Step 5: Info.plist key check ---"
for key in CFBundleIdentifier CFBundleName LSUIElement LSMinimumSystemVersion NSMicrophoneUsageDescription; do
    val=$(defaults read "$APP_DIR/Contents/Info.plist" "$key" 2>/dev/null || echo "MISSING")
    echo "  $key = $val"
done

echo ""
echo "--- Step 6: 拷贝到桌面 ---"
DEST="$HOME/Desktop/四土对话录.app"
# 必须先删再拷：目标已存在时 cp -R 会把新包拷进旧包内部（嵌套 .app，签名报 unsealed）
rm -rf "$DEST"
ditto "$APP_DIR" "$DEST"
xattr -dr com.apple.quarantine "$DEST" 2>/dev/null || true
codesign -v "$DEST" && echo "✓ 桌面副本签名校验通过"
echo "✓ 桌面：$DEST"

echo ""
echo "=== Build complete: $APP_DIR ==="
