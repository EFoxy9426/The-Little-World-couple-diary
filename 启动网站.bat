@echo off
title XiaoXiao ShiJie - Couple Diary Server
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Please install Node.js from https://nodejs.org
  pause
  exit /b 1
)
echo Starting XiaoXiao ShiJie ...
echo Open http://localhost:8080 in your browser
echo Keep this window open. Close it to stop the server.
node start-server.js
pause
