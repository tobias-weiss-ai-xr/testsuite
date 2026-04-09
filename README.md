# euro_Office Test Suite

End-to-end test suite for euro_Office integration components.

## Overview

This repository contains automated E2E tests for the euro_Office document editing stack:

- **Document Server** - WOPI client (editor) built from [euro_Office/core](https://codeberg.org/euro_Office/core)
- **OCIS** - ownCloud Infinite Scale (WOPI host) for file storage
- **Companion** - Deployment dashboard and orchestration layer

## Architecture

```
┌─────────────────┐
│   Companion     │  Dashboard at http://localhost:3000
│   (Port 3000)   │  Health API: /api/health
└────────┬────────┘
         │
         │ orchestrates
         │
┌────────┴────────┐     WOPI      ┌─────────────────┐
│      OCIS       │◄──────────────►│ Document Server │
│   (Port 9200)   │                │   (Port 8080)   │
│                 │                │                 │
│ File storage    │                │ Editor backend  │
│ WOPI host       │                │ WOPI client     │
└─────────────────┘                └─────────────────┘
```

**Data Flow:**
1. User opens document in OCIS
2. OCIS WOPI service requests edit session from Document Server
3. Document Server loads editor with JWT authentication
4. Changes sync via WOPI protocol

## Prerequisites

- **Docker** 20.10+
- **Docker Compose** 2.0+
- **Node.js** 20+ (for running tests locally)
- **Git** (with SSH key for Codeberg)

## Quick Start

### 1. Clone and Install

```bash
git clone git@codeberg.org:euro_Office/testsuite.git
cd testsuite
npm install
```

### 2. Build Docker Images

**First time only** (takes 2-4 hours for C++ build):

```bash
./scripts/start-test-stack.sh --build
```

**Subsequent runs** (uses cached images):

```bash
./scripts/start-test-stack.sh
```

### 3. Run Tests

```bash
npm test
```

### 4. Stop Stack

```bash
./scripts/stop-test-stack.sh
```

To also remove volumes (clean slate):

```bash
./scripts/stop-test-stack.sh --clean
```

## Test Coverage

### Health Checks (`tests/e2e/health/`)

| Test File | What It Tests |
|-----------|---------------|
| `documentserver.test.js` | DS container status, `/hosting/discovery`, `/healthcheck` |
| `ocis.test.js` | OCIS container status, `/health`, OIDC discovery |
| `companion.test.js` | Companion container status, `/api/health`, service reachability |
| `stack.test.js` | Full stack integration, cross-service communication |

### WOPI Protocol (`tests/e2e/wopi/`)

| Test File | What It Tests |
|-----------|---------------|
| `discovery.test.js` | WOPI discovery XML structure, file extension handlers, action URLs |

### API Endpoints (`tests/e2e/api/`)

| Test File | What It Tests |
|-----------|---------------|
| `companion.test.js` | `/api/health`, `/api/config` (no secrets), `/api/health/wopi`, `/setup` validation |

## Configuration

### Environment Variables (`.env.test`)

```bash
# Service URLs
DOCUMENT_SERVER_URL=http://localhost:8080
OCIS_URL=http://localhost:9200
COMPANION_URL=http://localhost:3000

# JWT Secrets (must match between services)
OCIS_JWT_SECRET=<32+ char secret>
DOCUMENT_SERVER_JWT_SECRET=<32+ char secret>

# Timeouts (milliseconds)
HEALTH_CHECK_TIMEOUT=120000    # 2 min per service
GLOBAL_TIMEOUT=600000          # 10 min total
```

### Test Credentials

Default demo users (created by OCIS):
- **Username:** `admin` / **Password:** `admin`
- **Username:** `testuser` / **Password:** `testuser`

## Docker Compose Stack

The test stack is defined in `docker-compose.test.yml`:

| Service | Image | Port | Health Check |
|---------|-------|------|--------------|
| `documentserver` | Built from `./docker/documentserver/` | 8080 | `/hosting/discovery` |
| `ocis` | `owncloud/ocis:5.0` | 9200 | `/health` |
| `companion` | Built from `./docker/companion/` | 3000 | `/api/health` |

## CI Pipeline

Forgejo Actions workflow (`.forgejo/workflows/e2e.yml`):

1. **Lint job** - Runs ESLint on all code
2. **E2E job** - Builds images, starts stack, runs tests

**Trigger:** Push to `main` or pull request

**Timeout:** 90 minutes total (build + test)

**Artifacts:** Docker logs uploaded on failure

## Troubleshooting

### Document Server Won't Start

**Symptom:** Health check times out, container restarts

**Causes:**
1. C++ build incomplete - check build logs
2. sdkjs submodule not initialized - verify git clone
3. JWT secret mismatch - check .env.test

**Solution:**
```bash
# Rebuild from scratch
docker compose -f docker-compose.test.yml down -v
docker compose -f docker-compose.test.yml build --no-cache
```

### OCIS Health Check Fails

**Symptom:** `/health` returns 503

**Causes:**
1. OCIS waiting for Document Server
2. JWT secret mismatch
3. Demo users not created

**Solution:**
```bash
# Check OCIS logs
docker compose -f docker-compose.test.yml logs ocis

# Verify JWT secrets match
grep JWT_SECRET docker/ocis/.env
grep JWT_SECRET docker/documentserver/.env
```

### Tests Timeout

**Symptom:** Jest times out waiting for services

**Causes:**
1. Stack not fully started
2. Service health checks failing

**Solution:**
```bash
# Manually verify services
curl http://localhost:8080/hosting/discovery
curl http://localhost:9200/health
curl http://localhost:3000/api/health

# Increase timeout in jest.config.js
testTimeout: 600000  # 10 minutes
```

### Port Already in Use

**Symptom:** Docker fails to start containers

**Solution:**
```bash
# Check what's using the port
lsof -i :8080  # or :9200, :3000

# Stop conflicting services
docker compose -f docker-compose.test.yml down
```

## Project Structure

```
testsuite/
├── docker/
│   ├── documentserver/
│   │   ├── Dockerfile          # Multi-stage build from core/ fork
│   │   └── build.sh            # Build helper script
│   ├── ocis/
│   │   ├── .env                # OCIS test configuration
│   │   └── web-ui.json         # WOPI handler config
│   └── companion/
│       ├── Dockerfile          # Companion app Dockerfile
│       └── .env                # Companion test configuration
├── tests/
│   ├── setup.js                # Jest global setup
│   ├── helpers/
│   │   └── docker.js           # Docker utilities
│   └── e2e/
│       ├── health/             # Health check tests
│       ├── wopi/               # WOPI protocol tests
│       └── api/                # API endpoint tests
├── scripts/
│   ├── start-test-stack.sh     # Start Docker stack
│   ├── stop-test-stack.sh      # Stop Docker stack
│   └── wait-for-stack.sh       # Wait for services (CI)
├── .forgejo/
│   └── workflows/
│       └── e2e.yml             # CI pipeline
├── docker-compose.test.yml     # Test stack definition
├── jest.config.js              # Jest configuration
├── package.json                # Dependencies
└── .env.test                   # Test environment variables
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests locally: `npm test`
5. Submit a pull request

## Related Projects

- [eurooffice-opencloud](https://codeberg.org/euro_Office/eurooffice-opencloud) - Companion app
- [core](https://codeberg.org/euro_Office/core) - Document Server core (C++)
- [OCIS](https://github.com/owncloud/ocis) - ownCloud Infinite Scale

---

> **Disclaimer:** euro_Office is an independent open-source fork hosted on Codeberg and is not affiliated with, endorsed by, or controlled by any of the upstream projects or integration providers referenced in this repository (including ONLYOFFICE, Ascensio System SIA, and others). euro_Office is entirely separate from "Euro-Office" (a GitHub organization associated with Nextcloud and IONOS). euro_Office maintains its own development roadmap, release cycle, and support channels.
>
> All meaningful pull requests from ONLYOFFICE and Euro-Office on GitHub have been reviewed and, where applicable, synced into this fork. An automated watch is in place that continuously monitors and integrates relevant upstream developments.

**© 2026 euro_Office. Released under AGPL-3.0.**
