@echo off
title Eventify Platform - System Launcher
color 0A

echo =============================================
echo   EVENTIFY PLATFORM - SYSTEM LAUNCHER
echo   SWAPD 351 - Software Architecture
echo =============================================
echo.

:: Check Docker
echo [1/5] Checking Docker...
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo ERROR: Docker is not installed or not running!
    echo Please install Docker Desktop from https://www.docker.com/products/docker-desktop
    pause
    exit /b 1
)
echo       Docker OK

:: Check Docker Compose
docker-compose --version >nul 2>&1
if %errorlevel% neq 0 (
    docker compose version >nul 2>&1
    if %errorlevel% neq 0 (
        color 0C
        echo ERROR: Docker Compose not found!
        pause
        exit /b 1
    )
)
echo       Docker Compose OK
echo.

:: Check .env
echo [2/5] Checking environment file...
if not exist .env (
    echo       .env not found, copying from .env.example...
    copy .env.example .env >nul
    echo       WARNING: Edit .env with your Google OAuth2 credentials!
    echo       Open .env in a text editor and fill in GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET
    pause
)
echo       .env OK
echo.

:: Build and Start
echo [3/5] Building and starting all services (this may take a few minutes)...
echo.
docker-compose up --build -d 2>&1
echo.

:: Wait for services
echo [4/5] Waiting for services to initialize...
timeout /t 15 /nobreak >nul

:: Health Checks
echo.
echo [5/5] Running health checks...
echo.
echo =============================================
echo   SERVICE STATUS
echo =============================================

:: Function to check health
for %%s in (
    "API Gateway|http://localhost:3000/health"
    "Event Service|http://localhost:5001/health"
    "Chat Service|http://localhost:3002/health"
    "Notification Service|http://localhost:5002/health"
) do (
    for /f "tokens=1,2 delims=|" %%a in (%%s) do (
        curl -s -o nul -w "%%{http_code}" %%b > temp_status.txt 2>nul
        set /p STATUS=<temp_status.txt
        if "!STATUS!"=="200" (
            echo   [OK]   %%a
        ) else (
            echo   [WAIT] %%a - still starting...
        )
    )
)
del temp_status.txt 2>nul

echo.
echo =============================================
echo   ACCESS URLS
echo =============================================
echo.
echo   Frontend:           http://localhost:3080
echo   API Gateway:        http://localhost:3000
echo   RabbitMQ Dashboard: http://localhost:15672  (guest/guest)
echo   Grafana:            http://localhost:3030   (admin/admin)
echo   Prometheus:         http://localhost:9090
echo   OpenSearch:         http://localhost:9200
echo   OpenSearch Dash:    http://localhost:5601
echo.
echo =============================================
echo   CONTAINER STATUS
echo =============================================
echo.
docker ps --filter "name=eventify" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo.
echo =============================================
echo Press any key to open the frontend in your browser...
pause >nul
start http://localhost:3080

echo.
echo =============================================
echo   LIVE LOG MONITOR (Ctrl+C to stop)
echo =============================================
echo.
docker-compose logs -f --tail=20
