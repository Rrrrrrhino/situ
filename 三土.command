#!/bin/bash
# 双击此文件启动「三土」桌面应用
cd "$(dirname "$0")"
exec ./.venv/bin/python -m santu_app.app
