@echo off
setlocal

set "SHORTCUT_PATH=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\LanBox Startup.lnk"

if exist "%SHORTCUT_PATH%" (
  del "%SHORTCUT_PATH%"
  echo LanBox startup shortcut removed.
) else (
  echo Startup shortcut not found.
)
