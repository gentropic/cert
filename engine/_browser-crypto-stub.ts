// Empty stub for `import ... from "crypto"` in the browser bundle.
// Libraries that conditionally use node:crypto (e.g. @noble/ed25519 v1,
// rdf-canonize) catch the absence of node APIs and fall back to Web Crypto —
// they just need the import itself to succeed. This module provides the
// successful import with nothing in it.
export {};
