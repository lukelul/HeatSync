/** @typedef {{id:number, name:string, type:'source'|'sink'|'tank', lat:number, lng:number, heat:number, temp:number, desc:string, cap?:number, placedBy?:'planner'|'manual', active?:boolean}} NodeDef */
/** @typedef {{nSources:number, nSinks:number, nTanks:number, wCost:number, wCentrality:number, wCoverage:number, minSeparation:number, seed:number}} PlannerParams */
/** @typedef {{lat:number, lng:number, score:number, breakdown:{cost:number, centrality:number, coverage:number}}} PlacementResult */
/** @typedef {{sources:PlacementResult[], sinks:PlacementResult[], tanks:PlacementResult[], totalObjective:number, computedAt:Date}} PlannerResults */
/** @typedef {{name:string, nodes:NodeDef[], obstructions:Array, metadata:Object, plannerParams:PlannerParams|null, plannerResults:PlannerResults|null, createdAt:Date, updatedAt:Date, lastOpenedAt:Date}} CityLayout */

const AppState = {
  user: null,
  selectedCityId: null,
  selectedCityDoc: null,
  cities: [],
  loading: false,
  saving: false,
  _listeners: [],

  set(key, val) {
    this[key] = val;
    this._notify(key);
  },

  _notify(key) {
    for (const fn of this._listeners) {
      try { fn(key, this); } catch (e) { console.error('AppState listener error:', e); }
    }
  },

  onChange(fn) {
    this._listeners.push(fn);
    return () => {
      const i = this._listeners.indexOf(fn);
      if (i >= 0) this._listeners.splice(i, 1);
    };
  },

  get isAuthenticated() {
    return this.user !== null;
  },

  get cityName() {
    return this.selectedCityDoc ? this.selectedCityDoc.name : null;
  }
};
