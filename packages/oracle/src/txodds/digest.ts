import { createHash } from 'node:crypto';
import type { Outcome } from './types.ts';

// Canonical settlement digests — these MUST match the Rust program
// (score_digest / custom_digest in programs/ante-market/src/lib.rs).

export function scoreDigestHex(marketId: string, home: number, away: number): string {
  return createHash('sha256').update(`${marketId}:${home}:${away}`).digest('hex');
}

export function customDigestHex(marketId: string, outcome: Outcome): string {
  return createHash('sha256').update(`${marketId}:${outcome}`).digest('hex');
}

// Convert a hex digest to the byte array the Anchor instruction expects ([u8; 32]).
export function hexToBytes(hex: string): number[] {
  return Array.from(Buffer.from(hex, 'hex'));
}
