import type { EngineConfig } from "./types.ts";
import { loadSigner } from "./keys.ts";
import { createDocumentLoader } from "./contexts.ts";
import { revokeIndex, type StatusListCredential } from "./status.ts";

export interface RevokeOptions {
  // Absolute path to the signed status list on disk (e.g. status/list-1.json).
  listPath: string;
  // Absolute path to the credential to revoke (needed to look up its statusListIndex).
  credentialPath: string;
  reason?: string;
  // Optional audit log path; defaults to status/revocations.jsonl next to the list.
  auditLogPath?: string;
}

export interface RevokeResult {
  code: string;
  statusIndex: number;
  listPath: string;
}

interface RevokableCredential {
  id: string;
  credentialStatus?: {
    statusListIndex: string | number;
    statusListCredential: string;
  };
}

export async function revokeCredential(
  opts: RevokeOptions,
  config: EngineConfig,
): Promise<RevokeResult> {
  const credText = await Deno.readTextFile(opts.credentialPath);
  const credential: RevokableCredential = JSON.parse(credText);
  if (!credential.credentialStatus) {
    throw new Error(`Credential has no credentialStatus: ${opts.credentialPath}`);
  }
  const indexRaw = credential.credentialStatus.statusListIndex;
  const index = typeof indexRaw === "string" ? Number.parseInt(indexRaw, 10) : indexRaw;
  if (!Number.isFinite(index) || index < 0) {
    throw new Error(`Invalid statusListIndex: ${indexRaw}`);
  }

  const listText = await Deno.readTextFile(opts.listPath);
  const list: StatusListCredential = JSON.parse(listText);

  const signer = await loadSigner(config.signingKeyPem, config.verificationMethod);
  const documentLoader = createDocumentLoader(config.pinnedDocuments ?? {});

  const updated = await revokeIndex(list, index, { signer, documentLoader });
  await Deno.writeTextFile(opts.listPath, JSON.stringify(updated, null, 2) + "\n");

  const auditPath = opts.auditLogPath ??
    opts.listPath.replace(/list-\d+\.json$/, "revocations.jsonl");
  const auditLine = JSON.stringify({
    t: new Date().toISOString(),
    credential: credential.id,
    statusIndex: index,
    reason: opts.reason ?? null,
  }) + "\n";
  await Deno.writeTextFile(auditPath, auditLine, { append: true });

  const code = credential.id.split("/").pop()?.replace(/\.json$/, "") ?? "?";
  return { code, statusIndex: index, listPath: opts.listPath };
}
