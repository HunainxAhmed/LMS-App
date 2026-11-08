@echo off
title CampusFlow - EAS Cloud APK Builder
cd /d "%~dp0mobile"

echo ========================================================
echo         CampusFlow - Android Standalone APK Build
echo ========================================================
echo.
echo 1. EAS will ask you to log in to your free Expo account.
echo    (Sign up free at https://expo.dev/signup if you haven't yet)
echo.
echo 2. When asked to generate an Android Keystore, select YES.
echo.
echo 3. EAS will build the APK in the cloud and provide a direct
echo    shareable download link for CampusFlow.apk!
echo.
echo ========================================================
echo.

npx eas-cli build -p android --profile preview

echo.
pause
