import { assertEquals } from "jsr:@std/assert@^1";
import { generateKeyPairSync } from "node:crypto";
import { join } from "jsr:@std/path@^1";
import { signAndPublish } from "../src/issue.ts";
import { verifyCredential } from "../src/verify.ts";
import { revokeCredential } from "../src/revoke.ts";
import { loadSigner } from "../src/keys.ts";
import { createDocumentLoader } from "../src/contexts.ts";
import { buildEmptyStatusList, type StatusListCredential } from "../src/status.ts";
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

function loadCoursesSync(): EngineConfig["courses"] {
  const text = Deno.readTextFileSync(
    new URL("./fixtures/test-courses.json", import.meta.url),
  );
  return JSON.parse(text) as EngineConfig["courses"];
}

Deno.test("issue with status → verify → revoke → verify reports revoked", async () => {
  const { pem, publicMultibase } = generateTestKeypair();
  const tempDir = await Deno.makeTempDir({ prefix: "gcu-cert-status-test-" });

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
    const baseUrl = "https://example.test/cert";
    const listUrl = `${baseUrl}/status/list-1.json`;

    const statusDir = join(tempDir, "status");
    await Deno.mkdir(statusDir, { recursive: true });
    const listPath = join(statusDir, "list-1.json");
    const nextIndexPath = join(statusDir, ".next-index");

    // Build and persist an empty signed status list.
    const signer = await loadSigner(pem, verificationMethod);
    const initialList = await buildEmptyStatusList({
      listUrl,
      issuerId: issuerDid,
      signer,
      documentLoader: createDocumentLoader({ [issuerDid]: didDoc, [verificationMethod]: vmDoc }),
    });
    await Deno.writeTextFile(listPath, JSON.stringify(initialList, null, 2) + "\n");

    const makeConfig = (list: StatusListCredential): EngineConfig => ({
      baseUrl,
      issuerId: issuerDid,
      verificationMethod,
      signingKeyPem: pem,
      codeSalt: "test-code-salt",
      recipientSalt: "test-recipient-salt",
      repoRoot: tempDir,
      courses: loadCoursesSync(),
      pinnedDocuments: {
        [issuerDid]: didDoc,
        [verificationMethod]: vmDoc,
        [listUrl]: list,
      },
      statusList: { publicUrl: listUrl, nextIndexPath },
    });

    // Issue: credential gets statusIndex 0.
    const issueResult = await signAndPublish(
      { name: "Ana Costa", course: "TEST-101", date: "2026-04-19" },
      makeConfig(initialList),
    );
    assertEquals(issueResult.statusIndex, 0);

    const issued = JSON.parse(await Deno.readTextFile(issueResult.credentialPath));
    const preRevokeCheck = await verifyCredential(
      issued,
      makeConfig(initialList).pinnedDocuments,
    );
    if (!preRevokeCheck.verified) console.error("Pre-revoke errors:", preRevokeCheck.errors);
    assertEquals(preRevokeCheck.verified, true);
    assertEquals(preRevokeCheck.revoked, false);

    // Revoke.
    await revokeCredential(
      {
        listPath,
        credentialPath: issueResult.credentialPath,
        reason: "test revocation",
      },
      makeConfig(initialList),
    );

    // Reload list and re-check.
    const updatedList: StatusListCredential = JSON.parse(await Deno.readTextFile(listPath));
    const postRevokeCheck = await verifyCredential(
      issued,
      makeConfig(updatedList).pinnedDocuments,
    );
    assertEquals(postRevokeCheck.signatureValid, true);
    assertEquals(postRevokeCheck.revoked, true);
    assertEquals(postRevokeCheck.verified, false);

    // Audit log written.
    const audit = await Deno.readTextFile(join(statusDir, "revocations.jsonl"));
    assertEquals(audit.trim().length > 0, true);
    const auditEntry = JSON.parse(audit.trim());
    assertEquals(auditEntry.statusIndex, 0);
    assertEquals(auditEntry.reason, "test revocation");

    // .next-index was advanced.
    const nextAfter = (await Deno.readTextFile(nextIndexPath)).trim();
    assertEquals(nextAfter, "1");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

