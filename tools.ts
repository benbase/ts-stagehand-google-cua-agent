import type {Stagehand} from "@browserbasehq/stagehand";
import {TOTP} from 'totp-generator';
import {z} from 'zod/v3';
import type {Credentials, TaskResultStatus} from './types';

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
            description: "Perform login on the current page. Call this when you see a login form. Credentials are handled securely - you don't need to provide them. Handles both single-page and multi-step login flows. Returns whether login succeeded or failed.",
            inputSchema: z.object({
                site: z.string().describe("The site/service you're logging into"),
            }),
            execute: async ({ site }: { site: string }) => {
                console.log(`[perform_login] Login requested for site: ${site}`);

                const { username, password, totpSecret: totpSecret } = credentials;

                if (!username || !password) {
                    return { success: false, error: "No credentials configured" };
                }

                try {
                    // Fill username - %username% is substituted locally, NEVER sent to LLM
                    console.log('[perform_login] Filling username...');
                    await stagehand.act("Type %username% into the username, email, user ID, or login field", { variables: { username } });

                    // Check if this is a multi-step login (password field not visible yet)
                    console.log('[perform_login] Checking for multi-step login flow...');
                    const pageState = await stagehand.extract(
                        "Check if there is a visible password input field on the current page. Also check if there is a 'Continue', 'Next', or similar button (not 'Sign In' or 'Log In').",
                        z.object({
                            hasPasswordField: z.boolean().describe("true if a password input field is currently visible"),
                            hasContinueButton: z.boolean().describe("true if there's a Continue/Next button visible"),
                        })
                    );
                    console.log('[perform_login] Page state:', JSON.stringify(pageState));

                    // Multi-step flow: click Continue to get to password page
                    if (!pageState.hasPasswordField && pageState.hasContinueButton) {
                        console.log('[perform_login] Multi-step login detected, clicking Continue...');
                        await stagehand.act("Click the Continue or Next button");
                        console.log('[perform_login] Waiting for password page...');
                        await new Promise(resolve => setTimeout(resolve, 3000));
                    }

                    // Fill password - %password% is substituted locally, NEVER sent to LLM
                    console.log('[perform_login] Filling password...');
                    await stagehand.act("Type %password% into the password field", { variables: { password } });

                    // Submit login (could be Continue, Sign In, Log In, Submit)
                    console.log('[perform_login] Submitting login form...');
                    await stagehand.act("Click the Continue, Sign In, Log In, or Submit button");

                    // Wait for page to respond (login can take time)
                    console.log('[perform_login] Waiting for login response...');
                    await new Promise(resolve => setTimeout(resolve, 5000));

                    // Check if 2FA is required (before checking login success)
                    if (totpSecret) {
                        console.log('[perform_login] Checking for 2FA prompt...');
                        const tfaCheck = await stagehand.extract(
                            "Check if the page is asking for a verification code, OTP, 2FA code, or one-time password. Look for input fields asking for a 6-digit code or similar.",
                            z.object({
                                requires2FA: z.boolean().describe("true if the page is asking for a 2FA/OTP code"),
                            })
                        );
                        console.log('[perform_login] 2FA check:', JSON.stringify(tfaCheck));

                        if (tfaCheck.requires2FA) {
                            console.log('[perform_login] Handling 2FA...');

                            // Check if we need to select an authenticator method first
                            console.log('[perform_login] Checking for authenticator method selection...');
                            const authMethodCheck = await stagehand.extract(
                                "Check if the page is showing a list of authentication methods to choose from (like 'Microsoft Authenticator', 'Google Authenticator', 'Email', 'SMS', etc.). This is NOT the code entry page - it's a selection page where you pick how to receive the code.",
                                z.object({
                                    hasAuthMethodSelection: z.boolean().describe("true if there's a list of authenticator methods to choose from"),
                                    hasMicrosoftAuthenticator: z.boolean().describe("true if 'Microsoft Authenticator' is one of the options"),
                                })
                            );
                            console.log('[perform_login] Auth method check:', JSON.stringify(authMethodCheck));

                            if (authMethodCheck.hasAuthMethodSelection && authMethodCheck.hasMicrosoftAuthenticator) {
                                console.log('[perform_login] Selecting Microsoft Authenticator...');
                                await stagehand.act("Click on 'Microsoft Authenticator' option");
                                console.log('[perform_login] Waiting for code entry page...');
                                await new Promise(resolve => setTimeout(resolve, 3000));
                            }

                            const otp = await calculate2faOtpCode(totpSecret);
                            console.log('[perform_login] Generated OTP:', otp);
                            console.log('[perform_login] Entering code into Authenticator Code field...');
                            await stagehand.act("Type %otp% into the Authenticator Code text field", { variables: { otp } });

                            // Try to check the "remember" checkbox to skip 2FA next time
                            console.log('[perform_login] Checking for remember/trust checkbox...');
                            try {
                                await stagehand.act("Click the checkbox to remember this device or skip verification next time");
                            } catch (e) {
                                console.log('[perform_login] No remember checkbox found or could not click it');
                            }

                            await stagehand.act("Click the Verify, Continue, or Submit button");
                            console.log('[perform_login] Waiting for 2FA verification...');
                            await new Promise(resolve => setTimeout(resolve, 5000));
                        }
                    }

                    // Wait for any loading indicators to complete before verifying
                    console.log('[perform_login] Checking for loading indicators...');
                    for (let i = 0; i < 6; i++) {
                        const loadingCheck = await stagehand.extract(
                            "Check if the page is showing a loading indicator, spinner, or progress message like 'Signing you in', 'Please wait', 'Loading', etc.",
                            z.object({
                                isLoading: z.boolean().describe("true if page shows loading/progress indicator"),
                            })
                        );
                        if (!loadingCheck.isLoading) {
                            console.log('[perform_login] Page finished loading');
                            break;
                        }
                        console.log(`[perform_login] Page still loading, waiting... (attempt ${i + 1}/6)`);
                        await new Promise(resolve => setTimeout(resolve, 3000));
                    }

                    // Verify login succeeded by checking for error messages
                    console.log('[perform_login] Verifying login status...');
                    const verification = await stagehand.extract(
                        "Check if login was successful. Login is SUCCESSFUL if you see a dashboard, welcome message, home page, navigation menu, or any authenticated content (even if partially hidden behind a popup/modal). Login FAILED only if you see an explicit error message like 'invalid password', 'incorrect credentials', 'account locked', or if you're still on the login form with an error. Messages like 'Signing you in, please wait' are NOT errors - they are loading indicators. Ignore popups/modals when determining success - check what's behind them.",
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

CRITICAL: Before reporting "success", verify the document date matches EXACTLY what was requested.
If the date does not match, report "download_failed" instead.

Status values:
- "success": File downloaded WITH CORRECT DATE. Include filename in message. Only use if date matches request.
- "login_failed": Could not log in. Include error reason in message.
- "group_not_found": Group/account not found. Include groupId.
- "document_not_found": Document not found. Describe what was searched.
- "download_failed": REQUIRED if requested date is not available. Include: what date was requested, what dates were actually available.
- "error": Other error. Describe what went wrong.`,
            inputSchema: TaskResultSchema,
            execute: async (result: z.infer<typeof TaskResultSchema>) => {
                console.log(`[report_result] Agent reported:`, JSON.stringify(result));

                // Convert to our discriminated union type
                capturedResult = (() => {
                    switch (result.status) {
                        case 'success':
                            return {
                                status: 'success' as const,
                                fileUrl: result.message,
                                filename: result.filename || 'unknown'
                            };
                        case 'login_failed':
                            return {status: 'login_failed' as const, reason: result.message};
                        case 'group_not_found':
                            return {status: 'group_not_found' as const, groupId: result.groupId || result.message};
                        case 'document_not_found':
                            return {status: 'document_not_found' as const, description: result.message};
                        case 'download_failed':
                            return {status: 'download_failed' as const, reason: result.message};
                        case 'error':
                        default:
                            return {status: 'error' as const, message: result.message};
                    }
                })();
                return { acknowledged: true, status: result.status };
            },
        },
    };

    return {
        tools,
        getResult: () => capturedResult,
    };
}
