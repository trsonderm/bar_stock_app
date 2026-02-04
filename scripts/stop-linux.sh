#!/bin/bash

echo "Stopping Bar Stock App containers..."

if command -v docker-compose &> /dev/null; then
    docker-compose stop
else
    docker compose stop
fi

echo "Containers stopped."
