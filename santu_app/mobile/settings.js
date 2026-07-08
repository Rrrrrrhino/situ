/* 四土 · 手机版 设置（阅读偏好 / 讲解 AI Key / 朗读音色 / 同步导入导出 / 关于）
   classic script，共享 app.js 的全局 helper。 */
'use strict';

const LEVELS = [
  ['cet4', 'CET-4'], ['cet4-6', 'CET-4~6'], ['cet6', 'CET-6'],
  ['kaoyan', '考研'], ['ielts', '雅思'],
];

async function renderSettings() {
  openOverlay('ovSettings');
  const body = $('#settingsBody');
  body.innerHTML = '<div class="loading-line"><span class="spin"></span>载入设置…</div>';
  let cfg = {};
  try { cfg = await api('get_settings'); } catch (e) { /* 仍渲染本地偏好 */ }

  const provOpts = (cfg.providers || [{ id: 'deepseek' }]).map(p =>
    `<option value="${esc(p.id)}"${p.id === cfg.provider ? ' selected' : ''}>${esc(p.id)}</option>`).join('');
  const levelOpts = LEVELS.map(([v, l]) =>
    `<option value="${v}"${v === S.level ? ' selected' : ''}>${esc(l)}</option>`).join('');

  body.innerHTML = `
    <div class="set-sec">阅读</div>
    <div class="set-card">
      <div class="set-row"><div class="lab">英语水平<small>决定哪些词算生词</small></div>
        <div class="ctl"><select id="setLevel">${levelOpts}</select></div></div>
      <div class="set-row"><div class="lab">朗读口音</div>
        <div class="ctl"><div class="set-seg" id="setAccent">
          <button data-acc="uk" class="${S.accent === 'uk' ? 'active' : ''}">英音</button>
          <button data-acc="us" class="${S.accent === 'us' ? 'active' : ''}">美音</button>
        </div></div></div>
      <div class="set-row"><div class="lab">正文字号</div>
        <div class="ctl"><input type="range" class="range" id="setFs" min="15" max="23" step="1" value="${S.fontSize}"></div></div>
      <div class="fsize-demo" id="fsDemo">The frigid wind whispered through the dappled trees. 寒风掠过斑驳的树影。</div>
    </div>

    <div class="set-sec">讲解 AI</div>
    <div class="set-card">
      <div class="fld"><label>服务商</label><select id="setProvider">${provOpts}</select></div>
      <div class="fld"><label>API Key${cfg.has_key ? `（当前 ${esc(cfg.key_masked || '已设置')}）` : ''}</label>
        <input type="password" id="setKey" placeholder="${cfg.has_key ? '留空＝不修改' : (cfg.key_from_main ? '留空＝继续用主窗口的 key' : 'sk-…')}" autocomplete="off">
        ${!cfg.has_key && cfg.key_from_main ? '<div class="set-note" style="margin-top:4px">正在使用主窗口的 key（想用别的在这里单独填）</div>' : ''}</div>
      <div class="fld"><label>模型（留空＝默认）</label>
        <input type="text" id="setModel" value="${esc(cfg.model || '')}" placeholder="deepseek-v4-pro" autocomplete="off"></div>
    </div>
    <div class="set-btns">
      <button class="btn ghost" id="setTest">测试连接</button>
      <button class="btn" id="setSave">保存</button>
    </div>
    <div class="set-note" id="setStatus">${cfg.llm_enabled ? '✓ 讲解已就绪' : '· 还没配置可用的 Key'}</div>
    <div class="set-note">deepseek-chat 已是弱档别名，会被自动升级为 v4-pro</div>

    <div class="set-sec">复盘精批模型（可选，留空跟随上面的讲解 AI）</div>
    <div class="set-card">
      <div class="fld"><label>服务商</label><select id="setRevProvider">
        <option value="">（跟随讲解 AI）</option>${provOpts}</select></div>
      <div class="fld"><label>API Key${cfg.has_review_key ? `（当前 ${esc(cfg.review_key_masked || '已设置')}）` : ''}</label>
        <input type="password" id="setRevKey" placeholder="${cfg.has_review_key ? '留空＝不修改' : '留空＝跟随讲解 AI 的 Key'}" autocomplete="off"></div>
      <div class="fld"><label>模型（留空＝跟随）</label>
        <input type="text" id="setRevModel" value="${esc(cfg.review_model || '')}" placeholder="deepseek-v4-pro" autocomplete="off"></div>
      <div class="fld"><label>Base URL（留空＝跟随）</label>
        <input type="text" id="setRevBaseUrl" value="${esc(cfg.review_base_url || '')}" placeholder="https://api.deepseek.com/v1" autocomplete="off"></div>
    </div>
    <div class="set-btns"><button class="btn block" id="setSaveRev">保存复盘精批设置</button></div>
    <div class="set-note">口语复盘的检出/编辑用这里的模型；四项全留空则完全跟随上面「讲解 AI」的配置。</div>

    <div class="set-sec">朗读音色（MiniMax，可选）</div>
    <div class="set-card">
      <div class="fld"><label>MiniMax Key${cfg.has_mm_key ? `（当前 ${esc(cfg.mm_key_masked || '已设置')}）` : ''}</label>
        <input type="password" id="setMmKey" placeholder="${cfg.has_mm_key ? '留空＝不修改' : '整句朗读用；不填则只读单词'}" autocomplete="off"></div>
      <div class="fld"><label>GroupId</label>
        <input type="text" id="setMmGroup" value="${esc(cfg.mm_group || '')}" placeholder="MiniMax 控制台的 GroupId" autocomplete="off"></div>
    </div>
    <div class="set-btns"><button class="btn block" id="setSaveMm">保存音色设置</button></div>
    <div class="set-note">单词发音走有道（无需 Key）；整句 / 词组朗读需 MiniMax。Key 失效会在朗读时提示。</div>

    <div class="set-sec">语音转写（火山，可选）</div>
    <div class="set-card">
      <div class="fld"><label>App ID</label>
        <input type="text" id="setVolcId" value="${esc(cfg.volc_appid || '')}" placeholder="火山语音控制台的 App ID" autocomplete="off"></div>
      <div class="fld"><label>Access Token${cfg.has_volc ? `（当前 ${esc(cfg.volc_token_masked || '已设置')}）` : ''}</label>
        <input type="password" id="setVolcTok" placeholder="${cfg.has_volc ? '留空＝不修改' : '录音转文字用；不填则录音功能不可用'}" autocomplete="off"></div>
      <div class="fld"><label>转写热词（常用专有名词，每行一个）</label>
        <textarea id="setVolcHotwords" rows="4" placeholder="Fable 5&#10;Sesame&#10;DeepSeek&#10;Anthropic&#10;casual talk" autocomplete="off">${esc(cfg.volc_hotwords || '')}</textarea></div>
    </div>
    <div class="set-btns"><button class="btn block" id="setSaveVolc">保存语音转写设置</button></div>
    <div class="set-note">口语复盘里的「🎤 录音」用这个把你说的英文转成文字。用的是火山「大模型录音文件识别」，录完整段一次转写。</div>

    <div class="set-sec">生词本同步（坚果云手动兜底）</div>
    <div class="set-card">
      <div class="set-row"><div class="lab">导出生词本<small>下载 global.json，传到云盘备份</small></div>
        <div class="ctl"><button class="btn ghost sm" id="setExport">导出</button></div></div>
      <div class="set-row"><div class="lab">导入生词本<small>从云盘下载后选取，合并进本机</small></div>
        <div class="ctl"><button class="btn ghost sm" id="setImportBtn">导入</button>
          <input type="file" id="setImport" accept=".json,application/json" style="display:none"></div></div>
    </div>
    <div class="set-note">放进坚果云同步文件夹，桌面 / 手机各端导入即可对齐。整库导入按 key 合并（保留较多点击数、星标、掌握、来源）。</div>

    <div class="set-sec">关于</div>
    <div class="set-note">四土 · 手机版 — 点词即讲、读完即记的英文阅读器。<br>
      与桌面版共享同一份生词本（<code>~/Documents/situ/vocab</code>）。<br>
      添加到主屏即可像 App 一样使用。</div>
    <div style="height:24px"></div>`;

  wireSettings(body);
}
window.renderSettings = renderSettings;

function wireSettings(body) {
  // 阅读偏好（纯本地）
  $('#setLevel', body).onchange = e => { S.level = e.target.value; localStorage.setItem('situ_level', S.level); toast('水平已设为 ' + e.target.options[e.target.selectedIndex].text); };
  $$('#setAccent button', body).forEach(b => b.onclick = () => {
    $$('#setAccent button', body).forEach(x => x.classList.toggle('active', x === b));
    S.accent = b.dataset.acc; localStorage.setItem('situ_accent', S.accent);
  });
  const fs = $('#setFs', body), demo = $('#fsDemo', body);
  const applyDemo = () => { demo.style.fontSize = fs.value + 'px'; };
  applyDemo();
  fs.oninput = () => { S.fontSize = +fs.value; localStorage.setItem('situ_fs', fs.value); applyFontSize(); applyDemo(); };

  // 讲解 AI
  $('#setTest', body).onclick = async () => {
    const st = $('#setStatus', body); st.textContent = '测试中…';
    try {
      const r = await api('test_settings', { provider: $('#setProvider', body).value, api_key: $('#setKey', body).value.trim(), model: $('#setModel', body).value.trim() });
      st.textContent = (r.ok ? '✓ ' : '✗ ') + (r.message || '');
    } catch (e) { st.textContent = '✗ ' + e.message; }
  };
  $('#setSave', body).onclick = async () => {
    const st = $('#setStatus', body); st.textContent = '保存中…';
    try {
      const r = await api('save_settings', { provider: $('#setProvider', body).value, api_key: $('#setKey', body).value.trim(), model: $('#setModel', body).value.trim() });
      st.textContent = r.ok ? (r.llm_enabled ? '✓ 已保存，讲解就绪' : '已保存（Key 似乎仍无效）') : ('✗ ' + (r.error || '保存失败'));
      if (r.ok) { $('#setKey', body).value = ''; toast('设置已保存'); }
    } catch (e) { st.textContent = '✗ ' + e.message; }
  };

  // 复盘精批模型
  const revBtn = $('#setSaveRev', body);
  if (revBtn) revBtn.onclick = async () => {
    try {
      const r = await api('save_settings', {
        review_provider: $('#setRevProvider', body).value,
        review_api_key: $('#setRevKey', body).value.trim(),
        review_model: $('#setRevModel', body).value.trim(),
        review_base_url: $('#setRevBaseUrl', body).value.trim(),
      });
      if (r.ok) { $('#setRevKey', body).value = ''; toast('复盘精批设置已保存'); }
      else toast(r.error || '保存失败');
    } catch (e) { toast('保存失败'); }
  };

  // 语音转写（火山）
  const volcBtn = $('#setSaveVolc', body);
  if (volcBtn) volcBtn.onclick = async () => {
    try {
      const hw = $('#setVolcHotwords', body);
      const r = await api('save_settings', {
        volc_appid: $('#setVolcId', body).value.trim(),
        volc_token: $('#setVolcTok', body).value.trim(),
        // 热词按原样存（含换行）；允许清空覆盖，故始终随保存带上
        volc_hotwords: hw ? hw.value : '',
      });
      if (r.ok) { $('#setVolcTok', body).value = ''; toast('语音转写设置已保存'); }
      else toast(r.error || '保存失败');
    } catch (e) { toast('保存失败'); }
  };

  // MiniMax
  $('#setSaveMm', body).onclick = async () => {
    try {
      const r = await api('save_settings', { minimax_key: $('#setMmKey', body).value.trim(), minimax_group: $('#setMmGroup', body).value.trim() });
      if (r.ok) { $('#setMmKey', body).value = ''; toast('音色设置已保存'); }
      else toast(r.error || '保存失败');
    } catch (e) { toast('保存失败'); }
  };

  // 同步
  $('#setExport', body).onclick = () => {
    const a = document.createElement('a');
    a.href = '/api/vocab_export'; a.download = 'situ-vocab-global.json';
    document.body.appendChild(a); a.click(); a.remove();
    toast('已开始下载生词本');
  };
  $('#setImportBtn', body).onclick = () => $('#setImport', body).click();
  $('#setImport', body).onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = async () => {
      try {
        const r = await api('vocab_import', { data: rd.result, mode: 'merge' });
        toast(r.ok ? `已合并，共 ${r.count} 条` : (r.error || '导入失败'));
      } catch (err) { toast('导入失败：' + err.message); }
    };
    rd.readAsText(f);
  };
}
