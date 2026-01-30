/**
 * process_monitor.js  — Minimal, stable, per-process monitor
 */

const os = require("os");

class ProcessMonitor {
  constructor(pid, intervalMs = 200) {
    this.pid = pid;
    this.interval = intervalMs;

    this.timer = null;
    this.samples = [];

    this.maxBridgeRam = 0;
  }

  capture() {
    let bridgeCPU = 0;
    let bridgeRAM = 0;

    try {
      const stat = readProcStat(this.pid);
      bridgeCPU = stat.cpu;
      bridgeRAM = stat.ram;
    } catch {
      bridgeCPU = 0;
      bridgeRAM = 0;
    }

    const sample = {
      ts: Date.now(),
      bridgeCPU,
      bridgeRAM
    };

    this.samples.push(sample);

    if (bridgeRAM > this.maxBridgeRam) this.maxBridgeRam = bridgeRAM;

    return sample;
  }

  start() {
    this.timer = setInterval(() => this.capture(), this.interval);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  lastSample() {
    if (this.samples.length === 0) {
      return {
        bridgeCPU: 0,
        bridgeRAM: 0
      };
    }
    return this.samples[this.samples.length - 1];
  }
}

/* =======================================================================
   WINDOWS + LINUX per-process memory/CPU
======================================================================= */

function readProcStat(pid) {
  const isWin = process.platform === "win32";
  return isWin ? readProcWin(pid) : readProcLinux(pid);
}

function readProcLinux(pid) {
  const fs = require("fs");
  const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8").split(" ");

  const utime = Number(stat[13]);
  const stime = Number(stat[14]);
  const cpu = utime + stime;

  const status = fs.readFileSync(`/proc/${pid}/status`, "utf8")
    .split("\n")
    .find(line => line.startsWith("VmRSS:"));
  
  const ramKB = status ? parseInt(status.split(/\s+/)[1]) : 0;
  const ramMB = Math.round(ramKB / 1024);

  return { cpu, ram: ramMB };
}

function readProcWin(pid) {
  const { execSync } = require("child_process");
  try {
    // Use PowerShell Get-Process to obtain WorkingSet (bytes) which is reliable
    // and avoids deprecated/erroneous WMIC output on some systems.
    const cmd = `powershell -NoProfile -Command "try { (Get-Process -Id ${pid} -ErrorAction Stop).WorkingSet } catch { exit 1 }"`;
    const output = execSync(cmd, { encoding: "utf8" }).trim();
    const ramBytes = parseInt(output) || 0;
    const ramMB = Math.round(ramBytes / 1024 / 1024);
    return { cpu: 0, ram: ramMB };
  } catch {
    return { cpu: 0, ram: 0 };
  }
}

module.exports = { ProcessMonitor };
