# 四土手机原生 App —— 交接（2026-07-01）

> 新窗口接续暗号：**「继续做四土原生 App 的 ④ 语音训练，先读 HANDOFF-手机原生-④语音训练.md」**
> 完整历史见 memory 卡 `project_situ_native_app`（⑨⑩⑪⑫，会自动加载）。总蓝图 `specs/手机原生app-施工规格.md`。

## 当前状态：①②③④ 全部完成并真机验收 —— 项目主体告一段落（2026-07-01）

> ④ 语音训练：录音→火山转写→自动填口语复盘框，用户 2026-07-01 真机亲测成功。曾担心的华为 WebView getUserMedia 麦克风风险实测不存在。用户表示先用着，以后想优化再说。

## ★④ 火山 ASR 接口——已用用户真实凭证取证跑通（照抄，别再查文档）
- **不需要用户再开通任何东西**：用户已开通的「豆包录音文件识别模型2.0-标准版」，其 grant 实际映射到 resource-id **`volc.seedasr.auc`**（不是文档常写的 `volc.bigasr.auc`/`_turbo`——那俩报 45000030 not granted）。App ID `6295788803` + Access Token（用户附件给的，**只存设置屏/IndexedDB，绝不进代码**）直接可用。
- **异步两步**，收 **base64 wav**（手机无需公网 url！）：
  - submit `POST https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit`，headers `X-Api-App-Key/X-Api-Access-Key/X-Api-Resource-Id: volc.seedasr.auc/X-Api-Request-Id:<自造uuid>/X-Api-Sequence:-1`，body `{"user":{"uid":"situ"},"audio":{"format":"wav","data":"<base64>"},"request":{"model_name":"bigmodel","enable_itn":true,"enable_punc":true}}` → HTTP200 body`{}`。
  - query `.../query`，同 headers（★request-id 同一个，**不需要 X-Tt-Logid**，reqid 单独就够——关键，因原生桥拿不到响应头），body`{}`。轮询。
- **原生桥只回 {status,body} 拿不到响应头**，故 JS 靠 body 判态：处理中 body`{"audio_info":{},"result":{"text":""}}`；**完成 = `audio_info.duration` 出现** + `result.text`；出错 HTTP4xx body`{"header":{"code,message}}`。实测 ~20s 音频 1–2s 出结果。
- 完整规格（含逐字参考实现）：`specs/阶段7-语音训练-施工规格.md`。


四土 = 三土 fork 的 EPUB/文章英文阅读器，点词讲解/生词本/口语复盘。手机原生 =
Flutter(flutter_inappwebview) 壳 + assets/mobile 里的 JS「大脑」，InAppLocalhostServer
伺服在 http://localhost:18761，外部请求走 Dart↔JS 原生 HTTP 桥。

**本轮（2026-07-01）已完成：**
- ✅ **原生 APK 跑通**（曾误判"鸿蒙跑不了 Flutter"，实为①MainActivity 包名 `com.situ.situ_reader`≠applicationId `com.situ.reader`→ClassNotFound；②`http://localhost` 明文被安卓拦。均已修，见 memory ⑨）。
- ✅ **网址阅读**：`process()` URL 分支接原生 GET 桥→抓 HTML→Readability(`extractFromHtml`)→阅读。（memory ⑩）
- ✅ **① 读物精选**（应用内选 CNA/The Conversation→RSS 近期文章列表→点开阅读）。`discover.js` + `localapi.fetch_feed`。（memory ⑪，spec `specs/阶段5-*`）
- ✅ **② 口语复盘+写作训练进包**（全量 rsync santu_app/mobile→四土app/assets/mobile + pubspec 加 review.js/discover.js）。
- ✅ **③ 图标 emoji→暖金细线 SVG**，对齐桌面。（memory ⑫，spec `specs/阶段6-*`）
- 桌面交付：`~/Desktop/四土手机版/四土.apk`（arm64 release 18.9MB，包名 com.situ.reader）+ 状态说明。App 已 adb 装在用户华为 FOA-AL00(EMUI14.2/Android12)。

## ④ 设计（已定死，派 builder 施工中）
不做实时转写；整段录完→转文字→自动填「口语复盘」`#revText`→走现有复盘/错题本/写作训练闭环。90% 复用现有 JS 大脑。
1. **录音**：review.js 里用 Web Audio(`getUserMedia`+ScriptProcessor)自己录 → 16k 单声道 16-bit WAV → base64（**不用 MediaRecorder**，安卓 WebView 出 webm/opus 火山不认）。加权限：AndroidManifest 的 `RECORD_AUDIO`+`MODIFY_AUDIO_SETTINGS`，main.dart 的 `onPermissionRequest` 授予 WebView 麦克风。**风险点=这台华为 WebView getUserMedia 能否录（未真机验）**。
2. **转写**：core/localapi.js 新增 `transcribe_audio`，复用 `http.js` 的 `httpPost`（原生桥，绕 CORS）打上面 submit+query。凭证读 IndexedDB `volc_appid`/`volc_token`。
3. **接入**：转出文字填 `#revText` → 用户点「复盘」走现有 `review_speech`。输入屏加「🎤 录音」按钮（阶段6 细线 SVG）。
4. 凭证由用户在**设置屏**自己填（settings.js 新加「语音转写」卡）；浏览器版同源可同享（复盘大脑纯 JS，但浏览器直连火山会 CORS，转写只在 App 内可用）。

## 构建 / 同步 / 验证 命令（关键，别丢）
```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@17
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
export ANDROID_SDK_ROOT=$ANDROID_HOME
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
# 改了 js/core/* 才需重出 bundle；改 app.js/index.html/*.js(非core)/css 不需要
cd ~/Documents/situ/santu_app/mobile && npm run build
# 同步源→APK 资源（排除开发件）
rsync -a --delete --exclude node_modules --exclude .claude --exclude _devtest \
  --exclude .git --exclude 'package*.json' --exclude CHANGELOG.md --exclude .DS_Store \
  ~/Documents/situ/santu_app/mobile/ ~/Documents/situ/四土app/assets/mobile/
# 打包 + 装 + 交付
cd ~/Documents/situ/四土app
flutter build apk --release --split-per-abi --target-platform android-arm64
adb install -r build/app/outputs/apk/release/app-arm64-v8a-release.apk
cp build/app/outputs/apk/release/app-arm64-v8a-release.apk ~/Desktop/四土手机版/四土.apk
```

## 踩坑备忘
- **adb 华为息屏即掉 USB 调试**：长构建后常需用户重新点亮+把 USB 切「传输文件」。建议开发者选项开「充电时保持唤醒」。真机验证前先 `adb devices` 确认。
- **release 包 WebView console 的 debugPrint 被 strip**→`adb logcat` 看不到 JS console，视觉/功能验证靠 `adb exec-out screencap`。
- **两 mobile 目录**：`santu_app/mobile`=源头(改这里)；`四土app/assets/mobile`=APK 打包用(靠 rsync 同步，别直接改)。二者本轮已一致。
- 新加的独立 script（如未来 record.js）**必须加进 `四土app/pubspec.yaml` 的 assets 列表**，否则本地服务器伺服不到。
- adb 点坐标：screencap 是原生 1084x2412；华为屏点词进讲解面板要对准蓝色高亮词。
- 从"继续阅读"打开某旧存档正文可能空白=早前空存档，非 bug（新文章渲染正常已证）。
