// Chart initialization and rendering
let schedChart = null;
let emChart = null;

function _hasData(arr) {
  return arr && arr.some(v => v !== 0);
}

function initCharts() {
  const h = Array.from({length: 24}, (_, i) => `${i}:00`);
  schedChart = new Chart(document.getElementById('schedule-chart').getContext('2d'), {
    type: 'line',
    data: {
      labels: h,
      datasets: [
        {
          label: 'Supply',
          data: _hasData(NREL_DC) ? NREL_DC.map(v => 6.5 * v) : new Array(24).fill(null),
          borderColor: '#ff4d00',
          backgroundColor: 'rgba(255,77,0,.07)',
          fill: true,
          tension: .4,
          pointRadius: 0,
          borderWidth: 2
        },
        {
          label: 'Demand',
          data: _hasData(NREL_OFF) ? NREL_OFF.map(v => 5.2 * v) : new Array(24).fill(null),
          borderColor: '#00c9ff',
          backgroundColor: 'rgba(0,201,255,.07)',
          fill: true,
          tension: .4,
          pointRadius: 0,
          borderWidth: 2
        },
      ]
    },
    options: cO()
  });
  renderEmChart();
}

function renderEmChart() {
  if (emChart) emChart.destroy();
  const hasEm = _hasData(CAMBIUM);
  emChart = new Chart(document.getElementById('emissions-chart').getContext('2d'), {
    type: 'bar',
    data: {
      labels: Array.from({length: 24}, (_, i) => `${i}`),
      datasets: [{
        label: 'CO₂ lbs/MWh',
        data: hasEm ? CAMBIUM : new Array(24).fill(null),
        backgroundColor: hasEm ? CAMBIUM.map(v => v > 460 ? 'rgba(255,77,0,.75)' : v > 420 ? 'rgba(255,210,0,.65)' : 'rgba(0,230,118,.55)') : 'rgba(74,96,112,.3)',
        borderWidth: 0,
        borderRadius: 1
      }]
    },
    options: {
      ...cO(),
      plugins: {
        legend: {
          labels: {
            color: '#4a6070',
            font: {family: 'Space Mono', size: 8},
            boxWidth: 10
          }
        }
      }
    }
  });
}

function updateScheduleChart() {
  if (!schedChart || !selectedSink) return;
  const s = selectedSources[0];
  if (!_hasData(NREL_DC) && !_hasData(NREL_OFF)) {
    schedChart.update();
    return;
  }
  const sh = s && s.temp > 42 ? NREL_DC : NREL_OFF;
  schedChart.data.datasets[0].data = sh.map(v => (s ? s.heat : 6) * v);
  schedChart.data.datasets[1].data = NREL_OFF.map(v => selectedSink.heat * v);
  schedChart.update();
}

function cO() {
  return {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: {
        labels: {
          color: '#4a6070',
          font: {family: 'Space Mono', size: 8},
          boxWidth: 10
        }
      }
    },
    scales: {
      x: {
        ticks: {
          color: '#4a6070',
          font: {family: 'Space Mono', size: 7},
          maxTicksLimit: 8
        },
        grid: {color: '#1a2530'}
      },
      y: {
        ticks: {
          color: '#4a6070',
          font: {family: 'Space Mono', size: 8}
        },
        grid: {color: '#1a2530'}
      }
    }
  };
}
