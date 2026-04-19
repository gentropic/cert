import { assertEquals } from "jsr:@std/assert@^1";
import { join } from "jsr:@std/path@^1";
import { generateKeyPairSync } from "node:crypto";
import { signAndPublish } from "../src/issue.ts";
import { logBlob } from "../src/rekor.ts";
import type { CosignRunner, EngineConfig } from "../src/types.ts";

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

Deno.test("rekor: logBlob constructs correct cosign args and propagates failure", async () => {
  const invocations: string[][] = [];
  const okRunner: CosignRunner = async (args) => {
    invocations.push([...args]);
    // Simulate cosign writing a bundle file at the --bundle path.
    const bundlePath = args[args.indexOf("--bundle") + 1];
    await Deno.writeTextFile(bundlePath, '{"fake":"bundle"}');
    return { success: true, stderr: "" };
  };

  const tmp = await Deno.makeTempDir({ prefix: "gcu-rekor-test-" });
  try {
    const subject = join(tmp, "credential.json");
    await Deno.writeTextFile(subject, '{"id":"x"}');
    const bundle = join(tmp, "credential.rekor.bundle");

    const result = await logBlob({ subjectPath: subject, bundlePath: bundle, runner: okRunner });
    assertEquals(result.bundlePath, bundle);
    assertEquals(invocations.length, 1);
    assertEquals(invocations[0], ["sign-blob", "--bundle", bundle, "--yes", subject]);
    const written = await Deno.readTextFile(bundle);
    assertEquals(written, '{"fake":"bundle"}');

    // Failure propagates.
    const failRunner: CosignRunner = () =>
      Promise.resolve({ success: false, stderr: "no OIDC identity" });
    let caught: Error | undefined;
    try {
      await logBlob({ subjectPath: subject, bundlePath: bundle, runner: failRunner });
    } catch (e) {
      caught = e as Error;
    }
    assertEquals(caught?.message.includes("cosign sign-blob failed"), true);
    assertEquals(caught?.message.includes("no OIDC identity"), true);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("issue: when config.rekor is set, credential + endorsement + tip are logged", async () => {
  const { pem, publicMultibase } = generateTestKeypair();
  const tmp = await Deno.makeTempDir({ prefix: "gcu-issue-rekor-test-" });
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

    const runs: string[][] = [];
    const runner: CosignRunner = async (args) => {
      runs.push([...args]);
      await Deno.writeTextFile(args[args.indexOf("--bundle") + 1], '{"fake":true}');
      return { success: true, stderr: "" };
    };

    const ledgerPath = join(tmp, "ledger.jsonl");
    const tipPath = join(tmp, "ledger.tip");

    const config: EngineConfig = {
      baseUrl: "https://example.test/cert",
      issuerId: issuerDid,
      verificationMethod,
      signingKeyPem: pem,
      codeSalt: "test-code-salt",
      recipientSalt: "test-recipient-salt",
      repoRoot: tmp,
      courses: loadCoursesSync(),
      pinnedDocuments: {
        [issuerDid]: didDoc,
        [verificationMethod]: vmDoc,
      },
      ledger: { path: ledgerPath, tipPath },
      rekor: { runner },
    };

    const result = await signAndPublish(
      { name: "Ana Costa", course: "TEST-101", date: "2026-04-19" },
      config,
    );

    assertEquals(runs.length, 3); // credential, endorsement, tip
    assertEquals(runs[0][4], result.credentialPath);
    assertEquals(runs[1][4], result.endorsementPath);
    assertEquals(runs[2][4], tipPath);
    assertEquals(result.rekorBundlePaths?.credential.endsWith(".rekor.bundle"), true);
    assertEquals(result.rekorBundlePaths?.ledgerTip?.endsWith("ledger.tip.rekor.bundle"), true);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});
