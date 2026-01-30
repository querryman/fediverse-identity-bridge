# Experiment Execution Report

## Bridge Status
✅ Bridge is running on `127.0.0.1:4000`

## Available Experiments

The project includes performance benchmarks and experiments in the `/experiments` directory:

### 1. **Concurrency Sweep** (`experiment_concurrency_sweep.js`)
   - **Purpose**: Measure latency and throughput at different concurrency levels
   - **Concurrency Levels**: 1, 2, 5, 10, 20, 40, 80
   - **Requests per Level**: 300
   - **Output**: CSV (per-request latency), JSON (aggregated stats), PNG plots

### 2. **Scaling Test** (`experiment_scaling.js`)
   - **Purpose**: Measure how throughput scales with increasing load
   - **Load Increments**: Progressive load increases
   - **Output**: Latency, throughput, memory usage

### 3. **Chain Depth Benchmark** (`bench_chain_depth.js`)
   - **Purpose**: Measure verification time for identity chains of varying depths
   - **Depths Tested**: 1-10 hops
   - **Output**: CSV results with depth vs. latency

### 4. **Verification Benchmark** (`bench_verify.js`)
   - **Purpose**: Simple latency measurement for verification endpoint
   - **Usage**: `node bench_verify.js <iterations>`
   - **Example**: `node bench_verify.js 100` (run 100 verification requests)

---

## How to Run Experiments

### Option 1: Run with Our Wrapper Script

```powershell
# Terminal 1: Start bridge
cd c:\workspace\fediverse-identity-bridge
node bridge.js

# Terminal 2: Run all experiments
cd c:\workspace\fediverse-identity-bridge
node experiments/run_experiments.js
```

### Option 2: Run Individual Experiments

```powershell
# From project root

# Concurrency sweep (measures latency at different concurrency levels)
node experiments/experiment_concurrency_sweep.js

# Scaling test (measures throughput under increasing load)
node experiments/experiment_scaling.js

# Chain depth benchmark (measures verification time by chain depth)
node experiments/bench_chain_depth.js

# Quick verification benchmark (50 requests)
node experiments/bench_verify.js 50
```

---

## Current Project Status

### Infrastructure
- ✅ Node.js bridge running on `127.0.0.1:4000`
- ✅ File-based storage (Redis not required)
- ✅ All dependencies installed (@noble/ed25519, redis, express, node-fetch, etc.)
- ✅ Tests passing (34 tests)

### Registry Data
- **did_registry.json** - DID to public key mappings
- **vc_registry.json** - Verifiable credentials store
- **Backups** - Automated backup snapshots

### Result Output Structure
```
experiments/results/
├── sweep_<timestamp>/
│   ├── sweep_raw.csv          (raw latency data)
│   ├── sweep_summary.json     (aggregated stats)
│   └── latency.png            (plot)
├── scaling_<timestamp>/
│   ├── scaling_raw.csv
│   ├── summary.json
│   └── throughput.png
└── chain_depth_<timestamp>/
    ├── chain_depth_raw.csv
    ├── summary.json
    └── depth_latency.png
```

---

## Next Steps

1. **Start the bridge**:
   ```powershell
   cd c:\workspace\fediverse-identity-bridge
   node bridge.js
   ```

2. **In another terminal, run experiments**:
   ```powershell
   cd c:\workspace\fediverse-identity-bridge
   
   # Run a single quick benchmark
   node experiments/bench_verify.js 100
   
   # Or run the full suite
   node experiments/run_experiments.js
   ```

3. **View results**:
   ```powershell
   # List all results
   dir experiments/results/
   
   # View summary of latest run
   cat experiments/results/*/summary.json
   ```

---

## Performance Metrics Measured

- **Latency** (ms): Time per verification request
- **Throughput** (RPS): Requests per second
- **P95/P99** (ms): 95th and 99th percentile latencies
- **Memory Usage** (MB): Peak RAM during experiment
- **Chain Depth** (hops): Identity chain resolution depth
- **Failure Rate**: Number of failed verifications

---

## Troubleshooting

**Q: Experiments fail to start bridge**
- A: The experiments try to spawn their own bridge instance. Keep a bridge running in another terminal beforehand.

**Q: "Cannot find credentials.json"**
- A: Some experiments expect test data. Run `npm test` first to populate registry.

**Q: Port 4000 already in use**
- A: Check `netstat -ano | findstr :4000` and `kill -P` the process, or use a different port:
   ```powershell
   $env:BRIDGE_PORT=5000
   node bridge.js
   ```

**Q: Node process crashes silently**
- A: Enable debug logging:
   ```powershell
   $env:LOG_LEVEL=debug
   node bridge.js
   ```

---

For more information, see:
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) - Deployment guide
- [LOCAL_SETUP_MAC.md](LOCAL_SETUP_MAC.md) - Setup guide for macOS/Linux
- [README.md](README.md) - Project overview
