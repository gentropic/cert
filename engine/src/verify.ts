// @ts-ignore — no bundled types
import * as vc from "@digitalbazaar/vc";
// @ts-ignore — no bundled types
import { DataIntegrityProof } from "@digitalbazaar/data-integrity";
// @ts-ignore — no bundled types
import { cryptosuite as eddsaRdfc2022CryptoSuite } from "@digitalbazaar/eddsa-rdfc-2022-cryptosuite";

import { createDocumentLoader } from "./contexts.ts";

export interface VerificationResult {
  verified: boolean;
  errors: unknown[];
}

export async function verifyCredential(
  credential: unknown,
  pinnedDocuments: Record<string, unknown> = {},
): Promise<VerificationResult> {
  const suite = new DataIntegrityProof({ cryptosuite: eddsaRdfc2022CryptoSuite });
  const documentLoader = createDocumentLoader(pinnedDocuments);

  const result = await vc.verifyCredential({ credential, suite, documentLoader });

  const errors: unknown[] = [];
  if (result.error) errors.push(result.error);
  if (Array.isArray(result.results)) {
    for (const r of result.results) if (r.error) errors.push(r.error);
  }
  return { verified: Boolean(result.verified), errors };
}
