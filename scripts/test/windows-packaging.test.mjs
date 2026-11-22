import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { assertWindowsPackaging, windowsBuilderLibrary } from '../assert-windows-packaging.mjs';
import { createSplitSetup, MAX_PART_BYTES } from '../create-windows-split.mjs';
const root = new URL('../../', import.meta.url);
test('actual pinned builder includes exact reviewed upstream backport', () => assert.equal(assertWindowsPackaging().builder, '24.13.3'));
test('pnpm persists the patch without unrelated dependency upgrades', () => {
  const pkg = JSON.parse(readFileSync(new URL('package.json', root)));
  assert.equal(pkg.pnpm.patchedDependencies['app-builder-lib@24.13.3'], 'patches/app-builder-lib@24.13.3.patch');
  assert.match(readFileSync(new URL('pnpm-lock.yaml', root), 'utf8'), /app-builder-lib@24\.13\.3\(patch_hash=/);
});
test('safe copy keeps fallback and scratch registers and frees non-null pointer', () => {
  const text = readFileSync(join(windowsBuilderLibrary(), 'templates/nsis/multiUser.nsh'), 'utf8');
  assert.match(text, /Push \$1\s+Push \$2\s+StrCpy \$2 0/);
  assert.match(text, /\$\{If\} \$2 != 0\s+System::Call 'OLE32::CoTaskMemFree\(p r2\)'\s+\$\{endif\}\s+Pop \$2\s+Pop \$1/);
  assert.match(text, /StrCpy \$0 "\$LocalAppData\\Programs"/);
});
test('split is byte-exact; command is ASCII CRLF and explicitly loads Windows hash module', () => {
  const dir = mkdtempSync(join(tmpdir(), 'zhicang split '));
  try {
    const setup = join(dir, 'ZhiCang-Setup-0.3.1-x64.exe'); const data = Buffer.alloc(4099, 0xa5); writeFileSync(setup, data);
    const out = join(dir, 'parts'); const result = createSplitSetup(setup, out, '0.3.1', 1024);
    assert.ok(Buffer.concat(result.parts.map((p) => readFileSync(join(out, p)))).equals(data));
    assert.equal(result.sha256, createHash('sha256').update(data).digest('hex'));
    const cmd = readFileSync(join(out, result.command)); assert.ok([...cmd].every((n) => n < 128));
    const text = cmd.toString(); assert.ok(!text.replaceAll('\r\n', '').includes('\n'));
    assert.match(text, /\$PSHOME \+ '\\Modules\\Microsoft.PowerShell.Utility/); assert.match(text, /Microsoft.PowerShell.Utility\\Get-FileHash/);
    assert.ok(text.includes('if not "%errorlevel%"=="0" goto :failed')); assert.match(text, /DisableDelayedExpansion/); assert.match(text, /set "SETUP_DIR=%~dp0"/); assert.match(text, /"%~dp0%TARGET%"/);
    assert.ok(!/ExecutionPolicy|Unblock-File|start |del |Remove-Item|NCRC/i.test(text));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('release command rejects unsafe version, wrong filename, oversized parts', () => {
  assert.equal(MAX_PART_BYTES, 24000000);
  assert.throws(() => createSplitSetup('', '', '0.3.1 & echo wrong'), /Invalid release/);
  assert.throws(() => createSplitSetup('wrong.exe', '', '0.3.1'), /mismatch/);
  assert.throws(() => createSplitSetup('', '', '0.3.1', 24000001), /part size/);
});
