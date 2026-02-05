/**
 * Shared tool type definitions used by both Driver and Navigator apps
 */

export interface Credentials {
    username: string;
    password: string;
    totpSecret?: string;
    carrier?: string; // Carrier name - used for email 2FA lookup
}

export interface LoginResult {
    success: boolean;
    message: string;
}

export interface ReportResultInput {
    status: 'success' | 'login_failed' | 'group_not_found' | 'download_failed' | 'error';
    message: string;
    filename?: string;
}

export interface ToolDefinition {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
}

// Common tool names used across apps
export const TOOL_NAMES = {
    PERFORM_LOGIN: 'perform_login',
    REPORT_RESULT: 'report_result',
} as const;
