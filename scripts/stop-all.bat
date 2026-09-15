@echo off
REM 停止 start-all.bat 拉起的本地进程窗口，并可选停止 Docker 中间件
setlocal EnableExtensions

cd /d "%~dp0\.."
set "ROOT=%CD%"
set "BACKEND=%ROOT%\backend"
set "STOP_DOCKER=0"

if /I "%~1"=="--with-docker" set "STOP_DOCKER=1"
if /I "%~1"=="--docker" set "STOP_DOCKER=1"

echo.
echo ============================================================
echo  林智 SmartForest — 停止本地开发窗口
echo ============================================================
echo.

call :kill_title smartforest-django
call :kill_title smartforest-celery
call :kill_title smartforest-mqtt-bridge
call :kill_title smartforest-kafka-consumer
call :kill_title smartforest-mqtt-simulator
call :kill_title smartforest-frontend

if "%STOP_DOCKER%"=="1" (
  echo.
  echo 停止 Docker 中间件...
  where docker >nul 2>&1
  if not errorlevel 1 (
    pushd "%BACKEND%"
    docker compose stop postgres redis emqx tdengine minio rabbitmq zookeeper kafka 2>nul
    if errorlevel 1 docker-compose stop postgres redis emqx tdengine minio rabbitmq zookeeper kafka 2>nul
    popd
  )
) else (
  echo.
  echo Docker 中间件保持运行。若需一并停止: scripts\stop-all.bat --with-docker
)

echo.
echo [DONE] 本地应用窗口已请求关闭。
pause
exit /b 0

:kill_title
set "TITLE=%~1"
echo 关闭窗口: %TITLE%
taskkill /FI "WINDOWTITLE eq %TITLE%" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq %TITLE%*" /T /F >nul 2>&1
goto :eof
