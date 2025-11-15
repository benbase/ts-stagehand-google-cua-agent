import { Stagehand } from "@browserbasehq/stagehand";
import { Kernel, type KernelContext } from '@onkernel/sdk';

const kernel = new Kernel();

const app = kernel.app('ts-stagehand-bb');

interface DownloadTaskInput {
    url: string;
    instruction: string;
    maxSteps: number;
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

        if (!url || !instruction || !maxSteps) {
            throw new Error('url, instruction, and maxSteps are required');
        }

        console.log('url:', url);
        console.log('instruction:', instruction);
        console.log('maxSteps:', maxSteps);

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
            },
            model: "openai/gpt-4.1",
            apiKey: OPENAI_API_KEY,
            verbose: 1,
            domSettleTimeout: 30_000
        });
        await stagehand.init();

        /////////////////////////////////////
        // Your Stagehand implementation here
        /////////////////////////////////////
        const page = stagehand.context.pages()[0];
        await page.goto(url);

        // Create Gemini CUA agent
        const agent = stagehand.agent({
            model: {
                modelName: "google/gemini-2.5-computer-use-preview-10-2025",
                apiKey: GOOGLE_API_KEY,
            },
            cua: true,
            systemPrompt: `You are a helpful assistant that can use a web browser.
      You are currently on the following page: ${page.url()}.
      Do not ask follow up questions, the user will trust your judgement.`,
        });

        // Use agent to click the PDF link
        
        console.log('Executing agent to click PDF link...');
        await agent.execute({
            instruction,
            maxSteps
        });
        console.log('Agent completed. PDF opened in new tab.');

        // Get the active page (the newly opened PDF tab)
        const pdfPage = stagehand.context.activePage();
        if (!pdfPage) {
            throw new Error('No active page found after agent execution');
        }
        const pdfUrl = pdfPage.url();
        console.log('PDF URL:', pdfUrl);

        // Download the PDF using page evaluation with fetch
        console.log('Downloading PDF...');
        const buffer = await pdfPage.evaluate(async (url: string) => {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            return Array.from(new Uint8Array(arrayBuffer));
        }, pdfUrl);

        // Extract filename from URL
        const filename = pdfUrl.split('/').pop() || 'download.pdf';
        const remotePath = `${DOWNLOAD_DIR}/${filename}`;
        console.log('Remote path:', remotePath);

        // Write the PDF to Kernel's remote filesystem
        console.log('Writing file to remote filesystem...');
        const bufferData = Buffer.from(buffer);
        await kernel.browsers.fs.writeFile(
            kernelBrowser.session_id,
            bufferData,
            { path: remotePath }
        );

        // Return information for the local client to download the file
        console.log('PDF downloaded to remote filesystem. Return session info for local client.');

        return {
            pdfUrl,
            filename,
            remotePath,
            session_id: kernelBrowser.session_id
        };
    },
);