#!/usr/bin/env bash

PIDFILE="$(dirname "$0")/.brittany.pid"

if [ ! -f "$PIDFILE" ]; then
  echo "Brittany is not running (no pidfile found)"
  exit 1
fi

PID=$(cat "$PIDFILE")

if kill -0 "$PID" 2>/dev/null; then
  kill "$PID"
  rm "$PIDFILE"
  echo "Brittany stopped (pid $PID)"
else
  echo "Brittany was not running (stale pidfile removed)"
  rm "$PIDFILE"
fi
