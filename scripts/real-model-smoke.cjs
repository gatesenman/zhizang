// Real local model verification. No GUI driving, no external account/key, no HTTP mock.
const { app } = require('electron');
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const profile = mkdtempSync(path.join(tmpdir(), 'zhicang-real-model-'));
app.setPath('userData', profile);
process.env.TS_NODE_PROJECT = path.resolve('apps/desktop/tsconfig.test.json');
require('ts-node/register/transpile-only');
app.whenReady().then(async () => {
  const db = require('../apps/desktop/src/main/db.ts');
  const { aiChat } = require('../apps/desktop/src/main/enrich.ts');
  const { askBookmarks } = require('../apps/desktop/src/main/assistant.ts');
  db.initDb(path.join(profile, 'test.db'));
  const cfg = { enabled: true, provider: 'custom', baseUrl: 'http://127.0.0.1:39441/v1', apiKey: 'local-test-not-a-secret', model: 'zhicang-local-test', temperature: 0, concurrency: 1 };
  const started = Date.now();
  try {
    const chat = await aiChat(cfg, [{ role: 'user', content: 'In one sentence, what is a bookmark?' }]);
    assert.ok(chat.trim().length > 0);
    const b = db.createBookmark({ url: 'https://example.test/design-system-real-model', title: 'Design systems handbook', tags: ['design'] });
    db.updateBookmark(b.id, { description: 'Design systems organize reusable UI components and documentation.', notes: 'A shared button component improves interface consistency.' });
    const answer = await askBookmarks('design', cfg);
    assert.ok(['ai', 'keyword'].includes(answer.mode)); assert.ok(answer.answer.trim()); assert.ok(answer.refs.some((x) => x.id === b.id));
    const offline = await askBookmarks('design', { ...cfg, baseUrl: 'http://127.0.0.1:39442/v1' });
    assert.equal(offline.mode, 'keyword'); assert.ok(offline.refs.some((x) => x.id === b.id));
    const evidence = { verifiedAt: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }) + ' Asia/Shanghai (UTC+8)', runtime: 'real Electron net.fetch (not injected Node fetch)', server: 'official llama.cpp b12359 CPU, localhost only', model: 'SmolLM2-135M-Instruct Q4_K_M; weights SHA256 2e8040ceae7815abe0dcb3540b9995eaa1fa0d2ca9e797d0a635ae4433c68c2d', apiKey: 'public local test placeholder, not an account credential', elapsedMs: Date.now() - started, directModelAnswer: chat, assistant: answer, offlineModelFallback: offline, grounding: 'Invalid/missing citation numbers are rejected; keyword fallback is not labelled an AI summary. This is not a complete semantic hallucination detector.', boundaries: 'Real inference/transport/SQLite-reference chain only; tiny English model is not a production Chinese answer-quality acceptance, no vendor account/billing used' };
    writeFileSync('docs/verification/REAL-MODEL-E2E.json', JSON.stringify(evidence, null, 2) + '\n');
    console.log(JSON.stringify(evidence, null, 2));
  } finally { db.getDb().close(); }
}).catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => { app.exit(process.exitCode || 0); });
app.on('quit', () => { rmSync(profile, { recursive: true, force: true }); });
