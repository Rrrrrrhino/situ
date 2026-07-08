#!/bin/bash
# 把「四土」打包成可双击的 .app（壳应用，运行的是 ~/Documents/situ 的实时源码，
# 所以以后改 bug 不用重新打包，改完源码 .app 立即生效）。
# 生成后复制到 /Applications（或 ~/Applications）和 ~/Desktop。
set -e
ROOT="$HOME/Documents/situ"
ICON_PNG="$ROOT/santu_app/assets/icon.png"
BUILD="$ROOT/四土.app"

cd "$ROOT"

# 1) PNG → icns（带透明圆角的图标）
ICONSET="$(mktemp -d)/四土.iconset"
mkdir -p "$ICONSET"
for s in 16 32 64 128 256 512; do
  sips -z $s $s     "$ICON_PNG" --out "$ICONSET/icon_${s}x${s}.png"      >/dev/null
  sips -z $((s*2)) $((s*2)) "$ICON_PNG" --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$ROOT/santu_app/assets/icon.icns"

# 2) 搭 .app 骨架
rm -rf "$BUILD"
mkdir -p "$BUILD/Contents/MacOS" "$BUILD/Contents/Resources"
cp "$ROOT/santu_app/assets/icon.icns" "$BUILD/Contents/Resources/icon.icns"

# 3) 启动器：cd 到源码、用 venv 的 python 跑（exec → .app 进程即 app 本体，
#    关窗即退出，无终端窗口）。日志写 /tmp/situ.log。
cat > "$BUILD/Contents/MacOS/situ" <<'LAUNCH'
#!/bin/bash
cd "$HOME/Documents/situ" || exit 1
exec ./.venv/bin/python -m santu_app.app >/tmp/situ.log 2>&1
LAUNCH
chmod +x "$BUILD/Contents/MacOS/situ"

# 4) Info.plist
cat > "$BUILD/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>四土</string>
  <key>CFBundleDisplayName</key><string>四土</string>
  <key>CFBundleIdentifier</key><string>com.situ.reader</string>
  <key>CFBundleVersion</key><string>1.0</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>situ</string>
  <key>CFBundleIconFile</key><string>icon</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>LSMinimumSystemVersion</key><string>10.13</string>
  <key>LSApplicationCategoryType</key><string>public.app-category.education</string>
</dict>
</plist>
PLIST

# 5) 去掉 quarantine，刷新图标缓存
xattr -dr com.apple.quarantine "$BUILD" 2>/dev/null || true
touch "$BUILD"

# 6) 分发到 桌面 + 应用程序
cp -R "$BUILD" "$HOME/Desktop/" 2>/dev/null && echo "✓ 桌面：$HOME/Desktop/四土.app"
if cp -R "$BUILD" "/Applications/" 2>/dev/null; then
  echo "✓ 应用程序：/Applications/四土.app"
elif mkdir -p "$HOME/Applications" && cp -R "$BUILD" "$HOME/Applications/" 2>/dev/null; then
  echo "✓ 应用程序（个人）：$HOME/Applications/四土.app"
else
  echo "· /Applications 没写入权限，已只放桌面；可手动把桌面的 .app 拖进「应用程序」"
fi
echo "源 .app 保留在项目根：$BUILD"
