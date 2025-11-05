import { Stagehand } from "@browserbasehq/stagehand";
import { Kernel, type KernelContext } from '@onkernel/sdk';

const kernel = new Kernel();

const app = kernel.app('ts-stagehand-bb');

interface SearchQueryInput {
    query: string;
}

interface SearchQueryOutput {
    pdfUrl: string;
    filename: string;
    remotePath: string;
    session_id: string;
}

// LLM API Keys are set in the environment during `kernel deploy <filename> -e OPENAI_API_KEY=XXX`
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

app.action<SearchQueryInput, SearchQueryOutput>(
    'headcount-task',
    async (ctx: KernelContext, payload?: SearchQueryInput): Promise<SearchQueryOutput> => {

        const query = payload?.query || 'kernel';

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
        await page.goto("https://dvins.com/Group.htm");

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
        const instruction = `Click the link containing the text "Click here for a combined Dental and Vision Plan Presentation packet showing all of our plans". This will navigate to the PDF page.`;

        console.log('Executing agent to click PDF link...');
        await agent.execute({
            instruction,
            maxSteps: 20,
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