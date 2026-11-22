// 与桌面端本地桥接服务通信的公共逻辑（Chrome / Firefox 通用）
const DEFAULT_PORT = 38121;

function getConfig() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(['bridgePort', 'bridgeToken'], (r) => {
        resolve({
          port: Number(r && r.bridgePort) || DEFAULT_PORT,
          token: (r && r.bridgeToken) || '',
        });
      });
    } catch {
      resolve({ port: DEFAULT_PORT, token: '' });
    }
  });
}

// 桥接需要访问令牌：附带 X-Zhicang-Token 头
function authHeaders(token, extra) {
  const h = Object.assign({}, extra || {});
  if (token) h['X-Zhicang-Token'] = token;
  return h;
}

async function ping() {
  const { port, token } = await getConfig();
  if (!token) throw new Error('请先在扩展选项中填写桌面访问令牌');
  const res = await fetch(`http://127.0.0.1:${port}/api/recent?limit=1`, { headers: authHeaders(token), signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(res.status === 401 ? '访问令牌无效，请更新扩展选项' : '桌面连接失败 HTTP ' + res.status);
  const data = await res.json();
  if (!data || !Array.isArray(data.items)) throw new Error('不是有效的智藏桌面桥接响应');
  return { ok: true };
}

async function capture(payload) {
  const { port, token } = await getConfig();
  const res = await fetch(`http://127.0.0.1:${port}/api/capture`, {
    signal: AbortSignal.timeout(10000),
    method: 'POST',
    headers: authHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  if (res.status === 401) throw new Error('访问令牌无效，请从桌面设置重新复制到扩展选项');
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`保存失败 ${res.status}: ${t}`);
  }
  return res.json();
}

async function captureBatch(urls) {
  const { port, token } = await getConfig();
  const res = await fetch(`http://127.0.0.1:${port}/api/capture/batch`, {
    signal: AbortSignal.timeout(10000),
    method: 'POST',
    headers: authHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ urls }),
  });
  if (res.status === 401) throw new Error('访问令牌无效，请从桌面设置重新复制到扩展选项');
  if (!res.ok) throw new Error('批量保存失败 HTTP ' + res.status);
  return res.json();
}

// 抓取当前标签页正文 HTML（用于离线存档）
function grabPageContent(tabId) {
  return new Promise((resolve) => {
    try {
      if (chrome.scripting && chrome.scripting.executeScript) {
        chrome.scripting.executeScript(
          {
            target: { tabId },
            func: () => {
              const clone = document.cloneNode(true);
              clone.querySelectorAll('script,noscript,iframe').forEach((n) => n.remove());
              const body = clone.querySelector('article') || clone.querySelector('main') || clone.body;
              return body ? body.innerHTML.slice(0, 400000) : '';
            },
          },
          (results) => {
            resolve((results && results[0] && results[0].result) || '');
          },
        );
      } else if (chrome.tabs && chrome.tabs.executeScript) {
        // Firefox MV2 回退
        chrome.tabs.executeScript(
          tabId,
          {
            code:
              "(function(){var b=document.querySelector('article')||document.querySelector('main')||document.body;return b?b.innerHTML.slice(0,400000):'';})()",
          },
          (results) => resolve((results && results[0]) || ''),
        );
      } else {
        resolve('');
      }
    } catch {
      resolve('');
    }
  });
}

function notify(title, message) {
  try {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title,
      message,
    });
  } catch {
    /* ignore */
  }
}
