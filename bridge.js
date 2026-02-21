function renderBridge() {
  const el = document.getElementById('bridge-widget');
  if (!el) return;

  if (!AppState.isAuthenticated) {
    el.style.display = 'none';
    return;
  }
  el.style.display = 'flex';

  const cityName = AppState.cityName || 'No city';
  const route = Router.getCurrentRoute();
  const isManage = route === '/manage';
  const saving = AppState.saving;
  const user = AppState.user;
  const doc = AppState.selectedCityDoc;

  let lastSaved = '—';
  if (doc && doc.updatedAt) {
    const ts = doc.updatedAt.toDate ? doc.updatedAt.toDate() : new Date(doc.updatedAt);
    lastSaved = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  el.innerHTML = `
    <div class="bridge-left">
      <div class="bridge-user" title="${_escHtml(user?.email || '')}">
        ${user?.photoURL ? `<img class="bridge-avatar" src="${user.photoURL}" alt="">` : ''}
        <span class="bridge-username">${_escHtml(user?.displayName || user?.email || 'User')}</span>
        <button class="bridge-signout" onclick="signOut()" title="Sign out">&#x23FB;</button>
      </div>
      <div class="bridge-city">
        <span class="bridge-city-dot"></span>
        <span class="bridge-city-name">${_escHtml(cityName)}</span>
      </div>
    </div>
    <div class="bridge-center">
      <button class="bridge-nav-btn ${!isManage ? 'active' : ''}" onclick="navigate('/planner')">
        <span class="bridge-nav-icon">&#9733;</span> Planner
      </button>
      <button class="bridge-nav-btn ${isManage ? 'active' : ''}" onclick="navigate('/manage')">
        <span class="bridge-nav-icon">&#9881;</span> Manage
      </button>
    </div>
    <div class="bridge-right">
      <div class="bridge-save-status">
        <span class="bridge-save-dot ${saving ? 'saving' : ''}"></span>
        <span class="bridge-save-text">${saving ? 'Saving...' : 'Saved ' + lastSaved}</span>
      </div>
      <button class="btn btn-secondary bridge-save-btn" onclick="saveCurrentCity()" ${!AppState.selectedCityId ? 'disabled' : ''}>
        &#128190; Save
      </button>
    </div>`;
}

function initBridge() {
  AppState.onChange((key) => {
    if (['user', 'selectedCityId', 'selectedCityDoc', 'saving', 'cities'].includes(key)) {
      renderBridge();
    }
  });
  window.addEventListener('hashchange', () => setTimeout(renderBridge, 10));
  renderBridge();
}

