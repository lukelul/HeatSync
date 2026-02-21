// Map initialization and rendering
let map;
let routeLayer = [];
let exploredLayer = [];
let startupPipes = [];

function initMap() {
  map = L.map('map', {zoomControl: false}).setView([41.888, -87.638], 14);
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
      .bindTooltip(`<b>${n.name}</b><br>${n.type === 'tank' ? n.cap + ' MWh' : n.heat + ' MW'}`, {direction: 'top'});
    m.on('click', e => {
      if (!obstructMode) {
        e.originalEvent.stopPropagation();
        selectNode(n, m);
      }
    });
    n.marker = m;
  });
}

async function drawStartupPipes() {
  const sources = NODES.filter(n => n.type === 'source');
  const tanks = NODES.filter(n => n.type === 'tank' && n.active !== false);
  if (!tanks.length) return;
  for (const src of sources) {
    const tank = [...tanks].sort((a, b) => haverDist(src, a) - haverDist(src, b))[0];
    const seg = await ensureRoad(src.id, tank.id);
    if (!seg || seg.coords.length < 3) continue;
    startupPipes.push(L.polyline(seg.coords, {color: '#00e676', weight: 8, opacity: .06}).addTo(map));
    startupPipes.push(L.polyline(seg.coords, {color: '#00e676', weight: 2, opacity: .35, dashArray: '6 8'}).addTo(map));
    let idx = 0;
    const dot = L.circleMarker(seg.coords[0], {
      radius: 4,
      color: '#00e676',
      fillColor: '#00e676',
      fillOpacity: .9,
      weight: 0
    }).addTo(map);
    startupPipes.push(dot);
    const spd = Math.max(1, Math.floor(seg.coords.length / 60));
    (function step() {
      idx = (idx + spd) % seg.coords.length;
      dot.setLatLng(seg.coords[idx]);
      setTimeout(step, 25);
    })();
  }
}
