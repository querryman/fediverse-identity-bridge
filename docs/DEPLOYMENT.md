# Deployment Guide (Task 9.3)

Complete guide for deploying the Fediverse Identity Bridge to production.

---

## Table of Contents

1. [Local Development](#local-development)
2. [Docker Sidecar](#docker-sidecar)
3. [Multi-Instance Federation](#multi-instance-federation)
4. [Monitoring & Health Checks](#monitoring--health-checks)
5. [Security Hardening](#security-hardening)
6. [Troubleshooting](#troubleshooting)

---

## Local Development

### Prerequisites
- Node.js 18+
- Redis 7+
- npm

### Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start Redis
redis-server

# 3. Start bridge (terminal 1)
node bridge.js
# Output: Bridge listening on 127.0.0.1:4000 (sidecar mode)

# 4. Start server (terminal 2)
node server.js
# Output: Listening on 0.0.0.0:3000

# 5. Test
npm test
# Output: 34 passing (159ms)
```

### Environment

Default `.env`:
```bash
BRIDGE_PORT=4000
BRIDGE_NETWORK=127.0.0.1
BRIDGE_URL=http://localhost:4000
REDIS_HOST=localhost
REDIS_PORT=6379
PORT=3000
DOMAIN=localhost:3000
USERS=alice,bob,carol
```

---

## Docker Sidecar

### Recommended for Production

```bash
# Build and run with docker-compose
docker-compose up

# Services:
# - redis:6379 (internal)
# - bridge:4000 (internal)
# - server:3000 (optional, commented by default)
```

### docker-compose.yml Structure

```yaml
version: '3.8'

services:
  redis:
    image: redis:7-alpine
    environment:
      REDIS_APPENDONLY: yes
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]

  bridge:
    build: .
    environment:
      REDIS_HOST: redis      # Use service name
      BRIDGE_NETWORK: 0.0.0.0  # Accept all in container
      BRIDGE_PORT: 4000
    depends_on:
      redis:
        condition: service_healthy
```

### Environment Override

For local testing override defaults:

**docker-compose.override.yml:**
```yaml
version: '3.8'

services:
  bridge:
    environment:
      LOG_LEVEL: debug
      BRIDGE_NETWORK: 0.0.0.0
    ports:
      - "4000:4000"
```

Start with override:
```bash
docker-compose -f docker-compose.yml -f docker-compose.override.yml up
```

### Docker Build

**Dockerfile** (already created):
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
ENV BRIDGE_NETWORK=0.0.0.0
ENV BRIDGE_PORT=4000
HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD node -e "..."
CMD ["node", "bridge.js"]
```

### Build Custom Image

```bash
# Build
docker build -t fediverse-bridge:latest .

# Run standalone
docker run -p 4000:4000 \
  -e REDIS_HOST=redis.internal \
  -e BRIDGE_URL=http://bridge:4000 \
  fediverse-bridge:latest

# Push to registry
docker tag fediverse-bridge:latest myregistry.azurecr.io/bridge:1.0.0
docker push myregistry.azurecr.io/bridge:1.0.0
```

---

## Multi-Instance Federation

### Architecture

```
┌────────────────────────────────────────────────────────┐
│ Load Balancer (nginx, HAProxy, AWS ALB)                │
│ - Route /verify, /store to healthy bridge instance    │
│ - Route other requests to server                       │
└───────────┬───────────────────────────┬────────────────┘
            │                           │
      ┌─────▼─────┐             ┌──────▼──────┐
      │ Bridge 1  │             │ Bridge 2    │
      │ :4000     │             │ :4000       │
      └─────┬─────┘             └──────┬──────┘
            │                           │
            └───────────┬───────────────┘
                        │
                  ┌─────▼──────┐
                  │ Redis      │
                  │ :6379      │
                  │ (shared)   │
                  └────────────┘
```

### Configuration

**Bridge 1:**
```bash
export BRIDGE_PORT=4000
export BRIDGE_NETWORK=0.0.0.0
export REDIS_HOST=redis.cluster.internal
export REDIS_NAMESPACE=bridge_prod
node bridge.js
```

**Bridge 2:**
```bash
export BRIDGE_PORT=4000
export BRIDGE_NETWORK=0.0.0.0
export REDIS_HOST=redis.cluster.internal
export REDIS_NAMESPACE=bridge_prod
node bridge.js
```

**Server (routes to first healthy bridge):**
```bash
export BRIDGE_URL=http://bridge-lb.internal:4000
export DOMAIN=example.com
node server.js
```

### Load Balancer Config (nginx)

```nginx
upstream bridges {
    server bridge1.internal:4000 max_fails=3 fail_timeout=30s;
    server bridge2.internal:4000 max_fails=3 fail_timeout=30s;
}

server {
    listen 443 ssl http2;
    server_name bridge.example.com;

    ssl_certificate /etc/letsencrypt/live/bridge.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/bridge.example.com/privkey.pem;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req zone=api burst=50 nodelay;

    location / {
        proxy_pass http://bridges;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto https;
        
        # Timeouts
        proxy_connect_timeout 5s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;
    }

    # Health check endpoint
    location /health {
        proxy_pass http://bridges;
        access_log off;
    }
}
```

---

## Monitoring & Health Checks

### Health Endpoint

Implement in bridge.js:
```javascript
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    redis: 'connected'  // Check Redis connection
  });
});
```

Test:
```bash
curl http://127.0.0.1:4000/health
# {"status": "ok", "timestamp": "2026-01-16T12:00:00Z", "redis": "connected"}
```

### Prometheus Metrics

Add metrics collection:
```javascript
const promClient = require('prom-client');

const verifyCounter = new promClient.Counter({
  name: 'bridge_verify_total',
  help: 'Total verification requests',
  labelNames: ['status']  // 'valid' or 'invalid'
});

const verifyDuration = new promClient.Histogram({
  name: 'bridge_verify_duration_seconds',
  help: 'Verification latency',
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5]
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', promClient.register.contentType);
  res.end(await promClient.register.metrics());
});
```

### Monitoring Stack

**docker-compose-monitoring.yml:**
```yaml
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus-data:/prometheus
    command:
      - --config.file=/etc/prometheus/prometheus.yml

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3001:3000"
    environment:
      GF_SECURITY_ADMIN_PASSWORD: admin
    volumes:
      - grafana-data:/var/lib/grafana

volumes:
  prometheus-data:
  grafana-data:
```

**prometheus.yml:**
```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'bridge'
    static_configs:
      - targets: ['localhost:4000']
```

---

## Security Hardening

### 1. Network Isolation

```bash
# Run bridge on private network only
docker network create bridge-internal --internal

docker-compose up
# All containers on isolated network
```

### 2. TLS/HTTPS

```bash
# Reverse proxy with TLS certificate
certbot certonly --standalone -d bridge.example.com

# nginx config
ssl_certificate /etc/letsencrypt/live/bridge.example.com/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/bridge.example.com/privkey.pem;
ssl_protocols TLSv1.2 TLSv1.3;
```

### 3. Redis Security

```bash
# Set Redis password
redis-server --requirepass strongpassword

# Use in bridge
export REDIS_PASSWORD=strongpassword

# Docker
redis:
  environment:
    REDIS_PASSWORD: strongpassword
  command: redis-server --requirepass strongpassword
```

### 4. Rate Limiting

```bash
# nginx.conf
limit_req_zone $binary_remote_addr zone=verify:10m rate=100r/s;
location /verify {
    limit_req zone=verify burst=500 nodelay;
    proxy_pass http://backend;
}
```

### 5. DDoS Protection

- Use AWS Shield, Cloudflare, or similar
- Implement geo-blocking if needed
- Monitor for suspicious patterns

### 6. Logging & Audit

```bash
# Enable structured logging
export LOG_LEVEL=info

# Log file rotation
export LOG_FILE=/var/log/bridge/bridge.log
# With logrotate in crontab: "0 0 * * * /usr/sbin/logrotate /etc/logrotate.d/bridge"
```

---

## Troubleshooting

### Bridge Won't Start

**Error:** `Error: EADDRINUSE :::4000`

**Solution:**
```bash
# Find process using port
netstat -ano | findstr :4000
# Or on macOS/Linux:
lsof -i :4000

# Kill process
kill -9 <PID>

# Or use different port
BRIDGE_PORT=5000 node bridge.js
```

### Redis Connection Failed

**Error:** `Error: ECONNREFUSED 127.0.0.1:6379`

**Solution:**
```bash
# Check Redis is running
redis-cli ping
# Output: PONG

# Or start Redis
redis-server

# Check REDIS_HOST env var
echo $REDIS_HOST
```

### Bridge Hangs on Startup

**Error:** Process starts but never listens

**Solution:**
```bash
# Enable debug logging
LOG_LEVEL=debug node bridge.js

# Check Redis connection explicitly
redis-cli -h $REDIS_HOST -p $REDIS_PORT ping

# Increase timeout
node --max-old-space-size=2048 bridge.js
```

### High Latency on /verify

**Error:** Requests taking 5+ seconds

**Causes & Solutions:**
1. **Slow Redis:** Check Redis performance, consider shared Redis vs. local
2. **Network latency:** Use VPC, reduce hops
3. **Chain resolution:** Long identity chains slow verification
   - Check `/lineage/actor` logs
   - Increase `maxDepth` for early termination
4. **Load spike:** Add more bridge instances behind load balancer

### Memory Leak

**Error:** Bridge process grows from 100MB → 1GB over time

**Solution:**
```bash
# Enable heap snapshots
node --expose-gc bridge.js

# Monitor with pm2
pm2 start bridge.js --max-memory-restart 500M

# Check for leaks
node --inspect bridge.js
# Then use Chrome DevTools (chrome://inspect)
```

### Database Replication Issues

**Error:** Redis replicas out of sync

**Solution:**
```bash
# Check replication status
redis-cli -h redis-master info replication

# Force sync
redis-cli -h redis-slave SLAVEOF NO ONE
redis-cli -h redis-slave SLAVEOF redis-master 6379
```

---

## Performance Tuning

### Redis Optimization

```redis
# redis.conf
maxmemory 2gb
maxmemory-policy allkeys-lru
tcp-keepalive 60
timeout 300

# Enable persistence
save 900 1  # Save if 1 key changed in 900 seconds
save 300 10  # Save if 10 keys changed in 300 seconds
save 60 10000  # Save if 10000 keys changed in 60 seconds
```

### Node.js Tuning

```bash
# Increase file descriptors
ulimit -n 65535

# Use clustered mode (multiple processes)
npm install cluster
# See examples/cluster.js

# Increase heap size
node --max-old-space-size=4096 bridge.js
```

### Docker Resource Limits

```yaml
services:
  bridge:
    resources:
      limits:
        cpus: '2'
        memory: 2G
      reservations:
        cpus: '1'
        memory: 1G
```

---

## Rollback Procedure

If deployment breaks:

```bash
# 1. Stop current bridge
docker-compose down

# 2. Backup Redis data
docker exec fediverse-bridge-redis redis-cli --rdb /data/dump-backup.rdb

# 3. Roll back to previous image
docker pull myregistry.azurecr.io/bridge:previous-tag
docker tag myregistry.azurecr.io/bridge:previous-tag fediverse-bridge:latest

# 4. Restart with old image
docker-compose up
```

---

## Backup & Recovery

### Redis Backup

```bash
# Backup to file
redis-cli BGSAVE
# Creates dump.rdb in Redis data dir

# Backup to S3
aws s3 cp dump.rdb s3://backups/redis-$(date +%s).rdb

# Restore from backup
docker exec fediverse-bridge-redis redis-cli SHUTDOWN
docker cp dump.rdb fediverse-bridge-redis:/data/dump.rdb
docker start fediverse-bridge-redis
```

### Cross-Region Replication

```yaml
# Primary region
redis-primary:
  ports:
    - "6379:6379"

# Secondary region (read-only)
redis-replica:
  command: redis-server --slaveof redis-primary 6379 --read-only
  depends_on:
    - redis-primary
```

---

## Cost Estimation (AWS)

| Component | Size | Monthly Cost |
|-----------|------|-------------|
| Bridge (2x t3.medium) | 2 vCPU, 4GB RAM | $60 |
| Redis (r6g.large) | 2 vCPU, 16GB RAM | $80 |
| Network (100GB/month) | egress | $20 |
| RDS backup | 50GB | $5 |
| **Total** | | **~$165/month** |

---

## Next Steps

1. ✅ Test deployment locally
2. ✅ Set up CI/CD (GitHub Actions, GitLab CI)
3. ✅ Configure monitoring (Prometheus + Grafana)
4. ✅ Establish backup strategy
5. ✅ Plan disaster recovery
6. ✅ Document runbooks
7. ✅ Schedule security audit

For more info, see:
- [CONFIGURATION.md](CONFIGURATION.md) — Environment setup
- [API.md](API.md) — Endpoint reference
- [README.md](../README.md) — Overview
