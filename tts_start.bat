@echo off
title Kokoro TTS (8757, CUDA only)
cd /d "%~dp0"
set HF_HUB_DISABLE_SYMLINKS_WARNING=1
set "KG=D:\Program Files\KokoroGPU\Scripts\python.exe"
if exist "%KG%" goto use_kg
echo [ERROR] KokoroGPU python not found:
echo   %KG%
echo   This app uses the CUDA env only now -- the CPU fallback was removed
echo   because it loaded the model into RAM and used about 1.6 GB.
pause
exit /b 1
:use_kg
echo Using KokoroGPU - CUDA ...
"%KG%" "%~dp0tts_server.py"
echo.
echo TTS exited - port 8757 released.
pause