#!/usr/bin/env -S deno run --allow-read --allow-write
// Render a sample certificate PDF for a course in courses.json, for visual
// review during development. Does not sign or persist anything — just writes
// one PDF to stdout or a path.
// Usage: deno task sample-pdf [COURSE] [OUTFILE]
//   e.g. deno task sample-pdf PB-101 sample.pdf

import { dirname, fromFileUrl, resolve } from "jsr:@std/path@^1";
import { loadCourses } from "../engine/src/courses.ts";
import { loadPlexFonts, renderCertificatePdf } from "../engine/src/pdf.ts";

const courseKey = Deno.args[0] ?? "PB-101";
const outFile = Deno.args[1] ?? `sample-${courseKey}.pdf`;

const scriptDir = dirname(fromFileUrl(import.meta.url));
const repoRoot = resolve(scriptDir, "..");

const courses = await loadCourses(resolve(repoRoot, "courses.json"));
const course = courses[courseKey];
if (!course) {
  console.error(`Unknown course: ${courseKey}. Available: ${Object.keys(courses).join(", ")}`);
  Deno.exit(2);
}

const fonts = await loadPlexFonts(resolve(repoRoot, "fonts"));
const bytes = await renderCertificatePdf({
  fonts,
  recipientName: "Jéssica Fernanda Bastos da Matta",
  courseName: course.name,
  courseCode: courseKey,
  credentialCode: `${courseKey}-EF47A9`,
  dateIso: "2026-02-23T00:00:00Z",
  hours: course.hours,
  topics: course.descBullets,
  issuerName: course.seriesMeta?.issuerName ?? "Geoscientific Chaos Union",
  issuerLabel: course.seriesMeta?.issuerLabel,
  orgName: course.seriesMeta?.org,
  seriesName: course.seriesMeta?.name,
  validatorUrl: `https://gentropic.org/cert/#v=${courseKey}-EF47A9&n=J%C3%A9ssica%20Fernanda%20Bastos%20da%20Matta`,
  accentColor: course.seriesMeta?.accent,
});

await Deno.writeFile(outFile, bytes);
console.log(`Wrote ${outFile} (${(bytes.length / 1024).toFixed(1)} KB)`);
