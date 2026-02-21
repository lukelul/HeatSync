// Optimization algorithm
let animating = false;

function setAlgoSteps(ph, wp = 0, wt = 1) {
  const pct = wt > 0 ? Math.round(wp / wt * 100) : 0;
  document.getElementById('algo-steps').innerHTML = [
    {l: 'FETCH OSRM ROADS', done: ph !== 'fetch', active: ph === 'fetch'},
    {l: 'LOAD NREL COMSTOCK', done: ['search', 'draw', 'done'].includes(ph)},
    {l: 'LOAD CAMBIUM SRMER', done: ['search', 'draw', 'done'].includes(ph)},
    {l: `WAVEFRONT (${pct}%)`, done: ['draw', 'done'].includes(ph), active: ph === 'search'},
    {l: 'CHECK BLOCKED ROADS', done: ['draw', 'done'].includes(ph), active: ph === 'search'},
    {l: 'RECONSTRUCT PATH', done: ['draw', 'done'].includes(ph), active: ph === 'draw'},
    {l: 'CO₂ SAVINGS', done: ph === 'done'},
    {l: 'BRIEF GENERATED', done: ph === 'done'},
  ].map(s => `<div class="algo-step ${s.done ? 'done' : s.active ? 'active' : ''}"><div class="algo-step-dot"></div>${s.l}</div>`).join('');
}

function showRouteError(title, details, suggestions) {
  const el = document.getElementById('route-error');
  if (!el) return;
  el.innerHTML =
    '<div class="route-error-title">' + title + '</div>' +
    '<div class="route-error-detail">' + details + '</div>' +
    '<div class="route-error-suggest">' + suggestions.map(s => '&bull; ' + s).join('<br>') + '</div>' +
    '<button class="route-error-dismiss" onclick="hideRouteError()">Dismiss</button>';
  el.style.display = 'block';
}

function hideRouteError() {
  const el = document.getElementById('route-error');
  if (el) el.style.display = 'none';
}

async function runOptimization() {
  if (animating) return;
  if (!selectedSink) { alert('Pick a sink'); return; }
  if (!selectedSources.length) { alert('No sources'); return; }

  animating = true;
  const btn = document.getElementById('run-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Routing...';
  hideRouteError();

  try {
    routeLayer.forEach(l => { try { map.removeLayer(l); } catch(e) {} });
    exploredLayer.forEach(l => { try { map.removeLayer(l); } catch(e) {} });
    routeLayer = [];
    exploredLayer = [];

    const colors = ['#ff4d00', '#ff8c00', '#ffb347'];
    const tanks = NODES.filter(n => n.type === 'tank' && n.active !== false);
    setAlgoSteps('fetch');
    document.getElementById('status-text').textContent = 'Fetching roads...';

    const legDefs = [];
    for (let si = 0; si < selectedSources.length; si++) {
      const src = selectedSources[si];
      const tank = tanks.length ? [...tanks].sort((a, b) => haverDist(src, a) - haverDist(src, b))[0] : null;
      if (tank) {
        legDefs.push({from: src.id, to: tank.id, color: colors[si % colors.length]});
        legDefs.push({from: tank.id, to: selectedSink.id, color: '#00e676'});
      } else {
        legDefs.push({from: src.id, to: selectedSink.id, color: colors[si % colors.length]});
      }
    }

    const legResults = [];
    for (let i = 0; i < legDefs.length; i++) {
      document.getElementById('nodes-visited').textContent = `${i + 1}/${legDefs.length}`;
      const result = await ensureRoad(legDefs[i].from, legDefs[i].to);
      legResults.push(result);
    }

    // Feasibility check
    const blockedLegs = [];
    for (let i = 0; i < legResults.length; i++) {
      if (legResults[i]?.blocked) {
        blockedLegs.push({
          from: NODES[legDefs[i].from].name,
          to: NODES[legDefs[i].to].name
        });
      }
    }
    if (blockedLegs.length > 0) {
      const detail = blockedLegs.map(l => l.from + ' \u2192 ' + l.to).join(', ');
      showRouteError(
        'No feasible route found',
        'Blocked road(s) disconnect: ' + detail,
        [
          'Remove one or more road blockages along the affected corridor',
          'Enable a different thermal storage tank',
          'Try selecting a different sink',
          'Click "Clear blocks" to remove all obstructions'
        ]
      );
      document.getElementById('status-text').textContent = 'Route blocked \u2014 see error';
      setAlgoSteps('fetch');
      return;
    }

    // Wavefront animation
    setAlgoSteps('search');
    document.getElementById('status-text').textContent = 'Searching...';
    const wf = legDefs.map(l => getRoad(l.from, l.to)).filter(Boolean);
    if (wf.length) {
      await new Promise(res => {
        const dur = 200;
        const start = performance.now();
        const parts = wf.map((r, i) => ({r, line: null, a: Math.max(.1, .4 * (1 - i / wf.length))}));
        function frame(now) {
          const t = Math.min(1, (now - start) / dur);
          for (const p of parts) {
            const c = p.r.coords;
            const idx = Math.max(2, Math.floor(t * c.length));
            if (p.line) map.removeLayer(p.line);
            p.line = L.polyline(c.slice(0, idx), {color: '#ff8c00', weight: 2, opacity: p.a, dashArray: '4 6'}).addTo(map);
          }
          if (t < 1) {
            requestAnimationFrame(frame);
          } else {
            for (const p of parts) {
              if (p.line) map.removeLayer(p.line);
              exploredLayer.push(L.polyline(p.r.coords, {color: '#ff8c00', weight: 1.5, opacity: p.a * .4, dashArray: '3 7'}).addTo(map));
            }
            res();
          }
        }
        requestAnimationFrame(frame);
      });
    }

    setAlgoSteps('search', 1, 1);
    exploredLayer.forEach(l => { try { l.setStyle({opacity: .03}); } catch(e) {} });
    setAlgoSteps('draw');
    document.getElementById('status-text').textContent = 'Drawing...';

    let tHeat = 0, tDist = 0, tCO2 = 0, tCost = 0;
    for (const ld of legDefs) {
      const seg = getRoad(ld.from, ld.to);
      const coords = seg?.coords || [[NODES[ld.from].lat, NODES[ld.from].lng], [NODES[ld.to].lat, NODES[ld.to].lng]];
      tDist += seg?.distKm || 0;
      routeLayer.push(L.polyline(coords, {color: ld.color, weight: 14, opacity: .12}).addTo(map));
      await new Promise(res => {
        const c = coords;
        const tot = c.length;
        const dur = Math.min(180, tot * 1.2);
        const start = performance.now();
        let line = null;
        function frame(now) {
          const t = Math.min(1, (now - start) / dur);
          const idx = Math.max(2, Math.floor(t * tot));
          if (line) map.removeLayer(line);
          line = L.polyline(c.slice(0, idx), {color: ld.color, weight: 4, opacity: .95}).addTo(map);
          if (t < 1) {
            requestAnimationFrame(frame);
          } else {
            if (line) map.removeLayer(line);
            routeLayer.push(L.polyline(c, {color: ld.color, weight: 4, opacity: .95}).addTo(map));
            res();
          }
        }
        requestAnimationFrame(frame);
      });
    }

    for (const src of selectedSources) {
      const h = Math.min(src.heat, selectedSink.heat);
      tHeat += h;
      tCO2 += Math.round(h * 1000 * 8760 * EGRID_KG / 1000);
      tCost += parseFloat(((tDist * 1000 * 1200) / 1e6 + h * .18).toFixed(2));
    }
    const cs = tCost.toFixed(1);
    const pb = (tCost / (tHeat * 8760 * .04)).toFixed(1);
    document.getElementById('route-length').textContent = tDist.toFixed(2) + ' km';
    document.getElementById('heat-recovered').textContent = tHeat.toFixed(1) + ' MW';
    document.getElementById('total-heat').textContent = tHeat.toFixed(1) + ' MW';
    document.getElementById('total-savings').textContent = tCO2.toLocaleString() + ' t/yr';
    document.getElementById('total-cost').textContent = '$' + cs + 'M';
    document.getElementById('status-text').textContent = selectedSources.length + ' route(s) found \u2713';
    setAlgoSteps('done');
    updateScheduleChart();
    renderEmChart();
    renderProjects(tHeat, tDist, tCO2, cs, pb);
    renderBrief(tDist, tHeat, tCO2, cs, pb);
    clearStartupPipes();
    drawStartupPipes();

  } catch (err) {
    console.error('[HeatRouter] runOptimization error:', err);
    showRouteError(
      'Optimization failed',
      err.message || 'An unexpected error occurred during routing.',
      [
        'Check your internet connection (OSRM requires network access)',
        'Try again in a few seconds',
        'Click Reset and try a different sink'
      ]
    );
    document.getElementById('status-text').textContent = 'Error \u2014 see details';
  } finally {
    animating = false;
    btn.disabled = false;
    btn.textContent = '\u26A1 Run Optimization';
  }
}
