/**
 * Driver - Browser automation using Stagehand's DOM-based abstractions
 *
 * This app uses Stagehand to "drive" the browser through programmatic DOM
 * interactions, semantic element targeting, and high-level action commands.
 */

import { Stagehand } from "@browserbasehq/stagehand";
import { Kernel, type KernelContext } from '@onkernel/sdk';
import type { DownloadTaskInput, DownloadTaskOutput, TaskResultStatus } from './types';
import { createAgentTools } from './tools';

const kernel = new Kernel();
const app = kernel.app('driver');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const DOWNLOAD_DIR = '/tmp/downloads';

if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set');
}

if (!GOOGLE_API_KEY) {
    throw new Error('GOOGLE_API_KEY is not set');
}

// System prompt that enforces structured result reporting
const RESULT_REPORTING_PROMPT = `
IMPORTANT: You MUST call the report_result tool before completing your task.
This tool reports the outcome of your work in a structured format.

CRITICAL DATE VALIDATION:
Before reporting success, you MUST verify that the document you are downloading matches the EXACT date requested in the instructions.
- Check the document title, filename, or date column carefully
- If the document date does NOT match the requested date, report "download_failed" with reason explaining the date mismatch
- Example: If asked for "June 2026" invoice but only "November 2025" is available, report download_failed with reason "Requested date June 2026 not found - only November 2025 available"
- Do NOT download a document with a different date than requested

Possible outcomes to report:
- success: Task completed, file downloaded WITH CORRECT DATE (include fileUrl and filename)
- login_failed: Could not log in (include reason like "invalid credentials" or "account locked")
- group_not_found: The specified group/account was not found (include the groupId)
- document_not_found: The requested document was not found (include description)
- download_failed: Found documents but the EXACT DATE requested is not available, OR download failed for another reason (include the date you were looking for and what dates were actually available)
- error: Any other error (include message)

Always call report_result with the appropriate status before finishing.
`;

app.action<DownloadTaskInput, DownloadTaskOutput>(
    'download-task',
    async (ctx: KernelContext, payload?: DownloadTaskInput): Promise<DownloadTaskOutput> => {
        const url = payload?.url;
        const instruction = payload?.instruction;
        const maxSteps = payload?.maxSteps;
        const model = payload?.model || "anthropic/claude-sonnet-4-5-20250929"; // Stagehand model for DOM operations
        const agentModel = payload?.agentModel || "google/gemini-2.5-computer-use-preview-10-2025"; // CUA model for visual navigation
        const baseSystemPrompt = payload?.systemPrompt || "You are a helpful assistant that can use a web browser. Do not ask follow up questions, the user will trust your judgement.";
        const variables = payload?.variables || {};
        const proxyType = payload?.proxyType;
        const proxyCountry = payload?.proxyCountry;
        const profileName = payload?.profileName;

        if (!url || !instruction || !maxSteps) {
            throw new Error('url, instruction, and maxSteps are required');
        }

        // Substitute non-sensitive variables in instruction (exclude credentials)
        console.log('[init] Preparing task...');
        const sensitiveKeys = ['username', 'password', 'totpSecret'];
        let resolvedInstruction = instruction;
        for (const [key, value] of Object.entries(variables)) {
            if (!sensitiveKeys.includes(key)) {
                console.log(`[init] Substituting %${key}% with value: ${value}`);
                resolvedInstruction = resolvedInstruction.replace(new RegExp(`%${key}%`, 'g'), value);
            }
        }
        console.log('[init] Variables to substitute:', Object.keys(variables).filter(k => !sensitiveKeys.includes(k)));

        console.log('[init] url:', url);
        console.log('[init] instruction:', resolvedInstruction);
        console.log('[init] maxSteps:', maxSteps);
        console.log('[init] stagehand model:', model);
        console.log('[init] agent model:', agentModel);
        console.log('[init] credentials provided:', Object.keys(variables).length > 0 ? Object.keys(variables).map(k => `${k}=***`).join(', ') : 'none');
        console.log('[init] proxy:', proxyType ? `${proxyType}${proxyCountry ? ` (${proxyCountry})` : ''}` : 'none');
        console.log('[init] profile:', profileName || 'none');

        // Create or get profile if specified (persists cookies/session for bot detection avoidance)
        let profileId: string | undefined;
        if (profileName) {
            try {
                // Try to get existing profile
                const existingProfile = await kernel.profiles.retrieve(profileName);
                profileId = existingProfile.id;
                console.log(`[browser] Using existing profile: ${profileName} (${profileId})`);
            } catch {
                // Profile doesn't exist, create it
                console.log(`[browser] Creating new profile: ${profileName}`);
                const newProfile = await kernel.profiles.create({ name: profileName });
                profileId = newProfile.id;
                console.log(`[browser] Profile created with ID: ${profileId}`);
            }
        }

        // Create proxy if specified (helps bypass bot detection like Cloudflare Turnstile)
        let proxyId: string | undefined;
        if (proxyType) {
            console.log(`[browser] Creating ${proxyType} proxy...`);
            const proxyConfig: { country?: string } = {};
            if (proxyCountry) {
                proxyConfig.country = proxyCountry;
            }
            const proxy = await kernel.proxies.create({
                name: `proxy-${ctx.invocation_id || Date.now()}`,
                type: proxyType,
                config: proxyConfig,
            });
            proxyId = proxy.id;
            console.log(`[browser] Proxy created with ID: ${proxyId}`);
        }

        // Create browser with stealth mode, proxy, and profile for maximum bot detection avoidance
        console.log('[browser] Creating browser instance...');
        const kernelBrowser = await kernel.browsers.create({
            invocation_id: ctx.invocation_id,
            stealth: true,
            viewport: { width: 1440, height: 900 },
            ...(proxyId && { proxy_id: proxyId }),
            ...(profileId && { profile: { id: profileId, save_changes: true } }),
        });
        console.log("[browser] Live view URL:", kernelBrowser.browser_live_view_url);

        // Start recording
        let replayId: string | null = null;
        try {
            const replay = await kernel.browsers.replays.start(kernelBrowser.session_id);
            replayId = replay.replay_id;
            console.log("[browser] Recording started with ID:", replayId);
        } catch (error) {
            console.log("[browser] Failed to start recording:", error);
        }

        // Initialize Stagehand
        // experimental: true + useAPI: false required for custom tools
        console.log('[stagehand] Initializing Stagehand...');
        const stagehand = new Stagehand({
            env: "LOCAL",
            localBrowserLaunchOptions: {
                cdpUrl: kernelBrowser.cdp_ws_url,
                downloadsPath: DOWNLOAD_DIR,
                acceptDownloads: true
            },
            model: model as any,
            apiKey: GOOGLE_API_KEY,
            verbose: 1, // Enable verbose logging for more visibility
            domSettleTimeout: 30_000,
            experimental: true,
            disableAPI: true,
        });
        await stagehand.init();
        console.log('[stagehand] Stagehand initialized');

        const page = stagehand.context.pages()[0];
        if (!page) {
            throw new Error('No page found in browser context');
        }

        console.log('[browser] Navigating to:', url);
        await page.goto(url);
        console.log('[browser] Page loaded');

        // Track files before download
        let filesBefore: string[] = [];
        try {
            const listResult = await kernel.browsers.fs.listFiles(kernelBrowser.session_id, { path: DOWNLOAD_DIR });
            filesBefore = listResult.map((f) => f.name);
            console.log('[download] Files before download:', filesBefore);
        } catch {
            console.log('[download] Download directory does not exist yet or is empty');
        }

        // Create agent tools with result capture
        console.log('[agent] Creating agent tools...');
        const { tools, getResult } = createAgentTools(stagehand, variables);

        // Create agent with tools and result-reporting prompt
        const systemPrompt = `${baseSystemPrompt}\n\n${RESULT_REPORTING_PROMPT}\n\nYou are currently on the following page: ${page.url()}.`;

        console.log('[agent] Initializing CUA agent...');
        const agent = stagehand.agent({
            model: {
                modelName: agentModel,
                apiKey: GOOGLE_API_KEY,
            },
            mode: 'cua',
            systemPrompt,
            tools,
        });

        // Execute task
        console.log('[agent] Executing task...');
        const agentResult = await agent.execute({ instruction: resolvedInstruction, maxSteps });
        console.log('[agent] Task execution completed');

        // Log agent execution summary
        if (agentResult) {
            console.log('[agent] Success:', agentResult.success);
            console.log('[agent] Message:', agentResult.message);
            if (agentResult.actions && agentResult.actions.length > 0) {
                console.log(`[agent] Total actions: ${agentResult.actions.length}`);
                for (const action of agentResult.actions) {
                    const reasoning = action.reasoning ? ` - ${action.reasoning.substring(0, 100)}${action.reasoning.length > 100 ? '...' : ''}` : '';
                    console.log(`[agent] Step: ${action.type}${reasoning}`);
                }
            }
        }

        // Get the structured result from the agent
        let result: TaskResultStatus = getResult() ?? { status: 'error', message: 'Agent did not report a result' };
        console.log('[result] Agent reported status:', result.status);

        // If agent reported success, verify the download actually happened
        if (result.status === 'success') {
            console.log('[download] Verifying file download...');
            let newFilename: string | null = null;
            const maxAttempts = 20;

            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                console.log(`[download] Checking for downloaded files (attempt ${attempt + 1}/${maxAttempts})...`);
                await new Promise(resolve => setTimeout(resolve, 1000));

                try {
                    const listResult = await kernel.browsers.fs.listFiles(kernelBrowser.session_id, { path: DOWNLOAD_DIR });
                    const filesAfter = listResult.map((f) => f.name);
                    const newFiles = filesAfter.filter((f) => !filesBefore.includes(f));

                    if (newFiles.length > 0 && newFiles[0]) {
                        newFilename = newFiles[0];
                        console.log('[download] New file detected:', newFilename);
                        break;
                    }
                } catch (error) {
                    console.log('[download] Error listing files:', error);
                }
            }

            if (newFilename) {
                const remotePath = `${DOWNLOAD_DIR}/${newFilename}`;
                console.log('[download] Remote path:', remotePath);
                console.log('[download] File successfully downloaded to remote filesystem');

                // Update result with actual file info
                result = {
                    status: 'success',
                    fileUrl: remotePath,
                    filename: newFilename,
                };

                // Stop recording before returning
                if (replayId) {
                    try {
                        await kernel.browsers.replays.stop(replayId, { id: kernelBrowser.session_id });
                        console.log("[cleanup] Recording stopped");
                    } catch (error) {
                        console.log("[cleanup] Failed to stop recording:", error);
                    }
                }

                // Clean up proxy
                if (proxyId) {
                    try {
                        await kernel.proxies.delete(proxyId);
                        console.log("[cleanup] Proxy deleted:", proxyId);
                    } catch (error) {
                        console.log("[cleanup] Failed to delete proxy:", error);
                    }
                }

                console.log('[result] Task completed successfully');
                return {
                    result,
                    remotePath,
                    sessionId: kernelBrowser.session_id
                };
            } else {
                // Agent said success but no file found
                console.log('[download] Agent reported success but no file found in download directory');
                result = {
                    status: 'download_failed',
                    reason: 'Agent reported success but no new file was detected in download directory'
                };
            }
        }

        // Stop recording before returning
        if (replayId) {
            try {
                await kernel.browsers.replays.stop(replayId, { id: kernelBrowser.session_id });
                console.log("[cleanup] Recording stopped");
            } catch (error) {
                console.log("[cleanup] Failed to stop recording:", error);
            }
        }

        // Clean up proxy
        if (proxyId) {
            try {
                await kernel.proxies.delete(proxyId);
                console.log("[cleanup] Proxy deleted:", proxyId);
            } catch (error) {
                console.log("[cleanup] Failed to delete proxy:", error);
            }
        }

        // Delete profile on failure to avoid reusing bad cookies/state
        if (profileName) {
            try {
                await kernel.profiles.delete(profileName);
                console.log("[cleanup] Profile deleted due to failure:", profileName);
            } catch (error) {
                console.log("[cleanup] Failed to delete profile:", error);
            }
        }

        // Return with failure result (no remotePath)
        console.log('[result] Task failed with status:', result.status);
        console.log('[result] Details:', JSON.stringify(result));
        return {
            result,
            sessionId: kernelBrowser.session_id
        };
    },
);

// Local execution support
if (import.meta.url === `file://${process.argv[1]}`) {
    console.log('Running Driver locally...');
    // Add local test execution here if needed
}
