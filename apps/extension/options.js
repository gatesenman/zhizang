const portEl = document.getElementById('port');
const tokenEl = document.getElementById('token');
const savedEl = document.getElementById('saved');

chrome.storage.local.get(['bridgePort', 'bridgeToken'], (r) => {
  portEl.value = (r && r.bridgePort) || 38121;
  tokenEl.value = (r && r.bridgeToken) || '';
});

document.getElementById('save').addEventListener('click', () => {
  const port = Number(portEl.value);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) { savedEl.textContent = '端口须为 1024–65535'; return; }
  const token = (tokenEl.value || '').trim();
  chrome.storage.local.set({ bridgePort: port, bridgeToken: token }, () => {
    savedEl.textContent = '已保存';
    setTimeout(() => (savedEl.textContent = ''), 2000);
  });
});


document.getElementById('test').addEventListener('click', async () => {
  const status = document.getElementById('connection');
  status.textContent = '正在连接桌面端并验证令牌…';
  try {
    const port = Number(portEl.value);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('端口无效');
    const token = tokenEl.value.trim();
    if (!token) throw new Error('请从桌面设置复制访问令牌');
    const res = await fetch(`http://127.0.0.1:${port}/api/recent?limit=1`, { headers: { 'X-Zhicang-Token': token }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(res.status === 401 ? '令牌无效或已重置，请重新复制' : `桌面服务返回 HTTP ${res.status}`);
    const data = await res.json();
    if (!data || !Array.isArray(data.items)) throw new Error('不是有效的智藏桌面桥接响应');
    status.textContent = '桌面连接与令牌验证成功；请点击保存后使用收藏按钮。';
  } catch (e) { status.textContent = '连接失败：' + (e.message || String(e)) + '。确认桌面端运行且桥接已开启。'; }
});
