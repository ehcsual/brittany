#!/usr/bin/env bash
set -e

PIDFILE="$(dirname "$0")/.brittany.pid"

if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  echo "Brittany is already running (pid $(cat "$PIDFILE"))"
  exit 1
fi

node "$(dirname "$0")/server.js" &
echo $! > "$PIDFILE"
echo "Brittany started (pid $!) → http://localhost:${PORT:-7333}"
