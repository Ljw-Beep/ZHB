@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 记账本 - 部署到 GitHub
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\deploy-github.ps1"
echo.
pause
