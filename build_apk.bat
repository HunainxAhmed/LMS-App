@echo off
title LMS ∞ - Android Standalone APK Build
cd /d "%~dp0mobile"

echo ========================================================
echo         LMS ∞ - Android Standalone APK Build
echo ========================================================
echo.
echo 1. EAS will build your APK with the new anime MHA aura icon
echo    and LMS ∞ branding.
echo.
echo 2. Once finished, Expo will output your direct APK download link!
echo.
echo ========================================================
echo.

call npx.cmd eas-cli build -p android --profile preview

echo.
echo ========================================================
echo Build process finished. Press any key to exit.
echo ========================================================
pause
