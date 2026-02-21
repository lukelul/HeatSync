const Modal = {
  _resolve: null,

  show(html) {
    const overlay = document.getElementById('app-modal');
    const card = document.getElementById('app-modal-card');
    if (!overlay || !card) return;
    card.innerHTML = html;
    overlay.style.display = 'flex';
  },

  hide() {
    const overlay = document.getElementById('app-modal');
    if (overlay) overlay.style.display = 'none';
    if (this._resolve) {
      this._resolve(null);
      this._resolve = null;
    }
  },

  _finish(val) {
    const overlay = document.getElementById('app-modal');
    if (overlay) overlay.style.display = 'none';
    if (this._resolve) {
      this._resolve(val);
      this._resolve = null;
    }
  },

  prompt({ title, subtitle, description, label, placeholder, defaultValue, icon, iconClass, confirmText, cancelText }) {
    return new Promise((resolve) => {
      this._resolve = resolve;
      this.show(`
        ${icon ? `<div class="modal-icon ${iconClass || ''}">${icon}</div>` : ''}
        <div class="modal-title">${title || 'Input'}</div>
        ${subtitle ? `<div class="modal-subtitle">${subtitle}</div>` : ''}
        ${description ? `<div class="modal-desc">${description}</div>` : ''}
        <div class="modal-input-group">
          <label class="modal-input-label">${label || 'Name'}</label>
          <input class="modal-input" id="modal-input" type="text"
            placeholder="${placeholder || ''}"
            value="${_escHtml(defaultValue || '')}"
            autocomplete="off" spellcheck="false">
          <div class="modal-warn" id="modal-warn"></div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-ghost" id="modal-cancel">${cancelText || 'Cancel'}</button>
          <button class="btn btn-primary" id="modal-confirm">${confirmText || 'Create'}</button>
        </div>
      `);
      const input = document.getElementById('modal-input');
      const confirmBtn = document.getElementById('modal-confirm');
      const cancelBtn = document.getElementById('modal-cancel');
      setTimeout(() => { input?.focus(); input?.select(); }, 50);
      input?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); _submitPrompt(); }
        if (e.key === 'Escape') { e.preventDefault(); Modal._finish(null); }
      });
      confirmBtn?.addEventListener('click', _submitPrompt);
      cancelBtn?.addEventListener('click', () => Modal._finish(null));

      function _submitPrompt() {
        const val = input?.value?.trim();
        if (!val) {
          const warn = document.getElementById('modal-warn');
          if (warn) { warn.textContent = 'Please enter a name.'; warn.style.display = 'block'; }
          input?.focus();
          return;
        }
        Modal._finish(val);
      }
    });
  },

  confirm({ title, subtitle, description, icon, iconClass, confirmText, cancelText, danger }) {
    return new Promise((resolve) => {
      this._resolve = resolve;
      this.show(`
        ${icon ? `<div class="modal-icon ${iconClass || ''}">${icon}</div>` : ''}
        <div class="modal-title">${title || 'Confirm'}</div>
        ${subtitle ? `<div class="modal-subtitle">${subtitle}</div>` : ''}
        ${description ? `<div class="modal-desc">${description}</div>` : ''}
        <div class="modal-actions">
          <button class="btn btn-ghost" id="modal-cancel">${cancelText || 'Cancel'}</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="modal-confirm">${confirmText || 'Confirm'}</button>
        </div>
      `);
      document.getElementById('modal-confirm')?.addEventListener('click', () => Modal._finish(true));
      document.getElementById('modal-cancel')?.addEventListener('click', () => Modal._finish(false));
    });
  },

  welcome() {
    return new Promise((resolve) => {
      this._resolve = resolve;
      this.show(`
        <div class="modal-icon welcome">&#127758;</div>
        <div class="modal-title">Welcome to HeatRouter</div>
        <div class="modal-subtitle">Thermal Packet Switching</div>
        <div class="modal-desc">
          Name your city to get started. You'll be taken to the <strong>City Planner</strong>
          where you can set parameters and run the optimizer to place heat sources,
          sinks, and thermal storage tanks on the map. After placing, you can
          <strong>drag markers</strong> to fine-tune positions before saving.
        </div>
        <div class="modal-input-group">
          <label class="modal-input-label">City Name</label>
          <input class="modal-input" id="modal-input" type="text"
            placeholder="e.g. Chicago Downtown, Boston Harbor..."
            value=""
            autocomplete="off" spellcheck="false">
          <div class="modal-warn" id="modal-warn"></div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-primary" id="modal-confirm" style="flex:1">
            &#9733; Create &amp; Open Planner
          </button>
        </div>
      `);
      const input = document.getElementById('modal-input');
      const confirmBtn = document.getElementById('modal-confirm');
      setTimeout(() => { input?.focus(); input?.select(); }, 50);
      input?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); _submit(); }
      });
      confirmBtn?.addEventListener('click', _submit);

      function _submit() {
        const val = input?.value?.trim();
        if (!val) {
          const warn = document.getElementById('modal-warn');
          if (warn) { warn.textContent = 'Give your city a name to continue.'; warn.style.display = 'block'; }
          input?.focus();
          return;
        }
        Modal._finish(val);
      }
    });
  }
};
