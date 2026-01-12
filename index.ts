import { Stagehand } from "@browserbasehq/stagehand";
import { Kernel, type KernelContext } from '@onkernel/sdk';
import type { DownloadTaskInput, DownloadTaskOutput, TaskResultStatus } from './types';
import { createAgentTools } from './tools';

const kernel = new Kernel();
const app = kernel.app('ts-stagehand-bb');

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

Possible outcomes to report:
- success: Task completed, file downloaded (include fileUrl and filename)
- login_failed: Could not log in (include reason like "invalid credentials" or "account locked")
- group_not_found: The specified group/account was not found (include the groupId)
- document_not_found: The requested document was not found (include description)
- download_failed: Found the document but download failed (include reason)
- error: Any other error (include message)

Always call report_result with the appropriate status before finishing.
`;

app.action<DownloadTaskInput, DownloadTaskOutput>(
    'download-task',
    async (ctx: KernelContext, payload?: DownloadTaskInput): Promise<DownloadTaskOutput> => {
        const url = payload?.url;
        const instruction = payload?.instruction;
        const maxSteps = payload?.maxSteps;
        const model = payload?.model || "openai/gpt-4.1";
        const agentModel = payload?.agentModel || "google/gemini-2.5-computer-use-preview-10-2025";
        const baseSystemPrompt = payload?.systemPrompt || "You are a helpful assistant that can use a web browser. Do not ask follow up questions, the user will trust your judgement.";
        const variables = payload?.variables || {};

        if (!url || !instruction || !maxSteps) {
            throw new Error('url, instruction, and maxSteps are required');
        }

        // Substitute non-sensitive variables in instruction (exclude credentials)
        const sensitiveKeys = ['username', 'password', 'totp_secret'];
        let resolvedInstruction = instruction;
        for (const [key, value] of Object.entries(variables)) {
            if (!sensitiveKeys.includes(key)) {
                console.log(`Substituting %${key}% with value: ${value}`);
                resolvedInstruction = resolvedInstruction.replace(new RegExp(`%${key}%`, 'g'), value);
            }
        }
        console.log('Variables to substitute:', Object.keys(variables).filter(k => !sensitiveKeys.includes(k)));

        console.log('url:', url);
        console.log('instruction:', resolvedInstruction);
        console.log('maxSteps:', maxSteps);
        console.log('stagehand model:', model);
        console.log('agent model:', agentModel);
        console.log('credentials provided:', Object.keys(variables).length > 0 ? Object.keys(variables).map(k => `${k}=***`).join(', ') : 'none');

        // Create browser
        const kernelBrowser = await kernel.browsers.create({
            invocation_id: ctx.invocation_id,
            stealth: true,
            viewport: { width: 1440, height: 900 },
        });
        console.log("Kernel browser live view url:", kernelBrowser.browser_live_view_url);

        // Initialize Stagehand
        // experimental: true + useAPI: false required for custom tools
        const stagehand = new Stagehand({
            env: "LOCAL",
            localBrowserLaunchOptions: {
                cdpUrl: kernelBrowser.cdp_ws_url,
                downloadsPath: DOWNLOAD_DIR,
                acceptDownloads: true
            },
            model,
            apiKey: OPENAI_API_KEY,
            verbose: 0,
            domSettleTimeout: 30_000,
            experimental: true,
            disableAPI: true,
        });
        await stagehand.init();

        const page = stagehand.context.pages()[0];
        if (!page) {
            throw new Error('No page found in browser context');
        }

        await page.goto(url);

        // Track files before download
        let filesBefore: string[] = [];
        try {
            const listResult = await kernel.browsers.fs.listFiles(kernelBrowser.session_id, { path: DOWNLOAD_DIR });
            filesBefore = listResult.map((f) => f.name);
            console.log('Files before download:', filesBefore);
        } catch {
            console.log('Download directory does not exist yet or is empty');
        }

        // Create agent tools with result capture
        const { tools, getResult } = createAgentTools(stagehand, variables);

        // Create agent with tools and result-reporting prompt
        const systemPrompt = `${baseSystemPrompt}\n\n${RESULT_REPORTING_PROMPT}\n\nYou are currently on the following page: ${page.url()}.`;

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
        console.log('Executing agent task...');
        await agent.execute({ instruction: resolvedInstruction, maxSteps });
        console.log('Agent completed.');

        // Get the structured result from the agent
        let result: TaskResultStatus = getResult() ?? { status: 'error', message: 'Agent did not report a result' };

        // If agent reported success, verify the download actually happened
        if (result.status === 'success') {
            let newFilename: string | null = null;
            const maxAttempts = 20;

            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                console.log(`Checking for downloaded files (attempt ${attempt + 1}/${maxAttempts})...`);
                await new Promise(resolve => setTimeout(resolve, 1000));

                try {
                    const listResult = await kernel.browsers.fs.listFiles(kernelBrowser.session_id, { path: DOWNLOAD_DIR });
                    const filesAfter = listResult.map((f) => f.name);
                    const newFiles = filesAfter.filter((f) => !filesBefore.includes(f));

                    if (newFiles.length > 0 && newFiles[0]) {
                        newFilename = newFiles[0];
                        console.log('New file detected:', newFilename);
                        break;
                    }
                } catch (error) {
                    console.log('Error listing files:', error);
                }
            }

            if (newFilename) {
                const remotePath = `${DOWNLOAD_DIR}/${newFilename}`;
                console.log('Remote path:', remotePath);
                console.log('File successfully downloaded to remote filesystem.');

                // Update result with actual file info
                result = {
                    status: 'success',
                    fileUrl: remotePath,
                    filename: newFilename,
                };

                return {
                    result,
                    remotePath,
                    session_id: kernelBrowser.session_id
                };
            } else {
                // Agent said success but no file found
                result = {
                    status: 'download_failed',
                    reason: 'Agent reported success but no new file was detected in download directory'
                };
            }
        }

        // Return with failure result (no remotePath)
        console.log('Task result:', JSON.stringify(result));
        return {
            result,
            session_id: kernelBrowser.session_id
        };
    },
);
