import type { Alignment, CoursesDocument } from "./types.ts";

export interface BuildAchievementsOptions {
  coursesPath: string;
  baseUrl: string;
  outputDir: string;
  locale?: string;
}

export interface Achievement {
  "@context": string[];
  id: string;
  type: string[];
  name: string;
  description: string;
  criteria: { narrative: string };
  creditsAvailable: number;
  inLanguage: string;
  tag?: string[];
  alignment?: Alignment[];
  "@note_cpd"?: string;
}

// Spec §5.2 CPD disclaimer — non-claimant phrasing so GCU doesn't assert CPD compliance.
const CPD_NOTE =
  "Workshops may be eligible for Continuing Professional Development (CPD) hours under relevant professional society frameworks (e.g., AusIMM Category 1 — Formal Learning) subject to member self-assessment and society audit.";

export async function buildAchievements(opts: BuildAchievementsOptions): Promise<string[]> {
  const locale = opts.locale ?? "en";
  const text = await Deno.readTextFile(opts.coursesPath);
  const doc: CoursesDocument = JSON.parse(text);

  await Deno.mkdir(opts.outputDir, { recursive: true });
  const written: string[] = [];

  for (const [code, c] of Object.entries(doc.courses)) {
    const title = c.title[locale];
    const descBullets = c.desc[locale];
    if (!title || !descBullets) {
      throw new Error(`Course ${code}: missing "${locale}" locale`);
    }

    const achievement: Achievement = {
      "@context": [
        "https://www.w3.org/ns/credentials/v2",
        "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json",
      ],
      id: `${opts.baseUrl}/achievements/${code}.json`,
      type: ["Achievement"],
      name: title,
      description: descBullets.join("; "),
      criteria: {
        narrative:
          `Attend the full ${c.hours}-hour ${title} and complete the in-workshop exercises. Completion is verified via a workshop-session hash.`,
      },
      creditsAvailable: c.hours,
      inLanguage: locale,
      tag: c.tags,
      alignment: c.alignment,
      "@note_cpd": CPD_NOTE,
    };

    const path = `${opts.outputDir}/${code}.json`;
    await Deno.writeTextFile(path, JSON.stringify(achievement, null, 2) + "\n");
    written.push(path);
  }

  return written;
}
