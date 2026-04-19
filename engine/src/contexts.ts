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
