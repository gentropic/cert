// @ts-ignore — no bundled types
import * as vc from "@digitalbazaar/vc";
// @ts-ignore — no bundled types
import { DataIntegrityProof } from "@digitalbazaar/data-integrity";
// @ts-ignore — no bundled types
import { cryptosuite as eddsaRdfc2022CryptoSuite } from "@digitalbazaar/eddsa-rdfc-2022-cryptosuite";

import type { EngineConfig, IssuanceInput, IssuanceResult, StatusListConfig } from "./types.ts";
import { loadSigner } from "./keys.ts";
import { createDocumentLoader } from "./contexts.ts";
import { appendEntry } from "./ledger.ts";
import { logBlob } from "./rekor.ts";
import { loadPlexFonts, renderCertificatePdf } from "./pdf.ts";

async function assignStatusIndex(cfg: StatusListConfig): Promise<number> {
  let current = 0;
  try {
    const text = await Deno.readTextFile(cfg.nextIndexPath);
    const parsed = Number.parseInt(text.trim(), 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new Error(`Invalid .next-index contents: ${text.slice(0, 40)}`);
    }
    current = parsed;
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
  }
  await Deno.writeTextFile(cfg.nextIndexPath, `${current + 1}\n`);
  return current;
}

async function sha256Hex(text: string): Promise<string> {
  const utf8 = new TextEncoder().encode(text);
  const ab = new ArrayBuffer(utf8.byteLength);
  new Uint8Array(ab).set(utf8);
  const buf = await crypto.subtle.digest("SHA-256", ab);
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

// Spec §22.1 — deterministic credential code.
async function deriveCode(
  course: string,
  date: string,
  name: string,
  salt: string,
): Promise<string> {
  const normalized = name.normalize("NFD").toLowerCase();
  const hex = await sha256Hex(`${course}:${date}:${normalized}:${salt}`);
  return `${course}-${hex.slice(0, 6).toUpperCase()}`;
}

async function deriveRecipientIdHex(
  name: string,
  course: string,
  salt: string,
): Promise<string> {
  const normalized = name.normalize("NFD").toLowerCase();
  const hex = await sha256Hex(`${normalized}:${course}:${salt}`);
  return hex.slice(0, 32);
}

export async function signAndPublish(
  input: IssuanceInput,
  config: EngineConfig,
): Promise<IssuanceResult> {
  const course = config.courses[input.course];
  if (!course) throw new Error(`Unknown course: ${input.course}`);

  const code = await deriveCode(input.course, input.date, input.name, config.codeSalt);
  const credentialId = `${config.baseUrl}/credentials/${code}.json`;
  const endorsementId = `${config.baseUrl}/endorsements/${code}.json`;
  const achievementId = `${config.baseUrl}/achievements/${input.course}.json`;
  const recipientIdHex = await deriveRecipientIdHex(input.name, input.course, config.recipientSalt);

  const signer = await loadSigner(config.signingKeyPem, config.verificationMethod);
  const suite = new DataIntegrityProof({ signer, cryptosuite: eddsaRdfc2022CryptoSuite });
  const documentLoader = createDocumentLoader(config.pinnedDocuments ?? {});

  const validFromIso = input.date.includes("T") ? input.date : `${input.date}T00:00:00Z`;

  let statusIndex: number | undefined;
  let credentialStatus: Record<string, unknown> | undefined;
  if (config.statusList) {
    statusIndex = await assignStatusIndex(config.statusList);
    credentialStatus = {
      id: `${config.statusList.publicUrl}#${statusIndex}`,
      type: "BitstringStatusListEntry",
      statusPurpose: "revocation",
      statusListIndex: String(statusIndex),
      statusListCredential: config.statusList.publicUrl,
    };
  }

  const unsignedCredential: Record<string, unknown> = {
    "@context": [
      "https://www.w3.org/ns/credentials/v2",
      "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
    ],
    id: credentialId,
    type: ["VerifiableCredential", "OpenBadgeCredential"],
    issuer: config.issuerId,
    validFrom: validFromIso,
    name: course.name,
    credentialSubject: {
      type: ["AchievementSubject"],
      id: `urn:gcu:recipient:sha256:${recipientIdHex}`,
      name: input.name,
      achievement: {
        id: achievementId,
        type: ["Achievement"],
      },
    },
    ...(credentialStatus ? { credentialStatus } : {}),
  };

  const signedCredential = await vc.issue({
    credential: unsignedCredential,
    suite,
    documentLoader,
  });

  const unsignedEndorsement = {
    "@context": [
      "https://www.w3.org/ns/credentials/v2",
      "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
    ],
    id: endorsementId,
    type: ["VerifiableCredential", "EndorsementCredential"],
    issuer: config.issuerId,
    validFrom: validFromIso,
    credentialSubject: {
      type: ["EndorsementSubject"],
      id: credentialId,
      endorsementComment:
        `The holder of this credential attended the full ${course.name} workshop, demonstrating competency in the topics covered. The workshop materials and attendance proof are archived in the GCU certification repository.`,
    },
  };

  const signedEndorsement = await vc.issue({
    credential: unsignedEndorsement,
    suite,
    documentLoader,
  });

  const credentialJson = JSON.stringify(signedCredential, null, 2);
  const endorsementJson = JSON.stringify(signedEndorsement, null, 2);
  const credentialPath = `${config.repoRoot}/credentials/${code}.json`;
  const endorsementPath = `${config.repoRoot}/endorsements/${code}.json`;

  await Deno.mkdir(`${config.repoRoot}/credentials`, { recursive: true });
  await Deno.mkdir(`${config.repoRoot}/endorsements`, { recursive: true });
  await Deno.writeTextFile(credentialPath, credentialJson);
  await Deno.writeTextFile(endorsementPath, endorsementJson);

  const credentialHash = await sha256Hex(credentialJson);
  const endorsementHash = await sha256Hex(endorsementJson);

  let ledgerIndex: number | undefined;
  if (config.ledger) {
    const entry = await appendEntry({
      ledgerPath: config.ledger.path,
      tipPath: config.ledger.tipPath,
      code,
      credential_hash: `sha256:${credentialHash}`,
      endorsement_hash: `sha256:${endorsementHash}`,
      status_index: statusIndex,
    });
    ledgerIndex = entry.i;
  }

  const credentialBytes = new TextEncoder().encode(credentialJson);
  const endorsementBytes = new TextEncoder().encode(endorsementJson);

  let pdfPath: string | undefined;
  if (config.pdf) {
    const validatorUrl = config.pdf.validatorUrlTemplate
      .replace("{code}", encodeURIComponent(code))
      .replace("{name}", encodeURIComponent(input.name));
    const fonts = await loadPlexFonts(config.pdf.fontsDir);
    const iccProfile = config.pdf.iccProfilePath
      ? await Deno.readFile(config.pdf.iccProfilePath)
      : undefined;
    const pdfBytes = await renderCertificatePdf({
      recipientName: input.name,
      courseName: course.name,
      courseCode: input.course,
      credentialCode: code,
      dateIso: validFromIso,
      hours: course.hours,
      topics: course.descBullets,
      issuerName: course.seriesMeta?.issuerName ?? "Geoscientific Chaos Union",
      issuerLabel: course.seriesMeta?.issuerLabel,
      orgName: course.seriesMeta?.org,
      seriesName: course.seriesMeta?.name,
      validatorUrl,
      accentColor: course.seriesMeta?.accent,
      fonts,
      issuerId: config.issuerId,
      credentialHash,
      iccProfile,
      attachments: iccProfile
        ? {
          credentialJson: credentialBytes,
          endorsementJson: endorsementBytes,
          // rekorBundle filled in below after cosign runs
        }
        : undefined,
    });
    pdfPath = `${config.pdf.outputDir}/${code}.pdf`;
    await Deno.mkdir(config.pdf.outputDir, { recursive: true });
    await Deno.writeFile(pdfPath, pdfBytes);
  }

  let rekorBundlePaths: IssuanceResult["rekorBundlePaths"];
  if (config.rekor) {
    const credBundle = `${config.repoRoot}/credentials/${code}.rekor.bundle`;
    const endoBundle = `${config.repoRoot}/endorsements/${code}.rekor.bundle`;
    await logBlob({
      subjectPath: credentialPath,
      bundlePath: credBundle,
      cosignPath: config.rekor.cosignPath,
      runner: config.rekor.runner,
    });
    await logBlob({
      subjectPath: endorsementPath,
      bundlePath: endoBundle,
      cosignPath: config.rekor.cosignPath,
      runner: config.rekor.runner,
    });
    rekorBundlePaths = { credential: credBundle, endorsement: endoBundle };

    if (config.ledger?.tipPath) {
      const tipBundle = `${config.ledger.tipPath}.rekor.bundle`;
      await logBlob({
        subjectPath: config.ledger.tipPath,
        bundlePath: tipBundle,
        cosignPath: config.rekor.cosignPath,
        runner: config.rekor.runner,
      });
      rekorBundlePaths.ledgerTip = tipBundle;
    }
  }

  return {
    code,
    credentialPath,
    endorsementPath,
    credentialHash,
    endorsementHash,
    statusIndex,
    ledgerIndex,
    rekorBundlePaths,
    pdfPath,
  };
}
