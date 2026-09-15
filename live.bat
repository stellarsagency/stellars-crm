@echo off
echo Starting server...
cd /d D:\Stellars-CRM
start /b node server.js
timeout /t 4 >nul
echo Starting live tunnel...
echo.
echo Give this link to your cold caller:
echo.
ssh -o StrictHostKeyChecking=no -R 80:localhost:3000 serveo.net
