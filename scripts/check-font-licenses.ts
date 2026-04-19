#!/usr/bin/env -S deno run --allow-read
// CI gate: every font file in fonts/ must have at least one matching
// license file in licenses/. Prevents accidental commits of unlicensed
// fonts. Match is substring-based on the font family prefix (e.g.
// "IBMPlexSans-Regular.otf" → looks for any license file containing "IBMPlex").
// Exit 0 on success, 1 on any unlicensed font.

import { basename, dirname, fromFileUrl, resolve } from "jsr:@std/path@^1";

const scriptDir = dirname(fromFileUrl(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const fontsDir = resolve(repoRoot, "fonts");
const licensesDir = resolve(repoRoot, "licenses");

// Embed-safe licenses keyed by matcher in license filename. Extend the
// allowlist deliberately — unknown licenses fail closed.
const ALLOWED_LICENSE_PATTERNS = [
  /OFL/i, // SIL Open Font License
  /Apache/i,
  /Ubuntu-Font/i,
];

function fontFamilyName(fontFile: string): string {
  // Strip extension and weight suffix (everything from first hyphen).
  const base = basename(fontFile).replace(/\.(otf|ttf|woff2?)$/i, "");
  return base.split("-")[0];
}

function licensePrefix(licFile: string): string {
  // Strip extension and anything past first hyphen / first dot.
  return basename(licFile).replace(/\..+$/, "").split("-")[0];
}

async function listFiles(dir: string): Promise<string[]> {
  const entries: string[] = [];
  try {
    for await (const ent of Deno.readDir(dir)) {
      if (ent.isFile) entries.push(ent.name);
    }
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) return [];
    throw e;
  }
  return entries;
}

const fontFiles = (await listFiles(fontsDir)).filter((n) => /\.(otf|ttf|woff2?)$/i.test(n));
const licenseFiles = await listFiles(licensesDir);

if (fontFiles.length === 0) {
  console.log("No fonts in fonts/; nothing to check.");
  Deno.exit(0);
}

const problems: string[] = [];
for (const font of fontFiles) {
  const family = fontFamilyName(font);
  const matchingLicense = licenseFiles.find((lic) => family.startsWith(licensePrefix(lic)));
  if (!matchingLicense) {
    problems.push(`${font}: no license file whose name is a prefix of the font family "${family}"`);
    continue;
  }
  const text = await Deno.readTextFile(resolve(licensesDir, matchingLicense));
  const recognized = ALLOWED_LICENSE_PATTERNS.some((p) => p.test(text));
  if (!recognized) {
    problems.push(
      `${font}: license file ${matchingLicense} does not match any known embed-safe license pattern`,
    );
  }
}

if (problems.length > 0) {
  console.error("Font-license check failed:");
  for (const p of problems) console.error(`  • ${p}`);
  Deno.exit(1);
}

console.log(`Font-license check: ${fontFiles.length} font(s) OK`);
