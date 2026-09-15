@echo off
cd /d D:\Stellars-CRM
echo Starting server...
start /b node server.js
timeout /t 4 >nul
echo Starting tunnel...
npx localtunnel --port 3000
