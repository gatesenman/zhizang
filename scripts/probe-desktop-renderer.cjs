// Only for an isolated app explicitly launched with a temporary loopback debugger.
const assert = require('node:assert/strict');
const { writeFileSync } = require('node:fs');
(async () => {
  const [port, action, value, screenshot] = process.argv.slice(2);
  assert.match(port, /^\d{1,5}$/);
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const target = targets.find((item) => item.type === 'page' && item.url.startsWith('file:') && item.url.includes('/out/renderer/index.html'));
  assert.ok(target, 'isolated app page not ready');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  let next = 0;
  const pending = new Map();
  ws.addEventListener('message', ({ data }) => { const message = JSON.parse(String(data)); const p = pending.get(message.id); if (p) { pending.delete(message.id); message.error ? p.reject(Error(JSON.stringify(message.error))) : p.resolve(message.result); } });
  const call = (method, params) => new Promise((resolve, reject) => { const id = ++next; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
  const expression = action === 'create' ? `(async()=>{
    const api=window.api; const version=await api.app.version();
    const created=await api.bookmarks.create({url:'https://round10.example.test/packaged',title:'打包主线夹具',tags:['package-smoke']});
    const id=created.bookmark.id; const categories=await api.categories.list();
    if(categories.length) await api.bookmarks.move([id],categories[0].id);
    await api.bookmarks.addTag([id],'smoke-organized');
    const saved=await api.bookmarks.saveNotes(id,'打包复用测试',''); if(saved.conflict) throw Error('unexpected notes conflict');
    const query=await api.bookmarks.query({keyword:'打包复用测试'}); if(!query.items.some(b=>b.id===id)) throw Error('search did not find persisted notes');
    await api.bookmarks.visit(id); return {version,id,checks:['guarded main-frame IPC','collect/organize/note CAS/search/visit']};
  })()` : `(async()=>{
    const api=window.api; const id=${JSON.stringify(Number(value))}; const version=await api.app.version();
    const b=await api.bookmarks.get(id); if(b.notes!=='打包复用测试'||!b.tags.includes('smoke-organized')) throw Error('persistent bookmark mismatch');
    const snapshot=await api.snapshot.get(id); if(!snapshot||!snapshot.content.includes('offline package fixture')) throw Error('offline content missing');
    const answer=await api.ai.ask('打包复用测试'); if(answer.mode!=='keyword'||!answer.refs.some(ref=>ref.id===id)) throw Error('local reuse citation missing');
    return {version,id,checks:['offline snapshot read','no-key actual references','persisted notes/tags']};
  })()`;
  try {
    const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
    assert.equal(result.result.value.version, '0.4.1');
    if (screenshot) { const shot = await call('Page.captureScreenshot', { format: 'png' }); writeFileSync(screenshot, Buffer.from(shot.data, 'base64')); }
    console.log(JSON.stringify(result.result.value));
  } finally { ws.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
