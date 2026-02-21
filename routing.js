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

function _cacheRoute(i, j, seg) {
  RC[`${i}-${j}`] = seg;
  RC[`${j}-${i}`] = { coords: [...seg.coords].reverse(), distKm: seg.distKm, blocked: !!seg.blocked, fallback: !!seg.fallback };
}

async function ensureRoad(i, j) {
  const nA = NODES[i], nB = NODES[j];
  if (!nA || !nB) return null;

  // 1. Try cache — revalidate against blocks if needed
  const cached = RC[`${i}-${j}`];
  if (cached && !cached.blocked && !cached.fallback) {
    if (!obstructions.length || !routeIsBlocked(cached.coords)) return cached;
  }

  // 2. Fetch default route (single request)
  const primary = await osrmFetch(nA, nB);
  if (!primary?.length) {
    const fb = { coords: [[nA.lat, nA.lng], [nB.lat, nB.lng]], distKm: haverDist(nA, nB), fallback: true };
    _cacheRoute(i, j, fb);
    return fb;
  }

  // 3. If no obstructions, or default is clear, use it
  if (!obstructions.length || !routeIsBlocked(primary[0].coords)) {
    _cacheRoute(i, j, primary[0]);
    return primary[0];
  }

  // 4. Default is blocked — fetch alternatives
  const alts = await osrmFetch(nA, nB, 3);
  if (alts?.length) {
    const sorted = [...alts].sort((a, b) => a.distKm - b.distKm);
    for (const alt of sorted) {
      if (!routeIsBlocked(alt.coords)) {
        _cacheRoute(i, j, alt);
        return alt;
      }
    }
  }

  // 5. All alternatives blocked — try detour (parallel fetch, max 4)
  const seg = await _findDetour(nA, nB);
  if (seg) {
    _cacheRoute(i, j, seg);
    return seg;
  }

  // 6. No viable route
  console.warn(`[HeatRouter] All routes blocked: ${nA.name} → ${nB.name}`);
  const blockedRoute = { ...primary[0], blocked: true };
  _cacheRoute(i, j, blockedRoute);
  return blockedRoute;
}

async function _findDetour(a, b) {
  const dLat = b.lat - a.lat, dLng = b.lng - a.lng;
  const len = Math.hypot(dLat, dLng) || .001;
  const pLat = -dLng / len, pLng = dLat / len;

  const wps = [];
  for (const frac of [0.4, 0.6]) {
    const bLat = a.lat + dLat * frac, bLng = a.lng + dLng * frac;
    for (const dist of [.015, .04]) {
      wps.push({ lat: bLat + pLat * dist, lng: bLng + pLng * dist });
      wps.push({ lat: bLat - pLat * dist, lng: bLng - pLng * dist });
    }
  }

  const results = await Promise.all(wps.slice(0, 4).map(async wp => {
    const url = `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${wp.lng},${wp.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`;
    try {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 6000);
      const r = await fetch(url, { signal: ctrl.signal });
      clearTimeout(tid);
      const d = await r.json();
      if (d.code === 'Ok' && d.routes?.[0]) {
        const seg = { coords: d.routes[0].geometry.coordinates.map(c => [c[1], c[0]]), distKm: d.routes[0].distance / 1000 };
        if (!routeIsBlocked(seg.coords)) return seg;
      }
    } catch (e) {}
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
