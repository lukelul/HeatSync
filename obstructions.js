// Obstruction handling system
let obstructMode = false;
let obstructClickA = null;
let obstructMarkerA = null;
let obstructions = [];
let blockedSet = new Set();

function toggleObstructMode() {
  obstructMode = !obstructMode;
  const btn = document.getElementById('btn-obstruct');
  const hint = document.getElementById('obs-hint');
  btn.classList.toggle('active', obstructMode);
  btn.textContent = obstructMode ? '🚫 Click road...' : '🚫 Block Road';
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
    hint.textContent = 'Click end point of road to block';
  } else {
    const b = e.latlng;
    hint.textContent = 'Fetching road...';
    fetchObstructionRoad(obstructClickA, b);
    if (obstructMarkerA) {
      map.removeLayer(obstructMarkerA);
      obstructMarkerA = null;
    }
    obstructClickA = null;
  }
}

async function fetchObstructionRoad(a, b) {
  // Use OSRM match API — snaps to road without one-way routing
  const url = `https://router.project-osrm.org/match/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson&radiuses=50;50`;
  try {
    const r = await fetch(url);
    const d = await r.json();
    if (d.code === 'Ok' && d.matchings?.[0]) {
      const coords = d.matchings[0].geometry.coordinates.map(c => [c[1], c[0]]);
      addObstruction(coords);
      document.getElementById('obs-hint').textContent = 'Click start point of road to block';
      return;
    }
  } catch(e) {}
  // Fallback: try route API both directions, pick shorter
  for (const [p, q] of [[a, b], [b, a]]) {
    const url2 = `https://router.project-osrm.org/route/v1/driving/${p.lng},${p.lat};${q.lng},${q.lat}?overview=full&geometries=geojson`;
    try {
      const r = await fetch(url2);
      const d = await r.json();
      if (d.code === 'Ok' && d.routes?.[0] && d.routes[0].distance < haverDist(a, b) * 4000) {
        addObstruction(d.routes[0].geometry.coordinates.map(c => [c[1], c[0]]));
        document.getElementById('obs-hint').textContent = 'Click start point of road to block';
        return;
      }
    } catch(e) {}
  }
  document.getElementById('obs-hint').textContent = 'Failed — try closer points';
}

function addObstruction(coords) {
  const line = L.polyline(coords, {color: '#ff0040', weight: 18, opacity: .85}).addTo(map);
  const glow = L.polyline(coords, {color: '#ff0040', weight: 44, opacity: .15}).addTo(map);
  const obs = {coords, line, glow};
  line.on('click', () => removeObstruction(obs));
  glow.on('click', () => removeObstruction(obs));
  obstructions.push(obs);
  // Clear ALL cached routes so they get re-evaluated against new obstruction
  Object.keys(RC).forEach(k => delete RC[k]);
  rebuildBlockedSet();
  document.getElementById('block-count').textContent = obstructions.length;
}

function removeObstruction(obs) {
  map.removeLayer(obs.line);
  map.removeLayer(obs.glow);
  obstructions = obstructions.filter(o => o !== obs);
  Object.keys(RC).forEach(k => delete RC[k]);
  rebuildBlockedSet();
  document.getElementById('block-count').textContent = obstructions.length;
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
}

// Build set of rounded coord keys from all obstructions
function rebuildBlockedSet() {
  blockedSet.clear();
  for (const obs of obstructions) {
    for (const c of obs.coords) {
      // Round to 5 decimal places (~1m precision)
      blockedSet.add(Math.round(c[0] * 1e5) + ',' + Math.round(c[1] * 1e5));
    }
  }
}

// Check if a route shares any coordinates with blocked roads
function routeIsBlocked(coords) {
  if (!blockedSet.size) return false;
  for (const c of coords) {
    if (blockedSet.has(Math.round(c[0] * 1e5) + ',' + Math.round(c[1] * 1e5))) return true;
  }
  // Also check segment intersections for routes that cross between blocked points
  for (const obs of obstructions) {
    for (let i = 0; i < coords.length - 1; i++) {
      for (let j = 0; j < obs.coords.length - 1; j++) {
        if (segsIntersect(coords[i], coords[i+1], obs.coords[j], obs.coords[j+1])) return true;
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
  return t > 0.01 && t < 0.99 && u > 0.01 && u < 0.99;
}
