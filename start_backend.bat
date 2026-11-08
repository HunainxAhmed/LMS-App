@echo off
title CampusFlow Backend Server
echo ========================================================
echo   CampusFlow -- Bahria University Student Companion
echo   FastAPI Backend Server (0.0.0.0:8000)
echo ========================================================
echo.
cd /d "%~dp0backend"

if not exist ".venv\Scripts\python.exe" (
    echo [ERROR] Virtual environment not found in backend\.venv
    echo Creating virtual environment...
    python -m venv .venv
    echo Installing dependencies...
    .venv\Scripts\pip install -r requirements.txt
    .venv\Scripts\playwright install chromium
)

echo Activating Python virtual environment...
call .venv\Scripts\activate.bat

echo Starting server on http://0.0.0.0:8000
echo Local Swagger API Docs: http://localhost:8000/api/v1/docs
echo Phone Access (Wi-Fi LAN): http://192.168.1.104:8000/api/v1
echo.
python run_backend.py
pause
