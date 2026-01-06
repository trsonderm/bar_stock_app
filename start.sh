#!/bin/bash
# Check for port 5400 conflict
PID_ON_PORT=$(lsof -t -i:5400)
if [ -n "$PID_ON_PORT" ]; then
  echo "Port 5400 is in use by PID $PID_ON_PORT. Killing it..."
  kill -9 $PID_ON_PORT
  # Wait a moment for it to die
  sleep 1
fi


echo "Starting server on port 5400..."
nohup npm start -- -p 5400 > app.log 2>&1 &
disown
echo $! > app.pid
echo "Server started with PID $(cat app.pid)"

echo "Starting scheduler..."
nohup node scripts/scheduler.js > scheduler.log 2>&1 &
disown
echo $! > scheduler.pid
echo "Scheduler started with PID $(cat scheduler.pid)"
