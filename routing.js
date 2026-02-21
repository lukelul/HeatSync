// OSRM routing functions
// Future: edge attributes from DB (trenching_cost, permitting_row, capacity, thermal_loss, pumping_cost, distribution_loss)
const RC = {};

async function osrmFetch(a, b, alts) {
  const p = alts ? `&alternatives=${alts}` : '';
  const url = `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson${p}`;
  for (let t = 0; t < 3; t++) {
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 8000);
      const r = await fetch(url, { signal: controller.signal });
      clearTimeout(tid);
      if (!r.ok) continue;
      const d = await r.json();
      if (d.code === 'Ok' && d.routes?.length) {
        return d.routes.map(rt => ({
          coords: rt.geometry.coordinates.map(c => [c[1], c[0]]),
          distKm: rt.distance / 1000
        }));
      }
    } catch(e) {
      if (e.name === 'AbortError') console.warn('[HeatRouter] OSRM request timed out');
    }
    if (t < 2) await new Promise(res => setTimeout(res, 200 * (t + 1)));
  }
  return null;
}

async function ensureRoad(i, j) {
  if (obstructions.length > 0) {
    const alts = await osrmFetch(NODES[i], NODES[j], 3);
    if (alts?.length) {
      const sorted = [...alts].sort((a, b) => a.distKm - b.distKm);
      for (const alt of sorted) {
        if (!routeIsBlocked(alt.coords)) {
          RC[`${i}-${j}`] = alt;
          RC[`${j}-${i}`] = {coords: [...alt.coords].reverse(), distKm: alt.distKm};
          return alt;
        }
      }
      const seg = await findDetour(i, j, sorted[0]);
      if (seg) {
        RC[`${i}-${j}`] = seg;
        RC[`${j}-${i}`] = {coords: [...seg.coords].reverse(), distKm: seg.distKm};
        return seg;
      }
      console.warn(`[HeatRouter] All routes blocked: ${NODES[i].name} → ${NODES[j].name}`);
      const blockedRoute = { ...sorted[0], blocked: true };
      RC[`${i}-${j}`] = blockedRoute;
      RC[`${j}-${i}`] = {coords: [...sorted[0].coords].reverse(), distKm: sorted[0].distKm, blocked: true};
      return blockedRoute;
    }
  }
  if (RC[`${i}-${j}`]) return RC[`${i}-${j}`];
  const alts = await osrmFetch(NODES[i], NODES[j]);
  if (alts?.[0]) {
    RC[`${i}-${j}`] = alts[0];
    RC[`${j}-${i}`] = {coords: [...alts[0].coords].reverse(), distKm: alts[0].distKm};
    return alts[0];
  }
  console.warn(`[HeatRouter] OSRM failed, straight-line fallback: ${NODES[i].name} → ${NODES[j].name}`);
  const fb = {
    coords: [[NODES[i].lat, NODES[i].lng], [NODES[j].lat, NODES[j].lng]],
    distKm: haverDist(NODES[i], NODES[j]),
    fallback: true
  };
  RC[`${i}-${j}`] = fb;
  RC[`${j}-${i}`] = {coords: [...fb.coords].reverse(), distKm: fb.distKm, fallback: true};
  return fb;
}

async function findDetour(i, j, blocked) {
  const a = NODES[i], b = NODES[j];
  const dLat = b.lat - a.lat, dLng = b.lng - a.lng;
  const len = Math.hypot(dLat, dLng) || .001;
  const pLat = -dLng / len, pLng = dLat / len;

  const wps = [];
  for (const frac of [0.5, 0.33, 0.67]) {
    const bLat = a.lat + dLat * frac, bLng = a.lng + dLng * frac;
    for (const dist of [.01, .03]) {
      wps.push({lat: bLat + pLat * dist, lng: bLng + pLng * dist});
      wps.push({lat: bLat - pLat * dist, lng: bLng - pLng * dist});
    }
  }
  const batch = wps.slice(0, 8);
  const results = await Promise.all(batch.map(async wp => {
    const url = `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${wp.lng},${wp.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`;
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 8000);
      const r = await fetch(url, { signal: controller.signal });
      clearTimeout(tid);
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
