@echo off
title North Ledger
set PATH=C:\Program Files\nodejs;%PATH%
cd /d "%~dp0"
echo Starting North Ledger... this window must stay open while the app is running.
call npm run dev
pause
