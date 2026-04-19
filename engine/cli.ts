#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env --allow-net
// gcu-cert — unified CLI for the issuance engine.
//   gcu-cert issue --name "Ana Costa" --course PB-101 --date 2026-04-19
//   gcu-cert verify credentials/PB-101-ABCDEF.json
//   gcu-cert verify-ledger [--path ledger.jsonl]
//   gcu-cert revoke PB-101-ABCDEF --reason "accidental duplicate"

import { parseArgs } from "jsr:@std/cli@^1/parse-args";
import { resolve } from "jsr:@std/path@^1";

import { signAndPublish } from "./src/issue.ts";
import { verifyCredential } from "./src/verify.ts";
import { verifyChain } from "./src/ledger.ts";
import { revokeCredential } from "./src/revoke.ts";
import { loadCourses } from "./src/courses.ts";
import { createFetchingDocumentLoader } from "./src/contexts.ts";
import type { EngineConfig } from "./src/types.ts";

const ISSUER_DID = "did:web:gentropic.org";
const VERIFICATION_METHOD = `${ISSUER_DID}#key-1`;
const BASE_URL = "https://gentropic.org/cert";
const STATUS_LIST_URL = `${BASE_URL}/status/list-1.json`;

function usage(): never {
  console.error(`gcu-cert — GCU credential issuance CLI

Usage:
  gcu-cert issue --name NAME --course CODE --date YYYY-MM-DD [--email EMAIL]
  gcu-cert verify PATH
  gcu-cert verify-ledger [--path PATH]
  gcu-cert revoke CODE --reason "..."

Environment:
  GCU_ISSUER_SIGNING_KEY     PEM-encoded Ed25519 private key (required for issue/revoke)
  GCU_CODE_SALT              salt for deterministic code derivation (required for issue)
  GCU_RECIPIENT_SALT         salt for recipient-ID hashing (required for issue)
`);
  Deno.exit(2);
}

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) {
    console.error(`Required env var not set: ${name}`);
    Deno.exit(3);
  }
  return v;
}

async function buildFullConfig(repoRoot: string): Promise<EngineConfig> {
  const signingKeyPem = requireEnv("GCU_ISSUER_SIGNING_KEY");
  const codeSalt = requireEnv("GCU_CODE_SALT");
  const recipientSalt = requireEnv("GCU_RECIPIENT_SALT");

  const coursesPath = resolve(repoRoot, "courses.json");
  const courses = await loadCourses(coursesPath);

  // The signing path needs did:web resolution (controller's assertionMethod).
  const didDocPath = resolve(repoRoot, "..", "gentropic.github.io", ".well-known", "did.json");
  let pinnedDocuments: Record<string, unknown> = {};
  try {
    const didDoc = JSON.parse(await Deno.readTextFile(didDocPath));
    pinnedDocuments = {
      [ISSUER_DID]: didDoc,
      [VERIFICATION_METHOD]: didDoc.verificationMethod[0],
    };
  } catch {
    // Outside local sibling-repo layout: fall back to fetching at verify time.
  }

  return {
    baseUrl: BASE_URL,
    issuerId: ISSUER_DID,
    verificationMethod: VERIFICATION_METHOD,
    signingKeyPem,
    codeSalt,
    recipientSalt,
    repoRoot,
    courses,
    pinnedDocuments,
    statusList: {
      publicUrl: STATUS_LIST_URL,
      nextIndexPath: resolve(repoRoot, "status", ".next-index"),
    },
    ledger: {
      path: resolve(repoRoot, "ledger.jsonl"),
      tipPath: resolve(repoRoot, "ledger.tip"),
    },
    pdf: {
      outputDir: resolve(repoRoot, "pdfs"),
      validatorUrlTemplate: `${BASE_URL}/#v={code}&n={name}`,
      fontsDir: resolve(repoRoot, "fonts"),
      iccProfilePath: resolve(repoRoot, "sRGB-IEC61966-2.1.icc"),
    },
    // Rekor transparency logging: opt in via env. CI (emit-cert) sets
    // GCU_ENABLE_REKOR=1 and has OIDC available; local dev usually skips.
    ...(Deno.env.get("GCU_ENABLE_REKOR") === "1"
      ? { rekor: { cosignPath: Deno.env.get("COSIGN_PATH") ?? "cosign" } }
      : {}),
  };
}

async function issueCmd(args: Record<string, unknown>, repoRoot: string): Promise<number> {
  const name = args.name as string | undefined;
  const course = args.course as string | undefined;
  const date = args.date as string | undefined;
  const email = args.email as string | undefined;
  if (!name || !course || !date) {
    console.error("issue requires --name, --course, and --date");
    return 2;
  }

  const config = await buildFullConfig(repoRoot);
  const result = await signAndPublish({ name, course, date, email }, config);

  console.log(JSON.stringify(result, null, 2));
  return 0;
}

async function verifyCmd(args: Record<string, unknown>): Promise<number> {
  const targetArg = (args._ as unknown[])[0] as string | undefined;
  if (!targetArg) {
    console.error("verify requires a path to the credential JSON as the first positional arg");
    return 2;
  }

  const credentialText = await Deno.readTextFile(targetArg);
  const credential = JSON.parse(credentialText);

  // Preload the status list (the library's checkStatus callback reads from pinned).
  const cs = credential.credentialStatus as
    | { statusListCredential: string; statusListIndex: string | number }
    | undefined;
  const pinned: Record<string, unknown> = {};
  if (cs) {
    const listDoc = await (await fetch(cs.statusListCredential)).json();
    pinned[cs.statusListCredential] = listDoc;
  }

  // DID doc and verification method fetched on demand by the fetching loader.
  const documentLoader = createFetchingDocumentLoader(pinned);
  const result = await verifyCredential(credential, { pinnedDocuments: pinned, documentLoader });
  console.log(JSON.stringify({
    verified: result.verified,
    signatureValid: result.signatureValid,
    revoked: result.revoked,
    errors: result.errors.map((e) => e instanceof Error ? e.message : String(e)),
  }, null, 2));
  return result.verified ? 0 : 1;
}

async function verifyLedgerCmd(args: Record<string, unknown>, repoRoot: string): Promise<number> {
  const path = (args.path as string | undefined) ?? resolve(repoRoot, "ledger.jsonl");
  const result = await verifyChain(path);
  console.log(JSON.stringify(result, null, 2));
  return result.valid ? 0 : 1;
}

async function revokeCmd(args: Record<string, unknown>, repoRoot: string): Promise<number> {
  const code = (args._ as unknown[])[0] as string | undefined;
  if (!code) {
    console.error("revoke requires a credential code as the first positional arg");
    return 2;
  }
  const reason = args.reason as string | undefined;
  if (!reason) {
    console.error("revoke requires --reason");
    return 2;
  }
  const config = await buildFullConfig(repoRoot);
  const result = await revokeCredential(
    {
      listPath: resolve(repoRoot, "status", "list-1.json"),
      credentialPath: resolve(repoRoot, "credentials", `${code}.json`),
      reason,
    },
    config,
  );
  console.log(`Revoked ${result.code} (status index ${result.statusIndex}).`);
  return 0;
}

async function main(): Promise<number> {
  const argv = Deno.args;
  if (argv.length === 0) usage();
  const cmd = argv[0];
  const rest = argv.slice(1);
  const args = parseArgs(rest, {
    string: ["name", "course", "date", "email", "path", "reason"],
    alias: { n: "name", c: "course", d: "date" },
  });
  const repoRoot = Deno.cwd();

  switch (cmd) {
    case "issue":
      return await issueCmd(args, repoRoot);
    case "verify":
      return await verifyCmd(args);
    case "verify-ledger":
      return await verifyLedgerCmd(args, repoRoot);
    case "revoke":
      return await revokeCmd(args, repoRoot);
    case "--help":
    case "-h":
    case "help":
      usage();
      break;
    default:
      console.error(`Unknown command: ${cmd}`);
      usage();
  }
}

Deno.exit(await main());
