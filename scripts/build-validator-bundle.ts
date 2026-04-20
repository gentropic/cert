#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env --allow-net --allow-run
// Bundle engine/browser.ts + all transitive deps (including JSON-LD contexts
// via "json" loader) into a single ESM file the browser validator imports
// directly: ./validator-bundle.js. Run after any engine source change that
// touches browser-facing code.

import * as esbuild from "npm:esbuild@^0.25";
import { denoPlugins } from "jsr:@luca/esbuild-deno-loader@^0.11";
import { dirname, fromFileUrl, resolve, toFileUrl } from "jsr:@std/path@^1";

const scriptDir = dirname(fromFileUrl(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const entryPoint = toFileUrl(resolve(repoRoot, "engine", "browser.ts")).href;
const outfile = resolve(repoRoot, "validator-bundle.js");
const configPath = resolve(repoRoot, "deno.json");

const result = await esbuild.build({
  plugins: [...denoPlugins({ configPath })],
  entryPoints: [entryPoint],
  outfile,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2022"],
  minify: true,
  metafile: true,
});

esbuild.stop();

const sizeKb = (await Deno.stat(outfile)).size / 1024;
console.log(`Wrote ${outfile} (${sizeKb.toFixed(1)} KB)`);

if (result.warnings.length > 0) {
  console.warn(`${result.warnings.length} warning(s):`);
  for (const w of result.warnings) console.warn(`  ${w.text}`);
}
