import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const root = new URL('../../', import.meta.url);
const manifest = (file) => JSON.parse(readFileSync(new URL(file, root), 'utf8'));
const resolveFrom = (workspace, name) => createRequire(new URL(`${workspace}/package.json`, root))(`${name}/package.json`);

test('supported pinned Electron and Node-API SQLite resolve from the desktop workspace, not the optional backend driver', () => {
  const app = manifest('apps/desktop/package.json');
  assert.equal(resolveFrom('apps/desktop', 'electron').version, '45.4.1');
  assert.equal(app.build.electronVersion, '45.4.1');
  assert.equal(resolveFrom('apps/desktop', 'better-sqlite3').version, '13.2.0');
  assert.equal(app.build.nsis.deleteAppDataOnUninstall, false);
});
test('runtime frameworks and SDK peers use the verified fixed versions without blanket overrides', () => {
  assert.equal(resolveFrom('apps/portal', 'next').version, '16.4.6');
  assert.equal(resolveFrom('apps/backend', '@nestjs/core').version, '11.2.11');
  assert.equal(resolveFrom('apps/backend', '@types/express').version, '5.0.6');
  assert.equal(resolveFrom('apps/mcp', 'zod').version, '4.6.7');
  assert.equal(manifest('package.json').pnpm.overrides, undefined);
});
test('historical 0.4.0 evidence preserves raw original production audit and keeps production findings separate from all-dependency audit', () => {
  const before = manifest('docs/security/audit-before-production.json');
  const after = manifest('docs/security/audit-after-production.json');
  const all = manifest('docs/security/audit-after-all.json');
  assert.equal(before.metadata.vulnerabilities.critical, 4);
  assert.equal(before.metadata.vulnerabilities.high, 56);
  assert.equal(after.metadata.vulnerabilities.critical, 0);
  assert.equal(after.metadata.vulnerabilities.high, 0);
  assert.ok(all.metadata.vulnerabilities.critical > 0, 'do not conceal the pinned build-tool critical advisory');
});

test('Linux defaults to ZIP and keeps AppImage disabled pending separate launcher acceptance', async () => {
  const app = manifest('apps/desktop/package.json');
  assert.deepEqual(app.build.linux.target, ['zip']);
  const safePackaging = createRequire(import.meta.url)('../../apps/desktop/packaging/safe-packaging.cjs');
  await assert.rejects(safePackaging({ electronPlatformName: 'linux', targets: [{ name: 'AppImage' }] }), /GHSA-7g7r/);
  await safePackaging({ electronPlatformName: 'linux', arch: 1, targets: [{ name: 'zip' }] }, async (options) => assert.equal(options.platform, 'linux'));
  await safePackaging({ electronPlatformName: 'win32', arch: 1, targets: [{ name: 'nsis' }] }, async (options) => assert.equal(options.platform, 'win32'));
});

test('current build tools use reviewed fixed releases and raw audits retain all residual moderate findings', () => {
  const app = manifest('apps/desktop/package.json');
  assert.equal(app.devDependencies['electron-builder'], '26.18.0');
  assert.equal(app.devDependencies['electron-builder-squirrel-windows'], '26.18.0');
  assert.equal(app.devDependencies['electron-vite'], '6.0.0');
  assert.equal(resolveFrom('apps/desktop', 'vite').version, '7.3.8');
  assert.equal(app.scripts.postinstall, 'node packaging/rebuild-native.cjs');
  assert.equal(app.build.npmRebuild, false); // paired with explicit scoped postinstall/beforePack rebuilds
  const before = manifest('docs/security/0.4.1/audit-before-all.json');
  const after = manifest('docs/security/0.4.1/audit-after-all.json');
  assert.equal(before.metadata.vulnerabilities.critical, 1);
  assert.equal(after.metadata.vulnerabilities.critical, 0); assert.equal(after.metadata.vulnerabilities.high, 0);
  assert.ok(after.metadata.vulnerabilities.moderate > 0, 'remaining moderate risks must not be erased');
});
