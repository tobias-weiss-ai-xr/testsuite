#!/bin/bash
# =============================================================================
# Wait for Test Stack to be Ready
# =============================================================================
#
# Usage: ./scripts/wait-for-stack.sh [timeout_seconds]
#
# Default timeout: 600 seconds (10 minutes)
#
# Exits 0 when all services are healthy, 1 on timeout.
#
# This script is used in CI to wait for the stack to be ready before running tests.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

TIMEOUT=${1:-600}
START_TIME=$(date +%s)
TIMEOUT_TIME=$((START_TIME + TIMEOUT))

# Services to check
declare -A SERVICES=(
    ["Document Server"]="http://localhost:8080/hosting/discovery"
    ["OCIS"]="http://localhost:9200/health"
    ["Companion"]="http://localhost:3000/api/health"
)

echo "Waiting for test stack to be ready (timeout: ${TIMEOUT}s)..."
echo ""

check_service() {
    local name=$1
    local url=$2
    
    if curl -sf "$url" > /dev/null 2>&1; then
        echo "✓ $name is ready"
        return 0
    else
        return 1
    fi
}

# Track which services are ready
declare -A READY

# Initialize
for service in "${!SERVICES[@]}"; do
    READY[$service]=false
done

# Wait loop
while [[ $(date +%s) -lt $TIMEOUT_TIME ]]; do
    ALL_READY=true
    
    for service in "${!SERVICES[@]}"; do
        if [[ "${READY[$service]}" == "false" ]]; then
            if check_service "$service" "${SERVICES[$service]}"; then
                READY[$service]=true
            else
                ALL_READY=false
            fi
        fi
    done
    
    if [[ "$ALL_READY" == true ]]; then
        echo ""
        echo "=============================================="
        echo "✓ All services are ready!"
        echo "=============================================="
        exit 0
    fi
    
    # Progress report every 30 seconds
    NOW=$(date +%s)
    ELAPSED=$((NOW - START_TIME))
    if [[ $((ELAPSED % 30)) -eq 0 ]]; then
        echo "Still waiting... (${ELAPSED}s elapsed)"
    fi
    
    sleep 5
done

# Timeout reached
echo ""
echo "=============================================="
echo "✗ Timeout waiting for test stack"
echo "=============================================="
echo ""

for service in "${!SERVICES[@]}"; do
    if [[ "${READY[$service]}" == "false" ]]; then
        echo "✗ $service not ready"
    fi
done

echo ""
echo "Container status:"
docker ps -a --filter "name=test-" --format "table {{.Names}}\t{{.Status}}"

exit 1
