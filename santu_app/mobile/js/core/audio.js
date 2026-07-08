/**
 * audio.js — 单词 / 词组发音
 *
 * 端口自 app.py.get_audio / _download_minimax / _audio_youdao / _audio_minimax。
 *
 * 策略（照搬 app.py）：
 *   单词  → 有道优先（直接返回 URL，<audio> 可跨域播放，不走桥）；MiniMax 备用
 *   词组  → MiniMax 优先（httpPost 走桥，base64→dataURL）；有道备用
 *   未配置 MiniMax → 全部走有道
 *
 * accent→youdao type 映射照 app.py：uk→"1"，us→"2"
 */

import { httpPost } from "./http.js";
import { settingsGet } from "./store.js";

// accent→有道 type（照搬 app.py._YOUDAO_TYPE）
const YOUDAO_TYPE = { uk: "1", us: "2" };

// MiniMax voice（照搬 app.py._MINIMAX_VOICE）
const MINIMAX_VOICE = {
  uk: "English_expressive_narrator",
  us: "English_Trustworth_Man",
};

// MiniMax 错误码→提示（照搬 app.py._MINIMAX_ERR）
const MINIMAX_ERR = {
  1004: "MiniMax 鉴权失败，请到设置检查 key/GroupId",
  2049: "MiniMax key 已失效，请到设置更新（账号里的积分仍在新 key 上）",
  1008: "MiniMax 余额不足，请充值或更换 key",
  1002: "MiniMax 触发限流，请稍后再试",
};
const MINIMAX_FATAL = new Set([1004, 2049, 1008]);

// ── 内部：构造有道 dictvoice URL ──────────────────────────────────────────

function _youdaoUrl(word, accent) {
  const type = YOUDAO_TYPE[accent] || "1";
  return `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=${type}`;
}

// ── 内部：读取 MiniMax 凭证 ────────────────────────────────────────────────

async function _minimaxCreds() {
  const key = ((await settingsGet("minimax_key",   "")) || "").trim();
  const gid = ((await settingsGet("minimax_group", "")) || "").trim();
  return { key, gid };
}

// ── 内部：调 MiniMax TTS，返回 base64 dataURL 或 null ─────────────────────

let _mmLastErr = "";

async function _downloadMinimax(text, key, gid, accent = "uk") {
  const voiceId = MINIMAX_VOICE[accent] || MINIMAX_VOICE.uk;
  const url = `https://api.minimax.chat/v1/t2a_v2?GroupId=${encodeURIComponent(gid)}`;

  // 在末尾加句号防止末音节截断（照搬 app.py）
  let say = text.trim();
  if (say && !".?!".includes(say.slice(-1))) say = say + ".";

  const body = {
    model: "speech-02-hd",
    text: say,
    stream: false,
    language_boost: "English",
    english_normalization: true,
    voice_setting: { voice_id: voiceId, speed: 0.95, vol: 1.0, pitch: 0 },
    audio_setting: { sample_rate: 32000, bitrate: 128000, format: "mp3" },
  };

  for (let i = 0; i <= 2; i++) {
    try {
      const resp = await httpPost(url, { Authorization: "Bearer " + key }, body);
      const payload = await resp.json();
      const hexAudio = ((payload.data || {}).audio || "");
      if (hexAudio && hexAudio.length > 400) {
        _mmLastErr = "";
        // hex → Uint8Array → base64
        const bytes = new Uint8Array(hexAudio.length / 2);
        for (let j = 0; j < bytes.length; j++) {
          bytes[j] = parseInt(hexAudio.slice(j * 2, j * 2 + 2), 16);
        }
        const b64 = _uint8ToBase64(bytes);
        return "data:audio/mpeg;base64," + b64;
      }
      const sc = (payload.base_resp || {}).status_code;
      if (sc) {
        _mmLastErr = MINIMAX_ERR[sc] || `MiniMax 合成失败（code ${sc}）`;
        if (MINIMAX_FATAL.has(sc)) return null;
      }
    } catch (e) {
      _mmLastErr = "MiniMax 连接失败（网络或超时）";
      if (i < 2) await _sleep(500 * (i + 1));
    }
  }
  return null;
}

function _uint8ToBase64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function _sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── 公开：getAudio ─────────────────────────────────────────────────────────

/**
 * 端口 app.py.get_audio
 * @param {{word:string, accent?:"uk"|"us"}} args
 * @returns {Promise<{ok:boolean, data?:string, error?:string}>}
 *   data 可能是：
 *     - 有道 URL（直接给 <audio src>，跨域可播）
 *     - "data:audio/mpeg;base64,…"（MiniMax）
 */
export async function getAudio({ word = "", accent = "uk" } = {}) {
  word = (word || "").trim().toLowerCase();
  if (!word) return { ok: false, error: "缺少词" };

  const acc = (accent || "uk").toLowerCase() === "us" ? "us" : "uk";
  const isPhrase = word.includes(" ") || word.includes("-");

  // 桌面复盘窗：优先借用同进程原生 get_audio（/api/get_audio，用户真凭证 + 缓存 + 有道/MiniMax 全策略）。
  // 客户端引擎读的是本 WebView 的 IndexedDB 凭证——桌面复盘窗那侧常为空 → 词组退回有道、多半无音（用户实测）。
  // 服务器不可达/无此路由（纯手机 PWA）会 throw/非 ok → 自动落到下面的客户端引擎，手机行为不变。
  try {
    const resp = await httpPost("/api/get_audio", {}, { word, accent: acc });
    const r = JSON.parse(await resp.text());
    if (r && r.ok && r.data) { console.warn(`[audio] "${word}" ← server(native) 成功`); return { ok: true, data: r.data }; }
    console.warn(`[audio] "${word}" server 无结果（${(r && r.error) || "-"}）→ 落客户端引擎`);
  } catch (e) { console.warn(`[audio] "${word}" server 不可达 → 落客户端引擎`); }

  const { key: mmKey, gid: mmGid } = await _minimaxCreds();
  const mmOn = Boolean(mmKey && mmGid);

  // 构造尝试顺序（照搬 app.py.get_audio）；带 label 供点灯归因
  const attempts = [];
  const mm = () => _tryMinimax(word, mmKey, mmGid, acc); mm._label = "minimax";
  const yd = () => _tryYoudao(word, acc); yd._label = "youdao";
  if (mmOn && isPhrase) { attempts.push(mm, yd); }
  else if (mmOn) { attempts.push(yd, mm); }
  else { attempts.push(yd); }

  // 点灯：复盘窗发音无声属低可观测——记录 词/是否词组/MiniMax是否配了/每引擎结果，一键归因。
  console.warn(`[audio] getAudio word="${word}" isPhrase=${isPhrase} minimax=${mmOn ? "on" : "OFF"}`);
  for (const attempt of attempts) {
    const res = await attempt();
    if (res) { console.warn(`[audio] "${word}" ← ${attempt._label} 成功`); return { ok: true, data: res }; }
    console.warn(`[audio] "${word}" ✗ ${attempt._label} 无结果（_mmLastErr=${_mmLastErr || "-"}）`);
  }
  const err = mmOn && _mmLastErr ? _mmLastErr : "音频下载失败";
  console.warn(`[audio] "${word}" 全部引擎失败 → ${err}`);
  return { ok: false, error: err };
}

async function _tryYoudao(word, accent) {
  // 有道：直接返回 URL，前端 <audio> 可跨域播放，不用下载
  const url = _youdaoUrl(word, accent);
  // 验证 URL 可达（轻量 HEAD；桥环境下直接信任 URL）
  try {
    if (typeof fetch === "function") {
      const r = await fetch(url, { method: "HEAD" });
      if (r.ok) return url;
      return null;
    }
    // Node 环境（开发测试）：直接返回 URL，不做 HEAD
    return url;
  } catch {
    // fetch 失败（如 CORS HEAD blocked）但 URL 仍有效（<audio> 能播）
    return url;
  }
}

async function _tryMinimax(word, key, gid, accent) {
  return _downloadMinimax(word, key, gid, accent);
}
