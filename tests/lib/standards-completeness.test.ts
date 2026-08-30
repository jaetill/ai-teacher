import { describe, it, expect } from "vitest";
import { grade8Standards, MISLABELLED_IDS } from "@/db/seed-standards";
import { grade6Standards, grade7Standards } from "@/db/seed-standards-6-7";

// Why this file exists
// ────────────────────
// Grade 8 shipped from an IXL skill plan instead of the VDOE document. Nothing
// caught it for months, because nothing could: the seed ran without error, the
// row count looked plausible, and every description was a grammatical English
// sentence. It surfaced only when a teacher compared the app against her own
// SOL side-by-side and found 8.W.1.d missing.
//
// Three independent checks, because the failure had three shapes and a single
// check would have caught only one:
//
//   ROSTER      — the exact code list, transcribed by hand from the document's
//                 own headings. Catches a standard going missing (8.W.1.D) and
//                 a standard being invented (8.C.1.B).
//   PARAPHRASE  — descriptions that are too short to be the real text. Catches
//                 a summarised import, which the roster check cannot see
//                 because the codes are all present and correct.
//   SHAPE       — every subcategory runs A, B, C… with no gaps. Catches a
//                 truncated transcription mid-strand.

// ── ROSTER ───
// VA SOL 2024, Grade 8 English (March 2024), pp. 67-74. Transcribed from the
// document headings, NOT from the seed — the point is to disagree with the
// seed when the seed is wrong.
const EXPECTED_GRADE_8 = [
  "8.DSR.A",
  "8.DSR.B",
  "8.DSR.C",
  "8.DSR.D",
  "8.DSR.E",
  "8.RV.1.A",
  "8.RV.1.B",
  "8.RV.1.C",
  "8.RV.1.D",
  "8.RV.1.E",
  "8.RV.1.F",
  "8.RV.1.G",
  "8.RV.1.H",
  "8.RL.1.A",
  "8.RL.1.B",
  "8.RL.1.C",
  "8.RL.2.A",
  "8.RL.2.B",
  "8.RL.2.C",
  "8.RL.2.D",
  "8.RL.3.A",
  "8.RL.3.B",
  "8.RL.3.C",
  "8.RI.1.A",
  "8.RI.1.B",
  "8.RI.1.C",
  "8.RI.2.A",
  "8.RI.2.B",
  "8.RI.2.C",
  "8.RI.3.A",
  "8.RI.3.B",
  "8.W.1.A",
  "8.W.1.B",
  "8.W.1.C",
  "8.W.1.D",
  "8.W.2.A",
  "8.W.3.A",
  "8.W.3.B",
  "8.LU.1.A",
  "8.LU.1.B",
  "8.LU.1.C",
  "8.LU.1.D",
  "8.LU.1.E",
  "8.LU.2.A",
  "8.LU.2.B",
  "8.LU.2.C",
  "8.LU.2.D",
  "8.C.1.A",
  "8.C.2.A",
  "8.C.3.A",
  "8.C.3.B",
  "8.C.4.A",
  "8.C.4.B",
  "8.C.4.C",
  "8.R.1.A",
  "8.R.1.B",
  "8.R.1.C",
  "8.R.1.D",
  "8.R.1.E",
  "8.R.1.F",
  "8.R.1.G",
];

describe("VA SOL 2024 Grade 8 — roster", () => {
  it("has every standard the document lists, and no others", () => {
    const actual = grade8Standards.map((s) => s.id).sort();
    expect(actual).toEqual([...EXPECTED_GRADE_8].sort());
  });

  it("is 61 standards, the same count as grade 6", () => {
    // Grades 6, 7 and 8 carry near-identical structure. 40 was the number that
    // should have looked wrong and did not.
    expect(grade8Standards).toHaveLength(61);
  });

  it("names 8.W.1.D specifically", () => {
    // The one a teacher found by hand. Named so a future regression fails with
    // a message that says what happened rather than "array mismatch".
    const w1d = grade8Standards.find((s) => s.id === "8.W.1.D");
    expect(w1d, "8.W.1.D went missing again").toBeDefined();
    expect(w1d?.description).toMatch(/write reflectively in response to reading/i);
  });

  it("does not reintroduce the invented 8.C.1.B", () => {
    const ids = grade8Standards.map((s) => s.id);
    for (const bad of MISLABELLED_IDS) {
      expect(ids, `${bad} is not a VA SOL standard`).not.toContain(bad);
    }
  });

  it("has no duplicate ids", () => {
    const ids = grade8Standards.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ── PARAPHRASE ───
describe("VA SOL 2024 Grade 8 — verbatim text", () => {
  // Length alone cannot judge one standard: the real document runs from 57
  // characters ("Consult reference materials to check and correct spelling.")
  // past 1,000 for the ones with nested sub-items.
  // A per-item floor at the paraphrase ceiling flags a dozen
  // genuinely terse real standards, so the signal has to be distributional.
  // The IXL import was uniformly short — every one of its 40 descriptions fell
  // under 120 characters. Real grade 8 has 10 of 61 under that.
  const SUMMARY_CEILING = 120;

  it("is not uniformly short the way a skill plan is", () => {
    const short = grade8Standards.filter((s) => s.description.length < SUMMARY_CEILING);
    const ratio = short.length / grade8Standards.length;
    // IXL: 1.00. VDOE: ~0.16. Anything past half means a summarised import.
    expect(
      ratio,
      `${short.length}/${grade8Standards.length} descriptions are under ${SUMMARY_CEILING} chars — this looks paraphrased`,
    ).toBeLessThan(0.5);
  });

  it("averages closer to the document than to a skill plan", () => {
    const avg =
      grade8Standards.reduce((n, s) => n + s.description.length, 0) / grade8Standards.length;
    // IXL import was 68. The document is ~175 for the sibling grades.
    expect(Math.round(avg)).toBeGreaterThan(140);
  });

  it("has no stub descriptions", () => {
    // Deliberately loose. Several real standards are one short sentence
    // ("Consult reference materials to check and correct spelling."), so this
    // floor only catches a placeholder or a truncation mid-sentence — the
    // distribution and average checks above are what detect summarising.
    const stubs = grade8Standards
      .filter((s) => s.description.length < 40)
      .map((s) => `${s.id} (${s.description.length}): ${s.description}`);
    expect(stubs).toEqual([]);
  });

  it("ends every description as a complete sentence", () => {
    // A truncated transcription tends to stop mid-clause. Cheap, and
    // independent of length.
    const unterminated = grade8Standards
      .filter((s) => !/[.)]$/.test(s.description.trim()))
      .map((s) => `${s.id}: …${s.description.slice(-40)}`);
    expect(unterminated).toEqual([]);
  });

  it("keeps the nested sub-items on the standards that have them", () => {
    // 8.W.2.A, 8.C.1.A, 8.C.2.A and 8.C.3.A are single indicators containing
    // enumerated sub-items. Dropping them was the single biggest content loss
    // in the IXL version — 8.W.2 vanished entirely.
    for (const id of ["8.W.2.A", "8.C.1.A", "8.C.2.A", "8.C.3.A"]) {
      const std = grade8Standards.find((s) => s.id === id);
      expect(std?.description, `${id} lost its sub-items`).toMatch(/\bi\.\s/);
    }
  });
});

// ── SHAPE ───
describe("VA SOL 2024 Grade 8 — structure", () => {
  it("runs each subcategory's indicators consecutively from A", () => {
    // A truncated transcription stops partway through a strand, which shows up
    // as a gap or a short tail. This is the check that would have caught the
    // original bug without anyone knowing the correct roster: W stopped at C,
    // R and LU and C stopped at B.
    const groups = new Map<string, string[]>();
    for (const s of grade8Standards) {
      const key = `${s.strandCode}${s.subcategory ? `.${s.subcategory}` : ""}`;
      groups.set(key, [...(groups.get(key) ?? []), s.indicator]);
    }

    for (const [key, indicators] of groups) {
      const sorted = [...indicators].sort();
      const expected = sorted.map((_, i) => String.fromCharCode(65 + i));
      expect(sorted, `${key} has a gap or a duplicate in its indicators`).toEqual(expected);
    }
  });

  it("stamps every standard with the framework and grade", () => {
    for (const s of grade8Standards) {
      expect(s.grade).toBe(8);
      expect(s.id.startsWith("8.")).toBe(true);
      expect(s.strandName.length).toBeGreaterThan(0);
    }
  });

  it("gives every strand code a single consistent name", () => {
    const byCode = new Map<string, Set<string>>();
    for (const s of grade8Standards) {
      byCode.set(s.strandCode, (byCode.get(s.strandCode) ?? new Set()).add(s.strandName));
    }
    for (const [code, names] of byCode) {
      expect([...names], `${code} has more than one strand name`).toHaveLength(1);
    }
  });
});

// ── Grades 6 and 7 ───
// Audited against the VDOE documents on 2026-08-30 and found correct: both
// rosters match the document exactly and the text is verbatim (6.W.1.A and
// 7.W.1.A match character for character). Pinned here so a future edit to
// seed-standards-6-7.ts cannot quietly repeat what happened to grade 8.
describe("VA SOL 2024 Grades 6 and 7", () => {
  // Per-strand counts read off the documents:
  //   Grade 6 (pp. 53-59): DSR 5, RV 8, RL 10 (5+3+2), RI 8, W 7, LU 9, C 7, R 7 = 61
  //   Grade 7 (pp. 60-66): DSR 5, RV 8, RL 8 (3+3+2), RI 8, W 7, LU 9, C 8, R 7 = 60
  const SHAPES = [
    {
      grade: 6,
      data: grade6Standards,
      total: 61,
      strands: { DSR: 5, RV: 8, RL: 10, RI: 8, W: 7, LU: 9, C: 7, R: 7 },
    },
    {
      grade: 7,
      data: grade7Standards,
      total: 60,
      strands: { DSR: 5, RV: 8, RL: 8, RI: 8, W: 7, LU: 9, C: 8, R: 7 },
    },
  ] as const;

  for (const { grade, data, total, strands } of SHAPES) {
    it(`grade ${grade} has all ${total} standards, by strand`, () => {
      expect(data).toHaveLength(total);
      const counts: Record<string, number> = {};
      for (const s of data) counts[s.strandCode] = (counts[s.strandCode] ?? 0) + 1;
      expect(counts).toEqual(strands);
    });

    it(`grade ${grade} runs each subcategory's indicators consecutively from A`, () => {
      const groups = new Map<string, string[]>();
      for (const s of data) {
        const key = `${s.strandCode}${s.subcategory ? `.${s.subcategory}` : ""}`;
        groups.set(key, [...(groups.get(key) ?? []), s.indicator]);
      }
      for (const [key, indicators] of groups) {
        const sorted = [...indicators].sort();
        expect(sorted, `${grade}.${key} has a gap`).toEqual(
          sorted.map((_, i) => String.fromCharCode(65 + i)),
        );
      }
    });

    it(`grade ${grade} still reads as the document, not a summary`, () => {
      const short = data.filter((s) => s.description.length < 120).length;
      expect(short / data.length).toBeLessThan(0.5);
      const avg = data.reduce((n, s) => n + s.description.length, 0) / data.length;
      expect(Math.round(avg)).toBeGreaterThan(140);
    });

    it(`grade ${grade} keeps 1.d of the writing strand`, () => {
      // The indicator whose absence in grade 8 started all of this.
      const w1d = data.find((s) => s.id === `${grade}.W.1.D`);
      expect(w1d, `${grade}.W.1.D is missing`).toBeDefined();
      expect(w1d?.description).toMatch(/write reflectively/i);
    });
  }
});
