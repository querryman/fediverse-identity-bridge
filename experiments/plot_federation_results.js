const fs = require("fs");
const path = require("path");
const { ChartJSNodeCanvas } = require("chartjs-node-canvas");

async function plot(csvPath, outDir) {
  const rows = fs.readFileSync(csvPath, "utf8").trim().split("\n").slice(1);
  const latency = [];
  const cpu = [];
  const ram = [];

  for (const row of rows) {
    const [i, l, v, c, r] = row.split(",");
    latency.push(+l);
    cpu.push(+c);
    ram.push(+r);
  }

  const width = 900, height = 400;
  const canvas = new ChartJSNodeCanvas({ width, height });

  async function saveChart(data, label, outFile) {
    const cfg = {
      type: "line",
      data: {
        labels: data.map((_, i) => i),
        datasets: [{
          label,
          data,
          borderColor: "rgba(0, 120, 255, 0.9)",
          borderWidth: 1.5,
          fill: false
        }]
      }
    };
    const img = await canvas.renderToBuffer(cfg);
    fs.writeFileSync(path.join(outDir, outFile), img);
  }

  await saveChart(latency, "Latency (ms)", "federation_plot_latency.png");
  await saveChart(cpu, "Bridge CPU (%)", "federation_plot_cpu.png");
  await saveChart(ram, "Bridge RAM (MB)", "federation_plot_ram.png");

  console.log("Charts saved.");
}

module.exports = plot;
