@echo off
setlocal
cd /d "%~dp0"
%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-SWTB17-PR85-Local-QA.ps1"
if errorlevel 1 (
 echo.
 echo SWTB17 PR85 local QA startup failed. Please share only the non-sensitive error code.
 pause
)
