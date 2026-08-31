// Aligns Heidi's grade-8 curriculum against the 21 standards that did not
// exist until the VDOE rebuild (see src/db/seed-standards.ts).
//
// Run with:  npx tsx scripts/realign-grade8.ts --dry-run
//            npx tsx scripts/realign-grade8.ts --apply
//
// ── Why this is needed ───
//
// Her alignment was made from an IXL-derived standard set: 40 paraphrased
// descriptions and 21 standards missing outright. Every unit and lesson has
// standards, so nothing looks broken — but 8.W.1.D, all of 8.W.2 (the writing
// process), all of 8.W.3 (revision and editing) and most of Language Usage,
// Research and Communication have zero alignment. Not because she does not
// teach them; because they were not in the menu.
//
// /api/units/[id]/infer-standards cannot fix this: it builds its candidate
// list from unit_standards, so a lesson can only ever be mapped to a standard
// its unit already carries. The gap has to be closed at the unit level first.
//
// ── What it does, and does not, do ───
//
// Additive only. Every insert is onConflictDoNothing, so nothing Heidi or a
// previous pass chose is removed or rewritten. The worst case is an extra tag,
// never a lost one.
//
// The two grade-8 courses hold the same five units (two school years). Each
// title is analysed ONCE and the result applied to both rows, so the years
// cannot drift apart on separate model guesses.
//
// The prompt is deliberately biased toward saying no. A coverage map that
// claims a standard she does not teach is worse than one with a gap: the gap
// is visible, the false claim is not, and she may hand the report to an
// administrator.

import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";
import Anthropic from "@anthropic-ai/sdk";

const sql = neon(process.env.DATABASE_URL!);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const MODEL = "claude-sonnet-4-6"; // MODELS.structured
const COVERAGE = ["introduces", "teaches", "reinforces", "assesses"] as const;
// Guarded to parity with COVERAGE. The column has no CHECK constraint, so a
// default fallback alone would let arbitrary model-supplied text through into
// a field the editor renders.
const EMPHASIS = ["primary", "secondary", "supporting"] as const;

type Proposal = {
  unitStandards: { id: string; emphasis: string; why: string }[];
  lessons: { sortOrder: number; standards: { id: string; coverageType: string }[] }[];
};

function parseJson(text: string): Proposal | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced ? fenced[1] : text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as Proposal;
  } catch {
    return null;
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  if (!apply && !process.argv.includes("--dry-run")) {
    console.error("Pass --dry-run to preview or --apply to write.");
    process.exit(1);
  }

  const allStandards = await sql`
    select id, description, strand_code, strand_name
    from standards where grade = 8 order by id`;
  const validIds = new Set(allStandards.map((s) => s.id as string));
  const menu = allStandards.map((s) => `${s.id} — ${s.description}`).join("\n");

  const units = await sql`
    select u.id, u.title, u.quarter, u.summary, u.essential_questions, u.anchor_texts
    from units u join courses c on c.id = u.course_id
    where c.grade = 8 order by u.title, u.id`;

  // Same title = same unit taught in a different school year.
  const groups = new Map<string, typeof units>();
  for (const u of units) {
    groups.set(u.title as string, [...(groups.get(u.title as string) ?? []), u]);
  }

  console.log(`${units.length} grade-8 unit rows in ${groups.size} distinct units.\n`);

  let addedUnit = 0;
  let addedLesson = 0;

  for (const [title, rows] of groups) {
    const rep = rows[0];
    const lessons = await sql`
      select id, sort_order, title, objectives from lessons
      where unit_id = ${rep.id} order by sort_order`;
    const existing = await sql`
      select standard_id from unit_standards where unit_id = ${rep.id}`;
    const have = new Set(existing.map((r) => r.standard_id as string));

    console.log(`── ${title}`);
    console.log(
      `   ${rows.length} copies, ${lessons.length} lessons, ${have.size} standards already`,
    );

    const prompt = `You are auditing one unit of a Virginia grade-8 English curriculum against the full VA SOL 2024 grade-8 standard set.

The unit was originally aligned against an incomplete standard list, so standards it genuinely covers may be unmapped. Your job is to find those — and only those.

UNIT: ${title}
Quarter: ${rep.quarter ?? "—"}
Summary: ${rep.summary ?? "—"}
Essential questions: ${rep.essential_questions ?? "—"}
Anchor texts: ${rep.anchor_texts ?? "—"}

LESSONS:
${lessons.map((l) => `${l.sort_order}. "${l.title}"${(l.objectives as string[] | null)?.length ? `\n   Objectives: ${(l.objectives as string[]).join("; ")}` : ""}`).join("\n")}

ALREADY ALIGNED (do not repeat): ${[...have].sort().join(", ") || "none"}

FULL GRADE-8 STANDARD SET:
${menu}

Propose ONLY standards that are not already aligned and that the lesson titles and objectives give you real evidence for. This is the rule that matters: a coverage map claiming a standard she does not teach is worse than one with a gap, because the gap is visible and the false claim is not. If the evidence is thin, leave it out. Returning an empty list is a correct answer.

For each unit-level standard you propose, "why" must name the specific lesson(s) that evidence it. Then map that standard to those lessons.

coverageType is one of: ${COVERAGE.join(", ")}.

Return ONLY JSON:
{"unitStandards":[{"id":"8.W.2.A","emphasis":"primary","why":"lessons 6 and 9 are the drafting and revision sequence"}],
 "lessons":[{"sortOrder":6,"standards":[{"id":"8.W.2.A","coverageType":"teaches"}]}]}`;

    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 8000,
      messages: [{ role: "user", content: prompt }],
    });

    const text = res.content.map((b) => ("text" in b ? b.text : "")).join("");
    const parsed = parseJson(text);
    if (!parsed) {
      console.log("   !! could not parse a proposal; skipping this unit\n");
      continue;
    }

    // Never trust the model with an id. A hallucinated standard would be a
    // foreign-key error at best and a fabricated alignment at worst.
    const proposedUnit = (parsed.unitStandards ?? []).filter(
      (s) => validIds.has(s.id) && !have.has(s.id),
    );
    const dropped = (parsed.unitStandards ?? []).length - proposedUnit.length;
    if (dropped > 0)
      console.log(`   (${dropped} proposal(s) rejected: unknown id or already aligned)`);

    for (const s of proposedUnit) console.log(`   + ${s.id} — ${s.why}`);
    if (proposedUnit.length === 0) console.log("   + nothing to add");

    const bySort = new Map(lessons.map((l) => [Number(l.sort_order), l.id as string]));
    const proposedLesson: { lessonSort: number; id: string; coverage: string }[] = [];
    for (const l of parsed.lessons ?? []) {
      for (const s of l.standards ?? []) {
        if (!validIds.has(s.id)) continue;
        if (!bySort.has(Number(l.sortOrder))) continue;
        proposedLesson.push({
          lessonSort: Number(l.sortOrder),
          id: s.id,
          coverage: COVERAGE.includes(s.coverageType as (typeof COVERAGE)[number])
            ? s.coverageType
            : "teaches",
        });
      }
    }
    console.log(`   ${proposedLesson.length} lesson mapping(s) proposed`);

    if (!apply) {
      console.log("");
      continue;
    }

    // Apply to every copy of this unit, so the two school years stay identical.
    for (const row of rows) {
      for (const s of proposedUnit) {
        const emphasis = EMPHASIS.includes(s.emphasis as (typeof EMPHASIS)[number])
          ? s.emphasis
          : "primary";
        await sql`insert into unit_standards (unit_id, standard_id, emphasis)
                  values (${row.id}, ${s.id}, ${emphasis})
                  on conflict do nothing`;
        addedUnit++;
      }
      const rowLessons = await sql`
        select id, sort_order from lessons where unit_id = ${row.id}`;
      const rowBySort = new Map(rowLessons.map((l) => [Number(l.sort_order), l.id as string]));
      for (const m of proposedLesson) {
        const lessonId = rowBySort.get(m.lessonSort);
        if (!lessonId) continue;
        await sql`insert into lesson_standards (lesson_id, standard_id, coverage_type)
                  values (${lessonId}, ${m.id}, ${m.coverage})
                  on conflict do nothing`;
        addedLesson++;
      }
    }
    console.log("");
  }

  if (apply) {
    console.log(
      `Applied: ${addedUnit} unit rows, ${addedLesson} lesson rows (duplicates ignored).`,
    );
  } else {
    console.log("Dry run. Nothing written.");
  }
}

main().catch((err) => {
  console.error("Realign failed:", err);
  process.exit(1);
});
