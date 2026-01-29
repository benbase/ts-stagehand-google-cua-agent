/**
 * CUA 2.0 Playground
 */

class App {
  constructor() {
    this.selectedPayload = null;
    this.originalPayload = null;
    this.isRunning = false;
    this.isNewPayload = false;
    this.abortController = null;
    this.theaterMode = false;
    this.sidebarWasVisible = true; // Track sidebar state before theater mode
    this.theaterHintTimeout = null;

    this.el = {
      mainContent: document.getElementById('main-content'),
      sidebarToggle: document.getElementById('sidebar-toggle'),
      themeToggle: document.getElementById('theme-toggle'),
      themeIcon: document.getElementById('theme-icon'),
      payloadList: document.getElementById('payload-list'),
      // App selector
      appSelect: document.getElementById('app-select'),
      payloadUrl: document.getElementById('payload-url'),
      payloadInstruction: document.getElementById('payload-instruction'),
      varGroupNumber: document.getElementById('var-group-number'),
      varInvoiceMonth: document.getElementById('var-invoice-month'),
      varInvoiceYear: document.getElementById('var-invoice-year'),
      maxSteps: document.getElementById('max-steps'),
      // Models
      agentModel: document.getElementById('agent-model'),
      stagehandModel: document.getElementById('stagehand-model'),
      // Credentials
      credentialsSection: document.getElementById('credentials-section'),
      credentialsToggle: document.getElementById('credentials-toggle'),
      credentialsFields: document.getElementById('credentials-fields'),
      credentialsStatus: document.getElementById('credentials-status'),
      varUsername: document.getElementById('var-username'),
      varPassword: document.getElementById('var-password'),
      varTotpSecret: document.getElementById('var-totp-secret'),
      // Proxy settings
      proxyType: document.getElementById('proxy-type'),
      proxyCountry: document.getElementById('proxy-country'),
      proxyCountryGroup: document.getElementById('proxy-country-group'),
      profileName: document.getElementById('profile-name'),
      newPayloadBtn: document.getElementById('new-payload-btn'),
      refreshBtn: document.getElementById('refresh-btn'),
      runBtn: document.getElementById('run-btn'),
      runBtnText: document.getElementById('run-btn-text'),
      saveBtn: document.getElementById('save-btn'),
      updateBtn: document.getElementById('update-btn'),
      stopBtn: document.getElementById('stop-btn'),
      status: document.getElementById('status'),
      statusText: document.getElementById('status-text'),
      // Tabs
      tabEditor: document.getElementById('tab-editor'),
      tabLiveView: document.getElementById('tab-live-view'),
      tabLiveStatus: document.getElementById('tab-live-status'),
      tabContentEditor: document.getElementById('tab-content-editor'),
      tabContentLiveView: document.getElementById('tab-content-live-view'),
      // Live view elements
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
      // Theater mode
      liveViewCard: document.getElementById('live-view-card'),
      liveViewOverlay: document.getElementById('live-view-overlay'),
      theaterModeBtn: document.getElementById('theater-mode-btn'),
      theaterExpandIcon: document.getElementById('theater-expand-icon'),
      theaterCollapseIcon: document.getElementById('theater-collapse-icon'),
      panelRight: document.getElementById('panel-right'),
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
      // History tab
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
    await this.loadPayloads();
    this.bindEvents();
    this.updateAppVisibility();
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
    const moonIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;
    const sunIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;
    this.el.themeIcon.innerHTML = theme === 'dark' ? sunIcon : moonIcon;
  }

  // Sidebar
  toggleSidebar() {
    this.el.mainContent.classList.toggle('sidebar-collapsed');
  }

  // Tabs
  switchTab(tabName) {
    // Exit theater mode when switching away from live view
    if (tabName !== 'live-view') {
      this.exitTheaterMode();
    }

    // Update tab buttons
    this.el.tabEditor.classList.toggle('active', tabName === 'editor');
    this.el.tabLiveView.classList.toggle('active', tabName === 'live-view');
    this.el.tabHistory.classList.toggle('active', tabName === 'history');

    // Update tab content
    this.el.tabContentEditor.classList.toggle('active', tabName === 'editor');
    this.el.tabContentLiveView.classList.toggle('active', tabName === 'live-view');
    this.el.tabContentHistory.classList.toggle('active', tabName === 'history');

    // Load history when switching to history tab
    if (tabName === 'history') {
      this.loadHistory();
    }
  }

  setTabStatus(status) {
    // status: 'running', 'complete', 'error', or ''
    this.el.tabLiveStatus.className = 'tab-status' + (status ? ` ${status}` : '');
  }

  // Theater Mode
  toggleTheaterMode() {
    this.theaterMode = !this.theaterMode;
    this.el.runningState.classList.toggle('theater-mode', this.theaterMode);
    this.el.panelRight.classList.toggle('theater-mode-active', this.theaterMode);

    // Toggle icons
    this.el.theaterExpandIcon.style.display = this.theaterMode ? 'none' : 'block';
    this.el.theaterCollapseIcon.style.display = this.theaterMode ? 'block' : 'none';

    // Update button title
    this.el.theaterModeBtn.title = this.theaterMode ? 'Exit theater mode (Esc)' : 'Theater mode (T)';

    // Auto-hide/show sidebar
    if (this.theaterMode) {
      // Remember current sidebar state and hide it
      this.sidebarWasVisible = !this.el.mainContent.classList.contains('sidebar-collapsed');
      this.el.mainContent.classList.add('sidebar-collapsed');

      // Show exit hint briefly
      this.showTheaterHint();
    } else {
      // Restore sidebar if it was visible before
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
      this.theaterHintTimeout = setTimeout(() => {
        hint.classList.remove('visible');
      }, 2500);
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

      // Hide the exit hint
      const hint = document.querySelector('.theater-exit-hint');
      if (hint) {
        hint.classList.remove('visible');
        clearTimeout(this.theaterHintTimeout);
      }

      // Restore sidebar if it was visible before
      if (this.sidebarWasVisible) {
        this.el.mainContent.classList.remove('sidebar-collapsed');
      }
    }
  }

  // Payloads
  async loadPayloads() {
    try {
      const app = this.el.appSelect.value;
      const res = await fetch(`/api/payloads?app=${app}`);
      const payloads = await res.json();

      if (!payloads.length) {
        this.el.payloadList.innerHTML = '<li class="empty-state">No payloads</li>';
        return;
      }

      this.el.payloadList.innerHTML = payloads
        .map(p => `<li data-name="${p}">${p.replace('.json', '').replace(/_/g, ' ')}</li>`)
        .join('');
    } catch (e) {
      this.el.payloadList.innerHTML = '<li class="empty-state">Error loading</li>';
    }
  }

  async selectPayload(name) {
    try {
      const app = this.el.appSelect.value;
      const res = await fetch(`/api/payloads/${name}?app=${app}`);
      const payload = await res.json();

      this.selectedPayload = name;
      this.originalPayload = payload;
      this.isNewPayload = false;

      this.el.payloadUrl.value = payload.url || '';
      this.el.payloadInstruction.value = payload.instruction || '';

      const vars = payload.variables || {};
      this.el.varGroupNumber.value = vars.groupNumber || '';
      this.el.varInvoiceMonth.value = vars.invoiceMonth || '';
      this.el.varInvoiceYear.value = vars.invoiceYear || '';

      // Load maxSteps
      this.el.maxSteps.value = payload.maxSteps || '';

      // Load model settings
      this.el.agentModel.value = payload.agentModel || '';
      this.el.stagehandModel.value = payload.model || '';

      // Load proxy and profile settings
      this.el.proxyType.value = payload.proxyType || '';
      this.el.proxyCountry.value = payload.proxyCountry || '';
      this.el.profileName.value = payload.profileName || '';
      this.updateProxyCountryVisibility();

      // Show credentials section if payload has stored credentials
      const hasStoredCredentials = vars.username === '***' || vars.password === '***';
      this.el.credentialsSection.style.display = hasStoredCredentials ? 'block' : 'none';

      // Clear credential override fields and collapse
      this.el.varUsername.value = '';
      this.el.varPassword.value = '';
      this.el.varTotpSecret.value = '';
      this.el.credentialsSection.classList.remove('expanded');
      this.el.credentialsFields.style.display = 'none';
      this.updateCredentialsStatus();

      document.querySelectorAll('#payload-list li').forEach(li => {
        li.classList.toggle('active', li.dataset.name === name);
      });

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

    this.el.payloadUrl.value = '';
    this.el.payloadInstruction.value = '';
    this.el.varGroupNumber.value = '';
    this.el.varInvoiceMonth.value = '';
    this.el.varInvoiceYear.value = '';

    // Reset maxSteps
    this.el.maxSteps.value = '';

    // Reset model settings
    this.el.agentModel.value = '';
    this.el.stagehandModel.value = '';

    // Reset proxy and profile settings
    this.el.proxyType.value = '';
    this.el.proxyCountry.value = '';
    this.el.profileName.value = '';
    this.updateProxyCountryVisibility();

    // Show credentials section for new payloads (to allow adding credentials)
    this.el.credentialsSection.style.display = 'block';
    this.el.varUsername.value = '';
    this.el.varPassword.value = '';
    this.el.varTotpSecret.value = '';
    this.el.credentialsSection.classList.remove('expanded');
    this.el.credentialsFields.style.display = 'none';
    this.updateCredentialsStatus();

    document.querySelectorAll('#payload-list li').forEach(li => li.classList.remove('active'));

    this.el.runBtn.disabled = true;
    this.el.saveBtn.disabled = false;
    this.el.updateBtn.disabled = true;  // Can't update a new payload
    this.el.payloadUrl.focus();
  }

  insertVariable(variable) {
    const ta = this.el.payloadInstruction;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    ta.value = ta.value.substring(0, start) + variable + ta.value.substring(end);
    ta.selectionStart = ta.selectionEnd = start + variable.length;
    ta.focus();
  }

  // Credentials
  toggleCredentials() {
    const isExpanded = this.el.credentialsSection.classList.toggle('expanded');
    this.el.credentialsFields.style.display = isExpanded ? 'flex' : 'none';
  }

  updateCredentialsStatus() {
    const hasCustom = this.el.varUsername.value || this.el.varPassword.value || this.el.varTotpSecret.value;
    const hasStored = this.originalPayload?.variables?.username === '***' ||
                      this.originalPayload?.variables?.password === '***';

    if (hasCustom) {
      this.el.credentialsStatus.textContent = hasStored ? 'Custom override' : 'Set';
    } else {
      this.el.credentialsStatus.textContent = hasStored ? 'Using stored' : 'Optional';
    }
    this.el.credentialsStatus.classList.toggle('custom', hasCustom);
  }

  // Proxy
  updateProxyCountryVisibility() {
    const hasProxy = this.el.proxyType.value !== '';
    this.el.proxyCountryGroup.style.display = hasProxy ? 'block' : 'none';
    // Reset country when proxy is disabled
    if (!hasProxy) {
      this.el.proxyCountry.value = '';
    }
  }

  // App selection
  updateAppVisibility() {
    const isDriver = this.el.appSelect.value === 'driver';

    // Show/hide driver-only elements (includes CUA model optgroup with Claude models)
    document.querySelectorAll('.driver-only').forEach(el => {
      el.style.display = isDriver ? '' : 'none';
    });

    // Reset CUA model selection when switching to Navigator (Claude models not available)
    if (!isDriver && this.el.agentModel.value && this.el.agentModel.value.startsWith('anthropic/')) {
      this.el.agentModel.value = '';
    }
  }

  async onAppChange() {
    this.updateAppVisibility();
    // Clear current selection and reload payloads for the new app
    this.selectedPayload = null;
    this.originalPayload = null;
    this.isNewPayload = false;
    // Clear form fields
    this.el.payloadUrl.value = '';
    this.el.payloadInstruction.value = '';
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
    // Reset credentials
    this.el.varUsername.value = '';
    this.el.varPassword.value = '';
    this.el.varTotpSecret.value = '';
    this.el.credentialsSection.classList.remove('expanded');
    this.el.credentialsFields.style.display = 'none';
    // Disable buttons until a payload is selected
    this.el.runBtn.disabled = true;
    this.el.updateBtn.disabled = true;
    // Reload payload list for the selected app
    await this.loadPayloads();
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
    this.el.runBtnText.innerHTML = '<span class="spinner"></span>';
    this.el.stopBtn.style.display = 'inline-flex';
    this.el.outputLog.textContent = '';

    // Switch to live view tab and set status
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
          app: this.el.appSelect.value,
          payloadName: this.selectedPayload,
          variableOverrides: {
            groupNumber: this.el.varGroupNumber.value,
            invoiceMonth: this.el.varInvoiceMonth.value,
            invoiceYear: this.el.varInvoiceYear.value,
            // Credential overrides (only sent if user entered a value)
            ...(this.el.varUsername.value && { username: this.el.varUsername.value }),
            ...(this.el.varPassword.value && { password: this.el.varPassword.value }),
            ...(this.el.varTotpSecret.value && { totpSecret: this.el.varTotpSecret.value }),
          },
          // Proxy and profile settings
          ...(this.el.proxyType.value && { proxyType: this.el.proxyType.value }),
          ...(this.el.proxyCountry.value && { proxyCountry: this.el.proxyCountry.value }),
          ...(this.el.profileName.value && { profileName: this.el.profileName.value }),
          // Max steps override
          ...(this.el.maxSteps.value && { maxSteps: parseInt(this.el.maxSteps.value, 10) }),
          // Model overrides
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
      this.el.runBtnText.textContent = 'Run';
      this.el.stopBtn.style.display = 'none';
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
        // Exit theater mode when session ends
        this.exitTheaterMode();

        this.el.liveViewIframe.classList.remove('active');
        this.el.liveViewIframe.src = 'about:blank';
        this.el.liveViewPlaceholder.textContent = 'Session ended';
        this.el.liveViewPlaceholder.style.display = 'flex';
        this.el.liveViewStatus.textContent = 'Completed';

        // Check both exit code AND result status to determine success/error
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
          // Exit code 0 but result status is not success (e.g., login_failed)
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

  // Strip ANSI escape codes from text
  stripAnsi(text) {
    return text
      .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')  // Full ANSI codes
      .replace(/\[([0-9;]+)m/g, '');           // Partial codes like [30;46m
  }

  log(text, cls = '') {
    const span = document.createElement('span');
    if (cls) span.className = cls;
    span.textContent = this.stripAnsi(text);
    this.el.outputLog.appendChild(span);
    this.el.outputLog.scrollTop = this.el.outputLog.scrollHeight;
  }

  async copyOutput() {
    const text = this.el.outputLog.textContent;
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      const btn = this.el.copyOutputBtn;
      const originalText = btn.textContent;
      btn.textContent = 'Copied!';
      btn.classList.add('btn-success');
      setTimeout(() => {
        btn.textContent = originalText;
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
    this.el.saveNameInput.value = this.isNewPayload ? 'new_payload' :
        (this.selectedPayload?.replace('.json', '') + '_copy') || 'payload';
    this.el.saveModal.classList.add('active');
    this.el.saveNameInput.focus();
    this.el.saveNameInput.select();
  }

  closeSaveModal() {
    this.el.saveModal.classList.remove('active');
  }

  // Update existing payload (save in place)
  async update() {
    if (!this.selectedPayload) {
      this.setStatus('error', 'No payload selected');
      return;
    }

    // Show saving state
    const originalText = this.el.updateBtn.textContent;
    this.el.updateBtn.textContent = 'Saving...';
    this.el.updateBtn.disabled = true;

    try {
      const res = await fetch('/api/payloads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app: this.el.appSelect.value,
          name: this.selectedPayload,
          payload: {
            url: this.el.payloadUrl.value,
            instruction: this.el.payloadInstruction.value,
            maxSteps: this.el.maxSteps.value ? parseInt(this.el.maxSteps.value, 10) : (this.originalPayload?.maxSteps || 50),
            // Model settings (include if set)
            ...(this.el.agentModel.value && { agentModel: this.el.agentModel.value }),
            ...(this.el.stagehandModel.value && { model: this.el.stagehandModel.value }),
            // Proxy and profile settings (include if set, exclude if empty to remove from payload)
            ...(this.el.proxyType.value && { proxyType: this.el.proxyType.value }),
            ...(this.el.proxyCountry.value && { proxyCountry: this.el.proxyCountry.value }),
            ...(this.el.profileName.value && { profileName: this.el.profileName.value }),
            variables: {
              ...(this.originalPayload?.variables || {}),
              // Only include if non-empty
              ...(this.el.varGroupNumber.value && { groupNumber: this.el.varGroupNumber.value }),
              ...(this.el.varInvoiceMonth.value && { invoiceMonth: this.el.varInvoiceMonth.value }),
              ...(this.el.varInvoiceYear.value && { invoiceYear: this.el.varInvoiceYear.value }),
              // Include credentials if provided
              ...(this.el.varUsername.value && { username: this.el.varUsername.value }),
              ...(this.el.varPassword.value && { password: this.el.varPassword.value }),
              ...(this.el.varTotpSecret.value && { totpSecret: this.el.varTotpSecret.value }),
            },
          },
          originalName: this.selectedPayload,
        }),
      });

      if (!res.ok) {
        this.el.updateBtn.textContent = originalText;
        this.el.updateBtn.disabled = false;
        this.setStatus('error', 'Update failed');
        return;
      }

      // Show saved confirmation
      this.el.updateBtn.textContent = 'Saved!';
      this.el.updateBtn.classList.add('btn-success');
      this.setStatus('success', 'Saved');

      // Reload to get fresh data (credentials masked, etc.)
      await this.selectPayload(this.selectedPayload);

      // Reset button after delay
      setTimeout(() => {
        this.el.updateBtn.textContent = originalText;
        this.el.updateBtn.classList.remove('btn-success');
        this.el.updateBtn.disabled = false;
      }, 1500);
    } catch {
      this.el.updateBtn.textContent = originalText;
      this.el.updateBtn.disabled = false;
      this.setStatus('error', 'Update failed');
    }
  }

  async save() {
    const name = this.el.saveNameInput.value.trim();
    if (!name) return;

    const fileName = name.endsWith('.json') ? name : `${name}.json`;

    try {
      const res = await fetch('/api/payloads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app: this.el.appSelect.value,
          name: fileName,
          payload: {
            url: this.el.payloadUrl.value,
            instruction: this.el.payloadInstruction.value,
            maxSteps: this.el.maxSteps.value ? parseInt(this.el.maxSteps.value, 10) : (this.originalPayload?.maxSteps || 50),
            // Model settings (only include if set)
            ...(this.el.agentModel.value && { agentModel: this.el.agentModel.value }),
            ...(this.el.stagehandModel.value && { model: this.el.stagehandModel.value }),
            // Proxy and profile settings (only include if set)
            ...(this.el.proxyType.value && { proxyType: this.el.proxyType.value }),
            ...(this.el.proxyCountry.value && { proxyCountry: this.el.proxyCountry.value }),
            ...(this.el.profileName.value && { profileName: this.el.profileName.value }),
            variables: {
              ...(this.originalPayload?.variables || {}),
              // Only include if non-empty
              ...(this.el.varGroupNumber.value && { groupNumber: this.el.varGroupNumber.value }),
              ...(this.el.varInvoiceMonth.value && { invoiceMonth: this.el.varInvoiceMonth.value }),
              ...(this.el.varInvoiceYear.value && { invoiceYear: this.el.varInvoiceYear.value }),
              // Include credentials if provided (for new payloads)
              ...(this.el.varUsername.value && { username: this.el.varUsername.value }),
              ...(this.el.varPassword.value && { password: this.el.varPassword.value }),
              ...(this.el.varTotpSecret.value && { totpSecret: this.el.varTotpSecret.value }),
            },
          },
          originalName: this.selectedPayload,
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
    container.innerHTML = `
      <div class="empty-results">
        <div class="empty-results-icon">📁</div>
        <h4>Loading...</h4>
      </div>
    `;

    try {
      const res = await fetch('/api/sessions');
      const sessions = await res.json();

      // Filter to only sessions that have downloaded files
      const sessionsWithFiles = sessions.filter(s => s.files && s.files.length > 0);

      if (!sessionsWithFiles.length) {
        container.innerHTML = `
          <div class="empty-results">
            <div class="empty-results-icon">📁</div>
            <h4>No files yet</h4>
            <p>Downloaded files will appear here</p>
          </div>
        `;
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
                    <div class="results-file-icon">
                      ${this.getFileIcon(file.filename)}
                    </div>
                    <div class="results-file-info">
                      <div class="results-file-name" title="${file.filename}">${file.filename}</div>
                      <div class="results-file-meta">${this.formatSize(file.size)}</div>
                    </div>
                    <div class="results-file-actions">
                      <a href="/api/sessions/${session.id}/files/${encodeURIComponent(file.filename)}" class="btn btn-sm" download>Download</a>
                      <button class="btn btn-sm btn-primary" onclick="window.open('/api/sessions/${session.id}/files/${encodeURIComponent(file.filename)}?view=true', '_blank')">View</button>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      `;
    } catch (e) {
      container.innerHTML = `
        <div class="empty-results">
          <div class="empty-results-icon">⚠️</div>
          <h4>Error loading files</h4>
          <p>Please try again</p>
        </div>
      `;
    }
  }

  getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    if (ext === 'pdf') {
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
        <polyline points="14 2 14 8 20 8"></polyline>
        <line x1="16" y1="13" x2="8" y2="13"></line>
        <line x1="16" y1="17" x2="8" y2="17"></line>
        <polyline points="10 9 9 9 8 9"></polyline>
      </svg>`;
    }
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
      <polyline points="13 2 13 9 20 9"></polyline>
    </svg>`;
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
    container.innerHTML = `
      <div class="empty-history">
        <div class="empty-history-icon">📼</div>
        <h4>Loading...</h4>
      </div>
    `;

    // Hide detail view, show list
    this.el.historyDetail.style.display = 'none';
    document.querySelector('.history-container').style.display = 'flex';

    try {
      const res = await fetch('/api/sessions');
      const sessions = await res.json();

      if (!sessions.length) {
        container.innerHTML = `
          <div class="empty-history">
            <div class="empty-history-icon">📼</div>
            <h4>No recordings yet</h4>
            <p>Session recordings will appear here after runs complete</p>
          </div>
        `;
        return;
      }

      container.innerHTML = sessions.map(session => `
        <div class="history-item" data-session-id="${session.id}">
          <div class="history-item-icon">
            ${session.hasRecording ? `
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="23 7 16 12 23 17 23 7"></polygon>
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
              </svg>
            ` : `
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
              </svg>
            `}
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
          <svg class="history-item-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </div>
      `).join('');
    } catch (e) {
      container.innerHTML = `
        <div class="empty-history">
          <div class="empty-history-icon">⚠️</div>
          <h4>Error loading history</h4>
          <p>Please try again</p>
        </div>
      `;
    }
  }

  async viewHistoryDetail(sessionId) {
    try {
      const res = await fetch(`/api/sessions/${sessionId}`);
      const session = await res.json();

      // Hide list, show detail
      document.querySelector('.history-container').style.display = 'none';
      this.el.historyDetail.style.display = 'flex';

      // Set title
      this.el.historyDetailTitle.textContent = session.payloadName?.replace('.json', '') || 'Session Details';

      // Show downloaded files first (at top)
      this.renderSessionFiles(sessionId, session.files || []);

      // Hide video by default, set up for toggle
      this.el.historyVideo.src = '';
      this.el.historyVideo.style.display = 'none';
      document.querySelector('.history-video-container').style.display = 'none';
      this.currentSessionHasRecording = session.hasRecording;
      this.currentSessionRecordingUrl = session.hasRecording ? `/api/sessions/${sessionId}/recording` : null;

      // Show "Show Recording" button if local recording exists
      if (session.hasRecording) {
        this.el.historyDownloadVideo.href = `/api/sessions/${sessionId}/recording`;
        this.el.historyDownloadVideo.download = `recording_${sessionId}.mp4`;
        this.el.historyDownloadVideo.textContent = 'Show Recording';
        this.el.historyDownloadVideo.style.display = 'inline-flex';
        this.recordingVisible = false;
      } else {
        this.el.historyDownloadVideo.style.display = 'none';
      }

      // Always show "View Recording Online" button when we have a replay URL
      if (session.replayViewUrl) {
        this.el.historyViewOnline.href = session.replayViewUrl;
        this.el.historyViewOnline.style.display = 'inline-flex';
      } else {
        this.el.historyViewOnline.style.display = 'none';
      }

      // Reset log view
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
      // Hide recording
      this.el.historyVideo.pause();
      this.el.historyVideo.src = '';
      this.el.historyVideo.style.display = 'none';
      videoContainer.style.display = 'none';
      this.el.historyDownloadVideo.textContent = 'Show Recording';
      this.recordingVisible = false;
    } else {
      // Show recording
      this.el.historyVideo.src = this.currentSessionRecordingUrl;
      this.el.historyVideo.style.display = 'block';
      videoContainer.style.display = 'block';
      this.el.historyDownloadVideo.textContent = 'Hide Recording';
      this.el.historyDownloadRecordingLink.href = this.currentSessionRecordingUrl;
      this.recordingVisible = true;
    }
  }

  renderSessionFiles(sessionId, files) {
    let container = document.getElementById('history-files-container');
    if (!container) {
      // Create the files container if it doesn't exist
      container = document.createElement('div');
      container.id = 'history-files-container';
      container.className = 'history-files-container';
      // Insert at the top of detail content (before video container)
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
              <a href="/api/sessions/${sessionId}/files/${encodeURIComponent(file.filename)}" class="btn btn-sm" download>Download</a>
              <button class="btn btn-sm btn-primary" onclick="window.open('/api/sessions/${sessionId}/files/${encodeURIComponent(file.filename)}?view=true', '_blank')">View</button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  async toggleHistoryLog() {
    if (this.el.historyLogContainer.style.display === 'none') {
      // Load and show log
      try {
        const res = await fetch(`/api/sessions/${this.currentHistorySessionId}/log`);
        const log = await res.text();
        this.el.historyLog.textContent = this.stripAnsi(log);
        this.el.historyLogContainer.style.display = 'block';
        this.el.historyViewLog.textContent = 'Hide Log';
      } catch (e) {
        this.setStatus('error', 'Failed to load log');
      }
    } else {
      // Hide log
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
      const originalText = btn.textContent;
      btn.textContent = 'Copied!';
      btn.classList.add('btn-success');
      setTimeout(() => {
        btn.textContent = originalText;
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
    this.el.sidebarToggle.addEventListener('click', () => this.toggleSidebar());
    this.el.themeToggle.addEventListener('click', () => this.toggleTheme());
    this.el.newPayloadBtn.addEventListener('click', () => this.newPayload());
    this.el.refreshBtn.addEventListener('click', () => this.loadPayloads());
    this.el.runBtn.addEventListener('click', () => this.run());
    this.el.stopBtn.addEventListener('click', () => this.stop());
    this.el.saveBtn.addEventListener('click', () => this.openSaveModal());
    this.el.updateBtn.addEventListener('click', () => this.update());
    this.el.copyOutputBtn.addEventListener('click', () => this.copyOutput());
    this.el.clearOutputBtn.addEventListener('click', () => this.el.outputLog.textContent = '');

    // Theater mode
    this.el.theaterModeBtn.addEventListener('click', () => this.toggleTheaterMode());

    // Double-click overlay to toggle theater mode (overlay captures events since iframes don't bubble)
    this.el.liveViewOverlay.addEventListener('dblclick', () => this.toggleTheaterMode());

    // Click output card header to expand/collapse in theater mode
    const outputCard = this.el.outputLog.closest('.card');
    const outputHeader = outputCard.querySelector('.card-header');
    outputHeader.addEventListener('click', () => {
      if (this.theaterMode) {
        outputCard.classList.toggle('expanded');
      }
    });

    // Tab switching
    this.el.tabEditor.addEventListener('click', () => this.switchTab('editor'));
    this.el.tabLiveView.addEventListener('click', () => this.switchTab('live-view'));
    this.el.tabHistory.addEventListener('click', () => this.switchTab('history'));

    // History tab events
    this.el.refreshHistoryBtn.addEventListener('click', () => this.loadHistory());
    this.el.historyBackBtn.addEventListener('click', () => this.hideHistoryDetail());
    this.el.historyDownloadVideo.addEventListener('click', (e) => this.toggleRecording(e));
    this.el.historyViewLog.addEventListener('click', () => this.toggleHistoryLog());
    this.el.historyCopyLogBtn.addEventListener('click', () => this.copyHistoryLog());
    this.el.historyList.addEventListener('click', (e) => {
      const item = e.target.closest('.history-item');
      if (item?.dataset.sessionId) {
        this.viewHistoryDetail(item.dataset.sessionId);
      }
    });

    // Results panel
    this.el.resultsToggle.addEventListener('click', () => this.openResultsPanel());
    this.el.resultsPanelClose.addEventListener('click', () => this.closeResultsPanel());
    this.el.resultsPanelOverlay.addEventListener('click', () => this.closeResultsPanel());

    this.el.saveCancelBtn.addEventListener('click', () => this.closeSaveModal());
    this.el.saveConfirmBtn.addEventListener('click', () => this.save());
    this.el.saveModal.addEventListener('click', e => {
      if (e.target === this.el.saveModal) this.closeSaveModal();
    });
    this.el.saveNameInput.addEventListener('keypress', e => {
      if (e.key === 'Enter') this.save();
    });

    this.el.payloadList.addEventListener('click', e => {
      const li = e.target.closest('li');
      if (li?.dataset.name) this.selectPayload(li.dataset.name);
    });

    // Credentials toggle and input handlers
    this.el.credentialsToggle.addEventListener('click', () => this.toggleCredentials());
    this.el.varUsername.addEventListener('input', () => this.updateCredentialsStatus());
    this.el.varPassword.addEventListener('input', () => this.updateCredentialsStatus());
    this.el.varTotpSecret.addEventListener('input', () => this.updateCredentialsStatus());

    // Proxy type change handler
    this.el.proxyType.addEventListener('change', () => this.updateProxyCountryVisibility());

    // App selector change handler
    this.el.appSelect.addEventListener('change', () => this.onAppChange());

    document.querySelectorAll('.variable-tag').forEach(tag => {
      tag.addEventListener('click', () => this.insertVariable(tag.dataset.var));
    });

    document.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !this.isRunning) {
        e.preventDefault();
        this.run();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (this.selectedPayload && !this.isNewPayload) {
          this.update();  // Update existing payload
        } else {
          this.openSaveModal();  // Save as new
        }
      }
      if (e.key === 'Escape') {
        if (this.theaterMode) {
          this.exitTheaterMode();
        } else if (this.el.resultsPanel.classList.contains('active')) {
          this.closeResultsPanel();
        } else if (this.el.saveModal.classList.contains('active')) {
          this.closeSaveModal();
        } else if (this.isRunning) {
          this.stop();
        }
      }
      // 'T' key to toggle theater mode (when not typing and live view is visible)
      if (e.key === 't' || e.key === 'T') {
        const target = e.target;
        const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
        const liveViewVisible = this.el.runningState.style.display !== 'none';
        if (!isTyping && liveViewVisible) {
          e.preventDefault();
          this.toggleTheaterMode();
        }
      }
      // '[' key to toggle sidebar (when not typing)
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
