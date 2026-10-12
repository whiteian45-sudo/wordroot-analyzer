@echo off
chcp 936 >nul
cd /d "%~dp0"
if "%~1"=="" (
  echo 用法：把一篇文章存成 article.txt 放在本目录，或直接把 .txt 拖到本文件上。
  echo.
  node 查文章.js
) else (
  node 查文章.js "%~1"
)
echo.
echo 完整报告已写入：查文章报告.txt
pause
