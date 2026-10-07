@echo off
cd /d "%~dp0"
title Platinum Path - Build installer
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js was not found. Install it from https://nodejs.org ^(LTS version^).
  start https://nodejs.org
  pause
  exit /b 1
)
if not exist "node_modules\electron" (
  echo  Installing dependencies...
  call npm install
  if errorlevel 1 ( echo  Could not install the dependencies. & pause & exit /b 1 )
)
echo.
echo  Building the installer and the portable version ^(this takes a few minutes^)...
echo.
call npm run dist
if errorlevel 1 ( echo. & echo  Something went wrong. Copy the text above to report the problem. & pause & exit /b 1 )
for /f "usebackq delims=" %%v in (`node -p "require('./package.json').version"`) do set "PPVER=%%v"
echo.
echo  Done. The files are in the "dist" folder:
echo   - Platinum-Path-Setup-%PPVER%.exe        ^(installer^)
echo   - Platinum-Path-%PPVER%-portable.zip     ^(portable^)
echo   - win-unpacked\Platinum Path.exe       ^(app without installing^)
explorer dist
pause
