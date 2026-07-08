#!/bin/bash
# 把真实 santu_app/index.html 同步进 harness，末尾保留注入的 stub script 行。
set -e
SRC=/Users/yizhang/Documents/situ/santu_app/index.html
DST=/Users/yizhang/Documents/situ/specs/_harness/index.html
V=$(date +%s)
sed "s#</body>#<script src=\"./canned-bookmarks.js?v=$V\"></script>\n</body>#" "$SRC" > "$DST"
echo "synced $(wc -l < "$DST") lines -> $DST"
