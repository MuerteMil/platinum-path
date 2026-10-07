@echo off
cd /d "%~dp0"
title Platinum Path - Probar
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  No se ha encontrado Node.js en este ordenador.
  echo  Instalalo desde https://nodejs.org ^(version LTS^) y vuelve a abrir este archivo.
  echo.
  start https://nodejs.org
  pause
  exit /b 1
)
if not exist "node_modules\electron" (
  echo.
  echo  Primera vez: instalando dependencias ^(puede tardar unos minutos^)...
  echo.
  call npm install
  if errorlevel 1 ( echo. & echo  Error instalando dependencias. & pause & exit /b 1 )
)
echo.
echo  Abriendo Platinum Path... ^(puedes cerrar esta ventana cuando cierres la app^)
call npm start
