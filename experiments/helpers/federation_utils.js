// helpers/federation_utils.js
// Utility functions for spawning multiple ActivityPub nodes + bridge.

const { spawn } = require("child_process");
const path = require("path");

function sleep(ms) {
  return new Promise(res => setTimeout(res, ms));
}

async function spawnNode(port, users) {
  return new Promise(resolve => {
    const env = Object.assign({}, process.env, {
      PORT: String(port),
      DOMAIN: `localhost:${port}`,
      USERS: users.join(",")
    });

    const child = spawn("node", ["server.js"], {
      cwd: path.join(__dirname, "../.."),
      env,
      stdio: "inherit",
    });

    setTimeout(() => resolve(child), 1200);
  });
}

async function spawnBridge() {
  return new Promise(resolve => {
    const child = spawn("node", ["bridge.js"], {
      cwd: path.join(__dirname, "../.."),
      env: process.env,
      stdio: "inherit",
    });

    setTimeout(() => resolve(child), 1200);
  });
}

module.exports = {
  spawnNode,
  spawnBridge,
  sleep
};
