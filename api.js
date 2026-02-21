const API_BASE = "http://10.147.32.22:3000";

async function refreshTemps() {
  try {
    const res = await fetch(`${API_BASE}/api/nodes`);
    const data = await res.json();

    for (const upd of (data.nodes || [])) {
      const node = NODES.find(n => n.id === upd.id);
      if (node) node.temp = upd.tempC;
    }

    updateNodeList();
    updateScheduleChart();
  } catch (err) {
    console.warn("API fetch failed:", err);
  }
}

