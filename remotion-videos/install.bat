@echo off
cd /d D:\pythonDev\smartforest\remotion-videos
set PATH=C:\Users\lenovo\.workbuddy\binaries\node\versions\22.22.2;%PATH%
echo === node ===
node --version
echo === npm ===
npm --version
echo === install ===
call npm install --no-fund --no-audit --no-save --loglevel=error remotion@4.0.409 @remotion/cli@4.0.409 @remotion/media@4.0.409 @remotion/google-fonts@4.0.409 react@18.3.1 react-dom@18.3.1
echo === exit=%errorlevel% ===
