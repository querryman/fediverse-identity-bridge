#!/usr/bin/env node
/**
 * Test script to verify Redis storage integration
 * Run after: docker-compose up redis
 */

const path = require("path");
const fs = require("fs");

// Test 1: Verify storage-redis module loads
console.log("=== Test 1: Load storage-redis module ===");
try {
  const storageRedis = require("../lib/storage-redis");
  console.log("✓ storage-redis module loaded");
} catch (e) {
  console.error("✗ Failed to load storage-redis:", e.message);
  process.exit(1);
}

// Test 2: Verify bridge.js can load with Redis backend
console.log("\n=== Test 2: Load bridge.js with Redis backend ===");
try {
  process.env.REDIS_HOST = "localhost";
  process.env.REDIS_PORT = "6379";
  // Don't actually start the server, just verify it loads
  const { app } = require("../bridge.js");
  console.log("✓ bridge.js loads with Redis backend");
} catch (e) {
  console.error("✗ Failed to load bridge.js:", e.message);
  process.exit(1);
}

// Test 3: Verify migration script exists
console.log("\n=== Test 3: Verify migration script ===");
const migrationScript = path.join(__dirname, "migrate-to-redis.js");
if (fs.existsSync(migrationScript)) {
  console.log("✓ scripts/migrate-to-redis.js exists");
} else {
  console.error("✗ scripts/migrate-to-redis.js not found");
  process.exit(1);
}

// Test 4: Verify .env.example exists
console.log("\n=== Test 4: Verify .env.example ===");
const envExample = path.join(__dirname, "..", ".env.example");
if (fs.existsSync(envExample)) {
  const content = fs.readFileSync(envExample, "utf8");
  if (content.includes("REDIS_HOST")) {
    console.log("✓ .env.example exists with REDIS_HOST");
  } else {
    console.error("✗ .env.example missing REDIS_HOST");
    process.exit(1);
  }
} else {
  console.error("✗ .env.example not found");
  process.exit(1);
}

console.log("\n=== All Tests Passed ===");
console.log("\nNext steps:");
console.log("1. docker-compose up redis");
console.log("2. node scripts/migrate-to-redis.js");
console.log("3. REDIS_HOST=localhost node bridge.js");
process.exit(0);
