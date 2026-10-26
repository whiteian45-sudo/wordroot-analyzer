@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "HTTPS_PROXY=http://127.0.0.1:10808"
set "HTTP_PROXY=http://127.0.0.1:10808"
echo 正在下载词光插画与发音到 atlas_media（约 500MB，可断点续跑）...
python -I wr_atlas_media.py --workers 16
echo.
echo 完成。按任意键关闭。
pause >nul
