@echo off
setlocal EnableExtensions DisableDelayedExpansion
set "SETUP_DIR=%~dp0"
set "TARGET=ZhiCang-Setup-0.3.0-x64.exe"
where.exe powershell.exe >nul 2>&1
if errorlevel 1 (
  echo ERROR: Windows PowerShell was not found. No installer was started.
  goto :failed
)
for %%F in (ZhiCangSetup-0.3.0.part01 ZhiCangSetup-0.3.0.part02 ZhiCangSetup-0.3.0.part03 ZhiCangSetup-0.3.0.part04) do (
  if not exist "%~dp0%%F" (
    echo ERROR: Missing %%F. Put all four parts beside this CMD file.
    goto :failed
  )
)
if exist "%~dp0%TARGET%" goto :verify
copy /b "%~dp0ZhiCangSetup-0.3.0.part01"+"%~dp0ZhiCangSetup-0.3.0.part02"+"%~dp0ZhiCangSetup-0.3.0.part03"+"%~dp0ZhiCangSetup-0.3.0.part04" "%~dp0%TARGET%" >nul
if errorlevel 1 (
  echo ERROR: Cannot combine files. Check disk space and folder permissions.
  goto :failed
)
:verify
powershell.exe -NoProfile -NonInteractive -Command "try { $p = Join-Path -Path $env:SETUP_DIR -ChildPath 'ZhiCang-Setup-0.3.0-x64.exe'; $h = (Get-FileHash -LiteralPath $p -Algorithm SHA256 -ErrorAction Stop).Hash; if ($h -ne '8537F44DE4B5D95A89FE14A7E011C0FAEFF84A01713D06AABF8A928D0771E247') { Write-Host 'ERROR: SHA256 mismatch. Do not run this EXE. Re-download all parts; move or rename an existing EXE before retrying.'; exit 1 }; exit 0 } catch { Write-Host ('ERROR: Cannot verify file: ' + $_.Exception.Message); exit 1 }"
if errorlevel 1 goto :failed
echo SUCCESS: Setup EXE SHA256 verified. No installer was started. Parts were kept.
pause
exit /b 0
:failed
echo No installer was started. Original parts were kept.
echo If a partial EXE exists, move or rename it before retrying.
pause
exit /b 1
