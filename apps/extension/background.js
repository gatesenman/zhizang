/* global capture, captureBatch, grabPageContent, notify */
try {
  importScripts('common.js');
} catch {
  /* Firefox MV2 通过 manifest background.scripts 加载 common.js，此处忽略 */
}

function setupMenus() {
  try {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: 'zc-save-page',
        title: '收藏此页到 智藏 ZhiCang',
        contexts: ['page'],
      });
      chrome.contextMenus.create({
        id: 'zc-save-link',
        title: '收藏此链接到 智藏 ZhiCang',
        contexts: ['link'],
      });
      chrome.contextMenus.create({
        id: 'zc-save-selection',
        title: '剪藏选中内容到 智藏 ZhiCang',
        contexts: ['selection'],
      });
    });
  } catch {
    /* ignore */
  }
}

chrome.runtime.onInstalled.addListener(setupMenus);
chrome.runtime.onStartup && chrome.runtime.onStartup.addListener(setupMenus);

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  try {
    if (info.menuItemId === 'zc-save-link' && info.linkUrl) {
      await capture({ url: info.linkUrl, title: info.linkUrl });
      notify('智藏 ZhiCang', '已收藏链接');
    } else if (info.menuItemId === 'zc-save-selection' && tab) {
      const html = await grabPageContent(tab.id);
      await capture({
        url: tab.url,
        title: tab.title,
        description: (info.selectionText || '').slice(0, 500),
        html,
      });
      notify('智藏 ZhiCang', '已剪藏选中内容（含来源）');
    } else if (tab) {
      const html = await grabPageContent(tab.id);
      await capture({ url: tab.url, title: tab.title, html });
      notify('智藏 ZhiCang', '已收藏当前页（含正文存档）');
    }
  } catch (e) {
    notify('智藏 ZhiCang 保存失败', String((e && e.message) || e).slice(0, 250) + '。请检查桌面端、访问令牌和端口。');
  }
});

// 供 popup 调用
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === 'ping') {
        const r = await (typeof ping === 'function' ? ping() : Promise.reject());
        sendResponse({ ok: true, info: r });
      } else if (msg.type === 'saveCurrent') {
        const html = await grabPageContent(msg.tabId);
        const r = await capture({ url: msg.url, title: msg.title, html });
        sendResponse({ ok: true, result: r });
      } else if (msg.type === 'saveAllTabs') {
        const urls = msg.urls || [];
        const r = await captureBatch(urls);
        sendResponse({ ok: true, result: r });
      }
    } catch (e) {
      sendResponse({ ok: false, error: String((e && e.message) || e) });
    }
  })();
  return true; // async
});
