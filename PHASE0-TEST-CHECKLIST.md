# Phase 0 — Test checklist (obstructions + optimization)

## Bug A: Road blockage / obstruction painting

- [ ] Click **"Block Road"** → cursor becomes crosshair, hint "Click start point of road to block" appears.
- [ ] Click a **first point** on the map → red dot appears, hint "Click end point of road to block".
- [ ] Click a **second point** → red dashed polyline appears (OSRM or straight-line fallback), hint resets.
- [ ] **Click a painted obstruction** → that segment is removed; block count updates.
- [ ] **"Clear blocks"** → all obstructions removed, block count 0.

## Bug B: Optimization / routing

- [ ] Click a **blue sink** (e.g. Merchandise Mart, River North) → sources auto-select (orange rank dots), status "Auto-selected N source(s)".
- [ ] After ~600 ms → "Routing…" then route(s) drawn (orange/green lines), **Route length**, **Heat recovered**, **BLOCKED ROADS**, header stats (Recoverable Heat, CO₂, Cost) update.
- [ ] **Algorithm Trace** shows steps (Fetch OSRM → Wavefront → Reconstruct path → done).
- [ ] **Top Projects** and **Explain / Stakeholder Packet** panels populate.

## Obstructions affect routing

- [ ] Run optimization once (click sink), note route.
- [ ] Click **Block Road**, paint a segment **on** that route, then **Reset** (or leave obstruction).
- [ ] Click the same sink again (or click **Run Optimization**) → route should avoid blocked segment (detour) or use alternative; block count reflects obstructions.

## Console (optional)

- Open DevTools → Console. You should see `[HeatRouter] initMap done`, `map click → handleObstructClick attached`, and when using features: `obstructMode =`, `runOptimization called`, `sink selected, scheduling runOptimization`, etc. No uncaught errors.
