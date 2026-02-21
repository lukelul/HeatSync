function renderAuthUI() {
  const overlay = document.getElementById('auth-overlay');
  if (!overlay) return;
  overlay.innerHTML = `
    <div class="auth-card">
      <div class="auth-logo">Heat<span>Router</span></div>
      <div class="auth-tagline">Thermal Packet Switching</div>
      <p class="auth-desc">Sign in to manage your city layouts, run planner optimizations, and save results.</p>
      <button class="btn btn-primary auth-google-btn" id="btn-google-signin">
        <svg width="18" height="18" viewBox="0 0 48 48" style="margin-right:8px;vertical-align:middle;">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
        </svg>
        Sign in with Google
      </button>
      <div class="auth-footer">Your data is stored securely per-user in Firestore.</div>
    </div>`;
}

function initAuth() {
  renderAuthUI();

  document.addEventListener('click', (e) => {
    if (e.target.closest('#btn-google-signin')) signIn();
  });

  window.auth.onAuthStateChanged(async (user) => {
    AppState.set('user', user);
    if (user) {
      Router.init();
      Router._onRoute();

      await loadCities();
      const cities = AppState.cities;
      if (cities.length > 0) {
        const lastOpened = cities.reduce((a, b) =>
          (b.lastOpenedAt && (!a.lastOpenedAt || b.lastOpenedAt.toMillis() > a.lastOpenedAt.toMillis())) ? b : a
        , cities[0]);
        await selectCity(lastOpened.id);
      } else {
        await _showWelcomeFlow();
      }
    } else {
      AppState.set('selectedCityId', null);
      AppState.set('selectedCityDoc', null);
      AppState.set('cities', []);
      Router._showAuth();
    }
  });
}

async function signIn() {
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    await window.auth.signInWithPopup(provider);
  } catch (e) {
    console.error('Sign-in error:', e);
    if (e.code !== 'auth/popup-closed-by-user') {
      alert('Sign-in failed: ' + e.message);
    }
  }
}

function signOut() {
  window.auth.signOut();
}

async function _showWelcomeFlow() {
  const name = await Modal.welcome();
  if (name) {
    try {
      await createCity(name);
      setTimeout(() => navigate('/planner'), 200);
    } catch (e) {
      console.error('Failed to create first city:', e);
    }
  }
}
