@echo off
title Eventify - Shutdown
color 0C
echo =============================================
echo   STOPPING EVENTIFY PLATFORM
echo =============================================
echo.
cd /d "%~dp0"
docker-compose down
echo.
echo All services stopped.
pause
