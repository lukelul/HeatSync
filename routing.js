// OSRM routing functions
const RC = {};

async function osrmFetch(a, b, alts) {
  const p = alts ? `&alternatives=${alts}` : '';
  const url = `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson${p}`;
  for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch(url);
      if (!r.ok) continue;
      const d = await r.json();
      if (d.code === 'Ok' && d.routes?.length) {
        return d.routes.map(r => ({
          coords: r.geometry.coordinates.map(c => [c[1], c[0]]),
          distKm: r.distance / 1000
        }));
      }
    } catch(e) {}
    if (t < 2) await new Promise(res => setTimeout(res, 100));
  }
  return null;
}

async function ensureRoad(i, j) {
  if (obstructions.length > 0) {
    // Get up to 3 alternatives
    const alts = await osrmFetch(NODES[i], NODES[j], 3);
    if (alts) {
      // Sort shortest first, pick first non-blocked
      const sorted = [...alts].sort((a, b) => a.distKm - b.distKm);
      for (const alt of sorted) {
        if (!routeIsBlocked(alt.coords)) {
          RC[`${i}-${j}`] = alt;
          RC[`${j}-${i}`] = {coords: [...alt.coords].reverse(), distKm: alt.distKm};
          return alt;
        }
      }
      // All blocked — try via-waypoint detours
      const seg = await findDetour(i, j, sorted[0]);
      if (seg) {
        RC[`${i}-${j}`] = seg;
        RC[`${j}-${i}`] = {coords: [...seg.coords].reverse(), distKm: seg.distKm};
        return seg;
      }
      // Fallback
      RC[`${i}-${j}`] = sorted[0];
      RC[`${j}-${i}`] = {coords: [...sorted[0].coords].reverse(), distKm: sorted[0].distKm};
      return sorted[0];
    }
  }
  if (RC[`${i}-${j}`]) return RC[`${i}-${j}`];
  const alts = await osrmFetch(NODES[i], NODES[j]);
  if (alts?.[0]) {
    RC[`${i}-${j}`] = alts[0];
    RC[`${j}-${i}`] = {coords: [...alts[0].coords].reverse(), distKm: alts[0].distKm};
    return alts[0];
  }
  const fb = {
    coords: [[NODES[i].lat, NODES[i].lng], [NODES[j].lat, NODES[j].lng]],
    distKm: haverDist(NODES[i], NODES[j])
  };
  RC[`${i}-${j}`] = fb;
  RC[`${j}-${i}`] = {coords: [...fb.coords].reverse(), distKm: fb.distKm};
  return fb;
}

async function findDetour(i, j, blocked) {
  const a = NODES[i], b = NODES[j];
  const dLat = b.lat - a.lat, dLng = b.lng - a.lng;
  const len = Math.hypot(dLat, dLng) || .001;
  const pLat = -dLng / len, pLng = dLat / len;

  // Build all waypoint candidates upfront
  const wps = [];
  for (const frac of [0.5, 0.33, 0.67]) {
    const bLat = a.lat + dLat * frac, bLng = a.lng + dLng * frac;
    for (const dist of [.006, .014, .03, .06]) {
      wps.push({lat: bLat + pLat * dist, lng: bLng + pLng * dist});
      wps.push({lat: bLat - pLat * dist, lng: bLng - pLng * dist});
    }
  }
  // Fire ALL in parallel
  const results = await Promise.all(wps.map(async wp => {
    const url = `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${wp.lng},${wp.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`;
    try {
      const r = await fetch(url);
      const d = await r.json();
      if (d.code === 'Ok' && d.routes?.[0]) {
        const seg = {
          coords: d.routes[0].geometry.coordinates.map(c => [c[1], c[0]]),
          distKm: d.routes[0].distance / 1000
        };
        if (!routeIsBlocked(seg.coords)) return seg;
      }
    } catch(e) {}
    return null;
  }));
  const clean = results.filter(Boolean);
  if (clean.length) {
    clean.sort((a, b) => a.distKm - b.distKm);
    return clean[0];
  }
  return null;
}

function getRoad(i, j) {
  return RC[`${i}-${j}`] || null;
}
