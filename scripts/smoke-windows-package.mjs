// Run only on an isolated Windows CI runner, never an installed user application.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { assertWindowsPackaging } from './assert-windows-packaging.mjs';

export function peMachine(bytes) {
  assert.equal(bytes.subarray(0, 2).toString(), 'MZ', 'DOS signature');
  const offset = bytes.readUInt32LE(0x3c);
  assert.equal(bytes.subarray(offset, offset + 4).toString(), 'PE\0\0', 'PE signature');
  return bytes.readUInt16LE(offset + 4);
}

export function smokeWindowsPackage() {
  assert.equal(process.platform, 'win32', 'This smoke must actually run on Windows');
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const pkg = JSON.parse(readFileSync(join(root, 'apps/desktop/package.json'), 'utf8'));
  const release = join(root, 'apps/desktop/release');
  const unpacked = join(release, 'win-unpacked');
  const exe = join(unpacked, 'ZhiCang.exe');
  assert.equal(peMachine(readFileSync(exe)), 0x8664, 'Packaged Electron must be AMD64');
  const installer = `ZhiCang-Setup-${pkg.version}-x64.exe`;
  const installerBytes = readFileSync(join(release, installer));
  // The NSIS bootstrap itself may be x86; the Electron payload is checked above.
  const installerMachine = peMachine(installerBytes);
  assert.ok([0x14c, 0x8664].includes(installerMachine), 'NSIS PE architecture');
  const guard = assertWindowsPackaging();
  const temp = mkdtempSync(join(tmpdir(), 'zhicang-native-smoke-'));
  try {
    const script = join(temp, 'smoke.cjs');
    const resultPath = join(temp, 'result.json');
    writeFileSync(script, `
const assert = require('node:assert/strict');
const {createRequire} = require('node:module');
const {join} = require('node:path');
const {writeFileSync} = require('node:fs');
const [appDir, temp, version, electronVersion] = process.argv.slice(2);
const appRequire = createRequire(join(appDir, 'resources', 'app.asar', 'package.json'));
assert.equal(appRequire('./package.json').version, version);
assert.equal(process.versions.electron, electronVersion);
assert.equal(process.arch, 'x64');
assert.equal(process.platform, 'win32');
assert.equal(appRequire('better-sqlite3/package.json').version, '13.2.0');
const SQLite = appRequire('better-sqlite3');
const filename = join(temp, 'persistence.sqlite');
let db = new SQLite(filename);
db.exec('CREATE TABLE smoke (id INTEGER PRIMARY KEY, value TEXT NOT NULL)');
db.prepare('INSERT INTO smoke(value) VALUES (?)').run('免费、本地、无注册码');
db.close();
db = new SQLite(filename);
assert.equal(db.prepare('SELECT value FROM smoke WHERE id=1').pluck().get(), '免费、本地、无注册码');
assert.equal(db.pragma('integrity_check', {simple:true}), 'ok');
db.close();
writeFileSync(join(temp, 'result.json'), JSON.stringify({version, electron:process.versions.electron, sqlitePackage:'13.2.0', arch:process.arch, platform:process.platform, persistence:true, integrityCheck:'ok'}));
`);
    const child = spawnSync(exe, [script, unpacked, temp, pkg.version, pkg.build.electronVersion], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', APPDATA: temp, LOCALAPPDATA: temp },
      cwd: temp, encoding: 'utf8', timeout: 120_000, windowsHide: true,
    });
    if (child.error) throw child.error;
    assert.equal(child.status, 0, `Packaged native smoke failed (${child.signal}): ${child.stderr}\n${child.stdout}`);
    const runtime = JSON.parse(readFileSync(resultPath, 'utf8'));
    const provenance = { commit: process.env.GITHUB_SHA || null, runUrl: process.env.GITHUB_RUN_ID ? `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null,
      runtime, guard, installer: { name: installer, bytes: installerBytes.length, sha256: createHash('sha256').update(installerBytes).digest('hex'), peMachine: installerMachine },
      limitations: ['No installer execution or upgrade/uninstall test', 'No GUI acceptance test', 'Unsigned installer; no code-signing acceptance'] };
    writeFileSync(join(release, 'BUILD-PROVENANCE.json'), JSON.stringify(provenance, null, 2) + '\n');
    console.log(JSON.stringify(provenance, null, 2));
  } finally { rmSync(temp, { recursive: true, force: true }); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) smokeWindowsPackage();
