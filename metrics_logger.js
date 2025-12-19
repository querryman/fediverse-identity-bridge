// metrics_logger.js
const fs = require('fs');
const path = require('path');

const CSV = path.join(__dirname, 'metrics.csv');
function ensureHeader() {
  if (!fs.existsSync(CSV)) fs.writeFileSync(CSV, 'ts,event,success,latency_ms\n');
}

function log(event, success = true, latency = 0) {
  ensureHeader();
  const line = `${Date.now()},${event},${success ? 1 : 0},${latency}\n`;
  fs.appendFileSync(CSV, line);
}

module.exports = { log };
