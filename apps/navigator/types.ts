export interface NavigatorTaskInput {
    url: string;
    instruction: string;
    maxSteps?: number;
    model?: string;
    proxyType?: 'mobile' | 'residential' | 'isp' | 'datacenter';
    proxyCountry?: string;
    variables?: Record<string, string>;
}

export type TaskResultStatus =
    | { status: 'success'; message?: string; fileUrl?: string; filename?: string }
    | { status: 'login_failed'; reason: string }
    | { status: 'error'; message: string };

export interface NavigatorTaskOutput {
    result: TaskResultStatus;
    sessionId: string;
}
