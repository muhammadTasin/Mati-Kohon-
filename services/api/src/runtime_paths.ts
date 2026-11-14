/**
 * Where the API may write. Locally the stores sit in services/api/.data and services/api/data/audio; on a read-only
 * serverless host (Vercel, AWS Lambda) only the temp folder can be written, so every store moves there. Files in the
 * temp folder last as long as one warm instance: fine for the guest demo, not durable storage.
 * Each store's own environment variable (EDEN_CALL_STORE, EDEN_OFFICER_STORE, CATTLE_STORE_PATH, ...) still wins.
 */
import os from 'node:os';
import path from 'node:path';

export const READ_ONLY_HOST = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

/** `local` on a normal server; `<tmp>/eden/<name>` on a read-only host. */
export function writablePath(local: string, name: string): string {
  return READ_ONLY_HOST ? path.join(os.tmpdir(), 'eden', name) : local;
}
