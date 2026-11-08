@echo off
title CampusFlow Mobile App (Expo)
echo ========================================================
echo   CampusFlow -- Bahria University Student Companion
echo   React Native Mobile App (Expo Go)
echo ========================================================
echo.
cd /d "%~dp0mobile"

echo Starting Metro bundler in LAN mode for Expo Go testing...
echo Scan the generated QR code using the Expo Go app on your Android phone.
echo (Make sure phone and computer are on the same Wi-Fi network: 192.168.1.xxx)
echo.
npx.cmd expo start --host lan
pause
