# Running Fediverse Identity Bridge on macOS

Complete guide for setting up and running the project and experiments locally on a Mac.

---

## Prerequisites

### System Requirements
- macOS 10.15+ (Catalina or later)
- At least 4GB RAM available
- Ports 3000, 3001, 4000, 6379 available

### Required Software

1. **Node.js 18+**
   ```bash
   # Install via Homebrew
   brew install node
   
   # Verify
   node --version   # v18.x.x or higher
   npm --version    # 9.x.x or higher
   ```

2. **Redis** (for bridge storage)
   ```bash
   # Install via Homebrew
   brew install redis
   
   # Verify
   redis-cli --version
   ```

3. **Git** (to clone or manage the repo)
   ```bash
   git --version
   ```

---

## Project Setup

### 1. Install Dependencies

```bash
# Navigate to project root
cd ~/path/to/fediverse-identity-bridge

# Install npm packages
npm install

# Verify installation
npm list @noble/ed25519 redis express
```

### 2. Verify Port Availability

```bash
# Check if ports are free
lsof -i :3000   # Server port
lsof -i :3001   # Second node port
lsof -i :4000   # Bridge port
lsof -i :6379   # Redis port

# If any are in use, kill them:
# kill -9 $(lsof -t -i :3000)
```

---

## Basic Project Execution

### Option A: Quick Demo (All-in-One)

Starts two ActivityPub nodes + bridge + runs a migration demo:

```bash
# Terminal 1: Run the complete demo
node spawn_nodes.js

# Output should show:
# - Node 1 listening on 3000
# - Node 2 listening on 3001
# - Bridge listening on 4000
# - Migration VC creation and verification steps
```

### Option B: Manual Setup (Recommended for Development)

Run each component in separate terminals:

**Terminal 1 — Start Redis:**
```bash
redis-server
# Output: Ready to accept connections
```

**Terminal 2 — Start Bridge:**
```bash
node bridge.js
# Output: Bridge listening on 127.0.0.1:4000 (sidecar mode)
```

**Terminal 3 — Start First ActivityPub Node:**
```bash
PORT=3000 DOMAIN=localhost:3000 node server.js
# Output: Listening on 0.0.0.0:3000
```

**Terminal 4 — Start Second Node (Optional):**
```bash
PORT=3001 DOMAIN=localhost:3001 node server.js
# Output: Listening on 0.0.0.0:3001
```

**Terminal 5 — Test Endpoints:**
```bash
# Get actor
curl http://localhost:3000/actor/alice

# Create actor
curl -X POST http://localhost:3000/actor \
  -H "Content-Type: application/json" \
  -d '{"username":"alice"}'

# Verify VC on bridge
curl -X POST http://localhost:4000/verify \
  -H "Content-Type: application/json" \
  -d '{"vc":{...}}'
```

---

## Testing

### Run Unit Tests

```bash
# Terminal (doesn't require other services running)
npm test

# Expected output:
# ✓ Creates Ed25519 keypair
# ✓ Derives DID from public key
# ✓ Issues MigrationVC
# ✓ Verifies VC with valid signature
# ... (34 passing total)
```

### Run Integration Tests

```bash
# Requires Redis + bridge running
npm test -- tests/migration_test.js --grep "integration"
```

---

## Running Experiments

Experiments measure performance, latency, and throughput under various conditions.

### Prerequisites

Experiments require:
- Redis running (`redis-server`)
- Node.js 18+
- ~5-10 minutes per experiment
- ~100MB disk space for results

### Available Experiments

1. **Concurrency Sweep** — Measure latency at different concurrency levels
2. **Scaling Test** — Measure throughput as load increases
3. **Chain Depth Test** — Measure verification time for identity chains
4. **Federation Test** — Measure cross-node migration

### Running Individual Experiments

**Experiment 1: Concurrency Sweep**
```bash
# Terminal 1: Start Redis (if not running)
redis-server

# Terminal 2: Run concurrency sweep
cd experiments
node experiment_concurrency_sweep.js

# Output: Creates results/sweep_<timestamp>/ with:
# - sweep_raw.csv (per-request latency data)
# - summary.json (aggregated stats)
# - latency.png (plot of results)
```

**Experiment 2: Scaling Test**
```bash
cd experiments
node experiment_scaling.js

# Output: Creates results/scaling_<timestamp>/
```

**Experiment 3: Chain Depth Benchmark**
```bash
cd experiments
node bench_chain_depth.js

# Output: Creates results/chain_depth_<timestamp>/
```

### Running All Experiments

**Using Shell Script (macOS/Linux):**
```bash
cd experiments
bash run_all_experiments.sh

# Runs all experiments sequentially (~30 minutes total)
# Results saved to results/<experiment>_<timestamp>/
```

**Using Node Script:**
```bash
cd experiments
node summarize_bench.js

# Generates combined summary of recent experiments
```

### Understanding Experiment Results

Each experiment produces:

1. **CSV Files** — Raw data (one row per request)
   ```
   i,latency_ms,valid,bridge_ram_mb,system_ram_mb
   0,12.5,1,45.2,2048.3
   1,13.1,1,45.3,2048.5
   ```

2. **summary.json** — Aggregated statistics
   ```json
   {
     "concurrency": 10,
     "total_requests": 300,
     "avg_latency_ms": 12.8,
     "p95_latency_ms": 18.2,
     "p99_latency_ms": 22.1,
     "throughput_rps": 78.5,
     "failures": 0,
     "memory_peak_mb": 52.1
   }
   ```

3. **PNG Plots** — Visual representations
   - Latency vs concurrency
   - Throughput curves
   - Memory usage over time

### Viewing Results

```bash
# List recent results
ls -lah experiments/results/

# View summary of a specific run
cat experiments/results/sweep_<timestamp>/summary.json | jq .

# Display plot (macOS)
open experiments/results/sweep_<timestamp>/latency.png

# Export summary to CSV for spreadsheet
cat experiments/results/sweep_<timestamp>/sweep_raw.csv
```

### Customizing Experiments

Edit the experiment files to change parameters:

**experiment_concurrency_sweep.js:**
```javascript
const CONCURRENCY_LEVELS = [1, 2, 5, 10, 20, 40, 80];  // Change these
const REQUESTS_PER_LEVEL = 300;                         // Or this
```

**experiment_scaling.js:**
```javascript
const LOAD_INCREMENTS = [10, 50, 100, 200, 500];  // Change load steps
```

---

## Environment Configuration

### Default Environment Variables

```bash
# Bridge
BRIDGE_PORT=4000
BRIDGE_NETWORK=127.0.0.1
BRIDGE_URL=http://localhost:4000

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0

# Server
PORT=3000
DOMAIN=localhost:3000
USERS=alice,bob,carol

# Logging
LOG_LEVEL=info
LOG_FILE=bridge.log
```

### Override Environment Variables

```bash
# For a single command
BRIDGE_PORT=5000 node bridge.js

# For multiple variables
PORT=3000 DOMAIN=example.local REDIS_HOST=redis.local node server.js

# Using .env file
echo "BRIDGE_PORT=5000" > .env
source .env
node bridge.js
```

---

## Common Tasks

### Development Workflow

```bash
# 1. Start development environment (Redis + Bridge)
redis-server &
node bridge.js &

# 2. Start server
node server.js

# 3. In another terminal, run tests
npm test

# 4. Clean up
kill %1  # Kill redis
kill %2  # Kill bridge
kill %3  # Kill server
```

### Creating New Actors

```bash
# Create alice
curl -X POST http://localhost:3000/actor \
  -H "Content-Type: application/json" \
  -d '{"username":"alice"}'

# Create bob
curl -X POST http://localhost:3000/actor \
  -H "Content-Type: application/json" \
  -d '{"username":"bob"}'

# View actors
curl http://localhost:3000/actor/alice
```

### Issuing Migration Credentials

```bash
# Get actor info
curl http://localhost:3000/actor/alice

# Issue migration VC
curl -X POST http://localhost:3000/actor/alice/migrate \
  -H "Content-Type: application/json" \
  -d '{
    "oldActor": "http://localhost:3000/actor/alice",
    "newActor": "http://localhost:3001/actor/alice"
  }'
```

### Verifying on Bridge

```bash
# Register issuer DID
curl -X POST http://localhost:4000/register \
  -H "Content-Type: application/json" \
  -d '{
    "did": "did:key:z...",
    "publicKey": "base64encodedkey"
  }'

# Verify VC
curl -X POST http://localhost:4000/verify \
  -H "Content-Type: application/json" \
  -d '{"vc": {...}}'
```

### Resolving Identity Chains

```bash
# Resolve actor through chain
curl http://localhost:4000/resolve/did:key:z...
```

---

## Troubleshooting

### Redis Connection Failed

```bash
# Error: ECONNREFUSED 127.0.0.1:6379
# Solution 1: Start Redis
redis-server

# Solution 2: Check Redis is running
redis-cli ping
# Should output: PONG

# Solution 3: Check Redis configuration
redis-cli INFO server | grep version
```

### Port Already in Use

```bash
# Error: Error: listen EADDRINUSE :::3000
# Find process using port
lsof -i :3000

# Kill the process
kill -9 <PID>

# Or use a different port
PORT=3002 node server.js
```

### Bridge Not Starting

```bash
# Error: Bridge fails to start silently
# Solution 1: Enable debug logging
LOG_LEVEL=debug node bridge.js

# Solution 2: Check Redis connection
redis-cli -h localhost -p 6379 ping

# Solution 3: Increase timeout
node --max-old-space-size=2048 bridge.js
```

### High Latency in Experiments

```
# If p95/p99 latencies are high (>100ms):
# 1. Check system load
top -l 1 | head -n 10

# 2. Ensure Redis is responsive
redis-cli --latency-history

# 3. Reduce concurrency level
# Edit CONCURRENCY_LEVELS in experiment file

# 4. Check for GC pauses
node --expose-gc bridge.js
```

### Experiment Crashes

```bash
# Clean up previous runs
rm -rf experiments/results/

# Verify dependencies
npm list @noble/ed25519 node-fetch

# Check disk space
df -h

# Run with verbose logging
NODE_DEBUG=* node experiments/experiment_concurrency_sweep.js
```

---

## Performance Tips

### Optimize for Local Development

```bash
# 1. Use localhost only (no network overhead)
BRIDGE_NETWORK=127.0.0.1 node bridge.js

# 2. Disable logging for higher throughput
LOG_LEVEL=error node bridge.js

# 3. Increase Node.js heap
node --max-old-space-size=4096 bridge.js

# 4. Use Redis persistence (optional)
redis-server --save ""  # Disable RDB saves
```

### Monitor Performance

```bash
# Monitor bridge process
top -p $(pgrep -f "node bridge")

# Monitor Redis
redis-cli INFO stats

# Monitor network
netstat -an | grep 3000
```

---

## Next Steps

1. ✅ Run the quick demo: `node spawn_nodes.js`
2. ✅ Run tests: `npm test`
3. ✅ Run one experiment: `cd experiments && node experiment_concurrency_sweep.js`
4. ✅ Read API docs: [docs/API.md](docs/API.md)
5. ✅ Explore architecture: [docs/ARCHITECTURE_EVOLUTION.md](docs/ARCHITECTURE_EVOLUTION.md)

---

## Additional Resources

- [README.md](README.md) — Project overview
- [docs/API.md](docs/API.md) — API endpoint reference
- [docs/CONFIGURATION.md](docs/CONFIGURATION.md) — Env variables
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Production deployment
- [docs/TRUST_MODEL.md](docs/TRUST_MODEL.md) — Security model
