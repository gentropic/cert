// Document loader used by the signing + verification pipeline. JSON-LD
// contexts are statically imported so bundle and runtime both see the same
// pinned bytes and never fetch contexts from the network.

import credentialsV2 from "./contexts/credentials-v2.json" with { type: "json" };
import obV3p0 from "./contexts/ob-v3p0.json" with { type: "json" };
import multikeyV1 from "./contexts/multikey-v1.json" with { type: "json" };
import didV1 from "./contexts/did-v1.json" with { type: "json" };

type LoaderResult = {
  contextUrl: null;
  document: unknown;
  documentUrl: string;
};

const PINNED_CONTEXTS: Record<string, unknown> = {
  "https://www.w3.org/ns/credentials/v2": credentialsV2,
  "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json": obV3p0,
  "https://w3id.org/security/multikey/v1": multikeyV1,
  "https://www.w3.org/ns/did/v1": didV1,
};

export function createDocumentLoader(
  pinned: Record<string, unknown> = {},
): (url: string) => Promise<LoaderResult> {
  return (url: string) => {
    if (pinned[url] !== undefined) {
      return Promise.resolve({ contextUrl: null, document: pinned[url], documentUrl: url });
    }
    if (PINNED_CONTEXTS[url] !== undefined) {
      return Promise.resolve({ contextUrl: null, document: PINNED_CONTEXTS[url], documentUrl: url });
    }
    return Promise.reject(new Error(`documentLoader: refusing to fetch unpinned URL: ${url}`));
  };
}

// Fetching loader for CLI verify + the browser validator: contexts are always
// pinned (never fetched), but issuer/DID/status-list URLs can be fetched via
// HTTPS. A verifier who wants pure-offline verification passes caller-pinned
// documents to cover all non-context URLs, in which case the fetch path never
// runs.
export function createFetchingDocumentLoader(
  pinned: Record<string, unknown> = {},
): (url: string) => Promise<LoaderResult> {
  return async (url: string) => {
    if (pinned[url] !== undefined) {
      return { contextUrl: null, document: pinned[url], documentUrl: url };
    }
    if (PINNED_CONTEXTS[url] !== undefined) {
      return { contextUrl: null, document: PINNED_CONTEXTS[url], documentUrl: url };
    }
    // Resolve did:web per W3C: did:web:example.com → https://example.com/.well-known/did.json.
    if (url.startsWith("did:web:")) {
      const [didOnly, fragment] = url.split("#");
      const rest = didOnly.slice("did:web:".length);
      const [host, ...path] = rest.split(":");
      const httpsUrl = path.length > 0
        ? `https://${host}/${path.join("/")}/did.json`
        : `https://${host}/.well-known/did.json`;
      const res = await fetch(httpsUrl);
      if (!res.ok) throw new Error(`did:web resolution failed for ${url}: ${res.status}`);
      const didDoc = await res.json();
      // If the URL targets a fragment (typically a verificationMethod id),
      // return just that sub-object so jsonld-signatures can inspect the key.
      if (fragment) {
        const vms: Array<{ id: string }> = didDoc.verificationMethod ?? [];
        const match = vms.find((vm) => vm.id === url || vm.id === `#${fragment}`);
        if (match) return { contextUrl: null, document: match, documentUrl: url };
      }
      return { contextUrl: null, document: didDoc, documentUrl: url };
    }
    // Strip fragment for HTTP fetches (parent document is the fetch target).
    const hashIdx = url.indexOf("#");
    const fetchUrl = hashIdx >= 0 ? url.slice(0, hashIdx) : url;
    const res = await fetch(fetchUrl);
    if (!res.ok) throw new Error(`fetch failed for ${url}: ${res.status}`);
    return { contextUrl: null, document: await res.json(), documentUrl: url };
  };
}
