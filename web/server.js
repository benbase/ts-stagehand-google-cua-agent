require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3001;

// Kernel API configuration
const KERNEL_API_BASE = 'https://api.onkernel.com';
const KERNEL_API_KEY = process.env.KERNEL_API_KEY;

if (!KERNEL_API_KEY) {
  console.warn('Warning: KERNEL_API_KEY not set. File downloads from Kernel will not work.');
}

// Paths
const APPS_DIR = path.join(__dirname, '..', 'apps');
const PUBLIC_DIR = path.join(__dirname, 'public');

// Get payloads directory for a specific app
function getPayloadsDir(app) {
  return path.join(APPS_DIR, app || 'driver', 'payloads');
}

// Sensitive keys that should never be exposed to frontend
const SENSITIVE_KEYS = ['username', 'password', 'totpSecret'];

// Regex to extract live view URL from kernel output
// Matches: "Kernel browser live view url:", "[browser] Live view URL:", or "[browser] Live view:"
const LIVE_VIEW_REGEX = /(?:Kernel browser live view url|\[browser\] Live view(?: URL)?):\s*(https?:\/\/[^\s\x1B]+)/i;

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
    // Handle both array and object response formats
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

// Get or create session directory
function getSessionDir(sessionId) {
  return path.join(RESULTS_DIR, sessionId);
}

// Save session data (recordings, logs, metadata)
async function saveSessionData(sessionId, payloadName, log, result, exitCode, downloadedFiles = []) {
  const sessionDir = getSessionDir(sessionId);

  try {
    await fs.mkdir(sessionDir, { recursive: true });

    // Save metadata
    const metadata = {
      sessionId,
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
  return /^[a-zA-Z0-9_-]+\.json$/.test(name) && !name.includes('..');
}

// GET /api/payloads - List all payload files for an app
app.get('/api/payloads', async (req, res) => {
  try {
    const app = req.query.app || 'driver';
    const payloadsDir = getPayloadsDir(app);
    // Ensure directory exists
    await fs.mkdir(payloadsDir, { recursive: true });
    const files = await fs.readdir(payloadsDir);
    const payloads = files.filter(f => f.endsWith('.json')).sort();
    res.json(payloads);
  } catch (error) {
    console.error('Error listing payloads:', error);
    res.status(500).json({ error: 'Failed to list payloads' });
  }
});

// GET /api/payloads/:name - Get a single payload (sanitized)
app.get('/api/payloads/:name', async (req, res) => {
  const { name } = req.params;
  const app = req.query.app || 'driver';

  if (!isValidPayloadName(name)) {
    return res.status(400).json({ error: 'Invalid payload name' });
  }

  try {
    const filePath = path.join(getPayloadsDir(app), name);
    const content = await fs.readFile(filePath, 'utf-8');
    const payload = JSON.parse(content);
    res.json(sanitizePayload(payload));
  } catch (error) {
    console.error('Error reading payload:', error);
    res.status(404).json({ error: 'Payload not found' });
  }
});

// POST /api/payloads - Save a new payload
app.post('/api/payloads', async (req, res) => {
  const { name, payload, originalName, app = 'driver' } = req.body;

  if (!name || !isValidPayloadName(name)) {
    return res.status(400).json({ error: 'Invalid payload name' });
  }

  const payloadsDir = getPayloadsDir(app);

  try {
    // Ensure directory exists
    await fs.mkdir(payloadsDir, { recursive: true });
    // If there's an original payload, merge credentials from it
    let finalPayload = { ...payload };

    if (originalName && isValidPayloadName(originalName)) {
      const originalPath = path.join(payloadsDir, originalName);
      const originalContent = await fs.readFile(originalPath, 'utf-8');
      const originalPayload = JSON.parse(originalContent);

      // Merge sensitive values from original if they're masked
      if (finalPayload.variables && originalPayload.variables) {
        for (const key of SENSITIVE_KEYS) {
          if (finalPayload.variables[key] === '***' && originalPayload.variables[key]) {
            finalPayload.variables[key] = originalPayload.variables[key];
          }
        }
      }
    }

    const filePath = path.join(payloadsDir, name);
    await fs.writeFile(filePath, JSON.stringify(finalPayload, null, 2));
    res.json({ success: true, name });
  } catch (error) {
    console.error('Error saving payload:', error);
    res.status(500).json({ error: 'Failed to save payload' });
  }
});

// App configurations
const APP_CONFIG = {
  driver: { appName: 'driver', action: 'download-task' },
  navigator: { appName: 'navigator', action: 'navigate-task' },
};

// POST /api/invoke - Run a payload with SSE streaming
app.post('/api/invoke', async (req, res) => {
  const { app = 'driver', payloadName, variableOverrides, proxyType, proxyCountry, profileName, maxSteps, agentModel, model } = req.body;

  // Validate app selection
  if (!APP_CONFIG[app]) {
    return res.status(400).json({ error: 'Invalid app. Must be "driver" or "navigator"' });
  }

  if (!payloadName || !isValidPayloadName(payloadName)) {
    return res.status(400).json({ error: 'Invalid payload name' });
  }

  const payloadPath = path.join(getPayloadsDir(app), payloadName);

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
    const hasBotDetectionOverrides = proxyType || proxyCountry || profileName;
    const hasMaxStepsOverride = maxSteps && !isNaN(maxSteps);
    const hasModelOverrides = agentModel || model;

    if (hasVariableOverrides || hasBotDetectionOverrides || hasMaxStepsOverride || hasModelOverrides) {
      // Read original payload
      const originalContent = await fs.readFile(payloadPath, 'utf-8');
      const payload = JSON.parse(originalContent);

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
        if (app === 'navigator') {
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

    // Download file from Kernel if we have session info and a remote path
    let downloadedFiles = [];
    if (taskResult && taskResult.sessionId && taskResult.remotePath) {
      // Create session directory first
      const sessionDir = getSessionDir(taskResult.sessionId);
      await fs.mkdir(sessionDir, { recursive: true });

      const filename = taskResult.result?.filename || path.basename(taskResult.remotePath);

      const downloadedFile = await downloadFromKernel(
        taskResult.sessionId,
        taskResult.remotePath,
        filename,
        sessionDir
      );

      if (downloadedFile) {
        downloadedFiles.push({
          filename: downloadedFile.filename,
          size: downloadedFile.size,
        });
        taskResult.downloadedFile = downloadedFile;
        sendEvent('fileDownloaded', {
          filename: downloadedFile.filename,
          size: downloadedFile.size,
        });
      }
    }

    // Save session data (recording + logs + metadata)
    if (taskResult && taskResult.sessionId) {
      const sessionSaved = await saveSessionData(
        taskResult.sessionId,
        payloadName,
        cleanOutput,
        taskResult.result,
        code,
        downloadedFiles
      );
      if (sessionSaved) {
        sendEvent('historySaved', { sessionId: taskResult.sessionId });
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

// GET /api/sessions - List all sessions
app.get('/api/sessions', async (req, res) => {
  try {
    const entries = await fs.readdir(RESULTS_DIR, { withFileTypes: true });
    const sessions = await Promise.all(
      entries
        .filter(e => e.isDirectory())
        .map(async (e) => {
          try {
            const metadataPath = path.join(RESULTS_DIR, e.name, 'metadata.json');
            const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
            return {
              id: e.name,
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
  const sessionDir = path.join(RESULTS_DIR, id);

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

    res.json({ id, ...metadata });
  } catch {
    res.status(404).json({ error: 'Session not found' });
  }
});

// GET /api/sessions/:id/recording - Get session recording video
app.get('/api/sessions/:id/recording', async (req, res) => {
  const { id } = req.params;
  const videoPath = path.join(RESULTS_DIR, id, 'recording.mp4');

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
  const logPath = path.join(RESULTS_DIR, id, 'log.txt');

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
  const { view } = req.query;
  const filePath = path.join(RESULTS_DIR, id, filename);

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

// Backward compatibility aliases
app.get('/api/history', (req, res) => res.redirect('/api/sessions'));
app.get('/api/history/:id', (req, res) => res.redirect(`/api/sessions/${req.params.id}`));
app.get('/api/history/:id/recording', (req, res) => res.redirect(`/api/sessions/${req.params.id}/recording`));
app.get('/api/history/:id/log', (req, res) => res.redirect(`/api/sessions/${req.params.id}/log`));

// Start server
app.listen(PORT, () => {
  console.log(`CUA 2.0 Playground listening on http://localhost:${PORT}`);
});
