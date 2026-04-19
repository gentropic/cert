#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env
// Initialize status/list-1.json (empty signed StatusList2021Credential) and
// status/.next-index = 0. Signing key comes from GCU_ISSUER_SIGNING_KEY env
// var (PEM contents) or ../GCU_ISSUER_SIGNING_KEY.pem file as a fallback for
// local bootstrap. Idempotent refusal: will not overwrite an existing list.

import { dirname, fromFileUrl, resolve } from "jsr:@std/path@^1";
import { loadSigner } from "../engine/src/keys.ts";
import { createDocumentLoader } from "../engine/src/contexts.ts";
import { buildEmptyStatusList } from "../engine/src/status.ts";

const scriptDir = dirname(fromFileUrl(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const statusDir = resolve(repoRoot, "status");
const listPath = resolve(statusDir, "list-1.json");
const nextIndexPath = resolve(statusDir, ".next-index");
const pemFallbackPath = resolve(repoRoot, "GCU_ISSUER_SIGNING_KEY.pem");

try {
  await Deno.stat(listPath);
  console.error(`Refusing to overwrite existing ${listPath}`);
  Deno.exit(1);
} catch (e) {
  if (!(e instanceof Deno.errors.NotFound)) throw e;
}

let pem = Deno.env.get("GCU_ISSUER_SIGNING_KEY") ?? "";
if (!pem) {
  try {
    pem = await Deno.readTextFile(pemFallbackPath);
  } catch (_e) {
    console.error("No GCU_ISSUER_SIGNING_KEY env var and no local PEM file found.");
    Deno.exit(2);
  }
}

const issuerId = "did:web:gentropic.org";
const verificationMethod = `${issuerId}#key-1`;
const listUrl = "https://gentropic.org/cert/status/list-1.json";

// The signing pipeline's document loader needs to resolve the DID during
// proof creation. Pin the local did.json mirror.
const didDocPath = resolve(repoRoot, "..", "gentropic.github.io", ".well-known", "did.json");
const didDoc = JSON.parse(await Deno.readTextFile(didDocPath));

const signer = await loadSigner(pem, verificationMethod);
const documentLoader = createDocumentLoader({
  [issuerId]: didDoc,
  [verificationMethod]: didDoc.verificationMethod[0],
});

const list = await buildEmptyStatusList({
  listUrl,
  issuerId,
  signer,
  documentLoader,
});

await Deno.mkdir(statusDir, { recursive: true });
await Deno.writeTextFile(listPath, JSON.stringify(list, null, 2) + "\n");
await Deno.writeTextFile(nextIndexPath, "0\n");

console.log(`Wrote ${listPath}`);
console.log(`Wrote ${nextIndexPath} (= 0)`);
