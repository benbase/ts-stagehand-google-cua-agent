/**
 * CUA 3.0 Playground
 */

/* ── Reusable Picker ─────────────────────────────────────────────────── */

class Picker {
  static _instances = [];
  static onOpen = null;

  static closeAll(except) {
    Picker._instances.forEach(p => { if (p !== except && p.isOpen) p.close(); });
  }

  constructor(el, opts = {}) {
    Picker._instances.push(this);
    this.el = el;
    this.triggerEl = el.querySelector('.picker-trigger');
    this.labelEl = el.querySelector('.picker-value');
    this.searchWrap = el.querySelector('.picker-search');
    this.searchEl = el.querySelector('.picker-search input');
    this.listEl = el.querySelector('.picker-list');
    this.placeholder = opts.placeholder || 'Select...';
    this.searchable = opts.searchable !== false;
    this.onChange = opts.onChange || null;
    this._value = '';
    this._text = '';
    this.isOpen = false;
    this._focusIdx = -1;
    this.items = [];

    if (!this.searchable && this.searchWrap) this.searchWrap.style.display = 'none';
    this.labelEl.textContent = this.placeholder;
    this.labelEl.classList.add('placeholder');
    this._bind();
  }

  get value() { return this._value; }
  set value(v) { this.setValue(v); }

  get text() { return this._text; }

  _bind() {
    this.triggerEl.addEventListener('click', e => { e.stopPropagation(); this.isOpen ? this.close() : this.open(); });
    if (this.searchEl) {
      this.searchEl.addEventListener('input', () => this._render(this.searchEl.value));
      this.searchEl.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown') { e.preventDefault(); this._nav(1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); this._nav(-1); }
        else if (e.key === 'Enter') { e.preventDefault(); this._confirm(); }
        else if (e.key === 'Escape') { e.stopPropagation(); this.close(); }
      });
    }
    this.listEl.addEventListener('click', e => {
      const opt = e.target.closest('.picker-option');
      if (opt) this.select(opt.dataset.value);
    });
    document.addEventListener('click', e => { if (this.isOpen && !this.el.contains(e.target)) this.close(); });
  }

  setItems(items) { this.items = items; this._render(); }

  setValue(v) {
    this._value = v;
    const item = this.items.find(i => !i.group && i.value === v);
    this._text = item ? item.text : '';
    const isEmpty = v === '' || v == null;
    this.labelEl.textContent = isEmpty ? this.placeholder : (this._text || this.placeholder);
    this.labelEl.classList.toggle('placeholder', isEmpty);
  }

  select(value) {
    this.setValue(value);
    this.close();
    if (this.onChange) this.onChange(this._value, this._text);
  }

  clear() { this.setValue(''); this._text = ''; this.labelEl.textContent = this.placeholder; this.labelEl.classList.add('placeholder'); }

  open() {
    Picker.closeAll(this);
    if (Picker.onOpen) Picker.onOpen();
    this.isOpen = true;
    this.el.classList.add('open');
    if (this.searchEl) this.searchEl.value = '';
    this._render();
    if (this.searchable && this.searchEl) requestAnimationFrame(() => this.searchEl.focus());
  }

  close() { this.isOpen = false; this.el.classList.remove('open'); this._focusIdx = -1; }

  _render(filter = '') {
    const q = filter.toLowerCase();
    let html = '';
    let pendingGroup = null;

    for (const item of this.items) {
      if (item.group) { pendingGroup = item; continue; }
      if (q && !item.text.toLowerCase().includes(q)) continue;
      if (pendingGroup) { html += `<div class="picker-group-label">${pendingGroup.label}</div>`; pendingGroup = null; }
      const sel = item.value === this._value ? ' selected' : '';
      html += `<div class="picker-option${sel}" data-value="${item.value}">
        <svg class="picker-option-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
        <span>${item.text}</span></div>`;
    }

    this.listEl.innerHTML = html || '<div class="picker-empty">No results</div>';
    this._focusIdx = -1;
  }

  _nav(dir) {
    const opts = this.listEl.querySelectorAll('.picker-option');
    if (!opts.length) return;
    opts.forEach(o => o.classList.remove('focused'));
    this._focusIdx += dir;
    if (this._focusIdx < 0) this._focusIdx = opts.length - 1;
    if (this._focusIdx >= opts.length) this._focusIdx = 0;
    opts[this._focusIdx].classList.add('focused');
    opts[this._focusIdx].scrollIntoView({ block: 'nearest' });
  }

  _confirm() {
    const opts = this.listEl.querySelectorAll('.picker-option');
    if (this._focusIdx >= 0 && opts[this._focusIdx]) this.select(opts[this._focusIdx].dataset.value);
  }
}

/* ── Picker HTML factory ─────────────────────────────────────────────── */

function pickerHtml(id, placeholder) {
  return `<div class="picker" id="${id}">
    <button type="button" class="picker-trigger">
      <span class="picker-value placeholder">${placeholder}</span>
      <svg class="picker-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
    </button>
    <div class="picker-dropdown">
      <div class="picker-search">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        <input type="text" placeholder="Search..." autocomplete="off">
      </div>
      <div class="picker-list"></div>
    </div>
  </div>`;
}

/* ── App ──────────────────────────────────────────────────────────────── */

class App {
  constructor() {
    this.selectedPayload = null;
    this.originalPayload = null;
    this.isRunning = false;
    this.isNewPayload = false;
    this.abortController = null;
    this.theaterMode = false;
    this.sidebarWasVisible = true;
    this.theaterHintTimeout = null;
    this.masterPrompt = null;
    this.usesMasterPrompt = true;
    this.clearCredentialsFlag = false;

    // Provider picker state
    this.providerValue = '';
    this.providerText = '';
    this.providerSource = '';
    this.providerUrl = '';
    this.providerPickerOpen = false;
    this.providerFocusIndex = -1;

    this.el = {
      mainContent: document.getElementById('main-content'),
      sidebarToggle: document.getElementById('sidebar-toggle'),
      themeToggle: document.getElementById('theme-toggle'),
      themeIcon: document.getElementById('theme-icon'),
      payloadList: document.getElementById('payload-list'),
      taskSearchInput: document.getElementById('task-search-input'),
      appSwitcher: document.getElementById('app-switcher'),

      // Task config form
      taskConfigEmpty: document.getElementById('task-config-empty'),
      taskConfigForm: document.getElementById('task-config-form'),
      taskHeaderTitle: document.getElementById('task-header-title'),

      // Config fields
      payloadUrl: document.getElementById('payload-url'),
      payloadInstruction: document.getElementById('payload-instruction'),
      providerPicker: document.getElementById('provider-picker'),
      providerTrigger: document.getElementById('provider-trigger'),
      providerLabel: document.getElementById('provider-label'),
      providerDropdown: document.getElementById('provider-dropdown'),
      providerSearch: document.getElementById('provider-search'),
      providerList: document.getElementById('provider-list'),
      varClientName: document.getElementById('var-client-name'),
      varGroupNumber: document.getElementById('var-group-number'),
      varInvoiceYear: document.getElementById('var-invoice-year'),
      maxSteps: document.getElementById('max-steps'),

      // Models
      stagehandModel: document.getElementById('stagehand-model'),

      // Credentials
      credentialsSection: document.getElementById('credentials-section'),
      credentialsDescription: document.getElementById('credentials-description'),
      varUsername: document.getElementById('var-username'),
      varPassword: document.getElementById('var-password'),
      varTotpSecret: document.getElementById('var-totp-secret'),
      clearCredentialsBtn: document.getElementById('clear-credentials-btn'),

      // Proxy settings
      proxyCountryGroup: document.getElementById('proxy-country-group'),
      profileName: document.getElementById('profile-name'),

      // Instructions
      instructionsStatus: document.getElementById('instructions-status'),
      instructionsStatusText: document.getElementById('instructions-status-text'),
      instructionsResetBtn: document.getElementById('instructions-reset-btn'),

      // Advanced settings (inline)
      advancedSettings: document.getElementById('advanced-settings'),
      advancedSettingsToggle: document.getElementById('advanced-settings-toggle'),
      advancedSettingsContent: document.getElementById('advanced-settings-content'),

      // Buttons
      newPayloadBtn: document.getElementById('new-payload-btn'),
      refreshBtn: document.getElementById('refresh-btn'),
      saveBtn: document.getElementById('save-btn'),
      updateBtn: document.getElementById('update-btn'),
      status: document.getElementById('status'),
      statusText: document.getElementById('status-text'),

      // Action bar
      actionBar: document.getElementById('action-bar'),
      actionBarTask: document.getElementById('action-bar-task'),
      actionBarStatus: document.getElementById('action-bar-status'),
      runBtn: document.getElementById('run-btn'),
      runBtnText: document.getElementById('run-btn-text'),
      stopBtn: document.getElementById('stop-btn'),

      // Tabs
      tabEditor: document.getElementById('tab-editor'),
      tabLiveView: document.getElementById('tab-live-view'),
      tabLiveStatus: document.getElementById('tab-live-status'),
      tabContentEditor: document.getElementById('tab-content-editor'),
      tabContentLiveView: document.getElementById('tab-content-live-view'),

      // Live view
      liveViewIdle: document.getElementById('live-view-idle'),
      runningState: document.getElementById('running-state'),
      liveViewPlaceholder: document.getElementById('live-view-placeholder'),
      liveViewIframe: document.getElementById('live-view-iframe'),
      liveViewStatus: document.getElementById('live-view-status'),
      liveViewLink: document.getElementById('live-view-link'),
      resultsSection: document.getElementById('results-section'),
      resultsContainer: document.getElementById('results-container'),
      outputLog: document.getElementById('output-log'),
      copyOutputBtn: document.getElementById('copy-output-btn'),
      clearOutputBtn: document.getElementById('clear-output-btn'),
      scrollBottomBtn: document.getElementById('scroll-bottom-btn'),

      // Theater mode
      liveViewCard: document.getElementById('live-view-card'),
      liveViewOverlay: document.getElementById('live-view-overlay'),
      theaterModeBtn: document.getElementById('theater-mode-btn'),
      theaterExpandIcon: document.getElementById('theater-expand-icon'),
      theaterCollapseIcon: document.getElementById('theater-collapse-icon'),
      panelRight: document.getElementById('panel-right'),

      // Save modal
      saveModal: document.getElementById('save-modal'),
      saveNameInput: document.getElementById('save-name-input'),
      saveCancelBtn: document.getElementById('save-cancel-btn'),
      saveConfirmBtn: document.getElementById('save-confirm-btn'),

      // Results panel
      resultsToggle: document.getElementById('results-toggle'),
      resultsPanel: document.getElementById('results-panel'),
      resultsPanelOverlay: document.getElementById('results-panel-overlay'),
      resultsPanelClose: document.getElementById('results-panel-close'),
      resultsPanelContent: document.getElementById('results-panel-content'),
      resultsSearchInput: document.getElementById('results-search-input'),

      // History
      tabHistory: document.getElementById('tab-history'),
      tabContentHistory: document.getElementById('tab-content-history'),
      historyList: document.getElementById('history-list'),
      historySearchInput: document.getElementById('history-search-input'),
      refreshHistoryBtn: document.getElementById('refresh-history-btn'),
      historyDetail: document.getElementById('history-detail'),
      historyBackBtn: document.getElementById('history-back-btn'),
      historyVideo: document.getElementById('history-video'),
      historyDownloadRecordingLink: document.getElementById('history-download-recording-link'),
      historyCopyLogBtn: document.getElementById('history-copy-log-btn'),
      // New detail view elements
      runStatusCard: document.getElementById('run-status-card'),
      runStatusLabel: document.getElementById('run-status-label'),
      runTitle: document.getElementById('run-title'),
      runMeta: document.getElementById('run-meta'),
      runMessage: document.getElementById('run-message'),
      runActions: document.getElementById('run-actions'),
      runFilesSection: document.getElementById('run-files-section'),
      runFilesCount: document.getElementById('run-files-count'),
      runFilesList: document.getElementById('run-files-list'),
      runRecordingSection: document.getElementById('run-recording-section'),
      runRecordingContent: document.getElementById('run-recording-content'),
      runRecordingEmpty: document.getElementById('run-recording-empty'),
      runLogSection: document.getElementById('run-log-section'),
      runLogPreview: document.getElementById('run-log-preview'),
      runLogFull: document.getElementById('run-log-full'),
      runLogExpandBtn: document.getElementById('run-log-expand-btn'),
    };

    this.init();
  }

  async init() {
    // Initialize pickers
    this.monthPicker = new Picker(document.getElementById('month-picker'), {
      placeholder: 'Select...',
      searchable: false,
    });
    this.monthPicker.setItems([
      { value: 'January', text: 'January' },
      { value: 'February', text: 'February' },
      { value: 'March', text: 'March' },
      { value: 'April', text: 'April' },
      { value: 'May', text: 'May' },
      { value: 'June', text: 'June' },
      { value: 'July', text: 'July' },
      { value: 'August', text: 'August' },
      { value: 'September', text: 'September' },
      { value: 'October', text: 'October' },
      { value: 'November', text: 'November' },
      { value: 'December', text: 'December' },
    ]);

    this.modelPicker = new Picker(document.getElementById('model-picker'), {
      placeholder: 'Gemini 2.5 CU (Default)',
      searchable: false,
    });
    this.modelPicker.setItems([
      { value: '', text: 'Gemini 2.5 CU (Default)' },
      { group: true, label: 'Other Models' },
      { value: 'anthropic/claude-sonnet-4-20250514', text: 'Claude Sonnet 4' },
      { value: 'anthropic/claude-sonnet-4-5-20250929', text: 'Claude Sonnet 4.5' },
      { value: 'anthropic/computer-use-preview-2025-03-11', text: 'Anthropic CU Preview' },
    ]);

    this.proxyPicker = new Picker(document.getElementById('proxy-picker'), {
      placeholder: 'None (direct)',
      searchable: false,
      onChange: () => this.updateProxyCountryVisibility(),
    });
    this.proxyPicker.setItems([
      { value: '', text: 'None (direct)' },
      { value: 'mobile', text: 'Mobile' },
      { value: 'residential', text: 'Residential' },
      { value: 'isp', text: 'ISP' },
      { value: 'datacenter', text: 'Datacenter' },
    ]);

    this.locationPicker = new Picker(document.getElementById('location-picker'), {
      placeholder: 'Auto',
      searchable: true,
    });
    this.locationPicker.setItems([
      { value: '', text: 'Auto' },
      { value: 'US', text: 'United States' },
      { value: 'GB', text: 'United Kingdom' },
      { value: 'CA', text: 'Canada' },
      { value: 'AU', text: 'Australia' },
      { value: 'DE', text: 'Germany' },
      { value: 'FR', text: 'France' },
      { value: 'NL', text: 'Netherlands' },
      { value: 'JP', text: 'Japan' },
      { value: 'SG', text: 'Singapore' },
      { value: 'BR', text: 'Brazil' },
    ]);

    // Close provider picker when any Picker instance opens
    Picker.onOpen = () => {
      if (this.providerPickerOpen) this.closeProviderPicker();
    };

    this.loadTheme();
    await this.loadMasterPrompt();
    await this.loadProviders();
    await this.loadPayloads();
    this.bindEvents();
    this.updateAppVisibility();
  }

  // Master Prompt
  async loadMasterPrompt() {
    try {
      const res = await fetch('/api/master-prompt');
      const data = await res.json();
      this.masterPrompt = data.content;
    } catch (e) {
      console.error('Failed to load master prompt:', e);
      this.masterPrompt = null;
    }
  }

  instructionMatchesMaster() {
    if (!this.masterPrompt) return false;
    const current = this.el.payloadInstruction.value.trim();
    const master = this.masterPrompt.trim();
    return current === master;
  }

  updateInstructionsStatus() {
    const matchesMaster = this.instructionMatchesMaster();

    if (matchesMaster) {
      this.el.instructionsStatus.classList.remove('custom');
      this.el.instructionsStatusText.textContent = 'Default';
      this.el.instructionsResetBtn.style.display = 'none';
    } else {
      this.el.instructionsStatus.classList.add('custom');
      this.el.instructionsStatusText.textContent = 'Custom';
      this.el.instructionsResetBtn.style.display = 'block';
    }
  }

  resetToMasterPrompt() {
    if (this.masterPrompt) {
      this.el.payloadInstruction.value = this.masterPrompt;
      this.updateInstructionsStatus();
    }
  }

  // Providers (carriers + benadmin platforms)
  async loadProviders() {
    try {
      const res = await fetch('/api/carriers');
      this.providers = await res.json();
      this.renderProviderList();
    } catch (e) {
      console.error('Failed to load providers:', e);
    }
  }

  renderProviderList(filter = '') {
    const providers = this.providers || [];
    const carriers = providers.filter(p => p.category === 'carrier');
    const benadmin = providers.filter(p => p.category === 'benadmin');
    const q = filter.toLowerCase();

    const matchedCarriers = q ? carriers.filter(p => p.name.toLowerCase().includes(q)) : carriers;
    const matchedBenadmin = q ? benadmin.filter(p => p.name.toLowerCase().includes(q)) : benadmin;

    if (!matchedCarriers.length && !matchedBenadmin.length) {
      this.el.providerList.innerHTML = '<div class="picker-empty">No results</div>';
      return;
    }

    let html = '';

    if (matchedCarriers.length) {
      html += '<div class="picker-group-label">Carriers</div>';
      for (const p of matchedCarriers) {
        const sel = p.id === this.providerValue ? ' selected' : '';
        html += `<div class="picker-option${sel}" data-value="${p.id}" data-text="${p.name}" data-url="${p.url || ''}" data-source="${p.category}">
          <svg class="picker-option-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
          <span>${p.name}</span>
        </div>`;
      }
    }

    if (matchedBenadmin.length) {
      html += '<div class="picker-group-label">BenAdmin</div>';
      for (const p of matchedBenadmin) {
        const sel = p.id === this.providerValue ? ' selected' : '';
        html += `<div class="picker-option${sel}" data-value="${p.id}" data-text="${p.name}" data-url="${p.url || ''}" data-source="${p.category}">
          <svg class="picker-option-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
          <span>${p.name}</span>
        </div>`;
      }
    }

    this.el.providerList.innerHTML = html;
    this.providerFocusIndex = -1;
  }

  openProviderPicker() {
    Picker.closeAll();
    this.providerPickerOpen = true;
    this.el.providerPicker.classList.add('open');
    this.el.providerSearch.value = '';
    this.renderProviderList();
    requestAnimationFrame(() => this.el.providerSearch.focus());
  }

  closeProviderPicker() {
    this.providerPickerOpen = false;
    this.el.providerPicker.classList.remove('open');
    this.providerFocusIndex = -1;
  }

  selectProvider(value, text, source, url) {
    this.providerValue = value;
    this.providerText = text;
    this.providerSource = source;
    this.providerUrl = url;

    this.el.providerLabel.textContent = text || 'Select...';
    this.el.providerLabel.classList.toggle('placeholder', !text);
    this.closeProviderPicker();
    this.onProviderChange();
  }

  clearProvider() {
    this.providerValue = '';
    this.providerText = '';
    this.providerSource = '';
    this.providerUrl = '';
    this.el.providerLabel.textContent = 'Select...';
    this.el.providerLabel.classList.add('placeholder');
    this.currentProviderConfig = null;
  }

  navigateProviderPicker(direction) {
    const options = this.el.providerList.querySelectorAll('.picker-option');
    if (!options.length) return;

    // Remove current focus
    options.forEach(o => o.classList.remove('focused'));

    this.providerFocusIndex += direction;
    if (this.providerFocusIndex < 0) this.providerFocusIndex = options.length - 1;
    if (this.providerFocusIndex >= options.length) this.providerFocusIndex = 0;

    const focused = options[this.providerFocusIndex];
    focused.classList.add('focused');
    focused.scrollIntoView({ block: 'nearest' });
  }

  confirmProviderPicker() {
    const options = this.el.providerList.querySelectorAll('.picker-option');
    const focused = this.providerFocusIndex >= 0 && options[this.providerFocusIndex];
    if (focused) {
      this.selectProvider(
        focused.dataset.value,
        focused.dataset.text,
        focused.dataset.source,
        focused.dataset.url
      );
    }
  }

  async onProviderChange() {
    if (!this.providerValue) {
      this.currentProviderConfig = null;
      return;
    }

    try {
      const res = await fetch(`/api/carriers/${encodeURIComponent(this.providerValue)}?source=${this.providerSource}`);
      const config = await res.json();
      this.currentProviderConfig = config;

      if (config.url) {
        this.el.payloadUrl.value = config.url;
      }
    } catch (e) {
      console.error('Failed to load provider config:', e);
    }
  }

  // Theme
  loadTheme() {
    const theme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', theme);
    this.updateThemeIcon(theme);
  }

  toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    this.updateThemeIcon(next);
  }

  updateThemeIcon(theme) {
    const moonIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;
    const sunIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;
    this.el.themeIcon.innerHTML = theme === 'dark' ? sunIcon : moonIcon;
  }

  // Sidebar
  toggleSidebar() {
    this.el.mainContent.classList.toggle('sidebar-collapsed');
  }

  // App Switcher
  getSelectedApp() {
    const activeBtn = this.el.appSwitcher.querySelector('.app-switcher-btn.active');
    return activeBtn?.dataset.app || 'navigator';
  }

  setSelectedApp(app) {
    this.el.appSwitcher.querySelectorAll('.app-switcher-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.app === app);
    });
  }

  // Advanced Settings (inline toggle)
  toggleAdvancedSettings() {
    this.el.advancedSettings.classList.toggle('expanded');
  }

  collapseAdvancedSettings() {
    this.el.advancedSettings.classList.remove('expanded');
  }

  // Tabs
  switchTab(tabName) {
    if (tabName !== 'live-view') {
      this.exitTheaterMode();
    }

    this.el.tabEditor.classList.toggle('active', tabName === 'task');
    this.el.tabLiveView.classList.toggle('active', tabName === 'live-view');
    this.el.tabHistory.classList.toggle('active', tabName === 'history');

    this.el.tabContentEditor.classList.toggle('active', tabName === 'task');
    this.el.tabContentLiveView.classList.toggle('active', tabName === 'live-view');
    this.el.tabContentHistory.classList.toggle('active', tabName === 'history');

    if (tabName === 'history') {
      this.loadHistory();
    }
  }

  setTabStatus(status) {
    this.el.tabLiveStatus.className = 'tab-status' + (status ? ` ${status}` : '');
  }

  // Theater Mode
  toggleTheaterMode() {
    this.theaterMode = !this.theaterMode;
    this.el.runningState.classList.toggle('theater-mode', this.theaterMode);
    this.el.panelRight.classList.toggle('theater-mode-active', this.theaterMode);

    this.el.theaterExpandIcon.style.display = this.theaterMode ? 'none' : 'block';
    this.el.theaterCollapseIcon.style.display = this.theaterMode ? 'block' : 'none';
    this.el.theaterModeBtn.title = this.theaterMode ? 'Exit theater mode (Esc)' : 'Theater mode (T)';

    if (this.theaterMode) {
      this.sidebarWasVisible = !this.el.mainContent.classList.contains('sidebar-collapsed');
      this.el.mainContent.classList.add('sidebar-collapsed');
      this.showTheaterHint();
    } else {
      if (this.sidebarWasVisible) {
        this.el.mainContent.classList.remove('sidebar-collapsed');
      }
    }
  }

  showTheaterHint() {
    const hint = document.querySelector('.theater-exit-hint');
    if (hint) {
      hint.classList.add('visible');
      clearTimeout(this.theaterHintTimeout);
      this.theaterHintTimeout = setTimeout(() => hint.classList.remove('visible'), 2500);
    }
  }

  exitTheaterMode() {
    if (this.theaterMode) {
      this.theaterMode = false;
      this.el.runningState.classList.remove('theater-mode');
      this.el.panelRight.classList.remove('theater-mode-active');
      this.el.theaterExpandIcon.style.display = 'block';
      this.el.theaterCollapseIcon.style.display = 'none';
      this.el.theaterModeBtn.title = 'Theater mode (T)';

      const hint = document.querySelector('.theater-exit-hint');
      if (hint) {
        hint.classList.remove('visible');
        clearTimeout(this.theaterHintTimeout);
      }

      if (this.sidebarWasVisible) {
        this.el.mainContent.classList.remove('sidebar-collapsed');
      }
    }
  }

  // Payloads (Tasks)
  async loadPayloads() {
    try {
      const app = this.getSelectedApp();
      const res = await fetch(`/api/payloads?app=${app}`);
      const payloads = await res.json();

      if (!payloads.length) {
        this.el.payloadList.innerHTML = '<div class="task-empty-state">No tasks found</div>';
        return;
      }

      // Filter out markdown files - only show JSON tasks
      const tasks = payloads.filter(p => {
        const name = typeof p === 'string' ? p : p.name;
        return name.endsWith('.json');
      });

      if (!tasks.length) {
        this.el.payloadList.innerHTML = '<div class="task-empty-state">No tasks found</div>';
        return;
      }

      this.el.payloadList.innerHTML = tasks.map(p => {
        const name = typeof p === 'string' ? p : p.name;
        const displayName = name
            .replace(/^shared\//, '')
            .replace(/\.json$/, '')
            .replace(/_/g, ' ');

        return `
          <div class="task-item" data-name="${name}">
            <span class="task-item-icon"></span>
            <span class="task-item-name">${displayName}</span>
          </div>
        `;
      }).join('');
    } catch (e) {
      this.el.payloadList.innerHTML = '<div class="task-empty-state">Error loading tasks</div>';
    }
  }

  filterTasks() {
    const query = this.el.taskSearchInput.value.toLowerCase().trim();
    const items = this.el.payloadList.querySelectorAll('.task-item');
    items.forEach(item => {
      if (!query) {
        item.style.display = '';
        return;
      }
      const name = (item.querySelector('.task-item-name')?.textContent || '').toLowerCase();
      item.style.display = name.includes(query) ? '' : 'none';
    });
  }

  async selectPayload(name) {
    try {
      // Switch to the task tab when selecting a payload
      this.switchTab('task');

      const app = this.getSelectedApp();
      const res = await fetch(`/api/payloads/${encodeURIComponent(name)}?app=${app}`);
      const payload = await res.json();

      this.selectedPayload = name;
      this.originalPayload = payload;
      this.isNewPayload = false;

      // Show config form, hide empty state
      this.el.taskConfigEmpty.style.display = 'none';
      this.el.taskConfigForm.style.display = 'flex';

      // Handle markdown files (shouldn't happen since we filter them out)
      if (payload.type === 'markdown') {
        this.el.runBtn.disabled = true;
        return;
      }

      // Load form values
      this.el.payloadUrl.value = payload.url || '';
      this.el.payloadInstruction.value = payload.instruction || this.masterPrompt || '';

      const vars = payload.variables || {};

      // Set provider (set state without triggering onProviderChange twice)
      if (vars.carrier) {
        const match = (this.providers || []).find(p => p.id === vars.carrier || p.name === vars.carrier);
        if (match) {
          this.providerValue = match.id;
          this.providerText = match.name;
          this.providerSource = match.category;
          this.providerUrl = match.url || '';
          this.el.providerLabel.textContent = match.name;
          this.el.providerLabel.classList.remove('placeholder');
        }
        await this.onProviderChange();
        if (payload.url) {
          this.el.payloadUrl.value = payload.url;
        }
      } else {
        this.clearProvider();
      }

      this.el.varClientName.value = vars.clientName || '';
      this.el.varGroupNumber.value = vars.groupNumber || '';
      this.monthPicker.value = vars.invoiceMonth || '';
      this.el.varInvoiceYear.value = vars.invoiceYear || '';
      this.el.maxSteps.value = payload.maxSteps || '';
      this.modelPicker.value = payload.agentModel || '';
      this.el.stagehandModel.value = payload.model || '';
      this.proxyPicker.value = payload.proxyType || '';
      this.locationPicker.value = payload.proxyCountry || '';
      this.el.profileName.value = payload.profileName || '';
      this.updateProxyCountryVisibility();

      // Reset credentials
      this.el.varUsername.value = '';
      this.el.varPassword.value = '';
      this.el.varTotpSecret.value = '';
      this.clearCredentialsFlag = false;

      // Update task list selection
      document.querySelectorAll('#payload-list .task-item').forEach(item => {
        item.classList.toggle('active', item.dataset.name === name);
      });

      // Update task header and action bar
      const displayName = name.replace(/\.json$/, '').replace(/_/g, ' ');
      this.el.taskHeaderTitle.textContent = displayName;
      this.el.actionBarTask.textContent = displayName;
      this.el.actionBarStatus.textContent = '';

      // Update instructions UI
      this.updateInstructionsStatus();
      this.collapseAdvancedSettings();

      // Enable buttons
      this.el.runBtn.disabled = false;
      this.el.saveBtn.disabled = false;
      this.el.updateBtn.disabled = false;
    } catch (e) {
      this.setStatus('error', 'Load failed');
    }
  }

  newPayload() {
    this.selectedPayload = null;
    this.originalPayload = null;
    this.isNewPayload = true;

    // Show config form
    this.el.taskConfigEmpty.style.display = 'none';
    this.el.taskConfigForm.style.display = 'flex';

    // Reset all fields
    this.el.payloadUrl.value = '';
    this.el.payloadInstruction.value = this.masterPrompt || '';
    this.clearProvider();
    this.el.varClientName.value = '';
    this.el.varGroupNumber.value = '';
    this.monthPicker.value = '';
    this.el.varInvoiceYear.value = '';
    this.el.maxSteps.value = '';
    this.modelPicker.value = '';
    this.el.stagehandModel.value = '';
    this.proxyPicker.value = '';
    this.locationPicker.value = '';
    this.el.profileName.value = '';
    this.updateProxyCountryVisibility();

    this.el.varUsername.value = '';
    this.el.varPassword.value = '';
    this.el.varTotpSecret.value = '';
    this.clearCredentialsFlag = false;

    // Clear selection
    document.querySelectorAll('#payload-list .task-item').forEach(item => item.classList.remove('active'));

    // Update task header and action bar
    this.el.taskHeaderTitle.textContent = 'New Task';
    this.el.actionBarTask.textContent = 'New task';
    this.el.actionBarStatus.textContent = 'Unsaved';

    // Update instructions and settings
    this.updateInstructionsStatus();
    this.collapseAdvancedSettings();

    // Update buttons
    this.el.runBtn.disabled = true;
    this.el.saveBtn.disabled = false;
    this.el.updateBtn.disabled = true;
    this.openProviderPicker();
  }

  // Proxy
  updateProxyCountryVisibility() {
    const hasProxy = this.proxyPicker.value !== '';
    this.el.proxyCountryGroup.style.display = hasProxy ? 'block' : 'none';
    if (!hasProxy) {
      this.locationPicker.value = '';
    }
  }

  // App visibility
  updateAppVisibility() {
    const app = this.getSelectedApp();
    const isStagehandApp = app === 'driver' || app === 'old';

    document.querySelectorAll('.driver-only').forEach(el => {
      el.style.display = isStagehandApp ? '' : 'none';
    });

    if (!isStagehandApp && this.modelPicker.value?.startsWith('anthropic/')) {
      this.modelPicker.value = '';
    }
  }

  async onAppChange() {
    this.updateAppVisibility();
    this.el.taskSearchInput.value = '';
    this.selectedPayload = null;
    this.originalPayload = null;
    this.isNewPayload = false;

    // Show empty state
    this.el.taskConfigEmpty.style.display = 'flex';
    this.el.taskConfigForm.style.display = 'none';

    // Reset buttons and action bar
    this.el.runBtn.disabled = true;
    this.el.updateBtn.disabled = true;
    this.el.actionBarTask.textContent = 'No task selected';
    this.el.actionBarStatus.textContent = '';

    await this.loadPayloads();
  }

  // Credentials
  clearStoredCredentials() {
    this.clearCredentialsFlag = true;
    this.el.varUsername.value = '';
    this.el.varPassword.value = '';
    this.el.varTotpSecret.value = '';
  }

  // Run
  async run() {
    if (this.isRunning) return;

    if (this.isNewPayload || !this.selectedPayload) {
      this.openSaveModal();
      return;
    }

    this.isRunning = true;
    this.abortController = new AbortController();
    this.lastCompletedSessionId = null;
    this.lastCompletedApp = null;

    this.setStatus('running', 'Running...');
    this.el.runBtn.disabled = true;
    this.el.runBtn.classList.add('running');
    this.el.runBtnText.textContent = 'Running...';
    this.el.stopBtn.style.display = 'flex';
    this.el.actionBarStatus.textContent = '';
    this.el.outputLog.textContent = '';

    this.switchTab('live-view');
    this.setTabStatus('running');
    this.el.liveViewIdle.style.display = 'none';
    this.el.runningState.style.display = 'flex';
    this.el.resultsSection.style.display = 'none';

    this.el.liveViewPlaceholder.textContent = 'Waiting for browser...';
    this.el.liveViewPlaceholder.style.display = 'flex';
    this.el.liveViewIframe.classList.remove('active');
    this.el.liveViewIframe.src = 'about:blank';
    this.el.liveViewStatus.textContent = 'Connecting...';
    this.el.liveViewLink.style.display = 'none';

    try {
      const res = await fetch('/api/invoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app: this.getSelectedApp(),
          payloadName: this.selectedPayload,
          ...(this.providerValue && { carrier: this.providerValue }),
          variableOverrides: {
            ...(this.providerValue ? { carrier: this.providerText } : {}),
            clientName: this.el.varClientName.value,
            groupNumber: this.el.varGroupNumber.value,
            invoiceMonth: this.monthPicker.value,
            invoiceYear: this.el.varInvoiceYear.value,
            ...(this.el.varUsername.value && { username: this.el.varUsername.value }),
            ...(this.el.varPassword.value && { password: this.el.varPassword.value }),
            ...(this.el.varTotpSecret.value && { totpSecret: this.el.varTotpSecret.value }),
          },
          ...(this.proxyPicker.value && { proxyType: this.proxyPicker.value }),
          ...(this.locationPicker.value && { proxyCountry: this.locationPicker.value }),
          ...(this.el.profileName.value && { profileName: this.el.profileName.value }),
          ...(this.el.maxSteps.value && { maxSteps: parseInt(this.el.maxSteps.value, 10) }),
          ...(this.modelPicker.value && { agentModel: this.modelPicker.value }),
          ...(this.el.stagehandModel.value && { model: this.el.stagehandModel.value }),
        }),
        signal: this.abortController.signal,
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (line.startsWith('event:')) {
            currentEvent = line.substring(6).trim();
          } else if (line.startsWith('data:')) {
            try {
              const data = JSON.parse(line.substring(5));
              this.handleEvent(currentEvent, data);
            } catch {}
          }
        }
      }
    } catch (e) {
      if (e.name === 'AbortError') {
        this.log('\n--- Stopped ---\n', 'info');
        this.setStatus('error', 'Stopped');
        this.setTabStatus('error');
      } else {
        this.log(`\nError: ${e.message}\n`, 'stderr');
        this.setStatus('error', 'Error');
        this.setTabStatus('error');
      }
    } finally {
      this.isRunning = false;
      this.el.runBtn.disabled = false;
      this.el.runBtn.classList.remove('running');
      this.el.runBtnText.textContent = 'Run';
      this.el.stopBtn.style.display = 'none';
      this.el.actionBarStatus.textContent = '';
    }
  }

  handleEvent(event, data) {
    switch (event) {
      case 'started':
        this.log(`Starting: ${data.payloadName}\n`, 'info');
        break;

      case 'output':
        const cls = data.type === 'stderr' ? (data.text.includes('INFO') ? 'info' : 'stderr') : '';
        this.log(data.text, cls);
        break;

      case 'liveViewUrl':
        this.el.liveViewPlaceholder.style.display = 'none';
        this.el.liveViewIframe.src = data.url;
        this.el.liveViewIframe.classList.add('active');
        this.el.liveViewStatus.textContent = 'Connected';
        this.el.liveViewLink.href = data.url;
        this.el.liveViewLink.style.display = 'inline';
        break;

      case 'complete':
        this.exitTheaterMode();
        this.el.liveViewIframe.classList.remove('active');
        this.el.liveViewIframe.src = 'about:blank';
        this.el.liveViewPlaceholder.textContent = 'Session ended';
        this.el.liveViewPlaceholder.style.display = 'flex';
        this.el.liveViewStatus.textContent = 'Completed';

        const resultStatus = data.result?.result?.status;
        const isSuccess = data.exitCode === 0 && resultStatus === 'success';

        if (isSuccess) {
          this.log('\n--- Completed ---\n', 'info');
          this.setStatus('success', 'Done');
          this.setTabStatus('complete');
        } else if (data.exitCode !== 0) {
          this.log(`\n--- Exit code: ${data.exitCode} ---\n`, 'stderr');
          this.setStatus('error', `Exit ${data.exitCode}`);
          this.setTabStatus('error');
        } else {
          this.log('\n--- Completed with issues ---\n', 'stderr');
          this.setStatus('error', resultStatus || 'Failed');
          this.setTabStatus('error');
        }

        if (data.result) this.showResult(data.result);
        break;

      case 'error':
        this.log(`\nError: ${data.message}\n`, 'stderr');
        this.setStatus('error', 'Error');
        this.setTabStatus('error');
        break;

      case 'historySaved':
        this.lastCompletedSessionId = data.sessionId;
        this.lastCompletedApp = data.app;
        break;

      case 'fileDownloaded':
        this.log(`\n📁 File saved: ${data.filename} (${this.formatSize(data.size)})\n`, 'info');
        break;
    }
  }

  formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  stripAnsi(text) {
    return text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').replace(/\[([0-9;]+)m/g, '');
  }

  log(text, cls = '') {
    const span = document.createElement('span');
    if (cls) span.className = cls;
    span.textContent = this.stripAnsi(text);
    this.el.outputLog.appendChild(span);

    if (this.isNearBottom()) {
      this.el.outputLog.scrollTop = this.el.outputLog.scrollHeight;
    }
    this.updateScrollButton();
  }

  isNearBottom() {
    const el = this.el.outputLog;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 100;
  }

  updateScrollButton() {
    if (this.el.scrollBottomBtn) {
      this.el.scrollBottomBtn.style.display = this.isNearBottom() ? 'none' : 'flex';
    }
  }

  scrollToBottom() {
    this.el.outputLog.scrollTop = this.el.outputLog.scrollHeight;
    this.updateScrollButton();
  }

  async copyOutput() {
    const text = this.el.outputLog.textContent;
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      const btn = this.el.copyOutputBtn;
      btn.textContent = 'Copied!';
      btn.classList.add('btn-success');
      setTimeout(() => {
        btn.textContent = 'Copy';
        btn.classList.remove('btn-success');
      }, 1500);
    } catch (e) {
      this.setStatus('error', 'Copy failed');
    }
  }

  showResult(result) {
    if (!result) return;

    this.el.resultsSection.style.display = 'block';
    const c = this.el.resultsContainer;
    c.innerHTML = '';

    if (result.result) {
      const status = result.result.status;
      const div = document.createElement('div');
      div.className = `result-status ${status === 'success' ? 'success' : 'error'}`;
      div.innerHTML = `<strong>Status:</strong> ${status}`;
      c.appendChild(div);

      if (result.result.message) {
        const msg = document.createElement('div');
        msg.className = 'result-status';
        msg.textContent = result.result.message;
        c.appendChild(msg);
      }
    }

    // "View Run Details" button — links to history detail for this session
    if (this.lastCompletedSessionId) {
      const actions = document.createElement('div');
      actions.className = 'result-actions';

      const btn = document.createElement('button');
      btn.className = 'btn btn-view-details';
      btn.innerHTML = `
        <span>View Run Details</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      `;
      btn.addEventListener('click', () => {
        this.switchTab('history');
        this.viewHistoryDetail(this.lastCompletedSessionId, this.lastCompletedApp);
      });

      actions.appendChild(btn);
      c.appendChild(actions);
    }
  }

  stop() {
    if (this.abortController) this.abortController.abort();
  }

  setStatus(type, text) {
    this.el.status.className = `status-indicator ${type}`;
    this.el.statusText.textContent = text;

    if (type !== 'running') {
      setTimeout(() => {
        if (!this.isRunning) {
          this.el.status.className = 'status-indicator';
          this.el.statusText.textContent = 'Ready';
        }
      }, 3000);
    }
  }

  // Save
  openSaveModal() {
    this.el.saveNameInput.value = this.isNewPayload ? 'new_task' :
        (this.selectedPayload?.replace('.json', '') + '_copy') || 'task';
    this.el.saveModal.classList.add('active');
    this.el.saveNameInput.focus();
    this.el.saveNameInput.select();
  }

  closeSaveModal() {
    this.el.saveModal.classList.remove('active');
  }

  async update() {
    if (!this.selectedPayload) {
      this.setStatus('error', 'No task selected');
      return;
    }

    const originalText = this.el.updateBtn.textContent;
    this.el.updateBtn.textContent = 'Saving...';
    this.el.updateBtn.disabled = true;

    try {
      const instructionMatchesMaster = this.instructionMatchesMaster();

      const res = await fetch('/api/payloads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app: this.getSelectedApp(),
          name: this.selectedPayload,
          payload: {
            ...(this.el.payloadUrl.value && this.el.payloadUrl.value !== this.currentProviderConfig?.url && { url: this.el.payloadUrl.value }),
            ...(!instructionMatchesMaster && { instruction: this.el.payloadInstruction.value }),
            maxSteps: this.el.maxSteps.value ? parseInt(this.el.maxSteps.value, 10) : (this.originalPayload?.maxSteps || 50),
            ...(this.modelPicker.value && { agentModel: this.modelPicker.value }),
            ...(this.el.stagehandModel.value && { model: this.el.stagehandModel.value }),
            ...(this.proxyPicker.value && { proxyType: this.proxyPicker.value }),
            ...(this.locationPicker.value && { proxyCountry: this.locationPicker.value }),
            ...(this.el.profileName.value && { profileName: this.el.profileName.value }),
            variables: {
              ...(this.originalPayload?.variables || {}),
              ...(this.providerValue && { carrier: this.providerText }),
              ...(this.el.varClientName.value && { clientName: this.el.varClientName.value }),
              ...(this.el.varGroupNumber.value && { groupNumber: this.el.varGroupNumber.value }),
              ...(this.monthPicker.value && { invoiceMonth: this.monthPicker.value }),
              ...(this.el.varInvoiceYear.value && { invoiceYear: this.el.varInvoiceYear.value }),
              ...(this.clearCredentialsFlag
                ? { username: '__CLEAR__', password: '__CLEAR__', totpSecret: '__CLEAR__' }
                : {
                    ...(this.el.varUsername.value && { username: this.el.varUsername.value }),
                    ...(this.el.varPassword.value && { password: this.el.varPassword.value }),
                    ...(this.el.varTotpSecret.value && { totpSecret: this.el.varTotpSecret.value }),
                  }),
            },
          },
          originalName: this.selectedPayload,
        }),
      });

      if (!res.ok) {
        this.el.updateBtn.textContent = originalText;
        this.el.updateBtn.disabled = false;
        this.setStatus('error', 'Save failed');
        return;
      }

      this.el.updateBtn.textContent = 'Saved!';
      this.el.updateBtn.classList.add('btn-success');
      this.setStatus('success', 'Saved');

      // Refresh internal payload reference without reloading the form
      try {
        const refreshRes = await fetch(`/api/payloads/${encodeURIComponent(this.selectedPayload)}?app=${this.getSelectedApp()}`);
        if (refreshRes.ok) {
          this.originalPayload = await refreshRes.json();
        }
      } catch { /* keep existing reference */ }

      setTimeout(() => {
        this.el.updateBtn.textContent = originalText;
        this.el.updateBtn.classList.remove('btn-success');
        this.el.updateBtn.disabled = false;
      }, 1500);
    } catch {
      this.el.updateBtn.textContent = originalText;
      this.el.updateBtn.disabled = false;
      this.setStatus('error', 'Save failed');
    }
  }

  async save() {
    const name = this.el.saveNameInput.value.trim();
    if (!name) return;

    const fileName = name.endsWith('.json') ? name : `${name}.json`;
    const instructionMatchesMaster = this.instructionMatchesMaster();

    try {
      const res = await fetch('/api/payloads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app: this.getSelectedApp(),
          name: fileName,
          payload: {
            ...(this.el.payloadUrl.value && this.el.payloadUrl.value !== this.currentProviderConfig?.url && { url: this.el.payloadUrl.value }),
            ...(!instructionMatchesMaster && { instruction: this.el.payloadInstruction.value }),
            maxSteps: this.el.maxSteps.value ? parseInt(this.el.maxSteps.value, 10) : 50,
            ...(this.modelPicker.value && { agentModel: this.modelPicker.value }),
            ...(this.el.stagehandModel.value && { model: this.el.stagehandModel.value }),
            ...(this.proxyPicker.value && { proxyType: this.proxyPicker.value }),
            ...(this.locationPicker.value && { proxyCountry: this.locationPicker.value }),
            ...(this.el.profileName.value && { profileName: this.el.profileName.value }),
            variables: {
              ...(this.providerValue && { carrier: this.providerText }),
              ...(this.el.varClientName.value && { clientName: this.el.varClientName.value }),
              ...(this.el.varGroupNumber.value && { groupNumber: this.el.varGroupNumber.value }),
              ...(this.monthPicker.value && { invoiceMonth: this.monthPicker.value }),
              ...(this.el.varInvoiceYear.value && { invoiceYear: this.el.varInvoiceYear.value }),
              ...(this.el.varUsername.value && { username: this.el.varUsername.value }),
              ...(this.el.varPassword.value && { password: this.el.varPassword.value }),
              ...(this.el.varTotpSecret.value && { totpSecret: this.el.varTotpSecret.value }),
            },
          },
        }),
      });

      if (!res.ok) {
        this.setStatus('error', 'Save failed');
        return;
      }

      this.closeSaveModal();
      this.setStatus('success', 'Saved');
      await this.loadPayloads();
      await this.selectPayload(fileName);
    } catch {
      this.setStatus('error', 'Save failed');
    }
  }

  // Results Panel
  openResultsPanel() {
    this.el.resultsPanel.classList.add('active');
    this.el.resultsPanelOverlay.classList.add('active');
    this.loadResults();
  }

  closeResultsPanel() {
    this.el.resultsPanel.classList.remove('active');
    this.el.resultsPanelOverlay.classList.remove('active');
  }

  filterResults() {
    const query = this.el.resultsSearchInput.value.toLowerCase().trim();
    const sessions = this.el.resultsPanelContent.querySelectorAll('.results-session');
    sessions.forEach(session => {
      if (!query) {
        session.classList.remove('search-hidden');
        return;
      }
      const text = session.textContent.toLowerCase();
      session.classList.toggle('search-hidden', !text.includes(query));
    });
  }

  async loadResults() {
    const container = this.el.resultsPanelContent;
    const app = this.getSelectedApp();
    container.innerHTML = `<div class="empty-results"><div class="empty-results-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg></div><h4>Loading...</h4></div>`;

    try {
      const res = await fetch(`/api/sessions?app=${app}`);
      const sessions = await res.json();

      const sessionsWithFiles = sessions.filter(s => s.files && s.files.length > 0);

      if (!sessionsWithFiles.length) {
        container.innerHTML = `<div class="empty-results"><div class="empty-results-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg></div><h4>No files yet</h4><p>Downloaded files will appear here</p></div>`;
        return;
      }

      container.innerHTML = `
        <div class="results-session-list">
          ${sessionsWithFiles.map(session => `
            <div class="results-session" data-session-id="${session.id}" data-app="${app}">
              <div class="results-session-header">
                <span class="results-session-name">${session.payloadName?.replace('.json', '') || 'Session'}</span>
                <span class="results-session-date">${this.formatDate(session.timestamp)}</span>
                <a class="results-session-link" data-session-id="${session.id}" data-app="${app}" title="View session details">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="9 18 15 12 9 6"></polyline>
                  </svg>
                </a>
              </div>
              <div class="results-file-list">
                ${session.files.map(file => `
                  <div class="results-file-item">
                    <div class="results-file-icon">${this.getFileIcon(file.filename)}</div>
                    <div class="results-file-info">
                      <div class="results-file-name" title="${file.filename}">${file.filename}</div>
                      <div class="results-file-meta">${this.formatSize(file.size)}</div>
                    </div>
                    <div class="results-file-actions">
                      <a href="/api/sessions/${session.id}/files/${encodeURIComponent(file.filename)}?app=${app}" class="btn btn-sm" download>Download</a>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      `;

      // Bind session link clicks
      container.querySelectorAll('.results-session-link').forEach(link => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          const sessionId = link.dataset.sessionId;
          const sessionApp = link.dataset.app;
          this.closeResultsPanel();
          this.switchTab('history');
          this.viewHistoryDetail(sessionId, sessionApp);
        });
      });
    } catch (e) {
      container.innerHTML = `<div class="empty-results"><h4>Error loading files</h4></div>`;
    }
  }

  getFileIcon(filename) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;
  }

  formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // History
  getStatusInfo(session) {
    const isSuccess = session.exitCode === 0 && session.result?.status !== 'error' && session.result?.status !== 'login_failed';
    if (isSuccess && session.result?.status === 'success') {
      return { label: 'Completed Successfully', cssClass: 'success' };
    } else if (isSuccess) {
      return { label: 'Completed', cssClass: 'success' };
    } else {
      return { label: 'Failed', cssClass: 'error' };
    }
  }

  getResultMessage(session) {
    if (!session.result) return '';
    return session.result.message || session.result.reason || '';
  }

  async loadHistory() {
    const container = this.el.historyList;
    const app = this.getSelectedApp();
    container.innerHTML = `<div class="empty-history"><div class="empty-history-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg></div><h4>Loading...</h4></div>`;

    this.el.historyDetail.style.display = 'none';
    document.querySelector('.history-container').style.display = 'flex';

    try {
      const res = await fetch(`/api/sessions?app=${app}`);
      const sessions = await res.json();

      if (!sessions.length) {
        container.innerHTML = `<div class="empty-history"><div class="empty-history-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg></div><h4>No sessions yet</h4><p>Run history will appear here after tasks complete</p></div>`;
        return;
      }

      container.innerHTML = sessions.map(session => {
        const status = this.getStatusInfo(session);
        const message = this.getResultMessage(session);
        return `
          <div class="history-item ${status.cssClass === 'success' ? 'has-success' : 'has-error'}" data-session-id="${session.id}" data-app="${app}">
            <div class="history-item-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="23 7 16 12 23 17 23 7"></polygon>
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
              </svg>
            </div>
            <div class="history-item-info">
              <div class="history-item-title">${session.payloadName?.replace('.json', '') || 'Unknown'}</div>
              <div class="history-item-meta">
                <span>${this.formatDate(session.timestamp)}</span>
                <span class="history-item-status ${status.cssClass}">
                  ${status.cssClass === 'success' ? '✓ Success' : '✗ Failed'}
                </span>
                ${session.files?.length ? `<span class="history-item-files">${session.files.length} file${session.files.length > 1 ? 's' : ''}</span>` : ''}
              </div>
              ${message ? `<div class="history-item-result">${this.escapeHtml(message)}</div>` : ''}
            </div>
            <svg class="history-item-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </div>
        `;
      }).join('');
    } catch (e) {
      container.innerHTML = `<div class="empty-history"><h4>Error loading history</h4></div>`;
    }
  }

  filterHistory() {
    const query = this.el.historySearchInput.value.toLowerCase().trim();
    const items = this.el.historyList.querySelectorAll('.history-item');
    items.forEach(item => {
      if (!query) {
        item.classList.remove('search-hidden');
        return;
      }
      const text = item.textContent.toLowerCase();
      item.classList.toggle('search-hidden', !text.includes(query));
    });
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  async viewHistoryDetail(sessionId, app) {
    const appName = app || this.getSelectedApp();
    this.currentHistoryApp = appName;
    this.currentHistorySessionId = sessionId;

    try {
      const res = await fetch(`/api/sessions/${sessionId}?app=${appName}`);
      const session = await res.json();

      document.querySelector('.history-container').style.display = 'none';
      this.el.historyDetail.style.display = 'flex';

      // 1. Status Hero Card
      const status = this.getStatusInfo(session);
      const message = this.getResultMessage(session);

      this.el.runStatusCard.className = `run-status-card ${status.cssClass}`;
      this.el.runStatusLabel.textContent = status.label;
      this.el.runTitle.textContent = session.payloadName?.replace('.json', '') || 'Session';
      this.el.runMeta.innerHTML = `
        <span>${this.formatDate(session.timestamp)}</span>
        <span class="run-meta-separator">·</span>
        <span class="run-app-badge">${appName}</span>
      `;
      this.el.runMessage.textContent = message;

      // View Online button
      if (session.replayViewUrl) {
        this.el.runActions.innerHTML = `
          <a href="${session.replayViewUrl}" target="_blank" class="btn btn-sm" title="View replay online (expires after 30 days)">
            View Online
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-left: 4px;">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
              <polyline points="15 3 21 3 21 9"></polyline>
              <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
          </a>
        `;
      } else {
        this.el.runActions.innerHTML = '';
      }

      // 2. Files Section
      const files = session.files || [];
      if (files.length) {
        this.el.runFilesSection.style.display = 'flex';
        this.el.runFilesCount.textContent = files.length;
        this.el.runFilesList.innerHTML = files.map(file => {
          const isPdf = file.filename.toLowerCase().endsWith('.pdf');
          return `
            <div class="run-file-item">
              <div class="run-file-icon">
                ${isPdf
                  ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>`
                  : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`
                }
              </div>
              <div class="run-file-info">
                <div class="run-file-name">${this.escapeHtml(file.filename)}</div>
                <div class="run-file-size">${this.formatSize(file.size)}</div>
              </div>
              <div class="run-file-actions">
                <a href="/api/sessions/${sessionId}/files/${encodeURIComponent(file.filename)}?app=${appName}&view=true" target="_blank" class="btn btn-sm">View</a>
                <a href="/api/sessions/${sessionId}/files/${encodeURIComponent(file.filename)}?app=${appName}" class="btn btn-sm" download>Download</a>
              </div>
            </div>
          `;
        }).join('');
      } else {
        this.el.runFilesSection.style.display = 'none';
      }

      // 3. Recording Section
      this.el.historyVideo.pause();
      this.el.historyVideo.src = '';
      if (session.hasRecording) {
        const recordingUrl = `/api/sessions/${sessionId}/recording?app=${appName}`;
        this.el.runRecordingContent.style.display = 'block';
        this.el.runRecordingEmpty.style.display = 'none';
        this.el.historyVideo.src = recordingUrl;
        this.el.historyDownloadRecordingLink.href = recordingUrl;
        this.el.historyDownloadRecordingLink.download = `recording_${sessionId}.mp4`;
      } else {
        this.el.runRecordingContent.style.display = 'none';
        this.el.runRecordingEmpty.style.display = 'flex';
      }

      // 4. Log Section — auto-fetch and show preview
      this.el.runLogPreview.textContent = '';
      this.el.runLogFull.textContent = '';
      this.el.runLogFull.style.display = 'none';
      this.el.runLogPreview.style.display = 'block';
      this.el.runLogExpandBtn.style.display = 'inline-flex';
      this.el.runLogExpandBtn.textContent = 'Show Full Log';
      this.currentFullLog = '';

      try {
        const logRes = await fetch(`/api/sessions/${sessionId}/log?app=${appName}`);
        const log = this.stripAnsi(await logRes.text());
        this.currentFullLog = log;

        // Show last 8 lines as preview
        const lines = log.split('\n');
        const previewLines = lines.slice(-8).join('\n');
        this.el.runLogPreview.textContent = previewLines;

        if (lines.length <= 8) {
          this.el.runLogExpandBtn.style.display = 'none';
          // Remove fade gradient for short logs
          this.el.runLogPreview.style.maxHeight = 'none';
        }
      } catch (e) {
        this.el.runLogPreview.textContent = 'Failed to load log';
        this.el.runLogExpandBtn.style.display = 'none';
      }
    } catch (e) {
      this.setStatus('error', 'Failed to load session');
    }
  }

  toggleLogExpand() {
    if (this.el.runLogFull.style.display === 'none') {
      this.el.runLogFull.textContent = this.currentFullLog;
      this.el.runLogFull.style.display = 'block';
      this.el.runLogPreview.style.display = 'none';
      this.el.runLogExpandBtn.textContent = 'Collapse Log';
    } else {
      this.el.runLogFull.style.display = 'none';
      this.el.runLogPreview.style.display = 'block';
      this.el.runLogExpandBtn.textContent = 'Show Full Log';
    }
  }

  async copyHistoryLog() {
    const text = this.currentFullLog || this.el.runLogPreview.textContent;
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      const btn = this.el.historyCopyLogBtn;
      btn.textContent = 'Copied!';
      btn.classList.add('btn-success');
      setTimeout(() => {
        btn.textContent = 'Copy';
        btn.classList.remove('btn-success');
      }, 1500);
    } catch (e) {
      this.setStatus('error', 'Copy failed');
    }
  }

  hideHistoryDetail() {
    this.el.historyDetail.style.display = 'none';
    document.querySelector('.history-container').style.display = 'flex';
    this.el.historyVideo.pause();
    this.el.historyVideo.src = '';
  }

  bindEvents() {
    // Sidebar & theme
    this.el.sidebarToggle.addEventListener('click', () => this.toggleSidebar());
    this.el.themeToggle.addEventListener('click', () => this.toggleTheme());

    // Task list
    this.el.newPayloadBtn.addEventListener('click', () => this.newPayload());
    this.el.refreshBtn.addEventListener('click', () => this.loadPayloads());
    this.el.taskSearchInput.addEventListener('input', () => this.filterTasks());
    this.el.payloadList.addEventListener('click', e => {
      const item = e.target.closest('.task-item');
      if (item?.dataset.name) this.selectPayload(item.dataset.name);
    });

    // Instructions
    this.el.instructionsResetBtn.addEventListener('click', () => this.resetToMasterPrompt());
    this.el.payloadInstruction.addEventListener('input', () => this.updateInstructionsStatus());

    // Advanced settings (inline)
    this.el.advancedSettingsToggle.addEventListener('click', () => this.toggleAdvancedSettings());

    // Actions
    this.el.runBtn.addEventListener('click', () => this.run());
    this.el.stopBtn.addEventListener('click', () => this.stop());
    this.el.saveBtn.addEventListener('click', () => this.openSaveModal());
    this.el.updateBtn.addEventListener('click', () => this.update());

    // Output
    this.el.copyOutputBtn.addEventListener('click', () => this.copyOutput());
    this.el.clearOutputBtn.addEventListener('click', () => {
      this.el.outputLog.textContent = '';
      this.updateScrollButton();
    });
    this.el.scrollBottomBtn.addEventListener('click', () => this.scrollToBottom());
    this.el.outputLog.addEventListener('scroll', () => this.updateScrollButton());

    // Theater mode
    this.el.theaterModeBtn.addEventListener('click', () => this.toggleTheaterMode());
    this.el.liveViewOverlay.addEventListener('dblclick', () => this.toggleTheaterMode());

    // Tabs
    this.el.tabEditor.addEventListener('click', () => this.switchTab('task'));
    this.el.tabLiveView.addEventListener('click', () => this.switchTab('live-view'));
    this.el.tabHistory.addEventListener('click', () => this.switchTab('history'));

    // History
    this.el.refreshHistoryBtn.addEventListener('click', () => this.loadHistory());
    this.el.historyBackBtn.addEventListener('click', () => this.hideHistoryDetail());
    this.el.historySearchInput.addEventListener('input', () => this.filterHistory());
    this.el.historyCopyLogBtn.addEventListener('click', () => this.copyHistoryLog());
    this.el.runLogExpandBtn.addEventListener('click', () => this.toggleLogExpand());
    this.el.historyList.addEventListener('click', (e) => {
      const item = e.target.closest('.history-item');
      if (item?.dataset.sessionId) this.viewHistoryDetail(item.dataset.sessionId, item.dataset.app);
    });

    // Results panel
    this.el.resultsToggle.addEventListener('click', () => this.openResultsPanel());
    this.el.resultsPanelClose.addEventListener('click', () => this.closeResultsPanel());
    this.el.resultsPanelOverlay.addEventListener('click', () => this.closeResultsPanel());
    this.el.resultsSearchInput.addEventListener('input', () => this.filterResults());

    // Save modal
    this.el.saveCancelBtn.addEventListener('click', () => this.closeSaveModal());
    this.el.saveConfirmBtn.addEventListener('click', () => this.save());
    this.el.saveModal.addEventListener('click', e => {
      if (e.target === this.el.saveModal) this.closeSaveModal();
    });
    this.el.saveNameInput.addEventListener('keypress', e => {
      if (e.key === 'Enter') this.save();
    });

    // Provider picker
    this.el.providerTrigger.addEventListener('click', () => {
      this.providerPickerOpen ? this.closeProviderPicker() : this.openProviderPicker();
    });
    this.el.providerSearch.addEventListener('input', () => {
      this.renderProviderList(this.el.providerSearch.value);
    });
    this.el.providerSearch.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); this.navigateProviderPicker(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); this.navigateProviderPicker(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); this.confirmProviderPicker(); }
      else if (e.key === 'Escape') { this.closeProviderPicker(); }
    });
    this.el.providerList.addEventListener('click', (e) => {
      const option = e.target.closest('.picker-option');
      if (option) {
        this.selectProvider(option.dataset.value, option.dataset.text, option.dataset.source, option.dataset.url);
      }
    });
    document.addEventListener('click', (e) => {
      if (this.providerPickerOpen && !this.el.providerPicker.contains(e.target)) {
        this.closeProviderPicker();
      }
    });

    // Credentials
    if (this.el.clearCredentialsBtn) {
      this.el.clearCredentialsBtn.addEventListener('click', () => this.clearStoredCredentials());
    }

    // App switcher
    this.el.appSwitcher.addEventListener('click', (e) => {
      const btn = e.target.closest('.app-switcher-btn');
      if (btn && !btn.classList.contains('active')) {
        this.setSelectedApp(btn.dataset.app);
        this.onAppChange();
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !this.isRunning) {
        e.preventDefault();
        this.run();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (this.selectedPayload && !this.isNewPayload) {
          this.update();
        } else {
          this.openSaveModal();
        }
      }
      if (e.key === 'Escape') {
        if (this.providerPickerOpen) {
          this.closeProviderPicker();
        } else if ([this.monthPicker, this.modelPicker, this.proxyPicker, this.locationPicker].some(p => p?.isOpen)) {
          [this.monthPicker, this.modelPicker, this.proxyPicker, this.locationPicker].forEach(p => { if (p?.isOpen) p.close(); });
        } else if (this.theaterMode) {
          this.exitTheaterMode();
        } else if (this.el.resultsPanel.classList.contains('active')) {
          this.closeResultsPanel();
        } else if (this.el.saveModal.classList.contains('active')) {
          this.closeSaveModal();
        } else if (this.el.advancedSettings.classList.contains('expanded')) {
          this.collapseAdvancedSettings();
        } else if (this.isRunning) {
          this.stop();
        }
      }
      if (e.key === 't' || e.key === 'T') {
        const target = e.target;
        const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
        const liveViewVisible = this.el.runningState.style.display !== 'none';
        if (!isTyping && liveViewVisible) {
          e.preventDefault();
          this.toggleTheaterMode();
        }
      }
      if (e.key === '[') {
        const target = e.target;
        const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
        if (!isTyping) {
          e.preventDefault();
          this.toggleSidebar();
        }
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', () => new App());
