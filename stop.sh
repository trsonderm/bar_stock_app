#!/bin/bash
# Stops the production server started by start.sh.

cd "$(dirname "$0")"

# 1. Stop via PID file
if [ -f app.pid ]; then
  PID=$(cat app.pid)
  if ps -p $PID > /dev/null; then
    kill $PID
    echo "Server stopped (PID from app.pid: $PID)"
  else
    echo "Process $PID from app.pid not found."
  fi
  rm app.pid
fi

# 2. Stop anything still listening on the app ports
for PORT in 5400 6050 3000; do
  PORT_PID=$(lsof -ti:$PORT)
  if [ -n "$PORT_PID" ]; then
    kill -9 $PORT_PID
    echo "Server stopped (PID from Port $PORT: $PORT_PID)"
  fi
done

# 3. Legacy: stop the old standalone scheduler if an older start.sh launched it
if [ -f scheduler.pid ]; then
  SPID=$(cat scheduler.pid)
  if ps -p $SPID > /dev/null; then
    kill $SPID
    echo "Legacy scheduler stopped (PID $SPID)"
  fi
  rm scheduler.pid
fi
