@echo off
title WarrantyWise — Personal Warranty & Repair Tracker
echo =======================================================
echo   Starting WarrantyWise Application Server...
echo =======================================================

set PATH=d:\ALL PRACTICE CODES\nodejs;%PATH%
cd /d "%~dp0"

echo [1/2] Checking dependencies...
if not exist "backend\node_modules" (
    echo Installing backend dependencies...
    cd backend && npm install && cd ..
)

echo [2/2] Launching server on http://localhost:5000 ...
echo.
echo Demo Accounts:
echo   - Regular User : demo@warrantywise.com  (Password: Password123!)
echo   - Administrator: admin@warrantywise.com (Password: Password123!)
echo.
echo Press Ctrl+C to stop the server at any time.
echo =======================================================

node backend/server.js
pause

