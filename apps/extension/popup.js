const statusEl = document.getElementById('status');

function setStatus(text, cls) {
  statusEl.textContent = text;
  statusEl.className = 'status' + (cls ? ' ' + cls : '');
}

function send(msg) {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
}

function activeTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs[0]));
  });
}

async function checkConn() {
  const r = await send({ type: 'ping' });
  if (r && r.ok) setStatus('已连接桌面端（令牌已验证）', 'ok');
  else setStatus('未连接：' + ((r && r.error) || '请启动桌面端后重试'), 'err');
}

document.getElementById('saveCurrent').addEventListener('click', async () => {
  const tab = await activeTab();
  if (!tab) return;
  setStatus('正在收藏…');
  const r = await send({ type: 'saveCurrent', tabId: tab.id, url: tab.url, title: tab.title });
  if (r && r.ok) setStatus(r.result.created ? '已收藏当前页' : '该页已在收藏中', 'ok');
  else setStatus('保存失败：' + (r && r.error), 'err');
});

document.getElementById('saveAll').addEventListener('click', async () => {
  setStatus('正在读取所有标签页…');
  chrome.tabs.query({ currentWindow: true }, async (tabs) => {
    const urls = tabs
      .map((t) => t.url)
      .filter((u) => u && /^https?:\/\//.test(u));
    const r = await send({ type: 'saveAllTabs', urls });
    if (r && r.ok) setStatus(`已收藏 ${r.result.created} 个，跳过 ${r.result.skipped} 个`, 'ok');
    else setStatus('保存失败：' + (r && r.error), 'err');
  });
});

document.getElementById('opt').addEventListener('click', (e) => {
  e.preventDefault();
  if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
});

checkConn();
