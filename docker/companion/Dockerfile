# =============================================================================
# eurooffice-opencloud Companion Dockerfile
# =============================================================================
#
# This builds a Docker image for the companion dashboard that:
# - Serves the setup wizard at /setup
# - Provides the dashboard at /
# - Exposes health API at /api/health
#
# The companion source is copied from the local workspace at build time.

FROM node:20-alpine

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init curl

# Create app directory
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S companion && \
    adduser -S -u 1001 -G companion companion

# Copy package files first (for better caching)
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Copy application source
COPY . .

# Create data directories
RUN mkdir -p data/ocis data/documentserver data/traefik && \
    chown -R companion:companion data

# Copy environment configuration
COPY docker/companion/.env ./.env

# Switch to non-root user
USER companion

# Expose dashboard port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=30 \
    CMD curl -f http://localhost:3000/api/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the companion app
CMD ["node", "app.js"]
