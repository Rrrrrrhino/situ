# 四土 · situ

一个帮你「读懂」英文原著的 Mac 桌面阅读器：导入 EPUB → 按章翻页阅读 → 自动标出生词 → 点任意词 / 句看**有温度的中文讲解**，还能真人发音、整篇朗读、记生词本、加书签 / 高亮。

> 四土基于同门的「三土」（读文章）分支而来，主打**读整本英文书**：按章、翻页、书签、高亮、圆点贴、书架。

> 👇 **不懂代码的朋友，看「① 直接下载安装」这一节就够了**，下面的「源码 / 开发者」部分可以完全忽略。

---

## ① ⬇️ 直接下载安装（Mac · 推荐，不用装任何环境）

**先看你的 Mac 是什么芯片**：点屏幕左上角 **苹果标 → 关于本机**，看「芯片 / 处理器」那一行：
- 写着 **Apple M1 / M2 / M3 / M4**（2020 年底以后的新 Mac）→ 下载 **Apple Silicon** 版；
- 写着 **Intel**（较老的 Mac）→ 下载 **Intel** 版。
- 拿不准？下 **Intel 版**——它两种芯片都能跑（M 芯上会自动走兼容层，首次打开点一下装 Rosetta 即可）。

1. 打开本仓库的 **[Releases 下载页](https://github.com/Rrrrrrhino/situ/releases/latest)** → 在下方 **Assets** 里，按上面的芯片下载对应的那个：
   - **`situ-mac-apple-silicon.dmg`** —— Apple M 系列芯片（原生，最快）
   - **`situ-mac-intel.dmg`** —— Intel 芯片（也可在 M 芯上通过 Rosetta 运行）
2. 双击下载好的 `.dmg`，在弹出的窗口里，把 **四土** 图标**拖到右边的「应用程序 / Applications」文件夹**。
3. 打开「应用程序」，**右键点「四土」→「打开」**，弹窗里再点一次「打开」。
   （只有**第一次**要这样——因为这个 App 没花钱买苹果签名；之后就能正常双击了。）

> 😵 如果提示「**已损坏 / 无法打开**」：打开「**终端**」(在「应用程序 → 实用工具」里)，粘贴下面这行、回车，再回去右键打开即可：
> ```
> xattr -dr com.apple.quarantine /Applications/四土.app
> ```

装好后想看「中文讲解」，还需填一个 AI Key（**见下方「填一个 AI Key」一节**，每人用自己的、几块钱）。生词高亮、翻页阅读则**开箱即用**、无需 Key。

---

## ② 源码 / 开发者运行（clone 后跑源码）

> 会一点命令行、或想改代码再走这条。需要装一次 Python 环境（约 5 分钟）。

**前置**：Mac 自带的「终端」+ 已装 [Homebrew](https://brew.sh)（或任意 Python 3.10+ 与 git）。

```bash
# 1) 把仓库拉到本地（放哪都行）
git clone https://github.com/Rrrrrrhino/situ.git
cd situ

# 2) 建虚拟环境 + 装依赖（首次约几分钟）
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m spacy download en_core_web_sm   # 分词模型，约 12MB

# 3) 启动
.venv/bin/python -m santu_app.app
```

装好后，**双击项目根目录里的 `四土.command`** 就能开（它会自动用 `.venv` 起 App），不用每次进终端。

> 😵 首次双击 `四土.command` 若提示「无法验证开发者」：右键点它 →「打开」，弹窗里再点一次「打开」即可（只有第一次要这样）。

### 填一个 AI Key（看讲解需要，每人用自己的）
生词高亮、翻页阅读**开箱即用**；但「中文讲解 / 发音讲解」需要一个 AI 的 Key。**自己的 Key 自己用，互不相干，费用也极低**（DeepSeek 充几块钱能用很久）。

1. 打开 **https://platform.deepseek.com** → 注册 / 登录 → 在「充值」里充一点点（几块钱即可）。
2. 左侧「**API keys**」→「**创建 API key**」→ 复制 `sk-` 开头那一长串。
3. 回到「四土」App，点「**⚙ 设置**」→ 选服务商 **DeepSeek** → 把 Key 粘进去 →「**测试**」显示成功后点「**保存**」。

✅ 你的 Key 只存在你自己电脑上（`~/Library/Application Support/SiTu/`），**不会上传到任何地方**。

> 💡 **自己打独立 dmg**：`bash packaging/build.sh` 会用 PyInstaller 把 Python + 依赖 + spaCy 模型全打进 `packaging/dist/四土.app`，并生成拖拽安装的 `四土-mac.dmg`——就是 Releases 里发的那个。只需项目 `.venv` 已装好依赖。
>
> 💻 **Windows 版**：核心是 pywebview + Python，理论上可跑，但未做适配测试。

---

## 开发者 / CLI

> 以下为命令行 / 源码使用方式，普通用户无需关心。

把一篇英文新闻 / 一本英文书 → 标注好的 HTML 阅读页 + 生词本 JSON。

按你的英语水平（CET-4 / CET-6 / 之间）自动标出：
- **生词**（按日常情境出现频率分三档高亮，深浅 = 难度）
- **CET-6 词**（浅蓝）
- **短语 / 固定搭配**（绿色虚线框）
- **优质表达**（紫色虚线框）
- **长难句**（粉红虚线框，整句包裹）

每个高亮悬停可看中文释义 / 解释；末尾附可排序、可筛选的生词本表格。

## 安装

```bash
cd ~/Documents/english-reader
python3 -m venv .venv
.venv/bin/pip install trafilatura ebooklib beautifulsoup4 spacy openai python-dotenv tqdm jinja2 click
.venv/bin/python -m spacy download en_core_web_sm
cp .env.example .env       # 填一个 LLM key 进去（DeepSeek 最便宜）
```

## 用法

```bash
# 网页新闻
.venv/bin/python read.py "https://www.theguardian.com/world/2026/..." --open

# 本地 epub / txt / html
.venv/bin/python read.py ~/Downloads/some-book.epub --level cet4-6 --open

# 不用 LLM（只做词汇分层）
.venv/bin/python read.py article.txt --no-llm --open
```

参数：
- `--level cet4 | cet6 | cet4-6` — 你的英语水平基线（默认 cet4-6）
- `--no-llm` — 跳过 LLM，只做词汇分层
- `--out path.html` — 自定义输出路径
- `--max-chars N` — 送给 LLM 的最大字符数（默认 8000，避免长文超限）
- `--open` — 完成后自动用浏览器打开

输出：
- `output/<标题>.html` — 主交互阅读页
- `output/<标题>.vocab.json` — 结构化生词本（以后可对接 Anki / 复习系统）

## 数据来源

- CET-4 / CET-6 词表：mahavivo/english-wordlists
- 日常情境频率：OpenSubtitles 2018 5 万词 (hermitdave/FrequencyWords)
- 分词/词形还原：spaCy en_core_web_sm
- 正文抽取：trafilatura (网页) / ebooklib (epub)
- LLM：OpenAI 兼容协议（DeepSeek / Zhipu / Kimi / OpenAI 任选）

## 项目结构

```
reader_core/
  extractor.py   # URL/epub/txt → 纯文本
  vocab.py       # 分词 + 词形还原 + CET 分层 + 频率排序
  llm.py         # LLM 增强（释义 + 短语 + 优质表达 + 长难句）
  render.py      # Jinja-free HTML 渲染 + 交互 JS
read.py          # CLI
data/            # 词表 + 频率表
output/          # 生成的 HTML + JSON
```

核心逻辑与 CLI 解耦，以后想包成网页版 / Chrome 插件 / 移动端，只换前端，`reader_core` 不动。

## 桌面 App（三土）

`santu_app/` 是基于 pywebview 的单页桌面壳，主打「点一下就懂」的精读体验：

- **导入即读**：贴网址 / 选 epub·txt·html，自动抽正文，按你的水平（CET-4 / CET-6 / 之间）高亮生词，并标出日常出现频率 A–E 档。
- **点词即讲**：点正文里任意单词，看「有温度」的中文讲解（语境义 + 字面义 + 用法）；也能划选短语 / 整句讲解，并就地「追问」。
- **真人发音**：单词、短语、整句都能发音，英音 / 美音一键全局切换（有道 + MiniMax 真人级）。
- **整篇朗读**：一键朗读全文，句级高亮跟读、空格键暂停 / 继续；打开文章即在后台预下载音频，点「朗读」几乎秒开。
- **生词本**：自动收词，可按类型筛选、就地展开复习，掌握后归档到「已掌握」。
- **其它**：书签、阅读历史、配色主题、导出自包含 HTML（保留高亮 + 悬停讲解，可离线分享）。

```bash
.venv/bin/python -m santu_app.app
```

- **API Key**：开发时放 `.env`；打包后的 App 在右上角「⚙ 设置」里填，存到 `~/Library/Application Support/SanTu/config.json`（不入库、随更新保留）。
- 用户数据（生词本 / 音频 / 导出）在运行于 .app 包内时也写到 `~/Library/Application Support/SanTu/`，包内只读资源由 `reader_core/userconfig.resource_base()` 解析（兼容 PyInstaller `sys._MEIPASS`）。

## 打包自包含 .app（发给朋友）

朋友无需装 Python / 配环境，双击即用。用 PyInstaller 把 Python + 依赖 + spaCy 模型全打进 `三土.app`：

```bash
bash packaging/build.sh
# 产物：packaging/dist/三土.app  +  packaging/dist/三土-mac.zip（发这个 zip）
```

- `packaging/santu.spec` — PyInstaller 配置（collect_all 收 spaCy/thinc/blis 等原生依赖与模型）。
- `packaging/santu_entry.py` — 冻结入口；设 `SANTU_SELFTEST=1` 可跑无界面冒烟测试（验证 spaCy 在冻结包内能加载）。
- `packaging/给朋友的使用说明.md` — 随包发给朋友的说明（含首次打开的 Gatekeeper 绕过）。

> **Gatekeeper**：App 是 ad-hoc 签名、未经 Apple 公证，朋友首次打开需 **右键 → 打开**（或 `xattr -dr com.apple.quarantine /Applications/三土.app`）。要彻底免提示需 Apple 开发者账号（$99/年）做公证。
