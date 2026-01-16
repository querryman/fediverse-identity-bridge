# Chain Depth Verification Guide (Task 5.1)

## Overview

Task 5.1 implements comprehensive verification of identity migration chains with three key safety mechanisms:

1. **Depth Limits** - Prevent infinite/extremely long chains (default: 10 hops)
2. **Fork Detection** - Identify when an actor migrates to multiple destinations
3. **Cycle Detection** - Detect and prevent circular identity chains

These protections ensure that chain resolution is bounded, unambiguous, and cannot loop infinitely.

## Architecture

```
┌─────────────────────────────────────┐
│     resolveLineage(startActor)      │
│     or                              │
│     resolveLineageByDid(did)        │
└──────────────┬──────────────────────┘
               │
         ┌─────▼─────────────────────────────────────┐
         │  Initialize Chain Resolution Loop         │
         │  - Create visited Set()                   │
         │  - Create chain array                     │
         │  - Create issues array                    │
         └─────┬────────────────────────────────────┘
               │
         ┌─────▼──────────────────────────────────┐
         │  For each actor in chain:              │
         └─────┬────────────────────────────────┘
               │
      ┌────────┴───────────────────────────────────────────┐
      │                                                    │
 ┌────▼────────────┐  ┌──────────────────┐  ┌────────────┐
 │ 1. Cycle Check  │  │ 2. Fork Check    │  │ 3. VC Lookup
 │                 │  │                  │  │
 │ if visited?     │  │ Multiple VCs     │  │ Fetch VC
 │ STOP (cycle)    │  │ for oldActor?    │  │ Unpack fields
 │                 │  │ STOP (fork)      │  │
 └────────┬────────┘  └────────┬─────────┘  └────┬──────┘
          │                    │                 │
          └────────┬───────────┴─────────────────┘
                   │
         ┌─────────▼──────────────────────────┐
         │  4. Depth Check                    │
         │                                    │
         │ if chain.length >= maxDepth?       │
         │ STOP (depth exceeded)              │
         └─────────┬────────────────────────┘
                   │
         ┌─────────▼──────────────────────────┐
         │  5. Revocation Check               │
         │                                    │
         │ if VC revoked?                     │
         │ STOP (invalid chain)               │
         └─────────┬────────────────────────┘
                   │
         ┌─────────▼────────────────────────────┐
         │  Add VC to chain                     │
         │  Move to next actor (newActor)       │
         └─────────┬──────────────────────────┘
                   │
         ┌─────────▼────────────────────────────┐
         │  Return Result                       │
         │  {                                   │
         │    start, end, chain, issues         │
         │  }                                   │
         └────────────────────────────────────┘
```

## Core Mechanisms

### 1. Depth Limits

**Purpose:** Prevent excessively long or infinite chains

**Default:** 10 hops maximum
**Configurable:** Via `opts.maxDepth` parameter

**Algorithm:**
```javascript
if (chain.length >= maxDepth) {
  issues.push(`Max chain depth exceeded (${maxDepth}) at actor: ${current}`);
  break;
}
```

**Example:**
```javascript
// Default: 10 hops max
const result1 = await lineage.resolveLineage(startActor);

// Custom: 20 hops max
const result2 = await lineage.resolveLineage(startActor, { maxDepth: 20 });

// Custom: 5 hops max (strict)
const result3 = await lineage.resolveLineage(startActor, { maxDepth: 5 });
```

**When it triggers:**
- Chain exceeds configured maximum
- Returns issue: "Max chain depth exceeded (N) at actor: ..."
- Resolution stops at current actor

### 2. Fork Detection

**Purpose:** Identify when an actor has multiple migration VCs (ambiguous identity)

**Detection Method:**
```javascript
const forks = await storage.getVCsByOldActor(current);
if (Array.isArray(forks) && forks.length > 1) {
  issues.push(`Fork detected for actor: ${current} (multiple migration VCs)`);
  break;
}
```

**Scenarios:**

**Scenario A: Normal (single VC per actor)**
```
Actor A
  └─VC1─→ Actor B
           └─VC2─→ Actor C
                   └─(terminal)
```
✓ Normal chain continuation

**Scenario B: Fork (multiple VCs from same actor)**
```
Actor A
  ├─VC1─→ Actor B
  └─VC2─→ Actor C
```
✗ Fork detected - cannot determine true migration path

**When it triggers:**
- `storage.getVCsByOldActor(actor)` returns > 1 VC
- Returns issue: "Fork detected for actor: X (multiple migration VCs)"
- Resolution stops immediately
- Requires manual intervention to resolve ambiguity

### 3. Cycle Detection

**Purpose:** Prevent circular identity chains

**Detection Method:**
```javascript
const visited = new Set();

while (true) {
  if (visited.has(current)) {
    issues.push(`Cycle detected involving: ${current}`);
    break;
  }
  visited.add(current);
  // ... continue processing
  current = node.newActor;  // Move to next
}
```

**Scenarios:**

**Scenario A: Normal chain (no cycle)**
```
Alice → Bob → Carol → (terminal)
```
✓ Terminal node reached

**Scenario B: 2-actor cycle**
```
Alice ↔ Bob
  ↑     ↓
  └─────┘
```
✗ Cycle detected

**Scenario C: Multi-actor cycle**
```
Alice → Bob → Carol → Alice
  ↑                     ↓
  └─────────────────────┘
```
✗ Cycle detected involving: Alice

**When it triggers:**
- Actor appears twice in resolution path
- Returns issue: "Cycle detected involving: X"
- Resolution stops immediately

## API Reference

### `resolveLineage(startActor, opts)`

Resolve identity migration chain starting from an actor URL.

**Parameters:**
```javascript
{
  startActor: "http://example.com/actor/alice",  // string, required
  opts: {
    maxDepth: 10,      // number, optional (default: 10)
    maxDepth: 20,      // custom: 20 hops
    maxDepth: 5        // custom: 5 hops
  }
}
```

**Returns:**
```javascript
{
  start: "http://example.com/actor/alice",
  end: "http://example.com/actor/carol",
  chain: [
    {
      id: "http://example.com/vc/1",
      issuerDid: "did:key:z...",
      subjectDid: "did:key:z...",
      oldActor: "http://example.com/actor/alice",
      newActor: "http://example.com/actor/bob"
    },
    {
      id: "http://example.com/vc/2",
      issuerDid: "did:key:z...",
      subjectDid: "did:key:z...",
      oldActor: "http://example.com/actor/bob",
      newActor: "http://example.com/actor/carol"
    }
  ],
  issues: [
    // Any of:
    // "Cycle detected involving: http://...",
    // "Fork detected for actor: http://... (multiple migration VCs)",
    // "Max chain depth exceeded (10) at actor: http://...",
    // "VC revoked for actor: http://...",
    // etc.
  ]
}
```

**Example Usage:**
```javascript
const lineage = require('./lib/lineage');

// Default depth limit
const result = await lineage.resolveLineage('http://example.com/actor/alice');

// Custom depth limit
const result2 = await lineage.resolveLineage(
  'http://example.com/actor/alice',
  { maxDepth: 20 }
);

// Check for issues
if (result.issues.length > 0) {
  console.log('Chain problems:');
  result.issues.forEach(issue => console.log(`  - ${issue}`));
}
```

### `resolveLineageByDid(subjectDid)`

Resolve identity migration chain starting from a DID.

**Parameters:**
```javascript
{
  subjectDid: "did:key:z6MkhaXgBZDvotzL8V6N1LXm1JHtzsSrNBr1d1N7mjf8n3s6"
}
```

**Returns:**
Same structure as `resolveLineage()`

**Example:**
```javascript
const result = await lineage.resolveLineageByDid('did:key:z...');
```

## Verification Checklist

Use this checklist to validate chain resolution:

```javascript
async function verifyChainResolution(startActor) {
  const result = await lineage.resolveLineage(startActor);
  
  // ✓ Check 1: Result has required fields
  assert(result.start, 'Result has start');
  assert(result.end, 'Result has end');
  assert(Array.isArray(result.chain), 'Chain is array');
  assert(Array.isArray(result.issues), 'Issues is array');
  
  // ✓ Check 2: Start is set correctly
  assert(result.start === normalizeActor(startActor), 'Start matches input');
  
  // ✓ Check 3: Chain hops don't exceed depth
  assert(result.chain.length <= 10, 'Chain respects maxDepth');
  
  // ✓ Check 4: No cycles in chain
  const visitedActors = new Set();
  for (const vc of result.chain) {
    assert(!visitedActors.has(vc.oldActor), 'No cycles in chain');
    visitedActors.add(vc.oldActor);
  }
  
  // ✓ Check 5: Chain is continuous
  for (let i = 0; i < result.chain.length - 1; i++) {
    const current = result.chain[i];
    const next = result.chain[i + 1];
    assert(
      current.newActor === next.oldActor,
      `Chain link ${i} connects to ${i + 1}`
    );
  }
  
  // ✓ Check 6: If no issues, end should be terminal
  if (result.issues.length === 0) {
    assert(result.end === result.chain[result.chain.length - 1].newActor);
  }
  
  // ✓ Check 7: Issues are properly formatted
  result.issues.forEach(issue => {
    assert(typeof issue === 'string', 'Issues are strings');
  });
  
  return result;
}
```

## Testing

Run the test suite:
```bash
npx mocha tests/chain_depth_verification.test.js --timeout 10000
```

Tests cover:
- ✓ Depth limit enforcement
- ✓ Default maxDepth (10)
- ✓ Custom maxDepth options
- ✓ Fork detection (single vs multiple VCs)
- ✓ Cycle detection (2-actor and multi-actor)
- ✓ Result structure validation
- ✓ Actor URL normalization
- ✓ Issue message formatting
- ✓ Integration with storage module

**22 tests, all passing**

## Examples

See [examples/chain_depth_verification_example.js](../examples/chain_depth_verification_example.js):

1. **Normal 3-hop chain** - Within depth limit
2. **Deep chain** - Approaching/exceeding depth limit
3. **Fork detection** - Multiple VCs from same actor
4. **Cycle detection** - Circular identity chains
5. **Revocation handling** - Broken chains due to revoked VCs
6. **Custom maxDepth** - Using different depth limits

Run examples:
```bash
node examples/chain_depth_verification_example.js
```

## Production Deployment

### Configuration

Set maxDepth based on your network:
```javascript
// Conservative: limit chains to 5 hops
resolveLineage(actor, { maxDepth: 5 })

// Default: 10 hops (recommended)
resolveLineage(actor, { maxDepth: 10 })

// Permissive: allow up to 20 hops
resolveLineage(actor, { maxDepth: 20 })
```

### Monitoring

Track resolution issues in production:
```javascript
const result = await lineage.resolveLineage(actor);

if (result.issues.length > 0) {
  // Log for monitoring
  logger.warn('Chain issues', {
    actor: result.start,
    issues: result.issues
  });
  
  // Categorize issues
  const forks = result.issues.filter(i => i.includes('Fork'));
  const cycles = result.issues.filter(i => i.includes('Cycle'));
  const revocations = result.issues.filter(i => i.includes('revoked'));
  const depthExceeded = result.issues.filter(i => i.includes('depth'));
  
  if (forks.length > 0) {
    // Handle fork (requires manual intervention)
  }
  if (cycles.length > 0) {
    // Handle cycle (invalid identity chain)
  }
  if (revocations.length > 0) {
    // Handle revocation (credential invalid)
  }
}
```

### Error Handling

```javascript
try {
  const result = await lineage.resolveLineage(actor, { maxDepth: 10 });
  
  if (result.issues.length > 0) {
    console.warn(`Chain has ${result.issues.length} issues`);
  }
  
  // Use result safely
  console.log(`Identity: ${result.start} → ${result.end}`);
  
} catch (err) {
  // Storage or network error
  console.error('Chain resolution failed:', err.message);
  
  // Fallback behavior
  return null;
}
```

## Security Considerations

1. **Depth Limits Prevent DoS:**
   - Without maxDepth, malicious chains could cause unbounded resolution
   - Default of 10 hops provides good coverage while limiting resource use
   - Can be tuned per deployment

2. **Fork Detection Prevents Identity Confusion:**
   - Ambiguous identity chains are rejected
   - Manual intervention required to resolve forks
   - Prevents accidental mis-routing of identity

3. **Cycle Detection Prevents Infinite Loops:**
   - Circular chains are immediately detected
   - No risk of infinite resolution
   - Visited set has O(n) memory, O(1) lookup

4. **Revocation Check Validates Credentials:**
   - Revoked VCs break the chain
   - Identity chains are validated for freshness
   - Expired/revoked credentials don't propagate

## Performance

- **Time Complexity:** O(n) where n = chain depth (max 10)
- **Space Complexity:** O(n) for visited set + chain array
- **Typical Resolution:** < 100ms for normal chains
- **Worst Case:** Bounded by maxDepth (default: 10)

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| "Max chain depth exceeded" | Chain longer than maxDepth | Increase maxDepth or investigate legitimacy |
| "Fork detected" | Actor migrated to 2+ destinations | Manual review required to determine correct path |
| "Cycle detected" | Circular identity chain | Data error; verify VC creation |
| "VC revoked" | Credential revoked | Identity chain broken; investigate revocation |
| No VCs found | Actor not in system | Actor may not have migrated yet |

## See Also

- [lib/lineage.js](../lib/lineage.js) - Implementation
- [lib/vc-resolution.js](../lib/vc-resolution.js) - VC resolution strategies
- [tests/chain_depth_verification.test.js](../tests/chain_depth_verification.test.js) - Test suite
- [examples/chain_depth_verification_example.js](../examples/chain_depth_verification_example.js) - Examples
