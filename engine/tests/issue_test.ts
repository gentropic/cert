import { assertEquals } from "jsr:@std/assert@^1";
import { generateKeyPairSync } from "node:crypto";
import { signAndPublish } from "../src/issue.ts";
import { verifyCredential } from "../src/verify.ts";
import type { EngineConfig } from "../src/types.ts";

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58btc(buf: Uint8Array): string {
  let num = 0n;
  for (const b of buf) num = (num << 8n) | BigInt(b);
  let out = "";
  while (num > 0n) {
    const rem = Number(num % 58n);
    num = num / 58n;
    out = B58[rem] + out;
  }
  for (const b of buf) {
    if (b === 0) out = "1" + out;
    else break;
  }
  return out;
}

function generateTestKeypair(): { pem: string; publicMultibase: string } {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pem = privateKey.export({ format: "pem", type: "pkcs8" }) as string;
  const jwk = publicKey.export({ format: "jwk" }) as { x: string };
  const b64 = jwk.x.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "==".slice(0, (4 - b64.length % 4) % 4));
  const rawPub = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const prefixed = new Uint8Array([0xed, 0x01, ...rawPub]);
  return { pem, publicMultibase: "z" + base58btc(prefixed) };
}

async function loadCourses(): Promise<Record<string, unknown>> {
  const text = await Deno.readTextFile(
    new URL("./fixtures/test-courses.json", import.meta.url),
  );
  return JSON.parse(text);
}

Deno.test("sign → verify round trip + tampering detection", async () => {
  const { pem, publicMultibase } = generateTestKeypair();
  const tempDir = await Deno.makeTempDir({ prefix: "gcu-cert-test-" });

  try {
    const issuerDid = "did:web:example.test";
    const verificationMethod = `${issuerDid}#key-1`;
    const vmDoc = {
      "@context": "https://w3id.org/security/multikey/v1",
      id: verificationMethod,
      type: "Multikey",
      controller: issuerDid,
      publicKeyMultibase: publicMultibase,
    };
    const didDoc = {
      "@context": ["https://www.w3.org/ns/did/v1", "https://w3id.org/security/multikey/v1"],
      id: issuerDid,
      verificationMethod: [vmDoc],
      assertionMethod: [verificationMethod],
    };

    const config: EngineConfig = {
      baseUrl: "https://example.test/cert",
      issuerId: issuerDid,
      verificationMethod,
      signingKeyPem: pem,
      codeSalt: "test-code-salt",
      recipientSalt: "test-recipient-salt",
      repoRoot: tempDir,
      courses: await loadCourses() as EngineConfig["courses"],
      pinnedDocuments: {
        [issuerDid]: didDoc,
        [verificationMethod]: vmDoc,
      },
    };

    const result = await signAndPublish(
      { name: "Ana Costa", course: "TEST-101", date: "2026-04-19" },
      config,
    );

    assertEquals(result.code.startsWith("TEST-101-"), true);
    assertEquals(result.code.length, "TEST-101-".length + 4);

    const credential = JSON.parse(await Deno.readTextFile(result.credentialPath));
    const ok = await verifyCredential(credential, config.pinnedDocuments);
    if (!ok.verified) console.error("Verification errors:", ok.errors);
    assertEquals(ok.verified, true);

    credential.credentialSubject.name = "Someone Else";
    const tampered = await verifyCredential(credential, config.pinnedDocuments);
    assertEquals(tampered.verified, false);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});
