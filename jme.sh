#!/usr/bin/env sh
# J-me (macOS / Linux): replace any engine already on the port with a fresh one, then open the switch.
# Pass --shared to let a phone or tablet on the same Wi-Fi open the queue page too.
cd "$(dirname "$0")" || exit 1
PORT=8787
HOST=127.0.0.1
[ "$1" = "--shared" ] && HOST=0.0.0.0
if command -v lsof >/dev/null 2>&1; then
  for pid in $(lsof -ti tcp:$PORT -sTCP:LISTEN 2>/dev/null); do kill "$pid" 2>/dev/null; done
fi
nohup node engine/src/main.ts --host $HOST --port $PORT > sessions/engine.log 2>&1 &
sleep 3
URL="http://localhost:$PORT"
if command -v open >/dev/null 2>&1; then open "$URL"; elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL"; else echo "open $URL"; fi
