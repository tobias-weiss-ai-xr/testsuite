#!/bin/bash
# =============================================================================
# Stop E2E Test Stack
# =============================================================================
#
# Usage: ./scripts/stop-test-stack.sh [--clean]
#
# Options:
#   --clean    Also remove volumes (clean slate)
#
# This script:
#   1. Stops all containers
#   2. Removes containers
#   3. Optionally removes volumes

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.test.yml"

# Parse arguments
CLEAN=false
if [[ "$1" == "--clean" ]]; then
    CLEAN=true
fi

echo "=============================================="
echo "Stopping E2E Test Stack"
echo "=============================================="
echo ""

cd "$PROJECT_ROOT"

# Stop containers
echo "Stopping containers..."
docker compose -f docker-compose.test.yml down

if [[ "$CLEAN" == true ]]; then
    echo ""
    echo "Removing volumes..."
    docker compose -f docker-compose.test.yml down -v
    echo "✓ Volumes removed"
fi

echo ""
echo "✓ Test stack stopped"
echo ""

# Show remaining containers
echo "Remaining euro_Office test containers:"
docker ps -a --filter "name=test-" --format "table {{.Names}}\t{{.Status}}"
