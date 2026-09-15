@echo off
REM 仓库根目录快捷入口（默认后端 8001 / 前端 5001）
cd /d "%~dp0"
call "%~dp0scripts\start-all.bat" %*
