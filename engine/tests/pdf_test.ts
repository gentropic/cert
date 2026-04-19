import { assertEquals, assertStringIncludes } from "jsr:@std/assert@^1";
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

Deno.test("pdf: PDF/A-3B enrichment adds ICC, XMP, AF, trailer ID", async () => {
  const fonts = await loadPlexFonts(resolve(repoRoot, "fonts"));
  const iccProfile = await Deno.readFile(resolve(repoRoot, "sRGB-IEC61966-2.1.icc"));
  const credentialJson = new TextEncoder().encode('{"id":"x","type":["VerifiableCredential"]}');
  const endorsementJson = new TextEncoder().encode('{"id":"y","type":["VerifiableCredential"]}');

  const bytes = await renderCertificatePdf({
    fonts,
    iccProfile,
    issuerId: "did:web:example.test",
    credentialHash: "deadbeef".repeat(8),
    attachments: { credentialJson, endorsementJson },
    recipientName: "Ana Costa",
    courseName: "Test Course",
    courseCode: "TEST-101",
    credentialCode: "TEST-101-AAAAAA",
    dateIso: "2026-04-19T00:00:00Z",
    hours: 3,
    topics: ["topic 1", "topic 2"],
    issuerName: "Arthur Endlein",
    seriesName: "Test Series",
    validatorUrl: "https://example.test/cert/#v=X",
    accentColor: "#d4a017",
  });

  // Cheap byte-level assertions that prove the PDF/A pieces landed without
  // requiring veraPDF to be installed. Conformance testing itself is a CI
  // step (or local `verapdf -f 3b <file>`).
  const text = new TextDecoder("latin1").decode(bytes);
  assertStringIncludes(text, "pdfaid:part");
  assertStringIncludes(text, "pdfaid:conformance");
  assertStringIncludes(text, "AFRelationship");
  assertStringIncludes(text, "sRGB IEC61966-2.1");
  assertStringIncludes(text, "/ID [");
  assertStringIncludes(text, "pdfaExtension:schemas");
});
