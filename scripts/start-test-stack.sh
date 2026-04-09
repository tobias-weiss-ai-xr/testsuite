#!/bin/bash
# =============================================================================
# Start E2E Test Stack
# =============================================================================
#
# Usage: ./scripts/start-test-stack.sh [--build]
#
# Options:
#   --build    Rebuild Docker images before starting
#
# This script:
#   1. Validates environment
#   2. Builds/starts all services
#   3. Waits for all services to be healthy
#   4. Reports status

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.test.yml"

# Parse arguments
BUILD_FLAG=""
if [[ "$1" == "--build" ]]; then
    BUILD_FLAG="--build"
fi

echo "=============================================="
echo "euro_Office E2E Test Stack"
echo "=============================================="
echo ""
echo "Compose file: $COMPOSE_FILE"
echo ""

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "✗ Docker not found. Please install Docker."
    exit 1
fi

# Check Docker Compose
if ! docker compose version &> /dev/null; then
    echo "✗ Docker Compose not found. Please install Docker Compose."
    exit 1
fi

echo "✓ Docker is available"
echo ""

# Load environment
if [[ -f "$PROJECT_ROOT/.env.test" ]]; then
    echo "✓ Loading .env.test"
    set -a
    source "$PROJECT_ROOT/.env.test"
    set +a
fi

# Start services
echo ""
echo "Starting services..."
echo ""

cd "$PROJECT_ROOT"

if [[ -n "$BUILD_FLAG" ]]; then
    echo "Building images (this may take 2-4 hours for DS)..."
    docker compose -f docker-compose.test.yml build
fi

docker compose -f docker-compose.test.yml up -d

echo ""
echo "Waiting for services to be healthy..."
echo ""

# Wait for Document Server
echo "Checking Document Server..."
for i in {1..60}; do
    if curl -sf http://localhost:8080/hosting/discovery > /dev/null 2>&1; then
        echo "✓ Document Server is healthy"
        break
    fi
    echo "  Attempt $i/60..."
    sleep 5
done

# Wait for OCIS
echo "Checking OCIS..."
for i in {1..40}; do
    if curl -sf http://localhost:9200/health > /dev/null 2>&1; then
        echo "✓ OCIS is healthy"
        break
    fi
    echo "  Attempt $i/40..."
    sleep 5
done

# Wait for Companion
echo "Checking Companion..."
for i in {1..30}; do
    if curl -sf http://localhost:3000/api/health > /dev/null 2>&1; then
        echo "✓ Companion is healthy"
        break
    fi
    echo "  Attempt $i/30..."
    sleep 5
done

echo ""
echo "=============================================="
echo "Test Stack Status"
echo "=============================================="
echo ""

docker compose -f docker-compose.test.yml ps

echo ""
echo "Services:"
echo "  Document Server:  http://localhost:8080"
echo "  OCIS:             http://localhost:9200"
echo "  Companion:        http://localhost:3000"
echo ""
echo "To run tests:"
echo "  npm test"
echo ""
echo "To stop the stack:"
echo "  ./scripts/stop-test-stack.sh"
echo ""
