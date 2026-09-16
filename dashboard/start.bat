@echo off
chcp 65001 >nul
title CareerSail · 职航
echo.
echo   ⛵  CareerSail · 职航 — 求职助手
echo   ─────────────────────────────────
echo.
echo   正在启动服务...
echo.

cd /d "%~dp0"
rem 跳过启动时的飞书外部公司库自动同步（避免启动卡在同步环节，数据已缓存，可在看板内手动同步）
set SKIP_AUTO_SYNC=1
node server.js

pause