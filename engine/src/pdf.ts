// Phase 8a: pdf-lib port of the predecessor's certificate layout.
// Matches the original structure (series wordmark, topics bullet list, workload,
// date, signature/validation blocks with horizontal rules, right-edge color
// stripes, centered bottom QR) but without the generative topographic art
// background — that lands in 8b alongside OFL font embedding.

// @ts-ignore — no bundled types
import { PDFDocument, rgb } from "pdf-lib";
// @ts-ignore — no bundled types
import fontkit from "@pdf-lib/fontkit";
// @ts-ignore — no bundled types
import QRCode from "qrcode";

import { applyPdfA3, type PdfAttachment } from "./pdfa.ts";

export interface FontBytes {
  sansRegular: Uint8Array;
  sansBold: Uint8Array;
  monoRegular: Uint8Array;
  monoBold: Uint8Array;
}

export interface PdfAttachments {
  credentialJson?: Uint8Array;
  endorsementJson?: Uint8Array;
  rekorBundle?: Uint8Array;
}

export async function loadPlexFonts(fontsDir: string): Promise<FontBytes> {
  const read = (name: string) => Deno.readFile(`${fontsDir}/${name}`);
  const [sansRegular, sansBold, monoRegular, monoBold] = await Promise.all([
    read("IBMPlexSans-Regular.otf"),
    read("IBMPlexSans-Bold.otf"),
    read("IBMPlexMono-Regular.otf"),
    read("IBMPlexMono-Bold.otf"),
  ]);
  return { sansRegular, sansBold, monoRegular, monoBold };
}

export interface CertificateInput {
  recipientName: string;
  courseName: string;
  courseCode: string;
  credentialCode: string;
  dateIso: string;
  hours: number;
  topics: string[];
  issuerName: string;
  issuerLabel?: string;
  orgName?: string;
  seriesName?: string;
  validatorUrl: string;
  accentColor?: string;
  fonts: FontBytes;
  issuerId?: string; // did:web:... — for XMP metadata only
  credentialHash?: string; // sha256 hex of the signed credential JSON, for XMP
  iccProfile?: Uint8Array; // sRGB IEC61966-2.1; enables PDF/A-3 when + attachments supplied
  attachments?: PdfAttachments;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace(/^#/, "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return { r: ((n >> 16) & 0xff) / 255, g: ((n >> 8) & 0xff) / 255, b: (n & 0xff) / 255 };
}

function prettyDate(iso: string): string {
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const m = d.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  const day = d.getUTCDate();
  return `${m} ${day}, ${y}`;
}

interface QrMatrix {
  size: number;
  data: Uint8Array;
}

function getQrMatrix(text: string): QrMatrix {
  // qrcode.create returns a QR object with a 1-bit module matrix. We draw
  // each "on" module as a filled rectangle in pdf-lib — true vector output.
  // deno-lint-ignore no-explicit-any
  const qr = (QRCode as any).create(text, { errorCorrectionLevel: "M" });
  return { size: qr.modules.size, data: qr.modules.data };
}

export async function renderCertificatePdf(input: CertificateInput): Promise<Uint8Array> {
  const qr = getQrMatrix(input.validatorUrl);

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(`Certificate — ${input.courseName}`);
  pdf.setAuthor(input.issuerName);
  pdf.setSubject(`${input.credentialCode} — ${input.recipientName}`);
  pdf.setProducer("gentropic/cert engine (pdf-lib)");
  pdf.setCreator("gentropic/cert engine");

  // A4 portrait.
  const page = pdf.addPage([595, 842]);
  const { width, height } = page.getSize();

  // Subset-embed IBM Plex so only the glyphs we actually use ship in the PDF.
  const sans = await pdf.embedFont(input.fonts.sansRegular, { subset: true });
  const sansBold = await pdf.embedFont(input.fonts.sansBold, { subset: true });
  const mono = await pdf.embedFont(input.fonts.monoRegular, { subset: true });
  const monoBold = await pdf.embedFont(input.fonts.monoBold, { subset: true });

  const accent = hexToRgb(input.accentColor ?? "#d4a017");
  const accentColor = rgb(accent.r, accent.g, accent.b);
  const ink = rgb(0.12, 0.12, 0.12);
  const muted = rgb(0.45, 0.45, 0.45);

  // Right-edge vertical color stripes (accent + cool neutrals).
  const stripeDefs = [
    { w: 24, c: accentColor },
    { w: 4, c: rgb(0.95, 0.95, 0.95) },
    { w: 10, c: rgb(0.78, 0.88, 0.92) }, // pale blue
    { w: 4, c: rgb(0.95, 0.95, 0.95) },
    { w: 10, c: rgb(0.78, 0.92, 0.82) }, // pale green
    { w: 4, c: rgb(0.95, 0.95, 0.95) },
    { w: 8, c: rgb(0.86, 0.82, 0.94) }, // pale purple
  ];
  let stripeX = width;
  for (const s of stripeDefs) {
    stripeX -= s.w;
    page.drawRectangle({ x: stripeX, y: 0, width: s.w, height, color: s.c });
  }
  const contentRight = stripeX - 20; // left boundary of the content column
  const contentLeft = 60;
  const contentWidth = contentRight - contentLeft;
  const center = (contentLeft + contentRight) / 2;

  // Draw centered helper.
  // deno-lint-ignore no-explicit-any
  const drawCentered = (text: string, y: number, size: number, font: any, color = ink) => {
    const w = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: center - w / 2, y, size, font, color });
  };

  const ruleColor = rgb(0.75, 0.75, 0.75);

  // Header: org tagline + series wordmark + accent underline.
  let y = height - 100;
  if (input.orgName) {
    drawCentered(input.orgName, y, 9, mono, muted);
    y -= 38;
  }
  const wordmark = (input.seriesName ?? "CERTIFICATE").toUpperCase();
  drawCentered(wordmark, y, 34, sansBold, ink);
  y -= 16;
  const wmWidth = sansBold.widthOfTextAtSize(wordmark, 34);
  page.drawLine({
    start: { x: center - wmWidth / 2, y },
    end: { x: center + wmWidth / 2, y },
    thickness: 2,
    color: accentColor,
  });
  y -= 42;

  drawCentered("CERTIFICATE OF COMPLETION", y, 13, sans, muted);
  y -= 58;

  drawCentered("This certifies that", y, 11, sans, muted);
  y -= 30;
  drawCentered(input.recipientName, y, 20, monoBold, ink);
  y -= 30;
  drawCentered("has successfully completed", y, 11, sans, muted);
  y -= 30;
  drawCentered(input.courseName, y, 15, monoBold, accentColor);
  y -= 36;

  // "Topics covered:" header + bullets. Left-aligned in a centered block.
  const bulletSize = 9;
  const maxBulletWidth = contentWidth - 40;
  drawCentered("Topics covered:", y, 10, sans, muted);
  y -= 18;
  let maxLineW = 0;
  for (const t of input.topics) {
    const w = sans.widthOfTextAtSize(`•  ${t}`, bulletSize);
    if (w > maxLineW) maxLineW = w;
  }
  const bulletBlockX = Math.max(contentLeft, center - Math.min(maxLineW, maxBulletWidth) / 2);
  for (const t of input.topics) {
    page.drawText("•", { x: bulletBlockX, y, size: bulletSize, font: sansBold, color: accentColor });
    page.drawText(t, { x: bulletBlockX + 12, y, size: bulletSize, font: sans, color: ink });
    y -= 15;
  }

  y -= 14;
  drawCentered(`Workload: ${input.hours} hours`, y, 11, sansBold, ink);
  y -= 20;
  drawCentered(`Date of completion: ${prettyDate(input.dateIso)}`, y, 10, sans, muted);

  // Signature block (upper bottom block).
  const sigY = 280;
  const sigLineHalf = 110;
  page.drawLine({
    start: { x: center - sigLineHalf, y: sigY + 18 },
    end: { x: center + sigLineHalf, y: sigY + 18 },
    thickness: 0.4,
    color: ruleColor,
  });
  drawCentered(input.issuerName, sigY, 12, sansBold, ink);
  if (input.issuerLabel) drawCentered(input.issuerLabel, sigY - 13, 9, sans, muted);

  // Validation block (lower bottom block) — pushed down with a wider gap
  // so the two horizontal rules don't read as parallel train tracks.
  const valY = 180;
  const valLineHalf = 150;
  page.drawLine({
    start: { x: center - valLineHalf, y: valY + 18 },
    end: { x: center + valLineHalf, y: valY + 18 },
    thickness: 0.4,
    color: ruleColor,
  });
  drawCentered(`Validation code: ${input.credentialCode}`, valY, 11, monoBold, ink);
  drawCentered(`Verify at: ${input.validatorUrl}`, valY - 13, 7, mono, muted);

  // QR centered below the validation block. Vector-drawn as a grid of filled
  // rectangles (one per "on" module), so it stays sharp at any zoom and
  // doesn't require rasterization decisions.
  const qrBoxSize = 96;
  const quietModules = 1; // 1-module quiet zone on each side
  const totalModules = qr.size + quietModules * 2;
  const moduleSize = qrBoxSize / totalModules;
  const qrLeft = center - qrBoxSize / 2;
  const qrBottom = 40;
  // Opaque white background fills the quiet zone; the "on" modules overdraw.
  page.drawRectangle({
    x: qrLeft,
    y: qrBottom,
    width: qrBoxSize,
    height: qrBoxSize,
    color: rgb(1, 1, 1),
  });
  for (let row = 0; row < qr.size; row++) {
    for (let col = 0; col < qr.size; col++) {
      if (qr.data[row * qr.size + col]) {
        page.drawRectangle({
          x: qrLeft + (col + quietModules) * moduleSize,
          // PDF y-axis grows upward; top of QR is at qrBottom + qrBoxSize.
          y: qrBottom + qrBoxSize - (row + quietModules + 1) * moduleSize,
          width: moduleSize,
          height: moduleSize,
          color: rgb(0, 0, 0),
        });
      }
    }
  }

  // PDF/A-3 enrichment: ICC output intent, XMP metadata, attachments table.
  // Active when the caller supplies an ICC profile (attachments optional).
  if (input.iccProfile) {
    const attachments: PdfAttachment[] = [];
    if (input.attachments?.credentialJson) {
      attachments.push({
        name: "credential.json",
        bytes: input.attachments.credentialJson,
        mimeType: "application/ld+json",
        description: "Open Badges v3 signed Verifiable Credential",
        relationship: "Source",
      });
    }
    if (input.attachments?.endorsementJson) {
      attachments.push({
        name: "endorsement.json",
        bytes: input.attachments.endorsementJson,
        mimeType: "application/ld+json",
        description: "Self-endorsement EndorsementCredential",
        relationship: "Supplement",
      });
    }
    if (input.attachments?.rekorBundle) {
      attachments.push({
        name: "credential.rekor.bundle",
        bytes: input.attachments.rekorBundle,
        mimeType: "application/json",
        description: "Sigstore Rekor inclusion proof for credential.json",
        relationship: "Supplement",
      });
    }
    await applyPdfA3(pdf, {
      iccProfile: input.iccProfile,
      xmp: {
        title: `Certificate — ${input.courseName}`,
        subject: `${input.credentialCode} — ${input.recipientName}`,
        creator: input.issuerName,
        credentialCode: input.credentialCode,
        issuerId: input.issuerId ?? input.issuerName,
        credentialHash: input.credentialHash,
      },
      attachments,
    });
    return await pdf.save({ useObjectStreams: false });
  }

  return await pdf.save();
}
