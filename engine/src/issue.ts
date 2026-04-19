// @ts-ignore — no bundled types
import * as vc from "@digitalbazaar/vc";
// @ts-ignore — no bundled types
import { DataIntegrityProof } from "@digitalbazaar/data-integrity";
// @ts-ignore — no bundled types
import { cryptosuite as eddsaRdfc2022CryptoSuite } from "@digitalbazaar/eddsa-rdfc-2022-cryptosuite";

import type { EngineConfig, IssuanceInput, IssuanceResult } from "./types.ts";
import { loadSigner } from "./keys.ts";
import { createDocumentLoader } from "./contexts.ts";

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
  return `${course}-${hex.slice(0, 4).toUpperCase()}`;
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

  const unsignedCredential = {
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

  return {
    code,
    credentialPath,
    endorsementPath,
    credentialHash: await sha256Hex(credentialJson),
    endorsementHash: await sha256Hex(endorsementJson),
  };
}
