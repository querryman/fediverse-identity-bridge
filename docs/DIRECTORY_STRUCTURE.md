# Directory Structure Guide (Task 9.1)

## Current Structure (Organized)

```
fediverse-identity-bridge/
├── Core Application (Production Code)
│   ├── bridge.js              ← Main bridge microservice
│   ├── server.js              ← ActivityPub server
│   ├── fep_extensions.js      ← HTTP signature utilities
│   ├── lib/                   ← Core libraries
│   │   ├── crypto.js          ← Ed25519 cryptography
│   │   ├── did.js             ← DID encoding/decoding
│   │   ├── vc.js              ← Verifiable Credential creation
│   │   ├── storage.js         ← File-based storage abstraction
│   │   ├── storage-redis.js   ← Redis storage backend
│   │   ├── vc-resolution.js   ← VC lookup strategies
│   │   └── lineage.js         ← Chain resolution with guards
│   ├── keys/                  ← User keypairs (runtime)
│   │   ├── alice/
│   │   │   ├── private.key
│   │   │   └── public.key
│   │   └── bob/
│   │       ├── private.key
│   │       └── public.key
│   └── registry/              ← VC and DID registry (runtime)
│       ├── did_registry.json
│       └── vc_registry.json
│
├── Configuration & Deployment
│   ├── Dockerfile             ← Container image (Task 8.1)
│   ├── docker-compose.yml     ← Multi-service composition (Task 8.1)
│   ├── .env.example           ← Environment template (Task 8.2)
│   └── package.json           ← Node.js dependencies
│
├── Testing & Development
│   ├── tests/                 ← Unit and integration tests
│   │   ├── actor_integration.test.js        (12 tests, Week 2)
│   │   ├── chain_depth_verification.test.js (22 tests, Week 2)
│   │   └── migration.test.js.disabled       (disabled, old API)
│   ├── examples/              ← Working examples
│   │   ├── actor_integration_example.js
│   │   └── chain_depth_verification_example.js
│   ├── scripts/               ← Utility scripts
│   │   ├── migrate-to-redis.js              (Week 2 migration)
│   │   ├── validate-migration.js            (Week 2 validation)
│   │   └── actor_sign_and_store.js
│   └── experiments/           ← Performance benchmarks
│       ├── results/           (timestamped results)
│       ├── archive/           (prior runs)
│       ├── helpers/
│       │   ├── bench_utils.js
│       │   └── process_monitor.js
│       └── bench_*.js         (benchmark scripts)
│
├── Documentation
│   ├── docs/                  ← Comprehensive guides
│   │   ├── ACTOR_INTEGRATION.md              (Week 2)
│   │   ├── CHAIN_DEPTH_VERIFICATION.md      (Week 2)
│   │   ├── CLIENT_SIGNING_WORKFLOW.md       (Week 3)
│   │   └── CONFIGURATION.md                 (Week 4)
│   ├── README.md              ← Project overview
│   ├── QUICK_START.md         ← Getting started
│   ├── QUICK_REFERENCE.md     ← Task reference
│   └── IMPLEMENTATION_PLAN.md ← Full task breakdown
│
├── Project Management (Internal Use Only)
│   └── [Planning documents - not deployed]
│       ├── IMPLEMENTATION_CHECKLIST.md
│       ├── ARCHITECTURE_EVOLUTION.md
│       └── WEEK_*.md (completion reports)
│
└── .gitignore
    (Excludes keys/, registry/, node_modules/, results/, etc.)
```

---

## Production Deployment Structure

For a production-hardened deployment, recommend this structure:

```
production-deployment/
├── docker-compose.yml         ← Single source of truth
├── .env.production            ← Secrets (gitignored)
├── app/
│   ├── bridge/
│   │   ├── Dockerfile
│   │   ├── bridge.js
│   │   ├── fep_extensions.js
│   │   ├── lib/
│   │   │   ├── crypto.js
│   │   │   ├── did.js
│   │   │   ├── vc.js
│   │   │   ├── lineage.js
│   │   │   └── vc-resolution.js
│   │   └── package.json
│   └── server/
│       ├── Dockerfile
│       ├── server.js
│       ├── lib/
│       └── package.json
├── redis/
│   ├── Dockerfile
│   └── redis.conf
├── nginx/
│   ├── Dockerfile
│   └── nginx.conf
├── scripts/
│   ├── deploy.sh
│   ├── health-check.sh
│   └── rollback.sh
└── monitoring/
    ├── prometheus.yml
    └── grafana/
        └── dashboards/
```

*Recommendation for Phase 5/6 when deploying to production.*

---

## File Organization Principles

### ✅ Core Application Layer
- **Location:** Root and `lib/`
- **Files:** `bridge.js`, `server.js`, `lib/*.js`
- **Principle:** Single responsibility, async/await, no in-memory state
- **Dependencies:** Only external packages (redis, express, @noble/ed25519)

### ✅ Configuration Layer
- **Location:** Root (`Dockerfile`, `docker-compose.yml`, `.env.example`)
- **Principle:** Environment-driven, no secrets in code
- **Dependencies:** Docker, Docker Compose

### ✅ Testing Layer
- **Location:** `tests/` (unit/integration), `examples/` (working code)
- **Principle:** Independent from production, can modify freely
- **Dependencies:** Mocha, Chai, test fixtures

### ✅ Experimentation Layer
- **Location:** `experiments/`
- **Principle:** Isolated from core, produces timestamped results
- **Dependencies:** Performance monitoring, result collection

### ✅ Documentation Layer
- **Location:** `docs/`, `.md` files at root
- **Principle:** User-centric, code examples, troubleshooting
- **Dependencies:** Markdown standard

### ❌ Avoid: Multi-language mixing
- Don't put Python scripts in main tree
- Don't put shell scripts for production logic
- Use `lib/` for shared logic only

---

## Import Paths (Relative vs Absolute)

**Current approach (working):**
```javascript
// From tests/
const { something } = require('../lib/crypto');      ✅ Relative
const storage = require('../lib/storage');           ✅ Relative

// From lib/
const { verifyEd25519 } = require('./crypto');       ✅ Relative within lib

// From bridge.js (root)
const { resolveLineage } = require('./lib/lineage');  ✅ Relative from root
```

**Recommended for monorepo (future):**
```javascript
// Using require.resolve() or custom paths
const crypto = require('@fib/crypto');        // Cleaner
const storage = require('@fib/storage');      // Explicit

// In package.json:
{
  "exports": {
    "./lib/crypto": "./lib/crypto.js",
    "./lib/storage": "./lib/storage.js"
  }
}
```

---

## Git Organization

### `.gitignore` Enforcement
```
# DO NOT COMMIT (security)
keys/
registry/
.env
.env.*.local

# DO NOT COMMIT (performance)
node_modules/
dist/
build/

# DO NOT COMMIT (runtime)
*.log
*.csv
bridge_output.txt
bridge_error.txt

# DO NOT COMMIT (reports - internal only)
WEEK_*_*.md
*_SUMMARY.md
*_REPORT.md
TASK_*_REPORT.md
```

### Branches for Tasks
```
main
├─ deployment (Week 4 - ready for review)
├─ develop (ongoing work)
└─ feature/week5-finalization
```

---

## Dependencies Organization

**Critical Core:**
```json
{
  "dependencies": {
    "@noble/ed25519": "^1.7.0",     // ✅ MUST HAVE - Cryptography
    "express": "^4.18.0",            // ✅ MUST HAVE - Web framework
    "redis": "^4.6.0",               // ✅ MUST HAVE - Storage backend
    "node-fetch": "^2.6.0"           // ✅ MUST HAVE - HTTP requests
  },
  "devDependencies": {
    "mocha": "^10.2.0",              // Testing
    "chai": "^4.3.0",                // Assertions
    "nodemon": "^2.0.0"              // Development
  }
}
```

**No** unnecessary dependencies (jQuery, lodash, moment, etc.)

---

## Module Export Consistency

**Pattern to follow:**

```javascript
// lib/crypto.js
async function generateKeypairEd25519() { ... }
async function signEd25519(msg, privKey) { ... }
async function verifyEd25519(msg, sig, pubKey) { ... }

module.exports = {
  generateKeypairEd25519,
  signEd25519,
  verifyEd25519
};
```

**Not:**
```javascript
// ❌ DON'T: Mixed export styles
module.exports.generateKeypairEd25519 = ...
exports.signEd25519 = ...
const verify = ...
module.exports = { verify }  // Confusing!
```

---

## Runtime Directory Separation

### Build-time Directories (Committed)
```
✅ lib/          - Source code
✅ docs/         - Documentation
✅ tests/        - Test code
✅ examples/     - Example code
✅ scripts/      - Utility scripts
✅ .github/      - CI/CD config
```

### Runtime Directories (Git-ignored)
```
❌ keys/         - Generated keypairs (created at runtime)
❌ registry/     - Generated DIDs/VCs (created at runtime)
❌ node_modules/ - npm packages
❌ results/      - Experiment results (timestamped)
❌ archive/      - Prior results
```

---

## Deployment Checklist (Task 9.1)

- ✅ Core application files in root (`bridge.js`, `server.js`)
- ✅ All libraries in `lib/` with consistent exports
- ✅ All tests in `tests/` with clear names
- ✅ All examples in `examples/` with working code
- ✅ Deployment config in root (`Dockerfile`, `docker-compose.yml`)
- ✅ Documentation in `docs/` and root `.md` files
- ✅ `.gitignore` excludes runtime directories
- ✅ Package.json has only needed dependencies
- ✅ Relative imports work from all locations
- ✅ No hardcoded paths (use `__dirname` or env vars)

---

## Moving Forward (Week 5+)

**When adding new features:**
1. Code goes in `lib/` or at root
2. Tests go in `tests/`
3. Examples go in `examples/`
4. Docs go in `docs/`
5. Never add files to root unless critical

**When deploying to production:**
1. Restructure as shown in "Production Deployment Structure"
2. Use Docker multi-stage builds to reduce image size
3. Implement CI/CD in `.github/workflows/`
4. Add health checks and metrics

**When experimenting:**
1. Use `experiments/` directory freely
2. Results go to `results/` with timestamps
3. Archive old runs to `archive/`
4. Never break core code with experiment changes

---

## Summary

**Current state is well-organized:**
- ✅ Core code isolated in `lib/` and root services
- ✅ Tests clear and separated
- ✅ Examples working and documented
- ✅ Deployment config ready (Docker)
- ✅ Documentation comprehensive
- ✅ Git-ignored runtime artifacts

**No major restructuring needed.** The separation between core, testing, and experimentation is already clean. For Week 5 finalization, just ensure:
1. All new code follows the same patterns
2. New features have corresponding tests
3. Breaking changes documented
4. Production deployment ready

See [docs/CONFIGURATION.md](CONFIGURATION.md) for environment-based flexibility and [README.md](../README.md) for deployment instructions.
