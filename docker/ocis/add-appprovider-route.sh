#!/bin/sh
# Add app-provider route to OCIS proxy config
cat >> /etc/ocis/ocis.yaml << 'ENDOFROUTE'

proxy:
  additional_policies:
    - name: ocis
      routes:
        - endpoint: /app-provider/
          service: com.owncloud.api.app-provider
ENDOFROUTE
echo "Done. Appended proxy additional_policies to /etc/ocis/ocis.yaml"
