#!/bin/bash

echo "Starting Bar Stock App containers..."

if command -v docker-compose &> /dev/null; then
    docker-compose up -d
else
    docker compose up -d
fi

echo "Containers started."
