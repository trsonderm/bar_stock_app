#!/bin/bash
# backup-database.sh — Alias for backup-db.sh
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec bash "$SCRIPT_DIR/backup-db.sh" "$@"
