require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const { spawn } = require('child_process');

const app = express();
const DEFAULT_PORT = process.env.PORT || 3001;

// Kernel API configuration
const KERNEL_API_BASE = 'https://api.onkernel.com';
const KERNEL_API_KEY = process.env.KERNEL_API_KEY;

if (!KERNEL_API_KEY) {
  console.warn('Warning: KERNEL_API_KEY not set. File downloads from Kernel will not work.');
}

// Paths
const APPS_DIR = path.join(__dirname, '..', 'apps');
const PUBLIC_DIR = path.join(__dirname, 'public');
const SHARED_PAYLOADS_DIR = path.join(APPS_DIR, 'shared', 'payloads');
const CREDENTIALS_CARRIERS_DIR = path.join(APPS_DIR, 'shared', 'credentials', 'carriers');
const CREDENTIALS_BENADMIN_DIR = path.join(APPS_DIR, 'shared', 'credentials', 'benadmin');

// Get payloads directory for a specific app
function getPayloadsDir(app) {
  return path.join(APPS_DIR, app || 'driver', 'payloads');
}

// Sensitive keys that should never be exposed to frontend
const SENSITIVE_KEYS = ['username', 'password', 'totpSecret'];

// Regex to extract live view URL from kernel output
// Matches: "Kernel browser live view url:", "[browser] Live view URL:", or "[browser] Live view:"
const LIVE_VIEW_REGEX = /(?:Kernel browser live view url|\[browser] Live view(?: URL)?):\s*(https?:\/\/[^\s\x1B]+)/i;

// Strip ANSI escape codes from text
function stripAnsi(text) {
  return text.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
}

// Regex to extract result JSON from kernel output
// Matches: SUCCESS Result: followed by JSON object, then SUCCESS
const RESULT_REGEX = /SUCCESS\s+Result:\s*\n([\s\S]*?)\n\s*SUCCESS/;

// Results directory - contains all session data (recordings, logs, downloaded files)
const RESULTS_DIR = path.join(__dirname, 'results');

// Ensure directory exists
fs.mkdir(RESULTS_DIR, { recursive: true }).catch(() => {});

// Download file from Kernel browser session to a specific directory
async function downloadFromKernel(sessionId, remotePath, localFilename, sessionDir) {
  if (!KERNEL_API_KEY) {
    console.error('KERNEL_API_KEY not set, cannot download file');
    return null;
  }

  try {
    const url = `${KERNEL_API_BASE}/browsers/${sessionId}/fs/read_file?path=${encodeURIComponent(remotePath)}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${KERNEL_API_KEY}`,
      },
    });

    if (!response.ok) {
      console.error(`Failed to download file: ${response.status} ${response.statusText}`);
      return null;
    }

    const buffer = await response.arrayBuffer();
    const localPath = path.join(sessionDir, localFilename);
    await fs.writeFile(localPath, Buffer.from(buffer));

    console.log(`File downloaded: ${localFilename}`);
    return {
      filename: localFilename,
      path: localPath,
      size: buffer.byteLength,
    };
  } catch (error) {
    console.error('Error downloading file from Kernel:', error);
    return null;
  }
}

// List replays for a session
async function listReplays(sessionId) {
  if (!KERNEL_API_KEY) return [];

  try {
    const url = `${KERNEL_API_BASE}/browsers/${sessionId}/replays`;
    console.log(`Fetching replays from: ${url}`);
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${KERNEL_API_KEY}` },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`Failed to list replays: ${response.status} - ${text}`);
      return [];
    }

    const data = await response.json();
    console.log('Replays API response:', JSON.stringify(data));
    // Handle null, array, and object response formats
    if (!data) {
      return [];
    }
    if (Array.isArray(data)) {
      return data;
    }
    return data.replays || data.items || [];
  } catch (error) {
    console.error('Error listing replays:', error);
    return [];
  }
}

// Download replay video from Kernel
async function downloadReplay(sessionId, replayId, localPath) {
  if (!KERNEL_API_KEY) return null;

  try {
    // Try the standard endpoint first
    let url = `${KERNEL_API_BASE}/browsers/${sessionId}/replays/${replayId}`;
    console.log(`Downloading replay from: ${url}`);
    let response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${KERNEL_API_KEY}` },
    });

    // If that fails, try with /download suffix
    if (!response.ok && response.status === 404) {
      url = `${KERNEL_API_BASE}/browsers/${sessionId}/replays/${replayId}/download`;
      console.log(`Retrying with: ${url}`);
      response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${KERNEL_API_KEY}` },
      });
    }

    if (!response.ok) {
      const text = await response.text();
      console.error(`Failed to download replay: ${response.status} - ${text}`);
      return null;
    }

    const buffer = await response.arrayBuffer();
    await fs.writeFile(localPath, Buffer.from(buffer));
    console.log(`Replay downloaded: ${localPath} (${buffer.byteLength} bytes)`);
    return localPath;
  } catch (error) {
    console.error('Error downloading replay:', error);
    return null;
  }
}

// Get or create session directory (organized by app)
function getSessionDir(appName, sessionId) {
  return path.join(RESULTS_DIR, appName, sessionId);
}

// Save session data (recordings, logs, metadata)
async function saveSessionData(appName, sessionId, payloadName, log, result, exitCode, downloadedFiles = []) {
  const sessionDir = getSessionDir(appName, sessionId);

  try {
    await fs.mkdir(sessionDir, { recursive: true });

    // Save metadata
    const metadata = {
      sessionId,
      app: appName,
      payloadName,
      timestamp: new Date().toISOString(),
      exitCode,
      result,
      hasRecording: false,
      files: downloadedFiles, // List of downloaded files in this session
    };

    // Save log
    await fs.writeFile(path.join(sessionDir, 'log.txt'), log);

    // Try to download replay
    const replays = await listReplays(sessionId);
    if (replays.length > 0) {
      const replay = replays[0]; // Get the first (usually only) replay
      metadata.replayViewUrl = replay.replay_view_url; // Always save the view URL

      const videoPath = path.join(sessionDir, 'recording.mp4');
      const downloaded = await downloadReplay(sessionId, replay.replay_id, videoPath);
      if (downloaded) {
        metadata.hasRecording = true;
      } else {
        // Download failed but we still have the view URL
        console.log('Recording download failed, but replay_view_url is available:', replay.replay_view_url);
      }
    }

    // Save metadata
    await fs.writeFile(path.join(sessionDir, 'metadata.json'), JSON.stringify(metadata, null, 2));

    console.log(`Session data saved: ${sessionDir}`);
    return sessionDir;
  } catch (error) {
    console.error('Error saving session data:', error);
    return null;
  }
}

// Middleware
app.use(express.json());
app.use(express.static(PUBLIC_DIR));

// Disable caching for API endpoints so payload changes are immediately visible
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Utility: Sanitize payload by masking sensitive values
function sanitizePayload(payload) {
  const sanitized = JSON.parse(JSON.stringify(payload));
  if (sanitized.variables) {
    for (const key of SENSITIVE_KEYS) {
      if (key in sanitized.variables) {
        sanitized.variables[key] = '***';
      }
    }
  }
  return sanitized;
}

// Utility: Validate payload name to prevent path traversal
function isValidPayloadName(name) {
  // Allow shared/ prefix and .md extension
  const cleanName = name.replace(/^shared\//, '');
  return /^[a-zA-Z0-9_-]+\.(json|md)$/.test(cleanName) && !name.includes('..');
}

// Utility: Get full path for a payload (handles shared/ prefix)
function getPayloadPath(name, app) {
  if (name.startsWith('shared/')) {
    const cleanName = name.replace(/^shared\//, '');
    return path.join(SHARED_PAYLOADS_DIR, cleanName);
  }
  return path.join(getPayloadsDir(app), name);
}

// GET /api/payloads - List all payload files for an app (includes shared payloads)
app.get('/api/payloads', async (req, res) => {
  try {
    const app = req.query.app || 'driver';
    const payloadsDir = getPayloadsDir(app);

    // Ensure directories exist
    await fs.mkdir(payloadsDir, { recursive: true });
    await fs.mkdir(SHARED_PAYLOADS_DIR, { recursive: true });

    // Get app-specific payloads
    const appFiles = await fs.readdir(payloadsDir);
    const appPayloads = appFiles
      .filter(f => f.endsWith('.json') || f.endsWith('.md'))
      .map(f => ({ name: f, source: 'app' }));

    // Get shared payloads
    const sharedFiles = await fs.readdir(SHARED_PAYLOADS_DIR);
    const sharedPayloads = sharedFiles
      .filter(f => f.endsWith('.json') || f.endsWith('.md'))
      .map(f => ({ name: `shared/${f}`, source: 'shared' }));

    // Combine and sort
    const allPayloads = [...appPayloads, ...sharedPayloads]
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json(allPayloads);
  } catch (error) {
    console.error('Error listing payloads:', error);
    res.status(500).json({ error: 'Failed to list payloads' });
  }
});

// GET /api/payloads/:name - Get a single payload (sanitized)
// Supports wildcard (*) to match shared/ prefix
app.get('/api/payloads/:name(*)', async (req, res) => {
  const { name } = req.params;
  const app = req.query.app || 'driver';

  if (!isValidPayloadName(name)) {
    return res.status(400).json({ error: 'Invalid payload name' });
  }

  try {
    const filePath = getPayloadPath(name, app);
    const content = await fs.readFile(filePath, 'utf-8');

    // Handle markdown files differently - return as-is with type indicator
    if (name.endsWith('.md')) {
      res.json({
        type: 'markdown',
        name,
        content,
        isShared: name.startsWith('shared/'),
      });
      return;
    }

    // JSON payloads - sanitize and return
    const payload = JSON.parse(content);

    // Check if payload has its own instruction or should use master
    const hasCustomInstruction = payload.instruction && payload.instruction.trim().length > 0;

    // If no custom instruction, load master prompt
    let instruction = payload.instruction;
    if (!hasCustomInstruction) {
      const masterPrompt = await loadMasterPrompt();
      if (masterPrompt) {
        instruction = masterPrompt;
      }
    }

    res.json({
      type: 'json',
      isShared: name.startsWith('shared/'),
      usesMasterPrompt: !hasCustomInstruction,
      ...sanitizePayload({ ...payload, instruction }),
    });
  } catch (error) {
    console.error('Error reading payload:', error);
    res.status(404).json({ error: 'Payload not found' });
  }
});

// POST /api/payloads - Save a new payload
app.post('/api/payloads', async (req, res) => {
  const { name, payload, content, originalName, app = 'driver' } = req.body;

  if (!name || !isValidPayloadName(name)) {
    return res.status(400).json({ error: 'Invalid payload name' });
  }

  // Determine target directory based on shared/ prefix
  const isShared = name.startsWith('shared/');
  const cleanName = isShared ? name.replace(/^shared\//, '') : name;
  const targetDir = isShared ? SHARED_PAYLOADS_DIR : getPayloadsDir(app);
  const filePath = path.join(targetDir, cleanName);

  try {
    // Ensure directory exists
    await fs.mkdir(targetDir, { recursive: true });

    // Handle markdown files
    if (name.endsWith('.md')) {
      await fs.writeFile(filePath, content || '');
      res.json({ success: true, name });
      return;
    }

    // Handle JSON payloads
    let finalPayload = { ...payload };

    // Strip URL if it matches the provider's default from shared/credentials
    if (finalPayload.url && req.body.carrierId) {
      const carrierConfig = await loadCarrierConfig(req.body.carrierId, req.body.carrierSource || null);
      if (carrierConfig && finalPayload.url === carrierConfig.url) {
        delete finalPayload.url;
      }
    }

    if (originalName && isValidPayloadName(originalName)) {
      const originalPath = getPayloadPath(originalName, app);
      try {
        const originalContent = await fs.readFile(originalPath, 'utf-8');
        const originalPayload = JSON.parse(originalContent);

        // Handle sensitive values:
        // - If new value is missing or '***' -> preserve from original
        // - If new value is '__CLEAR__' -> explicitly remove (don't preserve)
        // - If new value is a real value -> use the new value
        if (originalPayload.variables) {
          finalPayload.variables = finalPayload.variables || {};
          for (const key of SENSITIVE_KEYS) {
            const newValue = finalPayload.variables[key];
            const originalValue = originalPayload.variables[key];

            if (newValue === '__CLEAR__') {
              // Explicit clear - remove from payload
              delete finalPayload.variables[key];
            } else if ((!newValue || newValue === '***') && originalValue) {
              // Missing or masked - preserve original
              finalPayload.variables[key] = originalValue;
            }
            // else: new value provided, use it as-is
          }
        }
      } catch (e) {
        // Original file doesn't exist or isn't JSON, that's OK
      }
    }

    await fs.writeFile(filePath, JSON.stringify(finalPayload, null, 2));
    res.json({ success: true, name });
  } catch (error) {
    console.error('Error saving payload:', error);
    res.status(500).json({ error: 'Failed to save payload' });
  }
});

// GET /api/master-prompt - Get the master prompt template
app.get('/api/master-prompt', async (req, res) => {
  try {
    const content = await loadMasterPrompt();
    if (!content) {
      return res.status(404).json({ error: 'Master prompt not found' });
    }
    res.json({ content });
  } catch (error) {
    console.error('Error loading master prompt:', error);
    res.status(500).json({ error: 'Failed to load master prompt' });
  }
});

// PUT /api/master-prompt - Update the master prompt template
app.put('/api/master-prompt', async (req, res) => {
  const { content } = req.body;

  if (typeof content !== 'string') {
    return res.status(400).json({ error: 'Content must be a string' });
  }

  try {
    await fs.writeFile(MASTER_PROMPT_PATH, content);
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving master prompt:', error);
    res.status(500).json({ error: 'Failed to save master prompt' });
  }
});

// GET /api/carriers - List all carriers from credentials directory
app.get('/api/carriers', async (req, res) => {
  try {
    await fs.mkdir(CREDENTIALS_CARRIERS_DIR, { recursive: true });
    await fs.mkdir(CREDENTIALS_BENADMIN_DIR, { recursive: true });

    const loadFromDir = async (dir, category) => {
      try {
        const files = await fs.readdir(dir);
        const jsonFiles = files.filter(f => f.endsWith('.json'));
        return Promise.all(
          jsonFiles.map(async (f) => {
            const id = f.replace('.json', '');
            try {
              const content = await fs.readFile(path.join(dir, f), 'utf-8');
              const config = JSON.parse(content);
              return {
                id,
                name: config.name || id,
                url: config.url || '',
                category,
              };
            } catch {
              return { id, name: id, url: '', category };
            }
          })
        );
      } catch {
        return [];
      }
    };

    const [carriers, benadmin] = await Promise.all([
      loadFromDir(CREDENTIALS_CARRIERS_DIR, 'carrier'),
      loadFromDir(CREDENTIALS_BENADMIN_DIR, 'benadmin'),
    ]);

    const allCarriers = [...carriers, ...benadmin]
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json(allCarriers);
  } catch (error) {
    console.error('Error listing carriers:', error);
    res.status(500).json({ error: 'Failed to list carriers' });
  }
});

// GET /api/carriers/:name - Get a single carrier config (credentials sanitized)
// Supports ?source=carrier or ?source=benadmin to specify which directory
app.get('/api/carriers/:name', async (req, res) => {
  const { name } = req.params;
  const { source } = req.query;

  // Validate name to prevent path traversal
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    return res.status(400).json({ error: 'Invalid carrier name' });
  }

  try {
    const carrier = await loadCarrierConfig(name, source);
    if (!carrier) {
      return res.status(404).json({ error: 'Carrier not found' });
    }

    // Sanitize credentials for frontend display
    const sanitized = { ...carrier };
    if (sanitized.credentials) {
      sanitized.credentials = { ...sanitized.credentials };
      for (const key of SENSITIVE_KEYS) {
        if (key in sanitized.credentials) {
          sanitized.credentials[key] = '***';
        }
      }
    }

    res.json(sanitized);
  } catch (error) {
    console.error('Error reading carrier:', error);
    res.status(404).json({ error: 'Carrier not found' });
  }
});

// Helper: Load carrier config from shared/credentials/ directory
// Returns { name, url, credentials (op:// URLs), category }
async function loadCarrierConfig(carrierName, source = null) {
  if (!carrierName || !/^[a-zA-Z0-9_-]+$/.test(carrierName)) {
    return null;
  }

  const dirsToCheck = source === 'benadmin' ? [CREDENTIALS_BENADMIN_DIR] :
                      source === 'carrier' ? [CREDENTIALS_CARRIERS_DIR] :
                      [CREDENTIALS_CARRIERS_DIR, CREDENTIALS_BENADMIN_DIR];

  for (const dir of dirsToCheck) {
    try {
      const filePath = path.join(dir, `${carrierName}.json`);
      const content = await fs.readFile(filePath, 'utf-8');
      const config = JSON.parse(content);
      if (config.onepassword) {
        console.log(`[carrier] Loaded 1Password credentials for ${carrierName}`);
        return {
          name: config.name || carrierName,
          url: config.url || '',
          credentials: config.onepassword,
          category: dir === CREDENTIALS_BENADMIN_DIR ? 'benadmin' : 'carrier',
        };
      }
    } catch {
      // Not found in this directory, try next
    }
  }

  return null;
}

// Master prompt template path
const MASTER_PROMPT_PATH = path.join(SHARED_PAYLOADS_DIR, 'download_invoice.md');

// Helper: Load master prompt template
async function loadMasterPrompt() {
  try {
    return await fs.readFile(MASTER_PROMPT_PATH, 'utf-8');
  } catch (error) {
    console.error('[master-prompt] Failed to load master prompt:', error);
    return null;
  }
}

// App configurations
const APP_CONFIG = {
  driver: { appName: 'driver', action: 'download-task' },
  navigator: { appName: 'navigator', action: 'navigate-task' },
  'navigator-dev': { appName: 'navigator-DEV', action: 'navigate-task' },
  'navigator-stg': { appName: 'navigator-STG', action: 'navigate-task' },
  old: { appName: 'old', action: 'download-task' },
};

// POST /api/invoke - Run a payload with SSE streaming
app.post('/api/invoke', async (req, res) => {
  const { app = 'driver', payloadName, variableOverrides, proxyType, proxyCountry, profileName, maxSteps, agentModel, model, carrier } = req.body;

  // Validate app selection
  if (!APP_CONFIG[app]) {
    return res.status(400).json({ error: 'Invalid app. Must be "driver", "navigator", "navigator-dev", "navigator-stg", or "old"' });
  }

  if (!payloadName || !isValidPayloadName(payloadName)) {
    return res.status(400).json({ error: 'Invalid payload name' });
  }

  // Markdown files cannot be invoked directly
  if (payloadName.endsWith('.md')) {
    return res.status(400).json({ error: 'Cannot invoke markdown files directly. Use JSON payloads.' });
  }

  const payloadPath = getPayloadPath(payloadName, app);

  // Check if payload exists
  try {
    await fs.access(payloadPath);
  } catch {
    return res.status(404).json({ error: 'Payload not found' });
  }

  // Read and potentially modify the payload with variable overrides
  let effectivePayloadPath = payloadPath;
  let tempPayloadPath = null;

  try {
    const hasVariableOverrides = variableOverrides && Object.keys(variableOverrides).length > 0;
    const hasMaxStepsOverride = maxSteps && !isNaN(maxSteps);
    const hasCarrierOverride = carrier && carrier.trim();

    // Load carrier config if specified
    let carrierConfig = null;
    if (hasCarrierOverride) {
      carrierConfig = await loadCarrierConfig(carrier);
      if (carrierConfig) {
        console.log(`[invoke] Loaded carrier config: ${carrier}`);
      }
    }

    // Always read and process payload to handle master prompt resolution
    {
      // Read original payload
      const originalContent = await fs.readFile(payloadPath, 'utf-8');
      const payload = JSON.parse(originalContent);

      // If payload has no instruction, load master prompt
      if (!payload.instruction || payload.instruction.trim().length === 0) {
        const masterPrompt = await loadMasterPrompt();
        if (masterPrompt) {
          console.log('[invoke] Using master prompt (no custom instruction in payload)');
          payload.instruction = masterPrompt;
        } else {
          console.warn('[invoke] No instruction in payload and master prompt not found');
        }
      } else {
        console.log('[invoke] Using custom instruction from payload');
      }

      // Merge carrier config (URL and credentials) - carrier is base, payload/overrides take precedence
      if (carrierConfig) {
        // Set URL from carrier if not already set in payload
        if (carrierConfig.url && !payload.url) {
          payload.url = carrierConfig.url;
        }
        // Merge carrier credentials into variables
        if (carrierConfig.credentials) {
          payload.variables = payload.variables || {};
          for (const [key, value] of Object.entries(carrierConfig.credentials)) {
            // Carrier credentials are base - don't override existing values
            if (!(key in payload.variables) || payload.variables[key] === '***') {
              payload.variables[key] = value;
            }
          }
        }
        // Also set carrier name in variables if not set
        if (carrierConfig.name && !payload.variables?.carrier) {
          payload.variables = payload.variables || {};
          payload.variables.carrier = carrierConfig.name;
        }
      }

      // Merge variable overrides (including credentials if explicitly provided)
      if (hasVariableOverrides && payload.variables) {
        for (const [key, value] of Object.entries(variableOverrides)) {
          if (value !== undefined && value !== '') {
            payload.variables[key] = value;
          }
        }
      }

      // Apply bot detection overrides (top-level properties)
      if (proxyType) {
        payload.proxyType = proxyType;
      }
      if (proxyCountry) {
        payload.proxyCountry = proxyCountry;
      }
      if (profileName) {
        payload.profileName = profileName;
      }

      // Apply maxSteps override
      if (hasMaxStepsOverride) {
        payload.maxSteps = parseInt(maxSteps, 10);
      }

      // Apply model overrides
      if (agentModel) {
        if (app === 'navigator' || app === 'navigator-dev' || app === 'navigator-stg') {
          // Navigator uses 'model' field for the Gemini model
          payload.model = agentModel;
        } else {
          // Driver uses 'agentModel' for the CUA agent
          payload.agentModel = agentModel;
        }
      }
      if (model) {
        payload.model = model;
      }

      // Write to temp file
      tempPayloadPath = path.join('/tmp', `payload_${Date.now()}.json`);
      await fs.writeFile(tempPayloadPath, JSON.stringify(payload, null, 2));
      effectivePayloadPath = tempPayloadPath;
    }
  } catch (error) {
    console.error('Error preparing payload:', error);
    return res.status(500).json({ error: 'Failed to prepare payload' });
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Helper to send SSE events
  const sendEvent = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Cleanup temp file helper
  const cleanupTempFile = async () => {
    if (tempPayloadPath) {
      try {
        await fs.unlink(tempPayloadPath);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  };

  let liveViewUrlEmitted = false;
  let fullOutput = '';
  let taskResult = null;

  // Spawn kernel invoke process
  const { appName, action } = APP_CONFIG[app];
  const proc = spawn('kernel', [
    'invoke',
    appName,
    action,
    '--payload-file',
    effectivePayloadPath
  ], {
    env: { ...process.env, FORCE_COLOR: '0' }
  });

  sendEvent('started', { message: 'Kernel invocation started', payloadName });

  proc.stdout.on('data', (data) => {
    const text = data.toString();
    fullOutput += text;
    sendEvent('output', { type: 'stdout', text });

    // Check for live view URL (strip ANSI codes first)
    if (!liveViewUrlEmitted) {
      const cleanText = stripAnsi(text);
      const match = cleanText.match(LIVE_VIEW_REGEX);
      if (match) {
        liveViewUrlEmitted = true;
        sendEvent('liveViewUrl', { url: match[1] });
      }
    }
  });

  proc.stderr.on('data', (data) => {
    const text = data.toString();
    fullOutput += text;
    sendEvent('output', { type: 'stderr', text });

    // Also check stderr for live view URL (kernel logs to stderr)
    if (!liveViewUrlEmitted) {
      const cleanText = stripAnsi(text);
      const match = cleanText.match(LIVE_VIEW_REGEX);
      if (match) {
        liveViewUrlEmitted = true;
        sendEvent('liveViewUrl', { url: match[1] });
      }
    }
  });

  proc.on('close', async (code) => {
    await cleanupTempFile();

    // Try to parse result from output (strip ANSI codes first)
    const cleanOutput = stripAnsi(fullOutput);
    try {
      const resultMatch = cleanOutput.match(RESULT_REGEX);
      if (resultMatch) {
        // Trim whitespace and parse JSON
        const jsonStr = resultMatch[1].trim();
        taskResult = JSON.parse(jsonStr);
        console.log('Parsed task result:', JSON.stringify(taskResult, null, 2));
      } else {
        console.log('No result match found in output');
        // Log a snippet of the clean output for debugging
        const successIndex = cleanOutput.indexOf('SUCCESS  Result:');
        if (successIndex >= 0) {
          console.log('Found SUCCESS Result: at index', successIndex);
          console.log('Snippet:', cleanOutput.substring(successIndex, successIndex + 500));
        }
      }
    } catch (e) {
      console.error('Failed to parse result:', e);
    }

    // Download files from Kernel if we have session info and a files array
    let downloadedFiles = [];
    const files = taskResult?.files || [];
    if (taskResult?.sessionId && files.length > 0) {
      const sessionDir = getSessionDir(app, taskResult.sessionId);
      await fs.mkdir(sessionDir, { recursive: true });

      for (const file of files) {
        const downloaded = await downloadFromKernel(
          taskResult.sessionId,
          file.remotePath,
          file.filename,
          sessionDir
        );

        if (downloaded) {
          downloadedFiles.push({
            filename: downloaded.filename,
            size: downloaded.size,
          });
          sendEvent('fileDownloaded', {
            filename: downloaded.filename,
            size: downloaded.size,
          });
        }
      }
    }

    // Save session data (recording + logs + metadata)
    if (taskResult && taskResult.sessionId) {
      const sessionSaved = await saveSessionData(
        app,
        taskResult.sessionId,
        payloadName,
        cleanOutput,
        taskResult.result,
        code,
        downloadedFiles
      );
      if (sessionSaved) {
        sendEvent('historySaved', { sessionId: taskResult.sessionId, app });
      }
    }

    sendEvent('complete', { exitCode: code, result: taskResult });
    res.end();
  });

  proc.on('error', async (err) => {
    await cleanupTempFile();
    sendEvent('error', { message: err.message });
    res.end();
  });

  // Handle client disconnect
  req.on('close', () => {
    console.log('Client disconnected, killing process...');
    proc.kill('SIGTERM');
  });
});

// GET /api/sessions - List all sessions for an app
app.get('/api/sessions', async (req, res) => {
  const appName = req.query.app || 'driver';
  const appResultsDir = path.join(RESULTS_DIR, appName);

  try {
    // Ensure app results directory exists
    await fs.mkdir(appResultsDir, { recursive: true });

    const entries = await fs.readdir(appResultsDir, { withFileTypes: true });
    const sessions = await Promise.all(
      entries
        .filter(e => e.isDirectory())
        .map(async (e) => {
          try {
            const metadataPath = path.join(appResultsDir, e.name, 'metadata.json');
            const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
            return {
              id: e.name,
              app: appName,
              ...metadata,
            };
          } catch {
            return null;
          }
        })
    );
    res.json(sessions.filter(Boolean).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)));
  } catch (error) {
    res.json([]);
  }
});

// GET /api/sessions/:id - Get session details
app.get('/api/sessions/:id', async (req, res) => {
  const { id } = req.params;
  const appName = req.query.app || 'driver';
  const sessionDir = path.join(RESULTS_DIR, appName, id);

  try {
    const metadataPath = path.join(sessionDir, 'metadata.json');
    const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));

    // Try to get a fresh replay URL if we have a sessionId
    if (metadata.sessionId && !metadata.hasRecording) {
      try {
        const replays = await listReplays(metadata.sessionId);
        if (replays.length > 0) {
          metadata.replayViewUrl = replays[0].replay_view_url;
          metadata.replayId = replays[0].replay_id;
        }
      } catch (e) {
        console.log('Could not refresh replay URL:', e.message);
      }
    }

    res.json({ id, app: appName, ...metadata });
  } catch {
    res.status(404).json({ error: 'Session not found' });
  }
});

// GET /api/sessions/:id/recording - Get session recording video
app.get('/api/sessions/:id/recording', async (req, res) => {
  const { id } = req.params;
  const appName = req.query.app || 'driver';
  const videoPath = path.join(RESULTS_DIR, appName, id, 'recording.mp4');

  try {
    await fs.access(videoPath);
    res.setHeader('Content-Type', 'video/mp4');
    res.sendFile(videoPath);
  } catch {
    res.status(404).json({ error: 'Recording not found' });
  }
});

// GET /api/sessions/:id/log - Get session log
app.get('/api/sessions/:id/log', async (req, res) => {
  const { id } = req.params;
  const appName = req.query.app || 'driver';
  const logPath = path.join(RESULTS_DIR, appName, id, 'log.txt');

  try {
    const log = await fs.readFile(logPath, 'utf-8');
    res.setHeader('Content-Type', 'text/plain');
    res.send(log);
  } catch {
    res.status(404).json({ error: 'Log not found' });
  }
});

// GET /api/sessions/:id/files/:filename - Download or view a file from a session
// Use ?view=true to display inline instead of downloading
app.get('/api/sessions/:id/files/:filename', async (req, res) => {
  const { id, filename } = req.params;
  const { view, app: appName = 'driver' } = req.query;
  const filePath = path.join(RESULTS_DIR, appName, id, filename);

  try {
    await fs.access(filePath);

    if (view === 'true') {
      // Serve file inline for viewing
      const ext = path.extname(filename).toLowerCase();
      const mimeTypes = {
        '.pdf': 'application/pdf',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.txt': 'text/plain',
      };
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      const fileBuffer = await fs.readFile(filePath);
      res.send(fileBuffer);
    } else {
      // Download the file
      res.download(filePath);
    }
  } catch {
    res.status(404).json({ error: 'File not found' });
  }
});

// Backward compatibility aliases (preserve app query parameter)
app.get('/api/history', (req, res) => {
  const qs = req.query.app ? `?app=${req.query.app}` : '';
  res.redirect(`/api/sessions${qs}`);
});
app.get('/api/history/:id', (req, res) => {
  const qs = req.query.app ? `?app=${req.query.app}` : '';
  res.redirect(`/api/sessions/${req.params.id}${qs}`);
});
app.get('/api/history/:id/recording', (req, res) => {
  const qs = req.query.app ? `?app=${req.query.app}` : '';
  res.redirect(`/api/sessions/${req.params.id}/recording${qs}`);
});
app.get('/api/history/:id/log', (req, res) => {
  const qs = req.query.app ? `?app=${req.query.app}` : '';
  res.redirect(`/api/sessions/${req.params.id}/log${qs}`);
});

// Start server with automatic port fallback
function startServer(port, maxAttempts = 10) {
  const server = app.listen(port, () => {
    console.log(`CUA 3.0 Playground listening on http://localhost:${port}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && maxAttempts > 1) {
      console.log(`Port ${port} in use, trying ${port + 1}...`);
      startServer(port + 1, maxAttempts - 1);
    } else {
      throw err;
    }
  });
}

startServer(DEFAULT_PORT);
