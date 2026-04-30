#!/bin/bash
# rollback.sh — Restore code and database to a previous deploy state.
#
# Usage:
#   ./scripts/rollback.sh              — list deploys, pick interactively
#   ./scripts/rollback.sh --previous   — roll back to the most recent prior deploy
#   ./scripts/rollback.sh --list       — list available deploy snapshots and exit
#
# What it does:
#   1. Shows available deploy snapshots (git commit + backup file)
#   2. Takes a safety backup of current database state
#   3. Restores the database from the selected deploy's pre-deploy backup
#   4. Checks out the git commit that was running at that deploy
#   5. Rebuilds Docker containers
#   6. Applies schema migrations
#   7. Brings the service up

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKUP_DIR="/opt/topshelf/backups"
MANIFEST_DIR="$BACKUP_DIR/manifests"

# ── Helpers ───────────────────────────────────────────────────────────────────

parse_json_field() {
    local file="$1" field="$2"
    grep "\"$field\"" "$file" | sed 's/.*": *"\(.*\)".*/\1/' | head -1
}

list_deploys() {
    local manifests
    manifests=$(find "$MANIFEST_DIR" -name "deploy_*.json" 2>/dev/null | sort -r)
    if [ -z "$manifests" ]; then
        echo "  (no deploy snapshots found — deploy at least once to create them)"
        return 1
    fi

    echo ""
    printf "  %-4s  %-22s  %-10s  %-50s  %s\n" "NUM" "DEPLOYED AT" "COMMIT" "MESSAGE" "BACKUP"
    echo "  ──────────────────────────────────────────────────────────────────────────────────────────────────"
    local i=1
    while IFS= read -r mf; do
        local ts commit msg backup branch
        ts=$(parse_json_field "$mf" "deploy_timestamp")
        commit=$(parse_json_field "$mf" "pre_deploy_commit" | cut -c1-8)
        branch=$(parse_json_field "$mf" "pre_deploy_branch")
        msg=$(parse_json_field "$mf" "pre_deploy_message" | cut -c1-48)
        backup=$(parse_json_field "$mf" "backup_file")
        local bsize=""
        [ -f "$BACKUP_DIR/$backup" ] && bsize=$(du -sh "$BACKUP_DIR/$backup" 2>/dev/null | cut -f1)
        printf "  [%2d]  %-22s  %-10s  %-50s  %s %s\n" "$i" "$ts" "$commit ($branch)" "$msg" "$backup" "$bsize"
        i=$((i + 1))
    done <<< "$manifests"
    echo ""
}

# ── Resolve which manifest to use ────────────────────────────────────────────

MANIFESTS=$(find "$MANIFEST_DIR" -name "deploy_*.json" 2>/dev/null | sort -r)
MANIFEST_COUNT=$(echo "$MANIFESTS" | grep -c . 2>/dev/null || echo 0)

if [ "$1" = "--list" ]; then
    echo "Available deploy snapshots:"
    list_deploys || true
    exit 0
fi

if [ $MANIFEST_COUNT -eq 0 ]; then
    echo "ERROR: No deploy snapshots found in $MANIFEST_DIR"
    echo "       Snapshots are created automatically on each deploy."
    exit 1
fi

if [ "$1" = "--previous" ]; then
    # Second-most-recent (skip index 1 = current, use index 2 = previous)
    SELECTED_MANIFEST=$(echo "$MANIFESTS" | sed -n '2p')
    if [ -z "$SELECTED_MANIFEST" ]; then
        echo "Only one deploy snapshot exists. Nothing to roll back to."
        exit 1
    fi
else
    echo "╔══════════════════════════════════════════════════════════╗"
    echo "║              TopShelf Rollback Tool                      ║"
    echo "╚══════════════════════════════════════════════════════════╝"
    echo ""
    echo "Available deploy snapshots (most recent first):"
    list_deploys || exit 1

    printf "Enter number to roll back to (or q to quit): "
    read -r CHOICE
    [ "$CHOICE" = "q" ] || [ -z "$CHOICE" ] && exit 0

    SELECTED_MANIFEST=$(echo "$MANIFESTS" | sed -n "${CHOICE}p")
    if [ -z "$SELECTED_MANIFEST" ]; then
        echo "ERROR: Invalid selection."
        exit 1
    fi
fi

# ── Extract fields from manifest ─────────────────────────────────────────────

ROLLBACK_COMMIT=$(parse_json_field "$SELECTED_MANIFEST" "pre_deploy_commit")
ROLLBACK_BRANCH=$(parse_json_field "$SELECTED_MANIFEST" "pre_deploy_branch")
ROLLBACK_MSG=$(parse_json_field "$SELECTED_MANIFEST" "pre_deploy_message")
ROLLBACK_BACKUP=$(parse_json_field "$SELECTED_MANIFEST" "backup_file")
ROLLBACK_BACKUP_PATH="$BACKUP_DIR/$ROLLBACK_BACKUP"
ROLLBACK_TS=$(parse_json_field "$SELECTED_MANIFEST" "deploy_timestamp")

if [ -z "$ROLLBACK_COMMIT" ] || [ "$ROLLBACK_COMMIT" = "unknown" ]; then
    echo "ERROR: Could not read commit hash from manifest."
    exit 1
fi

if [ ! -f "$ROLLBACK_BACKUP_PATH" ]; then
    echo "ERROR: Backup file not found: $ROLLBACK_BACKUP_PATH"
    exit 1
fi

BACKUP_SIZE=$(du -sh "$ROLLBACK_BACKUP_PATH" | cut -f1)
CURRENT_COMMIT=$(git rev-parse HEAD 2>/dev/null | cut -c1-8)
CURRENT_MSG=$(git log -1 --pretty=format:"%s" 2>/dev/null)

# ── Confirm ───────────────────────────────────────────────────────────────────

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║  ROLLBACK PLAN                                                   ║"
echo "╠══════════════════════════════════════════════════════════════════╣"
printf "║  Current  code:  %-47s ║\n" "$CURRENT_COMMIT — $CURRENT_MSG"
printf "║  Restore  code:  %-47s ║\n" "${ROLLBACK_COMMIT:0:8} — $ROLLBACK_MSG"
printf "║  Snapshot time:  %-47s ║\n" "$ROLLBACK_TS"
printf "║  Database file:  %-47s ║\n" "$ROLLBACK_BACKUP ($BACKUP_SIZE)"
echo "╠══════════════════════════════════════════════════════════════════╣"
echo "║  Steps:                                                          ║"
echo "║   1. Safety-backup current database                              ║"
echo "║   2. Restore database from snapshot                              ║"
echo "║   3. git checkout $ROLLBACK_COMMIT                               ║"
echo "║   4. docker compose down && up --build                           ║"
echo "║   5. Apply schema + migrations                                   ║"
echo "║   6. Bring service up                                            ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
printf "Type 'yes' to proceed with rollback: "
read -r CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    echo "Rollback cancelled."
    exit 0
fi

# ── Step 1: Safety backup of current DB ──────────────────────────────────────

echo ""
echo "── Step 1/6: Safety-backing up current database ──"
SAFETY_DIR="$BACKUP_DIR/pre-rollback"
mkdir -p "$SAFETY_DIR"
SAFETY_FILE="$SAFETY_DIR/topshelf_pre_rollback_$(date +%Y%m%d_%H%M%S).sql.gz"

DB_EXISTS=$(docker compose exec -T db psql -U postgres -d postgres -tAc \
    "SELECT 1 FROM pg_database WHERE datname='topshelf'" 2>/dev/null | tr -d '[:space:]' || echo "")
if [ "$DB_EXISTS" = "1" ]; then
    docker compose exec -T db pg_dump -U postgres topshelf | gzip > "$SAFETY_FILE"
    echo "Safety backup saved: $SAFETY_FILE"
else
    echo "No existing database found — skipping safety backup."
fi

# ── Step 2: Restore database ──────────────────────────────────────────────────

echo ""
echo "── Step 2/6: Restoring database from $ROLLBACK_BACKUP ──"

# Terminate active connections
docker compose exec -T db psql -U postgres -d postgres -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='topshelf' AND pid <> pg_backend_pid();" \
    > /dev/null 2>&1 || true

docker compose exec -T db psql -U postgres -d postgres -c \
    "DROP DATABASE IF EXISTS topshelf;" > /dev/null
docker compose exec -T db psql -U postgres -d postgres -c \
    "CREATE DATABASE topshelf OWNER postgres;" > /dev/null

echo "Restoring data..."
CONTAINER_BACKUP="/backups/$(basename "$ROLLBACK_BACKUP_PATH")"
docker compose exec -T db bash -c "gunzip -c '$CONTAINER_BACKUP' | psql -U postgres -d topshelf"
echo "Database restored."

# ── Step 3: Checkout previous code ────────────────────────────────────────────

echo ""
echo "── Step 3/6: Checking out code at $ROLLBACK_COMMIT ──"

# Stash any local changes before switching
git stash --include-untracked --quiet 2>/dev/null || true
git checkout "$ROLLBACK_COMMIT" 2>/dev/null

echo "Code is now at: $(git log -1 --pretty=format:'%h %s')"

# ── Step 4: Rebuild containers ────────────────────────────────────────────────

echo ""
echo "── Step 4/6: Rebuilding Docker containers ──"

# Kill any processes holding ports
for PORT in 6050 3000; do
    PID=$(lsof -ti:$PORT 2>/dev/null || true)
    [ -n "$PID" ] && kill -9 $PID 2>/dev/null || true
done

docker compose down --remove-orphans
docker compose up -d --build

# ── Step 5: Wait for DB, apply schema ─────────────────────────────────────────

echo ""
echo "── Step 5/6: Applying schema and migrations ──"

RETRIES=60
until docker compose exec -T db pg_isready -U postgres -q 2>/dev/null; do
    RETRIES=$((RETRIES - 1))
    if [ $RETRIES -le 0 ]; then
        echo "ERROR: PostgreSQL did not become ready in time."
        exit 1
    fi
    echo "  Waiting for PostgreSQL... ($RETRIES retries left)"
    sleep 2
done

# Ensure DB exists (the restore above already created it, but be safe)
docker compose exec -T db psql -U postgres -d postgres -c \
    "SELECT 1 FROM pg_database WHERE datname='topshelf'" | grep -q 1 || \
    docker compose exec -T db psql -U postgres -d postgres -c \
    "CREATE DATABASE topshelf OWNER postgres;" || true

if docker compose exec -T db psql -U postgres -d topshelf < "$SCRIPT_DIR/schema.sql" > /dev/null 2>&1; then
    echo "Base schema applied."
else
    echo "WARNING: schema.sql returned warnings (likely safe)."
fi

if docker compose exec -T db psql -U postgres -d topshelf < "$SCRIPT_DIR/migrate.sql" > /dev/null 2>&1; then
    echo "Migrations applied."
else
    echo "WARNING: migrate.sql returned warnings."
fi

# ── Step 6: Confirm service is up ─────────────────────────────────────────────

echo ""
echo "── Step 6/6: Verifying service ──"
sleep 5
if docker compose ps app 2>/dev/null | grep -q "running\|Up"; then
    echo "Service is up."
else
    echo "WARNING: App container may not be running. Check: docker compose ps"
fi

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║  ROLLBACK COMPLETE                                               ║"
printf "║  Code:     %-53s ║\n" "$(git log -1 --pretty=format:'%h %s')"
printf "║  Database: %-53s ║\n" "$ROLLBACK_BACKUP"
printf "║  Undo:     %-53s ║\n" "$(basename "$SAFETY_FILE" 2>/dev/null || echo 'n/a')"
echo "╠══════════════════════════════════════════════════════════════════╣"
echo "║  To undo this rollback, restore the safety backup:              ║"
printf "║    bash scripts/restore-db.sh %s\n" "$(basename "$SAFETY_FILE" 2>/dev/null)"
echo "╚══════════════════════════════════════════════════════════════════╝"
