import { Stagehand } from "@browserbasehq/stagehand";
import { Kernel, type KernelContext } from '@onkernel/sdk';

const kernel = new Kernel();

const app = kernel.app('ts-stagehand-bb');

interface DownloadTaskInput {
    url: string; // Target URL to navigate to
    instruction: string; // Task instructions for the agent (use %variableName% placeholders for sensitive data)
    maxSteps: number; // Maximum number of steps the agent can take
    model?: string; // Stagehand model for DOM analysis and element extraction
    agentModel?: string; // Computer Use Agent model for executing task instructions
    systemPrompt?: string; // System prompt for the Computer Use Agent
    variables?: Record<string, string>; // Sensitive data (credentials, etc.) - kept out of prompts/logs via Stagehand's variable substitution
}

interface DownloadTaskOutput {
    pdfUrl: string;
    filename: string;
    remotePath: string;
    session_id: string;
}

// LLM API Keys are set in the environment during `kernel deploy index.ts --env-file .env`
// See https://www.onkernel.com/docs/apps/deploy#environment-variables
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const DOWNLOAD_DIR = '/tmp/downloads';

if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set');
}

if (!GOOGLE_API_KEY) {
    throw new Error('GOOGLE_API_KEY is not set');
}

app.action<DownloadTaskInput, DownloadTaskOutput>(
    'download-task',
    async (ctx: KernelContext, payload?: DownloadTaskInput): Promise<DownloadTaskOutput> => {

        const url = payload?.url
        const instruction = payload?.instruction
        const maxSteps = payload?.maxSteps
        // Stagehand model: used for DOM analysis and element extraction
        const model = payload?.model || "openai/gpt-4.1"
        // Agent model: used for executing task instructions via Computer Use Agent
        const agentModel = payload?.agentModel || "google/gemini-2.5-computer-use-preview-10-2025"
        // System prompt: guides the agent's behavior
        const systemPrompt = payload?.systemPrompt || "You are a helpful assistant that can use a web browser. Do not ask follow up questions, the user will trust your judgement."
        // Variables for sensitive data (credentials) - kept out of prompts/logs
        const variables = payload?.variables || {}

        if (!url || !instruction || !maxSteps) {
            throw new Error('url, instruction, and maxSteps are required');
        }

        console.log('url:', url);
        console.log('instruction:', instruction);
        console.log('maxSteps:', maxSteps);
        console.log('stagehand model:', model);
        console.log('agent model:', agentModel);
        console.log('variables provided:', Object.keys(variables).length > 0 ? Object.keys(variables).join(', ') : 'none');

        const kernelBrowser = await kernel.browsers.create({
            invocation_id: ctx.invocation_id,
            stealth: true,
            viewport: {
                width: 1440,
                height: 900,
            },
        });

        console.log("Kernel browser live view url: ", kernelBrowser.browser_live_view_url);

        const stagehand = new Stagehand({
            env: "LOCAL",
            localBrowserLaunchOptions: {
                cdpUrl: kernelBrowser.cdp_ws_url,
                downloadsPath: DOWNLOAD_DIR,
                acceptDownloads: true
            },
            model,
            apiKey: OPENAI_API_KEY,
            verbose: 0, // Disabled to prevent sensitive data from appearing in logs
            domSettleTimeout: 30_000
        });
        await stagehand.init();

        /////////////////////////////////////
        // Stagehand implementation
        /////////////////////////////////////
        const page = stagehand.context.pages()[0];
        if (!page) {
            throw new Error('No page found in browser context');
        }

        await page.goto(url);

        // List files in download directory before agent execution
        let filesBefore: string[] = [];
        try {
            const listResult = await kernel.browsers.fs.listFiles(kernelBrowser.session_id, { path: DOWNLOAD_DIR });
            filesBefore = listResult.map((f) => f.name);
            console.log('Files before download:', filesBefore);
        } catch (error) {
            console.log('Download directory does not exist yet or is empty');
        }

        // Create Computer Use Agent
        const agent = stagehand.agent({
            model: {
                modelName: agentModel,
                apiKey: GOOGLE_API_KEY,
            },
            cua: true,
            systemPrompt: `${systemPrompt}\n\nYou are currently on the following page: ${page.url()}.`,
        });

        // Substitute variables into instruction (keeps sensitive data out of logs)
        // Variables use %variableName% syntax (e.g., "type %username% into the email field")
        let resolvedInstruction = instruction;
        for (const [key, value] of Object.entries(variables)) {
            resolvedInstruction = resolvedInstruction.replace(new RegExp(`%${key}%`, 'g'), value);
        }

        // Execute the agent task
        console.log('Executing agent task...');
        await agent.execute({
            instruction: resolvedInstruction,
            maxSteps
        });
        console.log('Agent completed.');

        // Wait and check for new files in download directory
        let newFilename: string | null = null;
        let attempts = 0;
        const maxAttempts = 20; // Wait up to 20 seconds

        while (attempts < maxAttempts) {
            console.log(`Checking for downloaded files (attempt ${attempts + 1}/${maxAttempts})...`);
            await new Promise(resolve => setTimeout(resolve, 1000));

            try {
                const listResult = await kernel.browsers.fs.listFiles(kernelBrowser.session_id, { path: DOWNLOAD_DIR });
                const filesAfter = listResult.map((f) => f.name);

                // Find new files
                const newFiles = filesAfter.filter((f) => !filesBefore.includes(f));
                if (newFiles.length > 0 && newFiles[0]) {
                    newFilename = newFiles[0]; // Take the first new file
                    console.log('New file detected:', newFilename);
                    break;
                }
            } catch (error) {
                console.log('Error listing files:', error);
            }

            attempts++;
        }

        if (!newFilename) {
            throw new Error('Download did not complete within expected time (no new files detected)');
        }

        // The file is already in DOWNLOAD_DIR with the correct filename
        const remotePath = `${DOWNLOAD_DIR}/${newFilename}`;
        console.log('Remote path:', remotePath);
        console.log('PDF successfully downloaded to remote filesystem.');

        // Return information for the local client to download the file
        return {
            pdfUrl: url, // Original URL where we started
            filename: newFilename,
            remotePath,
            session_id: kernelBrowser.session_id
        };
    },
);