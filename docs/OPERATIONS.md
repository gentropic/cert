# Operations

Operational reference for running an instance of this credential system.
For the *why* behind the architecture, see `SPEC-v1.md`. For the phased
build path, see `IMPLEMENTATION-PLAN.md`. This document covers only what
an operator needs to know to keep things running.

## GitHub Actions secrets

The `emit-cert` workflow needs four secrets configured at the repository
level (Settings → Secrets and variables → Actions). Generate random
values with `openssl rand -hex 32` unless stated otherwise.

| Secret | Purpose | Rotation |
|---|---|---|
| `GCU_ISSUER_SIGNING_KEY` | PEM-encoded Ed25519 private key. Signs every credential, endorsement, and status-list update. Set during Phase 1 (`docs/IMPLEMENTATION-PLAN.md`). | Only on suspected compromise or deliberate policy change. Key rotation ceremony is append-only — old key stays in `issuer-keys.json` forever so past credentials keep verifying. |
| `GCU_CODE_SALT` | Salts the deterministic credential-code derivation per spec §22.1. | Persistent. Don't rotate unless you want all future codes to diverge from past ones (doesn't invalidate anything, just changes the hash space). |
| `GCU_RECIPIENT_SALT` | Salts the recipient-ID hash embedded in each credential's `credentialSubject.id`. | Persistent. Rotation means new credentials will have different recipient IDs for the same person; past credentials are unaffected. |
| `GCU_WORKSHOP_SALT` | Matches the salt the workshop page's JS uses when computing the claim-form completion hash. | Rotate when cutting a new cohort or invalidating outstanding un-claimed hashes. See below. |

### Generating a signing key (one-time, Phase 1)

Documented in `IMPLEMENTATION-PLAN.md`. Do not re-run unless performing
the rotation ceremony — generating a new key invalidates the issuer's
current identity.

### Generating salts

```
openssl rand -hex 32
```

32 bytes of entropy is overkill for the threat model but costs nothing.
Any string of unpredictable characters works.

## Workshop salt rotation

The workshop salt is a single-use gate at issuance time. It is **never
embedded in issued credentials** and does not affect anything already
signed.

What rotation does:

- New issuance requests using the old hash fail with "Completion hash
  does not match."
- Existing credentials remain fully valid and continue to verify.

What rotation requires:

1. Pick a new salt (`openssl rand -hex 32` or any chosen string).
2. Update the `GCU_WORKSHOP_SALT` repository secret.
3. Update the hardcoded salt in each workshop page's claim-form JS and
   redeploy the workshop pages.
4. Users who still have a valid hash from the old salt should claim
   before the rotation, or be told to revisit the updated workshop page.

Rotate when: you want to invalidate outstanding un-claimed hashes, when
switching to a new cohort, or on suspected salt disclosure to a
non-attendee.

## Running the CLI locally

```
deno task cli issue --name "Ana Costa" --course PB-101 --date 2026-04-19
deno task cli verify credentials/PB-101-ABCDEF.json
deno task cli verify-ledger
deno task cli revoke PB-101-ABCDEF --reason "..."
```

Environment variables required for `issue` and `revoke`:

- `GCU_ISSUER_SIGNING_KEY` — PEM contents (not a path).
- `GCU_CODE_SALT`, `GCU_RECIPIENT_SALT` — the same values as the GH secrets.

`GCU_ENABLE_REKOR=1` turns on Rekor logging if `cosign` is on PATH and an
OIDC identity is available. Leave unset for local dev; emit-cert sets it
automatically in CI.

### Reading the signing key from the PEM file

```
export GCU_ISSUER_SIGNING_KEY="$(cat GCU_ISSUER_SIGNING_KEY.pem)"
```

The PEM file is gitignored. Once uploaded to the GitHub secret, it can
be moved offline (hardware-backed storage or paper + vault).

## Initializing the status list

Only needs to happen once per instance, during Phase 5:

```
deno task init-status-list
```

This creates `status/list-1.json` (empty signed `BitstringStatusListCredential`)
and `status/.next-index` (set to `0`). Refuses to overwrite an existing
list.

## Revoking a credential

Via the GitHub Actions workflow (manual dispatch):
Actions → "Revoke credential" → Run workflow → enter code + reason.

Via CLI (local, with secrets set):

```
deno task cli revoke PB-101-ABCDEF --reason "..."
```

The workflow commits the updated status list and appends to
`status/revocations.jsonl`.

## Verifying validator provenance

The `attest-validator.yml` workflow runs on every push that touches the
validator files (`index.html`, `trust.html`, `validator-bundle.js`,
`qrcodegen-v1.8.0-es6.js`) and produces a signed SLSA Build Provenance
attestation via GitHub's attestation API. A paranoid user can verify a
served file was produced by this repo:

```
gh attestation verify index.html --owner gentropic --repo cert
```

This proves the served bytes came from a specific commit in `gentropic/cert`,
signed by the GitHub Actions runner via Sigstore. It does not prove the
commit is trustworthy — that's an out-of-band audit. SLSA is defense in
depth, not a primary control.

## Status list archival

`archive-status.yml` runs on the 1st of each month (03:13 UTC) and asks
the Internet Archive to snapshot the signed status list, issuer profile,
issuer keys document, and DID document. This is pure liveness insurance
— the signature on the status list already gives integrity regardless
of where the bytes come from.

## What to do if the signing key is compromised

1. Revoke the signing key — generate a new Ed25519 pair (follow the
   Phase 1 procedure).
2. Append the new key to `issuer-keys.json` and `.well-known/did.json`
   as `#key-2` (never remove `#key-1` — past credentials still reference
   it).
3. Update `GCU_ISSUER_SIGNING_KEY` with the new PEM.
4. Update `engine/cli.ts`'s `VERIFICATION_METHOD` constant to point at
   `#key-2`.
5. Consider revoking any credentials that may have been issued with the
   compromised key between compromise and rotation.
6. Announce the rotation publicly so verifiers can audit.

## What to do if a GitHub secret leaks

- `GCU_WORKSHOP_SALT` leak: rotate the salt (see above). Low severity.
- `GCU_CODE_SALT` / `GCU_RECIPIENT_SALT` leak: rotation is optional.
  Either of these leaking doesn't allow forgery (you still need the
  signing key), only reveals how codes/recipient-IDs are derived.
- `GCU_ISSUER_SIGNING_KEY` leak: treat as key compromise (see above).
