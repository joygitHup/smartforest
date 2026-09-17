@echo off
REM SmartForest one-click start (Windows)
REM Default prefer: backend 8001, frontend 5001
REM Busy ports -> auto use next free (+1..)
REM Skip only when this project's marked ports are still listening
REM
REM   scripts\start-all.bat
REM   scripts\start-all.bat --backend-port 8001 --frontend-port 5001
REM   scripts\start-all.bat --no-iot --no-pause --skip-docker
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0\.."
set "ROOT=%CD%"
set "BACKEND=%ROOT%\backend"
set "PORTFILE=%ROOT%\.smartforest-ports.env"

if not defined SF_BACKEND_PORT set "SF_BACKEND_PORT=8001"
if not defined SF_FRONTEND_PORT set "SF_FRONTEND_PORT=5001"
set "BACKEND_PORT_PREF=%SF_BACKEND_PORT%"
set "FRONTEND_PORT_PREF=%SF_FRONTEND_PORT%"
set "BACKEND_PORT=%BACKEND_PORT_PREF%"
set "FRONTEND_PORT=%FRONTEND_PORT_PREF%"

set "DO_DOCKER=1"
set "DO_IOT=1"
set "DO_FRONTEND=1"
set "DO_APPS=1"
set "DO_SIM=0"
set "DO_MIGRATE=1"
set "DO_PAUSE=1"

:parse_args
if "%~1"=="" goto args_done
if /I "%~1"=="--skip-docker" set "DO_DOCKER=0" & goto parse_next
if /I "%~1"=="--no-iot" set "DO_IOT=0" & goto parse_next
if /I "%~1"=="--no-frontend" set "DO_FRONTEND=0" & goto parse_next
if /I "%~1"=="--infra-only" set "DO_APPS=0" & set "DO_IOT=0" & set "DO_FRONTEND=0" & goto parse_next
if /I "%~1"=="--with-simulator" set "DO_SIM=1" & goto parse_next
if /I "%~1"=="--skip-migrate" set "DO_MIGRATE=0" & goto parse_next
if /I "%~1"=="--no-pause" set "DO_PAUSE=0" & goto parse_next
if /I "%~1"=="--backend-port" set "BACKEND_PORT_PREF=%~2" & set "BACKEND_PORT=%~2" & shift & goto parse_next
if /I "%~1"=="--frontend-port" set "FRONTEND_PORT_PREF=%~2" & set "FRONTEND_PORT=%~2" & shift & goto parse_next
if /I "%~1"=="-h" goto usage
if /I "%~1"=="--help" goto usage
:parse_next
shift
goto parse_args

:usage
echo.
echo Options:
echo   --backend-port N     preferred backend port (auto +1 if busy)
echo   --frontend-port N    preferred frontend port (auto +1 if busy)
echo   --skip-docker
echo   --no-iot
echo   --no-frontend
echo   --infra-only
echo   --with-simulator
echo   --skip-migrate
echo   --no-pause
echo.
exit /b 0

:args_done
REM Restore last known ports if still alive (skip restart)
if exist "%PORTFILE%" (
  for /f "usebackq tokens=1,2 delims==" %%A in ("%PORTFILE%") do (
    if /I "%%A"=="BACKEND_PORT" set "MARK_BE=%%B"
    if /I "%%A"=="FRONTEND_PORT" set "MARK_FE=%%B"
  )
)

echo.
echo ============================================================
echo  SmartForest start-all
echo  ROOT=%ROOT%
echo  prefer backend=%BACKEND_PORT_PREF%  frontend=%FRONTEND_PORT_PREF%
echo ============================================================
echo.

set "PY=python"
if exist "%BACKEND%\venv\Scripts\python.exe" set "PY=%BACKEND%\venv\Scripts\python.exe"

where python >nul 2>&1
if errorlevel 1 (
  if not exist "%BACKEND%\venv\Scripts\python.exe" (
    echo [ERROR] Python not found
    if "%DO_PAUSE%"=="1" pause
    exit /b 1
  )
)

if not exist "%BACKEND%\.env" (
  if exist "%BACKEND%\.env.example" (
    echo [INFO] copy .env.example to .env
    copy /Y "%BACKEND%\.env.example" "%BACKEND%\.env" >nul
  )
)

if "%DO_DOCKER%"=="1" (
  echo [1/5] Docker infra...
  where docker >nul 2>&1
  if errorlevel 1 (
    echo       [SKIP] docker not found
  ) else (
    pushd "%BACKEND%"
    docker compose version >nul 2>&1
    if not errorlevel 1 (
      docker compose up -d postgres redis emqx influxdb minio rabbitmq zookeeper kafka
    ) else (
      docker-compose up -d postgres redis emqx influxdb minio rabbitmq zookeeper kafka 2>nul
    )
    popd
    call :wait_port 127.0.0.1 5433 45
    call :wait_port 127.0.0.1 6380 30
  )
) else (
  echo [1/5] skip docker
)

if "%DO_APPS%"=="0" (
  echo [DONE] infra only
  if "%DO_PAUSE%"=="1" pause
  exit /b 0
)

if "%DO_MIGRATE%"=="1" (
  echo [2/5] migrate...
  pushd "%BACKEND%"
  "%PY%" manage.py migrate --noinput
  if errorlevel 1 echo       [WARN] migrate failed
  popd
) else (
  echo [2/5] skip migrate
)

echo [3/5] Django / Celery...
set "SKIP_DJANGO=0"
if defined MARK_BE (
  call :check_win smartforest-django
  if not errorlevel 1 (
    call :check_port 127.0.0.1 !MARK_BE!
    if not errorlevel 1 (
      set "BACKEND_PORT=!MARK_BE!"
      set "SKIP_DJANGO=1"
      echo       [SKIP] Django already on port !BACKEND_PORT!
    )
  )
)
if "!SKIP_DJANGO!"=="0" (
  call :pick_free_port %BACKEND_PORT_PREF%
  set "BACKEND_PORT=!FREE_PORT!"
  if not "!BACKEND_PORT!"=="%BACKEND_PORT_PREF%" (
    echo       port %BACKEND_PORT_PREF% busy -^> use !BACKEND_PORT!
  )
  taskkill /FI "WINDOWTITLE eq smartforest-django*" /T /F >nul 2>&1
  set "BACKEND_URL=http://127.0.0.1:!BACKEND_PORT!"
  echo       start Django !BACKEND_URL!
  start "smartforest-django" /D "%BACKEND%" cmd /k ""%PY%" manage.py runserver 127.0.0.1:!BACKEND_PORT!"
  call :wait_port 127.0.0.1 !BACKEND_PORT! 45
)
set "BACKEND_URL=http://127.0.0.1:!BACKEND_PORT!"

call :check_celery
if not errorlevel 1 (
  echo       [SKIP] Celery already running
) else (
  call :check_win smartforest-celery
  if not errorlevel 1 (
    echo       [SKIP] window smartforest-celery exists
  ) else (
    echo       start Celery worker
    start "smartforest-celery" /D "%BACKEND%" cmd /k ""%PY%" -m celery -A config worker -l info --pool=solo -Q telemetry,alerts,default"
  )
)

call :check_win smartforest-celery-beat
if not errorlevel 1 (
  echo       [SKIP] Celery Beat already running
) else (
  echo       start Celery Beat
  start "smartforest-celery-beat" /D "%BACKEND%" cmd /k ""%PY%" -m celery -A config beat -l info --scheduler django_celery_beat.schedulers:DatabaseScheduler"
)

if "%DO_IOT%"=="1" (
  echo [4/5] IoT pipeline...
  ping -n 3 127.0.0.1 >nul
  pushd "%BACKEND%"
  "%PY%" manage.py ensure_kafka_topics >nul 2>&1
  if errorlevel 1 echo       [WARN] kafka topics check failed
  popd

  call :check_win smartforest-mqtt-bridge
  if not errorlevel 1 (
    echo       [SKIP] mqtt-bridge running
  ) else (
    echo       start mqtt-bridge
    start "smartforest-mqtt-bridge" /D "%BACKEND%" cmd /k ""%PY%" manage.py mqtt_client"
  )

  call :check_win smartforest-kafka-consumer
  if not errorlevel 1 (
    echo       [SKIP] kafka-consumer running
  ) else (
    echo       start kafka-consumer
    start "smartforest-kafka-consumer" /D "%BACKEND%" cmd /k ""%PY%" manage.py consume_kafka"
  )

  if "%DO_SIM%"=="1" (
    call :check_win smartforest-mqtt-simulator
    if not errorlevel 1 (
      echo       [SKIP] mqtt-simulator running
    ) else (
      echo       start mqtt-simulator
      start "smartforest-mqtt-simulator" /D "%BACKEND%" cmd /k ""%PY%" manage.py simulate_mqtt_devices"
    )
  )
) else (
  echo [4/5] skip IoT
)

if "%DO_FRONTEND%"=="1" (
  echo [5/5] frontend...
  where pnpm >nul 2>&1
  if errorlevel 1 (
    echo       [WARN] pnpm not found
  ) else (
    set "SKIP_FE=0"
    if defined MARK_FE (
      call :check_win smartforest-frontend
      if not errorlevel 1 (
        call :check_port 127.0.0.1 !MARK_FE!
        if not errorlevel 1 (
          set "FRONTEND_PORT=!MARK_FE!"
          set "SKIP_FE=1"
          echo       [SKIP] frontend already on port !FRONTEND_PORT!
        )
      )
    )
    if "!SKIP_FE!"=="0" (
      call :pick_free_port %FRONTEND_PORT_PREF%
      set "FRONTEND_PORT=!FREE_PORT!"
      if not "!FRONTEND_PORT!"=="%FRONTEND_PORT_PREF%" (
        echo       port %FRONTEND_PORT_PREF% busy -^> use !FRONTEND_PORT!
      )
      call :stop_frontend_conflict
      if not exist "%ROOT%\node_modules" (
        echo       pnpm install...
        pushd "%ROOT%"
        call pnpm install
        popd
      )
      echo       start frontend http://127.0.0.1:!FRONTEND_PORT!  ^(API -^> !BACKEND_URL!^)
      start "smartforest-frontend" /D "%ROOT%" cmd /k "set PORT=!FRONTEND_PORT!&& set DEPLOY_RUN_PORT=!FRONTEND_PORT!&& set BACKEND_URL=!BACKEND_URL!&& set NEXT_PUBLIC_API_URL=!BACKEND_URL!&& set NEXT_PUBLIC_BACKEND_URL=!BACKEND_URL!&& pnpm exec tsx watch src/server.ts"
      call :wait_port 127.0.0.1 !FRONTEND_PORT! 90
    )
  )
) else (
  echo [5/5] skip frontend
)

> "%PORTFILE%" echo BACKEND_PORT=!BACKEND_PORT!
>> "%PORTFILE%" echo FRONTEND_PORT=!FRONTEND_PORT!
>> "%PORTFILE%" echo BACKEND_URL=!BACKEND_URL!

echo.
echo ============================================================
echo  Done.
echo ------------------------------------------------------------
echo  Frontend: http://127.0.0.1:!FRONTEND_PORT!
echo  Backend:  !BACKEND_URL!
echo  Swagger:  !BACKEND_URL!/api/docs/
echo ------------------------------------------------------------
echo  Stop: scripts\stop-all.bat
echo ============================================================
echo.
if "%DO_PAUSE%"=="1" pause
exit /b 0

:pick_free_port
set "FREE_PORT=%~1"
set /a "_TRIES=0"
:pick_loop
call :check_port 127.0.0.1 !FREE_PORT!
if errorlevel 1 goto :eof
set /a "FREE_PORT+=1"
set /a "_TRIES+=1"
if !_TRIES! GEQ 50 (
  echo       [ERROR] no free port near %~1
  goto :eof
)
goto pick_loop

:wait_port
set "_HOST=%~1"
set "_PORT=%~2"
set "_MAX=%~3"
set /a "_N=0"
:wait_loop
call :check_port %_HOST% %_PORT%
if not errorlevel 1 (
  echo       OK %_HOST%:%_PORT%
  goto :eof
)
set /a "_N+=1"
if !_N! GEQ %_MAX% (
  echo       [WARN] wait %_HOST%:%_PORT% timeout
  goto :eof
)
ping -n 2 127.0.0.1 >nul
goto wait_loop

:check_port
powershell -NoProfile -Command "try { $c=New-Object Net.Sockets.TcpClient; $iar=$c.BeginConnect('%~1',%~2,$null,$null); if(-not $iar.AsyncWaitHandle.WaitOne(400,$false)){ $c.Close(); exit 1 }; $c.EndConnect($iar); $c.Close(); exit 0 } catch { exit 1 }" >nul 2>&1
exit /b %ERRORLEVEL%

:check_win
tasklist /V /FI "IMAGENAME eq cmd.exe" 2>nul | findstr /I "%~1" >nul 2>&1
if not errorlevel 1 exit /b 0
tasklist /V /FI "IMAGENAME eq powershell.exe" 2>nul | findstr /I "%~1" >nul 2>&1
exit /b %ERRORLEVEL%

:check_celery
REM Match only the smartforest Celery worker (not beat, not other projects,
REM not this powershell command itself). Restrict to python.exe processes whose
REM cmdline contains "-A config worker" (smartforest's settings module + worker
REM subcommand). Beat uses "-A config beat", other projects use different -A.
powershell -NoProfile -Command "$procs=Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq 'python.exe' -and $_.CommandLine -and ($_.CommandLine -match '-A\s+config\s+worker') }; if($procs){ exit 0 } else { exit 1 }" >nul 2>&1
exit /b %ERRORLEVEL%

:stop_frontend_conflict
echo       stop conflicting Next.js for this repo (dev lock)
taskkill /FI "WINDOWTITLE eq smartforest-frontend*" /T /F >nul 2>&1
powershell -NoProfile -Command "$root='%ROOT%'; Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -and ($_.CommandLine -like ('*'+$root+'*')) -and ( ($_.CommandLine -like '*server.ts*' -and $_.CommandLine -like '*tsx*') -or ($_.CommandLine -like '*next*dev*') -or ($_.CommandLine -like '*start-server.js*') ) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; Start-Sleep -Seconds 2; $lock=Join-Path $root '.next\dev\lock'; if (Test-Path $lock) { Remove-Item $lock -Force -ErrorAction SilentlyContinue }" >nul 2>&1
goto :eof
