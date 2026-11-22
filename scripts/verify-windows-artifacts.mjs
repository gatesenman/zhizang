// Inspect real Windows payloads without claiming they have run on a Windows machine.
import { createRequire } from 'node:module';
import { readFileSync, statSync, existsSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
const asar = require('@electron/asar');
const sevenZip = require('7zip-bin').path7za;
const root = fileURLToPath(new URL('../', import.meta.url));
const dir = resolve(process.argv[2] || join(root, 'apps/desktop/release'));
function pe(file, expected) {
  const b = readFileSync(file);
  assert.equal(b.toString('ascii', 0, 2), 'MZ', file);
  const offset = b.readUInt32LE(0x3c);
  assert.equal(b.toString('ascii', offset, offset + 4), 'PE\0\0', file);
  const machine = b.readUInt16LE(offset + 4);
  if (expected) assert.equal(machine, expected, file);
  const optional = offset + 24;
  const directories = optional + (b.readUInt16LE(optional) === 0x20b ? 112 : 96);
  const authenticodePresent = b.readUInt32LE(directories + 4 * 8 + 4) > 0;
  return { bytes: b.length, machine: '0x' + machine.toString(16), authenticodePresent };
}
const main = pe(join(dir, 'win-unpacked/ZhiCang.exe'), 0x8664);
const appArchive = join(dir, 'win-unpacked/resources/app.asar');
const list = asar.listPackage(appArchive).map((x) => x.replace(/^\//, ''));
for (const file of ['package.json', 'out/main/index.js', 'out/preload/index.js', 'out/renderer/index.html', 'node_modules/better-sqlite3/package.json', 'node_modules/bindings/bindings.js']) assert.ok(list.includes(file), 'Missing runtime file: ' + file);
const pkg = JSON.parse(asar.extractFile(appArchive, 'package.json'));
const sourcePackage = JSON.parse(readFileSync(join(root, 'apps/desktop/package.json'), 'utf8'));
assert.equal(pkg.version, sourcePackage.version, 'Packaged version must equal current desktop source version');
const native = join(dir, 'win-unpacked/resources/app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node');
assert.ok(existsSync(native));
const nativeInfo = pe(native, 0x8664);
assert.ok(nativeInfo.bytes > 500000);
assert.ok(readFileSync(native).includes(Buffer.from('node_register_module_v125')), 'SQLite Electron ABI 125 export missing');
const hashes = {};
const buildFiles = [];
function walkBuild(dir, relative = 'out') {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const name = relative + '/' + entry.name;
    if (entry.isDirectory()) walkBuild(join(dir, entry.name), name);
    else buildFiles.push(name);
  }
}
walkBuild(join(root, 'apps/desktop/out'));
for (const file of buildFiles) {
  const packaged = asar.extractFile(appArchive, file);
  assert.ok(packaged.equals(readFileSync(join(root, 'apps/desktop', file))), 'Packaged file does not match final local build: ' + file);
  hashes[file] = createHash('sha256').update(packaged).digest('hex');
}
const html = asar.extractFile(appArchive, 'out/renderer/index.html').toString();
for (const match of html.matchAll(/(?:src|href)="(\.\/assets\/[^"?]+)"/g)) assert.ok(list.includes('out/renderer/' + match[1].slice(2)), 'Missing renderer asset: ' + match[1]);
const result = { version: pkg.version, platform: 'Windows x64', runtime: main, sqliteNative: { ...nativeInfo, electronAbi: 125 }, packagedBuildSha256: hashes, asarEntries: list.length, artifacts: [], windowsExecution: 'NOT TESTED: static payload/archive inspection on Linux only', signed: false };
for (const filename of [`ZhiCang-Setup-${pkg.version}-x64.exe`, `ZhiCang-Portable-${pkg.version}-x64.exe`]) {
  const file = join(dir, filename);
  const info = pe(file);
  assert.ok(statSync(file).size > 20_000_000, 'Unexpectedly small package');
  const test = spawnSync(sevenZip, ['t', file], { encoding: 'utf8', timeout: 180000, maxBuffer: 8 * 1024 * 1024 });
  assert.equal(test.status, 0, test.stdout + test.stderr);
  result.artifacts.push({ name: filename, ...info, archiveIntegrity: '7za test passed' });
}
writeFileSync(join(root, 'docs/verification/windows/ARTIFACT-VERIFICATION.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
