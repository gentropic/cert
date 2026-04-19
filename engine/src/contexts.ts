import { dirname, fromFileUrl, join } from "jsr:@std/path@^1";

type LoaderResult = {
  contextUrl: null;
  document: unknown;
  documentUrl: string;
};

const CONTEXTS_DIR = join(dirname(fromFileUrl(import.meta.url)), "contexts");

const CONTEXT_FILES: Record<string, string> = {
  "https://www.w3.org/ns/credentials/v2": "credentials-v2.jsonld",
  "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json": "ob-v3p0.jsonld",
  "https://w3id.org/security/multikey/v1": "multikey-v1.jsonld",
  "https://www.w3.org/ns/did/v1": "did-v1.jsonld",
};

function loadPinnedContexts(): Map<string, unknown> {
  const cache = new Map<string, unknown>();
  for (const [url, file] of Object.entries(CONTEXT_FILES)) {
    const text = Deno.readTextFileSync(join(CONTEXTS_DIR, file));
    cache.set(url, JSON.parse(text));
  }
  return cache;
}

export function createDocumentLoader(
  pinned: Record<string, unknown> = {},
): (url: string) => Promise<LoaderResult> {
  const contexts = loadPinnedContexts();

  return (url: string) => {
    if (pinned[url] !== undefined) {
      return Promise.resolve({ contextUrl: null, document: pinned[url], documentUrl: url });
    }
    if (contexts.has(url)) {
      return Promise.resolve({ contextUrl: null, document: contexts.get(url), documentUrl: url });
    }
    return Promise.reject(new Error(`documentLoader: refusing to fetch unpinned URL: ${url}`));
  };
}

// Fetching loader for CLI verify: contexts are always pinned (never fetched),
// but issuer/DID/status-list URLs can be fetched via HTTPS. A verifier who
// wants pure-offline verification passes caller-pinned documents to cover all
// non-context URLs, in which case the fetch path never runs.
export function createFetchingDocumentLoader(
  pinned: Record<string, unknown> = {},
): (url: string) => Promise<LoaderResult> {
  const contexts = loadPinnedContexts();

  return async (url: string) => {
    if (pinned[url] !== undefined) {
      return { contextUrl: null, document: pinned[url], documentUrl: url };
    }
    if (contexts.has(url)) {
      return { contextUrl: null, document: contexts.get(url), documentUrl: url };
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
    // Extract the fragment so the parent document is the fetch target.
    const hashIdx = url.indexOf("#");
    const fetchUrl = hashIdx >= 0 ? url.slice(0, hashIdx) : url;
    const res = await fetch(fetchUrl);
    if (!res.ok) throw new Error(`fetch failed for ${url}: ${res.status}`);
    return { contextUrl: null, document: await res.json(), documentUrl: url };
  };
}
