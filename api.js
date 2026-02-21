// Closed-loop API: poll temps → compute routing → post commands
const API_BASE = "http://localhost:3000";
const HOT_THRESHOLD = 50;
let _apiFailCount = 0;
let _loopTick = 0;
let _lastRoutes = [];

function startApiPolling() {
  const interval = _apiFailCount >= 3 ? 30000 : 1000;
  setTimeout(async () => {
    await closedLoopTick();
    startApiPolling();
  }, interval);
}

// One tick of the closed loop: read → decide → command → display
async function closedLoopTick() {
  const nodes = await refreshTemps();
  if (!nodes || !nodes.length) return;

  const routes = computeHeatRoutes(nodes);
  _lastRoutes = routes;
  _loopTick++;

  await postCommands(routes);
  updateLivePanel(nodes, routes);
}

// Fetch latest telemetry, update local NODES, return raw array (or null on failure)
async function refreshTemps() {
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${API_BASE}/api/nodes`, { signal: controller.signal });
    clearTimeout(tid);
    const data = await res.json();
    const nodes = data.nodes || [];
    for (const upd of nodes) {
      const node = NODES.find(n => n.id === upd.id);
      if (node) node.temp = upd.tempC;
    }
    _apiFailCount = 0;
    updateNodeList();
    updateScheduleChart();
    return nodes;
  } catch (err) {
    _apiFailCount++;
    if (_apiFailCount === 3) {
      console.warn('[HeatRouter] API unreachable after 3 attempts, reducing poll to 30s');
    }
    return null;
  }
}

// Classify nodes by temperature, allocate 100 units per source across cooler sinks
function computeHeatRoutes(nodes) {
  const sources = nodes.filter(n => n.tempC >= HOT_THRESHOLD);
  const sinks = nodes.filter(n => n.tempC < HOT_THRESHOLD);
  const routes = [];

  for (const src of sources) {
    const eligible = sinks.filter(s => s.tempC < src.tempC);
    if (!eligible.length) continue;

    const diffs = eligible.map(s => src.tempC - s.tempC);
    const total = diffs.reduce((a, b) => a + b, 0);
    if (total <= 0) continue;

    for (let i = 0; i < eligible.length; i++) {
      const units = Math.round(100 * diffs[i] / total);
      if (units > 0) {
        routes.push({ from: src.id, to: eligible[i].id, units });
      }
    }
  }
  return routes;
}

// Send routing decisions to server for the simulator to consume
async function postCommands(routes) {
  try {
    await fetch(`${API_BASE}/api/commands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        routes,
        meta: { tick: _loopTick, ts: Date.now() }
      })
    });
  } catch (e) {}
}

// Render the live telemetry + routing panel in the right sidebar
function updateLivePanel(nodes, routes) {
  const el = document.getElementById('live-loop');
  if (!el) return;

  const connected = _apiFailCount === 0;
  const dot = connected
    ? '<span style="color:#00e676">\u25CF CONNECTED</span>'
    : '<span style="color:#ff4d00">\u25CF DISCONNECTED</span>';

  let html = '<div style="display:flex;justify-content:space-between;margin-bottom:6px">'
    + dot
    + '<span style="color:var(--muted)">Tick #' + _loopTick + '</span></div>';

  // Node temperature badges
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:3px;margin-bottom:8px">';
  for (const n of nodes) {
    const hot = n.tempC >= HOT_THRESHOLD;
    const c = hot ? '#ff4d00' : '#00c9ff';
    html += '<div style="font-size:8px;padding:2px 4px;border-left:2px solid ' + c + '">'
      + '<span style="color:' + c + '">' + n.tempC.toFixed(1) + '\u00B0C</span> #' + n.id
      + '</div>';
  }
  html += '</div>';

  // Active routes
  if (routes.length) {
    html += '<div style="border-top:1px solid var(--border);padding-top:5px">';
    for (const r of routes) {
      html += '<div style="font-size:8px;color:var(--muted);padding:1px 0">'
        + '<span style="color:#ff4d00">#' + r.from + '</span> \u2192 '
        + '<span style="color:#00c9ff">#' + r.to + '</span> : '
        + '<span style="color:var(--green)">' + r.units + 'u</span></div>';
    }
    html += '</div>';
  } else {
    html += '<div style="font-size:8px;color:var(--muted);text-align:center;padding:4px 0">No active routes</div>';
  }

  el.innerHTML = html;
}
