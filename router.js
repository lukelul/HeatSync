const Router = {
  routes: {
    '/manage': 'page-manage',
    '/planner': 'page-planner'
  },
  defaultRoute: '/manage',
  _initialized: false,

  init() {
    if (this._initialized) return;
    this._initialized = true;
    window.addEventListener('hashchange', () => this._onRoute());
    this._onRoute();
  },

  _onRoute() {
    if (!AppState.isAuthenticated) {
      this._showAuth();
      return;
    }
    this._hideAuth();
    const hash = this.getCurrentRoute();
    const containerId = this.routes[hash];
    if (!containerId) {
      this.navigate(this.defaultRoute);
      return;
    }
    Object.values(this.routes).forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = id === containerId ? '' : 'none';
    });
    if (hash === '/planner') {
      if (typeof initPlannerView === 'function') initPlannerView();
    }
    if (hash === '/manage') {
      if (typeof onManagePageEnter === 'function') onManagePageEnter();
    }
  },

  navigate(hash) {
    window.location.hash = hash;
  },

  getCurrentRoute() {
    const h = window.location.hash.replace('#', '') || this.defaultRoute;
    return this.routes[h] ? h : this.defaultRoute;
  },

  _showAuth() {
    const overlay = document.getElementById('auth-overlay');
    if (overlay) overlay.style.display = 'flex';
    Object.values(this.routes).forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
  },

  _hideAuth() {
    const overlay = document.getElementById('auth-overlay');
    if (overlay) overlay.style.display = 'none';
  }
};

function navigate(hash) {
  Router.navigate(hash);
}
