@echo off
title CampusFlow Web Preview (PC Browser)
echo ========================================================
echo   CampusFlow -- Bahria University Student Companion
echo   PC Web Browser Preview
echo ========================================================
echo.
cd /d "%~dp0mobile"

echo Starting Metro bundler for Web Browser testing...
echo Opening in default browser at http://localhost:8081...
echo.
npx.cmd expo start --web
pause
