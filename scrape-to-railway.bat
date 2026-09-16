@echo off
echo ============================================
echo  Stellars CRM - Local Scraper
echo ============================================
echo.
cd /d D:\Stellars-CRM

set /p NICHE="Niche (e.g., Pest Control): "
set /p CITY="City (e.g., Houston): "
set /p STATE="State (e.g., TX): "
set /p GOAL="Goal count (e.g., 25): "
set /p GOALTYPE="Goal type (no_website/outdated/all): "

echo.
echo Starting scraper...
echo Niche: %NICHE%
echo City: %CITY%, %STATE%
echo Goal: %GOAL% %GOALTYPE% leads
echo.

node batch-scrape.js "%NICHE%" "%CITY%" "%STATE%" "%GOAL%" "%GOALTYPE%"

echo.
echo Done! Open http://localhost:3000 and check Leads tab.
pause
