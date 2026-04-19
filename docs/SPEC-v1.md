# GCU Certificate System — Open Badges v3 Upgrade Spec

**Status:** Draft
**Target:** `gentropic/cert` — new repo, custom domain `gentropic.org/cert`
**Issuer:** `did:web:gentropic.org`
**Base version:** migration from `endarthur/etc/cert/` as of 2026-04-16

## 1. Goals

Upgrade the GCU certificate system from a manifest-lookup attestation model
to an Open Badges v3 / W3C Verifiable Credentials conformant issuer, with:
- cryptographic timestamping of each credential onto the Bitcoin blockchain
  via OpenTimestamps,
- self-endorsements plus ESCO/O*NET skill alignment,
- PDF/A-3 level B archival output embedding the signed credential as an
  associated file,
- W3C StatusList2021 credential revocation,
- hash-chained public issuance ledger anchored to Bitcoin,
- external transparency via Sigstore Rekor logging,
- reproducibly-built validator with SLSA provenance attestations,
- engine/issuance-model separation enabling v2 template extraction,
- a plain-language `trust.html` page making the entire trust stack legible.

All additions preserve:

- single-file-HTML validator philosophy
- GitHub Pages hosting
- the attendance-proof flow (workshop hash → GitHub Issue → action → cert)
- the generative art aesthetic
- existing certificates already issued

The upgrade is purely **additive**. Every existing cert continues to validate
through the legacy path; new certs gain parallel signed-credential,
endorsement, timestamp, revocation, ledger, and transparency-log artifacts.

## 2. Non-goals

- Replacing the `{name, course, date, code}` manifest with the credential store.
  The manifest remains the fast-lookup index.
- Recipient wallet integration (learner-held credentials).
  v1 assumes the validator page is the primary viewing surface.
- Supporting recipient identifiers other than name match.
  v1 keeps the name-based UX; the credential subject uses a hashed email if
  provided, otherwise a name-derived stable ID.

## 3. Architecture overview

```
┌─ Workshop runtime ─────────────────────────────────────┐
│ claim form computes sha256(course:date:SALT)[:16]     │
│ displays completion_hash to attendee                  │
└───────────────────────────────────────────────────────┘
                    │
                    ▼
┌─ GitHub Issue (cert-request template) ────────────────┐
│ name, workshop, date, completion_hash, [email?]       │
└───────────────────────────────────────────────────────┘
                    │
                    ▼
┌─ emit-cert action ────────────────────────────────────┐
│ 1. parse + validate fields                            │
│ 2. verify completion_hash against SALT                │
│ 3. check duplicate                                    │
│ 4. generate cert code: WORKSHOP-XXXX                  │
│ 5. append to certs.json                   (legacy)    │
│ 6. build AchievementCredential JSON-LD    (new)       │
│ 7. sign with issuer Ed25519 key           (new)       │
│ 8. write cert/credentials/{code}.json     (new)       │
│ 9. ots stamp credential → .ots file       (new)       │
│ 10. commit credential + .ots + manifest               │
│ 11. reply with validation URL + links                 │
└───────────────────────────────────────────────────────┘
         +
┌─ ots-upgrade workflow (nightly cron) ─────────────────┐
│ for each cert/credentials/*.ots:                      │
│   ots upgrade file.ots                                │
│ commit any upgraded proofs                            │
└───────────────────────────────────────────────────────┘
                    │
                    ▼
┌─ Validator (cert/index.html) ─────────────────────────┐
│ - legacy lookup: name + code → certs.json             │
│ - new: fetch credentials/{code}.json                  │
│ - verify Ed25519 signature against issuer pubkey      │
│ - display OTS timestamp status (pending / anchored)   │
│ - render certificate canvas (unchanged)               │
│ - offer downloads: PDF, signed JSON, .ots file        │
│ - link out to third-party OTS verifiers               │
└───────────────────────────────────────────────────────┘
```

## 4. Issuer profile

Hosted at `https://endarthur.github.io/etc/cert/issuer.json`, referenced as
the `id` of the issuer in every credential.

```json
{
  "@context": [
    "https://www.w3.org/ns/credentials/v2",
    "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json"
  ],
  "id": "https://endarthur.github.io/etc/cert/issuer.json",
  "type": ["Profile"],
  "name": "Geoscientific Chaos Union",
  "description": "GCU — a workshop and credentialing collective focused on browser-native scientific computing, geoscience, and computational curiosity.",
  "url": "https://gentropic.org",
  "email": "arthur@endlein.one",
  "image": {
    "id": "https://endarthur.github.io/etc/cert/issuer-logo.svg",
    "type": "Image"
  }
}
```

Public key is exposed via a companion key document at
`https://endarthur.github.io/etc/cert/issuer-keys.json` (multikey format),
referenced from credential proofs. Key rotation supported by listing
multiple keys; old credentials remain verifiable as long as their
referenced key remains listed.

```json
{
  "@context": ["https://www.w3.org/ns/did/v1"],
  "id": "https://endarthur.github.io/etc/cert/issuer-keys.json",
  "verificationMethod": [
    {
      "id": "https://endarthur.github.io/etc/cert/issuer-keys.json#key-1",
      "type": "Multikey",
      "controller": "https://endarthur.github.io/etc/cert/issuer.json",
      "publicKeyMultibase": "z6Mk..."
    }
  ]
}
```

## 5. Achievement definitions

Generated from existing `courses.json` at build time (or committed
statically). One file per course at `cert/achievements/{course}.json`.

```json
{
  "@context": [
    "https://www.w3.org/ns/credentials/v2",
    "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json"
  ],
  "id": "https://endarthur.github.io/etc/cert/achievements/PB-101.json",
  "type": ["Achievement"],
  "name": "Patchbay 101 — API Workshop",
  "description": "HTTP methods, JSON parsing, REST APIs, fetch(), and live API integration.",
  "criteria": {
    "narrative": "Attend the full 3-hour Patchbay 101 workshop and complete the in-workshop exercises. Completion is verified via a workshop-session hash."
  },
  "creditsAvailable": 3,
  "inLanguage": "en",
  "tag": ["api", "http", "rest", "javascript", "geoscience"],
  "alignment": [
    {
      "type": ["Alignment"],
      "targetFramework": "ESCO",
      "targetCode": "S5.4.1",
      "targetName": "develop software",
      "targetUrl": "http://data.europa.eu/esco/skill/..."
    }
  ],
  "@note_cpd": "Workshops may be eligible for Continuing Professional Development (CPD) hours under relevant professional society frameworks (e.g., AusIMM Category 1 — Formal Learning) subject to member self-assessment and society audit."
}
```

### 5.1 ESCO and O*NET alignment

Every course should carry at least two `alignment` entries: one to ESCO
(European Skills, Competences, Qualifications and Occupations) and one to
O*NET (US occupational classification). This makes credentials
machine-readable by European employers, EU education systems, and US
workforce platforms.

Alignment codes are proposed on a per-course basis when the course is
drafted or revised. Recommended flow: Claude (or another tool) proposes
candidate codes from the ESCO and O*NET hierarchies; Arthur reviews and
confirms; codes are committed to `courses.json` and propagate into
achievement JSON on rebuild.

Reference frameworks:
- ESCO: `http://data.europa.eu/esco/skill/{uuid}` — browse at
  esco.ec.europa.eu
- O*NET: `https://www.onetonline.org/link/summary/{soc-code}` — browse
  at onetonline.org

### 5.2 CPD-friendly wording

Every achievement document should include:
- `creditsAvailable`: the hours figure from `courses.json`
- `criteria.narrative`: plain-language description of what completion
  requires
- The CPD note above, which signals to professional society members
  (AusIMM, SEG, SME, AAPG, ABGE) that the workshop fits their
  self-declared CPD logbook categories. The phrasing is deliberately
  non-claimant: GCU does not certify CPD compliance, the credential
  holder does, under their society's rules.

## 6. Achievement credential

Written to `cert/credentials/{code}.json` at emission time. One credential
per issued certificate.

```json
{
  "@context": [
    "https://www.w3.org/ns/credentials/v2",
    "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json"
  ],
  "id": "https://endarthur.github.io/etc/cert/credentials/PB-101-EF47.json",
  "type": ["VerifiableCredential", "OpenBadgeCredential"],
  "issuer": "https://endarthur.github.io/etc/cert/issuer.json",
  "validFrom": "2026-02-23T00:00:00Z",
  "name": "Patchbay 101 — API Workshop",
  "credentialSubject": {
    "type": ["AchievementSubject"],
    "id": "urn:gcu:recipient:sha256:4a7c...",
    "name": "Jéssica Fernanda Bastos da Matta",
    "achievement": {
      "id": "https://endarthur.github.io/etc/cert/achievements/PB-101.json",
      "type": ["Achievement"]
    }
  },
  "proof": {
    "type": "DataIntegrityProof",
    "cryptosuite": "eddsa-rdfc-2022",
    "created": "2026-02-23T12:34:56Z",
    "verificationMethod": "https://endarthur.github.io/etc/cert/issuer-keys.json#key-1",
    "proofPurpose": "assertionMethod",
    "proofValue": "z5..."
  }
}
```

Recipient ID construction:
```
urn:gcu:recipient:sha256:{hex}
  where hex = sha256(NFD-normalized-lowercase-name + ':' + course + ':' + RECIPIENT_SALT)[:32]
```

Name is also included in plaintext as `credentialSubject.name` for display
purposes. The hashed ID gives a stable, non-PII-leaking subject identifier;
the plaintext name supports the existing UX.

If an email is collected in v1.1+, it is hashed with the same salt and
included as a separate `IdentityObject`-style property; email is never
stored in plaintext in the credential.

### 6.1 Self-endorsement

OBv3 allows credentials to carry `endorsement` entries — signed attestations
from the issuer or from third parties making additional claims about the
credential or the achievement. For v1, GCU issues a **self-endorsement**
alongside each credential, signing additional context that doesn't belong
in the core credential body.

Self-endorsement is defensible on its own: it's an explicit, signed
statement from a named issuer staking their reputation on additional
claims. It is not equivalent to external endorsement but it is far from
nothing, and it structures the data for later external endorsements to
slot in without schema changes.

Structure: a separate `EndorsementCredential` written to
`cert/endorsements/{code}.json`, referenced from the main credential via
an `endorsement` array. Signed with the same issuer key.

```json
{
  "@context": [
    "https://www.w3.org/ns/credentials/v2",
    "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json"
  ],
  "id": "https://endarthur.github.io/etc/cert/endorsements/PB-101-EF47.json",
  "type": ["VerifiableCredential", "EndorsementCredential"],
  "issuer": "https://endarthur.github.io/etc/cert/issuer.json",
  "validFrom": "2026-02-23T00:00:00Z",
  "credentialSubject": {
    "type": ["EndorsementSubject"],
    "id": "https://endarthur.github.io/etc/cert/credentials/PB-101-EF47.json",
    "endorsementComment": "The holder of this credential attended the full Patchbay 101 workshop delivered by Arthur Endlein Correia, demonstrating competency in HTTP fundamentals, REST API consumption, and live data integration. The workshop materials and attendance proof are archived in the GCU certification repository. The issuer endorses the authenticity of this credential and the relevance of the skills demonstrated to professional geoscientific computing practice."
  },
  "proof": { ... }
}
```

Third-party endorsements (from external geologists, professional society
figures, institutional partners) are supported by the same structure: any
party with a DID or hosted issuer profile can sign an
`EndorsementCredential` pointing at a GCU credential, and it gets added
to the credential's `endorsement` array. No schema change required.

## 7. Signing

**Algorithm:** Ed25519 via Data Integrity `eddsa-rdfc-2022` cryptosuite
(RDF canonicalization then signature). This is the OBv3-preferred suite.

**Key storage:** private key as GitHub Actions secret
`GCU_ISSUER_SIGNING_KEY` in multibase or PKCS8 format. Action loads it,
signs, then discards. Never committed.

**Key rotation:** generate new key, append to `issuer-keys.json` as
`#key-2`, update action secret, new credentials reference `#key-2`.
Existing credentials continue to reference `#key-1` and remain
verifiable.

**Backup:** signing key backed up offline (hardware-backed storage,
e.g. a YubiKey 5 or NitroKey 3 with OpenPGP applet, or paper + vault).
A lost key means no new emissions under the old key ID but does not
invalidate existing credentials.

**Future option:** WebAuthn PRF-derived signing key, reusing the
Auditable infrastructure. Shifts signing from action to a human-in-the-loop
step. Deferred to v2.

## 8. Validator changes

`cert/index.html` gains a verification path alongside the existing manifest
lookup.

Flow:
1. User enters name + code (or URL fragment) as today.
2. Manifest lookup runs as today; finds entry. If not found → error as today.
3. **New:** fetch `credentials/{code}.json`.
4. **New:** fetch `issuer.json` and `issuer-keys.json`.
5. **New:** verify credential signature using Web Crypto API
   (`crypto.subtle.verify` with Ed25519). Uses the `verificationMethod` from
   the proof to select the key from `issuer-keys.json`.
6. **New:** verify that `credentialSubject.name` matches the manifest entry
   (guards against credential-file tampering independent of the manifest).
7. Render certificate canvas as today.
8. **New:** verification status badge on the rendered cert:
   - ✓ "Cryptographically verified" if signature valid
   - ⚠ "Legacy certificate (unsigned)" for pre-upgrade certs
   - ✗ "Signature invalid" if signature fails

**New UI controls:**
- "Download signed credential (JSON)" — downloads the raw signed
  credential for portability to other verifiers.
- "Copy hosted URL" — copies the credential URL, already shareable.

Signed credentials open in any OBv3-conformant verifier (1EdTech
credential verifier, IMS Global reference verifier, etc.); the
validator page is not the only verification surface.

## 9. Action changes

Additions to `emit-cert.yml`:

**New step after "Generate and commit certificate":**

```yaml
- name: Generate signed credential
  if: steps.parse.outputs.errors == '' && steps.parse.outputs.duplicate == ''
  env:
    SIGNING_KEY: ${{ secrets.GCU_ISSUER_SIGNING_KEY }}
    RECIPIENT_SALT: ${{ secrets.GCU_RECIPIENT_SALT }}
  run: node cert/scripts/sign-credential.js "${{ steps.parse.outputs.name }}" "${{ steps.parse.outputs.workshop }}" "${{ steps.parse.outputs.date }}" "${{ steps.generate.outputs.code }}"
```

**New script:** `cert/scripts/sign-credential.js`
- Inputs: name, workshop, date, code, [email]
- Reads `cert/achievements/{workshop}.json` to get achievement metadata
- Constructs credential JSON with all fields from §6
- Canonicalizes (RDF Dataset Canonicalization / URDNA2015)
- Signs with Ed25519 using key from env
- Writes to `cert/credentials/{code}.json`
- Emits companion self-endorsement to `cert/endorsements/{code}.json`
- Exits 0 on success, non-zero on failure

**Dependencies:** `@digitalcredentials/vc`, `@digitalcredentials/ed25519-signature-2020`
(or the -2022 equivalent), `jsonld`. All MIT-licensed. Installed via
`npm ci` in an earlier action step.

**New step after signing — OpenTimestamps stamp:**

```yaml
- name: Set up Python for OTS client
  if: steps.parse.outputs.errors == '' && steps.parse.outputs.duplicate == ''
  uses: actions/setup-python@v5
  with:
    python-version: '3.11'

- name: Install OpenTimestamps client
  if: steps.parse.outputs.errors == '' && steps.parse.outputs.duplicate == ''
  run: pip install opentimestamps-client

- name: Stamp credential on Bitcoin via OpenTimestamps
  if: steps.parse.outputs.errors == '' && steps.parse.outputs.duplicate == ''
  run: |
    ots stamp cert/credentials/${{ steps.generate.outputs.code }}.json
    ots stamp cert/endorsements/${{ steps.generate.outputs.code }}.json
```

This produces `.ots` receipts next to each signed artifact. Receipts are
initially "pending Bitcoin confirmation" (see §16) and get upgraded
to fully Bitcoin-anchored proofs by the nightly upgrade workflow.

**Commit step update:** `git add cert/certs.json cert/credentials/ cert/endorsements/`
to pick up the signed credential, its self-endorsement, and both `.ots`
receipts in one commit.

**Reply step update:** include links to all artifacts:
```
🎓 **PB-101-EF47**
🔗 [View certificate](https://endarthur.github.io/etc/cert/#v=PB-101-EF47&n=...)
📄 [Signed credential JSON](https://endarthur.github.io/etc/cert/credentials/PB-101-EF47.json)
⏳ [Bitcoin timestamp receipt](https://endarthur.github.io/etc/cert/credentials/PB-101-EF47.json.ots)
   (Pending Bitcoin confirmation; upgrades to full proof within ~24h)
```

## 10. Directory layout

The `gentropic/cert` repository is served by GitHub Pages from its root, so the
repo root maps to `https://gentropic.org/cert/`. The `/cert/` segment of the
URL comes from the repository name, not from a subdirectory — an earlier draft
nested served artifacts under `cert/`, which would have produced
`gentropic.org/cert/cert/…`. That nesting is flattened here.

```
/                                  # repo root == site root (https://gentropic.org/cert/)
├── README.md                      # repo overview + quickstart
├── LICENSE                        # CC0; a separate LICENSE-CODE (MIT) may split later
├── CLAUDE.md                      # guidance for Claude Code contributors
├── .nojekyll                      # disable Pages Jekyll processing
├── index.html                     # validator (verification logic, pdf-lib)
├── trust.html                     # plain-language trust page (EN + PT)
├── qrcodegen-v1.8.0-es6.js        # vendored QR generator
├── pdf-lib.min.js                 # vendored PDF/A-3 library
├── pdf-lib-fontkit.min.js         # vendored subset font embedding
├── courses.json                   # course catalog with ESCO/O*NET alignment
├── issuer.json                    # OBv3 issuer profile
├── issuer-keys.json               # multikey document for signature verification
├── issuer-logo.svg                # optional
├── sRGB-IEC61966-2.1.icc          # PDF/A-3 output intent
├── fonts/                         # OFL-licensed, subset-embedded
│   ├── IBMPlexSans-Regular.otf
│   ├── IBMPlexSans-Bold.otf
│   ├── IBMPlexMono-Regular.otf
│   └── (optional) IBMPlexSerif-Regular.otf
├── licenses/                      # license texts per embedded font
│   ├── IBMPlexSans-OFL.txt
│   ├── IBMPlexMono-OFL.txt
│   └── IBMPlexSerif-OFL.txt
├── achievements/                  # one file per course
│   ├── PB-101.json
│   ├── PB-201.json
│   ├── PB-301.json
│   ├── PB-401.json
│   └── BM-301.json
├── credentials/                   # one signed VC per issuance
│   ├── PB-101-EF47.json
│   ├── PB-101-EF47.json.ots       # OTS Bitcoin timestamp receipt
│   ├── PB-101-EF47.rekor.bundle   # Sigstore Rekor inclusion proof
│   └── ...                        # appended as issued
├── endorsements/                  # self-endorsement VCs
│   ├── PB-101-EF47.json
│   ├── PB-101-EF47.json.ots
│   └── ...
├── status/                        # StatusList2021 revocation
│   ├── list-1.json                # signed status list credential
│   ├── list-1.json.ots
│   ├── .next-index                # monotonic status index counter
│   └── revocations.jsonl          # audit log of revocations
├── ledger.jsonl                   # hash-chained issuance ledger
├── ledger.tip                     # current tip hash
├── ledger.tip.ots                 # Bitcoin-anchored tip
├── ledger.tip.archive/            # historical anchored tips
│   └── tip.YYYY-MM-DD.ots
├── engine/                        # Deno/TS signing pipeline (not served as a page)
│   ├── src/
│   │   ├── issue.ts               # sign_and_publish library function
│   │   ├── verify.ts              # verification primitives
│   │   ├── revoke.ts              # revocation ops
│   │   ├── pdf.ts                 # PDF/A-3 renderer
│   │   ├── ledger.ts              # ledger append/verify
│   │   ├── ots.ts                 # OpenTimestamps integration
│   │   ├── rekor.ts               # Sigstore Rekor client
│   │   └── types.ts
│   ├── cli.ts                     # gcu-cert entry point
│   ├── deno.json
│   └── tests/
├── scripts/                       # build helpers + one-off utilities
│   ├── build-achievements.js      # regen achievements/ from courses.json
│   ├── diff-credential.js         # semantic credential diff
│   ├── update-status-list.js      # revocation helper
│   ├── verify-credential.js       # CLI verifier for testing
│   └── check-font-licenses.js     # CI gate on OFL license presence
├── policies/
│   └── issuance.md                # GCU's self-certification policy
├── docs/                          # design/reference material (not served as site docs)
│   ├── SPEC-v1.md                 # this document
│   └── IMPLEMENTATION-PLAN.md
└── .github/workflows/
    ├── emit-cert.yml              # cert-request issue → emit pipeline
    ├── upgrade-ots.yml            # nightly cron: OTS + ledger tip
    ├── revoke-cert.yml            # manual dispatch
    ├── archive-status.yml         # weekly IA pinning
    ├── attest-validator.yml       # SLSA provenance on validator changes
    └── release-cli.yml            # cross-compile gcu-cert binaries on tag
```

Note: there is no `certs.json` legacy manifest in this repository. That file
lives in the predecessor repo `endarthur/etc/cert/` and stays there for the
transition (see §11). In `gentropic/cert`, new credentials are discovered via
the `credentials/` directory and the public issuance ledger, not a manifest
index.

## 11. Migration of existing certificates

One existing cert at time of upgrade: `PB-101-EF47` (Jéssica).

Migration options:
- **(A) Backfill:** run sign-credential for each existing entry, commit all
  credential files at once. Credentials retroactively cover all existing
  certs.
- **(B) Forward-only:** leave existing certs as legacy; only new issuances
  get signed credentials. Validator shows "Legacy certificate" for old ones.

**Recommended:** (A). The first cert is a known friend, the retrofit is
five minutes, and going forward the system is uniformly OBv3.

## 12. Testing

- `cert/scripts/verify-credential.js` as a Node CLI that takes a credential
  path or URL and verifies it end-to-end against the hosted issuer profile.
- Unit test (in `cert/scripts/test/`) that emits a credential using a
  fixture key and verifies it.
- Conformance check: run a sample credential through the 1EdTech Open
  Badges 3.0 validator (https://openbadges.org/checker or the
  1EdTech IMS Global conformance suite) and confirm it validates.
- Browser verification: manual test that `cert/index.html` verifies a
  known-valid and known-tampered credential correctly.

## 13. Open questions

- **Email collection.** Adding email to the issue template enables richer
  recipient identifiers and the ability to email a copy of the credential.
  Against: more PII in issue history. v1 proposal: optional field. If
  provided, hashed into recipient ID; if absent, name-only ID as in §6.
- **LinkedIn badge display.** Requires a baked PNG/SVG with embedded
  metadata (Open Badges "baked image" format). Deferred to v1.1.
- **External endorsements.** Schema supports them from day one, but no
  external endorser is lined up yet. Pursue opportunistically as
  GEOMET / Seequent / AusIMM relationships mature.

## 14. Work breakdown

| Task | Estimate |
|---|---|
| Issuer profile + key generation + keys doc | 0.5d |
| Build-achievements script + initial achievement JSONs | 0.5d |
| ESCO/O*NET code proposals for each course | 0.5d |
| Refactor signing pipeline into `sign_and_publish` library | 1d |
| sign-credential script + self-endorsement + vendor deps | 1d |
| Action updates (thin wrapper calling library) + secrets | 0.25d |
| Nightly OTS upgrade workflow | 0.25d |
| jsPDF → pdf-lib migration | 0.5d |
| PDF layout rework (text streams, fonts, subsetting) | 0.5d |
| PDF/A-3 scaffolding + veraPDF validation cycles | 1.5d |
| Font vendoring + license files + font-license CI check | 0.25d |
| StatusList2021 revocation + IA archival + multi-URL | 0.75d |
| Issuance ledger with hash-chaining + Bitcoin anchoring of tip | 0.5d |
| Sigstore Rekor logging in emit-cert | 0.25d |
| Reproducible build attestations (SLSA provenance) | 0.25d |
| Niceties (deterministic codes, XMP metadata, diff tool) | 0.5d |
| Deno CLI scaffolding + cross-compile workflow | 0.75d |
| `policies/issuance.md` drafting | 0.25d |
| `trust.html` page (English + Portuguese) | 0.5d |
| Validator signature + timestamp UI + OTS parser + revocation check | 1.75d |
| Backfill existing cert + testing | 0.5d |
| Docs (README update, threat model note) | 0.5d |
| **Total** | **12.75d** |

## 15. Threat model (brief)

- **Forged credential:** requires signing key. Stored as GH Actions secret.
  Compromise vector: repo admin access. Mitigation: Arthur is sole admin;
  2FA enforced.
- **Tampered credential:** signature verification catches any byte
  modification. Valid only if signer's private key is compromised.
- **Forged manifest entry without credential:** validator flags as
  "Legacy" rather than "Verified"; not a silent pass.
- **Replay / duplication:** each credential has unique `id` URL and
  embedded code. Duplication detectable.
- **Salt disclosure:** workshop salt is public post-workshop; attendance
  proof relies on it being secret *at the time of the workshop*. Rotation
  is per-workshop.
- **Key loss:** new key generated, added to keys doc, old credentials
  remain verifiable via old key entry. No credential invalidation.
- **Issuer domain loss:** if `endarthur.github.io` becomes unreachable,
  verification breaks (context documents, issuer profile, keys doc all
  fetched from that host). Mitigation: mirror to `gentropic.org`
  custom domain; long-term, pin context documents locally in the
  validator.
- **Predating / retroactive forgery:** even with a compromised signing
  key, an attacker cannot forge a credential dated before the compromise
  and have it pass strict verification, because the OTS timestamp anchors
  the credential's existence to a Bitcoin block that predates the forgery.
  The on-chain block timestamp is a lower bound on the credential's age
  that no post-hoc attacker can fake.
- **Silent retroactive issuance:** every emission is appended to the
  public hash-chained issuance ledger (§19) and also to the Sigstore
  Rekor transparency log (§20). An attacker who compromised the signing
  key and tried to issue a credential without appearing in the logs
  would fail verification (the validator checks ledger membership). An
  attacker who did log the forgery would appear in the public record,
  making the breach immediately visible.
- **Ledger tampering:** the ledger is hash-chained (each entry commits
  to the previous) and the tip is OpenTimestamps-anchored nightly. Any
  retroactive reordering or insertion would break the chain. Rewriting
  the chain is detectable because older tips have older Bitcoin
  timestamps.
- **Validator tampering:** the validator page is the code that runs
  signature verification in the browser. A tampered validator could
  "verify" a forged credential. Mitigation: the validator page is built
  with SLSA provenance attestations (§21) signed via Sigstore. Users can
  verify that the page served was produced from a specific repo commit.
- **Sigstore infrastructure failure:** Rekor logging and build
  attestation depend on Sigstore's public-good infrastructure. If
  Sigstore disappears, existing logged entries remain verifiable from
  the signed inclusion proofs (stored in the repo), but new logging
  would need to be rerouted to a successor. This is a liveness concern,
  not a safety one.
- **Revocation unavailability:** if all hosted status list URLs are
  unreachable, revoked credentials may verify as valid-with-warning
  (see §18.6–18.7). This is a fundamental limitation of federated
  revocation, shared with TLS, GPG, and other decentralized
  credentialing systems. Mitigations: multiple status list URLs,
  weekly Internet Archive snapshots of the signed list (which remain
  authenticity-verifiable from IA since integrity rides on the
  issuer's signature, not the hosting location). Honestly documented
  rather than papered over. For GCU's workshop-CPD use case, this
  tail risk is acceptable.

## 16. OpenTimestamps anchoring

Every signed credential and endorsement is timestamped onto the Bitcoin
blockchain via OpenTimestamps (OTS) at emission. This provides an
independent, trust-minimized lower bound on when the credential existed,
defending against predating attacks and providing long-term proof of
existence that does not depend on GitHub, the issuer's domain, or any
single party remaining honest or online.

### 16.1 Why OTS

- **Free for the issuer.** Calendar servers aggregate many submissions
  into a single Bitcoin transaction and pay on-chain fees from donations.
  GCU submits hashes, receives timestamp receipts, pays nothing.
- **Free for the verifier.** Verification uses the Bitcoin blockchain,
  which has been widely witnessed since 2009. No paid service, no API
  keys, no account required.
- **Format stable, tooling mature.** OTS has been in production since
  ~2017. Proofs created today will be verifiable decades from now as
  long as Bitcoin or any of its widely-archived block header records
  remain accessible.
- **Zero additional infrastructure.** The `opentimestamps-client` is
  one `pip install` away, runs fine in GitHub Actions, and has no
  Bitcoin-node requirement for stamping (only for fully offline
  verification).

### 16.2 Stamping workflow

The `emit-cert` action stamps the signed credential and endorsement
immediately after signing (see §9). This produces `.ots` receipts in a
"pending" state: the hash has been submitted to calendar servers and
aggregated into their Merkle trees, but the aggregated Bitcoin
transaction is not yet confirmed. Pending receipts are still useful
proofs — they rely on the calendar servers' attestation — but they
are not fully trust-minimized until upgraded.

Default calendar set (inherited from the OTS client defaults):
`a.pool.opentimestamps.org`, `b.pool.opentimestamps.org`,
`a.pool.eternitywall.com`. Submissions go to all three, providing
redundancy if any one calendar disappears.

### 16.3 Upgrade workflow

A second workflow `upgrade-ots.yml` runs nightly on a cron schedule:

```yaml
name: Upgrade OpenTimestamps receipts
on:
  schedule:
    - cron: '17 4 * * *'  # daily at 04:17 UTC
  workflow_dispatch:

jobs:
  upgrade:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - name: Install OpenTimestamps client
        run: pip install opentimestamps-client
      - name: Upgrade pending receipts
        run: |
          find cert/credentials cert/endorsements -name '*.ots' \
            -exec ots upgrade {} + || true
      - name: Commit any upgrades
        run: |
          if ! git diff --quiet; then
            git config user.name "github-actions[bot]"
            git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
            git add cert/credentials cert/endorsements
            git commit -m "ots: upgrade pending receipts to Bitcoin-anchored proofs"
            git push
          fi
```

The cron runs at a random minute (`17`) to avoid thundering-herd issues
on the OTS calendar servers. Each run is seconds to a minute of
runtime. GH Actions free tier allowance: negligible impact (public
repos have unlimited minutes).

Typical upgrade trajectory for a credential emitted at time T:
- T + 0s: pending receipt, calendar-attested
- T + 1–6h: aggregated Bitcoin transaction confirmed
- T + ~24h: next nightly upgrade run pulls the full proof path
- T + 24h onward: fully Bitcoin-anchored, no trust dependency on calendars

### 16.4 Verification surface

The GCU validator page (§8) displays the current timestamp status of
the credential's `.ots` file but does **not** perform blockchain
verification in-browser. Verification for the paranoid user is
delegated to trusted third-party OTS tools:

- **opentimestamps.org** — the canonical drag-and-drop verifier,
  maintained by the OTS project itself. Lowest trust requirement (it's
  the reference implementation). Recommended as the primary pointer.
- **dgi.io/ots** — independent web frontend by a different group
  (Digital Gold Institute). Useful as a second opinion or if the
  canonical verifier is down.
- **`ots verify`** via `pip install opentimestamps-client` — for users
  who want to verify locally against their own Bitcoin node (pruned
  node is sufficient, ~10 GB). This is the fully trustless path.

The validator page surfaces these options behind a "How to independently
verify the Bitcoin timestamp" disclosure, with the .ots file available
for download.

### 16.5 Rendering timestamp status in the validator

The validator UI surfaces three timestamp states:

- **⏳ Timestamp pending Bitcoin confirmation** — `.ots` exists, contains
  only `PendingAttestation` entries. Valid proof relative to calendar
  servers; not yet Bitcoin-anchored. Typical duration: first 1–24h.
- **⛓ Bitcoin-anchored at block {N}** — `.ots` has been upgraded and
  contains at least one `BitcoinBlockHeaderAttestation`. The validator
  parses the block height from the proof structure offline; no Bitcoin
  node or block explorer call required to display the status.
- **— No timestamp receipt** — legacy credential emitted before OTS
  integration. No status badge shown.

**Parsing in-browser.** The `.ots` format is trivial enough to parse in
the validator without pulling in a library. Status-display parsing only
requires walking the timestamp tree to collect attestations; we do not
need to execute the crypto ops or fetch block headers (that is
full verification, which stays delegated to third-party tools per
§16.4).

The format, for status parsing purposes:
- 32-byte magic header + 1 version byte (skipped)
- 1-byte crypto op tag + 32-byte file hash (skipped)
- Recursive tree: each node is either a tag byte followed by its
  payload, or `0xff` indicating a branch. Attestation tag is `0x00`
  followed by an 8-byte attestation type tag, a varuint length, and
  the payload.
- Attestation type tags we care about:
  - `83dfe30d2ef90c8e` = PendingAttestation (payload: calendar URL)
  - `0588960d73d71901` = BitcoinBlockHeaderAttestation (payload:
    single varuint = block height)

Estimated implementation: ~60 lines of JS for the parser, ~20 lines
for the status badge rendering. No dependencies. This is lighter
than the companion-JSON-file alternative would have been and keeps
the validator self-contained against the actual cryptographic artifact.

**Full in-browser verification is explicitly out of scope for v1.**
Verifying the Merkle path from the credential hash up to the Bitcoin
block merkleroot requires executing the tree's crypto ops (doable in
Web Crypto) *and* fetching the block header for the attested height
(requires a block explorer API such as blockstream.info). The second
dependency is what makes it a v2 question — we prefer to keep the
validator dependency-free and let users who want trustless verification
use the dedicated third-party tools in §16.4, which handle that
network concern at their own infrastructure.

### 16.6 Existing artifacts

At spec time there is one existing credential-eligible certificate
(`PB-101-EF47`). Backfill (per §11 option A) includes OTS stamping of
the retroactively-generated credential and endorsement. The stamp will
carry a Bitcoin timestamp proving the credential's *anchoring* date
(i.e., when it was stamped, not when Jéssica completed the workshop);
the `validFrom` field on the credential itself carries the workshop
completion date. No ambiguity, both dates are recorded independently.

## 17. Embedding credentials in the PDF

The current validator renders a certificate canvas and exports it to PDF
via jsPDF. Shipping the signed credential JSON and the `.ots` receipts
**inside** the PDF itself — as spec-compliant embedded files — means a
single artifact carries both the human-readable certificate and the
machine-verifiable data. A recipient forwards the PDF to an employer;
the employer's PDF reader (Adobe, Preview, Okular, Foxit, any modern
browser viewer) shows an attachment pane containing the credential JSON,
endorsement JSON, and both `.ots` receipts, ready to drag out and feed
into opentimestamps.org or a VC verifier.

This pattern is the same mechanism used by ZUGFeRD / Factur-X e-invoices
in Germany and France, where a visually-rendered invoice PDF also
carries its machine-readable XML payload as an embedded file. The PDF
spec calls these "embedded file streams" (§3.10, PDF 1.4+) and the
PDF/A-3 standard elevates them to "associated files" with preservation
guarantees.

### 17.1 Library migration: jsPDF → pdf-lib

jsPDF (current, v2.5.2) does not support file attachments — this has
been an open feature request since 2019 with no landing. `pdf-lib`
(MIT-licensed, ~600 KB minified, zero runtime dependencies, actively
maintained) supports attachments natively:

```js
const pdfDoc = await PDFDocument.create();
// ... draw the certificate page from the canvas ...

await pdfDoc.attach(credentialBytes, 'credential.json', {
  mimeType: 'application/ld+json',
  description: 'Open Badges v3 signed Verifiable Credential',
  creationDate: new Date(credential.validFrom),
});
await pdfDoc.attach(endorsementBytes, 'endorsement.json', {
  mimeType: 'application/ld+json',
  description: 'Self-endorsement EndorsementCredential',
});
await pdfDoc.attach(otsCredentialBytes, 'credential.json.ots', {
  mimeType: 'application/vnd.opentimestamps.ots',
  description: 'OpenTimestamps Bitcoin-anchored receipt for credential.json',
});
await pdfDoc.attach(otsEndorsementBytes, 'endorsement.json.ots', {
  mimeType: 'application/vnd.opentimestamps.ots',
  description: 'OpenTimestamps Bitcoin-anchored receipt for endorsement.json',
});

const pdfBytes = await pdfDoc.save();
```

**Migration scope:**
- Replace `jspdf-2.5.2.umd.min.js` with `pdf-lib` (single file).
- Replace the jsPDF invocation in the validator's PDF export step. The
  canvas rendering code (topographic contours, block grid, the whole
  generative art pipeline) does not change — only the canvas→PDF hand-off
  does. pdf-lib's `embedPng` / `embedJpg` take canvas `toDataURL` output
  directly.
- Remove the `addImage`-style calls, replace with `page.drawImage()`.
- Estimated code change: ~40-60 lines in `index.html`.

**Size impact:** pdf-lib is larger than jsPDF (~600 KB vs ~380 KB). Both
are vendored locally per the single-file philosophy. Total cert-related
JS goes from ~430 KB to ~650 KB. Acceptable; still loads fast on any
reasonable connection.

### 17.2 PDF/A-3 compliance

PDF/A-3 (ISO 19005-3) is the archival PDF standard that permits
embedded files as first-class "associated files" with declared
relationships to the host document. Every issued GCU certificate
conforms to PDF/A-3 level B (basic) with associated files.

**Why PDF/A-3 is in v1 scope:**

The workshop certificate is exactly the kind of compound document PDF/A-3
was designed for — human-readable rendering plus authoritative
machine-readable payload, intended for long-term preservation. The
ZUGFeRD / Factur-X e-invoicing standard uses the identical pattern.
Issuing in this format means every GCU credential is a valid archival
document by international standard, not merely "a PDF with stuff glued
on."

Additionally, PDF/A-3 compliance makes GCU's template repo useful as
the basis for a future "Make Your Own Credentialing System" workshop
(GCU-CERT-101 or similar). The curriculum is intrinsically interesting
— fork, configure issuer, generate keys, design cert art, set up
action, emit credentials — and the attendees receive a PDF/A-3
credential of the workshop as part of completing it. A tight recursive
loop where the certificate proves the system works by being the system.

**What PDF/A-3 requires:**

1. **Embedded ICC output intent.** The sRGB IEC61966-2.1 profile is
   freely available (~3 KB) and suits screen-targeted documents.
   Added to the document catalog as a `DeviceRGB` output intent.

2. **Full font subset embedding.** PDF/A-3 requires that no text
   rendering relies on reader-provided fonts. v1 embeds OFL-licensed
   fonts as proper subset-embedded Type0/CIDFontType2 font objects via
   pdf-lib + `@pdf-lib/fontkit`. This produces real text streams in the
   PDF — selectable, searchable, copyable, accessible to screen readers,
   and properly handled by PDF/UA accessibility conformance should that
   be added later.

   **Font choices (v1):** IBM Plex Sans (regular, bold) for body text
   and headings; IBM Plex Mono or JetBrains Mono for validation codes
   and technical identifiers; optionally IBM Plex Serif for the
   "CERTIFICATE OF COMPLETION" heading. All OFL-1.1 licensed, all safe
   for embedding. Font files vendored under `cert/fonts/`; license
   texts under `cert/licenses/`.

   **Rendering pipeline change.** Current pipeline renders everything
   (background art + text) to a 2100×2970 canvas, then embeds the
   canvas as a single PNG in the PDF. New pipeline:
   - Generative art background renders to canvas, embeds as PNG (as
     today — it's genuinely pixel data).
   - Text elements (title, name, description bullets, validation code,
     date, issuer info) become `page.drawText()` calls on top of the
     image layer, using subset-embedded fonts.
   - QR code stays as either an embedded PNG or SVG vector object.
   - Layout coordinates move from canvas pixel space to PDF points
     (1 point = 1/72 inch; A4 is 595×842 points).

   Estimated pipeline rework: ~0.5d on top of the jsPDF→pdf-lib
   migration. The validator's canvas-based preview rendering can stay
   as-is for on-screen display; only the PDF export path changes.

3. **XMP metadata block** at the document catalog's `Metadata` entry,
   including `pdfaid:part="3"`, `pdfaid:conformance="B"`, document
   title, subject, creator, and timestamps.

4. **Associated Files table.** Document catalog's `AF` entry lists
   all embedded files. Each file-spec carries an `AFRelationship`
   attribute:
   - `credential.json` → `AFRelationship = /Source` (authoritative
     data the visual was rendered from)
   - `endorsement.json` → `AFRelationship = /Supplement`
   - `credential.json.ots` → `AFRelationship = /Supplement`
   - `endorsement.json.ots` → `AFRelationship = /Supplement`

5. **Forbidden features excluded.** No JavaScript, no encryption, no
   transparency without proper blending intent, no external
   hyperlinks (the validation URL in the QR code is fine; it's data,
   not a hyperlink action), no LaunchAction, no multimedia.

**Validation.** veraPDF (open source, MIT license, https://verapdf.org)
is the reference PDF/A validator, maintained by the PDF Association
and the Open Preservation Foundation. A CI check runs veraPDF against
a sample emission on each PR to catch regressions.

**Implementation notes for pdf-lib.** pdf-lib exposes the PDF object
model directly via `PDFDict`, `PDFArray`, `PDFStream`, `PDFName`, etc.,
which is enough to manually add everything PDF/A-3 requires. The
canvas-to-PDF pipeline wraps the generated PDF object tree, adding:
- `pdfDoc.catalog.set(PDFName.of('Metadata'), xmpStream)`
- `pdfDoc.catalog.set(PDFName.of('OutputIntents'), outputIntentsArray)`
- `pdfDoc.catalog.set(PDFName.of('AF'), associatedFilesArray)`
- Per-attachment: `fileSpec.set(PDFName.of('AFRelationship'), PDFName.of('Source'))`

Total PDF/A-3 scaffolding: ~100-150 lines in a helper module, plus the
sRGB ICC profile file and the XMP template. Validation cycles through
veraPDF typically take 2–3 iterations to resolve all findings.

### 17.3 What PDF/A-3 is not

PDF/A-3 is not PDF/X. They are different ISO standards serving
different purposes:

- **PDF/A-3** (ISO 19005-3): archival preservation for screen-targeted
  documents. Requires sRGB or similar screen-oriented output intent.
  Goal: document remains readable and verifiable indefinitely.
- **PDF/X** (ISO 15930): print production. Requires CMYK or spot-color
  output intents, specific image resolution minimums, trim/bleed/crop
  metadata, overprint rules. Goal: document prints consistently on
  commercial presses.

GCU credentials target PDF/A-3. They print acceptably on any home
printer via normal sRGB-to-printer conversion in the driver, but they
are not print-shop production files. A v2+ feature could add a
separate PDF/X-4 export for users who want commercial printing of
physical framed copies; not in v1 scope.

### 17.3 Attachment listing convention

Every issued PDF cert contains exactly four attachments, in this order,
with these filenames:

| Filename | MIME | Contents |
|---|---|---|
| `credential.json` | `application/ld+json` | Signed `AchievementCredential` |
| `endorsement.json` | `application/ld+json` | Signed `EndorsementCredential` |
| `credential.json.ots` | `application/vnd.opentimestamps.ots` | OTS receipt for credential |
| `endorsement.json.ots` | `application/vnd.opentimestamps.ots` | OTS receipt for endorsement |

Legacy certificates (pre-upgrade backfills) contain the same four
attachments — the backfill process generates the signed artifacts and
stamps them at retrofit time, so every PDF is uniformly structured.

### 17.4 Fallback download links

The validator continues to offer individual download links for each
artifact (credential.json, endorsement.json, .ots files) alongside
"Download PDF certificate." This is redundant with the PDF embeds but
useful for:
- Users on platforms where extracting PDF attachments is awkward.
- Automated pipelines that want the JSON directly.
- Accessibility — screen readers handle file-list UIs better than
  PDF attachment panes in some environments.

No additional work; the links already exist in the §8 validator
changes.

## 18. Credential revocation (StatusList2021)

Every credential carries a `credentialStatus` entry pointing to a
position in a W3C StatusList2021 bitstring. Revoking a credential
is a one-bit flip in a hosted file plus a commit. Verifiers check
the status list during verification; a flipped bit means "revoked."

This closes the integrity gap where a compromised workshop hash,
a genuine error, or a later-discovered grounds for revocation could
not previously be addressed except by deleting the credential file
(leaving a broken reference).

### 18.1 Structure

A single file at `cert/status/list-1.json` is itself a signed
Verifiable Credential containing a compressed bitstring (Base64-encoded,
GZIP-compressed). Bit position N maps to credential issued at index N.

```json
{
  "@context": [
    "https://www.w3.org/ns/credentials/v2",
    "https://w3id.org/vc/status-list/2021/v1"
  ],
  "id": "https://endarthur.github.io/etc/cert/status/list-1.json",
  "type": ["VerifiableCredential", "StatusList2021Credential"],
  "issuer": "https://endarthur.github.io/etc/cert/issuer.json",
  "validFrom": "2026-05-01T00:00:00Z",
  "credentialSubject": {
    "id": "https://endarthur.github.io/etc/cert/status/list-1.json#list",
    "type": "StatusList2021",
    "statusPurpose": "revocation",
    "encodedList": "H4sIAAA..."
  },
  "proof": { ... }
}
```

The bitstring is 131,072 bits (16 KB uncompressed, ~100 bytes gzipped
for an all-zeros list). Each credential's status index is assigned
sequentially at emission time and recorded in the credential itself:

```json
"credentialStatus": {
  "id": "https://endarthur.github.io/etc/cert/status/list-1.json#42",
  "type": "StatusList2021Entry",
  "statusPurpose": "revocation",
  "statusListIndex": "42",
  "statusListCredential": "https://endarthur.github.io/etc/cert/status/list-1.json"
}
```

### 18.2 Emission flow addition

The emit-cert action:
1. Reads the current next-index from `cert/status/.next-index` (starts at 0).
2. Assigns that index to the new credential's `credentialStatus.statusListIndex`.
3. Writes the incremented next-index back.
4. (No bit flip at emission — bits start at 0 meaning "not revoked.")

### 18.3 Revocation flow

A separate workflow `revoke-cert.yml`, triggered manually via
`workflow_dispatch` with a credential code as input:
1. Looks up the credential's status index.
2. Decompresses the bitstring, flips bit N to 1, recompresses.
3. Re-signs the StatusList2021Credential with the issuer key.
4. Commits the updated list.
5. Optionally appends a revocation reason to an audit log
   `cert/status/revocations.jsonl`.

Revocation is a deliberate, authenticated operation — not a silent
delete — and the history of which bit was flipped when is preserved
in the repo's commit history. The status list is itself
OpenTimestamps-anchored on every update, so revocation dates are
Bitcoin-timestamped too.

### 18.4 Validator additions

The validator fetches the referenced status list alongside the
credential and checks the bit at the credential's index. UI surfaces:
- **✓ Valid** — signature verified, status bit = 0
- **✗ Revoked** — signature verified, status bit = 1 (shows
  revocation date from commit history if available)
- **⚠ Status list unavailable** — signature verified but status
  list fetch failed; presumed valid with a warning

### 18.5 List sizing and rotation

A single list supports 131,072 credentials, far beyond any plausible
GCU emission volume. When (if ever) that fills, emit `list-2.json`
and direct new credentials there. Old credentials continue to
reference `list-1.json` indefinitely.

### 18.6 Availability and external archival

Revocation checking depends on the verifier being able to fetch the
status list. The list itself is a signed VC, so its authenticity is
guaranteed by the issuer's signature regardless of where the bytes
come from — but if the bytes can't be fetched at all, revocation
cannot be checked.

Mitigations (pure liveness, not integrity — integrity is the
signature's job):

- **Multiple `statusListCredential` URLs.** Each credential's
  `credentialStatus.statusListCredential` field is an array: primary
  at `https://endarthur.github.io/etc/cert/status/list-1.json`,
  secondary at `https://gentropic.org/cert/status/list-1.json` once
  that domain is set up. Verifiers try each in order. Any one
  reachable is sufficient.

- **Internet Archive pinning.** A weekly workflow submits the status
  list URL to `web.archive.org/save`. IA preserves snapshots
  indefinitely, independent of GCU infrastructure. If all GCU-hosted
  URLs become unreachable, a verifier can fetch any historical IA
  snapshot, verify its signature against the (also archivable)
  `issuer-keys.json`, and determine revocation state as of that
  snapshot. The snapshot's signature proves authenticity; IA's
  independence proves GCU didn't tamper with or remove it.

  ```yaml
  name: Archive status list
  on:
    schedule:
      - cron: '13 3 * * 0'  # weekly, Sunday 03:13 UTC
    workflow_dispatch:
  jobs:
    archive:
      runs-on: ubuntu-latest
      steps:
        - name: Submit to Internet Archive
          run: |
            curl -sS -X POST \
              "https://web.archive.org/save/https://endarthur.github.io/etc/cert/status/list-1.json"
            curl -sS -X POST \
              "https://web.archive.org/save/https://endarthur.github.io/etc/cert/issuer.json"
            curl -sS -X POST \
              "https://web.archive.org/save/https://endarthur.github.io/etc/cert/issuer-keys.json"
  ```

### 18.7 Honest failure mode documentation

Revocation is fundamentally harder than issuance in any credential
system — cryptographic or otherwise. Issuance is "this was true at
time T," which can be proven by signature + timestamp. Revocation
is "this is no longer true as of time T," which requires every
future verifier to learn about the change. Federated systems cannot
guarantee that universally.

The README explicitly documents this:

> GCU credentials support W3C StatusList2021 revocation. Verification
> checks the revocation status at
> `https://endarthur.github.io/etc/cert/status/list-1.json`. If the
> status list is unreachable, verifiers fall back to showing
> credentials as valid with a warning.
>
> This is a known limitation shared by all federated revocation
> systems (including TLS certificate revocation via OCSP/CRL, GPG
> key revocation, and most decentralized credentialing protocols).
> The status list is additionally archived weekly to the Internet
> Archive as a failsafe. In the narrow case where (1) a credential
> was revoked, (2) all GCU-hosted status list URLs are unreachable,
> and (3) the verifier does not fall back to Internet Archive, the
> credential may verify as valid despite being revoked. For
> workshop CPD credentials this tail case is acceptable; for
> higher-stakes credentials, online verification against the
> primary URL is recommended.

This framing is more honest than the marketing-polished alternative
and makes the system easier to reason about.

## 19. Public issuance ledger

Every credential emission appends one record to a public hash-chained
ledger at `cert/ledger.jsonl`. The ledger's head is OpenTimestamps-
anchored to Bitcoin nightly. This creates a publicly verifiable
append-only record of every credential GCU has ever issued, with
cryptographic guarantees against retroactive insertion.

### 19.1 Why a ledger

The individual credentials are already signed and Bitcoin-anchored
for their individual issuance date. The ledger adds:
- **Aggregation**: one place to look for "everything GCU has ever
  issued," auditable by a third party in a single pass.
- **Ordering proof**: the hash chain proves that credential N was
  issued after credential N-1, independent of timestamps.
- **Anti-insertion**: no credential can be silently added between
  existing entries without breaking every subsequent chain link.
- **Anti-omission**: if GCU claims to have issued credential X, but
  X is not in the ledger, that itself is evidence of foul play.

This is the same pattern as Certificate Transparency for TLS certs,
applied to credentials.

### 19.2 Ledger record format

One JSON object per line (JSONL), appended at emission:

```json
{
  "i": 42,
  "t": "2026-05-14T12:34:56Z",
  "code": "PB-301-A3F9",
  "credential_hash": "sha256:7d070f6b64d9bcc530fe99cc21eaaa4b3c364e0b2d367d7735671fa202a03b32",
  "endorsement_hash": "sha256:4a1c8b...",
  "status_index": 42,
  "prev_hash": "sha256:e5b7ac..."
}
```

Where `prev_hash` is `sha256` of the entire previous line (the
full JSON string including its trailing newline), creating the
hash chain. The first entry has `prev_hash: "sha256:0000...0000"`.

### 19.3 Ledger tip anchoring

The nightly upgrade workflow (§16.3) is extended:
1. After upgrading any pending OTS receipts for credentials, it
   also computes the current ledger tip hash.
2. Writes that hash to `cert/ledger.tip`.
3. Runs `ots stamp cert/ledger.tip`.
4. Upgrades previous `.tip.ots` files to fully confirmed proofs.

The ledger directory accumulates `ledger.tip.N.ots` files, one per
night, each Bitcoin-anchoring the ledger's state at that moment.
After a few weeks of operation, the ledger has dozens of
Bitcoin-anchored historical snapshots; rewriting history retroactively
would require breaking Bitcoin's proof-of-work from every snapshot
onward.

### 19.4 Validator ledger check

The validator, when rendering a cert, verifies:
1. The credential's hash matches its entry in the ledger at the
   specified index.
2. The chain back to the most recent Bitcoin-anchored tip is intact.
3. Displays the anchor date ("Ledger anchored to Bitcoin block N,
   YYYY-MM-DD") as additional evidence.

This check is optional and runs asynchronously — a slow ledger
fetch shouldn't block the certificate display. Failed ledger
verification shows a warning but doesn't invalidate the cert.

## 20. Sigstore Rekor transparency logging

Each credential emission additionally writes a record to Sigstore's
public Rekor transparency log. This provides an independent,
third-party-hosted witness of every GCU issuance.

### 20.1 Why Rekor in addition to the issuance ledger

The ledger (§19) is GCU's own append-only record; it's trustworthy
to the extent one trusts GCU not to have rewritten its own git
history somehow. Rekor is infrastructure GCU doesn't control — run
by the OpenSSF as a public good, backed by the Linux Foundation,
Google, Red Hat, Chainguard, and GitHub. A record in Rekor means
GCU publicly declared this credential's existence at this time on
infrastructure it can't tamper with after the fact.

The two are complementary: the ledger gives total history in one
place; Rekor gives independent external witness. Together they form
what cryptographers call "publicly verifiable provenance."

### 20.2 Cost and governance

- **Cost:** zero. Rekor is free for public-good use.
- **Governance:** Sigstore is a graduated project in the Open Source
  Security Foundation, a neutral Linux Foundation entity. Audited by
  Trail of Bits. No cryptocurrency involvement, no token economics.
- **Sustainability:** funded by OpenSSF with Rekor v2 specifically
  redesigned in 2025 to reduce infrastructure costs. Multi-cloud
  storage backends (GCP, AWS, MySQL, POSIX) reduce single-provider
  dependency.

### 20.3 Emission flow addition

The emit-cert action, after signing:

```yaml
- name: Log to Sigstore Rekor
  if: steps.parse.outputs.errors == '' && steps.parse.outputs.duplicate == ''
  run: |
    cosign attest-blob \
      --predicate cert/credentials/${{ steps.generate.outputs.code }}.json \
      --type "https://gentropic.org/gcu/credential-issued/v1" \
      --bundle cert/credentials/${{ steps.generate.outputs.code }}.rekor.bundle \
      cert/credentials/${{ steps.generate.outputs.code }}.json
```

This uses Sigstore's `cosign` CLI with the repo's OIDC identity
(issued automatically to the GitHub Actions runner — no key management
needed). The resulting `.rekor.bundle` file contains the inclusion
proof and is committed alongside the credential. Anyone can verify
later that this credential was logged to Rekor at this time, even
if Rekor is later unavailable, because the signed bundle is
self-contained.

### 20.4 What's in the Rekor record

Rekor stores:
- The credential JSON's hash (not the content itself).
- The timestamp of logging.
- The OIDC identity that logged it (the
  `endarthur/etc` GitHub Actions runner).
- An inclusion proof showing the record's position in Rekor's
  Merkle tree.

Anyone can query `rekor-cli search --hash <credential-hash>` to
find all GCU credentials by hash, or monitor the log for any
emission by the GCU issuer identity.

### 20.5 Validator surface

The validator offers a "Verify on Sigstore" link that constructs a
Rekor query URL for the credential's hash. This doesn't alter the
validator's core verification logic (which remains self-contained
offline); it's a supplementary trust-minimization link for users
who want external confirmation.

## 21. Reproducible build provenance

The validator `index.html` is the code that actually runs signature
verification in users' browsers. If the validator itself could be
tampered with, so could its verdicts. Reproducible build
attestations close this loop: the page served at any given time is
verifiably the output of a specific commit in a specific repository.

### 21.1 Implementation

Every commit to the `cert/` directory triggers a workflow
`attest-validator.yml` that:
1. Computes the hash of `cert/index.html`.
2. Calls `actions/attest-build-provenance@v1` passing that hash.
3. The action generates a SLSA Build Provenance v1 attestation in
   in-toto format, signs it via Sigstore using the runner's
   short-lived OIDC identity, and uploads it to GitHub's attestation
   API.

```yaml
name: Attest validator build
on:
  push:
    paths:
      - 'cert/index.html'
      - 'cert/pdf-lib.min.js'
      - 'cert/qrcodegen-v1.8.0-es6.js'

jobs:
  attest:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      attestations: write
      contents: read
    steps:
      - uses: actions/checkout@v4
      - name: Attest validator
        uses: actions/attest-build-provenance@v1
        with:
          subject-path: |
            cert/index.html
            cert/pdf-lib.min.js
            cert/qrcodegen-v1.8.0-es6.js
```

### 21.2 Verification

Users (or automated monitors) can verify the validator page's
provenance:

```
gh attestation verify cert/index.html \
  --owner endarthur \
  --repo etc
```

This confirms the page was produced by a workflow in the named
repository and signed via Sigstore. The full provenance JSON can
be downloaded and inspected; it records the workflow, the commit,
the runner image, and the inputs that produced the output.

### 21.3 Cost and governance

- **Cost:** zero. Free on public repositories via GitHub's built-in
  Sigstore integration.
- **Governance:** same as §20.2 (Sigstore / OpenSSF / Linux
  Foundation).
- **Failure mode:** if GitHub's attestation API disappears, previously
  generated attestations remain verifiable from their Sigstore bundles.
  New attestations would need a different pipeline.

### 21.4 What this does not cover

Reproducible build attestations prove that the served file came from
a specific commit. They don't prove that commit is safe — a malicious
commit could still produce a malicious page with valid provenance.
Mitigation is out of band: anyone auditing GCU can read the commit
history, run `git log --show-signature` to verify commits were
signed by Arthur, and visually inspect the validator code. The
attestation is one layer in a defense-in-depth stance, not the
whole stance.

## 22. Assorted niceties

Small quality-of-life and infrastructural improvements that are
cheap individually and compound meaningfully:

### 22.1 Deterministic credential codes

The 4-hex suffix is currently random. Change to:
```
code = PREFIX + "-" + courseNum + "-" + sha256(
  workshop + ":" + date + ":" + name_normalized + ":" + ISSUER_CODE_SALT
).slice(0, 4).toUpperCase()
```

Benefits:
- Same inputs always produce the same code (idempotent re-runs).
- Duplicate detection becomes trivial: compute the expected code,
  check if it exists.
- Test fixtures are stable across runs.

The `ISSUER_CODE_SALT` is a GitHub Actions secret, separate from
the signing key, preventing third parties from predicting codes
from public inputs.

### 22.2 XMP metadata in the PDF

The PDF's XMP metadata stream includes:
- `dc:title` — "Certificate of Completion — {course title}"
- `dc:creator` — "{issuer name}"
- `dc:date` — credential issuance date
- `gcu:credentialCode` — the cert code
- `gcu:issuerDID` — the issuer's DID or profile URL
- `gcu:credentialHash` — SHA-256 of the embedded credential.json

Users can right-click → Properties in any PDF reader and see the
code, issuer, and credential hash without opening the file. Minor
polish; very professional.

### 22.3 Credential diff CLI

A small script `cert/scripts/diff-credential.js` that takes two
credential paths or URLs and reports semantic differences
(distinguishing meaningful field changes from noise like
re-serialization). Useful for migration audits and debugging. Maybe
50 lines.

### 22.4 Issuer profile versioning

`issuer.json` carries a `version` field. Every substantive change
(rebrand, key policy change, domain migration) bumps the version.
Credentials issued at version N reference the issuer profile via
the fixed URL but a historical copy lives at
`issuer-v{N}.json` so old credentials can always be verified against
the profile as it existed at their issuance.

### 22.5 Key rotation ceremony

Documented procedure for signing key rotation:
1. Generate new Ed25519 keypair offline (or via WebAuthn PRF).
2. Append the new key's `verificationMethod` entry to
   `issuer-keys.json` as `#key-{N+1}`.
3. Update the `GCU_ISSUER_SIGNING_KEY` GitHub secret with the new
   private key.
4. Emit a test credential, verify it signs against `#key-{N+1}`.
5. Announce the rotation in the repo's README or a release note.
6. Old key entry stays in `issuer-keys.json` forever; previously
   issued credentials continue to verify against their original key.

No scheduled rotation in v1 — rotate only on suspected compromise
or at major version boundaries.

### 22.6 Verifier diversity testing

Beyond the 1EdTech validator, CI runs each emitted credential
through at least one additional OBv3 verifier (Digital Bazaar's
reference implementation, Walt.id's, or W3C's VC Playground). This
catches cases where the credential is technically conformant to
the spec but uses a construct the ecosystem hasn't standardized on.

## 23. Engine / issuance model separation

The v1 emit-cert action currently bakes the self-certification flow
(workshop hash → issue → action → emit) into a single workflow file.
For GCU this is correct and stays as shipped. But the cert system is
intended to be extracted as a reusable engine + template in v2 (see
§25.1) and serve as the foundation of the GCU-CERT-101 workshop.

To make v2 extraction a refactor rather than a rewrite, v1 is
structured from the start so that *how the signing pipeline gets
called* is separable from *what the signing pipeline does*. Different
instances will want different governance models; the engine should
not know which.

### 23.1 Issuance model axis

Real-world issuers sit at different points on a spectrum from fully
self-certified to fully manually curated. v1 ships self-certification
(matching GCU's own practice) but the architecture must accommodate
all of the following, to be wired up by template variants in v2:

- **Self-certification**. Attendee-driven, automatic. Workshop hash
  → GitHub Issue → action → cert. Zero human review per emission.
  Fits permissive completion criteria ("you showed up, you engaged").
  This is GCU's model and the v1 default.
- **Roster-batch issuance**. Instructor commits a CSV to
  `rosters/YYYY-MM-DD-course.csv` at end of cohort; action iterates
  rows and emits one credential per row. One human decision per
  batch.
- **Manual review with self-claim**. Attendee opens an issue; action
  waits for an `approved` label before emitting. One human decision
  per credential. Appropriate when completion is not self-provable.
- **PR-based approval with hardware key**. Action prepares the
  credential unsigned and opens a PR. Reviewer pulls the PR locally,
  signs with a YubiKey / Solo2 / NitroKey (via WebAuthn PRF or
  hardware-backed PGP), commits the signed result, merges. Slowest
  path, strongest key hygiene. Appropriate for security-conscious
  issuers who want signing keys never to touch cloud infrastructure.
- **Webhook-driven**. External assessment system POSTs
  `{name, course, date, pass: true}` to a webhook endpoint or opens
  an issue via GitHub API; action emits. Appropriate for issuers
  whose source of truth is an LMS or assessment platform outside
  GCU's repo.

### 23.2 Engine as library function

The signing pipeline becomes a callable library function, not a
workflow-embedded script. All issuance models call the same function
with a prepared tuple:

```ts
// cert/engine/src/issue.ts
export interface IssuanceInput {
  name: string;
  course: string;       // course key, e.g. "PB-301"
  date: string;         // ISO date of completion
  email?: string;       // optional, hashed into recipient ID
  meta?: Record<string, unknown>;  // optional free-form fields
}

export interface IssuanceResult {
  code: string;
  credentialPath: string;
  endorsementPath: string;
  otsReceiptPath: string;
  rekorBundlePath: string;
  pdfPath: string;
  ledgerEntry: LedgerEntry;
  statusIndex: number;
}

export async function sign_and_publish(
  input: IssuanceInput,
  config: EngineConfig,
): Promise<IssuanceResult> {
  // 1. Load issuer profile and signing key from config
  // 2. Build AchievementCredential JSON
  // 3. Assign status list index
  // 4. Sign credential
  // 5. Build + sign self-endorsement
  // 6. OTS stamp both
  // 7. Log to Rekor
  // 8. Append ledger entry
  // 9. Generate PDF/A-3 with embedded attachments
  // 10. Return paths to all artifacts
}
```

The function is pure in its inputs: given the same input, config,
and clock, it produces the same output. Nothing about *how* the
input was collected, *who* approved it, or *what governance* applied
is the function's concern.

### 23.3 CLI wrapper

A CLI wraps the library function for manual invocation. This is
what template variants 2, 3, and 4 (roster-batch, manual review,
PR-signing) invoke under the hood.

```
$ gcu-cert issue --name "Ana Costa" --course PB-301 --date 2026-05-14 \
    --config ./gcu.config.json
✓ Signed credential at cert/credentials/PB-301-A3F9.json
✓ Signed endorsement at cert/endorsements/PB-301-A3F9.json
✓ OTS stamped (pending Bitcoin confirmation)
✓ Rekor bundle at cert/credentials/PB-301-A3F9.rekor.bundle
✓ Ledger entry #42 appended
✓ PDF at cert/out/PB-301-A3F9.pdf

Code: PB-301-A3F9
Hash: sha256:7d070f6b...
```

Other subcommands: `gcu-cert revoke CODE --reason "..."`,
`gcu-cert verify PATH`, `gcu-cert roster-emit ROSTER.csv`,
`gcu-cert reissue CODE` (for layout migrations).

### 23.4 Runtime choice: Deno

The CLI is implemented in TypeScript and compiled to a standalone
binary via `deno compile`. Reasons:

- **Security model matches the use case.** The binary's capabilities
  are declared at compile time via Deno's permission flags:
  `--allow-net=api.sigstore.dev,*.opentimestamps.org,rekor.sigstore.dev`
  `--allow-read=./cert,./config`
  `--allow-write=./cert`
  Even if a dependency is compromised, the binary cannot reach
  beyond these boundaries.
- **Web-platform API alignment.** Deno uses Web Crypto, fetch,
  streams natively. The signing code that runs in the browser
  validator can be shared verbatim with the CLI, no Node-compat
  shims. One codebase, two surfaces.
- **Cross-compilation stability.** `deno compile` has been stable
  since v1.6 (2020) and supports cross-targeting Linux, macOS
  (Intel + Apple Silicon), and Windows from any host. Produces
  ~80 MB binaries that run with no runtime installed.
- **Single-binary distribution.** Instance maintainers can
  `curl | install` one file and have the full CLI, with no
  npm/pnpm/node version management. Lowers the operational burden
  for non-developer issuers.

Cross-compilation is done in the GCU repo's release workflow,
producing six binaries per release:

```yaml
- run: deno compile --target=x86_64-unknown-linux-gnu --output=dist/gcu-cert-linux-amd64 cli.ts
- run: deno compile --target=aarch64-unknown-linux-gnu --output=dist/gcu-cert-linux-arm64 cli.ts
- run: deno compile --target=x86_64-apple-darwin --output=dist/gcu-cert-macos-amd64 cli.ts
- run: deno compile --target=aarch64-apple-darwin --output=dist/gcu-cert-macos-arm64 cli.ts
- run: deno compile --target=x86_64-pc-windows-msvc --output=dist/gcu-cert-windows-amd64.exe cli.ts
```

Binaries are published as GitHub release assets, SLSA-attested via
the same provenance machinery as the validator page (§21).

### 23.5 Policy documentation as first-class artifact

Each instance ships a human-readable `policies/issuance.md`
describing how that instance decides who gets credentials. This is
the trust story for that issuer in plain language:

- GCU's policy doc: "Completion hash computed during the workshop
  session + GitHub issue submission = credential. The workshop
  facilitator is responsible for ensuring the hash is only shown
  to actual attendees. Emission is automatic upon hash validation."
- A formal course's policy doc: "Minimum 70% on the final
  assessment, evaluated by the instructor of record. Roster
  submitted as CSV at course end; credentials emitted in batch.
  Instructor signs off via a pull request to the cert repo."
- A security-conscious instance's policy doc: "Emission requires
  signed pull request approval from at least two board members,
  with the signing step requiring a hardware security key in
  physical possession of the primary signer."

Having policy docs as a declared, inspectable artifact means
instances are honest about their trust model, and verifiers can
assess whether to rely on a given credential by reading the policy
it was issued under. This is more transparent than commercial
credentialing services, which typically hide their issuance criteria
in internal procedures.

### 23.6 Per-course issuance override (optional)

An instance with mixed course types (some self-certified, some
instructor-reviewed) can override the default issuance model per
course in `courses.json`:

```json
{
  "courses": {
    "PB-301": {
      "issuance": "self-certification",
      ...
    },
    "ADVANCED-ASSESSMENT-101": {
      "issuance": "manual-review",
      "reviewers": ["instructor-github-username"],
      ...
    }
  }
}
```

Deferred to v2 template work. v1 GCU uses a single global model
(self-certification) and doesn't need this.

### 23.7 What lands in v1 concretely

- The signing pipeline is refactored into a `sign_and_publish`
  library function with clean inputs/outputs.
- The emit-cert action becomes a thin wrapper that parses the
  GitHub issue and calls the library function.
- The CLI wrapper is scaffolded in TypeScript, exposing at minimum
  `issue` and `verify` subcommands. Compiled binaries are
  published as release assets.
- `policies/issuance.md` is written for GCU describing the
  self-certification model honestly.
- The README documents that v2 will ship additional issuance
  variants.

Template variants (roster-batch, manual review, PR-signing,
webhook) are explicitly v2 and part of the template extraction
work.

## 24. Trust page

Every GCU certificate links to `cert/trust.html` — a plain-language
page explaining, for a curious visitor, exactly what the certificate
does and does not claim, and how to verify each claim independently.

### 24.1 Why

The spec has, at this point, built seven independent trust
mechanisms into each credential (§17 summary). Each is cryptographically
robust. But to a person looking at a certificate PDF, the machinery
is invisible — all they see is a nice-looking document with a QR
code. Without explanation, the trust story is either taken on faith
("this company seems legit") or ignored entirely.

The trust page is documentation-as-UI. It makes the cryptographic
story legible to a non-specialist, and gives specialists everything
they need to verify independently. It is also directly useful for
the GCU-CERT-101 curriculum — Session 1's "why self-hosted
credentials matter" lesson is most of the content of this page.

### 24.2 Content

One page at `cert/trust.html`, linked from every validator render
and from the PDF's first page. Structure:

- **What this certificate is.** Plain-language description. "A
  workshop completion certificate issued by the Geoscientific Chaos
  Union. It is not a degree, not an accredited credential, not
  state-recognized. It is a signed statement that this person
  completed this workshop on this date."
- **How you can verify it.** Step-by-step. "Click the QR code. The
  validator page will check the signature, the timestamp, the
  revocation status, and the public ledger. All checks run in
  your browser; nothing is sent to GCU."
- **What each trust mechanism actually guarantees.** One paragraph
  per mechanism:
  - Signature: what it proves, what key, how to verify
    independently.
  - Endorsement: what it adds, who signs it.
  - Revocation: how it works, what happens if unreachable.
  - OpenTimestamps: what Bitcoin anchoring gives you, where to
    verify.
  - Issuance ledger: what the hash chain proves, where to audit.
  - Rekor: what the external log provides, where to query.
  - SLSA attestation: what proves the validator page hasn't been
    tampered with.
- **What this certificate does NOT guarantee.** Equally important.
  "This certificate does not imply accreditation, does not confer
  any degree, does not guarantee employability, and is not a
  substitute for formal education credentials. GCU is a non-formal
  education entity; its certificates have standing only to the
  extent that the reader trusts GCU's reputation and governance."
- **GCU's governance in one paragraph.** Who Arthur is, where the
  signing key lives, what the policy doc says.
- **How to fork and run your own instance.** Link to the v2
  template repo (once it exists) for readers who want to build
  their own.

Target length: ~1000-1500 words. Readable in 5 minutes. Linked
from every touchpoint.

### 24.3 Multilingual

v1 ships English and Portuguese (GCU's primary languages). v2
templates can add others per instance. Language switch via URL
fragment: `trust.html#pt` or `trust.html#en`.

### 24.4 Style

Plain HTML, same design system as the validator page. No
marketing voice, no hype. Direct explanations. Tone modeled on
the "Privacy Tools" style: honest, technical, slightly dry,
respects the reader's intelligence.

## 25. Summary of v1 deliverables

- [x] OBv3-conformant issuer profile and key infrastructure
- [x] Achievement definitions per course, with ESCO and O*NET alignment
- [x] CPD-friendly wording supporting AusIMM / SEG / SME / AAPG self-
      declaration
- [x] Signed `AchievementCredential` JSON-LD per certificate
- [x] Signed `EndorsementCredential` self-endorsement per certificate
- [x] OpenTimestamps Bitcoin anchoring of credentials and endorsements
- [x] Nightly OTS upgrade workflow
- [x] W3C StatusList2021 credential revocation with signed status list
- [x] Manual revoke-cert workflow
- [x] Weekly Internet Archive pinning of status list and issuer profile
- [x] Multiple status list URLs for liveness redundancy
- [x] Public hash-chained issuance ledger with Bitcoin-anchored tip
- [x] Sigstore Rekor transparency log entry per emission
- [x] SLSA build provenance attestation for the validator page
- [x] Validator page with in-browser signature verification, timestamp
      status display (in-browser `.ots` parser), revocation check, and
      ledger membership verification
- [x] PDF/A-3 level B compliant certificate with embedded signed
      credential, endorsement, OTS receipts, and Rekor bundle as
      associated files
- [x] Proper text stream rendering with subset-embedded OFL-licensed
      fonts (selectable, searchable, screen-reader accessible)
- [x] Migration from jsPDF to pdf-lib
- [x] veraPDF validation in CI
- [x] Font license files vendored and CI-validated
- [x] XMP metadata with credential code, issuer, and hash
- [x] Deterministic credential codes from hashed inputs
- [x] Documented key rotation ceremony
- [x] Multi-verifier conformance testing in CI
- [x] Refactored `sign_and_publish` library function for future
      multi-issuance-model support
- [x] Deno-based `gcu-cert` CLI with cross-compiled binaries for
      Linux/macOS/Windows, published as SLSA-attested release assets
- [x] `policies/issuance.md` describing GCU's self-certification model
- [x] `cert/trust.html` page in English and Portuguese
- [x] Fallback individual download links for each artifact
- [x] Third-party verifier links for independent Bitcoin proof checking
- [x] Backfill of existing certificates
- [x] Documentation updates

## 26. Forward-looking notes (for future specs)

Items explicitly deferred from v1 but worth capturing now so they are
not lost:

### 26.1 Template extraction (v2)

The v1 architecture is a specific instance using one specific design
and course catalog. A v2 refactor will extract:
- `engine` — the signing, verification, PDF/A-3 assembly, OTS stamping,
  and validator logic. Becomes a versioned reusable library.
- `template` — a bundle of design parameters: colors, fonts (with
  declared licenses), generative art modules, layout positions, course
  schema, issuer profile template, PDF/A-3 metadata defaults. The GCU
  template becomes one of potentially many.
- `instance` — each actual issuer's repo: chosen template + their
  courses + their signing key (in secrets) + their certs manifest.

Design-for-templating is deferred because v2 will benefit from knowing
what actually varies across real instances, which requires at least one
real fork attempt. Cheap things to do correctly in v1 that pay forward
toward v2:
- Font license files from day one, in the declaration format v2 will
  use.
- Visual constants (colors, font families, layout coordinates) in a
  single config object at the top of the rendering code, not scattered
  through.
- Course schema declared explicitly (JSON Schema or similar), even if
  validation is informal in v1.

These are refactorings that improve the code independently and happen
to seed the v2 extraction.

### 26.2 GCU-CERT-101 course (separate spec)

Once v2 templates exist, a workshop on building credentialing systems
becomes possible. Rough outline for the future course spec:

- **Session 1 — concepts and legislation.** Credentials, badges,
  degrees, and what makes them legally distinct. Jurisdictional
  overview covered in §A of this spec. Why self-hosted, cryptographic,
  and timestamped matters.
- **Session 2 — fork and configure.** Clone the template. Set up issuer
  identity. Generate signing key (WebAuthn PRF optional). Configure
  secrets. Watch CI fail on placeholders, fix each, watch it pass.
- **Session 3 — customize the design.** Fonts (with the licensing
  lesson reinforced), colors, generative art, layout. Watch the font
  license CI catch attempts to use unlicensed fonts.
- **Session 4 — define courses.** Write course catalog. Learn JSON
  Schema validation. Define one course — potentially the workshop
  itself.
- **Session 5 — emit the first credential.** Open an issue, watch the
  action run, see the signed timestamped credential appear. Download
  the PDF. Open it, see attachments. Run through opentimestamps.org
  and a VC verifier.
- **Session 6 — recursive closure.** Attendees receive a PDF/A-3
  signed Bitcoin-anchored credential of having completed the workshop
  on making credential systems — issued from the GCU template
  instance, or from each attendee's own instance to each other.

Target delivery: late 2026 at earliest, after v2 ships and at least
one pilot run. Venue options include Belo Horizonte locally, GCU-
adjacent events, or CCC-adjacent slots during the Germany trip.

## Appendix A — Jurisdictional notes on non-accredited credentials

This appendix captures reference material for Session 1 of the future
GCU-CERT-101 course. Not part of v1 implementation work; preserved
here so it survives to the course spec.

### A.1 Brazil

Non-formal education is explicitly legal and well-defined in Brazilian
law. "Cursos livres" fall under the Lei de Diretrizes e Bases da
Educação Nacional (LDB, Lei 9.394/96, Art. 39–42) and Decreto
5.154/2004. Key points:

- Cursos livres are a legal modality of non-formal professional
  education. They require no prior authorization from MEC (Ministry of
  Education) or state education councils, and are not regulated by
  MEC.
- Institutions offering cursos livres have the legal right to issue
  certificates under Law 9.394/96 and Decree 5.154/2004. These
  certificates are valid throughout Brazilian territory.
- Certificates **cannot** be equated, validated, or endorsed by
  MEC/CAPES-recognized schools — they are legitimate but distinct from
  formal education credentials.
- No minimum course hours, no mandatory curriculum, no prior-education
  prerequisites (Art. 42 LDB).
- The freedom to teach and certify is backed by the Federal
  Constitution Art. 205–206 (right to education, freedom to teach and
  learn).
- What cursos livres are **not**: fundamental education, secondary
  education, technical education, or higher education. They do not
  confer any of those levels. Regulated professions (medicine, law,
  engineering, etc.) continue to require formal credentials from
  recognized institutions.

GCU sits cleanly in the curso livre category. No regulatory friction
in Brazil.

### A.2 United States

The US does not have federal higher-education accreditation. Instead,
it uses a patchwork of state-level regulations plus non-governmental
accrediting agencies recognized by the Department of Education or
CHEA (Council for Higher Education Accreditation). Key points:

- "Degree" (associate, bachelor's, master's, doctorate) is a protected
  term in most states. Issuing unauthorized degrees is prosecutable;
  states like California, Oregon, Texas, New Jersey have the
  strictest enforcement.
- "Certificate," "certificate of completion," "badge," "credential,"
  "statement of completion" are not protected terms. Anyone may issue
  them without state authorization, and recipients may use them
  legally on resumes, LinkedIn, and elsewhere.
- Unaccredited institutions may operate in most states, though some
  require registration and mandatory disclosure of unaccredited
  status (Hawaii Chapter 446E, Oregon, Texas).
- Professional CPE/CEU credits (for licensed professions — CPAs,
  attorneys, doctors, engineers) require recognition by the relevant
  state licensing board or professional society, separate from
  education accreditation. Non-accredited training can often still
  count for CPE if the content matches board-approved categories
  and the licensee self-declares it (subject to audit).
- Diploma mill laws exist in most states specifically to prevent
  misrepresenting unaccredited credentials as accredited. Rule of
  thumb: say exactly what you are, don't imply more.

GCU can issue freely in the US as long as it never uses the word
"degree" and clearly states it is a non-accredited certificate.

### A.3 European Union (general)

The EU has no single credentialing regulator. Educational
credentialing is a member-state competence. However, some EU-wide
frameworks matter:

- **European Qualifications Framework (EQF).** 8 levels mapping to
  different educational attainments. Non-formal and informal learning
  can in principle be mapped to EQF levels, but formal mapping
  requires member-state recognition.
- **Europass.** EU-wide digital credentials wallet; supports Open
  Badges / VC-style credentials. GCU credentials can be stored in
  Europass by recipients directly.
- **ESCO.** Skill classification framework; GCU achievements align
  to ESCO codes per §5.1.
- **EBSI.** EU blockchain credential infrastructure. Gated (see
  §16.1 of this spec's earlier drafts) and not viable for GCU v1.

### A.4 Germany specifically

Germany distinguishes sharply between formal (staatlich anerkannt,
state-recognized) and non-formal education:

- Formal qualifications (Berufsausbildung via the dual system,
  Hochschulabschluss, IHK/HWK certifications) are heavily regulated.
  Issuing unauthorized equivalents is illegal.
- "Weiterbildung" (continuing/further education) in the non-regulated
  space is genuinely free. Any institution or individual may run
  training and issue certificates of participation or completion,
  without state recognition, as long as they do not claim
  equivalence to regulated qualifications.
- IHK certificates are a specific regulated category; the IHK mark
  cannot be used without IHK authorization.
- "Zertifikat" (certificate) is not a protected term; "Urkunde" or
  "Zeugnis" (official diploma/testimonial) also legal to issue but
  should not be used in contexts implying state-recognized
  attainment.

GCU would operate in Germany as a Weiterbildungsanbieter issuing
unregulated certificates. Clear positioning as non-formal and
non-state-recognized avoids any issue.

### A.5 Australia

Australia has strong separation of accredited and non-accredited
training:

- "Statement of Attainment" is an AQF (Australian Qualifications
  Framework) term, legally restricted to Registered Training
  Organisations (RTOs) under ASQA regulation. Non-RTOs cannot issue
  Statements of Attainment without committing a compliance breach.
- The "Nationally Recognised Training" (NRT) logo is a regulated
  trademark; using it without RTO registration is a serious offense.
- Non-accredited training is explicitly legal. Non-RTOs may issue
  "certificates of completion," "certificates of participation,"
  "certificates of attendance," etc., as long as they do not use
  restricted AQF terminology or the NRT logo.
- Certificates from non-accredited programs "acknowledge
  participation only" (ASQA's framing). They are legal and useful for
  CPD purposes if accepted by the relevant professional body.
- AusIMM CPD is a professional-society framework, separate from ASQA.
  Self-declared CPD hours are audited at ~1% annually. Training
  quality is the member's responsibility; GCU credentials are usable
  for CPD under Category 1 (formal learning) at the member's
  discretion.

GCU can issue in Australia as long as it never uses AQF terminology
or the NRT logo. The neo-dadaist branding ("workshop completion
certificate from the Geoscientific Chaos Union") is clearly
non-AQF and poses no ambiguity.

### A.6 Canada

Canadian education is provincially regulated with no federal body.
Each province sets rules for degree-granting and formal
credentialing; federal oversight is minimal. Relevant patterns:

- "Degree" is protected in each province. Most provinces require
  explicit ministerial authorization or act-of-legislature recognition
  to grant degrees.
- Non-degree credentials (certificates, diplomas-of-completion) are
  generally unregulated. Some provinces (Ontario, BC) have
  private-career-college regulations for vocational training that
  implies "job-ready" outcomes, but academic/workshop certificates
  from individuals or informal organizations are unregulated.
- Professional bodies (Engineers Canada's constituent associations,
  provincial bar associations, colleges of physicians) maintain their
  own CPD frameworks similar to AusIMM — self-declared, audited.
- French-language Quebec has additional rules via the Ministère de
  l'Éducation and the Office québécois de la langue française (for
  certificate wording).

GCU can issue in Canada freely as non-degree certificates. No
regulatory friction.

### A.7 Summary table

| Jurisdiction | Can GCU issue? | What to avoid |
|---|---|---|
| Brazil | Yes — curso livre | Claiming MEC recognition or equivalence to formal credentials |
| US | Yes — certificate | Using "degree"; implying accreditation |
| Germany | Yes — Weiterbildung | Claiming state recognition; misusing IHK-restricted terms |
| Australia | Yes — certificate of completion | AQF terminology; NRT logo |
| Canada | Yes — certificate | Claiming degree-granting authority |
| EU (general) | Yes — various | Member-state-specific degree protections |

In every case, the pattern is: name it honestly, describe what it is
and is not, and don't claim recognition you don't have. GCU's
philosophy of "this is what we are, legibly" aligns naturally with
staying clear of these lines.
