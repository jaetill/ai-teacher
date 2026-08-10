import { describe, it, expect } from "vitest";
import {
  normalizeForMatch,
  evidenceInPassage,
  validateItems,
  balanceAnswerPositions,
  formatItemsAsPlainText,
  buildItemPrompt,
  isItemType,
  ITEM_TYPES,
  type GeneratedItem,
} from "../../src/lib/items";

// Quote-anchored items (#679). The grounding contract is the feature: an item
// whose evidence isn't literally in the passage must never reach a student.

const PASSAGE = `The clerk watched her from behind the counter, saying nothing.
Mitsi kept her eyes on the shelf and counted out the coins twice, though she
had counted them at home. Outside, the wind pushed against the glass. "We
should go," her mother said, and her voice was flat in a way Mitsi had not
heard before.`;

const item = (over: Partial<GeneratedItem> & { evidence: string }) => ({
  type: "inferential",
  question: "What does this suggest?",
  choices: ["a", "b", "c", "d"],
  answerIndex: 0,
  ...over,
});

describe("normalizeForMatch", () => {
  it("folds smart quotes, dashes and whitespace", () => {
    // Passages arrive from Google Docs and .docx, so smart punctuation is the
    // norm — a naive comparison would reject valid quotes.
    expect(normalizeForMatch("“We should go,”")).toBe('"we should go,"');
    expect(normalizeForMatch("a  b\n c")).toBe("a b c");
    expect(normalizeForMatch("don’t")).toBe("don't");
  });
});

describe("evidenceInPassage", () => {
  it("accepts an exact span", () => {
    expect(evidenceInPassage("counted out the coins twice", PASSAGE)).toBe(true);
  });

  it("accepts a span whose punctuation was straightened", () => {
    expect(evidenceInPassage('"We should go," her mother said', PASSAGE)).toBe(true);
  });

  it("rejects a fabricated span", () => {
    // The exact failure mode from the corpus: plausible, well-formed, not there.
    expect(evidenceInPassage("Mitsi's father had already been taken", PASSAGE)).toBe(false);
  });

  it("rejects a span too short to be real support", () => {
    expect(evidenceInPassage("the", PASSAGE)).toBe(false);
  });
});

describe("validateItems", () => {
  it("keeps a well-formed grounded item", () => {
    const r = validateItems([item({ evidence: "her voice was flat" })], PASSAGE);
    expect(r.kept).toHaveLength(1);
    expect(r.dropped).toEqual([]);
  });

  it("drops an item whose evidence is invented, and says why", () => {
    const r = validateItems(
      [item({ evidence: "the soldiers arrived at dawn", question: "Who arrived?" })],
      PASSAGE,
    );
    expect(r.kept).toEqual([]);
    expect(r.dropped[0].reason).toMatch(/not in the passage/i);
    expect(r.dropped[0].question).toBe("Who arrived?");
  });

  it("drops an item with no evidence at all", () => {
    const r = validateItems(
      [{ question: "Why?", choices: ["a", "b", "c"], answerIndex: 0 }],
      PASSAGE,
    );
    expect(r.kept).toEqual([]);
    expect(r.dropped[0].reason).toMatch(/no supporting quote/i);
  });

  it("drops a multiple-choice item with an out-of-range answer", () => {
    const r = validateItems([item({ evidence: "her voice was flat", answerIndex: 9 })], PASSAGE);
    expect(r.kept).toEqual([]);
    expect(r.dropped[0].reason).toMatch(/no valid correct answer/i);
  });

  it("drops a multiple-choice item with too few choices", () => {
    const r = validateItems(
      [item({ evidence: "her voice was flat", choices: ["a", "b"], answerIndex: 0 })],
      PASSAGE,
    );
    expect(r.dropped[0].reason).toMatch(/too few/i);
  });

  it("keeps a short-answer item with a model answer and no choices", () => {
    const r = validateItems(
      [
        {
          type: "tone",
          question: "Describe the mother's tone.",
          evidence: "her voice was flat",
          answer: "Withdrawn or resigned.",
        },
      ],
      PASSAGE,
    );
    expect(r.kept).toHaveLength(1);
    expect(r.kept[0].answerIndex).toBeNull();
    expect(r.kept[0].answer).toBe("Withdrawn or resigned.");
  });

  it("drops a short-answer item with no model answer", () => {
    const r = validateItems(
      [{ type: "tone", question: "Tone?", evidence: "her voice was flat" }],
      PASSAGE,
    );
    expect(r.dropped[0].reason).toMatch(/no model answer/i);
  });

  it("falls back to comprehension for an unknown type rather than dropping", () => {
    const r = validateItems(
      [{ ...item({ evidence: "her voice was flat" }), type: "vibes" }],
      PASSAGE,
    );
    expect(r.kept[0].type).toBe("comprehension");
  });

  it("survives junk input", () => {
    expect(validateItems(null, PASSAGE).kept).toEqual([]);
    expect(validateItems("nope", PASSAGE).kept).toEqual([]);
    expect(validateItems([null, 3, "x"], PASSAGE).kept).toEqual([]);
  });
});

describe("balanceAnswerPositions", () => {
  it("spreads correct answers instead of leaving them all at A", () => {
    // Copilot shipped her an eight-item quiz keyed A,A,A,A,A,A,A,A.
    const items = Array.from({ length: 4 }, () =>
      item({ evidence: "her voice was flat" }),
    ) as GeneratedItem[];
    const out = balanceAnswerPositions(items);
    expect(out.map((i) => i.answerIndex)).toEqual([0, 1, 2, 3]);
  });

  it("keeps the correct choice correct after moving it", () => {
    const items = [item({ evidence: "her voice was flat", choices: ["w", "x", "y", "z"] })];
    const out = balanceAnswerPositions(items as GeneratedItem[]);
    expect(out[0].choices[out[0].answerIndex!]).toBe("w");
  });

  it("leaves short-answer items alone", () => {
    const items: GeneratedItem[] = [
      {
        type: "tone",
        question: "Tone?",
        choices: [],
        answerIndex: null,
        answer: "Flat.",
        evidence: "her voice was flat",
      },
    ];
    expect(balanceAnswerPositions(items)).toEqual(items);
  });
});

describe("formatItemsAsPlainText", () => {
  const items = validateItems(
    [
      item({ evidence: "her voice was flat", question: "What changed?" }),
      {
        type: "tone",
        question: "Describe the tone.",
        answer: "Subdued.",
        evidence: "counted out the coins twice",
      },
    ],
    PASSAGE,
  ).kept;

  it("numbers questions and letters choices", () => {
    const out = formatItemsAsPlainText(items);
    expect(out).toContain("1. What changed?");
    expect(out).toContain("   A. a");
  });

  it("prints an answer key that carries the evidence", () => {
    const out = formatItemsAsPlainText(items);
    expect(out).toContain("ANSWER KEY");
    expect(out).toContain('Evidence: "her voice was flat"');
  });

  it("can omit the key for a student-facing copy", () => {
    expect(formatItemsAsPlainText(items, { includeKey: false })).not.toContain("ANSWER KEY");
  });

  it("contains no markdown or widget markup — it is paste-ready", () => {
    const out = formatItemsAsPlainText(items);
    expect(out).not.toMatch(/[*_#`]/);
  });
});

describe("buildItemPrompt", () => {
  it("embeds the passage and forbids outside knowledge", () => {
    const { system, user } = buildItemPrompt({
      passage: PASSAGE,
      types: ["inferential", "tone"],
      count: 5,
      format: "multiple_choice",
      grade: 7,
    });
    expect(user).toContain("counted out the coins twice");
    expect(system).toMatch(/ONLY SOURCE/);
    expect(system).toMatch(/do not invent page numbers/i);
    expect(system).toContain("grade 7");
  });

  it("includes guidance only for the requested types", () => {
    const { system } = buildItemPrompt({
      passage: PASSAGE,
      types: ["context_clue"],
      count: 3,
      format: "short_answer",
    });
    expect(system).toContain("context_clue");
    expect(system).not.toContain("main_idea");
  });

  it("asks for choices only in multiple-choice mode", () => {
    const mc = buildItemPrompt({
      passage: PASSAGE,
      types: ["tone"],
      count: 1,
      format: "multiple_choice",
    });
    const sa = buildItemPrompt({
      passage: PASSAGE,
      types: ["tone"],
      count: 1,
      format: "short_answer",
    });
    expect(mc.system).toContain("choices");
    expect(sa.system).not.toContain('"choices"');
  });
});

describe("isItemType", () => {
  it("accepts every declared type and rejects others", () => {
    for (const t of ITEM_TYPES) expect(isItemType(t.value)).toBe(true);
    expect(isItemType("essay")).toBe(false);
    expect(isItemType(null)).toBe(false);
  });
});
