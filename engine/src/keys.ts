import type { Signer } from "./types.ts";

function pemToDer(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/\s/g, "");
  const bin = atob(body);
  const buffer = new ArrayBuffer(bin.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return buffer;
}

export async function loadSigner(pem: string, verificationMethod: string): Promise<Signer> {
  const der = pemToDer(pem);
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "Ed25519" },
    false,
    ["sign"],
  );

  return {
    id: verificationMethod,
    algorithm: "Ed25519",
    async sign({ data }) {
      // Copy into a fresh ArrayBuffer-backed Uint8Array so the type matches BufferSource strictly.
      const copy = new Uint8Array(new ArrayBuffer(data.byteLength));
      copy.set(data);
      const sig = await crypto.subtle.sign("Ed25519", cryptoKey, copy);
      return new Uint8Array(sig);
    },
  };
}
