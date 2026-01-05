#!/bin/bash
export NODE_ENV=production

# Ensure we are in the project root (optional, assumes script is run from root or relative)
# cd "$(dirname "$0")" 

echo "Starting Production Server..."

# Handle App Process
if [ -f app.pid ]; then
  pid=$(cat app.pid)
  if ps -p $pid > /dev/null 2>&1; then
     echo "Server is already running with PID $pid"
     exit 1
  else
     echo "Found stale app.pid, removing..."
     rm app.pid
  fi
fi

# Handle Scheduler Process
if [ -f scheduler.pid ]; then
  spid=$(cat scheduler.pid)
  if ps -p $spid > /dev/null 2>&1; then
      echo "Scheduler is already running with PID $spid"
      # If app is not running but scheduler is, we might want to continue or exit?
      # Let's assume we proceed to start app, but respect running scheduler or restart it?
      # For simplicity, if scheduler is running, we leave it alone or restart? 
      # Usually best to align them. Let's restart scheduler to be safe or just warn.
      # Start script usually starts everything.
      echo "Stopping existing scheduler..."
      kill $spid
      rm scheduler.pid
  else
     echo "Found stale scheduler.pid, removing..."
     rm scheduler.pid
  fi
fi

echo "Starting Next.js server on port 5400..."
nohup npm start -- -p 5400 > app.log 2>&1 &
echo $! > app.pid
echo "Server started with PID $(cat app.pid)"

echo "Starting scheduler..."
nohup node scripts/scheduler.js > scheduler.log 2>&1 &
echo $! > scheduler.pid
echo "Scheduler started with PID $(cat scheduler.pid)"
