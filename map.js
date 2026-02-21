// Map initialization and rendering
let map;
let routeLayer = [];
let exploredLayer = [];
let startupPipes = [];
let _pipesActive = false;

function initMap() {
  if (map) {
    map.invalidateSize();
    return;
  }
  const doc = AppState.selectedCityDoc;
  const center = doc?.metadata?.center || [41.888, -87.638];
  const zoom = doc?.metadata?.zoom || 14;

  map = L.map('map', {zoomControl: false}).setView(center, zoom);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '©OSM ©CARTO',
    maxZoom: 19
  }).addTo(map);
  L.control.zoom({position: 'bottomright'}).addTo(map);
  map.on('click', handleObstructClick);
  renderNodes();
  initCharts();
}

function getIcon(n, sel) {
  if (n.type === 'tank') {
    const s = sel ? 20 : 15;
    return L.divIcon({
      className: '',
      html: `<div style="width:${s}px;height:${s}px;border-radius:50%;background:#00e676;border:2px solid ${sel ? 'white' : '#00b050'};${sel ? 'box-shadow:0 0 14px #00e676;' : 'box-shadow:0 0 6px rgba(0,230,118,.4);'}display:flex;align-items:center;justify-content:center;font-size:9px">🛢</div>`,
      iconSize: [s, s],
      iconAnchor: [s/2, s/2]
    });
  }
  const c = n.type === 'source' ? '#ff4d00' : '#00c9ff';
  const s = sel ? 18 : 13;
  return L.divIcon({
    className: '',
    html: `<div style="width:${s}px;height:${s}px;border-radius:50%;background:${c};border:2px solid ${sel ? 'white' : c};${sel ? `box-shadow:0 0 14px ${c};` : ''}"></div>`,
    iconSize: [s, s],
    iconAnchor: [s/2, s/2]
  });
}

function getIconR(n, r) {
  const c = ['#ff4d00', '#ff8c00', '#ffb347'][Math.min(r - 1, 2)];
  const s = 16;
  return L.divIcon({
    className: '',
    html: `<div style="width:${s}px;height:${s}px;border-radius:50%;background:${c};border:2px solid white;box-shadow:0 0 12px ${c};display:flex;align-items:center;justify-content:center;font-family:monospace;font-size:9px;font-weight:700;color:white">${r}</div>`,
    iconSize: [s, s],
    iconAnchor: [s/2, s/2]
  });
}

function renderNodes() {
  NODES.forEach(n => {
    const m = L.marker([n.lat, n.lng], {icon: getIcon(n, false)})
      .addTo(map)
      .bindTooltip(`<b>${n.name}</b><br>${n.type === 'tank' ? (n.cap || 0) + ' MWh' : (n.heat || 0) + ' MW'}`, {direction: 'top'});
    m._isNodeMarker = true;
    m.on('click', e => {
      if (!obstructMode) {
        e.originalEvent.stopPropagation();
        selectNode(n, m);
      }
    });
    m.on('contextmenu', e => {
      e.originalEvent.preventDefault();
      e.originalEvent.stopPropagation();
      _showNodeDeletePopup(n, e.latlng);
    });
    n.marker = m;
  });
}

function _showNodeDeletePopup(node, latlng) {
  const popup = L.popup({closeButton: true, className: 'node-delete-popup', offset: [0, -8]})
    .setLatLng(latlng)
    .setContent(`<div style="text-align:center;padding:2px">
      <div style="font-size:10px;font-weight:700;margin-bottom:6px">${node.name}</div>
      <button onclick="deleteNode(${node.id})" style="background:#ff0040;color:white;border:none;border-radius:3px;padding:5px 12px;font-family:'Space Mono',monospace;font-size:9px;cursor:pointer;font-weight:700">Delete Node</button>
    </div>`)
    .openOn(map);
}

function deleteNode(nodeId) {
  map.closePopup();
  const node = NODES.find(n => n.id === nodeId);
  if (!node) return;
  if (node.marker) {
    try { map.removeLayer(node.marker); } catch(e) {}
  }
  const idx = NODES.indexOf(node);
  if (idx >= 0) NODES.splice(idx, 1);
  NODES.forEach((n, i) => n.id = i);

  if (selectedSink === node) selectedSink = null;
  const si = selectedSources.indexOf(node);
  if (si >= 0) selectedSources.splice(si, 1);

  clearStartupPipes();
  map.eachLayer(layer => { if (layer._isNodeMarker) map.removeLayer(layer); });
  renderNodes();
  updateNodeList();
  updateCityHeader();

  if (AppState.selectedCityId) {
    saveCurrentCity();
  }
}

function clearStartupPipes() {
  startupPipes.forEach(l => { try { map.removeLayer(l); } catch(e) {} });
  startupPipes = [];
}

async function drawStartupPipes() {
  if (!map) return;
  const sources = NODES.filter(n => n.type === 'source');
  const tanks = NODES.filter(n => n.type === 'tank' && n.active !== false);
  if (!sources.length || !tanks.length) return;
  for (const src of sources) {
    if (src.id == null || !NODES[src.id]) continue;
    const tank = [...tanks].sort((a, b) => haverDist(src, a) - haverDist(src, b))[0];
    if (tank.id == null || !NODES[tank.id]) continue;
    try {
      const seg = await ensureRoad(src.id, tank.id);
      if (!seg || seg.coords.length < 3) continue;
      startupPipes.push(L.polyline(seg.coords, {color: '#00e676', weight: 8, opacity: .06}).addTo(map));
      startupPipes.push(L.polyline(seg.coords, {color: '#00e676', weight: 2, opacity: .35, dashArray: '6 8'}).addTo(map));
      let idx = 0;
      const dot = L.circleMarker(seg.coords[0], {
        radius: 4, color: '#00e676', fillColor: '#00e676', fillOpacity: .9, weight: 0
      }).addTo(map);
      startupPipes.push(dot);
      const spd = Math.max(1, Math.floor(seg.coords.length / 60));
      (function step() {
        if (!map || !dot._map) return;
        idx = (idx + spd) % seg.coords.length;
        dot.setLatLng(seg.coords[idx]);
        setTimeout(step, 25);
      })();
    } catch(e) {
      console.warn('drawStartupPipes segment failed:', e);
    }
  }
}
