# GCU issuance policy

This document describes how the Geoscientific Chaos Union decides who
gets a certificate. It exists because a credential's meaning depends on
the policy that produced it, and we want that policy to be legible to
anyone — a prospective attendee, a recruiter, a professional society
auditor, or a curious stranger.

For the *what* a GCU certificate claims, see
[`trust.html`](../trust.html). This doc is the *how*.

## Model: self-certification with workshop-hash attendance proof

GCU uses a **self-certification** issuance model. There is no roster,
no instructor review, and no human in the loop between an attendee's
claim and a signed credential. Concretely, for each issued credential
the full flow is:

1. **Workshop delivery.** The attendee opens the workshop page on their
   own time (workshops are self-serve, so there is no scheduled
   session). Everything the attendee needs — material, exercises,
   completion confirmation — is on the page.
2. **Completion hash.** At the end of the workshop, the page shows a
   16-character hash derived from the workshop key, the current date,
   and a secret salt baked into the page. The attendee records this
   hash.
3. **Claim.** The attendee opens a GitHub issue on
   [`gentropic/cert`](https://github.com/gentropic/cert) using the
   `cert-request` template, supplying their name, the workshop they
   completed, the date, and the completion hash.
4. **Automated validation.** A GitHub Actions workflow parses the
   issue, recomputes the expected hash using the salt stored as a
   repository secret, and rejects the claim if the hash does not match.
5. **Automatic emission.** If validation passes, the engine signs an
   Open Badges v3 VerifiableCredential and a self-endorsement, appends
   a line to the hash-chained issuance ledger, logs the credential's
   hash to the Sigstore Rekor transparency log, commits all artifacts
   to the repository, and replies on the issue with the validator URL.

Zero humans review any individual credential. The policy is machine-
enforced at step 4, then executed at step 5.

## What the workshop hash actually proves

The completion hash proves the attendee opened the workshop page at
some point after the current salt was deployed. That's the full
security claim — no more, no less.

It does *not* prove the attendee completed the exercises, understood
the material, or spent any particular amount of time on the page. Any
of those would require per-attendee supervision, which is
incompatible with self-serve delivery. What the hash does is keep
automated bots and people who have never touched a workshop page from
filing valid-looking claims; in practice that threshold matches the
stakes of the credential.

## Salt rotation

The workshop salt rotates when GCU chooses to invalidate outstanding
un-claimed hashes — typically when cutting a new cohort, or on
suspected disclosure to a non-attendee. Rotation does not affect
existing issued credentials; the salt is a gate at issuance time only.
Operational detail lives in [`../docs/OPERATIONS.md`](../docs/OPERATIONS.md).

## Signing authority

The Ed25519 signing key for `did:web:gentropic.org` is held by Arthur
Endlein Correia, the named primary signer for all current GCU
workshops. Its custody:

- The private key exists as a GitHub Actions secret (for the emit-cert
  workflow) and in offline backup (hardware-backed storage or paper
  plus vault). It is never present on a browser or a developer laptop.
- Rotation is append-only: a new key is added to `issuer-keys.json`
  and the DID document as `#key-2`, and the old `#key-1` entry stays
  listed forever so previously-issued credentials keep verifying.

## What GCU trusts the workshop facilitator to do

The honest version: because the emission is fully automated, the only
trust edge that matters is **the workshop facilitator not leaking the
current salt to people who have never touched the workshop page**. If
the facilitator posts the salt publicly, or hands it to a friend who
wants a credential, the automation happily emits a valid-looking
credential for someone who did not complete (or even open) the
workshop.

This is a real limitation, and we are direct about it in the credential
system's trust surface: the certificate has value *given* an honest
facilitator. GCU is currently a one-person operation — Arthur — so that
trust edge collapses to "does Arthur behave well?" For a small
workshop-credentialing collective whose output is explicitly non-
accredited and explicitly structured as CPD-self-declaration-grade
evidence, that answer is acceptable. For a high-stakes credential
system it would not be.

Instance operators using this template for higher-stakes credentials
should swap this policy for one of the models the engine supports —
roster-batch issuance, manual-review gated on an `approved` label, or
hardware-key-signed PR approval — each of which pushes human judgment
into the loop at a different point. The engine is the same across
models; only the policy and workflow differ. Spec §23.1 lists the
currently-supported alternatives.

## Summary of trust anchors

- **Credential integrity**: the issuer's Ed25519 signature.
- **Revocation**: GCU can flip a bit in the public BitstringStatusList
  at any time.
- **Non-repudiation**: every issuance is logged to Sigstore Rekor and
  appended to a hash-chained public ledger. GCU cannot silently
  repudiate a credential it emitted, and cannot silently insert one it
  did not.
- **Facilitator honesty**: the gap we acknowledge, not a mechanism. A
  credential is as trustworthy as the facilitator's discipline about
  not leaking the salt outside the workshop context.

A reader who understands the four points above has read the complete
GCU issuance policy.
