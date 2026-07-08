# 四土 · 手机版（PWA）接续便条

> ⚠️ **【2026-06-29 已废弃 · 仅留档】本文件描述的是早期 PWA 路线，已被「真·独立安卓
> App」取代。** 原生 App 的最新进度 / 接续 / 阶段清单，一律以
> **`specs/手机原生app-施工规格.md`**（那份才是当前 handoff）为准；阶段 2 打包见
> `specs/阶段2-打包APK-施工规格.md`。下面 PWA 的内容只作历史参考，别照它继续做。

> 新窗口接续暗号：**「继续弄四土手机版，先读 HANDOFF-手机版.md」**
> 本文件独立于桌面版 `HANDOFF.md`（那份在另一窗口改桌面 bug，勿动）。

## 这是什么
把桌面四土（EPUB 阅读器）做成**手机 PWA**：手机浏览器打开 → 点词即讲 / 选区讲解 / 追问 / 生词本，与桌面版**共享同一份数据**（`~/Documents/situ/{library,books,vocab,audio}`）。
- 全程电脑浏览器开发自测（Chromium preview，手机视口）；真机用华为 nova10 浏览器测。
- 因本机缺 Android SDK，**不走原生/Flutter，走 PWA**（与用户 2026-06-28 对齐）。

## 怎么跑（用户明早就这么用）
1. 双击桌面 **`四土手机版.command`** → 终端显示局域网网址 + 二维码。
2. 手机连**同一 WiFi**，浏览器扫码 / 输入 `http://192.168.31.130:18760`（IP 随网络变，以终端显示为准）。
3. 打开后「分享/菜单 → 添加到主屏」。
- 想要**真·可安装 PWA**（离线壳 + 出门用流量）：双击 **`四土手机版-HTTPS隧道.command`** → 用它给的 `https://xxx.trycloudflare.com` 网址（安卓 Chrome 的 service worker 必须 HTTPS，局域网 http 给不了）。隧道走 `--protocol http2`（本机 Clash 挡 QUIC，已实测 http2 可穿透）。
- 手动起服务：`cd ~/Documents/situ && ./.venv/bin/python -m santu_app.server`（绑 `0.0.0.0:18760`）。

## 架构（关键：完全没碰 app.py / index.html）
- **后端** `santu_app/server.py`：stdlib `wsgiref` + `ThreadingMixIn` 写的 HTTP 服务，import 现成的 `Api`（一个全局实例），把方法暴露成 `POST /api/<method>`（JSON 进/出）。零外部依赖（没用 bottle/FastAPI）。
  - 桌面专属副作用方法**不暴露**（export_csv/copy_text/reveal_in_finder/open_output_dir/read_clipboard/export_html）；手机改走浏览器 Blob 下载 + `navigator.clipboard`。
  - 额外端点：`/api/vocab_export`（下载 global.json）、`/api/vocab_import`（按 key 合并/替换，复用 `api._gvlock`）。
- **前端** `santu_app/mobile/`：
  - `index.html` 外壳 + PWA meta；`app.js` 核心（书架/添加/阅读/讲解 sheet/追问/音频/存续）；`vocab.js` 生词本；`settings.js` 设置。三个 classic script 共享全局作用域。
  - `style.css` 暖纸档案风（与桌面四土视觉连贯：暖纸底 `#f7f2e8`、暖金 chrome `#9c7a3e`、蓝系生词高亮、J 轮冷暖分层 6 色）。
  - `fonts/`（自托管 Bitter 400/600 latin）+ `fonts.css`：**不依赖 Google Fonts**（国内/离线可靠）。
  - `manifest.webmanifest` + `sw.js`（网络优先+缓存兜底，不挡开发改动）+ `icons/`（192/512/maskable，源自 `assets/icon.png`）。
- **单用户单会话**：Api 一次只持有一本书/一篇文章；个人手机够用。多标签页并发会互相打断当前文档（边角情况）。

## 已验证（电脑 Chromium preview 真实闭环，2026-06-29）
- 书架/继续阅读、开文章、开 EPUB 书（load_archive）。
- **点词讲解**（取词正确 + 真 deepseek 调用，音标/词性/字面词源/本句义/讲解/词频档 chip 全渲染）。
- **选区讲解**（词块/句判定 + key_words）。
- **追问**（快捷 chip 词汇深解/常见程度/… + 自由问，真 LLM 多轮）。
- **书章节导航**（上/下章 + 目录抽屉，22 章书实测）。
- **生词本**：全局/本篇、频率(罕见优先)/章节/点击 三维排序、冷暖分层色、类型筛选(词/词块/句)、未掌握/重点/已掌握视图、搜索、展开详情(字面/讲解/追问)、星标/掌握/删除、复制(tab)/导出 CSV(Blob)。
- **设置**：水平/口音/字号(实时+持久化)、API Key 服务商/测试/保存、MiniMax Key、同步导入导出。
- **音频**：单词(有道 14KB mp3)+词组(MiniMax 33KB)**都活**（MiniMax key 现已可用，与桌面 round I 时已不同）。
- **同步**：导出 + 幂等重导入(ok/count 不变)、真库未污染。
- **PWA**：manifest(3图标)、service worker 注册 active、图标/字体本地服务。
- **HTTPS 隧道**：cloudflared `--protocol http2` 实测服务到 app + /api。
- **启动器**：nohup + 绝对 venv python 独立起服务、伺服 HTML、/api 正常、LAN IP 检测。
- console 全程零报错。

## 已知限制 / 下一步（按价值排序）
1. **真机视觉/交互待 nova10 过眼**（preview 是 Chromium，真机是手机浏览器/WebView；字体回退、触摸选区、添加到主屏体验需真机确认）。
2. **整篇朗读播放器没做**：当前只有「点词/选区听发音」🔊。桌面有自动逐句播放+高亮（round F/G）。手机版若要，需做句子序列播放+播放/暂停 UI（MiniMax 现可用，值得做）。
3. **URL 添加未真机网络验证**：`process({source:url})` 走 extract_text（需联网）。代码与 process_file 同路径，桌面库里已有 URL 文章证明可用；手机端首验时留意 Clash/网络。
4. **deepseek-chat = flash 档**：配置仍用 `deepseek-chat`（[[reference_deepseek_chat_maps_to_flash]] 映射到弱档 v4-flash）。讲解质量够用但非最佳；要升级在设置里把模型改 `deepseek-v4-pro`（推理模型，注意 max_tokens 给足）。属用户/桌面侧决定，未动。
5. **深色模式**：当前只做暖纸浅色。夜读可加 `prefers-color-scheme` 深色档案配色。
6. **maskable 图标**：用 14% 留白合成，安卓裁切应安全；真机看一眼更稳。

## 改过/新增的文件（全部新增，零改动既有源码）
```
santu_app/server.py                      ← 新：HTTP 服务包 Api
santu_app/mobile/{index.html,app.js,vocab.js,settings.js,style.css}
santu_app/mobile/{manifest.webmanifest,sw.js,fonts.css}
santu_app/mobile/fonts/{bitter-400,bitter-600}.woff2
santu_app/mobile/icons/{icon-192,icon-512,icon-maskable-512}.png
四土手机版.command / 四土手机版-HTTPS隧道.command（项目根 + ~/Desktop 各一份）
.claude/launch.json 加了 situ-mobile（端口 18760，给 preview 用）
```

## 常用命令
```bash
# 起服务
cd ~/Documents/situ && ./.venv/bin/python -m santu_app.server
# 看端口/停服务
lsof -ti:18760 | xargs kill
# JS 语法检查
cd ~/Documents/situ/santu_app/mobile && for f in app vocab settings; do node --check $f.js; done
# HTTPS 隧道（出门/真 PWA）
~/Documents/situ/四土手机版-HTTPS隧道.command
```
