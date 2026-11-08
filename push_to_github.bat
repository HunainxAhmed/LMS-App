@echo off
title Push CampusFlow to GitHub
cd /d "%~dp0"
set PATH=C:\Users\hunai\.mingit\cmd;C:\Users\hunai\.mingit\ucrt64\bin;%PATH%

echo ========================================================
echo  Pushing CampusFlow to github.com/HunainxAhmed/LMS-App
echo ========================================================
echo.
echo If a GitHub login window or browser tab opens, click "Authorize".
echo.

git push -u origin main

echo.
if %ERRORLEVEL% EQU 0 (
    echo ========================================================
    echo  SUCCESS! Your code is now live on GitHub!
    echo  Go back to Render and connect your repository.
    echo ========================================================
) else (
    echo.
    echo PUSH FAILED. If you prefer, generate a GitHub Token at:
    echo https://github.com/settings/tokens/new
    echo and paste it in chat.
)
echo.
pause
