/**
 * plot_results.js
 * Generates PNG charts from scaling_raw.csv
 *
 * Updated to match new CSV format:
 * i,latency_ms,valid,bridge_cpu,bridge_ram_mb
 */

const fs = require("fs");
const path = require("path");
const { ChartJSNodeCanvas } = require("chartjs-node-canvas");

const WIDTH = 1200;
const HEIGHT = 600;

async function plot(csvPath, outDir) {
  const raw = fs.readFileSync(csvPath, "utf8")
    .trim()
    .split("\n")
    .slice(1) // skip header
    .map(line => {
      const [i, lat, valid, bcpu, bram] = line.split(",");

      return {
        i: Number(i),
        latency: Number(lat),
        valid: valid === "true",
        bridge_cpu: Number(bcpu),
        bridge_ram: Number(bram)
      };
    });

  // ---------------------------------------
  // Extract series
  // ---------------------------------------
  const X = raw.map(r => r.i);
  const latency = raw.map(r => r.latency);
  const bridgeCPU = raw.map(r => r.bridge_cpu);
  const bridgeRAM = raw.map(r => r.bridge_ram);

  const canvas = new ChartJSNodeCanvas({ width: WIDTH, height: HEIGHT });

  async function saveChart(filename, chart) {
    const buffer = await canvas.renderToBuffer(chart);
    fs.writeFileSync(path.join(outDir, filename), buffer);
  }

  // ---------------------------------------
  // LATENCY
  // ---------------------------------------
  await saveChart("scaling_plot_latency.png", {
    type: "line",
    data: {
      labels: X,
      datasets: [
        {
          label: "Latency (ms)",
          data: latency,
          borderColor: "blue",
          borderWidth: 2,
          fill: false,
        }
      ]
    },
    options: {
      plugins: { title: { display: true, text: "Verification Latency Over Time" }},
      scales: { y: { title: { display: true, text: "ms" }}},
      responsive: false
    }
  });

  // ---------------------------------------
  // CPU (Bridge Only)
  // ---------------------------------------
  await saveChart("scaling_plot_cpu.png", {
    type: "line",
    data: {
      labels: X,
      datasets: [
        {
          label: "Bridge CPU (ticks)",
          data: bridgeCPU,
          borderColor: "red",
          borderWidth: 2,
          fill: false,
        }
      ]
    },
    options: {
      plugins: { title: { display: true, text: "Bridge CPU Usage Over Time (process ticks)" }},
      scales: { y: { title: { display: true, text: "ticks" }}},
      responsive: false
    }
  });

  // ---------------------------------------
  // RAM (Bridge Only)
  // ---------------------------------------
  await saveChart("scaling_plot_ram.png", {
    type: "line",
    data: {
      labels: X,
      datasets: [
        {
          label: "Bridge RAM (MB)",
          data: bridgeRAM,
          borderColor: "purple",
          borderWidth: 2,
          fill: false,
        }
      ]
    },
    options: {
      plugins: { title: { display: true, text: "Bridge RAM Usage Over Time" }},
      scales: { y: { title: { display: true, text: "MB" }}},
      responsive: false
    }
  });

  console.log("PNG plots generated.");
}

module.exports = plot;
