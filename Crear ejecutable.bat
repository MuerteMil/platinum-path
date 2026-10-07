@echo off
cd /d "%~dp0"
title Platinum Path - Crear ejecutable
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  No se ha encontrado Node.js. Instalalo desde https://nodejs.org ^(version LTS^).
  start https://nodejs.org
  pause
  exit /b 1
)
if not exist "node_modules\electron" (
  echo  Instalando dependencias...
  call npm install
  if errorlevel 1 ( echo  Error instalando dependencias. & pause & exit /b 1 )
)
echo.
echo  Creando el instalador y la version portable ^(tarda unos minutos^)...
echo.
call npm run dist
if errorlevel 1 ( echo. & echo  Algo ha fallado. Copia el texto de arriba y pasaselo a Claude. & pause & exit /b 1 )
for /f "usebackq delims=" %%v in (`node -p "require('./package.json').version"`) do set "PPVER=%%v"
echo.
echo  Listo. Los archivos estan en la carpeta "dist":
echo   - Platinum-Path-Setup-%PPVER%.exe        ^(instalador^)
echo   - Platinum-Path-%PPVER%-portable.zip     ^(portable^)
echo   - win-unpacked\Platinum Path.exe       ^(ejecutable directo^)
explorer dist
pause
