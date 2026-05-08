@echo off
setlocal
cd /d "%~dp0"

:loop
pythonw server.py
timeout /t 3 >nul
goto loop
@echo off
setlocal
cd /d "%~dp0"

:loop
pythonw server.py
timeout /t 3 >nul
goto loop
