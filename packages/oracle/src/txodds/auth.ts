import { ed25519 } from '@noble/curves/ed25519';

// TxLINE (TxODDS) REST authentication. The free World Cup tier is gated by an
// on-chain `subscribe` transaction; the API token below is then minted by
// proving ownership of the subscribing wallet:
//
//   1. POST /auth/guest/start            -> short-lived guest JWT
//   2. on-chain `subscribe(...)`         -> a transaction signature (txSig)
//   3. sign `${txSig}:${leagues}:${jwt}` -> detached ed25519, base64
//   4. POST /api/token/activate          -> long-lived X-Api-Token
//
// See txodds.ts for the one-time onboarding that runs all four steps.

export const TXODDS_BASE_URL = 'https://txline.txodds.com';

// Start a guest session. Returns the JWT used as the Bearer token everywhere.
export async function startGuestSession(baseUrl = TXODDS_BASE_URL): Promise<string> {
  const res = await fetch(`${baseUrl}/auth/guest/start`, { method: 'POST' });
  const text = await res.text();
  if (!res.ok) throw new Error(`guest/start ${res.status}: ${text}`);
  let token: string | undefined;
  try { token = (JSON.parse(text) as { token?: string; jwt?: string }).token; } catch { token = text.trim(); }
  if (!token) throw new Error(`guest/start: no token in response (${text})`);
  return token;
}

// The exact message TxODDS expects: txSig, comma-separated leagues, JWT.
export function activationMessage(txSig: string, leagues: number[], jwt: string): string {
  return `${txSig}:${leagues.join(',')}:${jwt}`;
}

// Detached ed25519 signature, base64-encoded. `secretKey` is the 64-byte Solana
// secret key (32-byte seed || 32-byte public key); noble signs from the seed.
export function signActivationMessage(message: string, secretKey: Uint8Array): string {
  const seed = secretKey.slice(0, 32);
  const sig = ed25519.sign(new TextEncoder().encode(message), seed);
  return Buffer.from(sig).toString('base64');
}

// Exchange (txSig + walletSignature + leagues) for a long-lived API token. The
// token is returned as plain text, not JSON.
export async function activateToken(
  jwt: string,
  body: { txSig: string; walletSignature: string; leagues: number[] },
  baseUrl = TXODDS_BASE_URL,
): Promise<string> {
  const res = await fetch(`${baseUrl}/api/token/activate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`token/activate ${res.status}: ${text}`);
  return text.trim();
}
