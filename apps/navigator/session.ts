/**
 * Kernel Browser Session Manager.
 *
 * Provides a class for managing Kernel browser lifecycle
 * with optional video replay recording.
 */

import type { Kernel } from '@onkernel/sdk';
import { DEFAULT_SCREEN_SIZE } from './tools/types/gemini';

export interface SessionOptions {
  stealth?: boolean;
  timeoutSeconds?: number;
  recordReplay?: boolean;
  replayGracePeriod?: number;
  invocationId?: string;
  proxyId?: string;
}

export interface SessionInfo {
  sessionId: string;
  liveViewUrl: string;
  replayId?: string;
  replayViewUrl?: string;
  downloadedFile?: {
    filename: string;
    remotePath: string;
  };
}

const DEFAULT_OPTIONS: Required<Omit<SessionOptions, 'invocationId' | 'proxyId'>> = {
  stealth: true,
  timeoutSeconds: 300,
  recordReplay: false,
  replayGracePeriod: 5.0,
};

export class KernelBrowserSession {
  private kernel: Kernel;
  private options: SessionOptions;

  // Session state
  private _sessionId: string | null = null;
  private _liveViewUrl: string | null = null;
  private _replayId: string | null = null;
  private _replayViewUrl: string | null = null;

  constructor(kernel: Kernel, options: SessionOptions = {}) {
    this.kernel = kernel;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  get sessionId(): string {
    if (!this._sessionId) {
      throw new Error('Session not started. Call start() first.');
    }
    return this._sessionId;
  }

  get liveViewUrl(): string | null {
    return this._liveViewUrl;
  }

  get replayViewUrl(): string | null {
    return this._replayViewUrl;
  }

  get info(): SessionInfo {
    return {
      sessionId: this.sessionId,
      liveViewUrl: this._liveViewUrl || '',
      replayId: this._replayId || undefined,
      replayViewUrl: this._replayViewUrl || undefined,
    };
  }

  async start(): Promise<SessionInfo> {
    // Create browser with specified settings
    const browser = await this.kernel.browsers.create({
      stealth: this.options.stealth ?? DEFAULT_OPTIONS.stealth,
      timeout_seconds: this.options.timeoutSeconds ?? DEFAULT_OPTIONS.timeoutSeconds,
      viewport: {
        width: DEFAULT_SCREEN_SIZE.width,
        height: DEFAULT_SCREEN_SIZE.height,
      },
      ...(this.options.invocationId && { invocation_id: this.options.invocationId }),
      ...(this.options.proxyId && { proxy_id: this.options.proxyId }),
    });

    this._sessionId = browser.session_id;
    this._liveViewUrl = browser.browser_live_view_url;

    console.log(`[session] Browser created: ${this._sessionId}`);
    console.log(`[session] Live view URL: ${this._liveViewUrl}`);

    // Start replay recording if enabled
    if (this.options.recordReplay) {
      try {
        await this.startReplay();
      } catch (error) {
        console.warn(`[session] Warning: Failed to start replay recording: ${error}`);
        console.warn('[session] Continuing without replay recording.');
      }
    }

    return this.info;
  }

  private async startReplay(): Promise<void> {
    if (!this._sessionId) {
      return;
    }

    console.log('[session] Starting replay recording...');
    const replay = await this.kernel.browsers.replays.start(this._sessionId);
    this._replayId = replay.replay_id;
    console.log(`[session] Replay recording started: ${this._replayId}`);
  }

  private async stopReplay(): Promise<void> {
    if (!this._sessionId || !this._replayId) {
      return;
    }

    console.log('[session] Stopping replay recording...');
    await this.kernel.browsers.replays.stop(this._replayId, {
      id: this._sessionId,
    });
    console.log('[session] Replay recording stopped. Processing video...');

    // Wait a moment for processing
    await this.sleep(2000);

    // Poll for replay to be ready (with timeout)
    const maxWait = 60000; // 60 seconds
    const startTime = Date.now();
    let replayReady = false;

    while (Date.now() - startTime < maxWait) {
      try {
        const replays = await this.kernel.browsers.replays.list(this._sessionId);
        for (const replay of replays) {
          if (replay.replay_id === this._replayId) {
            this._replayViewUrl = replay.replay_view_url;
            replayReady = true;
            break;
          }
        }
        if (replayReady) {
          break;
        }
      } catch {
        // Ignore errors while polling
      }
      await this.sleep(1000);
    }

    if (!replayReady) {
      console.log('[session] Warning: Replay may still be processing');
    } else if (this._replayViewUrl) {
      console.log(`[session] Replay view URL: ${this._replayViewUrl}`);
    }
  }

  async stop(): Promise<SessionInfo> {
    // Build info object directly to avoid throwing if session wasn't started
    const currentSessionId = this._sessionId;
    const info: SessionInfo = {
      sessionId: currentSessionId || '',
      liveViewUrl: this._liveViewUrl || '',
      replayId: this._replayId || undefined,
      replayViewUrl: this._replayViewUrl || undefined,
    };

    if (currentSessionId) {
      try {
        // Stop replay if recording was enabled
        if (this.options.recordReplay && this._replayId) {
          // Wait grace period before stopping to capture final state
          const gracePeriod = this.options.replayGracePeriod ?? DEFAULT_OPTIONS.replayGracePeriod;
          if (gracePeriod > 0) {
            console.log(`[session] Waiting ${gracePeriod}s grace period...`);
            await this.sleep(gracePeriod * 1000);
          }
          await this.stopReplay();
          info.replayViewUrl = this._replayViewUrl || undefined;
        }
      } finally {
        // Don't destroy the session - let it timeout naturally
        // This allows external clients to download files via Kernel API
        console.log(`[session] Session ${currentSessionId} left alive for file access (will auto-expire)`);
      }
    }

    // Reset state
    this._sessionId = null;
    this._liveViewUrl = null;
    this._replayId = null;
    this._replayViewUrl = null;

    return info;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
