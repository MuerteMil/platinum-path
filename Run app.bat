@echo off
cd /d "%~dp0"
title Platinum Path - Run
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js was not found on this computer.
  echo  Install it from https://nodejs.org ^(LTS version^) and open this file again.
  echo.
  start https://nodejs.org
  pause
  exit /b 1
)
if not exist "node_modules\electron" (
  echo.
  echo  First run: installing dependencies ^(this can take a few minutes^)...
  echo.
  call npm install
  if errorlevel 1 ( echo. & echo  Could not install the dependencies. & pause & exit /b 1 )
)
echo.
echo  Starting Platinum Path... ^(you can close this window after closing the app^)
call npm start
