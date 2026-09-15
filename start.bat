@echo off
echo Starting Stellars CRM...
echo.
cd /d D:\Stellars-CRM
echo Installing dependencies...
call npm install --production 2>nul
echo.
echo Starting server on http://localhost:3000
echo.
node server.js
pause
