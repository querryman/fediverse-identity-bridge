/**
 * examples/chain_depth_verification_example.js
 * 
 * Demonstrates chain depth verification, fork detection, and cycle detection
 * in identity migration chains.
 * 
 * Usage:
 *   node examples/chain_depth_verification_example.js
 */

const path = require('path');
const fs = require('fs');

const lineage = require('../lib/lineage');
const { createMigrationVC } = require('../lib/vc');
const { getDidFromPublicKey } = require('../lib/did');
const { generateKeypairEd25519, signEd25519 } = require('../lib/crypto');

/**
 * Example 1: Normal 3-hop chain (within depth limit)
 */
async function example1_normalChain() {
  console.log('\n=== Example 1: Normal 3-hop Chain ===\n');
  
  const startActor = 'http://example.com/actor/alice';
  
  // Simulate a normal chain resolution
  // alice → bob → carol → (terminal)
  
  const chain = [
    {
      oldActor: 'http://example.com/actor/alice',
      newActor: 'http://example.com/actor/bob',
      issuer: 'did:key:z6MkhaXgBZDvotzL8V6N1LXm1JHtzsSrNBr1d1N7mjf8n3s6'
    },
    {
      oldActor: 'http://example.com/actor/bob',
      newActor: 'http://example.com/actor/carol',
      issuer: 'did:key:z6MkhaXgBZDvotzL8V6N1LXm1JHtzsSrNBr1d1N7mjf8n3s6'
    },
    {
      oldActor: 'http://example.com/actor/carol',
      newActor: 'http://example.com/actor/carol_new',
      issuer: 'did:key:z6MkhaXgBZDvotzL8V6N1LXm1JHtzsSrNBr1d1N7mjf8n3s6'
    }
  ];
  
  console.log('Chain path:');
  console.log(`  Start: ${startActor}`);
  chain.forEach((vc, i) => {
    console.log(`  ${i + 1}. ${vc.oldActor} → ${vc.newActor}`);
  });
  
  const terminal = chain[chain.length - 1].newActor;
  console.log(`  End (terminal): ${terminal}\n`);
  
  console.log('Verification:');
  console.log(`  Chain length: ${chain.length} hops`);
  console.log(`  Max depth (default): 10 hops`);
  console.log(`  Status: ✓ Within depth limit\n`);
  
  return chain;
}

/**
 * Example 2: Deep chain (approaching/exceeding depth limit)
 */
async function example2_deepChain() {
  console.log('\n=== Example 2: Deep Chain (Depth Limit Check) ===\n');
  
  const maxDepth = 10;
  const chainLength = 12;
  
  console.log(`Creating chain with ${chainLength} hops (max depth: ${maxDepth})...\n`);
  
  const chain = [];
  for (let i = 0; i < chainLength; i++) {
    chain.push({
      oldActor: `http://example.com/actor/user${i}`,
      newActor: `http://example.com/actor/user${i + 1}`,
      issuer: `did:key:z6Mk${i}...`
    });
  }
  
  console.log('Chain resolution with depth guards:');
  const resolvedChain = [];
  const issues = [];
  
  for (let i = 0; i < chain.length; i++) {
    if (i >= maxDepth) {
      issues.push(`Max chain depth exceeded (${maxDepth}) at actor: ${chain[i].oldActor}`);
      break;
    }
    resolvedChain.push(chain[i]);
    console.log(`  ${i + 1}. ${chain[i].oldActor} → ${chain[i].newActor}`);
  }
  
  console.log(`\nResolution stopped at hop ${resolvedChain.length} (limit is ${maxDepth})`);
  
  if (issues.length > 0) {
    console.log(`\nIssues found:`);
    issues.forEach(issue => console.log(`  ✗ ${issue}`));
  }
  
  console.log(`\nFinal result:`);
  console.log(`  Start: ${chain[0].oldActor}`);
  console.log(`  End: ${resolvedChain[resolvedChain.length - 1].newActor}`);
  console.log(`  Chain hops: ${resolvedChain.length}/${chainLength}`);
  console.log(`  Issues: ${issues.length}\n`);
}

/**
 * Example 3: Fork detection
 */
async function example3_forkDetection() {
  console.log('\n=== Example 3: Fork Detection ===\n');
  
  const forkedActor = 'http://example.com/actor/alice';
  
  console.log(`Actor "${forkedActor}" has migrated to multiple destinations:\n`);
  
  const fork1 = {
    oldActor: forkedActor,
    newActor: 'http://example.com/actor/alice_v2',
    vcId: 'vc:1'
  };
  
  const fork2 = {
    oldActor: forkedActor,
    newActor: 'http://example.com/actor/alice_alternate',
    vcId: 'vc:2'
  };
  
  console.log(`  Fork 1: ${fork1.oldActor}`);
  console.log(`    → ${fork1.newActor} (VC: ${fork1.vcId})`);
  
  console.log(`\n  Fork 2: ${fork2.oldActor}`);
  console.log(`    → ${fork2.newActor} (VC: ${fork2.vcId})`);
  
  console.log(`\nResolution behavior:`);
  console.log(`  ✗ Fork detected for actor: ${forkedActor} (multiple migration VCs)`);
  console.log(`  ✗ Chain resolution STOPS at fork`);
  console.log(`  ℹ  Manual intervention required to resolve ambiguity\n`);
  
  console.log('Resolution result:');
  console.log(`  Start: ${forkedActor}`);
  console.log(`  End: ${forkedActor} (resolution halted)`);
  console.log(`  Chain length: 0 (fork prevents continuation)`);
  console.log(`  Issues: Fork detected for actor: ${forkedActor}\n`);
}

/**
 * Example 4: Cycle detection
 */
async function example4_cycleDetection() {
  console.log('\n=== Example 4: Cycle Detection ===\n');
  
  const cycle = [
    'http://example.com/actor/alice',
    'http://example.com/actor/bob',
    'http://example.com/actor/carol',
    'http://example.com/actor/alice'  // Back to start = cycle
  ];
  
  console.log('Chain with cycle:\n');
  cycle.forEach((actor, i) => {
    if (i < cycle.length - 1) {
      console.log(`  ${i + 1}. ${actor}`);
      console.log(`     ↓`);
    } else {
      console.log(`  ${i + 1}. ${actor} ← CYCLE DETECTED!`);
    }
  });
  
  console.log(`\nCycle detection algorithm:`);
  console.log(`  1. Maintain visited set of seen actors`);
  console.log(`  2. For each actor in chain:`);
  console.log(`     - Check if already visited`);
  console.log(`     - If yes: Cycle detected, STOP`);
  console.log(`     - If no: Add to visited, continue`);
  
  console.log(`\nResolution path:`);
  const visited = new Set();
  const resolved = [];
  let cycleFound = false;
  
  for (const actor of cycle) {
    if (visited.has(actor)) {
      console.log(`  → ${actor} (visited) - CYCLE! Stop resolution\n`);
      cycleFound = true;
      break;
    }
    console.log(`  → ${actor}`);
    visited.add(actor);
    resolved.push(actor);
  }
  
  console.log('Resolution result:');
  console.log(`  Start: ${cycle[0]}`);
  console.log(`  End: ${resolved[resolved.length - 1]}`);
  console.log(`  Chain hops: ${resolved.length - 1}`);
  console.log(`  Cycle detected: YES`);
  console.log(`  Issues: Cycle detected involving: ${cycle[0]}\n`);
}

/**
 * Example 5: Revocation in chain
 */
async function example5_revocationDetection() {
  console.log('\n=== Example 5: Revocation Detection ===\n');
  
  const chain = [
    { actor: 'http://example.com/actor/alice', revoked: false },
    { actor: 'http://example.com/actor/bob', revoked: false },
    { actor: 'http://example.com/actor/carol', revoked: true },
    { actor: 'http://example.com/actor/carol_new', revoked: false }
  ];
  
  console.log('Chain with revoked credential:\n');
  
  const resolved = [];
  const issues = [];
  
  for (const entry of chain) {
    resolved.push(entry.actor);
    
    if (entry.revoked) {
      console.log(`  → ${entry.actor}${entry.revoked ? ' (REVOKED)' : ''}`);
      issues.push(`VC revoked for actor: ${entry.actor}`);
      break;
    } else {
      console.log(`  → ${entry.actor}`);
    }
  }
  
  console.log(`\nRevocation impact:`);
  console.log(`  ✗ VC revoked for actor: http://example.com/actor/carol`);
  console.log(`  ✗ Chain resolution STOPS at revocation`);
  console.log(`  ℹ  Identity migration chain is broken/invalid from this point\n`);
  
  console.log('Resolution result:');
  console.log(`  Chain completed up to: ${resolved[resolved.length - 1]}`);
  console.log(`  Issues: ${issues.join(', ')}\n`);
}

/**
 * Example 6: Custom maxDepth option
 */
async function example6_customMaxDepth() {
  console.log('\n=== Example 6: Custom maxDepth Option ===\n');
  
  console.log('Using resolveLineage with custom depth limit:\n');
  
  console.log('// Default: 10 hops max');
  console.log('const result1 = await lineage.resolveLineage(startActor);\n');
  
  console.log('// Custom: 5 hops max (stricter)');
  console.log('const result2 = await lineage.resolveLineage(startActor, { maxDepth: 5 });\n');
  
  console.log('// Custom: 20 hops max (more permissive)');
  console.log('const result3 = await lineage.resolveLineage(startActor, { maxDepth: 20 });\n');
  
  console.log('Result structure:');
  console.log(`{
  start: "http://...",         // Starting actor URL
  end: "http://...",           // Final actor URL (terminal or limit reached)
  chain: [                     // Array of VCs in the chain
    { id, issuerDid, subjectDid, oldActor, newActor },
    ...
  ],
  issues: [                    // Problems encountered
    "Max chain depth exceeded (5) at actor: ...",
    "Fork detected for actor: ...",
    "Cycle detected involving: ...",
    "VC revoked for actor: ...",
    ...
  ]
}\n`);
}

/**
 * Main execution
 */
async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  CHAIN DEPTH VERIFICATION - EXAMPLES (Task 5.1)               ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  
  try {
    await example1_normalChain();
    await example2_deepChain();
    await example3_forkDetection();
    await example4_cycleDetection();
    await example5_revocationDetection();
    await example6_customMaxDepth();
    
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('✅ All examples completed successfully\n');
    console.log('For production use, call:');
    console.log('  const result = await lineage.resolveLineage(actorUrl, options);\n');
    console.log('See docs/CHAIN_DEPTH_VERIFICATION.md for full documentation.\n');
    
  } catch (err) {
    console.error('\n❌ Error:', err.message, '\n');
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = {
  example1_normalChain,
  example2_deepChain,
  example3_forkDetection,
  example4_cycleDetection,
  example5_revocationDetection,
  example6_customMaxDepth
};
