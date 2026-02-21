// UI and node selection functions
let selectedSources = [];
let selectedSink = null;
let selectedSource = null;

function updateCityHeader() {
  const doc = AppState.selectedCityDoc;
  const tagline = document.getElementById('city-tagline');
  if (tagline) {
    const cityLabel = doc?.metadata?.city || doc?.name || 'No City Selected';
    tagline.textContent = 'Thermal Packet Switching // ' + cityLabel;
  }

  const sources = NODES.filter(n => n.type === 'source');
  const sinks = NODES.filter(n => n.type === 'sink');
  const totalSourceHeat = sources.reduce((s, n) => s + (n.heat || 0), 0);
  const totalSinkHeat = sinks.reduce((s, n) => s + (n.heat || 0), 0);
  const recoverable = Math.min(totalSourceHeat, totalSinkHeat);

  if (NODES.length > 0) {
    document.getElementById('total-heat').textContent = recoverable.toFixed(1) + ' MW';
    if (recoverable > 0) {
      const co2Tons = Math.round(recoverable * 1000 * 8760 * EGRID_KG / 1000);
      document.getElementById('total-savings').textContent = co2Tons.toLocaleString() + ' t/yr';
      const distEstKm = sources.length && sinks.length
        ? sources.reduce((sum, src) => sum + sinks.reduce((d, sk) => d + haverDist(src, sk), 0), 0) / (sources.length * sinks.length)
        : 0;
      const costM = ((distEstKm * 1000 * 1200) / 1e6 + recoverable * 0.18).toFixed(1);
      document.getElementById('total-cost').textContent = '$' + costM + 'M';
    } else {
      document.getElementById('total-savings').textContent = '—';
      document.getElementById('total-cost').textContent = '$—M';
    }
  } else {
    document.getElementById('total-heat').textContent = '— MW';
    document.getElementById('total-savings').textContent = '—';
    document.getElementById('total-cost').textContent = '$—M';
  }
}

function selectNode(n, m) {
  if (n.type === 'tank') {
    n.active = !n.active;
    m.setIcon(getIcon(n, n.active));
    updateNodeList();
    return;
  }
  if (n.type === 'source') {
    const i = selectedSources.indexOf(n);
    if (i >= 0) {
      selectedSources.splice(i, 1);
      m.setIcon(getIcon(n, false));
    } else {
      selectedSources.push(n);
      m.setIcon(getIcon(n, true));
    }
    selectedSource = selectedSources[0] || null;
    updateNodeList();
    document.getElementById('status-text').textContent = selectedSink ? 'Ready — click Run' : 'Pick a sink';
    return;
  }
  if (selectedSink) selectedSink.marker.setIcon(getIcon(selectedSink, false));
  selectedSources.forEach(s => s.marker.setIcon(getIcon(s, false)));
  selectedSources = [];
  selectedSink = n;
  m.setIcon(getIcon(n, true));
  const scored = NODES.filter(x => x.type === 'source').map(s => ({
    node: s,
    score: haverDist(s, n) * .5 + 1 / (s.heat + .1) * 2,
    d: haverDist(s, n).toFixed(2)
  })).sort((a, b) => a.score - b.score);
  let cov = 0;
  for (const s of scored) {
    if (cov >= n.heat || selectedSources.length >= 3) break;
    selectedSources.push(s.node);
    s.node._dist = s.d;
    s.node._rank = selectedSources.length;
    cov += s.node.heat;
  }
  selectedSources.forEach(s => s.marker.setIcon(getIconR(s, s._rank)));
  selectedSource = selectedSources[0] || null;
  updateNodeList();
  document.getElementById('status-text').textContent = `Auto-selected ${selectedSources.length} source(s)`;
  console.log('[HeatRouter] sink selected, scheduling runOptimization in 600ms');
  setTimeout(() => {
    if (!animating) runOptimization();
  }, 600);
}

function updateNodeList() {
  document.getElementById('node-list').innerHTML = NODES.map(n => {
    const isSink = selectedSink === n;
    const sr = selectedSources.indexOf(n);
    const isSrc = sr >= 0;
    const isTank = n.type === 'tank' && n.active !== false;
    return `<div class="node-card ${n.type} ${isSink || isSrc || isTank ? 'selected' : ''}" onclick="selectNode(NODES[${n.id}], NODES[${n.id}].marker)">
      <button class="node-del-btn" onclick="event.stopPropagation();deleteNode(${n.id})" title="Delete node">&times;</button>
      <div class="node-name">${n.name}${isSrc ? ` <span style="color:#ff8c00;font-size:8px">▲#${sr+1}</span>` : ''}${n.type === 'tank' ? ` <span style="color:${isTank ? '#00e676' : '#4a6070'};font-size:8px">${isTank ? '●ON' : '○OFF'}</span>` : ''}</div>
      <div class="node-meta">${n.desc}${isSrc && n._dist ? ' · ' + n._dist + 'km' : ''}</div>
      <div class="node-heat" style="${n.type === 'tank' ? 'color:#00e676' : ''}">${n.type === 'source' ? '▲' + n.heat + 'MW@' + n.temp + '°C' : n.type === 'tank' ? '🛢' + n.cap + 'MWh' : '▼' + n.heat + 'MW@' + n.temp + '°C'}</div>
    </div>`;
  }).join('');
}

function resetAll() {
  if (animating) return;
  if (typeof clearStartupPipes === 'function') {
    try { clearStartupPipes(); } catch(e) {}
  }
  [...routeLayer, ...exploredLayer].forEach(l => {
    try { map.removeLayer(l); } catch(e) {}
  });
  routeLayer = [];
  exploredLayer = [];
  if (heatLayer) {
    try { map.removeLayer(heatLayer); } catch(e) {}
    heatLayer = null;
  }
  if (emLayer) {
    try { map.removeLayer(emLayer); } catch(e) {}
    emLayer = null;
  }
  selectedSources.forEach(s => s.marker?.setIcon(getIcon(s, false)));
  selectedSources = [];
  selectedSource = null;
  if (selectedSink) {
    selectedSink.marker?.setIcon(getIcon(selectedSink, false));
    selectedSink = null;
  }
  NODES.filter(n => n.type === 'tank').forEach(n => {
    n.active = true;
    n.marker?.setIcon(getIcon(n, false));
  });
  NODES.filter(n => n.type !== 'tank').forEach(n => n.marker?.setIcon(getIcon(n, false)));
  clearObstructions();
  if (obstructMode) toggleObstructMode();
  hideRouteError();
  document.getElementById('nodes-visited').textContent = '0';
  document.getElementById('route-length').textContent = '— km';
  document.getElementById('heat-recovered').textContent = '— MW';
  document.getElementById('status-text').textContent = 'Click any 🔵 sink to auto-route';
  document.getElementById('algo-steps').innerHTML = '<div class="select-hint">Click any blue sink node.</div>';
  document.getElementById('projects-list').innerHTML = '<div class="select-hint">Run optimization.</div>';
  document.getElementById('brief-area').innerHTML = '<div class="select-hint">Run optimization.</div>';
  updateNodeList();
  updateCityHeader();
}
