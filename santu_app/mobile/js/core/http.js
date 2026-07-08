/**
 * http.js — 统一 HTTP POST 工具
 *
 * 在 Flutter WebView 里走原生桥（window.NativeHttp.post），
 * 在 Node 开发环境和普通浏览器里走 fetch（普通浏览器直连外部 API 会遇到 CORS，属预期）。
 *
 * 返回值统一为 { status: number, json: () => Promise<any>, text: () => Promise<string> }。
 */

/**
 * @param {string} url
 * @param {Record<string, string>} headersObj
 * @param {object|string} bodyObj — 若为 object 则自动 JSON.stringify
 * @returns {Promise<{status: number, json: () => Promise<any>, text: () => Promise<string>}>}
 */
export async function httpPost(url, headersObj, bodyObj) {
  const bodyStr = typeof bodyObj === "string" ? bodyObj : JSON.stringify(bodyObj);

  // ── 原生桥路径（Flutter WebView） ──────────────────────────────────────
  if (typeof window !== "undefined" && window.NativeHttp && typeof window.NativeHttp.post === "function") {
    const raw = await window.NativeHttp.post(url, headersObj, bodyStr);
    // raw: { status: number, body: string }
    const bodyText = typeof raw === "string" ? raw : (raw.body || "");
    const status = (raw && raw.status) ? raw.status : 200;
    return {
      status,
      text: async () => bodyText,
      json: async () => JSON.parse(bodyText),
    };
  }

  // ── fetch 路径（Node 开发 / 浏览器） ───────────────────────────────────
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headersObj },
    body: bodyStr,
  });
  return {
    status: resp.status,
    text: () => resp.text(),
    json: () => resp.json(),
  };
}

/**
 * httpGet — 抓网页 HTML（网址阅读用）
 *
 * Flutter WebView 里走原生桥（window.NativeHttp.get）绕开 CORS；
 * 浏览器/Node 里回落 fetch（跨域抓外站会遇到 CORS，属预期）。
 *
 * @param {string} url
 * @param {Record<string, string>} [headersObj]
 * @returns {Promise<{status: number, text: () => Promise<string>}>}
 */
export async function httpGet(url, headersObj = {}) {
  // ── 原生桥路径（Flutter WebView） ──────────────────────────────────────
  if (typeof window !== "undefined" && window.NativeHttp && typeof window.NativeHttp.get === "function") {
    const raw = await window.NativeHttp.get(url, headersObj);
    const bodyText = typeof raw === "string" ? raw : (raw.body || "");
    const status = (raw && raw.status) ? raw.status : 200;
    return { status, text: async () => bodyText };
  }

  // ── fetch 路径（Node 开发 / 浏览器） ───────────────────────────────────
  const resp = await fetch(url, { method: "GET", headers: headersObj });
  return { status: resp.status, text: () => resp.text() };
}
