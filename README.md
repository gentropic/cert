# gentropic/cert

Open Badges v3 / W3C Verifiable Credentials issuer for the Geoscientific Chaos Union (GCU). Serves at `https://gentropic.org/cert/` via GitHub Pages. Issuer identity: `did:web:gentropic.org`.

Status: pre-v1 scaffolding. See [`docs/IMPLEMENTATION-PLAN.md`](docs/IMPLEMENTATION-PLAN.md) for build phases and [`docs/SPEC-v1.md`](docs/SPEC-v1.md) for the full design.

## Verify a credential

Once v1 ships, every issued certificate will carry a QR code pointing to the validator at `https://gentropic.org/cert/#v={code}&n={name}`. The validator runs entirely in-browser: Ed25519 signature check via Web Crypto, StatusList2021 revocation bit, OpenTimestamps Bitcoin-anchor status, and public ledger membership. Signed JSON and `.ots` receipts are downloadable for independent verification via third-party tools.

## Repository layout

The repo is served by GitHub Pages from the root, so the repo root *is* the site root at `https://gentropic.org/cert/`.

- `docs/` — spec and implementation plan (not served as documentation; reference material)
- `engine/` — Deno/TypeScript signing pipeline, shared between the CLI and GitHub Actions
- `policies/` — issuance policy documents (plain-language trust model)
- `scripts/` — build helpers and one-off utilities
- Root-served artifacts (populated across phases): `index.html`, `trust.html`, `issuer.json`, `issuer-keys.json`, `courses.json`, `credentials/`, `endorsements/`, `achievements/`, `status/`, `ledger.jsonl`, `fonts/`, `licenses/`

## License

The repository-wide `LICENSE` file is CC0 1.0. Code-specific relicensing to MIT for `engine/` and `scripts/` is planned per the implementation plan's Phase 0 note.
