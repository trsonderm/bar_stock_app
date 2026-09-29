#!/bin/bash
# Starts the production Next.js server (non-Docker deployments) on port 5400.
# Run `npm run build` first. Background jobs (report emails, alerts) run inside
# the server process via src/instrumentation.ts — no separate scheduler needed.

cd "$(dirname "$0")"

# Free the port if a previous instance is still running
PID_ON_PORT=$(lsof -t -i:5400)
if [ -n "$PID_ON_PORT" ]; then
  echo "Port 5400 is in use by PID $PID_ON_PORT. Killing it..."
  kill -9 $PID_ON_PORT
  sleep 1
fi

echo "Starting server on port 5400..."
nohup npm start -- -p 5400 > app.log 2>&1 &
disown
echo $! > app.pid
echo "Server started with PID $(cat app.pid)"
