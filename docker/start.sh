#!/bin/bash
# start.sh — Starts Chromium + socat proxy inside Docker
# Chromium headless=new ignores --remote-debugging-address and always binds
# CDP to 127.0.0.1:9222 inside the container. socat proxies it to 0.0.0.0:9223
# so Docker's port mapping (-p 9223:9223) can reach it from the host.

set -e

echo "[start.sh] Starting Chromium in background..."
chromium \
    --headless=new \
    --no-sandbox \
    --disable-dev-shm-usage \
    --disable-gpu \
    --disable-background-networking \
    --disable-default-apps \
    --disable-extensions \
    --disable-sync \
    --no-first-run \
    --mute-audio \
    --hide-scrollbars \
    --remote-debugging-port=9222 \
    --window-size=1280,720 \
    --user-data-dir=/home/chrome/data \
    about:blank &

CHROMIUM_PID=$!
echo "[start.sh] Chromium PID: $CHROMIUM_PID"

echo "[start.sh] Waiting for CDP on 127.0.0.1:9222..."
for i in $(seq 1 30); do
    if curl -sf http://127.0.0.1:9222/json/version > /dev/null 2>&1; then
        echo "[start.sh] CDP ready after ${i}s"
        break
    fi
    sleep 1
done

echo "[start.sh] Starting socat: 0.0.0.0:9223 -> 127.0.0.1:9222"
socat TCP-LISTEN:9223,fork,reuseaddr TCP:127.0.0.1:9222 &

echo "[start.sh] All services running."
wait $CHROMIUM_PID
