# ============================================================
#  Eventify Platform - Run All Tests in Separate Windows
#  Usage:  cd to eventify-platform folder, then:
#          .\run-all-tests.ps1
# ============================================================

$base = Split-Path -Parent $MyInvocation.MyCommand.Definition

function Open-TestWindow($title, $color, $cmd) {
    Start-Process powershell -ArgumentList "-NoExit", "-Command", `
        "cd '$base'; `$Host.UI.RawUI.WindowTitle = '$title'; Write-Host '===========================================' -ForegroundColor $color; Write-Host ' $title' -ForegroundColor $color; Write-Host '===========================================' -ForegroundColor $color; $cmd"
}

Write-Host "Starting all test suites in separate windows..." -ForegroundColor White

Open-TestWindow "[1/8] RBAC Unit Tests"              "Cyan"    "docker exec eventify-platform-event-service-1 python -m pytest /tests/unit/test_rbac.py -v --tb=short"
Open-TestWindow "[2/8] Event Service Unit Tests"     "Cyan"    "docker exec eventify-platform-event-service-1 python -m pytest /tests/unit/test_event_service.py -v --tb=short"
Open-TestWindow "[3/8] Notification Unit Tests"      "Cyan"    "docker exec eventify-platform-notification-service-1 python -m pytest /tests/unit/test_notification_service.py -v --tb=short"
Open-TestWindow "[4/8] E2E Integration Tests"        "Yellow"  "docker exec -e BASE_URL=http://api-gateway:3000 eventify-platform-event-service-1 python -m pytest /tests/integration/test_e2e.py -v --tb=short"
Open-TestWindow "[5/8] API Gateway Jest"             "Green"   "docker exec eventify-platform-api-gateway-1 npm test"
Open-TestWindow "[6/8] Chat Service Jest"            "Green"   "docker exec eventify-platform-chat-service-1 npm test"
Open-TestWindow "[7/8] User Service Jest"            "Green"   "docker exec eventify-platform-user-service-1 npm test"
Open-TestWindow "[8/8] k6 Load Test (30s 50 VUs)"   "Magenta" "k6 run --duration 30s --vus 50 tests/load/load_test_simple.js"

Write-Host ""
Write-Host "8 test windows opened. Check your taskbar!" -ForegroundColor White
Write-Host ""
Write-Host "  CYAN    = Python unit tests (pytest)"    -ForegroundColor Cyan
Write-Host "  YELLOW  = Integration tests (pytest)"    -ForegroundColor Yellow
Write-Host "  GREEN   = Node.js tests (Jest)"          -ForegroundColor Green
Write-Host "  MAGENTA = Load tests (k6)"               -ForegroundColor Magenta
