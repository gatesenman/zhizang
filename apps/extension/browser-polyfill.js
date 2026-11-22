// 兼容垫片：Firefox 下确保 chrome.* 可用（Firefox 同时提供 chrome 与 browser）。
if (typeof globalThis.chrome === 'undefined' && typeof globalThis.browser !== 'undefined') {
  globalThis.chrome = globalThis.browser;
}
