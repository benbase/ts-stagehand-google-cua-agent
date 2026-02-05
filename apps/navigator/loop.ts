/**
 * Gemini Computer Use sampling loop.
 * Based on Google's computer-use-preview reference implementation.
 *
 * Extended with custom tools for secure login, 2FA handling, and result reporting.
 */

import {
  GoogleGenAI,
  Type,
  Environment,
  type Content,
  type FunctionCall,
  type FunctionDeclaration,
  type Part,
} from '@google/genai';
import type { Kernel } from '@onkernel/sdk';
import { TOTP } from 'totp-generator';
import { ComputerTool } from './tools/computer';
import { PREDEFINED_COMPUTER_USE_FUNCTIONS, type GeminiFunctionArgs } from './tools/types/gemini';
import type { Credentials, LoginResult, ReportResultInput } from '../shared/tools/types';
import type { TaskResultStatus } from './types';

// 2FA relay API configuration
const EMAIL_2FA_RELAY_URL = 'https://web-pyrelay.onrender.com/2fa';
const EMAIL_2FA_API_KEY = 'intuned-2024-11-21';

// System prompt for browser-based computer use
function getSystemPrompt(customPromptSuffix?: string): string {
  const currentDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const basePrompt = `You are a helpful assistant that can use a web browser.
You are operating a Chrome browser through computer use tools.
The browser is already open and ready for use.

When you need to navigate to a page, use the navigate action with a full URL.
When you need to interact with elements, use click_at, type_text_at, etc.
After each action, carefully evaluate the screenshot to determine your next step.

IMPORTANT TOOLS:
- For login forms, ALWAYS use the perform_login tool instead of typing credentials directly.
- For 2FA/MFA verification screens, use the handle_2fa tool - it can handle both email codes and authenticator codes.
- When the task is complete or cannot continue, call report_result with the appropriate status.

2FA HANDLING:
- If you see a 2FA verification page asking for "Email" or "Text/Voice" options, choose Email and then call handle_2fa with type "email".
- If you see an authenticator code input, call handle_2fa with type "totp".
- The handle_2fa tool will fetch or generate the code and enter it for you.

SCROLLING AND CONTENT VERIFICATION:
- IMPORTANT: Before scrolling, CAREFULLY examine what is ALREADY VISIBLE on the screen. Tables and lists may already show the content you need.
- The most recent items (like newest invoices) are typically at the TOP of lists, not the bottom. Check the visible rows first!
- If you need to scroll, look for the FIRST few rows of a table - they often contain the most recent data.
- BEFORE concluding that content is not available, scroll through the ENTIRE list systematically.
- If you scroll down and see OLD dates, the NEWER dates are likely ABOVE - scroll back up carefully.
- When examining a table/list, look at ALL visible rows in the current view before scrolling.
- Don't assume content is missing just because it's not in the first view - check the entire scrollable area.

PAGE LOADING ISSUES:
- If a page appears blank or fails to load after waiting, try REFRESHING the page using key_combination with "F5" or "ctrl+r".
- If the page is still blank after refreshing, try refreshing up to 3 times before giving up.
- After each refresh, wait a few seconds for the page to load.
- If the page is stuck loading (spinner visible for too long), refresh it.
- Only report an error about blank/loading pages after attempting multiple refreshes.

Current date: ${currentDate}.`;

  return customPromptSuffix ? `${basePrompt}\n\n${customPromptSuffix}` : basePrompt;
}

// Maximum number of recent turns to keep screenshots for (to manage context)
const MAX_RECENT_TURN_WITH_SCREENSHOTS = 3;

// Custom tool definitions
const CUSTOM_TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'perform_login',
    description: `Securely fill in login credentials. ALWAYS use this when you see a login form - never type credentials directly.

The tool will:
1. Click the username input field
2. Type the username
3. Click the password input field
4. Type the password
5. Click the submit button

Provide normalized coordinates (0-1000 scale) for all three elements.`,
    parameters: {
      type: Type.OBJECT,
      properties: {
        usernameFieldX: { type: Type.NUMBER, description: 'X coordinate (0-1000) of username input' },
        usernameFieldY: { type: Type.NUMBER, description: 'Y coordinate (0-1000) of username input' },
        passwordFieldX: { type: Type.NUMBER, description: 'X coordinate (0-1000) of password input' },
        passwordFieldY: { type: Type.NUMBER, description: 'Y coordinate (0-1000) of password input' },
        submitButtonX: { type: Type.NUMBER, description: 'X coordinate (0-1000) of submit button' },
        submitButtonY: { type: Type.NUMBER, description: 'Y coordinate (0-1000) of submit button' },
      },
      required: ['usernameFieldX', 'usernameFieldY', 'passwordFieldX', 'passwordFieldY', 'submitButtonX', 'submitButtonY'],
    },
  },
  {
    name: 'handle_2fa',
    description: `Handle 2FA/MFA verification. Use this when you encounter a 2FA screen after login.

For EMAIL 2FA:
- First, if you see options like "Email" vs "Text/Voice", click on the Email option
- Then click "Send me an email" or similar button to trigger the email
- Wait a few seconds, then call this tool with type "email"
- The tool will fetch the code from the email relay and enter it

For TOTP/AUTHENTICATOR 2FA:
- If you see an authenticator code input field, call this tool with type "totp"
- The tool will generate the code and enter it

Provide the coordinates of the code input field and submit button.`,
    parameters: {
      type: Type.OBJECT,
      properties: {
        type: { type: Type.STRING, description: "Type of 2FA: 'email' or 'totp'" },
        codeFieldX: { type: Type.NUMBER, description: 'X coordinate (0-1000) of the verification code input field' },
        codeFieldY: { type: Type.NUMBER, description: 'Y coordinate (0-1000) of the verification code input field' },
        submitButtonX: { type: Type.NUMBER, description: 'X coordinate (0-1000) of the submit/verify button' },
        submitButtonY: { type: Type.NUMBER, description: 'Y coordinate (0-1000) of the submit/verify button' },
      },
      required: ['type', 'codeFieldX', 'codeFieldY', 'submitButtonX', 'submitButtonY'],
    },
  },
  {
    name: 'report_result',
    description: `Report the final result and end the task. Call this when:
- Task completed successfully (status: 'success')
- Login failed (status: 'login_failed')
- Group/account not found (status: 'group_not_found')
- Download failed (status: 'download_failed')
- Any error (status: 'error')`,
    parameters: {
      type: Type.OBJECT,
      properties: {
        status: { type: Type.STRING, description: "Result status: 'success', 'login_failed', 'group_not_found', 'download_failed', or 'error'" },
        message: { type: Type.STRING, description: 'Descriptive message about what happened' },
        filename: { type: Type.STRING, description: 'Downloaded filename (only for success)' },
      },
      required: ['status', 'message'],
    },
  },
];

export interface PerformLoginParams {
  usernameFieldX: number;
  usernameFieldY: number;
  passwordFieldX: number;
  passwordFieldY: number;
  submitButtonX: number;
  submitButtonY: number;
}

export interface Handle2FAParams {
  type: 'email' | 'totp';
  codeFieldX: number;
  codeFieldY: number;
  submitButtonX: number;
  submitButtonY: number;
}

interface TwoFAResult {
  success: boolean;
  message: string;
}

/**
 * Fetch email 2FA code from the relay API
 */
async function fetchEmail2FACode(carrier: string): Promise<string | null> {
  console.log(`[2fa] Fetching email 2FA code for carrier: ${carrier}`);

  try {
    const response = await fetch(`${EMAIL_2FA_RELAY_URL}/${carrier}`, {
      method: 'GET',
      headers: {
        'X-API-KEY': EMAIL_2FA_API_KEY,
      },
    });

    if (!response.ok) {
      console.error(`[2fa] API returned status ${response.status}`);
      return null;
    }

    const data = await response.json();
    console.log(`[2fa] Received code: ${data.code ? '******' : 'null'}`);
    return data.code || null;
  } catch (error) {
    console.error('[2fa] Error fetching code:', error);
    return null;
  }
}

/**
 * Generate TOTP code from secret
 */
async function generateTOTPCode(secret: string): Promise<string> {
  const { otp } = await TOTP.generate(secret);
  console.log(`[2fa] Generated TOTP code: ${otp}`);
  return otp;
}

export interface SamplingLoopOptions {
  model: string;
  query: string;
  apiKey: string;
  kernel: Kernel;
  sessionId: string;
  maxIterations?: number;
  systemPromptSuffix?: string;
  credentials?: Credentials;
  onResult?: (result: TaskResultStatus) => void;
}

export interface SamplingLoopResult {
  finalResponse: string;
  iterations: number;
  taskResult?: TaskResultStatus;
  error?: string;
}

/**
 * Run the Gemini computer use sampling loop.
 */
export async function samplingLoop({
  model,
  query,
  apiKey,
  kernel,
  sessionId,
  maxIterations = 50,
  systemPromptSuffix = '',
  credentials,
  onResult,
}: SamplingLoopOptions): Promise<SamplingLoopResult> {
  const ai = new GoogleGenAI({ apiKey });

  const computerTool = new ComputerTool(kernel, sessionId);

  // Initialize conversation with user query
  const contents: Content[] = [
    {
      role: 'user',
      parts: [{ text: query }],
    },
  ];

  const systemPrompt = getSystemPrompt(systemPromptSuffix);

  let iteration = 0;
  let finalResponse = '';
  let taskResult: TaskResultStatus | undefined;
  let error: string | undefined;
  let consecutiveEmptyResponses = 0;
  const MAX_CONSECUTIVE_EMPTY_RESPONSES = 3;

  while (iteration < maxIterations) {
    iteration++;
    console.log(`\n=== Iteration ${iteration} ===`);

    try {
      // Generate response from Gemini
      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          temperature: 1,
          topP: 0.95,
          topK: 40,
          maxOutputTokens: 8192,
          systemInstruction: systemPrompt,
          tools: [
            {
              computerUse: {
                environment: Environment.ENVIRONMENT_BROWSER,
              },
            },
            {
              functionDeclarations: CUSTOM_TOOL_DECLARATIONS,
            },
          ],
          thinkingConfig: {
            includeThoughts: true,
          },
        },
      });

      if (!response.candidates || response.candidates.length === 0) {
        console.log('[loop] No candidates in response');
        consecutiveEmptyResponses++;
        if (consecutiveEmptyResponses >= MAX_CONSECUTIVE_EMPTY_RESPONSES) {
          console.log(`[loop] ${MAX_CONSECUTIVE_EMPTY_RESPONSES} consecutive empty responses, stopping`);
          error = 'Gemini returned empty responses repeatedly';
          break;
        }
        console.log(`[loop] Retrying (${consecutiveEmptyResponses}/${MAX_CONSECUTIVE_EMPTY_RESPONSES})...`);
        await sleep(2000); // Wait before retry

        // Take a fresh screenshot to give the model new context
        console.log('[loop] Taking fresh screenshot for retry...');
        const freshScreenshot = await computerTool.screenshot();
        if (freshScreenshot.base64Image) {
          contents.push({
            role: 'user',
            parts: [
              { text: 'The previous response was empty. Here is the current state of the screen. Please continue with the task.' },
              {
                inlineData: {
                  mimeType: 'image/png',
                  data: freshScreenshot.base64Image,
                },
              },
            ],
          });
        }
        continue;
      }

      const candidate = response.candidates[0];
      if (!candidate.content) {
        console.log('[loop] No content in candidate');
        consecutiveEmptyResponses++;
        if (consecutiveEmptyResponses >= MAX_CONSECUTIVE_EMPTY_RESPONSES) {
          console.log(`[loop] ${MAX_CONSECUTIVE_EMPTY_RESPONSES} consecutive empty responses, stopping`);
          error = 'Gemini returned empty content repeatedly';
          break;
        }
        console.log(`[loop] Retrying (${consecutiveEmptyResponses}/${MAX_CONSECUTIVE_EMPTY_RESPONSES})...`);
        await sleep(2000); // Wait before retry

        // Take a fresh screenshot to give the model new context
        console.log('[loop] Taking fresh screenshot for retry...');
        const freshScreenshot = await computerTool.screenshot();
        if (freshScreenshot.base64Image) {
          contents.push({
            role: 'user',
            parts: [
              { text: 'The previous response was empty. Here is the current state of the screen. Please continue with the task.' },
              {
                inlineData: {
                  mimeType: 'image/png',
                  data: freshScreenshot.base64Image,
                },
              },
            ],
          });
        }
        continue;
      }

      // Reset empty response counter on successful response
      consecutiveEmptyResponses = 0;

      // Add assistant response to conversation
      contents.push(candidate.content);

      // Extract text and function calls
      const reasoning = extractText(candidate.content);
      const functionCalls = extractFunctionCalls(candidate.content);

      // Log the response
      console.log('[loop] Reasoning:', reasoning || '(none)');
      console.log('[loop] Function calls:', functionCalls.length);
      for (const fc of functionCalls) {
        console.log(`  - ${fc.name}:`, fc.args);
      }

      // Check finish reason
      const finishReason = candidate.finishReason;
      if (finishReason === 'MALFORMED_FUNCTION_CALL' && !functionCalls.length) {
        console.log('[loop] Malformed function call, retrying...');
        continue;
      }

      // If no function calls, the model is done
      if (functionCalls.length === 0) {
        console.log('[loop] Agent loop complete');
        finalResponse = reasoning || '';
        break;
      }

      // Execute function calls and collect results
      const functionResponses: Part[] = [];
      let shouldBreak = false;

      for (const fc of functionCalls) {
        const args = fc.args as GeminiFunctionArgs || {};

        // Handle safety decisions if present
        if (args.safety_decision?.decision === 'require_confirmation') {
          console.log('[loop] Safety confirmation required:', args.safety_decision.explanation);
          // Auto-acknowledge for automated execution
          console.log('[loop] Auto-acknowledging safety check');
        }

        // Check if this is a custom tool
        if (fc.name === 'perform_login') {
          console.log('[loop] Executing custom tool: perform_login');
          const loginParams = fc.args as unknown as PerformLoginParams;
          const loginResult = await executeLogin(kernel, sessionId, loginParams, credentials);

          functionResponses.push({
            functionResponse: {
              name: fc.name,
              response: { result: loginResult.message, success: loginResult.success },
            },
          });

          // Take screenshot after login
          const screenshot = await computerTool.screenshot();
          if (screenshot.base64Image) {
            contents.push({
              role: 'user',
              parts: [{
                inlineData: {
                  mimeType: 'image/png',
                  data: screenshot.base64Image,
                },
              }],
            });
          }
          continue;
        }

        if (fc.name === 'handle_2fa') {
          console.log('[loop] Executing custom tool: handle_2fa');
          const twoFAParams = fc.args as unknown as Handle2FAParams;
          const twoFAResult = await execute2FA(kernel, sessionId, twoFAParams, credentials);

          functionResponses.push({
            functionResponse: {
              name: fc.name,
              response: { result: twoFAResult.message, success: twoFAResult.success },
            },
          });

          // Take screenshot after 2FA
          const screenshot = await computerTool.screenshot();
          if (screenshot.base64Image) {
            contents.push({
              role: 'user',
              parts: [{
                inlineData: {
                  mimeType: 'image/png',
                  data: screenshot.base64Image,
                },
              }],
            });
          }
          continue;
        }

        if (fc.name === 'report_result') {
          console.log('[loop] Executing custom tool: report_result');
          const reportParams = fc.args as { status: string; message: string; filename?: string };
          taskResult = executeReportResult({
            status: reportParams.status as ReportResultInput['status'],
            message: reportParams.message,
            filename: reportParams.filename,
          });
          console.log('[loop] Task completed:', taskResult.status);

          if (onResult) {
            onResult(taskResult);
          }

          shouldBreak = true;
          break;
        }

        // Execute standard computer use action
        console.log(`[loop] Executing action: ${fc.name}`);
        const result = await computerTool.executeAction(fc.name, args);

        // Check if we need to acknowledge a safety decision
        const hasSafetyDecision = args.safety_decision?.decision === 'require_confirmation';

        if (result.error) {
          console.log(`[loop] Action error: ${result.error}`);
          functionResponses.push({
            functionResponse: {
              name: fc.name,
              // Always include URL (required by Gemini Computer Use API)
              // Include safety_acknowledgement if there was a safety decision
              response: {
                error: result.error,
                url: result.url || 'about:blank',
                ...(hasSafetyDecision && { safety_acknowledgement: true }),
              },
            },
          });
        } else {
          // Build response with screenshot - always include URL (required by Computer Use API)
          const responseData: Record<string, unknown> = {
            url: result.url || 'about:blank',
            // Include safety_acknowledgement if there was a safety decision
            ...(hasSafetyDecision && { safety_acknowledgement: true }),
          };

          functionResponses.push({
            functionResponse: {
              name: fc.name,
              response: responseData,
              // Include screenshot as inline data
              ...(result.base64Image && isPredefinedFunction(fc.name) ? {
                parts: [{
                  inlineData: {
                    mimeType: 'image/png',
                    data: result.base64Image,
                  },
                }],
              } : {}),
            },
          });
        }
      }

      if (shouldBreak) {
        break;
      }

      // Add function responses to conversation
      if (functionResponses.length > 0) {
        contents.push({
          role: 'user',
          parts: functionResponses,
        });
      }

      // Manage screenshot history to avoid context overflow
      pruneOldScreenshots(contents);

    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      console.error('[loop] Error in sampling loop:', error);
      break;
    }
  }

  if (iteration >= maxIterations) {
    console.log('[loop] Max iterations reached');
    taskResult = { status: 'error', message: 'Max iterations reached without completing task' };
  }

  return {
    finalResponse,
    iterations: iteration,
    taskResult,
    error,
  };
}

/**
 * Execute the perform_login tool using Computer Controls.
 * Coordinates are in normalized scale (0-1000).
 */
async function executeLogin(
  kernel: Kernel,
  sessionId: string,
  params: PerformLoginParams,
  credentials?: Credentials
): Promise<LoginResult> {
  console.log('[perform_login] Starting secure login...');

  if (!credentials?.username || !credentials?.password) {
    return {
      success: false,
      message: 'No credentials provided',
    };
  }

  // Denormalize coordinates (0-1000 to pixel values)
  const screenWidth = 1200;
  const screenHeight = 800;
  const scale = 1000;

  const usernameX = Math.round((params.usernameFieldX / scale) * screenWidth);
  const usernameY = Math.round((params.usernameFieldY / scale) * screenHeight);
  const passwordX = Math.round((params.passwordFieldX / scale) * screenWidth);
  const passwordY = Math.round((params.passwordFieldY / scale) * screenHeight);
  const submitX = Math.round((params.submitButtonX / scale) * screenWidth);
  const submitY = Math.round((params.submitButtonY / scale) * screenHeight);

  try {
    // Click username field
    console.log(`[perform_login] Clicking username field at (${usernameX}, ${usernameY})`);
    await kernel.browsers.computer.clickMouse(sessionId, {
      x: usernameX,
      y: usernameY,
      button: 'left',
      click_type: 'click',
    });
    await sleep(500);

    // Type username
    console.log('[perform_login] Typing username...');
    await kernel.browsers.computer.typeText(sessionId, {
      text: credentials.username,
      delay: 50,
    });
    await sleep(500);

    // Click password field
    console.log(`[perform_login] Clicking password field at (${passwordX}, ${passwordY})`);
    await kernel.browsers.computer.clickMouse(sessionId, {
      x: passwordX,
      y: passwordY,
      button: 'left',
      click_type: 'click',
    });
    await sleep(500);

    // Type password
    console.log('[perform_login] Typing password...');
    await kernel.browsers.computer.typeText(sessionId, {
      text: credentials.password,
      delay: 50,
    });
    await sleep(500);

    // Click submit button
    console.log(`[perform_login] Clicking submit button at (${submitX}, ${submitY})`);
    await kernel.browsers.computer.clickMouse(sessionId, {
      x: submitX,
      y: submitY,
      button: 'left',
      click_type: 'click',
    });

    // Wait for page to process login
    console.log('[perform_login] Waiting for login to process...');
    await sleep(5000);

    return {
      success: true,
      message: 'Login credentials entered and submitted. Check the next screenshot to verify if login was successful.',
    };
  } catch (error) {
    console.error('[perform_login] Error:', error);
    return {
      success: false,
      message: `Login failed: ${String(error)}`,
    };
  }
}

/**
 * Execute the handle_2fa tool using Computer Controls.
 * Coordinates are in normalized scale (0-1000).
 */
async function execute2FA(
  kernel: Kernel,
  sessionId: string,
  params: Handle2FAParams,
  credentials?: Credentials
): Promise<TwoFAResult> {
  console.log(`[handle_2fa] Starting 2FA handling (type: ${params.type})...`);

  // Denormalize coordinates (0-1000 to pixel values)
  const screenWidth = 1200;
  const screenHeight = 800;
  const scale = 1000;

  const codeX = Math.round((params.codeFieldX / scale) * screenWidth);
  const codeY = Math.round((params.codeFieldY / scale) * screenHeight);
  const submitX = Math.round((params.submitButtonX / scale) * screenWidth);
  const submitY = Math.round((params.submitButtonY / scale) * screenHeight);

  try {
    let code: string | null = null;

    if (params.type === 'email') {
      // Fetch email 2FA code from relay
      const carrier = credentials?.carrier;
      if (!carrier) {
        return {
          success: false,
          message: 'No carrier configured for email 2FA lookup',
        };
      }

      // Wait a bit for the email to arrive
      console.log('[handle_2fa] Waiting for email to arrive...');
      await sleep(5000);

      // Try fetching the code with retries
      for (let attempt = 1; attempt <= 3; attempt++) {
        console.log(`[handle_2fa] Fetching email code (attempt ${attempt}/3)...`);
        code = await fetchEmail2FACode(carrier);
        if (code) break;
        if (attempt < 3) {
          console.log('[handle_2fa] No code yet, waiting and retrying...');
          await sleep(3000);
        }
      }

      if (!code) {
        return {
          success: false,
          message: 'Could not fetch email 2FA code from relay',
        };
      }
    } else if (params.type === 'totp') {
      // Generate TOTP code from secret
      const totpSecret = credentials?.totpSecret;
      if (!totpSecret) {
        return {
          success: false,
          message: 'No TOTP secret configured for authenticator 2FA',
        };
      }

      code = await generateTOTPCode(totpSecret);
    } else {
      return {
        success: false,
        message: `Unknown 2FA type: ${params.type}`,
      };
    }

    // Click the code input field
    console.log(`[handle_2fa] Clicking code field at (${codeX}, ${codeY})`);
    await kernel.browsers.computer.clickMouse(sessionId, {
      x: codeX,
      y: codeY,
      button: 'left',
      click_type: 'click',
    });
    await sleep(500);

    // Type the code
    console.log('[handle_2fa] Typing verification code...');
    await kernel.browsers.computer.typeText(sessionId, {
      text: code,
      delay: 50,
    });
    await sleep(500);

    // Click submit button
    console.log(`[handle_2fa] Clicking submit button at (${submitX}, ${submitY})`);
    await kernel.browsers.computer.clickMouse(sessionId, {
      x: submitX,
      y: submitY,
      button: 'left',
      click_type: 'click',
    });

    // Wait for verification to process
    console.log('[handle_2fa] Waiting for verification to process...');
    await sleep(5000);

    return {
      success: true,
      message: `2FA code entered successfully (type: ${params.type}). Check the next screenshot to verify if verification was successful.`,
    };
  } catch (error) {
    console.error('[handle_2fa] Error:', error);
    return {
      success: false,
      message: `2FA handling failed: ${String(error)}`,
    };
  }
}

/**
 * Execute the report_result tool
 */
function executeReportResult(params: ReportResultInput): TaskResultStatus {
  console.log(`[report_result] Status: ${params.status}, Message: ${params.message}`);

  if (params.status === 'success') {
    return {
      status: 'success',
      message: params.message,
      filename: params.filename,
    };
  } else if (params.status === 'login_failed') {
    return {
      status: 'login_failed',
      reason: params.message,
    };
  } else {
    return {
      status: 'error',
      message: params.message,
    };
  }
}

function extractText(content: Content): string {
  if (!content.parts) return '';

  const texts: string[] = [];
  for (const part of content.parts) {
    if ('text' in part && part.text) {
      texts.push(part.text);
    }
  }
  return texts.join(' ');
}

function extractFunctionCalls(content: Content): FunctionCall[] {
  if (!content.parts) return [];

  const calls: FunctionCall[] = [];
  for (const part of content.parts) {
    if ('functionCall' in part && part.functionCall) {
      calls.push(part.functionCall);
    }
  }
  return calls;
}

function isPredefinedFunction(name: string): boolean {
  return PREDEFINED_COMPUTER_USE_FUNCTIONS.includes(name as typeof PREDEFINED_COMPUTER_USE_FUNCTIONS[number]);
}

function pruneOldScreenshots(contents: Content[]): void {
  let turnsWithScreenshots = 0;

  // Iterate in reverse to find recent turns with screenshots
  for (let i = contents.length - 1; i >= 0; i--) {
    const content = contents[i];
    if (content.role !== 'user' || !content.parts) continue;

    // Check if this turn has screenshots from predefined functions
    let hasScreenshot = false;
    for (const part of content.parts) {
      if ('functionResponse' in part &&
          part.functionResponse &&
          isPredefinedFunction(part.functionResponse.name || '')) {
        // Check if it has inline data (screenshot)
        const fr = part.functionResponse as { parts?: Array<{ inlineData?: unknown }> };
        if (fr.parts?.some(p => p.inlineData)) {
          hasScreenshot = true;
          break;
        }
      }
    }

    if (hasScreenshot) {
      turnsWithScreenshots++;

      // Remove screenshots from old turns
      if (turnsWithScreenshots > MAX_RECENT_TURN_WITH_SCREENSHOTS) {
        for (const part of content.parts) {
          if ('functionResponse' in part &&
              part.functionResponse &&
              isPredefinedFunction(part.functionResponse.name || '')) {
            // Remove the parts array (which contains the screenshot)
            const fr = part.functionResponse as { parts?: unknown };
            delete fr.parts;
          }
        }
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
