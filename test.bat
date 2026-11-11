@echo off
title WarrantyWise — Integration Test Suite
echo =======================================================
echo   Running WarrantyWise Automated Test Suite...
echo =======================================================

set PATH=d:\ALL PRACTICE CODES\nodejs;%PATH%
cd /d "%~dp0"

node backend/tests/api.test.js
pause

