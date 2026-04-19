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

export interface FontBytes {
  sansRegular: Uint8Array;
  sansBold: Uint8Array;
  monoRegular: Uint8Array;
  monoBold: Uint8Array;
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

export async function renderCertificatePdf(input: CertificateInput): Promise<Uint8Array> {
  const qrPngDataUrl = await QRCode.toDataURL(input.validatorUrl, {
    errorCorrectionLevel: "M",
    margin: 1,
    scale: 8,
    color: { dark: "#000000", light: "#ffffff" },
  });
  const qrPngBytes = Uint8Array.from(atob(qrPngDataUrl.split(",")[1]), (c) => c.charCodeAt(0));

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

  // QR centered below the validation block.
  const qrImage = await pdf.embedPng(qrPngBytes);
  const qrSize = 96;
  page.drawImage(qrImage, {
    x: center - qrSize / 2,
    y: 40,
    width: qrSize,
    height: qrSize,
  });

  return await pdf.save();
}
