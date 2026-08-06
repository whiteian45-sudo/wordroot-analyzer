@echo off
title Kokoro TTS 高音质发音服务
cd /d "%~dp0"

:: 模型缓存目录（默认用户目录，可自行修改）
set "HF_HOME=%USERPROFILE%\hf"
set HF_HUB_DISABLE_SYMLINKS_WARNING=1

:: 若存在独立的 Kokoro 环境则优先使用，否则用系统 python
set "TTS_PY=python"
where python >nul 2>nul
if errorlevel 1 (
    echo 未检测到 Python，请先安装 Python 3。
    pause
    exit /b 1
)

"%TTS_PY%" "%~dp0tts_server.py"
echo.
echo TTS 服务已退出（端口 8757 被占用，或缺少 kokoro 依赖时也会退出）。
pause
