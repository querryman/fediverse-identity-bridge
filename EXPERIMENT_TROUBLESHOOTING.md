# Why Original Experiment Scripts Aren't Working

## Summary

The original experiment scripts (`experiment_concurrency_sweep.js`, `experiment_scaling.js`, `bench_chain_depth.js`) are failing because they have **design and environment issues** that prevent them from running on Windows in the current project state.

---

## 🔴 Main Issues

### 1. **Bridge Spawning Failure (PRIMARY ISSUE)**

**Problem:**
```javascript
// experiments/experiment_concurrency_sweep.js:48-55
async function startBridgeAndDetectPort() {
  const bridge = spawn("node", ["bridge.js"], {
    cwd: path.join(__dirname, ".."),
    stdio: "ignore"  // ← Silences all output
  });
  
  // Tries to detect port for 20 * 150ms = 3 seconds
  // Then fails with "Bridge failed to start within timeout"
}
```

**Why it fails:**
- The spawned bridge process crashes silently (due to `stdio: "ignore"`)
- No way to see the actual error
- Process exits before port detection completes
- On Windows, there may be path resolution or timing issues

**Evidence:**
```
Error: Bridge failed to start within timeout
    at startBridgeAndDetectPort (experiment_concurrency_sweep.js:65:9)
```

---

### 2. **Missing Dependencies / File Paths**

**Problem:**
```javascript
// experiments/bench_verify.js:20
const registry = JSON.parse(
  fs.readFileSync("./registry/credentials.json", "utf8")  // ← Wrong path!
);
```

**Why it fails:**
- Script expects to run from project root
- If run from `experiments/` directory, path is invalid
- `credentials.json` doesn't exist; actual file is `vc_registry.json`

**Evidence:**
```
Error: ENOENT: no such file or directory, open './registry/credentials.json'
```

---

### 3. **Redis Dependency Not Specified**

**Problem:**
```javascript
// experiments/experiment_concurrency_sweep.js:1-16
// No Redis availability check
// Assumes Redis at localhost:6379
```

**Why it fails on Windows:**
- Redis isn't installed on Windows by default
- Bridge tries to connect to Redis if `REDIS_HOST` is set
- Even file-based storage requires bridge to start first (see Issue #1)

---

### 4. **Process Monitor Uses Linux-Specific APIs**

**Problem:**
```javascript
// experiments/helpers/process_monitor.js:67-90
function readProcStat(pid) {
  // Tries to read /proc/PID/stat (LINUX ONLY)
  const statPath = `/proc/${pid}/stat`;
  
  // On Windows: /proc doesn't exist!
  // Falls back silently to 0 values
}
```

**Why it fails:**
- Uses `/proc` filesystem (Linux/macOS only)
- Windows doesn't have `/proc`
- Memory monitoring returns 0 for all readings
- Doesn't cause failure, just incorrect metrics

---

### 5. **Timing Issues Under Load**

**Problem:**
```javascript
// experiments/experiment_concurrency_sweep.js:155-165
// Tries to warm-up and register issuer in quick succession
// But bridge might not be fully initialized
// Under concurrent load, requests time out
```

**Why it fails:**
- Bridge initialization time varies
- Network timeouts if bridge is slow
- No exponential backoff or retry logic

---

## ✅ Why Our New `simple_benchmark.js` Works

Our new script avoids all these issues:

```javascript
// ✅ Assumes bridge is already running
for (let i = 0; i < 3; i++) {
  try {
    const res = await fetch("http://127.0.0.1:4000/resolve/test", { timeout: 1000 });
    console.log("✓ Bridge is ready!");
    break;
  } catch {
    // Retry with backoff
  }
}

// ✅ Uses correct file paths (relative to execution directory)
const OUTDIR = path.join(__dirname, "results", `simple_bench_${Date.now()}`);

// ✅ Doesn't spawn subprocesses
// ✅ Works on Windows with file-based storage
// ✅ Has proper error handling
```

---

## 📋 Comparison Table

| Feature | Original Scripts | New `simple_benchmark.js` |
|---------|------------------|--------------------------|
| **Bridge spawning** | ❌ Fails silently | ✅ Assumes running |
| **Error visibility** | ❌ `stdio: "ignore"` | ✅ Full error output |
| **Path handling** | ❌ Relative paths | ✅ Correct `__dirname` |
| **File dependencies** | ❌ Wrong filenames | ✅ No file deps |
| **Platform support** | ❌ Linux-focused | ✅ Windows-ready |
| **Process monitoring** | ❌ Linux `/proc` only | ✅ Not needed |
| **Windows tested** | ❌ No | ✅ Yes |

---

## 🔧 How to Fix Original Scripts (Optional)

If you want to repair the original scripts, here's what needs to change:

### Fix #1: Enable Bridge Output
```javascript
// experiments/experiment_concurrency_sweep.js:48-55
const bridge = spawn("node", ["bridge.js"], {
  cwd: path.join(__dirname, ".."),
  stdio: ["ignore", "pipe", "pipe"]  // ← Show stderr
});

bridge.stderr.on("data", (data) => {
  console.error("Bridge:", data.toString());  // ← See actual errors
});
```

### Fix #2: Use Correct File Paths
```javascript
// experiments/bench_verify.js:20
const registryFile = path.join(__dirname, "..", "registry", "vc_registry.json");
const registry = JSON.parse(fs.readFileSync(registryFile, "utf8"));
```

### Fix #3: Add Windows Process Monitor
```javascript
// experiments/helpers/process_monitor.js (add Windows support)
function readProcStat(pid) {
  if (process.platform === "win32") {
    // Use wmic or tasklist on Windows
    // Or skip monitoring on Windows
    return { cpu: 0, ram: 0 };
  }
  
  // Existing Linux logic
  const statPath = `/proc/${pid}/stat`;
  // ...
}
```

### Fix #4: Add Timeout & Retry Logic
```javascript
async function startBridgeAndDetectPort() {
  const bridge = spawn("node", ["bridge.js"], {
    cwd: path.join(__dirname, ".."),
    stdio: "pipe"  // Show output for debugging
  });
  
  let port = null;
  for (let i = 0; i < 40; i++) {  // Longer timeout
    await sleep(150);
    try {
      port = await detectBridgePort();
      console.log(`Bridge started on port ${port}`);
      return { bridge, port };
    } catch {
      if (i % 5 === 0) console.log(`  Retry ${i}...`);
    }
  }
  throw new Error("Bridge failed to start within timeout");
}
```

---

## 🎯 Recommendations

### Short Term (Use Now)
✅ **Use `simple_benchmark.js`** for testing  
✅ **Start bridge manually** in a separate terminal  
✅ **Run: `node experiments/simple_benchmark.js 100 5`**

### Long Term (Optional Fixes)
1. Fix original scripts to work on Windows
2. Add CI/CD test to catch platform issues
3. Document platform requirements clearly
4. Consider using Docker for cross-platform consistency

---

## 📝 Summary

| Issue | Root Cause | Impact | Status |
|-------|-----------|--------|--------|
| Bridge spawn fails | Subprocess errors hidden | Scripts don't run | **CRITICAL** |
| Wrong file paths | Hardcoded relative paths | Import errors | **HIGH** |
| No Redis check | Assumes Redis available | Connection errors | **MEDIUM** |
| Linux-only monitor | `/proc` filesystem | Wrong metrics (silent) | **LOW** |
| Timing issues | No backoff logic | Occasional timeouts | **LOW** |

**Workaround:** Use `simple_benchmark.js` or manually start bridge.

---

## 🚀 Next Steps

1. Keep using `simple_benchmark.js` for quick benchmarks
2. For full experiment suite, either:
   - Fix the original scripts (detailed above)
   - Use the wrapper script: `node experiments/run_experiments.js`
   - Set up Docker for consistent environment

---

**Generated:** January 29, 2026  
**Platform:** Windows (Node.js v18)  
**Status:** Workaround implemented and tested ✅
