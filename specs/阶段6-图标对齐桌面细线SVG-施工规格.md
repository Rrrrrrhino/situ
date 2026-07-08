# 四土 · 阶段 6：手机版图标对齐桌面（emoji → 细线 SVG）施工规格

> 主会话(Opus)已定图标画法、用户已看对比图并批准方向。builder 照此在
> **`santu_app/mobile/`** 施工，**汇报贴证据不贴结论**。
> ⚠️ 只动 santu_app/mobile 下这几个 UI 文件（**都不是 bundle 源**，故**无需 npm build**）：
> `index.html`、`app.js`、`vocab.js`、`review.js`、`style.css`。
> **不要**碰 `js/core/*`、**不要**碰 `四土app/assets/mobile/`、**不要** flutter build、**不要** git commit。
> 同步进 APK + 真机验证由主会话做。

## 目标
把手机版里**彩色图形 emoji**（在安卓上渲染成彩色塑料图标、与暖纸+暖金气质不搭）
换成**暖金单色细线 SVG**，跟桌面版 `santu_app/index.html` 的图标一个气质。
**功能性单色字符保留不动**：`→ ↑ ✓ ✗ ✕ ✦`、字号按钮的 `A`。

## 图标集（逐字用；一律 `stroke="currentColor"`，颜色由所在按钮的 CSS color 决定）

在 **app.js 顶部**加一组常量（供 JS 模板串复用），index.html 里直接内联同样的 SVG：

```js
const SVG = {
  hamburger:`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>`,
  book:`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M12 6c-2-1.2-5-1.2-7 0v11c2-1.2 5-1.2 7 0 2-1.2 5-1.2 7 0V6c-2-1.2-5-1.2-7 0z"/><path d="M12 6v11"/></svg>`,
  doc:`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"><path d="M7 3.7h6.4L18 8.2V19a1.3 1.3 0 0 1-1.3 1.3H7A1.3 1.3 0 0 1 5.7 19V5A1.3 1.3 0 0 1 7 3.7z"/><path d="M13.2 3.9V8.4h4.4"/><path d="M8.6 12.6h6.8M8.6 15.6h6.8"/></svg>`,
  trash:`<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"><path d="M5 7h14M10 7V5.6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V7M17.4 7l-.8 12a1 1 0 0 1-1 .95H8.4a1 1 0 0 1-1-.95L6.6 7"/><path d="M10 11v5.4M14 11v5.4"/></svg>`,
  speaker:`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M3 9v6h3.5l5.5 4.5v-15L6.5 9z" fill="currentColor" stroke="none"/><path d="M16 9a4.5 4.5 0 0 1 0 6" stroke-linecap="round"/><path d="M18.8 6a8.5 8.5 0 0 1 0 12" stroke-linecap="round"/></svg>`,
  search:`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20.5 20.5l-4.3-4.3"/></svg>`,
  starFill:`<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 3.6l2.55 5.17 5.7.83-4.13 4.02.98 5.68L12 16.99l-5.1 2.31.98-5.68L3.75 9.6l5.7-.83z"/></svg>`,
  starLine:`<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M12 3.6l2.55 5.17 5.7.83-4.13 4.02.98 5.68L12 16.99l-5.1 2.31.98-5.68L3.75 9.6l5.7-.83z"/></svg>`,
  download:`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M8 11l4 4 4-4"/><path d="M5 19h14"/></svg>`,
  upload:`<svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4M8 8l4-4 4 4"/><path d="M5 15v3a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 18v-3"/></svg>`,
};
```

index.html 抽屉/顶栏用的（内联，不经 JS）：
- 书架 shelf：`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M12 4.5c-2.6-1.6-6.4-1.6-9 0v15c2.6-1.6 6.4-1.6 9 0 2.6-1.6 6.4-1.6 9 0v-15c-2.6-1.6-6.4-1.6-9 0z"/><path d="M12 4.5v15"/></svg>`
- 添加 plus：`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"><circle cx="12" cy="12" r="8.4"/><path d="M12 8.2v7.6M8.2 12h7.6"/></svg>`
- 生词本 notebook：`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"><rect x="5" y="4" width="14" height="16" rx="1.8"/><path d="M9 4v16"/><path d="M12 8.6h4M12 12h4"/></svg>`
- 读物精选 news：`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linejoin="round" stroke-linecap="round"><rect x="3.5" y="5.5" width="13" height="14" rx="1.5"/><path d="M16.5 8.5h3a.5.5 0 0 1 .5.5v9a1.5 1.5 0 0 1-3 0"/><path d="M6 9.2h7M6 12.5h7M6 15.8h4.5"/></svg>`
- 口语复盘 speech：`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linejoin="round" stroke-linecap="round"><path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v7.3a1.5 1.5 0 0 1-1.5 1.5h-7l-4.4 3.3v-3.3H5A1.5 1.5 0 0 1 3.5 14.3V7A1.5 1.5 0 0 1 5 5.5z"/><path d="M8 10.6v2.7M11 9.3v5.3M14 10.1v3.7M16.7 11v1.9"/></svg>`
- 设置 sliders：`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round"><path d="M4 8h9M17 8h3M4 16h3M11 16h9"/><circle cx="15" cy="8" r="2.3"/><circle cx="9" cy="16" r="2.3"/></svg>`
- 错题本 clipboard：`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linejoin="round" stroke-linecap="round"><rect x="5" y="5" width="14" height="16" rx="1.8"/><path d="M9 5V3.8a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V5"/><path d="M8.5 10h7M8.5 13.5h7M8.5 17h4"/></svg>`

## 替换清单（file:line → emoji → 用哪个 SVG + 注意）

**index.html**
- L21、L53 `☰`（顶栏汉堡）→ hamburger SVG。
- L23 `📓`（顶栏生词本快捷）→ notebook SVG。
- L35 `📚`→shelf，L37 `📓`→notebook，L38 `📰`→news，L39 `🗣`→speech，L40 `⚙️`→sliders（抽屉 6 项的 `<span class="ic">…</span>` 内容整体换成对应 SVG）。
- L92 `📋`（错题本按钮）→ clipboard SVG。

**app.js**（顶部先加上面的 `SVG` 常量）
- L121、L137 `${it.mode === 'book' ? '📖' : '📄'}` → `${it.mode === 'book' ? SVG.book : SVG.doc}`（继续阅读卡 + 书架行的类型图标）。
- L140 `🗑`（书架行删除）→ `SVG.trash`。
- L177 `<div class="big">⬆</div>`（文件拖放区大箭头）→ `<div class="big">${SVG.upload}</div>`。
- L374、L393 sayBtn 内容 `🔊` → `SVG.speaker`。
- L417 `🎯 重点` 按钮 → `${SVG.starFill} 重点`（图标+文字，见下 CSS）。
- **L509 关键**：`btn.textContent = '🔊'` 会清掉 SVG →改成 `btn.innerHTML = SVG.speaker;`。若该 say 按钮 loading 态也是改 textContent，改为**加/去 `.loading` class**、内容始终保持 `SVG.speaker`（别用文字覆盖）。

**vocab.js**
- L29 `🔍` → `SVG.search`（需 import/共享：vocab.js 若拿不到 app.js 的 `SVG`，就在 vocab.js 顶部各自定义所需 SVG 常量，别跨文件依赖）。
- L47 `⬇ 导出 CSV` → `${SVG.download} 导出 CSV`。
- L154 `🎯`（vstar 标记）→ `SVG.starFill`。
- L159 `📄 ${esc(src)}` → `${SVG.doc} ${esc(src)}`（来源标签的小文档图标）。
- L181 `🎯 重点` 按钮 → `${SVG.starFill} 重点`。
- L183 `🗑` → `SVG.trash`。
- L201 toast `'已设为重点 🎯'` → `'已设为重点'`（**toast 文字里的 emoji 直接删掉**，不放 SVG）。

**review.js**（顶部同样自带所需 SVG 常量）
- L310 `🎯 重点` → `${SVG.starFill} 重点`。
- L477 `🎯`（mstar 标记）→ `SVG.starFill`。
- L483 `${isStar ? '🎯 重点' : '☆ 加重点'}` → `${isStar ? SVG.starFill + ' 重点' : SVG.starLine + ' 加重点'}`（实心/空心星切换）。
- L485 `🗑 删除` → `${SVG.trash} 删除`。

## CSS（style.css 末尾追加，务必让内联 SVG 在按钮里对齐、并继承正确颜色）
```css
/* 阶段6：内联 SVG 图标统一对齐 */
button svg, .ic svg, .ico svg, .say svg, .del svg { vertical-align: middle; }
/* 图标+文字按钮：给一点间距（重点/删除/导出/来源标签等） */
.disc-article-summary svg, .src svg { vertical-align: -3px; margin-right: 3px; }
```
- **颜色**：靠 currentColor 继承所在元素的 color。请核对并（若缺）补上：
  - 抽屉 `.ic` 已是 `color:var(--gold-deep)` ✓。
  - 书架行类型图标 `.ico`、继续阅读卡类型图标：设 `color:var(--gold-deep)`（若当前无 color）。
  - 删除按钮 `.del` 及各 `🗑→trash` 处：`color:var(--danger)`。
  - 重点 `🎯→starFill`/`☆→starLine` 处：`color:var(--star)`（琥珀）。
  - sayBtn `.say`、搜索 `.ic-s`、错题本 `.icon-btn`、导出 `#vExport`、来源 `.src`：用现有文字色即可（ink-soft / voc），保持和原来相近。
- 图标+文字按钮（如 `${SVG.starFill} 重点`）确保 svg 与文字间有约 5px 间距：可给这些按钮加 `display:inline-flex;align-items:center;gap:5px`（按现有按钮类补，别破坏布局）。

## 不要动
- `→ ↑ ✓ ✗ ✕ ✦`、字号 `A`、`.big` 之外的纯文字箭头。
- settings.js 的 `✓✗`（是校验状态字符，保留）。
- js/core/* 任何文件；assets/mobile；APK；git。

## 交付（贴证据）
1. 每个改动文件的 diff（重点贴 app.js 顶部 SVG 常量 + L509 的 innerHTML 改法 + 三处 sayBtn + 星标切换 + 各 🗑/📄）。
2. 一段自检：确认 ① L509 不再用 textContent 覆盖掉喇叭 SVG；② toast 里的 🎯 已删；③ 保留清单里的 `→✓✗✕` 未被误改。
3. 因这些文件不进 bundle，**不跑 npm build**；说明你没跑（对的）。
