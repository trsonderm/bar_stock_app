#!/bin/bash

# 1. Try stopping via PID file
if [ -f app.pid ]; then
  PID=$(cat app.pid)
  if ps -p $PID > /dev/null; then
    kill $PID
    echo "Server stopped (PID from app.pid: $PID)"
    rm app.pid
  else
    echo "Process $PID from app.pid not found."
    rm app.pid
  fi
fi

# 2. Try stopping process on Port 6050 (and 3000 just in case)
PORTS="6050 3000"
for PORT in $PORTS; do
  PORT_PID=$(lsof -ti:$PORT)
  if [ ! -z "$PORT_PID" ]; then
    kill -9 $PORT_PID
    echo "Server stopped (PID from Port $PORT: $PORT_PID)"
  else
    echo "No process found on port $PORT."
  fi
done

# 3. Stop Scheduler
if [ -f scheduler.pid ]; then
  SPID=$(cat scheduler.pid)
  if ps -p $SPID > /dev/null; then
    kill $SPID
    echo "Scheduler stopped (PID $SPID)"
  fi
  rm scheduler.pid
fi
