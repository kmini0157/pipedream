@echo off
rem Second Brain launcher (Windows). Double-click friendly:
rem  - if the server is already running, just opens the browser
rem  - first run installs dependencies automatically
rem  - loads .env, starts the server, opens the browser
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0.."

rem Load .env FIRST so PORT etc. shape the URL. Existing env vars win.
if exist .env (
  for /f "usebackq eol=# tokens=1,* delims==" %%a in (".env") do (
    if not "%%b"=="" if not defined %%a set "%%a=%%b"
  )
)

if not defined PORT set "PORT=8787"
set "URL=http://localhost:%PORT%"

rem Already running? Just open the browser and exit. (curl ships with Win10+)
where curl >nul 2>nul
if %errorlevel%==0 (
  curl -sf "%URL%/health" >nul 2>nul
  if not errorlevel 1 (
    echo 🧠 이미 실행 중입니다 - 브라우저를 엽니다: %URL%
    start "" "%URL%"
    exit /b 0
  )
)

where node >nul 2>nul
if errorlevel 1 (
  echo ✗ Node.js가 설치되어 있지 않습니다.
  echo   https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행해주세요.
  pause
  exit /b 1
)

if not exist node_modules (
  echo 📦 첫 실행: 의존성을 설치합니다 ^(1-2분^)…
  call npm run setup
  if errorlevel 1 (
    echo ✗ 설치 실패 - 위 오류를 확인해주세요.
    pause
    exit /b 1
  )
)

echo 🧠 Second Brain 시작: %URL%  ^(중지: 이 창을 닫으세요^)
rem URL has no spaces, so no nested quotes needed.
start "" cmd /c "timeout /t 2 /nobreak >nul & start %URL%"
node server.mjs
pause
