@echo off
title Centinela IoT - Panel Web
cd /d "%~dp0frontend"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [ERROR] No tienes Node.js instalado.
  echo  Descargalo de https://nodejs.org  ^(version LTS^), instalalo y vuelve a abrir este archivo.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Instalando dependencias por primera vez, espera un momento...
  call npm.cmd install --no-fund --no-audit
  if errorlevel 1 (
    echo [ERROR] Fallo npm install. Revisa tu conexion a Internet.
    pause
    exit /b 1
  )
)

echo.
echo  Abriendo el panel en http://localhost:5173  ^(no cierres esta ventana^)
echo.
call npm.cmd run dev
pause
