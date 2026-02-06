/**
 * Navigator - Computer Use Agent using Kernel's Computer Controls API
 *
 * This app uses direct screen-based navigation via screenshots and
 * Kernel's Computer Controls API (clickMouse, typeText, etc.) using
 * Google's Gemini Computer Use model.
 *
 * Based on the Kernel gemini-computer-use template.
 */

import { Kernel, type KernelContext } from '@onkernel/sdk';
import { samplingLoop } from './loop';
import { KernelBrowserSession } from './session';
import type { NavigatorTaskInput, NavigatorTaskOutput, TaskResultStatus } from './types';
import type { Credentials } from '../shared/tools/types';


const kernel = new Kernel();
const app = kernel.app('navigator');

// API Key for Gemini
// Set via environment variables or `kernel deploy <filename> --env-file .env`
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

if (!GOOGLE_API_KEY) {
  throw new Error(
    'GOOGLE_API_KEY is not set. ' +
    'Set it via environment variable or deploy with: kernel deploy index.ts --env-file .env'
  );
}

app.action<NavigatorTaskInput, NavigatorTaskOutput>(
  'navigate-task',
  async (ctx: KernelContext, payload?: NavigatorTaskInput): Promise<NavigatorTaskOutput> => {
    const url = payload?.url;
    const instruction = payload?.instruction;
    const maxSteps = payload?.maxSteps ?? 50;
    const model = payload?.model ?? 'gemini-2.5-computer-use-preview-10-2025';
    const proxyType = payload?.proxyType;
    const proxyCountry = payload?.proxyCountry;
    const recordReplay = payload?.recordReplay ?? true; // Record by default
    const variables = payload?.variables ?? {};

    // Extract credentials from variables
    const credentials: Credentials = {
      username: variables.username ?? '',
      password: variables.password ?? '',
      totpSecret: variables.totpSecret,
      carrier: variables.carrier,
    };

    if (!url || !instruction) {
      throw new Error('url and instruction are required');
    }

    // Auto-compute invoiceMonthNumber from invoiceMonth (e.g. "January" → "01")
    const monthMap: Record<string, string> = {
      january: '01', february: '02', march: '03', april: '04',
      may: '05', june: '06', july: '07', august: '08',
      september: '09', october: '10', november: '11', december: '12',
    };
    if (variables.invoiceMonth && !variables.invoiceMonthNumber) {
      const num = monthMap[variables.invoiceMonth.toLowerCase()];
      if (num) {
        variables.invoiceMonthNumber = num;
      }
    }

    // Substitute non-sensitive variables in instruction (exclude credentials)
    const sensitiveKeys = ['username', 'password', 'totpSecret'];
    let resolvedInstruction = instruction;

    // Always substitute %url% with the URL
    resolvedInstruction = resolvedInstruction.replace(/%url%/g, url);

    for (const [key, value] of Object.entries(variables)) {
      if (!sensitiveKeys.includes(key) && value) {
        resolvedInstruction = resolvedInstruction.replace(new RegExp(`%${key}%`, 'g'), String(value));
      }
    }

    console.log('[init] Starting Navigator task...');
    console.log('[init] URL:', url);
    console.log('[init] Instruction:', resolvedInstruction);
    console.log('[init] Max steps:', maxSteps);
    console.log('[init] Model:', model);
    console.log('[init] Has credentials:', !!credentials.username);
    console.log('[init] Variables substituted:', Object.keys(variables).filter(k => !sensitiveKeys.includes(k)));

    // Create proxy if specified
    let proxyId: string | undefined;
    if (proxyType) {
      console.log(`[browser] Creating ${proxyType} proxy...`);
      const proxy = await kernel.proxies.create({
        name: `navigator-proxy-${ctx.invocation_id ?? Date.now()}`,
        type: proxyType,
        config: proxyCountry ? { country: proxyCountry } : {},
      });
      proxyId = proxy.id;
      console.log(`[browser] Proxy created: ${proxyId}`);
    }

    // Create browser session
    const session = new KernelBrowserSession(kernel, {
      stealth: true,
      recordReplay,
      invocationId: ctx.invocation_id,
      proxyId,
    });

    await session.start();
    console.log('[browser] Session ID:', session.sessionId);
    console.log('[browser] Live view:', session.liveViewUrl);

    // Track files before task runs (for download detection)
    // Check multiple possible download directories
    const downloadDirs = [
      '/home/kernel/Downloads',
      '/home/kernel',
      '/tmp',
      '/root/Downloads',
      '/root',
    ];
    const filesBefore: string[] = [];

    for (const dir of downloadDirs) {
      try {
        const listResult = await kernel.browsers.fs.listFiles(session.sessionId, { path: dir });
        const files = listResult.map((f: { name: string }) => f.name);
        filesBefore.push(...files);
        console.log(`[download] ${dir}: ${files.length} files`);
      } catch {
        // Directory doesn't exist yet, that's fine
      }
    }

    let result: TaskResultStatus = { status: 'error', message: 'Task did not complete' };
    let remotePath: string | undefined;

    try {
      // Build the full query with URL navigation instruction
      const fullQuery = `Navigate to ${url} and then: ${resolvedInstruction}`;

      // Run the Gemini sampling loop
      const loopResult = await samplingLoop({
        model,
        query: fullQuery,
        apiKey: GOOGLE_API_KEY,
        kernel,
        sessionId: session.sessionId,
        maxIterations: maxSteps,
        credentials,
        onResult: (taskResult) => {
          result = taskResult;
        },
      });

      // Use task result if available, otherwise use default
      if (loopResult.taskResult) {
        result = loopResult.taskResult;
      }

      if (loopResult.error) {
        console.error('[navigator] Loop error:', loopResult.error);
        if (result.status !== 'success') {
          result = { status: 'error', message: loopResult.error };
        }
      }

      console.log(`[navigator] Completed in ${loopResult.iterations} iterations`);

      // Check for downloaded files if task was successful
      if (result.status === 'success') {
        console.log('[download] Checking for downloaded files...');
        const maxAttempts = 10;

        // Only look for actual document files (PDFs, archives, etc.)
        const isDocumentFile = (filename: string): boolean => {
          const ext = filename.toLowerCase().split('.').pop();
          return ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'zip', 'rar', '7z', 'gz', 'tar'].includes(ext || '');
        };

        // Multiple directories to check for downloads
        const searchDirs = [
          '/home/kernel/Downloads',
          '/home/kernel',
          '/tmp',
          '/root/Downloads',
          '/root',
        ];

        // Get expected filename from result if available
        const expectedFilename = result.filename;
        if (expectedFilename) {
          console.log('[download] Looking for expected file:', expectedFilename);
        }

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          // Search through all directories
          for (const dir of searchDirs) {
            try {
              const listResult = await kernel.browsers.fs.listFiles(session.sessionId, { path: dir });
              const filesInDir = listResult.map((f: { name: string }) => f.name);

              // Look for new document files, prioritizing expected filename
              let targetFile: string | undefined;

              if (expectedFilename && filesInDir.includes(expectedFilename)) {
                targetFile = expectedFilename;
              } else {
                // Look for any new document files not in our baseline
                const newFiles = filesInDir.filter((f: string) =>
                  !filesBefore.includes(f) && isDocumentFile(f)
                );
                if (newFiles.length > 0) {
                  targetFile = newFiles[0];
                }
              }

              if (targetFile) {
                remotePath = `${dir}/${targetFile}`;
                console.log('[download] File found:', targetFile);
                console.log('[download] Remote path:', remotePath);
                // File will be downloaded by web server via Kernel API
                break;
              }
            } catch {
              // Directory doesn't exist or isn't accessible, continue to next
            }
          }

          if (remotePath) {
            break; // Found the file, stop retrying
          }

          if (attempt < maxAttempts - 1) {
            console.log(`[download] No files found yet, waiting... (${attempt + 1}/${maxAttempts})`);
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }

        if (!remotePath) {
          console.log('[download] No downloaded files found in any location');
          // Log which directories were checked
          console.log('[download] Searched directories:', searchDirs.join(', '));
        }
      }
    } catch (error) {
      console.error('[navigator] Error in sampling loop:', error);
      result = { status: 'error', message: String(error) };
    } finally {
      // Stop session and cleanup
      const sessionInfo = await session.stop();

      // Cleanup proxy
      if (proxyId) {
        try {
          await kernel.proxies.delete(proxyId);
          console.log('[cleanup] Proxy deleted');
        } catch (error) {
          console.log('[cleanup] Failed to delete proxy:', error);
        }
      }

      return {
        result,
        sessionId: sessionInfo.sessionId,
        replayUrl: sessionInfo.replayViewUrl,
        ...(remotePath && { remotePath }),
      };
    }
  }
);

// Run locally if executed directly (not imported as a module)
// Execute via: npx tsx index.ts
if (import.meta.url === `file://${process.argv[1]}`) {
  const testQuery = 'Navigate to https://www.google.com and describe what you see';

  console.log('Running local test with query:', testQuery);

  const session = new KernelBrowserSession(kernel, {
    stealth: true,
    recordReplay: false,
  });

  session.start().then(async () => {
    try {
      const result = await samplingLoop({
        model: 'gemini-2.5-computer-use-preview-10-2025',
        query: testQuery,
        apiKey: GOOGLE_API_KEY,
        kernel,
        sessionId: session.sessionId,
      });
      console.log('Result:', result.finalResponse);
      if (result.error) {
        console.error('Error:', result.error);
      }
    } finally {
      await session.stop();
    }
    process.exit(0);
  }).catch(error => {
    console.error('Local execution failed:', error);
    process.exit(1);
  });
}
