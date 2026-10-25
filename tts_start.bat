@echo off
title Kokoro TTS (8757)
cd /d "%~dp0"
set HF_HUB_DISABLE_SYMLINKS_WARNING=1
set "KG=D:\Program Files\KokoroGPU\Scripts\python.exe"
set "MS=D:\Program Files\MOSS\conda_envs\moss-tts-nano\python.exe"
if exist "%KG%" goto use_kg
if exist "%MS%" goto use_ms
echo [WARN] no dedicated env found, using system python
python "%~dp0tts_server.py"
goto done
:use_kg
echo Using KokoroGPU (CUDA) ...
"%KG%" "%~dp0tts_server.py"
goto done
:use_ms
echo Using moss-tts-nano (CPU, slow) ...
"%MS%" "%~dp0tts_server.py"
:done
echo.
echo TTS exited (port 8757 released).
pause