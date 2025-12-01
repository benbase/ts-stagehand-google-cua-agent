import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface DownloadTaskInput {
    url: string;
    instruction: string;
    maxSteps: number;
    model?: string;
    agentModel?: string;
    systemPrompt?: string;
}

// ============================================
// Credential Merging Utility
// ============================================
// Used by invoke.sh to prepare payloads with actual credentials
export function mergeTaskConfig(taskName: string): DownloadTaskInput {
    const credentialsPath = join(__dirname, 'credentials.json');
    const taskConfigPath = join(__dirname, `${taskName}.json`);

    // Read credentials
    const credentials = JSON.parse(readFileSync(credentialsPath, 'utf-8'));

    // Read task config template
    const taskTemplate = JSON.parse(readFileSync(taskConfigPath, 'utf-8'));

    // Get credentials for this task
    const taskCreds = credentials[taskName];
    if (!taskCreds) {
        throw new Error(`No credentials found for task: ${taskName}. Available: ${Object.keys(credentials).join(', ')}`);
    }

    // Replace placeholders with actual credentials
    let instruction = taskTemplate.instruction;
    instruction = instruction.replace(/{{USERNAME}}/g, taskCreds.username);
    instruction = instruction.replace(/{{PASSWORD}}/g, taskCreds.password);
    instruction = instruction.replace(/{{GROUP_ID}}/g, taskCreds.groupId);

    // Build final payload
    return {
        url: taskTemplate.url,
        instruction,
        maxSteps: taskTemplate.maxSteps,
        model: taskTemplate.model || "openai/gpt-4.1",
        agentModel: taskTemplate.agentModel || "google/gemini-2.5-computer-use-preview-10-2025",
        systemPrompt: taskTemplate.systemPrompt || "You are a helpful assistant that can use a web browser. Do not ask follow up questions, the user will trust your judgement."
    };
}

// CLI usage: npx tsx prepare-payload.ts <task-name>
// Example: npx tsx prepare-payload.ts kaiser
// This prepares the download payload by merging credentials with task config
if (process.argv[2] && !process.argv[2].startsWith('-')) {
    try {
        const taskName = process.argv[2];
        const payload = mergeTaskConfig(taskName);
        console.log(JSON.stringify(payload));
    } catch (error) {
        if (error instanceof Error) {
            console.error(`Error: ${error.message}`);
        }
        process.exit(1);
    }
}
