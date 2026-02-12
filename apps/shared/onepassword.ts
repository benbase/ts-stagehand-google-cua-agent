/**
 * 1Password SDK integration for resolving credentials at runtime.
 * Requires OP_SERVICE_ACCOUNT_TOKEN env var to be set.
 */

import { createClient, type Client } from '@1password/sdk';
import type { Credentials } from './tools/types';

let client: Client | null = null;

async function getClient(): Promise<Client> {
  if (client) return client;

  const token = process.env.OP_SERVICE_ACCOUNT_TOKEN;
  if (!token) {
    throw new Error(
      'OP_SERVICE_ACCOUNT_TOKEN is not set. ' +
      'Create a service account at https://my.1password.com/developer-tools/infrastructure-secrets/serviceaccount'
    );
  }

  client = await createClient({
    auth: token,
    integrationName: 'BenBase Kernel',
    integrationVersion: 'v1.0.0',
  });
  return client;
}

/** Check if a value is a 1Password secret reference (op://vault/item/field) */
export function isOpReference(value?: string): boolean {
  return !!value?.startsWith('op://');
}

/** Resolve a single 1Password secret reference to its actual value. */
export async function resolveSecret(ref: string): Promise<string> {
  const op = await getClient();
  return op.secrets.resolve(ref);
}

/**
 * Resolve credentials that may contain op:// references.
 * Fields that don't start with op:// are returned unchanged.
 * If no fields use op://, returns credentials as-is (no 1P client needed).
 */
export async function resolveCredentials(credentials?: Credentials): Promise<Credentials | undefined> {
  if (!credentials) return credentials;

  const hasOpRefs = [credentials.username, credentials.password, credentials.totpSecret]
    .some(v => isOpReference(v));

  if (!hasOpRefs) return credentials;

  console.log('[1password] Resolving credentials from 1Password...');

  const [username, password, totpSecret] = await Promise.all([
    isOpReference(credentials.username) ? resolveSecret(credentials.username) : Promise.resolve(credentials.username),
    isOpReference(credentials.password) ? resolveSecret(credentials.password) : Promise.resolve(credentials.password),
    isOpReference(credentials.totpSecret) ? resolveSecret(credentials.totpSecret!) : Promise.resolve(credentials.totpSecret),
  ]);

  console.log('[1password] Credentials resolved successfully');

  return { username, password, totpSecret, carrier: credentials.carrier };
}
