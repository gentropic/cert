#!/usr/bin/env -S deno run --allow-read --allow-write
import { dirname, fromFileUrl, resolve } from "jsr:@std/path@^1";
import { buildAchievements } from "../engine/src/achievement.ts";

const scriptDir = dirname(fromFileUrl(import.meta.url));
const repoRoot = resolve(scriptDir, "..");

const written = await buildAchievements({
  coursesPath: resolve(repoRoot, "courses.json"),
  baseUrl: "https://gentropic.org/cert",
  outputDir: resolve(repoRoot, "achievements"),
});

console.log(`Wrote ${written.length} achievement files under ${resolve(repoRoot, "achievements")}:`);
for (const p of written) console.log(`  ${p}`);
