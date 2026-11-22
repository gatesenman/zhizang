import { openSync, closeSync, readSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
export const MAX_PART_BYTES = 24_000_000;
export function createSplitSetup(setup, out, version, partBytes = MAX_PART_BYTES) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid release version');
  if (!Number.isInteger(partBytes) || partBytes < 1 || partBytes > MAX_PART_BYTES) throw new Error('Invalid part size');
  const target = `ZhiCang-Setup-${version}-x64.exe`;
  if (basename(setup) !== target) throw new Error('Setup filename/version mismatch');
  mkdirSync(out, { recursive: true });
  const fd = openSync(setup, 'r'); const hash = createHash('sha256'); const parts = [];
  try {
    const buffer = Buffer.alloc(partBytes); let bytes;
    while ((bytes = readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      const name = `ZhiCangSetup-${version}.part${String(parts.length + 1).padStart(2, '0')}`;
      const data = buffer.subarray(0, bytes); hash.update(data); writeFileSync(join(out, name), data); parts.push(name);
    }
  } finally { closeSync(fd); }
  if (!parts.length) throw new Error('Empty Setup');
  const sha256 = hash.digest('hex');
  const ps = "try { Import-Module -Name ($PSHOME + '\\Modules\\Microsoft.PowerShell.Management\\Microsoft.PowerShell.Management.psd1') -ErrorAction Stop; Import-Module -Name ($PSHOME + '\\Modules\\Microsoft.PowerShell.Utility\\Microsoft.PowerShell.Utility.psd1') -ErrorAction Stop; $p = Join-Path -Path $env:SETUP_DIR -ChildPath '" + target + "'; $h = (Microsoft.PowerShell.Utility\\Get-FileHash -LiteralPath $p -Algorithm SHA256 -ErrorAction Stop).Hash; if ($h -ne '" + sha256.toUpperCase() + "') { Write-Host 'ERROR: SHA256 mismatch. Do not run this EXE. Move or rename the existing EXE and obtain the original parts again.'; exit 1 }; exit 0 } catch { Write-Host ('ERROR: Cannot verify file: ' + $_.Exception.Message); exit 1 }";
  const lines = ['@echo off', 'setlocal EnableExtensions DisableDelayedExpansion', 'set "SETUP_DIR=%~dp0"', `set "TARGET=${target}"`, 'set "PS_EXE=%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"', 'if not exist "%PS_EXE%" (', '  echo ERROR: Windows PowerShell was not found. No installer was started.', '  goto :failed', ')', `for %%F in (${parts.join(' ')}) do (`, '  if not exist "%~dp0%%F" (', '    echo ERROR: Missing %%F. Put every original part beside this CMD file.', '    goto :failed', '  )', ')', 'if exist "%~dp0%TARGET%" goto :verify', `copy /b ${parts.map((p) => `"%~dp0${p}"`).join('+')} "%~dp0%TARGET%" >nul`, 'if errorlevel 1 (', '  echo ERROR: Cannot combine files. Check free space and folder permissions.', '  goto :failed', ')', ':verify', `"%PS_EXE%" -NoProfile -NonInteractive -Command "${ps}"`, 'if not "%errorlevel%"=="0" goto :failed', 'echo SUCCESS: Setup SHA256 verified. No installer was started. Parts were kept.', 'if /I not "%~1"=="--no-pause" pause', 'exit /b 0', ':failed', 'echo No installer was started. Original parts were kept.', 'if /I not "%~1"=="--no-pause" pause', 'exit /b 1', ''];
  const cmd = lines.join('\r\n'); if ([...cmd].some((c) => c.charCodeAt(0) > 127)) throw new Error('CMD must be ASCII');
  const command = `JoinSetup-${version}.cmd`; writeFileSync(join(out, command), cmd, 'ascii');
  return { version, target, bytes: statSync(setup).size, sha256, parts, command };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , setup, output, version] = process.argv;
  if (!setup || !output || !version) throw new Error('Usage: node scripts/create-windows-split.mjs SETUP OUT VERSION');
  console.log(JSON.stringify(createSplitSetup(resolve(setup), resolve(output), version), null, 2));
}
