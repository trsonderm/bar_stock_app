#!/bin/bash

echo "Restarting Bar Stock App containers..."

if command -v docker-compose &> /dev/null; then
    docker-compose restart
else
    docker compose restart
fi

echo "Containers restarted."
