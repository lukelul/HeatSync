// Obstruction handling system
let obstructMode = false;
let obstructClickA = null;
let obstructMarkerA = null;
let obstructions = [];
let blockedSet = new Set();
let _skipMapClick = false;

function toggleObstructMode() {
  if (typeof map === 'undefined' || !map) {
    console.error('[HeatRouter] toggleObstructMode: map not initialized');
    return;
  }
  obstructMode = !obstructMode;
  const btn = document.getElementById('btn-obstruct');
  const hint = document.getElementById('obs-hint');
  btn.classList.toggle('active', obstructMode);
  btn.textContent = obstructMode ? '🚫 Painting...' : '🚫 Block Road';
  btn.style.background = obstructMode ? 'rgba(255,0,64,.18)' : '';
  map.getContainer().style.cursor = obstructMode ? 'crosshair' : '';
  hint.style.display = obstructMode ? 'block' : 'none';
  hint.textContent = 'Click start point of road to block';
  if (!obstructMode) {
    if (obstructMarkerA) {
      map.removeLayer(obstructMarkerA);
      obstructMarkerA = null;
    }
    obstructClickA = null;
  }
}

function handleObstructClick(e) {
  if (_skipMapClick) { _skipMapClick = false; return; }
  if (!obstructMode) return;
  const hint = document.getElementById('obs-hint');
  if (!obstructClickA) {
    obstructClickA = e.latlng;
    obstructMarkerA = L.circleMarker(e.latlng, {
      radius: 6,
      color: '#ff0040',
      fillColor: '#ff0040',
      fillOpacity: 1,
      weight: 2
    }).addTo(map);
    hint.textContent = 'Now click end point of road to block';
  } else {
    const b = e.latlng;
    hint.textContent = 'Fetching road segment...';
    fetchObstructionRoad(obstructClickA, b);
    if (obstructMarkerA) {
      map.removeLayer(obstructMarkerA);
      obstructMarkerA = null;
    }
    obstructClickA = null;
  }
}

async function fetchObstructionRoad(a, b) {
  const hint = document.getElementById('obs-hint');
  const matchUrl = `https://router.project-osrm.org/match/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson&radiuses=50;50`;
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 8000);
    const r = await fetch(matchUrl, { signal: controller.signal });
    clearTimeout(tid);
    const d = await r.json();
    if (d.code === 'Ok' && d.matchings?.[0]) {
      addObstruction(d.matchings[0].geometry.coordinates.map(c => [c[1], c[0]]));
      hint.textContent = obstructMode ? 'Click start point of road to block' : '';
      hint.style.display = obstructMode ? 'block' : 'none';
      return;
    }
  } catch (e) {
    if (e.name === 'AbortError') console.warn('[HeatRouter] Obstruction OSRM match timed out');
  }
  for (const [p, q] of [[a, b], [b, a]]) {
    const routeUrl = `https://router.project-osrm.org/route/v1/driving/${p.lng},${p.lat};${q.lng},${q.lat}?overview=full&geometries=geojson`;
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 8000);
      const r = await fetch(routeUrl, { signal: controller.signal });
      clearTimeout(tid);
      const d = await r.json();
      if (d.code === 'Ok' && d.routes?.[0] && d.routes[0].distance < haverDist(a, b) * 4000) {
        addObstruction(d.routes[0].geometry.coordinates.map(c => [c[1], c[0]]));
        hint.textContent = obstructMode ? 'Click start point of road to block' : '';
        hint.style.display = obstructMode ? 'block' : 'none';
        return;
      }
    } catch (e) {}
  }
  addObstruction([[a.lat, a.lng], [b.lat, b.lng]]);
  hint.textContent = obstructMode ? 'Road not found — straight-line block placed' : '';
  hint.style.display = obstructMode ? 'block' : 'none';
}

function addObstruction(coords) {
  const line = L.polyline(coords, {color: '#ff0040', weight: 5, opacity: .85, interactive: true}).addTo(map);
  const glow = L.polyline(coords, {color: '#ff0040', weight: 14, opacity: .15, interactive: true}).addTo(map);
  const obs = {coords, line, glow};
  const onClick = () => { _skipMapClick = true; removeObstruction(obs); };
  line.on('click', onClick);
  glow.on('click', onClick);
  obstructions.push(obs);
  Object.keys(RC).forEach(k => delete RC[k]);
  rebuildBlockedSet();
  document.getElementById('block-count').textContent = obstructions.length;
  _refreshPipesAfterBlockChange();
}

function removeObstruction(obs) {
  map.removeLayer(obs.line);
  map.removeLayer(obs.glow);
  obstructions = obstructions.filter(o => o !== obs);
  Object.keys(RC).forEach(k => delete RC[k]);
  rebuildBlockedSet();
  document.getElementById('block-count').textContent = obstructions.length;
  _refreshPipesAfterBlockChange();
}

function clearObstructions() {
  obstructions.forEach(o => {
    map.removeLayer(o.line);
    map.removeLayer(o.glow);
  });
  obstructions = [];
  Object.keys(RC).forEach(k => delete RC[k]);
  rebuildBlockedSet();
  document.getElementById('block-count').textContent = '0';
  _refreshPipesAfterBlockChange();
}

function _refreshPipesAfterBlockChange() {
  if (typeof clearStartupPipes === 'function') {
    try { clearStartupPipes(); } catch(e) {}
  }
  setTimeout(() => {
    if (typeof drawStartupPipes === 'function') drawStartupPipes();
  }, 300);
}

function rebuildBlockedSet() {
  blockedSet.clear();
  const STEP = 0.00008; // ~9m interpolation step
  const R = 1; // ±1 grid cell buffer (~11m)
  for (const obs of obstructions) {
    const oc = obs.coords;
    for (let s = 0; s < oc.length; s++) {
      _addGridPoint(oc[s][0], oc[s][1], R);
      if (s < oc.length - 1) {
        const dLat = oc[s + 1][0] - oc[s][0];
        const dLng = oc[s + 1][1] - oc[s][1];
        const len = Math.sqrt(dLat * dLat + dLng * dLng);
        const steps = Math.ceil(len / STEP);
        for (let k = 1; k < steps; k++) {
          const frac = k / steps;
          _addGridPoint(oc[s][0] + dLat * frac, oc[s][1] + dLng * frac, R);
        }
      }
    }
  }
}

function _addGridPoint(lat, lng, r) {
  const rLat = Math.round(lat * 1e4);
  const rLng = Math.round(lng * 1e4);
  for (let dx = -r; dx <= r; dx++) {
    for (let dy = -r; dy <= r; dy++) {
      blockedSet.add((rLat + dx) + ',' + (rLng + dy));
    }
  }
}

function routeIsBlocked(coords) {
  if (!obstructions.length) return false;

  // Fast grid check — obstruction coords are densified so this catches collinear routes
  if (blockedSet.size) {
    for (const c of coords) {
      const key = Math.round(c[0] * 1e4) + ',' + Math.round(c[1] * 1e4);
      if (blockedSet.has(key)) return true;
    }
  }

  // Segment intersection check for routes that cross an obstruction
  for (const obs of obstructions) {
    const oc = obs.coords;
    for (let i = 0; i < coords.length - 1; i++) {
      for (let j = 0; j < oc.length - 1; j++) {
        if (segsIntersect(coords[i], coords[i + 1], oc[j], oc[j + 1])) return true;
      }
    }
  }

  return false;
}

function segsIntersect(p1, p2, p3, p4) {
  const d1x = p2[1] - p1[1], d1y = p2[0] - p1[0];
  const d2x = p4[1] - p3[1], d2y = p4[0] - p3[0];
  const cross = d1x * d2y - d1y * d2x;
  if (Math.abs(cross) < 1e-12) return false;
  const dx = p3[1] - p1[1], dy = p3[0] - p1[0];
  const t = (dx * d2y - dy * d2x) / cross;
  const u = (dx * d1y - dy * d1x) / cross;
  return t > 0.001 && t < 0.999 && u > 0.001 && u < 0.999;
}
