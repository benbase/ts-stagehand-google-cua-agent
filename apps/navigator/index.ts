/**
 * Navigator - Computer Use Agent using Kernel's Computer Controls API
 *
 * This app uses direct screen-based navigation via screenshots and
 * Kernel's Computer Controls API (clickMouse, typeText, etc.) instead
 * of DOM-based abstractions like Stagehand.
 *
 * Supports tool calling for secure operations like login.
 */

import { Kernel, type KernelContext } from '@onkernel/sdk';
import { GoogleGenAI, Type, type Content, type FunctionDeclaration } from '@google/genai';
import type { NavigatorTaskInput, NavigatorTaskOutput, TaskResultStatus } from './types';
import type { Credentials } from '../shared/tools/types';
import {
    NAVIGATOR_TOOLS,
    executeLogin,
    executeReportResult,
    type PerformLoginParams,
} from './tools';

const kernel = new Kernel();
const app = kernel.app('navigator');

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

if (!GOOGLE_API_KEY) {
    throw new Error('GOOGLE_API_KEY is not set');
}

const genai = new GoogleGenAI({ apiKey: GOOGLE_API_KEY });

// System prompt for the CUA with tool support
const SYSTEM_PROMPT = `You are a computer use agent that controls a web browser by calling functions.
You receive screenshots and must call ONE function to interact with the page.

Available functions:
- click(x, y): Click at coordinates
- type_text(text): Type text at cursor (NOT for passwords)
- press_key(key): Press key like "Enter", "Tab", "Escape"
- scroll(x, y, direction): Scroll "up" or "down"
- perform_login(usernameFieldX/Y, passwordFieldX/Y, submitButtonX/Y): Securely fill login credentials
- report_result(status, message): End task with result

CRITICAL RULES:
1. Call EXACTLY ONE function per turn
2. For login forms, ALWAYS use perform_login
3. Be precise with coordinates - examine the screenshot carefully
4. For perform_login: provide coordinates of the INPUT BOXES (not the label text above them) and the submit button
5. After perform_login, check next screenshot to verify login success
6. Call report_result when task is done or cannot continue
`;

interface AgentResponse {
    reasoning: string;
    toolCall?: {
        name: string;
        args: Record<string, unknown>;
    };
}

// Convert our tool definitions to Gemini FunctionDeclaration format
function getGeminiFunctionDeclarations(): FunctionDeclaration[] {
    return NAVIGATOR_TOOLS.map(tool => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters as unknown as FunctionDeclaration['parameters'],
    }));
}

async function captureAndAnalyze(
    sessionId: string,
    instruction: string,
    conversationHistory: Content[],
    model: string
): Promise<AgentResponse> {
    // Capture screenshot - returns a Response object
    const screenshotResponse = await kernel.browsers.computer.captureScreenshot(sessionId);
    const screenshotBuffer = await screenshotResponse.arrayBuffer();
    const screenshotBase64 = Buffer.from(screenshotBuffer).toString('base64');

    // Add screenshot to conversation
    const userMessage: Content = {
        role: 'user',
        parts: [
            {
                inlineData: {
                    mimeType: 'image/png',
                    data: screenshotBase64,
                },
            },
            {
                text: conversationHistory.length === 0
                    ? `Task: ${instruction}\n\nAnalyze this screenshot and decide what action to take or which tool to call.`
                    : 'Here is the current state of the browser. What should I do next?',
            },
        ],
    };

    conversationHistory.push(userMessage);

    // Call Gemini with the screenshot and tools
    // Note: We don't use responseSchema with tools because toolCall.args varies by tool
    const response = await genai.models.generateContent({
        model,
        contents: conversationHistory,
        config: {
            systemInstruction: SYSTEM_PROMPT,
            tools: [{
                functionDeclarations: getGeminiFunctionDeclarations(),
            }],
        },
    });

    // Check if Gemini returned a function call
    const candidate = response.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];

    let result: AgentResponse = { reasoning: '' };

    for (const part of parts) {
        // Handle function call
        if (part.functionCall && part.functionCall.name) {
            result.reasoning = `Calling tool: ${part.functionCall.name}`;
            result.toolCall = {
                name: part.functionCall.name,
                args: (part.functionCall.args ?? {}) as Record<string, unknown>,
            };

            // Add function call to history
            const modelMessage: Content = {
                role: 'model',
                parts: [{ functionCall: part.functionCall }],
            };
            conversationHistory.push(modelMessage);

            return result;
        }

        // Handle text response (action)
        if (part.text) {
            try {
                const parsed = JSON.parse(part.text) as AgentResponse;
                result = parsed;
            } catch {
                // If not valid JSON, treat as reasoning
                result.reasoning = part.text;
            }

            // Add text response to history
            const modelMessage: Content = {
                role: 'model',
                parts: [{ text: part.text }],
            };
            conversationHistory.push(modelMessage);
        }
    }

    return result;
}

app.action<NavigatorTaskInput, NavigatorTaskOutput>(
    'navigate-task',
    async (ctx: KernelContext, payload?: NavigatorTaskInput): Promise<NavigatorTaskOutput> => {
        const url = payload?.url;
        const instruction = payload?.instruction;
        const maxSteps = payload?.maxSteps ?? 30;
        // Navigator uses native Gemini SDK (no 'google/' prefix needed)
        const model = payload?.model ?? 'gemini-2.5-computer-use-preview-10-2025';
        const proxyType = payload?.proxyType;
        const proxyCountry = payload?.proxyCountry;
        const variables = payload?.variables ?? {};

        // Extract credentials from variables
        const credentials: Credentials = {
            username: variables.username ?? '',
            password: variables.password ?? '',
            totpSecret: variables.totpSecret,
            email2faProvider: variables.email2faProvider,
        };

        if (!url || !instruction) {
            throw new Error('url and instruction are required');
        }

        console.log('[init] Starting Navigator task...');
        console.log('[init] URL:', url);
        console.log('[init] Instruction:', instruction);
        console.log('[init] Max steps:', maxSteps);
        console.log('[init] Model:', model);
        console.log('[init] Has credentials:', !!credentials.username);

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

        // Create browser with Computer Controls support
        // Note: Viewport must match allowed recording dimensions (1200x800@25 is closest to 1280x800)
        console.log('[browser] Creating browser instance...');
        const browser = await kernel.browsers.create({
            invocation_id: ctx.invocation_id,
            stealth: true,
            viewport: { width: 1200, height: 800 },
            ...(proxyId && { proxy_id: proxyId }),
        });

        console.log('[browser] Session ID:', browser.session_id);
        console.log('[browser] Live view:', browser.browser_live_view_url);
        console.log('[browser] Navigating to:', url);

        // Navigate using Computer Controls (pure vision-based approach)
        // Focus address bar with Ctrl+L
        console.log('[browser] Focusing address bar...');
        await kernel.browsers.computer.pressKey(browser.session_id, {
            keys: ['ctrl+l'],
        });
        await new Promise(resolve => setTimeout(resolve, 500));

        // Type the URL
        console.log('[browser] Typing URL...');
        await kernel.browsers.computer.typeText(browser.session_id, {
            text: url,
            delay: 10,
        });
        await new Promise(resolve => setTimeout(resolve, 300));

        // Press Enter to navigate
        await kernel.browsers.computer.pressKey(browser.session_id, {
            keys: ['Return'],
        });
        console.log('[browser] Navigation initiated');

        // Wait for initial page load
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Run the agent loop
        const conversationHistory: Content[] = [];
        let result: TaskResultStatus = { status: 'error', message: 'Task did not complete' };
        let stepCount = 0;
        let taskComplete = false;

        while (stepCount < maxSteps && !taskComplete) {
            stepCount++;
            console.log(`\n[step ${stepCount}/${maxSteps}] Analyzing screen...`);

            try {
                const response = await captureAndAnalyze(
                    browser.session_id,
                    instruction,
                    conversationHistory,
                    model
                );

                console.log(`[step ${stepCount}] Reasoning: ${response.reasoning}`);

                // Handle function calls
                if (response.toolCall) {
                    const { name, args } = response.toolCall;
                    console.log(`[step ${stepCount}] Function: ${name}`, JSON.stringify(args));

                    let toolResult = '';

                    switch (name) {
                        case 'click': {
                            const { x, y } = args as { x: number; y: number };
                            await kernel.browsers.computer.clickMouse(browser.session_id, {
                                x, y, button: 'left', click_type: 'click',
                            });
                            toolResult = `Clicked at (${x}, ${y})`;
                            await new Promise(r => setTimeout(r, 1000));
                            break;
                        }
                        case 'type_text': {
                            const { text } = args as { text: string };
                            await kernel.browsers.computer.typeText(browser.session_id, {
                                text, delay: 50,
                            });
                            toolResult = `Typed "${text.substring(0, 20)}${text.length > 20 ? '...' : ''}"`;
                            await new Promise(r => setTimeout(r, 500));
                            break;
                        }
                        case 'press_key': {
                            const { key } = args as { key: string };
                            await kernel.browsers.computer.pressKey(browser.session_id, {
                                keys: [key],
                            });
                            toolResult = `Pressed ${key}`;
                            await new Promise(r => setTimeout(r, 500));
                            break;
                        }
                        case 'scroll': {
                            const { x, y, direction } = args as { x: number; y: number; direction: string };
                            const deltaY = direction === 'up' ? 300 : -300;
                            await kernel.browsers.computer.scroll(browser.session_id, {
                                x, y, delta_x: 0, delta_y: deltaY,
                            });
                            toolResult = `Scrolled ${direction} at (${x}, ${y})`;
                            await new Promise(r => setTimeout(r, 500));
                            break;
                        }
                        case 'perform_login': {
                            const loginParams = args as unknown as PerformLoginParams;
                            const loginResult = await executeLogin(
                                browser.session_id,
                                loginParams,
                                credentials
                            );
                            toolResult = JSON.stringify(loginResult);
                            if (!loginResult.success) {
                                result = { status: 'login_failed', reason: loginResult.message };
                                // Don't break - let agent verify
                            }
                            break;
                        }
                        case 'report_result': {
                            const reportParams = args as { status: string; message: string; filename?: string };
                            result = executeReportResult({
                                status: reportParams.status as 'success' | 'login_failed' | 'group_not_found' | 'download_failed' | 'error',
                                message: reportParams.message,
                                filename: reportParams.filename,
                            });
                            console.log('[agent] Task completed:', result.status);
                            taskComplete = true;
                            break;
                        }
                        default:
                            toolResult = `Unknown function: ${name}`;
                    }

                    // Add function result to conversation (for non-terminal functions)
                    if (name !== 'report_result') {
                        const functionResultMessage: Content = {
                            role: 'user',
                            parts: [{ text: `Function result: ${toolResult}` }],
                        };
                        conversationHistory.push(functionResultMessage);
                    }
                }
                // No function call - model returned text instead
                else {
                    console.log(`[step ${stepCount}] Warning: No function call, got text response`);
                    // Add reminder to use functions
                    const reminderMessage: Content = {
                        role: 'user',
                        parts: [{ text: 'Please call a function to proceed. Do not respond with text.' }],
                    };
                    conversationHistory.push(reminderMessage);
                }
            } catch (error) {
                console.error(`[step ${stepCount}] Error:`, error);
                result = { status: 'error', message: String(error) };
                break;
            }
        }

        if (stepCount >= maxSteps && !taskComplete) {
            console.log('[agent] Max steps reached');
            result = { status: 'error', message: 'Max steps reached without completing task' };
        }

        // Cleanup
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
            sessionId: browser.session_id,
        };
    }
);

// Local execution support
if (import.meta.url === `file://${process.argv[1]}`) {
    console.log('Running Navigator locally...');
}
