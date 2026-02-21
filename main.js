let _mapInitialized = false;
let _tempInterval = null;

window.onload = () => {
  initAuth();
  initCitySelector();
  initBridge();
  startApiPolling();
};

function onManagePageEnter() {
  if (!_mapInitialized && document.getElementById('map')) {
    _mapInitialized = true;
    initMap();
    if (!_tempInterval) {
      _tempInterval = setInterval(refreshTemps, 1000);
    }
  }
  if (map) {
    setTimeout(() => map.invalidateSize(), 50);
  }
  if (AppState.selectedCityDoc) {
    applyCityToGlobals(AppState.selectedCityDoc);
  }
}
