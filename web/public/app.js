/**
 * CUA 2.0 Playground - Apple-inspired UI
 */

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
    this.instructionsExpanded = false;

    this.el = {
      mainContent: document.getElementById('main-content'),
      sidebarToggle: document.getElementById('sidebar-toggle'),
      themeToggle: document.getElementById('theme-toggle'),
      themeIcon: document.getElementById('theme-icon'),
      payloadList: document.getElementById('payload-list'),
      appSwitcher: document.getElementById('app-switcher'),

      // Task config form
      taskConfigEmpty: document.getElementById('task-config-empty'),
      taskConfigForm: document.getElementById('task-config-form'),

      // Config fields
      payloadUrl: document.getElementById('payload-url'),
      payloadInstruction: document.getElementById('payload-instruction'),
      varCarrier: document.getElementById('var-carrier'),
      varClientName: document.getElementById('var-client-name'),
      varGroupNumber: document.getElementById('var-group-number'),
      varInvoiceMonth: document.getElementById('var-invoice-month'),
      varInvoiceYear: document.getElementById('var-invoice-year'),
      maxSteps: document.getElementById('max-steps'),

      // Models
      agentModel: document.getElementById('agent-model'),
      stagehandModel: document.getElementById('stagehand-model'),

      // Credentials
      credentialsSection: document.getElementById('credentials-section'),
      credentialsDescription: document.getElementById('credentials-description'),
      varUsername: document.getElementById('var-username'),
      varPassword: document.getElementById('var-password'),
      varTotpSecret: document.getElementById('var-totp-secret'),
      clearCredentialsBtn: document.getElementById('clear-credentials-btn'),

      // Proxy settings
      proxyType: document.getElementById('proxy-type'),
      proxyCountry: document.getElementById('proxy-country'),
      proxyCountryGroup: document.getElementById('proxy-country-group'),
      profileName: document.getElementById('profile-name'),

      // Instructions
      instructionsPreview: document.getElementById('instructions-preview'),
      instructionsPreviewContent: document.getElementById('instructions-preview-content'),
      instructionsCustomizeBtn: document.getElementById('instructions-customize-btn'),
      instructionsEditor: document.getElementById('instructions-editor'),
      instructionsStatus: document.getElementById('instructions-status'),
      instructionsStatusText: document.getElementById('instructions-status-text'),
      instructionsResetBtn: document.getElementById('instructions-reset-btn'),
      instructionsCollapseBtn: document.getElementById('instructions-collapse-btn'),

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

      // History
      tabHistory: document.getElementById('tab-history'),
      tabContentHistory: document.getElementById('tab-content-history'),
      historyList: document.getElementById('history-list'),
      refreshHistoryBtn: document.getElementById('refresh-history-btn'),
      historyDetail: document.getElementById('history-detail'),
      historyDetailTitle: document.getElementById('history-detail-title'),
      historyBackBtn: document.getElementById('history-back-btn'),
      historyVideo: document.getElementById('history-video'),
      historyDownloadVideo: document.getElementById('history-download-video'),
      historyDownloadRecordingLink: document.getElementById('history-download-recording-link'),
      historyViewOnline: document.getElementById('history-view-online'),
      historyViewLog: document.getElementById('history-view-log'),
      historyLogContainer: document.getElementById('history-log-container'),
      historyLog: document.getElementById('history-log'),
      historyCopyLogBtn: document.getElementById('history-copy-log-btn'),
    };

    this.init();
  }

  async init() {
    this.loadTheme();
    await this.loadMasterPrompt();
    await this.loadCarriers();
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

    // Update preview content
    const instruction = this.el.payloadInstruction.value || this.masterPrompt || '';
    const preview = instruction.substring(0, 200) + (instruction.length > 200 ? '...' : '');
    this.el.instructionsPreviewContent.textContent = matchesMaster
      ? 'Using default AOP...'
      : preview || 'No AOP configured';
  }

  resetToMasterPrompt() {
    if (this.masterPrompt) {
      this.el.payloadInstruction.value = this.masterPrompt;
      this.updateInstructionsStatus();
    }
  }

  expandInstructions() {
    this.instructionsExpanded = true;
    this.el.instructionsPreview.style.display = 'none';
    this.el.instructionsEditor.style.display = 'block';
    this.el.payloadInstruction.focus();
  }

  collapseInstructions() {
    this.instructionsExpanded = false;
    this.el.instructionsPreview.style.display = 'block';
    this.el.instructionsEditor.style.display = 'none';
    this.updateInstructionsStatus();
  }

  // Carriers
  async loadCarriers() {
    try {
      const res = await fetch('/api/carriers');
      const carriers = await res.json();

      const insuranceCarriers = carriers.filter(c => c.email2faSource === 'carrier');
      const hrPlatforms = carriers.filter(c => c.email2faSource === 'benadmin');

      let optionsHtml = '<option value="">Select carrier...</option>';

      if (insuranceCarriers.length > 0) {
        optionsHtml += '<optgroup label="Insurance Carriers">';
        for (const carrier of insuranceCarriers) {
          optionsHtml += `<option value="${carrier.id}" data-url="${carrier.url}" data-source="${carrier.email2faSource}">${carrier.name}</option>`;
        }
        optionsHtml += '</optgroup>';
      }

      if (hrPlatforms.length > 0) {
        optionsHtml += '<optgroup label="HR Platforms">';
        for (const carrier of hrPlatforms) {
          optionsHtml += `<option value="${carrier.id}" data-url="${carrier.url}" data-source="${carrier.email2faSource}">${carrier.name}</option>`;
        }
        optionsHtml += '</optgroup>';
      }

      this.el.varCarrier.innerHTML = optionsHtml;
      this.carriers = carriers;
    } catch (e) {
      console.error('Failed to load carriers:', e);
    }
  }

  async onCarrierChange() {
    const carrierName = this.el.varCarrier.value;
    if (!carrierName) {
      this.currentCarrierConfig = null;
      return;
    }

    const selectedOption = this.el.varCarrier.selectedOptions[0];
    const source = selectedOption?.dataset?.source || '';

    try {
      const res = await fetch(`/api/carriers/${encodeURIComponent(carrierName)}?source=${source}`);
      const config = await res.json();
      this.currentCarrierConfig = config;

      if (config.url) {
        this.el.payloadUrl.value = config.url;
      }
    } catch (e) {
      console.error('Failed to load carrier config:', e);
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

  async selectPayload(name) {
    try {
      const app = this.getSelectedApp();
      const res = await fetch(`/api/payloads/${encodeURIComponent(name)}?app=${app}`);
      const payload = await res.json();

      this.selectedPayload = name;
      this.originalPayload = payload;
      this.isNewPayload = false;

      // Show config form, hide empty state
      this.el.taskConfigEmpty.style.display = 'none';
      this.el.taskConfigForm.style.display = 'block';

      // Handle markdown files (shouldn't happen since we filter them out)
      if (payload.type === 'markdown') {
        this.el.runBtn.disabled = true;
        return;
      }

      // Load form values
      this.el.payloadUrl.value = payload.url || '';
      this.el.payloadInstruction.value = payload.instruction || this.masterPrompt || '';

      const vars = payload.variables || {};

      // Set carrier
      if (vars.carrier) {
        const carrierSelect = this.el.varCarrier;
        for (const option of carrierSelect.options) {
          if (option.value === vars.carrier || option.text === vars.carrier) {
            carrierSelect.value = option.value;
            break;
          }
        }
        await this.onCarrierChange();
        if (payload.url) {
          this.el.payloadUrl.value = payload.url;
        }
      } else {
        this.el.varCarrier.value = '';
        this.currentCarrierConfig = null;
      }

      this.el.varClientName.value = vars.clientName || '';
      this.el.varGroupNumber.value = vars.groupNumber || '';
      this.el.varInvoiceMonth.value = vars.invoiceMonth || '';
      this.el.varInvoiceYear.value = vars.invoiceYear || '';
      this.el.maxSteps.value = payload.maxSteps || '';
      this.el.agentModel.value = payload.agentModel || '';
      this.el.stagehandModel.value = payload.model || '';
      this.el.proxyType.value = payload.proxyType || '';
      this.el.proxyCountry.value = payload.proxyCountry || '';
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

      // Update action bar
      this.el.actionBarTask.textContent = name.replace(/\.json$/, '').replace(/_/g, ' ');
      this.el.actionBarStatus.textContent = '';

      // Update instructions UI
      this.collapseInstructions();
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
    this.el.taskConfigForm.style.display = 'block';

    // Reset all fields
    this.el.payloadUrl.value = '';
    this.el.payloadInstruction.value = this.masterPrompt || '';
    this.el.varCarrier.value = '';
    this.el.varClientName.value = '';
    this.el.varGroupNumber.value = '';
    this.el.varInvoiceMonth.value = '';
    this.el.varInvoiceYear.value = '';
    this.el.maxSteps.value = '';
    this.el.agentModel.value = '';
    this.el.stagehandModel.value = '';
    this.el.proxyType.value = '';
    this.el.proxyCountry.value = '';
    this.el.profileName.value = '';
    this.updateProxyCountryVisibility();

    this.el.varUsername.value = '';
    this.el.varPassword.value = '';
    this.el.varTotpSecret.value = '';
    this.clearCredentialsFlag = false;

    // Clear selection
    document.querySelectorAll('#payload-list .task-item').forEach(item => item.classList.remove('active'));

    // Update action bar
    this.el.actionBarTask.textContent = 'New task';
    this.el.actionBarStatus.textContent = 'Unsaved';

    // Update instructions and settings
    this.collapseInstructions();
    this.updateInstructionsStatus();
    this.collapseAdvancedSettings();

    // Update buttons
    this.el.runBtn.disabled = true;
    this.el.saveBtn.disabled = false;
    this.el.updateBtn.disabled = true;
    this.el.varCarrier.focus();
  }

  // Proxy
  updateProxyCountryVisibility() {
    const hasProxy = this.el.proxyType.value !== '';
    this.el.proxyCountryGroup.style.display = hasProxy ? 'block' : 'none';
    if (!hasProxy) {
      this.el.proxyCountry.value = '';
    }
  }

  // App visibility
  updateAppVisibility() {
    const app = this.getSelectedApp();
    const isStagehandApp = app === 'driver' || app === 'old';

    document.querySelectorAll('.driver-only').forEach(el => {
      el.style.display = isStagehandApp ? '' : 'none';
    });

    if (!isStagehandApp && this.el.agentModel.value?.startsWith('anthropic/')) {
      this.el.agentModel.value = '';
    }
  }

  async onAppChange() {
    this.updateAppVisibility();
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

    this.setStatus('running', 'Running...');
    this.el.runBtn.disabled = true;
    this.el.runBtn.classList.add('running');
    this.el.runBtnText.textContent = 'Running...';
    this.el.stopBtn.style.display = 'flex';
    this.el.actionBarStatus.textContent = 'Running...';
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
          ...(this.el.varCarrier.value && { carrier: this.el.varCarrier.value }),
          variableOverrides: {
            carrier: this.el.varCarrier.selectedOptions[0]?.text || '',
            clientName: this.el.varClientName.value,
            groupNumber: this.el.varGroupNumber.value,
            invoiceMonth: this.el.varInvoiceMonth.value,
            invoiceYear: this.el.varInvoiceYear.value,
            ...(this.el.varUsername.value && { username: this.el.varUsername.value }),
            ...(this.el.varPassword.value && { password: this.el.varPassword.value }),
            ...(this.el.varTotpSecret.value && { totpSecret: this.el.varTotpSecret.value }),
          },
          ...(this.el.proxyType.value && { proxyType: this.el.proxyType.value }),
          ...(this.el.proxyCountry.value && { proxyCountry: this.el.proxyCountry.value }),
          ...(this.el.profileName.value && { profileName: this.el.profileName.value }),
          ...(this.el.maxSteps.value && { maxSteps: parseInt(this.el.maxSteps.value, 10) }),
          ...(this.el.agentModel.value && { agentModel: this.el.agentModel.value }),
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
            ...(this.el.payloadUrl.value && this.el.payloadUrl.value !== this.currentCarrierConfig?.url && { url: this.el.payloadUrl.value }),
            ...(!instructionMatchesMaster && { instruction: this.el.payloadInstruction.value }),
            maxSteps: this.el.maxSteps.value ? parseInt(this.el.maxSteps.value, 10) : (this.originalPayload?.maxSteps || 50),
            ...(this.el.agentModel.value && { agentModel: this.el.agentModel.value }),
            ...(this.el.stagehandModel.value && { model: this.el.stagehandModel.value }),
            ...(this.el.proxyType.value && { proxyType: this.el.proxyType.value }),
            ...(this.el.proxyCountry.value && { proxyCountry: this.el.proxyCountry.value }),
            ...(this.el.profileName.value && { profileName: this.el.profileName.value }),
            variables: {
              ...(this.originalPayload?.variables || {}),
              ...(this.el.varCarrier.value && { carrier: this.el.varCarrier.selectedOptions[0]?.text || '' }),
              ...(this.el.varClientName.value && { clientName: this.el.varClientName.value }),
              ...(this.el.varGroupNumber.value && { groupNumber: this.el.varGroupNumber.value }),
              ...(this.el.varInvoiceMonth.value && { invoiceMonth: this.el.varInvoiceMonth.value }),
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

      await this.selectPayload(this.selectedPayload);

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
            ...(this.el.payloadUrl.value && this.el.payloadUrl.value !== this.currentCarrierConfig?.url && { url: this.el.payloadUrl.value }),
            ...(!instructionMatchesMaster && { instruction: this.el.payloadInstruction.value }),
            maxSteps: this.el.maxSteps.value ? parseInt(this.el.maxSteps.value, 10) : 50,
            ...(this.el.agentModel.value && { agentModel: this.el.agentModel.value }),
            ...(this.el.stagehandModel.value && { model: this.el.stagehandModel.value }),
            ...(this.el.proxyType.value && { proxyType: this.el.proxyType.value }),
            ...(this.el.proxyCountry.value && { proxyCountry: this.el.proxyCountry.value }),
            ...(this.el.profileName.value && { profileName: this.el.profileName.value }),
            variables: {
              ...(this.el.varCarrier.value && { carrier: this.el.varCarrier.selectedOptions[0]?.text || '' }),
              ...(this.el.varClientName.value && { clientName: this.el.varClientName.value }),
              ...(this.el.varGroupNumber.value && { groupNumber: this.el.varGroupNumber.value }),
              ...(this.el.varInvoiceMonth.value && { invoiceMonth: this.el.varInvoiceMonth.value }),
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
            <div class="results-session">
              <div class="results-session-header">
                <span class="results-session-name">${session.payloadName?.replace('.json', '') || 'Session'}</span>
                <span class="results-session-date">${this.formatDate(session.timestamp)}</span>
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
        container.innerHTML = `<div class="empty-history"><div class="empty-history-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg></div><h4>No recordings yet</h4><p>Session recordings will appear here</p></div>`;
        return;
      }

      container.innerHTML = sessions.map(session => `
        <div class="history-item" data-session-id="${session.id}" data-app="${app}">
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
              <span class="history-item-status ${session.exitCode === 0 ? 'success' : 'error'}">
                ${session.exitCode === 0 ? '✓ Success' : '✗ Failed'}
              </span>
              ${session.files?.length ? `<span class="history-item-files">${session.files.length} file${session.files.length > 1 ? 's' : ''}</span>` : ''}
            </div>
          </div>
          <svg class="history-item-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </div>
      `).join('');
    } catch (e) {
      container.innerHTML = `<div class="empty-history"><h4>Error loading history</h4></div>`;
    }
  }

  async viewHistoryDetail(sessionId, app) {
    const appName = app || this.getSelectedApp();
    this.currentHistoryApp = appName;
    try {
      const res = await fetch(`/api/sessions/${sessionId}?app=${appName}`);
      const session = await res.json();

      document.querySelector('.history-container').style.display = 'none';
      this.el.historyDetail.style.display = 'flex';

      this.el.historyDetailTitle.textContent = session.payloadName?.replace('.json', '') || 'Session Details';
      this.renderSessionFiles(sessionId, session.files || [], appName);

      this.el.historyVideo.src = '';
      this.el.historyVideo.style.display = 'none';
      document.querySelector('.history-video-container').style.display = 'none';
      this.currentSessionHasRecording = session.hasRecording;
      this.currentSessionRecordingUrl = session.hasRecording ? `/api/sessions/${sessionId}/recording?app=${appName}` : null;

      if (session.hasRecording) {
        this.el.historyDownloadVideo.href = `/api/sessions/${sessionId}/recording?app=${appName}`;
        this.el.historyDownloadVideo.download = `recording_${sessionId}.mp4`;
        this.el.historyDownloadVideo.textContent = 'Show Recording';
        this.el.historyDownloadVideo.style.display = 'inline-flex';
        this.recordingVisible = false;
      } else {
        this.el.historyDownloadVideo.style.display = 'none';
      }

      if (session.replayViewUrl) {
        this.el.historyViewOnline.href = session.replayViewUrl;
        this.el.historyViewOnline.style.display = 'inline-flex';
      } else {
        this.el.historyViewOnline.style.display = 'none';
      }

      this.el.historyLogContainer.style.display = 'none';
      this.el.historyLog.textContent = '';
      this.currentHistorySessionId = sessionId;
    } catch (e) {
      this.setStatus('error', 'Failed to load session');
    }
  }

  toggleRecording(e) {
    e.preventDefault();
    const videoContainer = document.querySelector('.history-video-container');

    if (this.recordingVisible) {
      this.el.historyVideo.pause();
      this.el.historyVideo.src = '';
      this.el.historyVideo.style.display = 'none';
      videoContainer.style.display = 'none';
      this.el.historyDownloadVideo.textContent = 'Show Recording';
      this.recordingVisible = false;
    } else {
      this.el.historyVideo.src = this.currentSessionRecordingUrl;
      this.el.historyVideo.style.display = 'block';
      videoContainer.style.display = 'block';
      this.el.historyDownloadVideo.textContent = 'Hide Recording';
      this.el.historyDownloadRecordingLink.href = this.currentSessionRecordingUrl;
      this.recordingVisible = true;
    }
  }

  renderSessionFiles(sessionId, files, app) {
    const appName = app || this.currentHistoryApp || this.getSelectedApp();
    let container = document.getElementById('history-files-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'history-files-container';
      container.className = 'history-files-container';
      const detailContent = document.querySelector('.history-detail-content');
      detailContent.insertBefore(container, detailContent.firstChild);
    }

    if (!files.length) {
      container.innerHTML = '';
      container.style.display = 'none';
      return;
    }

    container.style.display = 'block';
    container.innerHTML = `
      <h4>Downloaded Files</h4>
      <div class="history-files-list">
        ${files.map(file => `
          <div class="history-file-item">
            <div class="history-file-icon">${this.getFileIcon(file.filename)}</div>
            <div class="history-file-info">
              <div class="history-file-name">${file.filename}</div>
              <div class="history-file-size">${this.formatSize(file.size)}</div>
            </div>
            <div class="history-file-actions">
              <a href="/api/sessions/${sessionId}/files/${encodeURIComponent(file.filename)}?app=${appName}" class="btn btn-sm" download>Download</a>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  async toggleHistoryLog() {
    if (this.el.historyLogContainer.style.display === 'none') {
      try {
        const app = this.currentHistoryApp || this.getSelectedApp();
        const res = await fetch(`/api/sessions/${this.currentHistorySessionId}/log?app=${app}`);
        const log = await res.text();
        this.el.historyLog.textContent = this.stripAnsi(log);
        this.el.historyLogContainer.style.display = 'block';
        this.el.historyViewLog.textContent = 'Hide Log';
      } catch (e) {
        this.setStatus('error', 'Failed to load log');
      }
    } else {
      this.el.historyLogContainer.style.display = 'none';
      this.el.historyViewLog.textContent = 'View Log';
    }
  }

  async copyHistoryLog() {
    const text = this.el.historyLog.textContent;
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
    this.el.payloadList.addEventListener('click', e => {
      const item = e.target.closest('.task-item');
      if (item?.dataset.name) this.selectPayload(item.dataset.name);
    });

    // Instructions
    this.el.instructionsCustomizeBtn.addEventListener('click', () => this.expandInstructions());
    this.el.instructionsCollapseBtn.addEventListener('click', () => this.collapseInstructions());
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
    this.el.historyDownloadVideo.addEventListener('click', (e) => this.toggleRecording(e));
    this.el.historyViewLog.addEventListener('click', () => this.toggleHistoryLog());
    this.el.historyCopyLogBtn.addEventListener('click', () => this.copyHistoryLog());
    this.el.historyList.addEventListener('click', (e) => {
      const item = e.target.closest('.history-item');
      if (item?.dataset.sessionId) this.viewHistoryDetail(item.dataset.sessionId, item.dataset.app);
    });

    // Results panel
    this.el.resultsToggle.addEventListener('click', () => this.openResultsPanel());
    this.el.resultsPanelClose.addEventListener('click', () => this.closeResultsPanel());
    this.el.resultsPanelOverlay.addEventListener('click', () => this.closeResultsPanel());

    // Save modal
    this.el.saveCancelBtn.addEventListener('click', () => this.closeSaveModal());
    this.el.saveConfirmBtn.addEventListener('click', () => this.save());
    this.el.saveModal.addEventListener('click', e => {
      if (e.target === this.el.saveModal) this.closeSaveModal();
    });
    this.el.saveNameInput.addEventListener('keypress', e => {
      if (e.key === 'Enter') this.save();
    });

    // Carrier & proxy
    this.el.varCarrier.addEventListener('change', () => this.onCarrierChange());
    this.el.proxyType.addEventListener('change', () => this.updateProxyCountryVisibility());

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
        if (this.theaterMode) {
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
