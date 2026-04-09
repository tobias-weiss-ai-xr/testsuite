#!/bin/sh
# Patch ocis.yaml after ocis init
# This must run AFTER ocis init has created the config file

CONFIG_FILE="/etc/ocis/ocis.yaml"

# 1. Fix JWT secret — ocis init generates a random one, but we need a known value
#    for WOPI token signing to match COLLABORATION_WOPI_SECRET
sed -i "s|^  jwt_secret:.*|  jwt_secret: mysecret|" "$CONFIG_FILE"

# 2. Add proxy additional_policies for /app-registry/
#    Note: /app-provider/ is NOT needed — the frontend service already handles
#    /app/open via the "approvider" rhttp service at /app prefix
if grep -q "additional_policies" "$CONFIG_FILE" 2>/dev/null; then
  echo "additional_policies already present, skipping"
else
  sed -i '/^proxy:/a\  additional_policies:\n    - name: ocis\n      routes:\n        - endpoint: /app-registry/\n          service: com.owncloud.api.app-registry' "$CONFIG_FILE"
fi

echo "Patched ocis.yaml"
