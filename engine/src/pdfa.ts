// PDF/A-3B enrichment: sRGB output intent, XMP metadata block, and
// Associated Files table with per-attachment /AFRelationship tags.
// Applied to a PDFDocument just before serialization. ISO 19005-3 level B.

// @ts-ignore — no bundled types
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFString,
} from "pdf-lib";

export type AfRelationship = "Source" | "Data" | "Alternative" | "Supplement" | "Unspecified";

export interface PdfAttachment {
  name: string;
  bytes: Uint8Array;
  mimeType: string;
  description: string;
  relationship: AfRelationship;
  creationDate?: Date;
}

export interface XmpInput {
  title: string;
  subject: string;
  creator: string;
  credentialCode: string;
  issuerId: string;
  credentialHash?: string;
  createDate?: Date;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function xmpDate(d: Date): string {
  // XMP date: ISO 8601 with timezone. Drop milliseconds to match PDF conventions.
  return d.toISOString().replace(/\.\d+Z$/, "Z");
}

export function buildXmpMetadata(input: XmpInput): string {
  const created = input.createDate ?? new Date();
  const iso = xmpDate(created);
  // PDF/A requires a pdfaExtension:schemas declaration for any custom
  // namespace we introduce (here: https://gentropic.org/cert/ns/gcu/1.0/).
  // Each property listed below must also appear in the main Description.
  const extensionSchema = `      <pdfaExtension:schemas>
        <rdf:Bag>
          <rdf:li rdf:parseType="Resource">
            <pdfaSchema:namespaceURI>https://gentropic.org/cert/ns/gcu/1.0/</pdfaSchema:namespaceURI>
            <pdfaSchema:prefix>gcu</pdfaSchema:prefix>
            <pdfaSchema:schema>GCU credential metadata</pdfaSchema:schema>
            <pdfaSchema:property>
              <rdf:Seq>
                <rdf:li rdf:parseType="Resource">
                  <pdfaProperty:name>credentialCode</pdfaProperty:name>
                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                  <pdfaProperty:category>external</pdfaProperty:category>
                  <pdfaProperty:description>Deterministic credential code (WORKSHOP-XXXXXX)</pdfaProperty:description>
                </rdf:li>
                <rdf:li rdf:parseType="Resource">
                  <pdfaProperty:name>issuerId</pdfaProperty:name>
                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                  <pdfaProperty:category>external</pdfaProperty:category>
                  <pdfaProperty:description>Issuer identifier, typically a did:web URI</pdfaProperty:description>
                </rdf:li>
                <rdf:li rdf:parseType="Resource">
                  <pdfaProperty:name>credentialHash</pdfaProperty:name>
                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                  <pdfaProperty:category>external</pdfaProperty:category>
                  <pdfaProperty:description>SHA-256 hex of the embedded credential.json</pdfaProperty:description>
                </rdf:li>
              </rdf:Seq>
            </pdfaSchema:property>
          </rdf:li>
        </rdf:Bag>
      </pdfaExtension:schemas>`;
  return `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
        xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"
        xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/"
        xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#"
        xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#"
        xmlns:dc="http://purl.org/dc/elements/1.1/"
        xmlns:xmp="http://ns.adobe.com/xap/1.0/"
        xmlns:pdf="http://ns.adobe.com/pdf/1.3/"
        xmlns:gcu="https://gentropic.org/cert/ns/gcu/1.0/">
      <pdfaid:part>3</pdfaid:part>
      <pdfaid:conformance>B</pdfaid:conformance>
      <dc:format>application/pdf</dc:format>
      <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(input.title)}</rdf:li></rdf:Alt></dc:title>
      <dc:creator><rdf:Seq><rdf:li>${escapeXml(input.creator)}</rdf:li></rdf:Seq></dc:creator>
      <dc:description><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(input.subject)}</rdf:li></rdf:Alt></dc:description>
      <xmp:CreateDate>${iso}</xmp:CreateDate>
      <xmp:ModifyDate>${iso}</xmp:ModifyDate>
      <xmp:MetadataDate>${iso}</xmp:MetadataDate>
      <xmp:CreatorTool>gentropic/cert engine</xmp:CreatorTool>
      <pdf:Producer>pdf-lib</pdf:Producer>
      <gcu:credentialCode>${escapeXml(input.credentialCode)}</gcu:credentialCode>
      <gcu:issuerId>${escapeXml(input.issuerId)}</gcu:issuerId>${
    input.credentialHash
      ? `\n      <gcu:credentialHash>${escapeXml(input.credentialHash)}</gcu:credentialHash>`
      : ""
  }
${extensionSchema}
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

function pdfDate(d: Date): string {
  // PDF date format: D:YYYYMMDDHHmmSS+00'00'
  const pad = (n: number) => String(n).padStart(2, "0");
  return `D:${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${
    pad(d.getUTCHours())
  }${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}+00'00'`;
}

function addOutputIntent(pdf: PDFDocument, iccProfile: Uint8Array): void {
  const iccDict = new Map<string, unknown>();
  const iccStream = PDFRawStream.of(
    pdf.context.obj({ N: 3, Length: iccProfile.length }),
    iccProfile,
  );
  const iccRef = pdf.context.register(iccStream);

  const intent = pdf.context.obj({
    Type: "OutputIntent",
    S: "GTS_PDFA1",
    OutputConditionIdentifier: PDFString.of("sRGB IEC61966-2.1"),
    Info: PDFString.of("sRGB IEC61966-2.1"),
    RegistryName: PDFString.of("http://www.color.org"),
    DestOutputProfile: iccRef,
  });

  const intents = PDFArray.withContext(pdf.context);
  intents.push(intent);
  pdf.catalog.set(PDFName.of("OutputIntents"), intents);
  void iccDict; // reserved for future use
}

function addMetadataStream(pdf: PDFDocument, xmp: string): void {
  const xmpBytes = new TextEncoder().encode(xmp);
  const metaStream = PDFRawStream.of(
    pdf.context.obj({
      Type: "Metadata",
      Subtype: "XML",
      Length: xmpBytes.length,
    }),
    xmpBytes,
  );
  const metaRef = pdf.context.register(metaStream);
  pdf.catalog.set(PDFName.of("Metadata"), metaRef);
}

function addAttachmentsAf(pdf: PDFDocument, attachments: PdfAttachment[]): void {
  if (attachments.length === 0) return;

  const afArray = PDFArray.withContext(pdf.context);
  // Also build /Names /EmbeddedFiles for viewer compatibility.
  const namesArray = PDFArray.withContext(pdf.context);

  for (const att of attachments) {
    const created = att.creationDate ?? new Date();
    const efStream = PDFRawStream.of(
      pdf.context.obj({
        Type: "EmbeddedFile",
        Subtype: att.mimeType,
        Length: att.bytes.length,
        Params: {
          Size: att.bytes.length,
          CreationDate: PDFString.of(pdfDate(created)),
          ModDate: PDFString.of(pdfDate(created)),
        },
      }),
      att.bytes,
    );
    const efRef = pdf.context.register(efStream);

    const fileSpec = pdf.context.obj({
      Type: "Filespec",
      F: PDFString.of(att.name),
      UF: PDFHexString.fromText(att.name),
      Desc: PDFHexString.fromText(att.description),
      AFRelationship: PDFName.of(att.relationship),
      EF: { F: efRef, UF: efRef },
    });
    const fileSpecRef = pdf.context.register(fileSpec);

    afArray.push(fileSpecRef);
    namesArray.push(PDFHexString.fromText(att.name));
    namesArray.push(fileSpecRef);
  }

  pdf.catalog.set(PDFName.of("AF"), afArray);

  // /Names /EmbeddedFiles for legacy PDF viewers (independent of /AF).
  let namesDict = pdf.catalog.get(PDFName.of("Names")) as PDFDict | undefined;
  if (!namesDict || !(namesDict instanceof PDFDict)) {
    namesDict = PDFDict.withContext(pdf.context);
    pdf.catalog.set(PDFName.of("Names"), namesDict);
  }
  const embedded = pdf.context.obj({ Names: namesArray });
  namesDict.set(PDFName.of("EmbeddedFiles"), embedded);
}

export interface ApplyPdfA3Input {
  iccProfile: Uint8Array;
  xmp: XmpInput;
  attachments: PdfAttachment[];
  lang?: string;
}

function setTrailerId(pdf: PDFDocument): void {
  // PDF/A requires a trailer /ID entry (File Identifier). pdf-lib doesn't set
  // one by default when saving without object streams. Deriving from the
  // document's content would be ideal for determinism; a v4 UUID is an
  // acceptable fallback per PDF 32000-1 §14.4 (any two random strings will
  // satisfy veraPDF). We use the same value for both slots on a first-save.
  const idHex = crypto.randomUUID().replace(/-/g, "").toUpperCase();
  const id = PDFHexString.of(idHex);
  const idArr = PDFArray.withContext(pdf.context);
  idArr.push(id);
  idArr.push(id);
  // deno-lint-ignore no-explicit-any
  (pdf.context as any).trailerInfo.ID = idArr;
}

export async function applyPdfA3(pdf: PDFDocument, input: ApplyPdfA3Input): Promise<void> {
  // 1. Version — pdf-lib defaults to 1.7 which satisfies PDF/A-3.
  // 2. Language on catalog.
  pdf.catalog.set(PDFName.of("Lang"), PDFString.of(input.lang ?? "en-US"));
  // 3. Output intent with sRGB ICC.
  addOutputIntent(pdf, input.iccProfile);
  // 4. XMP metadata (with pdfaExtension schema for our custom gcu: properties).
  addMetadataStream(pdf, buildXmpMetadata(input.xmp));
  // 5. Associated Files table with per-attachment AFRelationship.
  addAttachmentsAf(pdf, input.attachments);
  // 6. Trailer /ID.
  setTrailerId(pdf);
  await Promise.resolve();
}

/** Unused export kept to indicate the type is consumed by types.ts. */
export type _RelationshipBrand = AfRelationship;
