@echo off
setlocal
cd /d "%~dp0"

curl.exe --noproxy "*" --silent --fail --max-time 1 http://127.0.0.1:4173/ >nul 2>&1
if errorlevel 1 (
  start "CityOS Dev Server" /min cmd.exe /d /k "npm.cmd run dev -- --host 127.0.0.1 --port 4173 --strictPort"
  timeout /t 3 /nobreak >nul
)

start "" "http://127.0.0.1:4173/"
endlocal
