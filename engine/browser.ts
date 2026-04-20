// Entry point for the browser validator bundle. Re-exports the subset of the
// engine the validator uses. Bundled via esbuild into ../validator-bundle.js
// and imported from index.html as a plain ESM module.

export {
  type FontBytes,
  type CertificateInput,
  renderCertificatePdf,
} from "./src/pdf.ts";

export {
  type PdfAttachment,
  type XmpInput,
  type AfRelationship,
  buildXmpMetadata,
} from "./src/pdfa.ts";

export { verifyCredential, type VerificationResult } from "./src/verify.ts";
export { checkStatus, extractBitstring, type StatusListCredential } from "./src/status.ts";
export { verifyChain, getTip, type LedgerEntry } from "./src/ledger.ts";
export { createFetchingDocumentLoader, createDocumentLoader } from "./src/contexts.ts";
