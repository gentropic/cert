import type { CourseEntry, CoursesDocument } from "./types.ts";

export async function loadCourses(
  path: string,
  locale = "en",
): Promise<Record<string, CourseEntry>> {
  const text = await Deno.readTextFile(path);
  const doc: CoursesDocument = JSON.parse(text);
  const result: Record<string, CourseEntry> = {};

  for (const [code, c] of Object.entries(doc.courses)) {
    const title = c.title[locale];
    const descBullets = c.desc[locale];
    if (!title || !descBullets) {
      throw new Error(`Course ${code}: missing "${locale}" locale in courses.json`);
    }
    const series = c.series ? doc.series[c.series] : undefined;
    result[code] = {
      name: title,
      description: descBullets.join("; "),
      descBullets,
      hours: c.hours,
      tags: c.tags,
      alignment: c.alignment,
      language: locale,
      series: c.series,
      seriesMeta: series
        ? {
          name: series.name,
          accent: series.pageAccent ?? c.color,
          issuerName: series.issuer,
          issuerLabel: series.issuerTitle?.[locale],
          org: series.org,
        }
        : c.color
        ? { accent: c.color }
        : undefined,
    };
  }

  return result;
}
