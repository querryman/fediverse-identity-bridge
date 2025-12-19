/**
 * plot_sweep.js (fixed, publication-ready)
 */

const fs = require("fs");
const path = require("path");
const { ChartJSNodeCanvas } = require("chartjs-node-canvas");

const WIDTH = 1600;
const HEIGHT = 800;

function percentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a,b) => a-b);
  const idx = Math.floor((p / 100) * sorted.length);
  return sorted[idx];
}

async function plotSweep() {
  const resultsDir = process.argv[2];
  if (!resultsDir) {
    console.error("Usage: node plot_sweep.js <results_dir>");
    process.exit(1);
  }

  const summaryPath = path.join(resultsDir, "sweep_summary.json");
  const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));

  const conc = summary.map(r => r.concurrency);
  const avg = summary.map(r => r.avgLatency);
  const p95 = summary.map(r => r.p95);
  const p99 = summary.map(r => r.p99);
  const throughput = summary.map(r =>
    Math.round(1000 / r.avgLatency * r.concurrency)
  );
  const failures = summary.map(r => r.failures);
  const ram = summary.map(r => r.maxBridgeRam);

  const canvas = new ChartJSNodeCanvas({ width: WIDTH, height: HEIGHT });

  function save(name, config) {
    return canvas.renderToBuffer(config).then(buf =>
      fs.writeFileSync(path.join(resultsDir, name), buf)
    );
  }

  // LATENCY PLOT
  await save("sweep_latency.png", {
    type: "line",
    data: {
      labels: conc,
      datasets: [
        { label: "Avg Latency (ms)", data: avg, borderColor: "blue", fill: false },
        { label: "p95 (ms)", data: p95, borderColor: "orange", fill: false },
        { label: "p99 (ms)", data: p99, borderColor: "red", fill: false }
      ]
    },
    options: {
      responsive: false,
      scales: {
        x: { type: "logarithmic", title: { display: true, text: "Concurrency" } },
        y: { title: { display: true, text: "Latency (ms)" } }
      }
    }
  });

  // THROUGHPUT
  await save("sweep_throughput.png", {
    type: "line",
    data: {
      labels: conc,
      datasets: [
        { label: "Throughput (req/sec)", data: throughput, borderColor: "green", fill: false }
      ]
    },
    options: {
      responsive: false,
      scales: {
        x: { type: "logarithmic" },
        y: { title: { display: true, text: "req/sec" } }
      }
    }
  });

  // FAILURES
  await save("sweep_failures.png", {
    type: "bar",
    data: {
      labels: conc,
      datasets: [
        { label: "Failures", data: failures, backgroundColor: "red" }
      ]
    },
    options: {
      responsive: false,
      scales: {
        x: { type: "logarithmic" },
        y: { title: { display: true, text: "Failures" }, beginAtZero: true }
      }
    }
  });

  // RAM
  await save("sweep_ram.png", {
    type: "line",
    data: {
      labels: conc,
      datasets: [
        { label: "Bridge RAM (MB)", data: ram, borderColor: "purple", fill: false }
      ]
    },
    options: {
      responsive: false,
      scales: {
        x: { type: "logarithmic" },
        y: { title: { display: true, text: "RAM (MB)" } }
      }
    }
  });

  console.log("Plots generated successfully.");
}

plotSweep();
