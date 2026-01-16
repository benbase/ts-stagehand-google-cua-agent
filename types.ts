export interface DownloadTaskInput {
    url: string; // Target URL to navigate to
    instruction: string; // Task instructions for the agent (credentials NOT needed - agent calls perform_login tool)
    maxSteps: number; // Maximum number of steps the agent can take
    model?: string; // Stagehand model for DOM analysis and element extraction
    agentModel?: string; // Computer Use Agent model for executing task instructions
    systemPrompt?: string; // System prompt for the Computer Use Agent
    variables?: Record<string, string>; // Credentials (username, password, totp_secret) - NEVER exposed to LLM, used internally by perform_login tool
}

// Structured result status - discriminated union for type-safe outcomes
export type TaskResultStatus =
    | { status: 'success'; fileUrl: string; filename: string }
    | { status: 'login_failed'; reason: string }
    | { status: 'group_not_found'; groupId: string }
    | { status: 'document_not_found'; description: string }
    | { status: 'download_failed'; reason: string }
    | { status: 'error'; message: string };

export interface DownloadTaskOutput {
    result: TaskResultStatus;
    remotePath?: string;
    sessionId: string;
}

export interface Credentials {
    username?: string;
    password?: string;
    totpSecret?: string;
    email2faProvider?: string; // Provider name for email-based 2FA (e.g., "Guardian")
}
