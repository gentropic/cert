#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env
// Revoke a single credential by code. Signing key comes from
// GCU_ISSUER_SIGNING_KEY env var (PEM contents) or the local PEM file.
// Usage: deno run scripts/revoke.ts <CODE> [--reason "..."]

import { dirname, fromFileUrl, resolve } from "jsr:@std/path@^1";
import { parseArgs } from "jsr:@std/cli@^1/parse-args";
import { revokeCredential } from "../engine/src/revoke.ts";
import { loadCourses } from "../engine/src/courses.ts";
import type { EngineConfig } from "../engine/src/types.ts";

const args = parseArgs(Deno.args, { string: ["reason"] });
const code = args._[0];
if (typeof code !== "string" || code.length === 0) {
  console.error("Usage: deno run scripts/revoke.ts <CODE> [--reason \"...\"]");
  Deno.exit(2);
}

const scriptDir = dirname(fromFileUrl(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const listPath = resolve(repoRoot, "status", "list-1.json");
const credentialPath = resolve(repoRoot, "credentials", `${code}.json`);
const pemFallbackPath = resolve(repoRoot, "GCU_ISSUER_SIGNING_KEY.pem");

let pem = Deno.env.get("GCU_ISSUER_SIGNING_KEY") ?? "";
if (!pem) pem = await Deno.readTextFile(pemFallbackPath);

const didDocPath = resolve(repoRoot, "..", "gentropic.github.io", ".well-known", "did.json");
const didDoc = JSON.parse(await Deno.readTextFile(didDocPath));

const issuerId = "did:web:gentropic.org";
const verificationMethod = `${issuerId}#key-1`;

const config: EngineConfig = {
  baseUrl: "https://gentropic.org/cert",
  issuerId,
  verificationMethod,
  signingKeyPem: pem,
  codeSalt: Deno.env.get("GCU_CODE_SALT") ?? "",
  recipientSalt: Deno.env.get("GCU_RECIPIENT_SALT") ?? "",
  repoRoot,
  courses: await loadCourses(resolve(repoRoot, "courses.json")),
  pinnedDocuments: {
    [issuerId]: didDoc,
    [verificationMethod]: didDoc.verificationMethod[0],
  },
};

const result = await revokeCredential(
  { listPath, credentialPath, reason: args.reason },
  config,
);

console.log(`Revoked ${result.code} (status index ${result.statusIndex}).`);
console.log(`Updated list: ${result.listPath}`);
