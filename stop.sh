#!/bin/bash
if [ ! -f app.pid ]; then
  echo "No app.pid file found. Is the server running?"
  exit 1
fi

PID=$(cat app.pid)
if ps -p $PID > /dev/null; then
  kill $PID
  echo "Server stopped (PID $PID)"
else
  echo "Process $PID not found. Cleaning up pid file."
fi
rm app.pid

if [ -f scheduler.pid ]; then
  SPID=$(cat scheduler.pid)
  if ps -p $SPID > /dev/null; then
    kill $SPID
    echo "Scheduler stopped (PID $SPID)"
  fi
  rm scheduler.pid
fi
