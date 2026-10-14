#!/bin/bash
# restore-database.sh — Alias for restore-db.sh
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec bash "$SCRIPT_DIR/restore-db.sh" "$@"
