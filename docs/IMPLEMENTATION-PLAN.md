# `gentropic/cert` — v1 Implementation Plan

This document is a build guide for implementing the GCU credential system
v1 described in `SPEC-cert-obv3.md`. It is meant to drive concrete work
rather than document design decisions — for the *why*, see the spec.

## Repository: `gentropic/cert`

- Hosted at `github.com/gentropic/cert`
- Serves at `gentropic.org/cert` via GitHub Pages custom domain (already
  configured for `gentropic.org`)
- Issuer identity: `did:web:gentropic.org`
- Primary human signer: Arthur Endlein Correia, named in the issuer profile

The repo contains both the GCU instance and the engine code inside it.
The engine will later be extracted to `gentropic/cert-engine` once v1
has been running long enough to reveal what actually varies across
instances. Until then, clean module boundaries inside the repo are
the forward-compatibility preparation; no package split yet.

## Migration from `endarthur/etc/cert/`

- The existing cert system stays running at its current URL during
  development.
- One existing credential (`PB-101-EF47`, Jéssica Fernanda Bastos da
  Matta) gets regenerated under the new issuer identity during v1
  backfill.
- After v1 ships, `endarthur/etc/cert/` adds a redirect/deprecation
  notice pointing to the new location. The `etc` repo returns to
  being a grab-bag for small experiments.

## Decision log

Working record of v1 scope changes made after the plan was first
drafted. Not a replacement for the spec — the spec documents intent;
this records deviations.

- **2026-04-19 — OpenTimestamps (Phase 4) dropped.** The predating-
  attack defense that OTS provides is narrow for workshop credentials
  and adds meaningful operational complexity (Python dependency in
  CI, nightly upgrade cron, in-browser `.ots` parser, `.ots`
  attachments in the PDF, ledger-tip anchoring). Rekor (Phase 7)
  already provides the independent third-party transparency witness
  and covers most of the same threat surface. Cultural context:
  "anchored to Bitcoin" has lost credibility with the target
  technical audience since the speculation era, so the rhetorical
  win no longer justifies the complexity. Spec §16 is left intact
  as historical design material. Downstream phases adjust as
  follows: Phase 6 (ledger tip) anchors via Rekor instead of OTS;
  Phase 8 (PDF/A-3) drops `.ots` attachments (credential.json,
  endorsement.json, .rekor.bundle only); Phase 11 (validator) drops
  the OTS parser and shows Rekor inclusion time instead; Phase 12
  (trust.html) narrates six trust mechanisms instead of seven.
  Threat model in spec §15 should be re-read with the honest caveat
  that a compromised signing key now invalidates past credentials
  too, not only future ones — Rekor timestamping is the main
  defense against post-compromise backdating.

## Build order

The phases below are designed to produce a working, shippable system
at each milestone. Each milestone is a natural pause point where v1
could be released if scope had to be cut.

### Phase 0 — Scaffolding (~0.5d)

Set up the repo with its directory structure and tooling.

- [ ] Create `gentropic/cert` repo (public, MIT license for code, CC0
      for content/spec/templates where reasonable).
- [ ] Configure GitHub Pages to serve from `main` branch, custom
      domain `gentropic.org/cert` (or root, depending on existing
      site setup).
- [ ] Copy `SPEC-cert-obv3.md` into `docs/SPEC-v1.md`.
- [ ] Copy this plan into `docs/IMPLEMENTATION-PLAN.md`.
- [ ] Create directory structure per §10 of the spec (`engine/`,
      `cert/`, `policies/`, `.github/workflows/`).
- [ ] `deno.json` and initial TypeScript scaffolding in `engine/`.
- [ ] Empty placeholder workflows in `.github/workflows/`.
- [ ] `README.md` at root explaining the repo's purpose and linking
      to the spec and plan.

**Exit criteria:** repo exists, Pages serves a placeholder, directory
skeleton matches the spec.

### Phase 1 — Issuer identity (~0.5d)

Establish the cryptographic root of trust.

- [ ] Generate Ed25519 keypair offline. Private key into GH Actions
      secret `GCU_ISSUER_SIGNING_KEY`. Backup to hardware-backed
      storage (YubiKey/NitroKey or paper+vault).
- [ ] Write `cert/issuer.json` per §4 of the spec.
- [ ] Write `cert/issuer-keys.json` with `key-1` entry.
- [ ] Publish `did:web:gentropic.org` document at
      `gentropic.org/.well-known/did.json` pointing at the issuer
      keys. This may require coordinating with wherever `gentropic.org`
      is currently served from.
- [ ] Verify DID resolution works via a DID resolver (e.g. the W3C
      universal resolver at uniresolver.io).

**Exit criteria:** `did:web:gentropic.org` resolves to a DID document
listing the current signing key.

### Phase 2 — Engine core (~2d)

The signing pipeline as a library, buildable and testable in isolation
from any issuance model.

- [ ] `engine/src/types.ts` — shared types (IssuanceInput, IssuanceResult,
      EngineConfig, AchievementCredential, EndorsementCredential, etc.).
- [ ] `engine/src/achievement.ts` — build-achievements logic: read
      `courses.json`, output achievement JSON files per course.
- [ ] `engine/src/issue.ts` — the `sign_and_publish` function per
      §23.2. Scope for this phase: generate credential + endorsement
      JSON, sign both with Ed25519/eddsa-rdfc-2022, write to
      `cert/credentials/` and `cert/endorsements/`. No OTS, no Rekor,
      no PDF yet — those come in later phases.
- [ ] `engine/src/verify.ts` — signature verification, for use by
      both CLI and validator.
- [ ] Unit tests covering: credential construction, signing,
      verification round-trip, tampering detection.
- [ ] `engine/tests/fixtures/` with a test signing keypair (separate
      from production).

**Exit criteria:** `sign_and_publish({name, course, date})` produces
signed credential + endorsement JSON that verifies. Verified by unit
tests and by a round trip through the W3C VC Playground.

### Phase 3 — Initial achievement data (~0.5d)

Course catalog with alignment metadata.

- [ ] Write initial `cert/courses.json` with existing GCU courses
      (PB-101, PB-201, PB-301, PB-401, BM-301).
- [ ] Propose ESCO/O*NET alignment codes per course. Present for
      review before committing. Reference: esco.ec.europa.eu,
      onetonline.org.
- [ ] Run `build-achievements` to produce
      `cert/achievements/{course}.json` files.
- [ ] Include CPD-friendly wording per §5.2.

**Exit criteria:** five achievement JSONs committed, each with
ESCO + O*NET alignment, CPD note, and criteria narrative.

### Phase 4 — OpenTimestamps integration *(DROPPED)*

See the 2026-04-19 decision log entry above. Spec §16 is preserved
as historical design material; the operational story for
transparency/timestamping moves to Rekor in Phase 7 and to the
ledger-tip anchoring in Phase 6.

### Phase 5 — StatusList2021 revocation (~0.75d)

Closing the integrity gap.

- [ ] Initialize `cert/status/list-1.json` as a signed empty
      StatusList2021Credential (all-zeros bitstring, 131,072 bits).
- [ ] `engine/src/status.ts` — index assignment, bitstring read/write,
      re-signing after update.
- [ ] `cert/status/.next-index` initialized to 0.
- [ ] Extend `sign_and_publish` to assign the next status index and
      include `credentialStatus` in the credential.
- [ ] Extend verification to check the status bit.
- [ ] Write `.github/workflows/revoke-cert.yml` — manual dispatch
      workflow that takes a code, flips the bit, re-signs, OTS-stamps
      the updated list, commits with a revocation reason in
      `cert/status/revocations.jsonl`.
- [ ] Write `.github/workflows/archive-status.yml` — weekly IA
      pinning per §18.6.
- [ ] Multiple `statusListCredential` URLs: primary at
      `gentropic.org/cert/status/list-1.json`, optionally a mirror.

**Exit criteria:** a test credential can be issued, revoked, and the
revoked status surfaces correctly in verification.

### Phase 6 — Issuance ledger (~0.5d)

Hash-chained public record with Bitcoin-anchored tip.

- [ ] `engine/src/ledger.ts` — append entry, compute chain, verify
      chain integrity.
- [ ] Extend `sign_and_publish` to append a ledger entry with
      `prev_hash` linked to the previous line.
- [ ] Extend the nightly OTS workflow to also write `cert/ledger.tip`
      with the current tip hash, `ots stamp` it, and archive
      previous tip anchors to `cert/ledger.tip.archive/tip.YYYY-MM-DD.ots`.
- [ ] Ledger verification in the CLI (`gcu-cert verify-ledger`).

**Exit criteria:** every emission appends to the ledger with valid
chain, the tip is Bitcoin-anchored nightly, chain verification passes.

### Phase 7 — Sigstore Rekor logging (~0.25d)

External transparency witness.

- [ ] Extend `sign_and_publish` to call `cosign attest-blob` logging
      the credential's hash to Rekor, using the GH Actions runner's
      OIDC identity. Save the `.rekor.bundle` next to the credential.
- [ ] No new workflow — this happens inside emit-cert.
- [ ] Verify a Rekor bundle can be independently verified via
      `cosign verify-blob` against the logged identity.

**Exit criteria:** each credential has a `.rekor.bundle` committed,
and `rekor-cli search --hash <credential-hash>` finds the record.

### Phase 8 — PDF/A-3 rendering (~3d)

The heavy phase. Subdivides naturally.

**8a — pdf-lib migration and basic rendering (~0.5d)**
- [ ] Vendor `pdf-lib.min.js` and `pdf-lib-fontkit.min.js` to `cert/`.
- [ ] Replace the jsPDF canvas-to-PDF path with pdf-lib equivalent.
- [ ] Verify existing canvas rasterization approach still produces
      a valid PDF through pdf-lib (intermediate step before text
      streams).

**8b — Font embedding (~0.75d)**
- [ ] Vendor IBM Plex Sans + IBM Plex Mono OTF files to `cert/fonts/`.
- [ ] Vendor corresponding OFL license files to `cert/licenses/`.
- [ ] Write `scripts/check-font-licenses.js` — CI script that verifies
      every font in `cert/fonts/` has an accompanying license file and
      is on the allowlist of embedding-safe licenses.
- [ ] Refactor PDF layout: background art stays as canvas PNG, text
      elements become `page.drawText()` calls with subset-embedded
      fonts.
- [ ] Verify text is selectable, searchable, and accessible in output
      PDFs.

**8c — PDF/A-3 scaffolding (~1.5d)**
- [ ] Vendor sRGB ICC profile (`sRGB-IEC61966-2.1.icc`) to `cert/`.
- [ ] Add output intent declaration, XMP metadata block, and AF
      table construction per §17.2.
- [ ] Embed the four standard attachments (credential.json,
      endorsement.json, credential.json.ots, endorsement.json.ots)
      with correct `AFRelationship` values.
- [ ] Embed the `.rekor.bundle` as a fifth attachment with
      `AFRelationship = /Supplement`.
- [ ] XMP with document metadata including cert code, issuer DID,
      credential hash.
- [ ] Run through veraPDF locally, iterate until conformant.
- [ ] Add veraPDF to CI as a conformance check on emitted PDFs.

**8d — PDF/A-3 polish (~0.25d)**
- [ ] QR code rendered as embedded SVG vector rather than PNG image
      (sharper, smaller).
- [ ] Test rendering in multiple PDF readers (Adobe Acrobat, Preview,
      Foxit, Okular, browser PDF.js) — attachments should surface in
      each.

**Exit criteria:** emitted PDFs pass veraPDF PDF/A-3 conformance
checks, render correctly in all major readers, show attachments in
each reader's attachment panel, and contain selectable text.

### Phase 9 — CLI (~1d)

Deno-based `gcu-cert` binary, cross-compiled.

- [ ] `engine/cli.ts` — entry point with subcommands: `issue`,
      `verify`, `revoke`, `verify-ledger`.
- [ ] Wire up `issue` and `verify-ledger` first (they're the most
      testable).
- [ ] `deno.json` with permissions declared:
      `--allow-net=api.sigstore.dev,*.opentimestamps.org,rekor.sigstore.dev`,
      `--allow-read=.`, `--allow-write=./cert`, `--allow-run=ots,cosign`.
- [ ] `.github/workflows/release-cli.yml` — on git tag push, cross-
      compile for six targets per §23.4, publish as release assets.
- [ ] SLSA provenance via `actions/attest-build-provenance` for each
      binary.
- [ ] README documenting installation (`curl | install` snippet per
      platform).

**Exit criteria:** `gcu-cert issue --name ... --course ... --date ...`
works from a downloaded binary on Linux, macOS, and Windows. Release
workflow produces SLSA-attested binaries.

### Phase 10 — Emit-cert action refactor (~0.5d)

Thin workflow wrapping the engine library.

- [ ] Port `emit-cert.yml` from `endarthur/etc` to `gentropic/cert`,
      updating the workshop hash salt policy.
- [ ] Replace the inline emission logic with a call to the engine
      library via Deno.
- [ ] Cert-request issue template mirrored from the current one.
- [ ] Test end-to-end: open a test issue, watch the action run, see
      the credential appear with all its artifacts.

**Exit criteria:** opening a cert-request issue with a valid hash
produces a fully-signed-stamped-logged-rendered credential via the
new pipeline.

### Phase 11 — Validator page (~2d)

Browser-based verification with full trust stack surfaced.

**11a — Core verification (~1d)**
- [ ] Port the existing validator HTML structure from
      `endarthur/etc/cert/`.
- [ ] Migrate canvas rendering to pdf-lib preview generation (the
      validator no longer produces a PDF; it calls pdf-lib to render
      a preview and the server-generated PDF is downloaded directly).

  **Note:** re-examine this decision during implementation. The
  simpler alternative is to keep the validator using canvas for
  on-screen preview and just offer a direct download link to the
  pre-generated PDF file (which is committed to the repo by the
  emit-cert action). This avoids putting pdf-lib in the validator
  page at all.
- [ ] Ed25519 signature verification via Web Crypto API.
- [ ] Fetch the credential, endorsement, issuer profile, and status
      list during verification.
- [ ] Status bit check against the StatusList2021 credential.

**11b — OTS status parser (~0.5d)**
- [ ] Minimal in-browser OTS binary parser per §16.5 — walks the
      tree, identifies attestation tags, reports pending vs. anchored
      with block height.
- [ ] Timestamp status badge UI: ⏳ pending / ⛓ anchored / — none.

**11c — Ledger check and polish (~0.5d)**
- [ ] Fetch and verify the credential's ledger entry.
- [ ] Surface all verification results in a clear UI panel.
- [ ] Download buttons for PDF, credential.json, endorsement.json,
      .ots files, .rekor.bundle.
- [ ] Links to third-party verifiers (opentimestamps.org, dgi.io/ots,
      Sigstore search).
- [ ] Preview mode for unissued sample certs.

**Exit criteria:** the validator page verifies a real credential end-
to-end, all checks green, all trust mechanisms visible.

### Phase 12 — Trust page (~0.5d)

Plain-language documentation of the whole trust stack.

- [ ] Write `cert/trust.html` per §24. ~1500 words.
- [ ] English and Portuguese versions via `#en` / `#pt` URL fragments.
- [ ] Link from every validator render and from the PDF's first page.
- [ ] Tone: honest, technical, slightly dry.

**Exit criteria:** a curious non-specialist can read trust.html and
understand what the cert does and doesn't claim and how to verify it.

### Phase 13 — Policy document (~0.25d)

GCU's issuance model in plain language.

- [ ] Write `policies/issuance.md` describing the self-certification
      model: workshop hash as attendance proof, GitHub issue as
      claim, action as automatic emitter, zero human review per
      credential, Arthur as responsible signer.
- [ ] Honest about what this means for trust: the workshop
      facilitator (Arthur) is trusted not to leak the hash outside
      the workshop session.
- [ ] Link from `cert/trust.html` and from the main README.

**Exit criteria:** policy doc committed, linked from trust page.

### Phase 14 — Reproducible build attestations (~0.25d)

SLSA provenance for the validator.

- [ ] `.github/workflows/attest-validator.yml` per §21 — runs on
      pushes to `cert/index.html`, `cert/trust.html`, and the
      vendored JS files.
- [ ] Use `actions/attest-build-provenance@v1`.
- [ ] Document verification command in the README:
      `gh attestation verify cert/index.html --owner gentropic --repo cert`

**Exit criteria:** pushes to validator files produce verifiable SLSA
attestations retrievable via `gh attestation`.

### Phase 15 — Backfill and migration (~0.5d)

One existing credential, one retired URL.

- [ ] Regenerate Jéssica's PB-101-EF47 credential under the new
      issuer identity. Same workshop, same date, new issuer DID,
      new signing key, new full trust stack (OTS-stamped, Rekor-
      logged, ledger-entered, PDF/A-3 rendered).
- [ ] Write a migration note explaining the issuer transition.
- [ ] In `endarthur/etc/cert/`, add a redirect at the old URL
      pointing to the new one. A small `index.html` with a meta
      refresh plus JavaScript redirect is sufficient; GitHub Pages
      doesn't support server-side redirects.
- [ ] Keep the old `certs.json` intact as historical record.

**Exit criteria:** old URL redirects, new credential validates, no
users with stale QR codes are left in the cold.

### Phase 16 — Testing, docs, and polish (~1d)

The unglamorous but necessary last mile.

- [ ] `README.md` at root: what the repo is, how to verify a
      credential, how to fork to start your own (placeholder —
      proper fork-and-go docs come with v2 template work).
- [ ] Threat model written into `docs/THREAT-MODEL.md`.
- [ ] Key rotation ceremony documented in `docs/KEY-ROTATION.md`.
- [ ] Multi-verifier conformance testing: CI runs each new
      credential through at least one third-party OBv3 verifier
      (Digital Bazaar's or Walt.id's) and asserts conformance.
- [ ] `engine/tests/` covers signing, verification, revocation,
      ledger, OTS, Rekor, and end-to-end emission.
- [ ] `scripts/diff-credential.js` — the nicety per §22.3.

**Exit criteria:** v1 is ready to announce. Documentation is complete
enough that someone landing on the repo understands what it is and
can either use a credential or start to build their own.

## Open decisions for Claude Code to flag

A few points where the spec is deliberately non-prescriptive, or where
implementation experience should override the spec. If Claude Code hits
these, it should surface them for human review rather than guessing:

1. **Validator rendering approach** (phase 11a). The spec leans toward
   pdf-lib in the validator. The simpler alternative is canvas preview
   + direct PDF download. Pick whichever is less code.
2. **Exact ESCO/O*NET codes** (phase 3). Proposed codes should be
   reviewed by Arthur before committing. ESCO's hierarchy is deep;
   picking the right level of specificity matters.
3. **QR code format in the PDF** (phase 8d). SVG is preferred but if
   pdf-lib's SVG embedding is buggy, PNG is fine.
4. **Font choice nuances** (phase 8b). If IBM Plex subset-embedding
   runs into specific quirks with pdf-lib's fontkit, either work
   around it or swap for Inter (also OFL).
5. **Status list index 0 semantics** (phase 5). The spec assigns indices
   starting from 0. Decide whether index 0 is a real credential or
   reserved as a sentinel. Either is defensible; document the choice.
6. **Backfill timing** (phase 15). It's possible Jéssica's original
   cert should remain at the old URL permanently rather than being
   migrated. Discuss with Arthur before regenerating.

## When this is done

The v1 system is running at `gentropic.org/cert`. New credentials get
the full stack automatically. Old URL redirects. Documentation is
public. The spec and this plan land in the repo as historical design
documents.

After that, the next spec is the template extraction (`cert-engine`),
which is a v2 concern and waits for real usage lessons. After that, the
curriculum spec for GCU-CERT-101.

Total v1 estimate: ~12.75 days of focused work, per §14 of the spec.
Realistic calendar time depends on how many days get dedicated to this
vs. everything else in Arthur's world. If it runs on vacation or dense
weekends, a month. If it runs against a normal work week with evening
hacking, closer to three months.

No rush. The existing credential continues to validate via the old URL
for as long as needed.
