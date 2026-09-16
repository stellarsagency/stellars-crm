@echo off
echo ============================================
echo  Stellars CRM - Local Scraper (Pushes to Railway)
echo ============================================
echo.
cd /d D:\Stellars-CRM

set /p NICHE="Niche (e.g., Pest Control): "
set /p CITY="City or state option (e.g., __whole_usa): "
set /p STATE="State (e.g., TX or ALL): "
set /p GOAL="Goal count (e.g., 50): "
set /p GOALTYPE="Goal type (no_website/outdated/all): "

echo.
echo Starting scraper...
echo Niche: %NICHE%
echo City: %CITY%
echo State: %STATE%
echo Goal: %GOAL% %GOALTYPE% leads
echo Remote: https://stellars-crm-production.up.railway.app
echo.

node batch-scrape.js "%NICHE%" "%CITY%" "%STATE%" "%GOAL%" "%GOALTYPE%" --remote https://stellars-crm-production.up.railway.app

echo.
echo Done! Check Railway dashboard for leads.
pause
