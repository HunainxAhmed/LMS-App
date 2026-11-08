@echo off
title CampusFlow Backend Test Suite
echo ========================================================
echo   CampusFlow -- Automated Backend Test Suite
echo ========================================================
echo.
cd /d "%~dp0backend"
.venv\Scripts\pytest -c pytest.ini tests -v
pause
