// Hash-chained issuance ledger. One JSONL line per emission. Each line's
// prev_hash is the sha256 of the previous line's full bytes (JSON + "\n").
// The chain makes silent insertion or modification of past entries visible.

export interface LedgerEntry {
  i: number;
  t: string;
  code: string;
  credential_hash: string;
  endorsement_hash: string;
  status_index?: number;
  prev_hash: string;
}

export const GENESIS_HASH = "sha256:" + "0".repeat(64);

async function sha256Hex(data: Uint8Array): Promise<string> {
  const ab = new ArrayBuffer(data.byteLength);
  new Uint8Array(ab).set(data);
  const buf = await crypto.subtle.digest("SHA-256", ab);
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashLine(lineWithNewline: string): Promise<string> {
  return "sha256:" + await sha256Hex(new TextEncoder().encode(lineWithNewline));
}

async function readTrimmedLines(ledgerPath: string): Promise<string[]> {
  let content: string;
  try {
    content = await Deno.readTextFile(ledgerPath);
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) return [];
    throw e;
  }
  const trimmed = content.replace(/\n+$/, "");
  if (trimmed.length === 0) return [];
  return trimmed.split("\n");
}

export async function getTip(ledgerPath: string): Promise<{ tip: string; nextIndex: number }> {
  const lines = await readTrimmedLines(ledgerPath);
  if (lines.length === 0) return { tip: GENESIS_HASH, nextIndex: 0 };
  const last = lines[lines.length - 1];
  const tip = await hashLine(last + "\n");
  const parsed = JSON.parse(last) as LedgerEntry;
  return { tip, nextIndex: parsed.i + 1 };
}

export interface AppendInput {
  ledgerPath: string;
  tipPath?: string;
  code: string;
  credential_hash: string;
  endorsement_hash: string;
  status_index?: number;
}

export async function appendEntry(input: AppendInput): Promise<LedgerEntry> {
  const { tip, nextIndex } = await getTip(input.ledgerPath);

  const entry: LedgerEntry = {
    i: nextIndex,
    t: new Date().toISOString(),
    code: input.code,
    credential_hash: input.credential_hash,
    endorsement_hash: input.endorsement_hash,
    ...(typeof input.status_index === "number" ? { status_index: input.status_index } : {}),
    prev_hash: tip,
  };

  const line = JSON.stringify(entry) + "\n";
  await Deno.writeTextFile(input.ledgerPath, line, { append: true });

  if (input.tipPath) {
    const newTip = await hashLine(line);
    await Deno.writeTextFile(input.tipPath, newTip + "\n");
  }

  return entry;
}

export interface VerifyResult {
  valid: boolean;
  entryCount: number;
  lineNumber?: number;
  error?: string;
}

export async function verifyChain(ledgerPath: string): Promise<VerifyResult> {
  const lines = await readTrimmedLines(ledgerPath);
  let prev = GENESIS_HASH;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let entry: LedgerEntry;
    try {
      entry = JSON.parse(line) as LedgerEntry;
    } catch (e) {
      return { valid: false, entryCount: i, lineNumber: i + 1, error: `malformed JSON: ${e}` };
    }
    if (entry.prev_hash !== prev) {
      return {
        valid: false,
        entryCount: i,
        lineNumber: i + 1,
        error: `prev_hash mismatch at line ${i + 1}: expected ${prev}, got ${entry.prev_hash}`,
      };
    }
    if (entry.i !== i) {
      return {
        valid: false,
        entryCount: i,
        lineNumber: i + 1,
        error: `index mismatch at line ${i + 1}: expected ${i}, got ${entry.i}`,
      };
    }
    prev = await hashLine(line + "\n");
  }

  return { valid: true, entryCount: lines.length };
}
