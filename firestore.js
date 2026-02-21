function _stripUndefined(obj) {
  if (obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) return obj.map(v => _stripUndefined(v));
  if (typeof obj === 'object' && !(obj instanceof Date) && !(obj.constructor && obj.constructor.name === 'Timestamp') && !(obj.constructor && obj.constructor.name === 'FieldValue')) {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== undefined) out[k] = _stripUndefined(v);
    }
    return out;
  }
  return obj;
}

function _citiesRef() {
  const uid = AppState.user?.uid;
  if (!uid) throw new Error('Not authenticated');
  return window.db.collection('users').doc(uid).collection('cities');
}

async function loadCities() {
  try {
    AppState.set('loading', true);
    const snap = await _citiesRef().orderBy('updatedAt', 'desc').get();
    const cities = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    AppState.set('cities', cities);
  } catch (e) {
    console.error('loadCities error:', e);
    AppState.set('cities', []);
  } finally {
    AppState.set('loading', false);
  }
}

async function loadCity(cityId) {
  try {
    AppState.set('loading', true);
    const doc = await _citiesRef().doc(cityId).get();
    if (!doc.exists) {
      console.warn('City not found:', cityId);
      return null;
    }
    const data = { id: doc.id, ...doc.data() };
    AppState.set('selectedCityId', cityId);
    AppState.set('selectedCityDoc', data);
    await _citiesRef().doc(cityId).update({
      lastOpenedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return data;
  } catch (e) {
    console.error('loadCity error:', e);
    return null;
  } finally {
    AppState.set('loading', false);
  }
}

async function saveCity(cityId, data) {
  try {
    AppState.set('saving', true);
    const raw = {
      ...data,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    delete raw.id;
    const payload = _stripUndefined(raw);
    payload.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
    await _citiesRef().doc(cityId).set(payload, { merge: true });
    const fresh = await _citiesRef().doc(cityId).get();
    AppState.set('selectedCityDoc', { id: fresh.id, ...fresh.data() });
    await loadCities();
  } catch (e) {
    console.error('saveCity error:', e);
    throw e;
  } finally {
    AppState.set('saving', false);
  }
}

async function createCity(name, nodes) {
  try {
    AppState.set('saving', true);
    const now = firebase.firestore.FieldValue.serverTimestamp();
    const doc = {
      name: name,
      nodes: nodes || [],
      obstructions: [],
      metadata: { center: [41.888, -87.638], zoom: 14, city: 'Chicago, IL' },
      plannerParams: null,
      plannerResults: null,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now
    };
    const ref = await _citiesRef().add(doc);
    await loadCities();
    await selectCity(ref.id);
    return ref.id;
  } catch (e) {
    console.error('createCity error:', e);
    throw e;
  } finally {
    AppState.set('saving', false);
  }
}

async function deleteCity(cityId) {
  try {
    await _citiesRef().doc(cityId).delete();
    if (AppState.selectedCityId === cityId) {
      AppState.set('selectedCityId', null);
      AppState.set('selectedCityDoc', null);
    }
    await loadCities();
  } catch (e) {
    console.error('deleteCity error:', e);
    throw e;
  }
}

async function renameCity(cityId, newName) {
  await _citiesRef().doc(cityId).update({
    name: newName,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  if (AppState.selectedCityId === cityId && AppState.selectedCityDoc) {
    AppState.selectedCityDoc.name = newName;
    AppState._notify('selectedCityDoc');
  }
  await loadCities();
}

async function selectCity(cityId) {
  const data = await loadCity(cityId);
  if (data) {
    applyCityToGlobals(data);
  }
}

function applyCityToGlobals(cityDoc) {
  if (!cityDoc) return;

  if (typeof RC !== 'undefined') {
    for (const k in RC) delete RC[k];
  }

  NODES.length = 0;
  (cityDoc.nodes || []).forEach((n, i) => {
    const node = { ...n, id: i };
    if (n.type === 'tank') node.active = true;
    NODES.push(node);
  });

  if (typeof map !== 'undefined' && map) {
    if (typeof clearStartupPipes === 'function') {
      try { clearStartupPipes(); } catch(e) {}
    }
    [...routeLayer, ...exploredLayer].forEach(l => {
      try { map.removeLayer(l); } catch(e) {}
    });
    routeLayer = [];
    exploredLayer = [];

    selectedSources.forEach(s => { try { s.marker?.setIcon(getIcon(s, false)); } catch(e) {} });
    selectedSources = [];
    selectedSource = null;
    if (selectedSink) {
      try { selectedSink.marker?.setIcon(getIcon(selectedSink, false)); } catch(e) {}
      selectedSink = null;
    }

    const md = cityDoc.metadata || {};
    const center = md.center || [41.888, -87.638];
    const zoom = md.zoom || 14;
    map.setView(center, zoom);
    map.eachLayer(layer => {
      if (layer._isNodeMarker) map.removeLayer(layer);
    });
    if (typeof renderNodes === 'function') renderNodes();
    setTimeout(() => {
      if (typeof drawStartupPipes === 'function') drawStartupPipes();
    }, 400);
  }

  if (typeof updateNodeList === 'function') {
    try { updateNodeList(); } catch (e) {}
  }
  if (typeof updateCityHeader === 'function') {
    try { updateCityHeader(); } catch (e) {}
  }
}

function gatherCityState() {
  const nodes = NODES.map(n => {
    const out = {
      id: n.id, name: n.name || '', type: n.type,
      lat: n.lat, lng: n.lng,
      heat: n.heat || 0, temp: n.temp || 0,
      desc: n.desc || '',
      placedBy: n.placedBy || 'manual'
    };
    if (n.cap != null) out.cap = n.cap;
    return out;
  });
  const obs = (typeof obstructions !== 'undefined' ? obstructions : []).map(o => ({
    coords: o.coords || []
  }));
  const existing = AppState.selectedCityDoc || {};
  return {
    name: existing.name || 'Untitled City',
    nodes: nodes,
    obstructions: obs,
    metadata: existing.metadata || { center: [41.888, -87.638], zoom: 14, city: 'Chicago, IL' },
    plannerParams: existing.plannerParams || null,
    plannerResults: existing.plannerResults || null,
    createdAt: existing.createdAt || firebase.firestore.FieldValue.serverTimestamp()
  };
}

async function saveCurrentCity() {
  if (!AppState.selectedCityId) {
    alert('No city selected to save.');
    return;
  }
  const data = gatherCityState();
  await saveCity(AppState.selectedCityId, data);
}
