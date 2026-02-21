const express = require('express');
const cors = require('cors');
const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// In-memory stores
let latestTelemetry = { nodes: [] };
let latestCommands = { routes: [], meta: {} };
let telemetryCount = 0;
let commandCount = 0;

// --- Telemetry (simulator → server → frontend) ---

app.post('/api/telemetry', (req, res) => {
  latestTelemetry = req.body;
  telemetryCount++;
  res.json({ ok: true, received: (req.body.nodes || []).length });
});

app.get('/api/nodes', (req, res) => {
  res.json(latestTelemetry);
});

// --- Commands (frontend → server → simulator) ---

app.post('/api/commands', (req, res) => {
  latestCommands = req.body;
  commandCount++;
  res.json({ ok: true, routes: (req.body.routes || []).length });
});

app.get('/api/commands', (req, res) => {
  res.json(latestCommands);
});

// --- Health check ---

app.get('/api/status', (req, res) => {
  res.json({
    uptime: process.uptime(),
    telemetryCount,
    commandCount,
    nodesTracked: (latestTelemetry.nodes || []).length,
    activeRoutes: (latestCommands.routes || []).length
  });
});

app.listen(PORT, () => {
  console.log(`[HeatRouter API] Running on http://localhost:${PORT}`);
  console.log(`[HeatRouter API] Endpoints:`);
  console.log(`  POST /api/telemetry  — simulator posts temps`);
  console.log(`  GET  /api/nodes      — frontend reads temps`);
  console.log(`  POST /api/commands   — frontend posts routes`);
  console.log(`  GET  /api/commands   — simulator reads routes`);
  console.log(`  GET  /api/status     — health check`);
});
