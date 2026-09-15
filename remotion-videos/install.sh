#!/bin/bash
set -e
cd /d/pythonDev/smartforest/remotion-videos
unset NPM_CONFIG_CACHE
export PATH="/c/Users/lenovo/.workbuddy/binaries/node/versions/22.22.2:$PATH"
echo "[info] node: $(node --version)"
echo "[info] npm:  $(npm --version)"
npm install --no-fund --no-audit --no-save --loglevel=error \
    remotion@4.0.409 \
    @remotion/cli@4.0.409 \
    @remotion/media@4.0.409 \
    react@18.3.1 \
    react-dom@18.3.1 \
    @remotion/google-fonts@4.0.409 2>&1 | tail -20
echo "[exit] $?"
