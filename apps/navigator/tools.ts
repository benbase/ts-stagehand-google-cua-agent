/**
 * Navigator-specific tools using Kernel Computer Controls API
 *
 * These tools allow the vision-based agent to perform sensitive operations
 * (like login) without exposing credentials to the LLM.
 */

import { Kernel } from '@onkernel/sdk';
import type { Credentials, LoginResult, ReportResultInput } from '../shared/tools/types';
import type { TaskResultStatus } from './types';

const kernel = new Kernel();

// Tool definitions for Gemini function calling
// ALL interactions are defined as functions for consistent behavior
export const NAVIGATOR_TOOLS = [
    // === Action Tools ===
    {
        name: 'click',
        description: 'Click at specific coordinates on the screen.',
        parameters: {
            type: 'object',
            properties: {
                x: { type: 'number', description: 'X coordinate to click' },
                y: { type: 'number', description: 'Y coordinate to click' },
                reasoning: { type: 'string', description: 'Brief explanation of why clicking here' },
            },
            required: ['x', 'y', 'reasoning'],
        },
    },
    {
        name: 'type_text',
        description: 'Type text at the current cursor position. Use for non-sensitive data only (not passwords).',
        parameters: {
            type: 'object',
            properties: {
                text: { type: 'string', description: 'Text to type' },
                reasoning: { type: 'string', description: 'Brief explanation of what is being typed' },
            },
            required: ['text', 'reasoning'],
        },
    },
    {
        name: 'press_key',
        description: 'Press a key or key combination (e.g., Enter, Tab, Escape, ctrl+a).',
        parameters: {
            type: 'object',
            properties: {
                key: { type: 'string', description: 'Key to press (e.g., "Enter", "Tab", "Escape", "ctrl+a")' },
                reasoning: { type: 'string', description: 'Brief explanation of why pressing this key' },
            },
            required: ['key', 'reasoning'],
        },
    },
    {
        name: 'scroll',
        description: 'Scroll the page at specific coordinates.',
        parameters: {
            type: 'object',
            properties: {
                x: { type: 'number', description: 'X coordinate to scroll at' },
                y: { type: 'number', description: 'Y coordinate to scroll at' },
                direction: { type: 'string', description: 'Scroll direction: "up" or "down"' },
                reasoning: { type: 'string', description: 'Brief explanation of why scrolling' },
            },
            required: ['x', 'y', 'direction', 'reasoning'],
        },
    },
    // === Secure Tools ===
    {
        name: 'perform_login',
        description: `Securely fill in login credentials. ALWAYS use this when you see a login form - never type credentials directly.

The tool will:
1. Click the username input field (the text box, not the label)
2. Type the username
3. Click the password input field (the text box, not the label)
4. Type the password
5. Click the submit button

You MUST provide coordinates for all three elements:
- usernameFieldX/Y: The INPUT BOX for username (not the "Username" label text)
- passwordFieldX/Y: The INPUT BOX for password (not the "Password" label text)
- submitButtonX/Y: The "Sign In" / "Log In" button`,
        parameters: {
            type: 'object',
            properties: {
                usernameFieldX: { type: 'number', description: 'X coordinate of center of username INPUT BOX (not the label)' },
                usernameFieldY: { type: 'number', description: 'Y coordinate of center of username INPUT BOX (not the label)' },
                passwordFieldX: { type: 'number', description: 'X coordinate of center of password INPUT BOX (not the label)' },
                passwordFieldY: { type: 'number', description: 'Y coordinate of center of password INPUT BOX (not the label)' },
                submitButtonX: { type: 'number', description: 'X coordinate of center of the Sign In / Log In button' },
                submitButtonY: { type: 'number', description: 'Y coordinate of center of the Sign In / Log In button' },
            },
            required: ['usernameFieldX', 'usernameFieldY', 'passwordFieldX', 'passwordFieldY', 'submitButtonX', 'submitButtonY'],
        },
    },
    // === Result Tool ===
    {
        name: 'report_result',
        description: `Report the final result and end the task. Call this when:
- Task completed successfully (status: 'success')
- Login failed (status: 'login_failed')
- Group/account not found (status: 'group_not_found')
- Download failed (status: 'download_failed')
- Any error (status: 'error')`,
        parameters: {
            type: 'object',
            properties: {
                status: { type: 'string', description: "Result status: 'success', 'login_failed', 'group_not_found', 'download_failed', or 'error'" },
                message: { type: 'string', description: 'Descriptive message about what happened' },
                filename: { type: 'string', description: 'Downloaded filename (only for success)' },
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

/**
 * Execute the perform_login tool using Computer Controls
 * Clicks username field, types username, clicks password field, types password, clicks submit
 */
export async function executeLogin(
    sessionId: string,
    params: PerformLoginParams,
    credentials: Credentials
): Promise<LoginResult> {
    console.log('[perform_login] Starting secure login...');

    try {
        // Click username field
        console.log(`[perform_login] Clicking username field at (${params.usernameFieldX}, ${params.usernameFieldY})`);
        await kernel.browsers.computer.clickMouse(sessionId, {
            x: params.usernameFieldX,
            y: params.usernameFieldY,
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
        console.log(`[perform_login] Clicking password field at (${params.passwordFieldX}, ${params.passwordFieldY})`);
        await kernel.browsers.computer.clickMouse(sessionId, {
            x: params.passwordFieldX,
            y: params.passwordFieldY,
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
        console.log(`[perform_login] Clicking submit button at (${params.submitButtonX}, ${params.submitButtonY})`);
        await kernel.browsers.computer.clickMouse(sessionId, {
            x: params.submitButtonX,
            y: params.submitButtonY,
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
 * Execute the report_result tool
 */
export function executeReportResult(params: ReportResultInput): TaskResultStatus {
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

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
