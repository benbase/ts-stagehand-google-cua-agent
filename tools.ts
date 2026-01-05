import type { Stagehand } from "@browserbasehq/stagehand";
import { TOTP } from 'totp-generator';
import { z } from 'zod/v3';
import type { Credentials, TaskResultStatus } from './types';

async function calculate2faOtpCode(secretKey: string): Promise<string> {
    const { otp } = await TOTP.generate(secretKey);
    return otp;
}

// Simplified schema - single object with status enum + optional fields
const TaskResultSchema = z.object({
    status: z.enum(['success', 'login_failed', 'group_not_found', 'document_not_found', 'download_failed', 'error'])
        .describe("The outcome status of the task"),
    message: z.string()
        .describe("Description of what happened - for success include filename, for failures include the reason"),
    filename: z.string().optional()
        .describe("For success status: the name of the downloaded file"),
    groupId: z.string().optional()
        .describe("For group_not_found status: the group ID that wasn't found"),
});

// Schema for login verification
const LoginVerificationSchema = z.object({
    loginSucceeded: z.boolean().describe("true if login was successful, false if there's an error message"),
    errorMessage: z.string().optional().describe("The error message shown on the page, if any"),
});

/**
 * Creates all agent tools with a result capture mechanism.
 * - perform_login: Handles login with credentials (NEVER exposed to LLM) + verifies success
 * - report_result: Agent MUST call this to report structured outcome
 */
export function createAgentTools(stagehand: Stagehand, credentials: Credentials) {
    let capturedResult: TaskResultStatus | null = null;

    const tools = {
        perform_login: {
            description: "Perform login on the current page. Call this when you see a login form. Credentials are handled securely - you don't need to provide them. Returns whether login succeeded or failed.",
            inputSchema: z.object({
                site: z.string().describe("The site/service you're logging into"),
            }),
            execute: async ({ site }: { site: string }) => {
                console.log(`[perform_login] Login requested for site: ${site}`);

                const { username, password, totp_secret: totpSecret } = credentials;

                if (!username || !password) {
                    return { success: false, error: "No credentials configured" };
                }

                try {
                    // Fill username - %username% is substituted locally, NEVER sent to LLM
                    console.log('[perform_login] Filling username...');
                    await stagehand.act("Type %username% into the username, email, or login field", { variables: { username } });

                    // Fill password - %password% is substituted locally, NEVER sent to LLM
                    console.log('[perform_login] Filling password...');
                    await stagehand.act("Type %password% into the password field", { variables: { password } });

                    // Submit login
                    console.log('[perform_login] Submitting login form...');
                    await stagehand.act("Click the login, sign in, or submit button");

                    // Wait for page to respond (login can take time)
                    console.log('[perform_login] Waiting for login response...');
                    await new Promise(resolve => setTimeout(resolve, 20000));

                    // Verify login succeeded by checking for error messages
                    console.log('[perform_login] Verifying login status...');
                    const verification = await stagehand.extract(
                        "Check if login was successful. Look for error messages like 'invalid password', 'incorrect credentials', 'login failed', 'authentication error', or similar. Also check if we're still on a login page or moved to a dashboard/home page.",
                        LoginVerificationSchema
                    );

                    console.log('[perform_login] Verification result:', JSON.stringify(verification));

                    if (!verification.loginSucceeded) {
                        console.log('[perform_login] Login failed:', verification.errorMessage);
                        return {
                            success: false,
                            error: verification.errorMessage || "Login failed - invalid credentials or authentication error"
                        };
                    }

                    // Handle 2FA if TOTP secret is provided
                    if (totpSecret) {
                        console.log('[perform_login] Handling 2FA...');
                        const otp = await calculate2faOtpCode(totpSecret);
                        await stagehand.act("Type %otp% into the verification code, OTP, or 2FA field", { variables: { otp } });
                        await stagehand.act("Click verify, continue, or submit button");
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }

                    console.log('[perform_login] Login successful');
                    return { success: true, message: "Login successful" };
                } catch (error) {
                    console.error('[perform_login] Error during login:', error);
                    return { success: false, error: `Login error: ${error}` };
                }
            },
        },

        report_result: {
            description: `REQUIRED: Report the final outcome of your task. Call this before finishing.

Status values:
- "success": File downloaded successfully. Include filename in message.
- "login_failed": Could not log in. Include error reason in message.
- "group_not_found": Group/account not found. Include groupId.
- "document_not_found": Document not found. Describe what was searched.
- "download_failed": Found document but download failed. Include reason.
- "error": Other error. Describe what went wrong.`,
            inputSchema: TaskResultSchema,
            execute: async (result: z.infer<typeof TaskResultSchema>) => {
                console.log(`[report_result] Agent reported:`, JSON.stringify(result));

                // Convert to our discriminated union type
                const typedResult: TaskResultStatus = (() => {
                    switch (result.status) {
                        case 'success':
                            return {
                                status: 'success' as const,
                                fileUrl: result.message,
                                filename: result.filename || 'unknown'
                            };
                        case 'login_failed':
                            return { status: 'login_failed' as const, reason: result.message };
                        case 'group_not_found':
                            return { status: 'group_not_found' as const, groupId: result.groupId || result.message };
                        case 'document_not_found':
                            return { status: 'document_not_found' as const, description: result.message };
                        case 'download_failed':
                            return { status: 'download_failed' as const, reason: result.message };
                        case 'error':
                        default:
                            return { status: 'error' as const, message: result.message };
                    }
                })();

                capturedResult = typedResult;
                return { acknowledged: true, status: result.status };
            },
        },
    };

    return {
        tools,
        getResult: () => capturedResult,
    };
}
