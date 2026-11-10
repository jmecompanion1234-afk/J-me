@echo off
rem J-me: replace any engine already on the port with a fresh one, then open the switch.
rem Run "J-me.cmd --shared" to let a phone or tablet on the same Wi-Fi open the queue page too.
cd /d "%~dp0"
set HOST=127.0.0.1
if /i "%~1"=="--shared" set HOST=0.0.0.0
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8787 " ^| findstr LISTENING') do taskkill /PID %%p /F >nul 2>&1
start "J-me engine" /min node engine\src\main.ts --host %HOST%
timeout /t 3 >nul
start "" http://localhost:8787
