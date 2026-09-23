@echo off
title Kokoro TTS 语音服务（8757）
cd /d "%~dp0"

:: 模型缓存目录：默认用户目录，无需修改
set HF_HUB_DISABLE_SYMLINKS_WARNING=1

:: 优先用 KokoroGPU 环境（专用 GPU 环境：cu126 版 torch，1060 能吃到显卡，整段朗读快）
:: 找不到才退 moss-tts-nano（CPU 版 torch，能跑但慢），再找不到才回系统 python
set "TTS_PY=D:\Program Files\KokoroGPU\Scripts\python.exe"
if not exist "%TTS_PY%" (
    echo [提示] 未找到 KokoroGPU 环境，退回 moss-tts-nano（CPU 模式，较慢）
    set "TTS_PY=D:\Program Files\MOSS\conda_envs\moss-tts-nano\python.exe"
)
if not exist "%TTS_PY%" (
    echo [提示] 两个环境都没找到，回落到系统 python（可能缺少 kokoro 依赖）
    set "TTS_PY=python"
)
:: 检查的是即将真正运行的那个解释器，而不是 PATH 里的 python——
:: 以前用 where python 判断，环境齐全却会因为系统 python 不在 PATH 而直接退出
"%TTS_PY%" -c "import sys" >nul 2>nul
if errorlevel 1 (
    echo 未检测到可用的 Python：%TTS_PY%
    echo 请先安装 Python 3，或确认 KokoroGPU / moss-tts-nano 环境路径是否变了。
    pause
    exit /b 1
)

"%TTS_PY%" "%~dp0tts_server.py"
echo.
echo TTS 服务已退出（端口 8757 已释放）。若报缺少 kokoro 依赖，请看上面的报错。
pause
