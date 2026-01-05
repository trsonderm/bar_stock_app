#!/bin/bash
if [ -f app.pid ]; then
  echo "Server is already running with PID $(cat app.pid)"
  exit 1
fi

echo "Starting server on port 5400..."
nohup npm start -- -p 5400 > app.log 2>&1 &
echo $! > app.pid
echo "Server started with PID $(cat app.pid)"

echo "Starting scheduler..."
nohup node scripts/scheduler.js > scheduler.log 2>&1 &
echo $! > scheduler.pid
echo "Scheduler started with PID $(cat scheduler.pid)"
