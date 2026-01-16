# Configuration Guide (Task 8.2)

## Overview

The Fediverse Identity Bridge uses environment variables for flexible deployment across different scenarios: local development, Docker containers, and multi-instance federation.

All configuration is optional with sensible production defaults.

---

## Environment Variables

### Bridge Configuration

#### `BRIDGE_PORT`
- **Type:** Integer (1-65535)
- **Default:** `4000`
- **Description:** TCP port for bridge service to listen on
- **Usage:**
  ```bash
  export BRIDGE_PORT=8080
  node bridge.js
  ```
- **Docker:**
  ```yaml
  environment:
    BRIDGE_PORT: 4000
  ports:
    - "4000:4000"
  ```

#### `BRIDGE_NETWORK`
- **Type:** String (IP address or hostname)
- **Default:** `127.0.0.1` (sidecar mode - localhost only)
- **Options:**
  - `127.0.0.1` — Localhost only (secure, sidecar mode) ✅ **RECOMMENDED**
  - `0.0.0.0` — All interfaces (public, use only in container)
  - `bridge.example.com` — Specific hostname
- **Description:** Network interface to bind to
- **Usage:**
  ```bash
  # Sidecar mode (default, secure)
  BRIDGE_NETWORK=127.0.0.1 node bridge.js
  
  # Public exposure in container
  BRIDGE_NETWORK=0.0.0.0 node bridge.js
  ```
- **Security Note:** Never expose bridge publicly unless behind reverse proxy with authentication

#### `BRIDGE_URL`
- **Type:** URL
- **Default:** `http://localhost:4000`
- **Description:** Bridge service URL (used by server for verification)
- **Usage:**
  ```bash
  # Local development
  BRIDGE_URL=http://localhost:4000 node server.js
  
  # Docker container
  BRIDGE_URL=http://bridge:4000 node server.js
  
  # Remote bridge (federation)
  BRIDGE_URL=https://bridge.example.com node server.js
  ```

---

### Redis Configuration

#### `REDIS_HOST`
- **Type:** String (hostname or IP)
- **Default:** `localhost`
- **Description:** Redis server hostname
- **Usage:**
  ```bash
  # Local Redis
  REDIS_HOST=localhost node bridge.js
  
  # Docker service
  REDIS_HOST=redis node bridge.js
  
  # Remote Redis
  REDIS_HOST=redis.example.com node bridge.js
  ```

#### `REDIS_PORT`
- **Type:** Integer (1-65535)
- **Default:** `6379`
- **Description:** Redis server port

#### `REDIS_DB`
- **Type:** Integer (0-15)
- **Default:** `0`
- **Description:** Redis database number (use different DB for isolation)
- **Usage:**
  ```bash
  # Development on DB 0
  REDIS_DB=0 node bridge.js
  
  # Testing on DB 1 (isolated)
  REDIS_DB=1 npm test
  
  # Production on DB 2
  REDIS_DB=2 node bridge.js
  ```

#### `REDIS_NAMESPACE`
- **Type:** String
- **Default:** `identity_bridge`
- **Description:** Redis key prefix (for multi-tenant deployments)
- **Usage:**
  ```bash
  # Service A
  REDIS_NAMESPACE=bridge_prod node bridge.js
  
  # Service B (same Redis, different namespace)
  REDIS_NAMESPACE=bridge_staging node bridge.js
  ```

#### `REDIS_VC_TTL`
- **Type:** Integer (seconds)
- **Default:** `86400` (24 hours)
- **Description:** Time-to-live for stored VCs
- **Usage:**
  ```bash
  # Keep VCs for 7 days
  REDIS_VC_TTL=604800 node bridge.js
  
  # Aggressive TTL (12 hours)
  REDIS_VC_TTL=43200 node bridge.js
  ```

#### `REDIS_DID_TTL`
- **Type:** Integer (seconds)
- **Default:** `604800` (7 days)
- **Description:** Time-to-live for cached DIDs
- **Usage:**
  ```bash
  # DIDs valid for 30 days
  REDIS_DID_TTL=2592000 node bridge.js
  ```

#### `REDIS_PASSWORD` (Optional)
- **Type:** String
- **Default:** None
- **Description:** Redis authentication password
- **Usage:**
  ```bash
  REDIS_PASSWORD=secretpass node bridge.js
  ```

---

### Server Configuration

#### `PORT`
- **Type:** Integer (1-65535)
- **Default:** `3000`
- **Description:** ActivityPub server listen port
- **Usage:**
  ```bash
  PORT=8000 node server.js
  ```

#### `DOMAIN`
- **Type:** String (hostname:port or IP:port)
- **Default:** `localhost:3000`
- **Description:** Public domain for actor URLs
- **Usage:**
  ```bash
  # Local development
  DOMAIN=localhost:3000 node server.js
  
  # Production
  DOMAIN=activitypub.example.com node server.js
  ```

#### `USERS`
- **Type:** Comma-separated string
- **Default:** `alice`
- **Description:** Users to create on server startup
- **Usage:**
  ```bash
  # Single user
  USERS=alice node server.js
  
  # Multiple users
  USERS=alice,bob,carol node server.js
  ```

---

### Logging Configuration

#### `LOG_LEVEL`
- **Type:** String (`debug`, `info`, `warn`, `error`)
- **Default:** `info`
- **Description:** Minimum log level to output
- **Usage:**
  ```bash
  # Verbose debugging
  LOG_LEVEL=debug node bridge.js
  
  # Quiet production
  LOG_LEVEL=error node bridge.js
  ```

#### `METRICS_ENABLED`
- **Type:** Boolean (`true` or `false`)
- **Default:** `true`
- **Description:** Enable metrics collection
- **Usage:**
  ```bash
  # Enable metrics CSV output
  METRICS_ENABLED=true node bridge.js
  ```

---

## Deployment Scenarios

### 1. Local Development (Default)

```bash
# Terminal 1: Start Redis
redis-server

# Terminal 2: Start bridge
node bridge.js
# Listens on 127.0.0.1:4000

# Terminal 3: Start server
DOMAIN=localhost:3000 node server.js
# Connects to http://localhost:4000/verify
```

**Environment:**
```bash
BRIDGE_NETWORK=127.0.0.1
BRIDGE_URL=http://localhost:4000
REDIS_HOST=localhost
PORT=3000
```

---

### 2. Docker Sidecar (Recommended for Production)

```bash
# Single command starts both services
docker-compose up
```

**docker-compose.yml (environment section):**
```yaml
bridge:
  environment:
    BRIDGE_NETWORK: 0.0.0.0      # Accept all interfaces in container
    BRIDGE_PORT: 4000
    REDIS_HOST: redis            # Use service name for DNS
    REDIS_PORT: 6379
    NODE_ENV: production
```

**server (optional):**
```yaml
server:
  environment:
    BRIDGE_URL: http://bridge:4000  # Use service name for DNS
    DOMAIN: localhost:3000
    NODE_ENV: production
```

---

### 3. Multi-Instance Federation (Advanced)

**Bridge Instance 1:**
```bash
export BRIDGE_PORT=4000
export BRIDGE_NETWORK=0.0.0.0
export REDIS_HOST=redis.example.com
export REDIS_NAMESPACE=bridge_instance_1
node bridge.js
```

**Bridge Instance 2 (same Redis, different namespace):**
```bash
export BRIDGE_PORT=4000
export BRIDGE_NETWORK=0.0.0.0
export REDIS_HOST=redis.example.com
export REDIS_NAMESPACE=bridge_instance_2
node bridge.js
```

**Server connected to specific bridge:**
```bash
export BRIDGE_URL=http://bridge1.example.com:4000
export DOMAIN=server1.example.com
node server.js
```

---

### 4. Testing/CI Environment

```bash
# Use isolated Redis DB for tests
export REDIS_DB=1
export LOG_LEVEL=error
npm test
```

**Key settings:**
- `REDIS_DB=1` — Separate from production (DB 0)
- `LOG_LEVEL=error` — Suppress verbose output
- `BRIDGE_PORT=4000+` — Auto-increment if in use

---

## Configuration Examples

### Production Setup (DigitalOcean, AWS, etc.)

```bash
# .env for production server
BRIDGE_URL=https://bridge.myapp.com
BRIDGE_NETWORK=127.0.0.1      # No public exposure
BRIDGE_PORT=4000

REDIS_HOST=redis.prod.internal
REDIS_PORT=6379
REDIS_PASSWORD=strongpassword
REDIS_DB=0
REDIS_NAMESPACE=fediverse_prod
REDIS_VC_TTL=604800           # 7 days

DOMAIN=myapp.example.com
USERS=admin,user1,user2
LOG_LEVEL=warn
METRICS_ENABLED=false         # Disable CSV output
```

**Start with:**
```bash
# Load .env file
set -a; source .env; set +a
node bridge.js &
node server.js
```

---

### Development with Hot Reload

```bash
# Install nodemon
npm install --save-dev nodemon

# .env for development
BRIDGE_PORT=4000
BRIDGE_NETWORK=127.0.0.1
DOMAIN=localhost:3000
LOG_LEVEL=debug
METRICS_ENABLED=true

# Run with hot reload
nodemon bridge.js
nodemon server.js
```

---

### Docker with Custom Configuration

**docker-compose.override.yml (for local development):**
```yaml
version: '3.8'

services:
  bridge:
    environment:
      LOG_LEVEL: debug
      BRIDGE_NETWORK: 0.0.0.0  # Expose for testing
    ports:
      - "4000:4000"
```

**Start:**
```bash
docker-compose -f docker-compose.yml -f docker-compose.override.yml up
```

---

## Troubleshooting

### Bridge not connecting to Redis

**Error:** `Error: ECONNREFUSED 127.0.0.1:6379`

**Solutions:**
1. Ensure Redis is running: `redis-cli ping`
2. Check REDIS_HOST: `echo $REDIS_HOST`
3. Check REDIS_PORT: `echo $REDIS_PORT`
4. Test connection: `redis-cli -h $REDIS_HOST -p $REDIS_PORT ping`

```bash
# Debug connection
REDIS_HOST=localhost REDIS_PORT=6379 node -e "
  const redis = require('redis');
  const client = redis.createClient({
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT
  });
  client.on('connect', () => console.log('✅ Connected'));
  client.on('error', e => console.log('❌', e.message));
"
```

### Server cannot reach bridge

**Error:** `Error: Bridge unreachable`

**Solutions:**
1. Check BRIDGE_URL: `echo $BRIDGE_URL`
2. Test bridge: `curl $BRIDGE_URL/health`
3. Check firewall: `netstat -an | grep 4000`
4. Check logs: `docker logs fediverse-bridge`

```bash
# Test bridge connectivity
curl -v http://localhost:4000/health
```

### Port already in use

**Error:** `Error: EADDRINUSE :::4000`

**Solutions:**
1. Check what's using port: `lsof -i :4000` (macOS/Linux) or `netstat -ano | findstr :4000` (Windows)
2. Use different port: `BRIDGE_PORT=5000 node bridge.js`
3. Kill process: `kill -9 <PID>` (be careful!)

---

## Environment Variable Validation

To validate environment configuration:

```javascript
// config.js
const required = ['REDIS_HOST', 'BRIDGE_PORT'];
const optional = ['LOG_LEVEL', 'METRICS_ENABLED'];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
}

module.exports = {
  redis: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379'),
    db: parseInt(process.env.REDIS_DB || '0')
  },
  bridge: {
    port: parseInt(process.env.BRIDGE_PORT || '4000'),
    network: process.env.BRIDGE_NETWORK || '127.0.0.1',
    url: process.env.BRIDGE_URL || 'http://localhost:4000'
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    metricsEnabled: process.env.METRICS_ENABLED === 'true'
  }
};
```

---

## Summary

| Scenario | BRIDGE_NETWORK | BRIDGE_URL | REDIS_HOST | NODE_ENV |
|----------|---|---|---|---|
| **Development** | `127.0.0.1` | `http://localhost:4000` | `localhost` | `development` |
| **Docker** | `0.0.0.0` | `http://bridge:4000` | `redis` | `production` |
| **Federation** | `0.0.0.0` | `https://bridge.example.com` | `redis.internal` | `production` |
| **Testing** | `127.0.0.1` | `http://localhost:4000` | `localhost` (DB 1) | `test` |

For more examples, see [examples/](../examples/) directory.
