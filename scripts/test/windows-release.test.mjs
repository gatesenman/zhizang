import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { peMachine } from '../smoke-windows-package.mjs';

test('PE checks reject malformed input and distinguish NSIS stub from x64 payload', () => {
  const bytes = Buffer.alloc(128);
  assert.throws(() => peMachine(bytes), /DOS signature/);
  bytes.write('MZ'); bytes.writeUInt32LE(64, 0x3c);
  assert.throws(() => peMachine(bytes), /PE signature/);
  bytes.write('PE\0\0', 64); bytes.writeUInt16LE(0x8664, 68);
  assert.equal(peMachine(bytes), 0x8664);
  bytes.writeUInt16LE(0x14c, 68); assert.equal(peMachine(bytes), 0x14c);
});
test('artifact workflow preserves frozen install, native hook and explicit no-publish', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/release.yml', import.meta.url), 'utf8');
  assert.match(workflow, /os: windows-2022/);
  assert.match(workflow, /--frozen-lockfile/);
  assert.match(workflow, /electron-builder .* --publish never/);
  assert.match(workflow, /node scripts\/assert-windows-packaging.mjs/);
  assert.match(workflow, /node scripts\/smoke-windows-package.mjs/);
  assert.doesNotMatch(workflow, /GH_TOKEN|--ignore-scripts/);
  const pkg = JSON.parse(readFileSync(new URL('../../apps/desktop/package.json', import.meta.url)));
  assert.equal(pkg.build.beforePack, './packaging/safe-packaging.cjs');
  assert.equal(pkg.scripts.postinstall, 'node packaging/rebuild-native.cjs');
  assert.equal(pkg.repository.url, 'https://github.com/gatesenman/zhizang.git');
});
