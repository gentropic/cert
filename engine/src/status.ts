// @ts-ignore — no bundled types
import * as vc from "@digitalbazaar/vc";
// @ts-ignore — no bundled types
import { DataIntegrityProof } from "@digitalbazaar/data-integrity";
// @ts-ignore — no bundled types
import { cryptosuite as eddsaRdfc2022CryptoSuite } from "@digitalbazaar/eddsa-rdfc-2022-cryptosuite";

import type { Signer } from "./types.ts";

export const LIST_BITS = 131072;
export const LIST_BYTES = LIST_BITS / 8;

export interface StatusListCredential {
  "@context": unknown[];
  id: string;
  type: string[];
  issuer: string;
  validFrom: string;
  credentialSubject: {
    id: string;
    type: "BitstringStatusList";
    statusPurpose: "revocation" | "suspension";
    encodedList: string;
  };
  proof?: unknown;
}

export interface CredentialStatusEntry {
  id: string;
  type: "BitstringStatusListEntry";
  statusPurpose: "revocation" | "suspension";
  statusListIndex: string;
  statusListCredential: string;
}

// Spec §18: big-endian bit order, MSB of byte 0 == index 0.
export function getBit(bytes: Uint8Array, index: number): boolean {
  if (index < 0 || index >= LIST_BITS) throw new RangeError(`index out of range: ${index}`);
  const byteIdx = index >>> 3;
  const bitPos = 7 - (index & 7);
  return ((bytes[byteIdx] >> bitPos) & 1) === 1;
}

export function setBit(bytes: Uint8Array, index: number, value: boolean): void {
  if (index < 0 || index >= LIST_BITS) throw new RangeError(`index out of range: ${index}`);
  const byteIdx = index >>> 3;
  const bitPos = 7 - (index & 7);
  if (value) bytes[byteIdx] |= 1 << bitPos;
  else bytes[byteIdx] &= ~(1 << bitPos);
}

async function gzipCompress(input: Uint8Array): Promise<Uint8Array> {
  const inputCopy = new Uint8Array(new ArrayBuffer(input.byteLength));
  inputCopy.set(input);
  const stream = new Blob([inputCopy]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gzipDecompress(input: Uint8Array): Promise<Uint8Array> {
  const inputCopy = new Uint8Array(new ArrayBuffer(input.byteLength));
  inputCopy.set(input);
  const stream = new Blob([inputCopy]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function bytesToBase64url(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "==".slice(0, (4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function encodeBitstring(bytes: Uint8Array): Promise<string> {
  return bytesToBase64url(await gzipCompress(bytes));
}

export async function decodeBitstring(encoded: string): Promise<Uint8Array> {
  return gzipDecompress(base64urlToBytes(encoded));
}

export async function extractBitstring(credential: StatusListCredential): Promise<Uint8Array> {
  return decodeBitstring(credential.credentialSubject.encodedList);
}

export interface BuildListOptions {
  listUrl: string;
  issuerId: string;
  validFrom?: string;
  signer: Signer;
  // deno-lint-ignore no-explicit-any
  documentLoader: (url: string) => Promise<any>;
}

export async function buildEmptyStatusList(opts: BuildListOptions): Promise<StatusListCredential> {
  const emptyBits = new Uint8Array(LIST_BYTES);
  const encodedList = await encodeBitstring(emptyBits);

  const unsigned: StatusListCredential = {
    "@context": ["https://www.w3.org/ns/credentials/v2"],
    id: opts.listUrl,
    type: ["VerifiableCredential", "BitstringStatusListCredential"],
    issuer: opts.issuerId,
    validFrom: opts.validFrom ?? new Date().toISOString(),
    credentialSubject: {
      id: `${opts.listUrl}#list`,
      type: "BitstringStatusList",
      statusPurpose: "revocation",
      encodedList,
    },
  };

  const suite = new DataIntegrityProof({ signer: opts.signer, cryptosuite: eddsaRdfc2022CryptoSuite });
  return await vc.issue({ credential: unsigned, suite, documentLoader: opts.documentLoader });
}

export async function revokeIndex(
  credential: StatusListCredential,
  index: number,
  opts: { signer: Signer; documentLoader: (url: string) => Promise<unknown> },
): Promise<StatusListCredential> {
  const bits = await extractBitstring(credential);
  setBit(bits, index, true);
  const encodedList = await encodeBitstring(bits);

  // Strip proof, update encodedList + validFrom, re-sign.
  const { proof: _proof, ...rest } = credential;
  const unsigned: StatusListCredential = {
    ...rest,
    validFrom: new Date().toISOString(),
    credentialSubject: { ...credential.credentialSubject, encodedList },
  };
  const suite = new DataIntegrityProof({ signer: opts.signer, cryptosuite: eddsaRdfc2022CryptoSuite });
  // deno-lint-ignore no-explicit-any
  return await vc.issue({ credential: unsigned, suite, documentLoader: opts.documentLoader as any });
}

export async function checkStatus(credential: StatusListCredential, index: number): Promise<boolean> {
  const bits = await extractBitstring(credential);
  return getBit(bits, index);
}
