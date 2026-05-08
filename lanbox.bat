@echo off

cd /d "%~dp0"

echo =========================
echo LanBox Auto Setup
echo =========================

echo Installing Python packages...
python -m pip install --upgrade pip
python -m pip install flask werkzeug zeroconf

echo.
echo Starting LanBox Server...
echo.

:loop
python server.py

echo.
echo Server stopped... restarting in 3 seconds
timeout /t 3 >nul
goto loop
