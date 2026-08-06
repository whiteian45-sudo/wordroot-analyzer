@echo off
title 词根词缀分析器
cd /d "%~dp0"

echo 正在启动词根词缀分析器...

:: 探测 Python（要求已加入 PATH，无个人专属路径）
set "PY=python"
where python >nul 2>nul
if errorlevel 1 (
    echo 未检测到 Python，请先安装 Python 3 并勾选 "Add to PATH"。
    pause
    exit /b 1
)

:: 启动 Kokoro 高音质 TTS 服务（独立窗口，可选，缺依赖不影响主服务）
start "Kokoro TTS" "%~dp0tts_start.bat"

:: 启动主服务（前台）
"%PY%" server.py
pause
