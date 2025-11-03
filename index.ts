import { Stagehand } from "@browserbasehq/stagehand";
import client, { Kernel, type KernelContext } from '@onkernel/sdk';
import { chromium } from 'playwright';
import fs from 'fs';
import pTimeout from 'p-timeout';

const kernel = new Kernel({
  apiKey: process.env.KERNEL_API_KEY
});

const app = kernel.app('ts-stagehand-google-cua-agent');

const DOWNLOAD_DIR = '/tmp/downloads';

interface SearchQueryOutput {
  success: boolean;
  result: string;
  downloadedFile?: string;
}

// API Keys for LLM providers
// - GOOGLE_API_KEY: Required for Gemini 2.5 Computer Use Agent
// - OPENAI_API_KEY: Required for Stagehand's GPT-4o model
// Set via environment variables or `kernel deploy <filename> --env-file .env`
// See https://docs.onkernel.com/launch/deploy#environment-variables
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY is not set');
}

if (!GOOGLE_API_KEY) {
  throw new Error('GOOGLE_API_KEY is not set');
}

async function runStagehandTask(invocationId?: string): Promise<SearchQueryOutput> {
  // Executes a Computer Use Agent (CUA) task using Gemini 2.5 and Stagehand
  //
  // This function supports dual execution modes:
  // - Action Handler Mode: Called with invocation_id from Kernel app action context
  // - Local Mode: Called without invocation_id for direct script execution
  //
  // Args:
  //     invocationId: Optional Kernel invocation ID to associate browser with action
  //
  // App Actions Returns:
  //     SearchQueryOutput: Success status and result message from the agent
  // Local Execution Returns:
  //     Logs the result of the agent execution

  const browserOptions = invocationId
    ? { invocation_id: invocationId, stealth: true }
    : { stealth: true };

  const kernelBrowser = await kernel.browsers.create(browserOptions);

  console.log("Kernel browser live view url: ", kernelBrowser.browser_live_view_url);

  // Step 2: Set up download directory using CDP
  console.log('Configuring download directory...');
  const browser = await chromium.connectOverCDP(kernelBrowser.cdp_ws_url);
  const context = browser.contexts()[0] || (await browser.newContext());
  const page = context.pages()[0] || (await context.newPage());

  const cdpClient = await context.newCDPSession(page);
  await cdpClient.send('Browser.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: DOWNLOAD_DIR,
    eventsEnabled: true,
  });

  // Set up CDP listeners to capture download filename and completion
  let downloadFilename: string | undefined;
  let downloadCompletedResolve!: () => void;
  const downloadCompleted = new Promise<void>((resolve) => {
    downloadCompletedResolve = resolve;
  });

  cdpClient.on('Browser.downloadWillBegin', (event: any) => {
    downloadFilename = event.suggestedFilename ?? 'unknown';
    console.log('Download started:', downloadFilename);
  });

  cdpClient.on('Browser.downloadProgress', (event: any) => {
    if (event.state === 'completed' || event.state === 'canceled') {
      console.log('Download state:', event.state);
      downloadCompletedResolve();
    }
  });

  // Close the Playwright connection, but keep the browser running for Stagehand
  await browser.close();

  const stagehand = new Stagehand({
    env: "LOCAL",
    verbose: 1,
    domSettleTimeoutMs: 30_000,
    modelName: "gpt-4o",
    modelClientOptions: {
      apiKey: OPENAI_API_KEY
    },
    localBrowserLaunchOptions: {
      cdpUrl: kernelBrowser.cdp_ws_url
    }
  });
  await stagehand.init();

  /////////////////////////////////////
  // Step 3: Run Gemini CUA to download file
  /////////////////////////////////////
  try {
    const stagePage = stagehand.page;

    const agent = stagehand.agent({
      provider: "google",
      model: "gemini-2.5-computer-use-preview-10-2025",
      instructions: `You are a helpful assistant that can use a web browser.
      You are currently on the following page: ${stagePage.url()}.
      Do not ask follow up questions, the user will trust your judgement.`,
      options: {
        apiKey: GOOGLE_API_KEY,
      }
    });

    // Navigate to a test page with downloadable PDFs
    await stagePage.goto("https://dvins.com/Group.htm");

    // Define the instructions for the CUA agent
    // Example: Download a PDF or file from the page
    const instruction = "Download the combined Dental and Vision Plan Presentation packet";

    // Execute the instruction
    const result = await agent.execute({
      instruction,
      maxSteps: 20,
    });

    console.log("Agent result: ", result);

    // Step 4: Wait for download to complete and stream file back to local machine
    let localFilePath: string | undefined;
    
    try {
      console.log('Waiting for download to complete...');
      await pTimeout(downloadCompleted, {
        milliseconds: 30_000,
        message: new Error('Download timed out after 30 seconds'),
      });
      console.log('Download completed successfully');

      if (!downloadFilename) {
        throw new Error('Unable to determine download filename');
      }

      const remotePath = `${DOWNLOAD_DIR}/${downloadFilename}`;
      console.log(`Reading file from Kernel VM: ${remotePath}`);

      const resp = await kernel.browsers.fs.readFile(kernelBrowser.session_id, {
        path: remotePath,
      });

      const bytes = await resp.bytes();
      fs.mkdirSync('downloads', { recursive: true });
      localFilePath = `downloads/${downloadFilename}`;
      fs.writeFileSync(localFilePath, bytes);
      console.log(`File saved locally to: ${localFilePath}`);
    } catch (downloadError) {
      console.warn('No file was downloaded or download timed out:', downloadError);
      // Continue execution even if download fails
    }

    console.log("Deleting browser and closing stagehand...");
    await stagehand.close();
    await kernel.browsers.deleteByID(kernelBrowser.session_id);
    
    return { 
      success: true, 
      result: result.message,
      downloadedFile: localFilePath
    };
  } catch (error) {
    console.error(error);
    console.log("Deleting browser and closing stagehand...");
    await stagehand.close();
    await kernel.browsers.deleteByID(kernelBrowser.session_id);
    return { success: false, result: "" };
  }
}

// Register Kernel action handler for remote invocation
// Invoked via: kernel invoke ts-stagehand-google-cua-agent google-cua-agent-task
app.action<void, SearchQueryOutput>(
  'google-cua-agent-task',
  async (ctx: KernelContext): Promise<SearchQueryOutput> => {
    return runStagehandTask(ctx.invocation_id);
  },
);

// Run locally if executed directly (not imported as a module)
// Execute via: npx tsx index.ts
if (import.meta.url === `file://${process.argv[1]}`) {
  runStagehandTask().then(result => {
    console.log('Local execution result:', result);
    process.exit(result.success ? 0 : 1);
  }).catch(error => {
    console.error('Local execution failed:', error);
    process.exit(1);
  });
}