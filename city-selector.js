function renderCitySelector() {
  const container = document.getElementById('city-selector');
  if (!container) return;

  const cities = AppState.cities || [];
  const currentId = AppState.selectedCityId;
  const currentName = AppState.cityName || 'No city selected';

  container.innerHTML = `
    <div class="city-sel-current" id="city-sel-toggle">
      <span class="city-sel-label">CITY</span>
      <span class="city-sel-name">${_escHtml(currentName)}</span>
      <span class="city-sel-arrow">&#9662;</span>
    </div>
    <div class="city-sel-dropdown" id="city-sel-dropdown" style="display:none">
      <div class="city-sel-list">
        ${cities.map(c => `
          <div class="city-sel-item ${c.id === currentId ? 'active' : ''}" data-city-id="${c.id}">
            <span class="city-sel-item-name">${_escHtml(c.name)}</span>
            <span class="city-sel-item-actions">
              <button class="city-sel-act-btn" data-action="rename" data-city-id="${c.id}" title="Rename">&#9998;</button>
              <button class="city-sel-act-btn city-sel-del" data-action="delete" data-city-id="${c.id}" title="Delete">&times;</button>
            </span>
          </div>
        `).join('')}
        ${cities.length === 0 ? '<div class="city-sel-empty">No cities yet</div>' : ''}
      </div>
      <button class="btn btn-secondary city-sel-new-btn" id="btn-new-city">+ New City</button>
    </div>`;
}

function _escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

function initCitySelector() {
  document.addEventListener('click', (e) => {
    const toggle = e.target.closest('#city-sel-toggle');
    if (toggle) {
      const dd = document.getElementById('city-sel-dropdown');
      if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
      return;
    }

    if (e.target.closest('#btn-new-city')) {
      _handleNewCity();
      return;
    }

    const actBtn = e.target.closest('.city-sel-act-btn');
    if (actBtn) {
      e.stopPropagation();
      const action = actBtn.dataset.action;
      const cityId = actBtn.dataset.cityId;
      if (action === 'rename') _handleRenameCity(cityId);
      else if (action === 'delete') _handleDeleteCity(cityId);
      return;
    }

    const item = e.target.closest('.city-sel-item');
    if (item) {
      const cityId = item.dataset.cityId;
      if (cityId && cityId !== AppState.selectedCityId) {
        selectCity(cityId);
      }
      const dd = document.getElementById('city-sel-dropdown');
      if (dd) dd.style.display = 'none';
      return;
    }

    if (!e.target.closest('.city-sel-dropdown') && !e.target.closest('#city-sel-toggle')) {
      const dd = document.getElementById('city-sel-dropdown');
      if (dd) dd.style.display = 'none';
    }
  });

  AppState.onChange((key) => {
    if (['cities', 'selectedCityId', 'selectedCityDoc'].includes(key)) {
      renderCitySelector();
    }
  });

  renderCitySelector();
}

async function _handleNewCity() {
  const name = await Modal.prompt({
    icon: '&#128204;',
    iconClass: 'create',
    title: 'New City',
    subtitle: 'Create a city layout',
    description: 'Enter a name for your new city. Use the Planner tab to place heat sources, sinks, and storage tanks.',
    label: 'City Name',
    placeholder: 'e.g. Downtown District, North Side...',
    defaultValue: 'New City',
    confirmText: '+ Create',
    cancelText: 'Cancel'
  });
  if (!name) return;
  try {
    await createCity(name);
  } catch (e) {
    alert('Failed to create city: ' + e.message);
  }
}

async function _handleRenameCity(cityId) {
  const city = AppState.cities.find(c => c.id === cityId);
  const current = city ? city.name : '';
  const name = await Modal.prompt({
    icon: '&#9998;',
    iconClass: 'create',
    title: 'Rename City',
    label: 'New Name',
    placeholder: 'Enter new name',
    defaultValue: current,
    confirmText: 'Rename',
    cancelText: 'Cancel'
  });
  if (!name || name === current) return;
  try {
    await renameCity(cityId, name);
  } catch (e) {
    alert('Failed to rename: ' + e.message);
  }
}

async function _handleDeleteCity(cityId) {
  const city = AppState.cities.find(c => c.id === cityId);
  const cityName = city ? city.name : cityId;
  const confirmed = await Modal.confirm({
    icon: '&#9888;',
    iconClass: 'danger',
    title: 'Delete City',
    description: `Are you sure you want to delete "<strong>${_escHtml(cityName)}</strong>"? All nodes, planner results, and obstructions will be permanently removed. This cannot be undone.`,
    confirmText: 'Delete',
    cancelText: 'Keep',
    danger: true
  });
  if (!confirmed) return;
  try {
    await deleteCity(cityId);
  } catch (e) {
    alert('Failed to delete: ' + e.message);
  }
}
