import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Where the onboarding CLI saves the live TxODDS credentials. Gitignored — it
// holds the guest JWT + long-lived API token (no wallet secret). Env vars
// (TXODDS_JWT / TXODDS_API_TOKEN) always take precedence over this file.
export interface TxOddsCreds {
  jwt: string;
  apiToken: string;
  txSig?: string;
  network?: string;
  createdAt?: string;
}

// Repo root: this file lives at packages/oracle/src/txodds/creds.ts.
const repoRootCreds = fileURLToPath(new URL('../../../../.txodds-creds.json', import.meta.url));

function candidatePaths(): string[] {
  const paths = [repoRootCreds, `${process.cwd()}/.txodds-creds.json`];
  if (process.env.TXODDS_CREDS) paths.unshift(process.env.TXODDS_CREDS);
  return [...new Set(paths)];
}

export function readCreds(): TxOddsCreds | null {
  for (const p of candidatePaths()) {
    if (existsSync(p)) {
      try { return JSON.parse(readFileSync(p, 'utf8')) as TxOddsCreds; } catch { /* try next */ }
    }
  }
  return null;
}

export function writeCreds(creds: TxOddsCreds): string {
  const path = process.env.TXODDS_CREDS ?? repoRootCreds;
  writeFileSync(path, JSON.stringify(creds, null, 2) + '\n');
  return path;
}
