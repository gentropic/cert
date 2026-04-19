// @ts-ignore — no bundled types
import * as vc from "@digitalbazaar/vc";
// @ts-ignore — no bundled types
import { DataIntegrityProof } from "@digitalbazaar/data-integrity";
// @ts-ignore — no bundled types
import { cryptosuite as eddsaRdfc2022CryptoSuite } from "@digitalbazaar/eddsa-rdfc-2022-cryptosuite";

import { createDocumentLoader } from "./contexts.ts";
import { checkStatus as checkBit, type StatusListCredential } from "./status.ts";

export interface VerificationResult {
  verified: boolean;
  signatureValid: boolean;
  revoked: boolean;
  errors: unknown[];
}

interface CredentialWithStatus {
  credentialStatus?: {
    statusListIndex: string | number;
    statusListCredential: string;
    statusPurpose?: string;
  };
}

export async function verifyCredential(
  credential: unknown,
  pinnedDocuments: Record<string, unknown> = {},
): Promise<VerificationResult> {
  const suite = new DataIntegrityProof({ cryptosuite: eddsaRdfc2022CryptoSuite });
  const documentLoader = createDocumentLoader(pinnedDocuments);

  let revoked = false;
  const statusErrors: unknown[] = [];

  // deno-lint-ignore no-explicit-any
  const checkStatus = async ({ credential: cred }: { credential: any }) => {
    const cs = (cred as CredentialWithStatus).credentialStatus;
    if (!cs) return { verified: true };
    const listDoc = pinnedDocuments[cs.statusListCredential] as StatusListCredential | undefined;
    if (!listDoc) {
      const err = new Error(`status list not pinned: ${cs.statusListCredential}`);
      statusErrors.push(err);
      return { verified: false, error: err };
    }
    const index = typeof cs.statusListIndex === "string"
      ? Number.parseInt(cs.statusListIndex, 10)
      : cs.statusListIndex;
    if (!Number.isFinite(index) || index < 0) {
      const err = new Error(`invalid statusListIndex: ${cs.statusListIndex}`);
      statusErrors.push(err);
      return { verified: false, error: err };
    }
    revoked = await checkBit(listDoc, index);
    return revoked
      ? { verified: false, error: new Error("credential revoked") }
      : { verified: true };
  };

  const hasStatus = Boolean((credential as CredentialWithStatus).credentialStatus);
  const result = await vc.verifyCredential({
    credential,
    suite,
    documentLoader,
    ...(hasStatus ? { checkStatus } : {}),
  });

  const errors: unknown[] = [...statusErrors];
  if (result.error) errors.push(result.error);
  if (Array.isArray(result.results)) {
    for (const r of result.results) if (r.error) errors.push(r.error);
  }

  // signatureValid is the DB library's `verified` minus our revocation contribution.
  // When `revoked` is true, the library reports verified=false; the signature itself
  // may still be valid, so subtract the revocation signal out.
  const signatureValid = result.verified || revoked;

  return {
    verified: signatureValid && !revoked,
    signatureValid,
    revoked,
    errors,
  };
}
