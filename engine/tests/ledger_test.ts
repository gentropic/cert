import { assertEquals } from "jsr:@std/assert@^1";
import { join } from "jsr:@std/path@^1";
import { appendEntry, GENESIS_HASH, getTip, verifyChain } from "../src/ledger.ts";

Deno.test("ledger: append + verify chain + tamper detection", async () => {
  const dir = await Deno.makeTempDir({ prefix: "gcu-ledger-test-" });
  try {
    const ledgerPath = join(dir, "ledger.jsonl");
    const tipPath = join(dir, "ledger.tip");

    const initialTip = await getTip(ledgerPath);
    assertEquals(initialTip.tip, GENESIS_HASH);
    assertEquals(initialTip.nextIndex, 0);

    const e0 = await appendEntry({
      ledgerPath,
      tipPath,
      code: "TEST-101-AAAA",
      credential_hash: "sha256:" + "a".repeat(64),
      endorsement_hash: "sha256:" + "b".repeat(64),
      status_index: 0,
    });
    assertEquals(e0.i, 0);
    assertEquals(e0.prev_hash, GENESIS_HASH);

    const e1 = await appendEntry({
      ledgerPath,
      tipPath,
      code: "TEST-101-BBBB",
      credential_hash: "sha256:" + "c".repeat(64),
      endorsement_hash: "sha256:" + "d".repeat(64),
      status_index: 1,
    });
    assertEquals(e1.i, 1);
    assertEquals(e1.prev_hash.startsWith("sha256:"), true);
    assertEquals(e1.prev_hash !== GENESIS_HASH, true);

    const e2 = await appendEntry({
      ledgerPath,
      tipPath,
      code: "TEST-101-CCCC",
      credential_hash: "sha256:" + "e".repeat(64),
      endorsement_hash: "sha256:" + "f".repeat(64),
      status_index: 2,
    });
    assertEquals(e2.i, 2);

    const ok = await verifyChain(ledgerPath);
    assertEquals(ok.valid, true);
    assertEquals(ok.entryCount, 3);

    // Tip file is consistent.
    const tip = (await Deno.readTextFile(tipPath)).trim();
    const { tip: computedTip } = await getTip(ledgerPath);
    assertEquals(tip, computedTip);

    // Tamper: edit the middle entry's code.
    const content = await Deno.readTextFile(ledgerPath);
    const tampered = content.replace("TEST-101-BBBB", "TEST-101-XXXX");
    await Deno.writeTextFile(ledgerPath, tampered);

    const broken = await verifyChain(ledgerPath);
    assertEquals(broken.valid, false);
    // The tampered line itself parses and has index 1, but line 2's prev_hash
    // no longer matches the hash of the tampered line 1 → failure at line 3.
    assertEquals(broken.lineNumber, 3);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
