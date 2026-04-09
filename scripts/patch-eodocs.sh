#!/bin/bash
# Patch missing assets in the eo-docs container (euro_Office build issues)
# Usage: ./scripts/patch-eodocs.sh
# Prerequisites: eo-docs container must be running

set -e

CONTAINER="eo-docs"
DOCROOT="/var/www/onlyoffice/documentserver"

# Check container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  echo "ERROR: Container '$CONTAINER' is not running"
  exit 1
fi

# 1. Create device_scale.js stub (missing in euro_Office build)
echo "Patching device_scale.js..."
docker exec "$CONTAINER" sh -c "cat > ${DOCROOT}/sdkjs/common/device_scale.js << 'STUB'
// device_scale.js stub — missing in euro_Office build
// Provides DPI scaling functions expected by the editor UI
window.AscCommon = window.AscCommon || {};
window.AscCommon.checkDeviceScale = function() {
  var dpr = window.devicePixelRatio || 1;
  return { devicePixelRatio: dpr, applicationPixelRatio: dpr, zoom: 1, correct: false };
};
window.AscCommon.correctApplicationScale = function(scale) {
  scale.correct = false;
  scale.zoom = 1;
  scale.applicationPixelRatio = scale.devicePixelRatio;
};
STUB"

# 2. Create formats@2.5x.svg stub (SVG sprite missing, PNGs exist)
echo "Patching formats@2.5x.svg..."
docker exec "$CONTAINER" sh -c 'echo "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>" > /var/www/onlyoffice/documentserver/web-apps/apps/common/main/resources/img/doc-formats/formats@2.5x.svg'

# 3. Create missing SVG icon stubs (iconssmall, iconsbig, iconshuge)
for name in iconssmall iconsbig iconshuge; do
  SVG_PATH="${DOCROOT}/web-apps/apps/documenteditor/main/resources/img/${name}@2.5x.svg"
  if ! docker exec "$CONTAINER" test -f "$SVG_PATH"; then
    echo "Patching ${name}@2.5x.svg..."
    docker exec "$CONTAINER" sh -c "echo '<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>' > $SVG_PATH"
  fi
done

echo "Done. eo-docs assets patched."
