// Projects and brief rendering
function renderProjects(h, d, co2, cost, pb) {
  document.getElementById('projects-list').innerHTML = [
    {
      rank: '#1',
      name: `${selectedSource.name} → ${selectedSink.name}`,
      co2: `${co2.toLocaleString()} t/yr`,
      cost: `$${cost}M`,
      pay: `~${pb} yrs`,
      infra: `${d.toFixed(1)} km`
    },
    {
      rank: '#2',
      name: 'Thermal Storage',
      co2: `${Math.round(co2 * .12).toLocaleString()} t/yr`,
      cost: `$${(h * .14).toFixed(1)}M`,
      pay: `${(pb * 1.5).toFixed(1)} yrs`,
      infra: 'Peak shift'
    },
    {
      rank: '#3',
      name: NODES.filter(n => n.type === 'sink' && n !== selectedSink)[0]?.name ?? 'Expansion',
      co2: `${Math.round(co2 * 1.5).toLocaleString()} t/yr`,
      cost: `$${(cost * 1.9).toFixed(1)}M`,
      pay: `${(pb * 2.1).toFixed(1)} yrs`,
      infra: 'Phase 2'
    },
  ].map(p => `<div class="project-card">
    <div class="project-rank">${p.rank}</div>
    <div class="project-name">${p.name}</div>
    <div class="project-metrics">
      <div class="metric">
        <div class="metric-val">${p.co2}</div>
        <div class="metric-label">CO₂</div>
      </div>
      <div class="metric">
        <div class="metric-val">${p.cost}</div>
        <div class="metric-label">Cost</div>
      </div>
      <div class="metric">
        <div class="metric-val">${p.pay}</div>
        <div class="metric-label">Payback</div>
      </div>
      <div class="metric">
        <div class="metric-val" style="color:var(--accent2)">${p.infra}</div>
        <div class="metric-label">Infra</div>
      </div>
    </div>
  </div>`).join('');
}

function renderBrief(d, h, co2, cost, pb) {
  const s = selectedSources[0] || {name: '—', temp: 42};
  document.getElementById('brief-area').innerHTML = `<div class="brief-box">HEATROUTER BRIEF
Sources: ${selectedSources.map(s => s.name).join(', ')}
Sink: ${selectedSink?.name}
Route: ${d.toFixed(2)}km · Heat: ${h.toFixed(1)}MW
CO₂ avoided: ${co2.toLocaleString()} t/yr
Cost: $${cost}M · Payback: ~${pb} yrs
Blocked roads: ${obstructions.length}</div>`;
}
