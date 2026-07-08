# 四土 · 阶段 2：打包安卓 APK（施工规格）

> ✅ **已完成并真机跑通（2026-07-01）。** 曾误判"鸿蒙跑不了 Flutter 引擎"，adb logcat 抓真栈后
> 实为两个配置 bug，均已修：① MainActivity 包名 `com.situ.situ_reader` 与 applicationId
> `com.situ.reader` 不匹配→ClassNotFound 首帧崩→已把 kt 归位到 `com/situ/reader/` 包；
> ② `http://localhost` 被安卓默认禁明文拦→已在 Manifest `<application>` 加
> `android:usesCleartextTraffic="true"`。构建：`JAVA_HOME=…openjdk@17`
> `ANDROID_HOME=…android-commandlinetools`，`flutter build apk --release --split-per-abi
> --target-platform android-arm64`(18.7MB)。华为 EMUI14.2/Android12/arm64 冷启动+交互全验。

> 总蓝图见 `specs/手机原生app-施工规格.md`。本文件只管阶段 2：把现成的
> `santu_app/mobile/`（已端口好、preview 全验的"大脑+UI"）装进一个 Flutter WebView
> 壳，打成可侧载的安卓 APK，断开 Mac 也能全功能跑（读书 + AI 讲解 + 发音 + 生词本）。
> 主会话(Opus)已定方向与技术选型；builder 照此施工，**汇报贴证据不贴结论**。

## 0. 基底：克隆 yulian 的"可用构建"，只换 payload
本机 **`~/Downloads/apply/yulian/`** 是一个**真的在这台 Mac 上 build 出过 APK** 的 Flutter
安卓工程（`build/app/outputs/flutter-apk/app-debug.apk` 存在）。它的 `android/` gradle 配置、
JDK17、Android SDK 路径都是验证过能出包的。**所以不要从零 flutter create 配环境** —— 以 yulian 的
android 脚手架/gradle 设置为蓝本，把首次打包从"高风险配置"降成"照搬可用构建 + 换内容"。

yulian 是**原生 Flutter UI**（没有 WebView），所以 `lib/` 不能照抄，但 `android/`、gradle、
toolchain 设置照搬；`pubspec` 里它已有的 `record`/`speech_to_text`/`web_socket_channel`
是**阶段 4 录音要用的**，本阶段用不到、但留着无妨（也证明这些原生插件在本机能编译）。

## 1. 技术选型（已定，别换）
**用 `flutter_inappwebview`（不是官方 webview_flutter）。** 两个硬理由：
1. **本地资源伺服**：它自带 `InAppLocalhostServer`，能把打包进 assets 的整个 `mobile/` 文件夹
   伺服在 `http://localhost:<port>/`。这样 ① 所有相对路径（`./js/core.bundle.js`、`./fonts/…`、
   `./data/…`）原样可用；② **IndexedDB 拿到稳定的 http 源**（书架/生词本不会因 `file://`/
   `flutter_asset://` 源漂移而丢数据）——这是华为 WebView 上数据持久化的关键。
2. **异步桥能返回值**：JS 侧 `http.js` 期望 `await window.NativeHttp.post(...)` 拿到返回。
   inappwebview 的 `callHandler` 原生返回 Promise，干净实现；官方 webview_flutter 的
   JavaScriptChannel 是单向 postMessage、没有返回值，得自己搓 correlation-id，绕。

WebView 指向 `http://localhost:<port>/index.html`。外部请求（DeepSeek / MiniMax / 抓正文 /
阶段4 火山ASR）才走下面的 NativeHttp 桥绕 CORS；本地静态文件由 InAppLocalhostServer 伺服。

## 2. NativeHttp 桥契约（逐字对齐 `js/core/http.js`，错一点 AI 全废）
JS 侧已写死（`santu_app/mobile/js/core/http.js`），**不要改它**：
```js
// JS 调用：
const raw = await window.NativeHttp.post(url, headersObj, bodyStr); // bodyStr 已是字符串
// JS 期望 raw 形状：{ status: number, body: string }
//   （raw 为纯字符串时按 body 处理、status 当 200；见 http.js L21-29）
```
Dart 侧要做两件事：
1. **注册 handler** `nativeHttpPost`：收到 `(url, headersObj, bodyStr)` → 用 Dart `http`
   包真发 `POST`（header 原样带上，body 原样发）→ 返回 `{"status": resp.statusCode,
   "body": resp.body}`。超时/异常也要回 `{"status": 0, "body": "<错误信息>"}` 别抛。
2. **注入 shim**（document-start user script，**必须在 app.js 之前**就绪）：
```js
window.NativeHttp = {
  post: function (url, headers, bodyStr) {
    return window.flutter_inappwebview.callHandler('nativeHttpPost', url, headers, bodyStr);
  }
};
```
注：`callHandler` 已返回 Promise<{status, body}>，正好对上 http.js 的期望。

## 3. 要打包进 assets 的文件（白名单）
从 `santu_app/mobile/` 拷进 Flutter 工程 `assets/mobile/`，**只拷这些**：
```
index.html  app.js  vocab.js  settings.js  style.css
fonts.css   manifest.webmanifest   sw.js
js/                ← 整个目录（含 core.bundle.js，4.1MB，wink 模型已在 bundle 内）
data/              ← 词表/词频 json
fonts/             ← 自托管 Bitter woff2
icons/             ← 现成图标（阶段3 再美化）
vendor/            ← 若非空则带上
```
**别拷**：`node_modules/`、`_devtest/`、`package*.json`、`.claude/`、`CHANGELOG.md`。
`pubspec.yaml` 的 `flutter.assets:` 要把 `assets/mobile/` 递归声明全（含子目录每个文件，或用
目录声明 + 确认 flutter 递归打包；inappwebview 的 localhost server 需要它们在 asset bundle 里）。

## 4. App 身份 / 权限
- `applicationId` / `namespace` 改 `com.situ.reader`（**别留 com.example**）。
- App 名「四土」。图标先用现成 `icons/`（阶段 3 再换成套 SVG）。
- `AndroidManifest.xml`：`INTERNET` 权限（外部 AI 请求要）。**`RECORD_AUDIO` 麦克风权限留到
  阶段 4**，本阶段不加。
- `minSdk`：跟随 yulian（flutter 默认）即可；inappwebview 要求 minSdk ≥ 19/21，按其文档。

## 5. 分步 + 验收（每步贴证据）
- **Step 0 · 先验 payload 没坏（最便宜的防呆）**：本地起个静态服务伺服 `santu_app/mobile/`
  （`python3 -m http.server` 即可），用 preview/浏览器打开 `index.html`，确认：console 零报错、
  样章能渲染高亮、IndexedDB 能写（开一篇/加一本）。**payload 确认好再往下打包**，别拿坏的去 build。
  贴：console 截图或日志 + 一张渲染截图。
- **Step 1 · 建壳工程**：以 yulian 的 android 脚手架为蓝本建 `~/Documents/situ/四土app/`
  （Flutter 工程）。`flutter doctor -v` 先过（android ✓）；环境镜像 yulian（flutter 的
  android-sdk 指向 `/opt/homebrew/share/android-commandlinetools`，`JAVA_HOME` 指 jdk17）。
  贴：`flutter doctor` 关键行。
- **Step 2 · 接 WebView + 桥**：`pubspec` 加 `flutter_inappwebview`；写 `lib/main.dart`：
  全屏 `InAppWebView` + `InAppLocalhostServer`（伺服 assets/mobile）+ `nativeHttpPost` handler +
  §2 的 shim 注入。`flutter pub get` 过。贴：main.dart 全文 + `pub get` 成功行。
- **Step 3 · 拷 assets + 打包**：按 §3 白名单拷入 + 声明；`flutter build apk --debug`（先 debug
  包，快、能侧载；release 留阶段3）。贴：build 成功尾部 + `ls -la` 出 apk 路径与大小。
- **Step 4 · 报告**：apk 绝对路径、大小、用了哪个 webview 包版本、有没有降级/绕路、未决问题。

> 真机安装（用户出手，**不用数据线**）：把 apk 用微信"文件传输助手"发自己/传网盘 → 手机点开装
> （开"允许安装未知来源"）。真机验收（断 Mac 全链路）是阶段 3，本阶段交付到"apk 打出来 + 在
> 安卓模拟器或本机能装起来看到首屏"即可——**若无模拟器，交付到 apk build 成功 + Step 0 payload
> 验证通过**，真机过眼等用户装。

## 6. 风险与兜底（重要）
- **别硬刚**：首次打包 + 新插件（inappwebview yulian 没用过）。若 `flutter pub get` 或
  `flutter build apk` 连续 **2 次**认真修仍失败 → **停手、贴完整报错**，别一版版瞎试烧额度
  （取证优先）。常见坑：gradle/AGP 版本与 inappwebview 不配、minSdk 过低、namespace 缺。
- **InAppLocalhostServer 起不来 / asset 404**：先确认 assets 真打进 bundle（`flutter assets`
  声明递归全）。退路：inappwebview 也支持 `loadFile`/`file://` 直载 —— 但 IndexedDB 源会变，
  **不推荐**，要用先报告让主会话定。
- **华为/鸿蒙 WebView 版本未知**：IndexedDB / ES2020 支持到阶段 3 真机才核；本阶段在 Mac 端
  build + 模拟器/逻辑层验到的就先验。
- **不要做**：不改 `mobile/` 里现成 JS/CSS（除了不得不的桥注入，且桥注入走 Dart user script、
  尽量不动 JS 源文件）；不做录音（阶段4）；不美化图标（阶段3）；不碰桌面 app.py/index.html。

## 7. 交付物
- `~/Documents/situ/四土app/`（Flutter 壳工程，可 build）。
- `flutter build apk --debug` 产出的 apk（路径/大小贴报告）。
- 更新 `santu_app/mobile/CHANGELOG.md`（阶段 2 段：新增壳工程 + 桥 + 打包，贴关键证据）。
- 一句话回报主会话：build 成功与否、apk 在哪、绕过哪些坑、未决问题。
