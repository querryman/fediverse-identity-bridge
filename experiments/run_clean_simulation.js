// experiments/run_clean_simulation.js
// Automates a clean simulation run:
// 1. Stops any process listening on port 4000 (Bridge) using taskkill
// 2. Backs up registry/vc_registry.json to vc_registry.json.bak.<timestamp>
// 3. Removes vc_registry.json
// 4. Starts Bridge and optionally a new instance (3001)
// 5. Runs simulate_migration_local.js
// 6. Stops Bridge & new instance started by this script
// 7. Restores original vc_registry.json from the backup

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const BRIDGE_PORT = 4000;
const NEW_INSTANCE_PORT = 3001;
const NEW_INSTANCE_USER = 'alice_new';

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { shell: true, stdio: 'inherit', ...opts });
    p.on('exit', code => (code === 0 ? resolve(code) : reject(new Error(`Exit ${code}`))));
    p.on('error', reject);
  });
}

async function findPidByPort(port) {
  return new Promise(resolve => {
    const cmd = `netstat -ano | findstr :${port}`;
    const p = spawn('cmd', ['/c', cmd], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', d => (out += d.toString()));
    p.on('close', () => {
      const lines = out.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        const parts = line.split(/\s+/);
        // Expected: Proto LocalAddress ForeignAddress State PID
        const pid = parts[parts.length - 1];
        if (pid && !isNaN(Number(pid))) return resolve(Number(pid));
      }
      resolve(null);
    });
  });
}

async function killPid(pid) {
  try {
    await run('taskkill', ['/PID', String(pid), '/F']);
    console.log(`Killed PID ${pid}`);
    return true;
  } catch (e) {
    console.warn(`Failed to kill PID ${pid}: ${e.message}`);
    return false;
  }
}

async function waitForPort(port, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`, { method: 'GET', timeout: 1000 });
      if (res) return true;
    } catch (e) {
      // ignore
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`Port ${port} not open within ${timeout}ms`);
}

(async () => {
  try {
    console.log('🔄 Running clean simulation flow');

    // 1. Stop Bridge if running
    const pid = await findPidByPort(BRIDGE_PORT);
    if (pid) {
      console.log(`Found process listening on ${BRIDGE_PORT}: PID ${pid}. Attempting to kill.`);
      await killPid(pid);
      // Give it a moment
      await new Promise(r => setTimeout(r, 1000));
    } else {
      console.log(`No process found on port ${BRIDGE_PORT}`);
    }

    // 2. Backup registry/vc_registry.json
  let bridgeProcess = null;
  let newInstanceProcess = null;
  let vcBackupFile = null;
  let didBackupFile = null;

  try {
    console.log('🔄 Running clean simulation flow');

    // 1. Stop Bridge if running
    const pid = await findPidByPort(BRIDGE_PORT);
    if (pid) {
      console.log(`Found process listening on ${BRIDGE_PORT}: PID ${pid}. Attempting to kill.`);
      await killPid(pid);
      await new Promise(r => setTimeout(r, 1000)); // Give it a moment
    } else {
      console.log(`No process found on port ${BRIDGE_PORT}`);
    }

    // 2. Backup registry files
    const REG_DIR = path.join(__dirname, '..', 'registry');
    const VC_FILE = path.join(REG_DIR, 'vc_registry.json');
    const DID_FILE = path.join(REG_DIR, 'did_registry.json');

    if (fs.existsSync(VC_FILE)) {
      vcBackupFile = VC_FILE + '.bak.' + Date.now();
      fs.copyFileSync(VC_FILE, vcBackupFile);
      console.log(`Backed up ${VC_FILE} -> ${vcBackupFile}`);
      fs.unlinkSync(VC_FILE);
      console.log(`Removed ${VC_FILE}`);
    } else {
      console.log('No existing vc_registry.json to backup');
    }

    if (fs.existsSync(DID_FILE)) {
      didBackupFile = DID_FILE + '.bak.' + Date.now();
      fs.copyFileSync(DID_FILE, didBackupFile);
      console.log(`Backed up ${DID_FILE} -> ${didBackupFile}`);
      fs.unlinkSync(DID_FILE);
      console.log(`Removed ${DID_FILE}`);
    } else {
      console.log('No existing did_registry.json to backup');
    }

    // 3. Start Bridge
    console.log('Starting Bridge...');
    bridgeProcess = spawn('node', ['bridge.js'], { cwd: path.join(__dirname, '..'), stdio: ['ignore', 'inherit', 'inherit'] });
    await waitForPort(BRIDGE_PORT);
    console.log('Bridge started and responding');

    // 4. Start new instance
    console.log('Starting new instance (server.js) on port', NEW_INSTANCE_PORT);
    const newScript = `require('./server').listen(process.env.PORT || ${NEW_INSTANCE_PORT}).then(()=>console.log('ActivityPub node listening on ${NEW_INSTANCE_PORT}')).catch(e=>console.error(e))`;
    newInstanceProcess = spawn('node', ['-e', newScript], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, PORT: NEW_INSTANCE_PORT, USERS: NEW_INSTANCE_USER },
      stdio: ['ignore', 'inherit', 'inherit']
    });
    await waitForPort(NEW_INSTANCE_PORT); // Wait for the new instance to be truly ready
    console.log('New instance started and responding');

    // 5. Run simulate_migration_local.js
    console.log('Running simulation script...');
    await run('node', ['experiments/simulate_migration_local.js']);

    console.log('Simulation finished successfully');

    // 6. Cleanup: kill processes started by us
    console.log('Stopping new instance and bridge...');
    try { newInst.kill(); } catch {};
    try { bridge.kill(); } catch {};

    // 7. Restore registry
    if (backedUp) {
      fs.copyFileSync(BK_FILE, VC_FILE);
      console.log(`Restored ${VC_FILE} from ${BK_FILE}`);
    }

    console.log('✅ Clean simulation run complete');
    process.exit(0);
  } catch (e) {
    console.error('❌ Clean simulation failed:', e && e.stack ? e.stack : e);
    process.exit(1);
  }
})();