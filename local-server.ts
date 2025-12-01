/**
 * Local test server for the Stagehand CUA agent.
 *
 * This runs a local Express server that mimics the Kernel action endpoint,
 * but uses a local browser instead of Kernel's remote browser.
 *
 * Usage:
 *   npx tsx local-server.ts
 *
 * Then call from cua_v2.py with:
 *   KERNEL_BASE_URL=http://localhost:3001 KERNEL_APP_NAME=local KERNEL_ACTION_NAME=download-task
 */

import express from 'express';
import { Stagehand } from "@browserbasehq/stagehand";
import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';

const app = express();
app.use(express.json());

const PORT = process.env.LOCAL_SERVER_PORT || 3001;
const DOWNLOAD_DIR = process.env.LOCAL_DOWNLOAD_DIR || '/tmp/stagehand-downloads';

// Ensure download directory exists
if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set in .env');
}

if (!GOOGLE_API_KEY) {
    throw new Error('GOOGLE_API_KEY is not set in .env');
}

interface DownloadTaskInput {
    url: string;
    instruction: string;
    maxSteps: number;
    model?: string;
    agentModel?: string;
    systemPrompt?: string;
}

interface DownloadTaskOutput {
    pdfUrl: string;
    filename: string;
    remotePath: string;
    session_id: string;
}

// Mimic Kernel's action invoke endpoint
// POST /apps/:appName/actions/:actionName/invoke
app.post('/apps/:appName/actions/:actionName/invoke', async (req, res) => {
    const { appName, actionName } = req.params;
    const payload: DownloadTaskInput = req.body;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`Received request: ${appName}/${actionName}`);
    console.log(`${'='.repeat(60)}`);

    try {
        const result = await executeDownloadTask(payload);
        res.json(result);
    } catch (error: any) {
        console.error('Error executing task:', error);
        res.status(500).json({
            error: error.message || 'Unknown error',
            invocation_id: 'local-' + Date.now(),
        });
    }
});

// File download endpoint (mimic Kernel's browser fs download)
// POST /browsers/:sessionId/fs/download
app.post('/browsers/:sessionId/fs/download', async (req, res) => {
    const { sessionId } = req.params;
    const { path: filePath } = req.body;

    console.log(`\nDownload request for session ${sessionId}: ${filePath}`);

    try {
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found' });
        }

        const fileStream = fs.createReadStream(filePath);
        const filename = path.basename(filePath);

        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'application/octet-stream');

        fileStream.pipe(res);
    } catch (error: any) {
        console.error('Error downloading file:', error);
        res.status(500).json({ error: error.message });
    }
});

async function executeDownloadTask(payload: DownloadTaskInput): Promise<DownloadTaskOutput> {
    const url = payload.url;
    const instruction = payload.instruction;
    const maxSteps = payload.maxSteps;
    const model = payload.model || "openai/gpt-4.1";
    const agentModel = payload.agentModel || "google/gemini-2.5-computer-use-preview-10-2025";
    const systemPrompt = payload.systemPrompt || "You are a helpful assistant that can use a web browser. Do not ask follow up questions, the user will trust your judgement.";

    if (!url || !instruction || !maxSteps) {
        throw new Error('url, instruction, and maxSteps are required');
    }

    console.log('url:', url);
    console.log('instruction:', instruction);
    console.log('maxSteps:', maxSteps);
    console.log('stagehand model:', model);
    console.log('agent model:', agentModel);

    // Generate a session ID for this run
    const sessionId = `local-${Date.now()}`;

    // Initialize Stagehand with LOCAL browser
    const stagehand = new Stagehand({
        env: "LOCAL",
        model,
        apiKey: OPENAI_API_KEY,
        verbose: 1,
        domSettleTimeout: 30_000,
        localBrowserLaunchOptions: {
            headless: false, // Show browser for debugging
        },
    });

    await stagehand.init();

    try {
        // List files before
        const filesBefore = fs.existsSync(DOWNLOAD_DIR)
            ? fs.readdirSync(DOWNLOAD_DIR)
            : [];
        console.log('Files before download:', filesBefore);

        // Navigate to URL using the page's goto method
        const page = stagehand.context.activePage();
        if (!page) {
            throw new Error('No active page found');
        }
        await page.goto(url, { waitUntil: 'load' });

        // Create Computer Use Agent
        const agent = stagehand.agent({
            model: {
                modelName: agentModel,
                apiKey: GOOGLE_API_KEY,
            },
            cua: true,
            systemPrompt: systemPrompt,
        });

        // Execute the instruction
        console.log('Executing agent...');
        await agent.execute({
            instruction,
            maxSteps
        });
        console.log('Agent completed.');

        // Wait for download to complete
        let newFilename: string | null = null;
        let attempts = 0;
        const maxAttempts = 30; // Wait up to 30 seconds

        while (attempts < maxAttempts) {
            console.log(`Checking for downloaded files (attempt ${attempts + 1}/${maxAttempts})...`);
            await new Promise(resolve => setTimeout(resolve, 1000));

            const filesAfter = fs.readdirSync(DOWNLOAD_DIR);
            const newFiles = filesAfter.filter(f => !filesBefore.includes(f) && !f.endsWith('.crdownload'));

            if (newFiles.length > 0 && newFiles[0]) {
                newFilename = newFiles[0];
                console.log('New file detected:', newFilename);
                break;
            }

            attempts++;
        }

        if (!newFilename) {
            throw new Error('Download did not complete within expected time (no new files detected)');
        }

        const remotePath = path.join(DOWNLOAD_DIR, newFilename);
        console.log('File path:', remotePath);
        console.log('Download completed successfully.');

        return {
            pdfUrl: url,
            filename: newFilename,
            remotePath,
            session_id: sessionId
        };

    } finally {
        // Close the browser
        await stagehand.close();
    }
}

app.listen(PORT, () => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Local Stagehand CUA server running on http://localhost:${PORT}`);
    console.log(`${'='.repeat(60)}`);
    console.log(`\nTo test from Python, set these env vars:`);
    console.log(`  KERNEL_BASE_URL=http://localhost:${PORT}`);
    console.log(`  KERNEL_APP_NAME=local`);
    console.log(`  KERNEL_ACTION_NAME=download-task`);
    console.log(`\nDownloads will be saved to: ${DOWNLOAD_DIR}`);
    console.log(`${'='.repeat(60)}\n`);
});