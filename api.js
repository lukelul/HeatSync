const API_BASE = "http://10.147.32.22:3000";
let _apiFailCount = 0;

function startApiPolling() {
  const interval = _apiFailCount >= 3 ? 30000 : 1000;
  setTimeout(async () => {
    await refreshTemps();
    startApiPolling();
  }, interval);
}

async function refreshTemps() {
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${API_BASE}/api/nodes`, { signal: controller.signal });
    clearTimeout(tid);
    const data = await res.json();
    for (const upd of (data.nodes || [])) {
      const node = NODES.find(n => n.id === upd.id);
      if (node) node.temp = upd.tempC;
    }
    _apiFailCount = 0;
    updateNodeList();
    updateScheduleChart();
  } catch (err) {
    _apiFailCount++;
    if (_apiFailCount === 3) {
      console.warn('[HeatRouter] API unreachable after 3 attempts, reducing poll to 30s');
    }
  }
}
