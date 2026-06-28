@echo off
chcp 65001 >nul
title MAXIRent x Monday - Demo
cd /d "%~dp0"

echo ============================================
echo   MAXIRent x Monday  -  Modo DEMO (sin API)
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] No se encontro Node.js. Instala Node 22+ desde https://nodejs.org
  echo.
  pause
  exit /b 1
)

if not exist "backend\node_modules" (
  echo Instalando dependencias del backend...
  pushd backend
  call npm install
  popd
)

if not exist "backend\data\maxirent.db" (
  echo Creando base de datos seed...
  pushd backend
  call npm run seed
  popd
)

if not exist "frontend\node_modules" (
  echo Instalando dependencias del frontend...
  pushd frontend
  call npm install
  popd
)

echo.
echo Levantando backend (4000) y frontend (5173)...
start "MAXIRent Backend"  cmd /k "cd /d "%~dp0backend" ^& npm run dev"
start "MAXIRent Frontend" cmd /k "cd /d "%~dp0frontend" ^& npm run dev"

echo.
echo Esperando a que arranque el panel...
timeout /t 10 /nobreak >nul
start "" http://localhost:5173

echo.
echo Listo. Hay dos ventanas corriendo (backend y frontend).
echo Para detener todo, cierra esas dos ventanas.
echo.
pause
