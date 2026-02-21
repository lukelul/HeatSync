// Map overlay functions
let mode = 'route';
let heatLayer = null;
let emLayer = null;

function setMode(m) {
  mode = m;
  ['route', 'heat', 'emissions'].forEach(id => {
    document.getElementById(`btn-${id}`).classList.toggle('active', id === m);
  });
  if (heatLayer) {
    map.removeLayer(heatLayer);
    heatLayer = null;
  }
  if (emLayer) {
    map.removeLayer(emLayer);
    emLayer = null;
  }
  if (m === 'heat') renderHeatmap();
  if (m === 'emissions') renderEmOverlay();
}

function renderHeatmap() {
  heatLayer = L.layerGroup();
  NODES.forEach(n => {
    if (n.type === 'tank') {
      const r = (n.cap || 30) * 18;
      [[r, 'rgba(0,230,118,.07)'], [r * .5, 'rgba(0,230,118,.14)'], [r * .2, '#00e676']].forEach(([r, c], i) => {
        L.circle([n.lat, n.lng], {
          radius: r,
          color: 'transparent',
          fillColor: c,
          fillOpacity: i === 2 ? .55 : .25
        }).addTo(heatLayer);
      });
      return;
    }
    const h = n.heat || 1;
    const c = n.type === 'source' ? '#ff4d00' : '#00c9ff';
    const r = h * 700;
    [[r, n.type === 'source' ? 'rgba(255,77,0,.12)' : 'rgba(0,201,255,.09)'], [r * .5, n.type === 'source' ? 'rgba(255,77,0,.12)' : 'rgba(0,201,255,.09)'], [r * .18, c]].forEach(([r, c], i) => {
      L.circle([n.lat, n.lng], {
        radius: r,
        color: 'transparent',
        fillColor: c,
        fillOpacity: i === 2 ? .65 : .22
      }).addTo(heatLayer);
    });
  });
  heatLayer.addTo(map);
}

function renderEmOverlay() {
  emLayer = L.layerGroup();
  const hr = new Date().getHours();
  const rate = CAMBIUM[hr] || 0;
  if (rate === 0) {
    emLayer.addTo(map);
    return;
  }
  const norm = (rate - 350) / 150;
  NODES.forEach(n => {
    if (n.type === 'tank') return;
    const h = n.heat || 1;
    let fc, r;
    if (n.type === 'source') {
      fc = norm > .65 ? 'rgba(255,77,0,.28)' : norm > .35 ? 'rgba(255,210,0,.22)' : 'rgba(0,230,118,.18)';
      r = h * 800;
    } else {
      fc = 'rgba(0,180,255,.15)';
      r = h * 600;
    }
    [r, r * .45].forEach((rad, i) => {
      L.circle([n.lat, n.lng], {
        radius: rad,
        color: 'transparent',
        fillColor: fc,
        fillOpacity: i ? 0.5 : 1
      }).addTo(emLayer);
    });
    L.marker([n.lat, n.lng], {
      icon: L.divIcon({
        className: '',
        html: `<div style="font-family:monospace;font-size:8px;color:${norm > .65 ? '#ff4d00' : norm > .35 ? '#ffd200' : '#00e676'};background:rgba(8,12,15,.85);padding:2px 4px;border-radius:2px;margin-top:12px">${rate} lbs</div>`,
        iconAnchor: [0, -8]
      })
    }).addTo(emLayer);
  });
  emLayer.addTo(map);
}
