@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 22 or newer from https://nodejs.org/
  pause
  exit /b 1
)
node scripts\launch-studio.mjs %*
if errorlevel 1 pause
