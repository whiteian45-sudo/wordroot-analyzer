@echo off
rem 一键回归（2026-10-03 新建）：改完引擎/词素表/数据后先跑这个
rem   1) 拆解回归：guard_words.json 里的期望
rem   2) 审计：用 enhanced 的真实词源当基准，看完整拆解/低匹配数
rem   3) 体检：表完整性 + 原型链 + 危险词 + 渲染冒烟 + 覆盖率 + 性能
cd /d "%~dp0"
echo.
echo ==== 1/3 拆解回归（守护清单）====
node test_decompose.js --guard
echo.
echo ==== 2/3 词源审计（只看总量）====
node test_decompose.js --audit --brief
echo.
echo ==== 3/3 一体化体检 ====
node test_health.js
echo.
echo 全部跑完。按任意键关闭。
pause >nul
