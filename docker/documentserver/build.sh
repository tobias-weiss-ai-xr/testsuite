#!/bin/bash
# =============================================================================
# Build Document Server from euro_Office/core/ fork
# =============================================================================
#
# Usage: ./build.sh [tag]
#
# Examples:
#   ./build.sh              # Build with tag 'latest'
#   ./build.sh v1.0.0       # Build with tag 'v1.0.0'
#
# WARNING: This build takes 2-4 hours due to C++ compilation!
#
# Prerequisites:
#   - Docker 20.10+
#   - Internet connection (to clone from Codeberg)
#   - At least 20GB free disk space
# =============================================================================

set -e

TAG=${1:-latest}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTEXT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=============================================="
echo "euro_Office Document Server Build"
echo "=============================================="
echo ""
echo "Building from: https://codeberg.org/euro_Office/core"
echo "Image tag:     eurooffice-documentserver:${TAG}"
echo "Context:       ${CONTEXT_DIR}"
echo ""
echo "⚠️  WARNING: This will take 2-4 hours for the C++ build!"
echo ""
read -p "Continue? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Build cancelled."
    exit 1
fi

echo ""
echo "Starting build at $(date)"
echo ""

# Build with progress output
docker build \
    -t eurooffice-documentserver:${TAG} \
    -t eurooffice-documentserver:latest \
    --build-arg JWT_SECRET=build_placeholder_change_at_runtime \
    --progress=plain \
    -f "${SCRIPT_DIR}/Dockerfile" \
    "${CONTEXT_DIR}/.."

echo ""
echo "=============================================="
echo "Build completed at $(date)"
echo "=============================================="
echo ""
echo "To run the container:"
echo "  docker run -d \\"
echo "    --name eurooffice-ds \\"
echo "    -e JWT_SECRET=your_secret_here \\"
echo "    -p 8080:80 \\"
echo "    eurooffice-documentserver:${TAG}"
echo ""
echo "To test:"
echo "  curl http://localhost:8080/hosting/discovery"
echo ""
