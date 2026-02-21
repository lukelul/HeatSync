/* =========================================================
   City Planner — UI + Greedy Weighted Facility Location
   ========================================================= */

let plannerMap = null;
let plannerMarkers = [];
let plannerResults = null;
let _plannerInited = false;

// ---- Seeded PRNG (mulberry32) for deterministic tie-breaking ----
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ---- Candidate Grid Generation ----
function generateCandidateGrid(nodes, spacingKm, padFraction) {
  if (!nodes.length) return [];
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const n of nodes) {
    if (n.lat < minLat) minLat = n.lat;
    if (n.lat > maxLat) maxLat = n.lat;
    if (n.lng < minLng) minLng = n.lng;
    if (n.lng > maxLng) maxLng = n.lng;
  }
  const dLat = (maxLat - minLat) || 0.01;
  const dLng = (maxLng - minLng) || 0.01;
  const pad = padFraction || 0.2;
  minLat -= dLat * pad; maxLat += dLat * pad;
  minLng -= dLng * pad; maxLng += dLng * pad;

  const kmPerDegLat = 111.32;
  const kmPerDegLng = 111.32 * Math.cos(((minLat + maxLat) / 2) * Math.PI / 180);
  const stepLat = (spacingKm || 0.2) / kmPerDegLat;
  const stepLng = (spacingKm || 0.2) / kmPerDegLng;

  const grid = [];
  for (let lat = minLat; lat <= maxLat; lat += stepLat) {
    for (let lng = minLng; lng <= maxLng; lng += stepLng) {
      grid.push({ lat, lng });
    }
  }
  return grid;
}

// ---- Scoring Functions ----
function computeCentrality(candidate, demandNodes) {
  let sum = 0;
  for (const d of demandNodes) {
    sum += haverDist(candidate, d);
  }
  return sum;
}

function computeCost(candidate, allNodes) {
  let minDist = Infinity;
  for (const n of allNodes) {
    const d = haverDist(candidate, n);
    if (d < minDist) minDist = d;
  }
  const baseCost = 1.0;
  const roadPenalty = 2.0;
  return baseCost + minDist * roadPenalty;
}

function computeCoverage(candidate, demandNodes, serviceRadiusKm) {
  if (!demandNodes.length) return 0;
  let covered = 0;
  for (const d of demandNodes) {
    if (haverDist(candidate, d) <= serviceRadiusKm) covered++;
  }
  return covered / demandNodes.length;
}

function normalize(values) {
  if (!values.length) return [];
  let mn = Infinity, mx = -Infinity;
  for (const v of values) {
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }
  const range = mx - mn || 1;
  return values.map(v => (v - mn) / range);
}

// ---- Core Optimization ----
/**
 * Greedy weighted facility location.
 * Pure function — can be moved to a Cloud Function as-is.
 *
 * @param {Object} params
 * @param {NodeDef[]} params.existingNodes
 * @param {number} params.nSources
 * @param {number} params.nSinks
 * @param {number} params.nTanks
 * @param {number} params.wCost       Weight for cost (0-1)
 * @param {number} params.wCentrality Weight for centrality (0-1)
 * @param {number} params.wCoverage   Weight for coverage (0-1)
 * @param {number} params.minSeparation  Min km between facilities
 * @param {number} params.seed        PRNG seed
 * @param {number} [params.gridSpacing]  Grid spacing in km (default 0.2)
 * @returns {PlannerResults}
 */
function runPlacementOptimization(params) {
  const {
    existingNodes, nSources, nSinks, nTanks,
    wCost, wCentrality, wCoverage,
    minSeparation, seed, gridSpacing
  } = params;

  const rng = mulberry32(seed || 42);
  const spacing = gridSpacing || 0.2;
  const serviceRadius = Math.max(spacing * 3, 0.5);

  let candidates = generateCandidateGrid(existingNodes, spacing, 0.2);

  // Filter out candidates too close to existing nodes
  const existingMinDist = 0.05; // 50m
  candidates = candidates.filter(c => {
    for (const n of existingNodes) {
      if (haverDist(c, n) < existingMinDist) return false;
    }
    return true;
  });

  // Shuffle deterministically for tie-breaking
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  const sinkNodes = existingNodes.filter(n => n.type === 'sink');
  const sourceNodes = existingNodes.filter(n => n.type === 'source');
  const allDemand = [...sinkNodes, ...sourceNodes];

  function scoreCategory(pool, demandForCentrality) {
    const rawCentrality = pool.map(c => computeCentrality(c, demandForCentrality));
    const rawCost = pool.map(c => computeCost(c, existingNodes));
    const rawCoverage = pool.map(c => computeCoverage(c, allDemand, serviceRadius));

    const normC = normalize(rawCentrality);
    const normK = normalize(rawCost);
    const normV = normalize(rawCoverage);

    return pool.map((c, i) => ({
      ...c,
      score: wCost * normK[i] + wCentrality * normC[i] - wCoverage * normV[i],
      breakdown: {
        cost: rawCost[i],
        centrality: rawCentrality[i],
        coverage: rawCoverage[i]
      },
      _normCost: normK[i],
      _normCentrality: normC[i],
      _normCoverage: normV[i]
    }));
  }

  function greedySelect(pool, count, demandForCentrality) {
    let scored = scoreCategory(pool, demandForCentrality);
    scored.sort((a, b) => a.score - b.score);

    const selected = [];
    const remaining = [...scored];

    while (selected.length < count && remaining.length > 0) {
      const pick = remaining.shift();
      selected.push(pick);

      // Remove candidates too close to this pick
      for (let i = remaining.length - 1; i >= 0; i--) {
        if (haverDist(remaining[i], pick) < minSeparation) {
          remaining.splice(i, 1);
        }
      }
    }
    return selected;
  }

  // Remove selected from pool between categories
  let pool = [...candidates];

  const selectedSources = greedySelect(pool, nSources, sinkNodes);
  pool = pool.filter(c => !selectedSources.some(s =>
    Math.abs(s.lat - c.lat) < 1e-9 && Math.abs(s.lng - c.lng) < 1e-9));

  const selectedSinks = greedySelect(pool, nSinks, sourceNodes);
  pool = pool.filter(c => !selectedSinks.some(s =>
    Math.abs(s.lat - c.lat) < 1e-9 && Math.abs(s.lng - c.lng) < 1e-9));

  const selectedTanks = greedySelect(pool, nTanks, allDemand);

  function cleanResult(arr) {
    return arr.map(r => ({
      lat: r.lat, lng: r.lng,
      score: Math.round(r.score * 1000) / 1000,
      breakdown: {
        cost: Math.round(r.breakdown.cost * 1000) / 1000,
        centrality: Math.round(r.breakdown.centrality * 1000) / 1000,
        coverage: Math.round(r.breakdown.coverage * 1000) / 1000
      }
    }));
  }

  const totalObj = [...selectedSources, ...selectedSinks, ...selectedTanks]
    .reduce((s, r) => s + r.score, 0);

  return {
    sources: cleanResult(selectedSources),
    sinks: cleanResult(selectedSinks),
    tanks: cleanResult(selectedTanks),
    totalObjective: Math.round(totalObj * 1000) / 1000,
    computedAt: new Date()
  };
}


/* =========================================================
   Planner UI
   ========================================================= */

let _plannerDirty = false;
let _placingNodeType = null; // null | 'source' | 'sink' | 'tank'

function _markPlannerDirty() {
  _plannerDirty = true;
  const btn = document.getElementById('btn-push-db');
  if (btn) btn.style.display = 'block';
}

function _clearPlannerDirty() {
  _plannerDirty = false;
  const btn = document.getElementById('btn-push-db');
  if (btn) btn.style.display = 'none';
}

function initPlannerView() {
  if (_plannerInited) {
    refreshPlannerMap();
    _renderPlannerNodeList();
    return;
  }
  _plannerInited = true;
  renderPlannerUI();
  setTimeout(() => {
    initPlannerMap();
    bindPlannerEvents();
  }, 50);
}

function renderPlannerUI() {
  const page = document.getElementById('page-planner');
  if (!page) return;

  page.innerHTML = `
    <div class="planner-layout">
      <div class="planner-sidebar">
        <div class="panel-title">Current Nodes</div>
        <div id="planner-node-list" class="planner-node-list"></div>
        <div class="pnl-add-row">
          <button class="btn btn-secondary pnl-add-btn" id="btn-add-node">+ Add Node</button>
          <div class="pnl-type-picker" id="pnl-type-picker" style="display:none">
            <button class="pnl-type-opt" data-type="source" style="--tc:var(--accent)">Source</button>
            <button class="pnl-type-opt" data-type="sink" style="--tc:var(--accent2)">Sink</button>
            <button class="pnl-type-opt" data-type="tank" style="--tc:var(--green)">Tank</button>
            <button class="pnl-type-cancel" id="btn-cancel-place">Cancel</button>
          </div>
          <div class="pnl-place-hint" id="pnl-place-hint" style="display:none">Click on the map to place a <strong id="pnl-place-type"></strong> node</div>
        </div>
        <button class="btn btn-primary planner-push-btn" id="btn-push-db" style="display:none;">&#9650; Push Changes to Database</button>
        <div class="planner-divider" style="margin:8px 0"></div>
        <div class="panel-title">Add Nodes — Placement Optimizer</div>
        <div class="planner-controls">
          <label class="planner-label">
            Sources <span class="planner-val" id="pv-sources">2</span>
            <input type="range" class="planner-slider" id="ps-sources" min="0" max="10" value="2">
          </label>
          <label class="planner-label">
            Sinks <span class="planner-val" id="pv-sinks">2</span>
            <input type="range" class="planner-slider" id="ps-sinks" min="0" max="10" value="2">
          </label>
          <label class="planner-label">
            Tanks <span class="planner-val" id="pv-tanks">1</span>
            <input type="range" class="planner-slider" id="ps-tanks" min="0" max="5" value="1">
          </label>
          <div class="planner-divider"></div>
          <label class="planner-label">
            Weight: Cost <span class="planner-val" id="pv-cost">0.40</span>
            <input type="range" class="planner-slider" id="ps-cost" min="0" max="100" value="40">
          </label>
          <label class="planner-label">
            Weight: Centrality <span class="planner-val" id="pv-centrality">0.40</span>
            <input type="range" class="planner-slider" id="ps-centrality" min="0" max="100" value="40">
          </label>
          <label class="planner-label">
            Weight: Coverage <span class="planner-val" id="pv-coverage">0.20</span>
            <input type="range" class="planner-slider" id="ps-coverage" min="0" max="100" value="20">
          </label>
          <div class="planner-divider"></div>
          <label class="planner-label">
            Min Separation <span class="planner-val" id="pv-sep">0.3 km</span>
            <input type="range" class="planner-slider" id="ps-sep" min="1" max="20" value="3">
          </label>
          <label class="planner-label">
            Seed <span class="planner-val" id="pv-seed">42</span>
            <input type="range" class="planner-slider" id="ps-seed" min="1" max="999" value="42">
          </label>
        </div>
        <button class="btn btn-primary" id="btn-run-planner" style="margin-top:12px;">&#9733; Run Placement</button>
        <div id="planner-status" class="planner-status"></div>
        <div class="panel-title" style="margin-top:16px;">New Placements</div>
        <div id="planner-results" class="planner-results">
          <div class="select-hint">Set parameters and run placement optimization.</div>
        </div>
        <button class="btn btn-secondary" id="btn-accept-planner" style="margin-top:8px;display:none;">&#10003; Accept &amp; Merge into City</button>
      </div>
      <div class="planner-map-area">
        <div id="planner-map" class="planner-map"></div>
      </div>
    </div>`;
}

function _renderPlannerNodeList() {
  const el = document.getElementById('planner-node-list');
  if (!el) return;
  const nodes = NODES.length ? NODES : (AppState.selectedCityDoc?.nodes || []);
  if (!nodes.length) {
    el.innerHTML = '<div class="select-hint">No nodes yet. Run the optimizer below to add some.</div>';
    return;
  }
  el.innerHTML = nodes.map((n, i) => {
    const color = n.type === 'source' ? 'var(--accent)' : n.type === 'sink' ? 'var(--accent2)' : 'var(--green)';
    return `<div class="pnl-item" data-node-idx="${i}">
      <span class="pnl-dot" style="background:${color}"></span>
      <span class="pnl-name">${n.name || n.type + ' ' + (i+1)}</span>
      <span class="pnl-info">${n.type === 'tank' ? (n.cap||0)+'MWh' : (n.heat||0)+'MW'}</span>
      <button class="pnl-del" onclick="_deletePlannerNode(${i})" title="Delete">&times;</button>
    </div>`;
  }).join('');
}

function _deletePlannerNode(idx) {
  const nodes = NODES.length ? NODES : (AppState.selectedCityDoc?.nodes || []);
  if (idx < 0 || idx >= nodes.length) return;

  if (NODES.length) {
    const node = NODES[idx];
    NODES.splice(idx, 1);
    NODES.forEach((n, i) => n.id = i);
  }

  const doc = AppState.selectedCityDoc;
  if (doc && doc.nodes) {
    doc.nodes.splice(idx, 1);
    doc.nodes.forEach((n, i) => n.id = i);
  }

  _markPlannerDirty();
  clearPlannerMarkers();
  renderExistingNodesOnPlanner();
  _renderPlannerNodeList();
}

function initPlannerMap() {
  const container = document.getElementById('planner-map');
  if (!container || plannerMap) return;

  const doc = AppState.selectedCityDoc;
  const center = doc?.metadata?.center || [41.888, -87.638];
  const zoom = doc?.metadata?.zoom || 14;

  plannerMap = L.map('planner-map', { zoomControl: false }).setView(center, zoom);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '©OSM ©CARTO', maxZoom: 19
  }).addTo(plannerMap);
  L.control.zoom({ position: 'bottomright' }).addTo(plannerMap);

  plannerMap.on('click', _onPlannerMapClick);

  renderExistingNodesOnPlanner();
  _renderPlannerNodeList();
}

function refreshPlannerMap() {
  if (!plannerMap) return;
  const doc = AppState.selectedCityDoc;
  if (doc?.metadata?.center) {
    plannerMap.setView(doc.metadata.center, doc.metadata.zoom || 14);
  }
  clearPlannerMarkers();
  renderExistingNodesOnPlanner();
  if (plannerResults) renderPlannerResultsOnMap(plannerResults);
  setTimeout(() => plannerMap.invalidateSize(), 100);
}

function clearPlannerMarkers() {
  plannerMarkers.forEach(m => { try { plannerMap.removeLayer(m); } catch(e) {} });
  plannerMarkers = [];
}

function _makeExistingNodeIcon(type, label) {
  const color = type === 'source' ? '#ff4d00' : type === 'sink' ? '#00c9ff' : '#00e676';
  const letter = label || type.charAt(0).toUpperCase();
  return L.divIcon({
    className: 'planner-drag-icon',
    html: `<div class="pdi-wrap" style="--pdi-color:${color}">
      <div class="pdi-ring" style="border-style:solid"></div>
      <div class="pdi-dot">${letter}</div>
    </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });
}

function renderExistingNodesOnPlanner() {
  if (!plannerMap) return;
  const nodes = NODES.length ? NODES : (AppState.selectedCityDoc?.nodes || []);
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const label = n.type.charAt(0).toUpperCase();
    const marker = L.marker([n.lat, n.lng], {
      icon: _makeExistingNodeIcon(n.type, label),
      draggable: true
    }).addTo(plannerMap);

    marker._isExisting = true;
    marker._nodeIndex = i;

    marker.bindTooltip(
      `<b>${n.name || n.type}</b><br>${n.type === 'tank' ? (n.cap||0)+' MWh' : (n.heat||0)+' MW'}<br><i>Drag to move · Right-click to delete</i>`,
      { direction: 'top', offset: [0, -12] }
    );

    marker.on('dragstart', () => marker.closeTooltip());
    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      _onExistingNodeDragged(i, pos.lat, pos.lng);
    });
    marker.on('contextmenu', (e) => {
      e.originalEvent.preventDefault();
      const popup = L.popup({closeButton: true, className: 'node-delete-popup', offset: [0, -8]})
        .setLatLng(e.latlng)
        .setContent(`<div style="text-align:center;padding:2px">
          <div style="font-size:10px;font-weight:700;margin-bottom:6px">${n.name || n.type}</div>
          <button onclick="_deletePlannerNode(${i});this.closest('.leaflet-popup')&&plannerMap.closePopup();" style="background:#ff0040;color:white;border:none;border-radius:3px;padding:5px 12px;font-family:'Space Mono',monospace;font-size:9px;cursor:pointer;font-weight:700">Delete Node</button>
        </div>`)
        .openOn(plannerMap);
    });

    plannerMarkers.push(marker);
  }
}

function _onExistingNodeDragged(idx, newLat, newLng) {
  const lat = Math.round(newLat * 1e6) / 1e6;
  const lng = Math.round(newLng * 1e6) / 1e6;

  if (NODES[idx]) {
    NODES[idx].lat = lat;
    NODES[idx].lng = lng;
  }
  const doc = AppState.selectedCityDoc;
  if (doc && doc.nodes && doc.nodes[idx]) {
    doc.nodes[idx].lat = lat;
    doc.nodes[idx].lng = lng;
  }

  _markPlannerDirty();
  _renderPlannerNodeList();
}

function bindPlannerEvents() {
  const sliders = [
    { id: 'ps-sources', vId: 'pv-sources', fmt: v => v },
    { id: 'ps-sinks', vId: 'pv-sinks', fmt: v => v },
    { id: 'ps-tanks', vId: 'pv-tanks', fmt: v => v },
    { id: 'ps-cost', vId: 'pv-cost', fmt: v => (v / 100).toFixed(2) },
    { id: 'ps-centrality', vId: 'pv-centrality', fmt: v => (v / 100).toFixed(2) },
    { id: 'ps-coverage', vId: 'pv-coverage', fmt: v => (v / 100).toFixed(2) },
    { id: 'ps-sep', vId: 'pv-sep', fmt: v => (v / 10).toFixed(1) + ' km' },
    { id: 'ps-seed', vId: 'pv-seed', fmt: v => v },
  ];
  for (const s of sliders) {
    const el = document.getElementById(s.id);
    if (el) el.addEventListener('input', () => {
      const val = document.getElementById(s.vId);
      if (val) val.textContent = s.fmt(el.value);
    });
  }

  document.getElementById('btn-run-planner')?.addEventListener('click', handleRunPlanner);
  document.getElementById('btn-accept-planner')?.addEventListener('click', handleAcceptPlanner);
  document.getElementById('btn-push-db')?.addEventListener('click', _handlePushToDb);

  document.getElementById('btn-add-node')?.addEventListener('click', () => {
    document.getElementById('btn-add-node').style.display = 'none';
    document.getElementById('pnl-type-picker').style.display = 'flex';
  });

  document.querySelectorAll('.pnl-type-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      _placingNodeType = btn.dataset.type;
      document.getElementById('pnl-type-picker').style.display = 'none';
      document.getElementById('pnl-place-hint').style.display = 'block';
      document.getElementById('pnl-place-type').textContent = _placingNodeType;
      if (plannerMap) plannerMap.getContainer().style.cursor = 'crosshair';
    });
  });

  document.getElementById('btn-cancel-place')?.addEventListener('click', _cancelPlaceMode);
}

function _cancelPlaceMode() {
  _placingNodeType = null;
  const addBtn = document.getElementById('btn-add-node');
  if (addBtn) addBtn.style.display = '';
  const picker = document.getElementById('pnl-type-picker');
  if (picker) picker.style.display = 'none';
  const hint = document.getElementById('pnl-place-hint');
  if (hint) hint.style.display = 'none';
  if (plannerMap) plannerMap.getContainer().style.cursor = '';
}

function _onPlannerMapClick(e) {
  if (!_placingNodeType) return;

  const type = _placingNodeType;
  const lat = Math.round(e.latlng.lat * 1e6) / 1e6;
  const lng = Math.round(e.latlng.lng * 1e6) / 1e6;
  const idx = NODES.length;
  const name = type.charAt(0).toUpperCase() + type.slice(1) + ' ' + (idx + 1);

  const node = {
    id: idx, name, type, lat, lng,
    heat: type === 'tank' ? 0 : 3.0,
    temp: type === 'source' ? 45 : type === 'sink' ? 65 : 0,
    desc: 'Manually placed',
    placedBy: 'manual'
  };
  if (type === 'tank') node.cap = 40;

  NODES.push(node);
  const doc = AppState.selectedCityDoc;
  if (doc) {
    if (!doc.nodes) doc.nodes = [];
    doc.nodes.push({ ...node });
  }

  _cancelPlaceMode();
  _markPlannerDirty();

  clearPlannerMarkers();
  renderExistingNodesOnPlanner();
  if (plannerResults) renderPlannerResultsOnMap(plannerResults);
  _renderPlannerNodeList();
}

function gatherPlannerParams() {
  return {
    nSources: parseInt(document.getElementById('ps-sources')?.value || '2'),
    nSinks: parseInt(document.getElementById('ps-sinks')?.value || '2'),
    nTanks: parseInt(document.getElementById('ps-tanks')?.value || '1'),
    wCost: parseInt(document.getElementById('ps-cost')?.value || '40') / 100,
    wCentrality: parseInt(document.getElementById('ps-centrality')?.value || '40') / 100,
    wCoverage: parseInt(document.getElementById('ps-coverage')?.value || '20') / 100,
    minSeparation: parseInt(document.getElementById('ps-sep')?.value || '3') / 10,
    seed: parseInt(document.getElementById('ps-seed')?.value || '42')
  };
}

function handleRunPlanner() {
  const status = document.getElementById('planner-status');
  if (!AppState.selectedCityId) {
    if (status) status.textContent = 'No city loaded. Select or create a city first.';
    return;
  }

  let nodes = AppState.selectedCityDoc?.nodes || [];

  if (!nodes.length) {
    const md = AppState.selectedCityDoc?.metadata || {};
    const center = md.center || [41.888, -87.638];
    const spread = 0.015;
    nodes = [
      { lat: center[0] - spread, lng: center[1] - spread, type: 'source', name: '_ref', heat: 1 },
      { lat: center[0] + spread, lng: center[1] + spread, type: 'sink', name: '_ref', heat: 1 },
      { lat: center[0] - spread, lng: center[1] + spread, type: 'source', name: '_ref', heat: 1 },
      { lat: center[0] + spread, lng: center[1] - spread, type: 'sink', name: '_ref', heat: 1 }
    ];
  }

  const params = gatherPlannerParams();
  if (params.nSources + params.nSinks + params.nTanks === 0) {
    if (status) status.textContent = 'Set at least one source, sink, or tank count above zero.';
    return;
  }

  if (status) status.innerHTML = '<span style="color:var(--yellow)">Computing placements...</span>';

  requestAnimationFrame(() => {
    const t0 = performance.now();
    plannerResults = runPlacementOptimization({
      existingNodes: nodes,
      ...params
    });
    const elapsed = (performance.now() - t0).toFixed(0);

    if (status) {
      status.innerHTML = `<span style="color:var(--green)">Done in ${elapsed}ms — ${plannerResults.sources.length + plannerResults.sinks.length + plannerResults.tanks.length} placements found</span>`;
    }

    renderPlannerResultsTable(plannerResults, params);
    renderPlannerResultsOnMap(plannerResults);

    const acceptBtn = document.getElementById('btn-accept-planner');
    if (acceptBtn) acceptBtn.style.display = 'block';
  });
}

function renderPlannerResultsTable(results, params) {
  const el = document.getElementById('planner-results');
  if (!el) return;

  function makeRows(arr, type) {
    return arr.map((r, i) => {
      const moved = r.score < 0;
      const defaultName = r._customName || (type.charAt(0).toUpperCase() + type.slice(1) + ' ' + (i + 1));
      return `
      <tr class="${moved ? 'pr-moved' : ''}">
        <td>
          <span class="pr-type pr-${type}">${type.charAt(0).toUpperCase()}</span>
          <input type="text" class="pr-name-input" data-pr-type="${type}" data-pr-idx="${i}"
            value="${defaultName}" placeholder="Name this ${type}..." />
          ${moved ? ' <span class="pr-moved-tag">moved</span>' : ''}
        </td>
        <td>${r.lat.toFixed(4)}, ${r.lng.toFixed(4)}</td>
        <td>${moved ? '—' : r.score.toFixed(3)}</td>
      </tr>`;
    }).join('');
  }

  el.innerHTML = `
    <div class="planner-obj">Total Objective: <strong>${results.totalObjective.toFixed(3)}</strong></div>
    <table class="planner-table">
      <thead>
        <tr><th>Name</th><th>Location</th><th>Score</th></tr>
      </thead>
      <tbody>
        ${makeRows(results.sources, 'source')}
        ${makeRows(results.sinks, 'sink')}
        ${makeRows(results.tanks, 'tank')}
      </tbody>
    </table>`;
}

function _makeDraggableIcon(type, index, color) {
  const letter = type.charAt(0).toUpperCase();
  return L.divIcon({
    className: 'planner-drag-icon',
    html: `<div class="pdi-wrap" style="--pdi-color:${color}">
      <div class="pdi-ring"></div>
      <div class="pdi-dot">${letter}${index + 1}</div>
    </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });
}

function renderPlannerResultsOnMap(results) {
  if (!plannerMap) return;

  // Remove previous result markers (keep existing node markers)
  plannerMarkers.forEach(m => {
    if (m._isResult) { try { plannerMap.removeLayer(m); } catch(e) {} }
  });
  plannerMarkers = plannerMarkers.filter(m => !m._isResult);

  function addDraggableResults(arr, type) {
    const color = type === 'source' ? '#ff4d00' : type === 'sink' ? '#00c9ff' : '#00e676';
    for (let i = 0; i < arr.length; i++) {
      const r = arr[i];

      const marker = L.marker([r.lat, r.lng], {
        icon: _makeDraggableIcon(type, i, color),
        draggable: true
      }).addTo(plannerMap);

      marker._isResult = true;
      marker._resultType = type;
      marker._resultIndex = i;

      marker.bindTooltip(
        `<b>${type} #${i + 1}</b> — drag to reposition<br>Score: ${r.score.toFixed(3)}`,
        { direction: 'top', offset: [0, -12] }
      );

      marker.on('dragstart', () => { marker.closeTooltip(); });

      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        _onResultMarkerDragged(type, i, pos.lat, pos.lng);
      });

      plannerMarkers.push(marker);
    }
  }

  addDraggableResults(results.sources, 'source');
  addDraggableResults(results.sinks, 'sink');
  addDraggableResults(results.tanks, 'tank');

  // Show drag hint
  const status = document.getElementById('planner-status');
  if (status && !status.innerHTML.includes('Saved')) {
    status.innerHTML = '<span style="color:var(--accent2)">Drag markers on the map to adjust positions, then Accept &amp; Save.</span>';
  }
}

function _onResultMarkerDragged(type, index, newLat, newLng) {
  if (!plannerResults) return;

  const arr = type === 'source' ? plannerResults.sources
    : type === 'sink' ? plannerResults.sinks
    : plannerResults.tanks;

  if (arr[index]) {
    arr[index].lat = Math.round(newLat * 1e6) / 1e6;
    arr[index].lng = Math.round(newLng * 1e6) / 1e6;
    arr[index].score = -1;
    arr[index].breakdown = { cost: 0, centrality: 0, coverage: 0 };
  }

  _markPlannerDirty();
  renderPlannerResultsTable(plannerResults, gatherPlannerParams());
}

function _readPlannerNodeName(type, idx, fallback) {
  const input = document.querySelector(`.pr-name-input[data-pr-type="${type}"][data-pr-idx="${idx}"]`);
  const val = input ? input.value.trim() : '';
  return val || fallback;
}

async function handleAcceptPlanner() {
  if (!plannerResults || !AppState.selectedCityId) return;

  const params = gatherPlannerParams();
  const doc = AppState.selectedCityDoc;
  if (!doc) return;

  const existingNodes = _sanitizeNodes(doc.nodes || NODES || []);
  let nextId = existingNodes.length;

  function toNodeDefs(results, type, defaultHeat, defaultTemp) {
    return results.map((r, i) => {
      const wasMoved = r.score < 0;
      const name = _readPlannerNodeName(type, i, type.charAt(0).toUpperCase() + type.slice(1) + ' ' + (i + 1));
      const node = {
        id: nextId++,
        name: name,
        type: type,
        lat: r.lat,
        lng: r.lng,
        heat: defaultHeat,
        temp: defaultTemp,
        desc: wasMoved ? 'User-adjusted placement' : `Auto-placed (score: ${r.score.toFixed(3)})`,
        placedBy: 'planner'
      };
      if (type === 'tank') node.cap = 40;
      return node;
    });
  }

  const newSources = toNodeDefs(plannerResults.sources, 'source', 3.0, 45);
  const newSinks = toNodeDefs(plannerResults.sinks, 'sink', 3.0, 65);
  const newTanks = toNodeDefs(plannerResults.tanks, 'tank', 0, 0);

  const mergedNodes = [...existingNodes, ...newSources, ...newSinks, ...newTanks];
  mergedNodes.forEach((n, i) => n.id = i);

  try {
    const safeResults = plannerResults ? {
      sources: plannerResults.sources, sinks: plannerResults.sinks,
      tanks: plannerResults.tanks, totalObjective: plannerResults.totalObjective,
      computedAt: plannerResults.computedAt ? plannerResults.computedAt.toISOString?.() || String(plannerResults.computedAt) : null
    } : null;

    await saveCity(AppState.selectedCityId, {
      nodes: mergedNodes,
      plannerParams: params,
      plannerResults: safeResults
    });

    if (AppState.selectedCityDoc) {
      applyCityToGlobals(AppState.selectedCityDoc);
    }

    plannerResults = null;
    _clearPlannerDirty();

    clearPlannerMarkers();
    renderExistingNodesOnPlanner();
    _renderPlannerNodeList();

    const resultsEl = document.getElementById('planner-results');
    if (resultsEl) resultsEl.innerHTML = '<div class="select-hint">Nodes merged. Run the optimizer again to add more.</div>';

    const status = document.getElementById('planner-status');
    if (status) status.innerHTML = '<span style="color:var(--green)">Saved! All nodes are now editable above. Switch to Manage tab to see them on the main map.</span>';

    const acceptBtn = document.getElementById('btn-accept-planner');
    if (acceptBtn) acceptBtn.style.display = 'none';
  } catch (e) {
    alert('Failed to save planner results: ' + e.message);
  }
}

function _sanitizeNodes(raw) {
  return (raw || []).map((n, i) => {
    const out = {
      id: i, name: n.name || '', type: n.type,
      lat: n.lat, lng: n.lng,
      heat: n.heat || 0, temp: n.temp || 0,
      desc: n.desc || '',
      placedBy: n.placedBy || 'manual'
    };
    if (n.cap != null) out.cap = n.cap;
    return out;
  });
}

async function _handlePushToDb() {
  if (!AppState.selectedCityId) return;
  const status = document.getElementById('planner-status');
  const btn = document.getElementById('btn-push-db');
  try {
    if (btn) btn.disabled = true;
    if (status) status.innerHTML = '<span style="color:var(--yellow)">Pushing to database...</span>';

    const raw = NODES.length ? NODES : (AppState.selectedCityDoc?.nodes || []);
    const nodes = _sanitizeNodes(raw);
    await saveCity(AppState.selectedCityId, { nodes });

    _clearPlannerDirty();
    if (status) status.innerHTML = '<span style="color:var(--green)">Changes pushed to database.</span>';
  } catch(e) {
    if (status) status.innerHTML = '<span style="color:#ff0040">Push failed: ' + e.message + '</span>';
  } finally {
    if (btn) btn.disabled = false;
  }
}
