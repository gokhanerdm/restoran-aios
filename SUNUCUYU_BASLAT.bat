@echo off
title Restoran AIOS Sunucu
cd /d "%~dp0"
echo Restoran AIOS sunucusu baslatiliyor...
echo Bu pencereyi KAPATMA - sunucu bu pencerede calisiyor.
echo.
echo PC'de:    http://localhost:3001
echo Telefonda: http://192.168.1.103:3001
echo.
call npm run dev -- -p 3001 -H 0.0.0.0
pause
