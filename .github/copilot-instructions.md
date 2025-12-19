# Copilot Instructions for Fediverse Identity Bridge

This document guides AI agents in safely extending this codebase without breaking core identity and cryptographic logic.

## 🏗️ Architecture Overview

**Three-Layer System:**

1. **ActivityPub Nodes** (`server.js`, multiple instances on ports 3000, 3001, etc.)
   - User actors with Ed25519 keypairs (stored in `keys/<username>/`)
   - Inbox/outbox endpoints with HTTP Signature verification
   - Issues migration VCs via `/actor/:username/migrate` endpoint

2. **Identity Bridge** (`bridge.js`, port 4000)
   - Verifies migration VCs from nodes
   - Resolves identity chains (following `/newActor` links)
   - Caches remote VCs and revocation status
   - Exposes `/verify`, `/link`, `/migrate`, `/resolve/:did` endpoints

3. **Experiment Framework** (`experiments/`)
   - Concurrency sweep, scaling, federation, chain-depth tests
   - Produces timestamped CSV/JSON/PNG results in `results/<experiment>_<timestamp>/`
   - Archives prior runs to `archive/`

**Data Flow:**
```
Node A issues VC → Bridge /verify → Bridge fetches chain via /newActor → terminal actor resolved
```

## 🔐 Cryptography (FINAL — Do Not Modify)

**Three core files are off-limits:**

- `lib/crypto.js` — Dual-key support: Ed25519 (primary) + P-521 fallback
  - Exports: `generateKeypairEd25519()`, `signEd25519()`, `verifyEd25519()`
  - All experiments use **Ed25519 only**
  - Keys stored as base64 strings (32 bytes raw)

- `lib/did.js` — `did:key:z...` encoding (multicodec 0xED 0x01 + base58btc)
  - `getDidFromPublicKey(base64PublicKey)` → async
  - Input: base64 Ed25519 public key (32 bytes)
  - Output: `did:key:z<multibase_encoded>`

- `lib/vc.js` — Migration VC structure + Ed25519 signature verification
  - `createMigrationVC({ issuerDid, subjectDid, oldActor, newActor, issuerPrivatePem })`
  - `verifyMigrationVC(vc, publicKeyBase64)` → async
  - Proof type: `Ed25519Signature2020`
  - Canonical signing: sorted JSON keys, no whitespace

## ✅ Safe Modification Zones

### Experiments (`experiments/`)
- Add new experiment scripts (e.g., `experiment_*.js`)
- Modify concurrency levels, request counts, workload patterns
- Add plotting functions to `plot_*.js`
- Update PowerShell launchers in `run_*.ps1`

### Helpers (`experiments/helpers/`)
- `bench_utils.js`: Extends `generateVC()`, `runLoadTest()` signatures only
- `process_monitor.js`: RAM/CPU monitoring (CommonJS, Windows/Linux compatible)
- `federation_utils.js`, `chain_utils.js`: New federation/chain helpers

### Results & Archives
- Scripts automatically create `results/<name>_<timestamp>/` folders
- Archiving to `archive/` is automatic (safe to delete old results)

## 🚫 Critical Safety Rules

1. **Never modify core files unless explicitly instructed:**
   - `crypto.js`, `did.js`, `vc.js` — cryptographic pipeline
   - `bridge.js`, `server.js` — identity verification logic
   - `lib/lineage.js` — chain resolution algorithm

2. **Async/await discipline:**
   - All crypto functions are **async** (Ed25519 uses `@noble/ed25519`)
   - All experiments must `await` crypto calls
   - Use `.catch()` or try/catch in promise chains

3. **Key format invariants:**
   - Ed25519 public keys: **base64 strings** (not PEM, not raw bytes)
   - Ed25519 private keys: **base64 strings** (32 bytes)
   - DIDs: must start with `did:key:z` (verified in `getRawFromDid()`)

4. **File I/O patterns:**
   - Prefer `fs.appendFileSync()` in experiments (stability over performance)
   - Create timestamped output dirs: `path.join(OUTDIR, \`sweep_${Date.now()}\`)`
   - CSV headers: `i,latency_ms,valid,bridge_ram_mb,system_ram_mb`

## 📋 Experiment Pattern Template

```javascript
// experiments/experiment_*.js
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const { generateVC, runLoadTest } = require("./helpers/bench_utils");
const { ProcessMonitor } = require("./helpers/process_monitor");

const OUTDIR = path.join(__dirname, "results", `myexp_${Date.now()}`);
fs.mkdirSync(OUTDIR, { recursive: true });

async function main() {
  // 1. Start bridge
  const bridge = spawn("node", ["bridge.js"], { cwd: path.join(__dirname, "..") });
  
  // 2. Wait for port 4000 to respond
  await waitForBridge(4000, 5000);
  
  // 3. Generate VC
  const vc = await generateVC();
  
  // 4. Run workload
  const results = await runLoadTest({
    vc,
    total: 300,
    concurrency: 4,
    monitor: new ProcessMonitor(bridge.pid)
  });
  
  // 5. Save results
  fs.writeFileSync(path.join(OUTDIR, "summary.json"), JSON.stringify(results, null, 2));
  
  // 6. Cleanup
  bridge.kill();
}

main().catch(console.error);
```

## 🔄 Common Tasks

### Add a new concurrency level to sweep:
Edit `experiments/experiment_concurrency_sweep.js` → `CONCURRENCY_LEVELS` array.
Levels must be powers of 2 for scaling analysis (1, 2, 4, 8, 16, 32, 64).

### Fix experiment timeout issues:
- Bridge cold boot: Add `await waitForPort(4000, 5000)` before warm-up
- Process monitor sampling: Increase `ProcessMonitor` interval from 150ms to 300ms
- Clean zombie processes: `taskkill /F /IM node.exe` (Windows) before re-running

### Update CSV output format:
New fields must be added to:
1. CSV header write: `fs.writeFileSync(csvPath, "i,latency_ms,valid,...")`
2. CSV row append: `fs.appendFileSync(csvPath, \`${i},${lat},...\`)`
3. Plot config in `plot_*.js`: Add dataset to chart config

### Produce new plots:
Copy `experiments/plot_sweep.js` pattern:
- Read CSV file by parsing lines after header
- Create Chart.js config with `type: "line"` or `"bar"`
- Use `ChartJSNodeCanvas` to render PNG: `canvas.renderToBuffer(config)`

## 🔍 Debugging Experiments

**Bridge not responding?**
```powershell
# Check if bridge is running
netstat -ano | findstr :4000

# Start bridge manually (separate terminal)
node bridge.js
```

**Experiments crash immediately?**
- Check `experiments/results/<exp>_<timestamp>/` exists
- Check `@noble/ed25519` is installed: `npm ls @noble/ed25519`
- Verify experiment generates valid VC: add `console.log(vc)` before verification

**Memory monitor failing on Windows?**
- `wmic process` command may hang; check for WMIC disabled in Group Policy
- Fallback: `ProcessMonitor` silently returns 0 MB if WMIC fails

## 📊 Result Interpretation

Each experiment produces:
- **raw.csv** / **sweep_raw.csv**: One row per request (i, latency, valid, ram)
- **summary.json**: Aggregated stats (avgLatency, p95, p99, failures, throughput)
- **plots (*.png)**: Latency vs concurrency, throughput, RAM usage

**p95/p99 high?** Indicates tail-latency spikes (GC, context switching).
**Failures > 0?** Bridge may be overloaded; increase `MAX_AGE` cache TTL in `bridge.js`.

## 🧪 Testing Identity Logic (Do Not Break)

Run unit tests before committing changes:
```powershell
npm test
```

These validate:
- VC creation and Ed25519 signature verification
- DID encoding/decoding
- HTTP Signature inbox validation
- Chain resolution up to 10 hops

## 📝 When in Doubt

- Check `lib/crypto.js` exports before using crypto functions (must be async)
- Verify all DIDs start with `did:key:z` in tests and logs
- Ensure CSV rows always have 5 fields (matching header)
- Always `await` Ed25519 calls; never use `.then()` chains for signing
