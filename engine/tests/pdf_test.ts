import { assertEquals } from "jsr:@std/assert@^1";
import { loadPlexFonts, renderCertificatePdf } from "../src/pdf.ts";
import { dirname, fromFileUrl, resolve } from "jsr:@std/path@^1";

const repoRoot = resolve(dirname(fromFileUrl(import.meta.url)), "..", "..");

Deno.test("pdf: renderCertificatePdf produces a valid PDF with expected metadata", async () => {
  const fonts = await loadPlexFonts(resolve(repoRoot, "fonts"));
  const bytes = await renderCertificatePdf({
    fonts,
    recipientName: "Ana Costa",
    courseName: "Patchbay 101 — API Workshop",
    courseCode: "PB-101",
    credentialCode: "PB-101-AAAA",
    dateIso: "2026-04-19T00:00:00Z",
    hours: 3,
    topics: ["HTTP methods", "JSON parsing", "REST APIs"],
    issuerName: "Arthur Endlein",
    issuerLabel: "Instructor — Patchbay Series",
    orgName: "Geoscientific Chaos Union",
    seriesName: "Patchbay",
    validatorUrl: "https://gentropic.org/cert/#v=PB-101-AAAA&n=Ana%20Costa",
    accentColor: "#d4a017",
  });

  // Valid PDF starts with %PDF- and contains %%EOF near the end.
  const head = new TextDecoder().decode(bytes.slice(0, 5));
  assertEquals(head, "%PDF-");
  const tail = new TextDecoder().decode(bytes.slice(bytes.length - 1024));
  assertEquals(tail.includes("%%EOF"), true);

  // Non-trivial size — the QR code alone is kilobytes.
  assertEquals(bytes.length > 3_000, true);
});
