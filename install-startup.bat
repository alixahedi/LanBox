@echo off
setlocal
cd /d "%~dp0"

set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT_PATH=%STARTUP_DIR%\LanBox Startup.lnk"
set "TARGET_VBS=%~dp0lanbox-startup.vbs"

if not exist "%TARGET_VBS%" (
  echo ERROR: lanbox-startup.vbs not found in project root.
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$w=New-Object -ComObject WScript.Shell; $s=$w.CreateShortcut('%SHORTCUT_PATH%'); $s.TargetPath='%SystemRoot%\System32\wscript.exe'; $s.Arguments='""%TARGET_VBS%""'; $s.WorkingDirectory='%~dp0'; $s.IconLocation='%SystemRoot%\System32\shell32.dll,13'; $s.Save()"

if exist "%SHORTCUT_PATH%" (
  echo LanBox startup shortcut installed:
  echo %SHORTCUT_PATH%
  echo.
  echo Next login, LanBox will start in background automatically.
) else (
  echo Failed to create startup shortcut.
  exit /b 1
)
