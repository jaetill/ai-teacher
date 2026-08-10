// Quote-anchored item writing (#679) — questions built FROM a passage, never
// from the model's memory of a book.
//
// Why this shape. Across Heidi's Copilot corpus the same failure repeats: asked
// for questions "from chapters 13-16," the model invents plot events, invents
// quotes, and invents page numbers, all fluently. She catches fabrications in
// novels she knows well and misses invented citations she can't check. Her own
// workaround, developed over the year, was to stop asking by chapter and start
// pasting one exact quote and naming the item type she wanted from it.
//
// This module productises that workaround, and makes the grounding mechanical
// rather than a promise: every generated item must carry an `evidence` span,
// and validateItems() drops any item whose evidence is not literally present in
// the passage. A hallucinated item cannot survive the check, because there is
// nothing in the source to match it against.
//
// Pure functions only — no I/O, no DB, no network. The route composes them.

/** The item types Heidi names herself, in her words. */
export type ItemType = "context_clue" | "inferential" | "tone" | "comprehension" | "main_idea";

export type ItemFormat = "multiple_choice" | "short_answer";

export const ITEM_TYPES: { value: ItemType; label: string; guidance: string }[] = [
  {
    value: "context_clue",
    label: "Context clues",
    guidance:
      "Target one challenging word that appears in the passage. The surrounding sentences must contain enough signal to infer the meaning.",
  },
  {
    value: "inferential",
    label: "Inferential",
    guidance:
      "Require the student to conclude something the passage implies but does not state outright. The support must still be in the passage.",
  },
  {
    value: "tone",
    label: "Tone",
    guidance:
      "Ask about the author's or a character's attitude, anchored to specific word choices in the passage.",
  },
  {
    value: "comprehension",
    label: "Comprehension",
    guidance: "Ask about something the passage states directly.",
  },
  {
    value: "main_idea",
    label: "Main idea",
    guidance:
      "Ask what the passage is mostly about, or which statement best captures its central point.",
  },
];

const TYPE_LABEL = new Map(ITEM_TYPES.map((t) => [t.value, t.label]));
export const isItemType = (v: unknown): v is ItemType =>
  typeof v === "string" && TYPE_LABEL.has(v as ItemType);

export const MIN_PASSAGE = 120;
export const MAX_PASSAGE = 12_000;
export const MAX_ITEMS = 15;

export type GeneratedItem = {
  type: ItemType;
  question: string;
  /** Multiple-choice options; empty for short answer. */
  choices: string[];
  /** Index into choices; null for short answer. */
  answerIndex: number | null;
  /** Model answer for short-answer items. */
  answer: string | null;
  /** The span from the passage that supports the item — the grounding anchor. */
  evidence: string;
};

/**
 * Normalise for comparison: collapse whitespace, unify the quote and dash
 * characters word processors introduce, and lowercase. Heidi's passages come
 * from Google Docs and .docx, so smart quotes are the norm, not the exception —
 * without this the evidence check would reject valid quotes.
 */
export function normalizeForMatch(s: string): string {
  return s
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Is this evidence span actually in the passage? */
export function evidenceInPassage(evidence: string, passage: string): boolean {
  const e = normalizeForMatch(evidence);
  if (e.length < 8) return false; // too short to be meaningful support
  return normalizeForMatch(passage).includes(e);
}

export type ValidationResult = {
  kept: GeneratedItem[];
  /** Items rejected, with the reason — surfaced to the teacher, not hidden. */
  dropped: { question: string; reason: string }[];
};

/**
 * Enforce the grounding contract. This is the whole point of the feature: an
 * item whose evidence is not in the passage is discarded, so a fabricated quote
 * can never reach her students. Malformed items are dropped for the same
 * reason — a multiple-choice item with no correct answer is worse than no item.
 */
export function validateItems(raw: unknown, passage: string): ValidationResult {
  const kept: GeneratedItem[] = [];
  const dropped: { question: string; reason: string }[] = [];
  if (!Array.isArray(raw)) return { kept, dropped };

  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;

    const question = typeof o.question === "string" ? o.question.trim() : "";
    if (!question) continue;

    const label = question.slice(0, 80);
    const type = isItemType(o.type) ? o.type : "comprehension";
    const evidence = typeof o.evidence === "string" ? o.evidence.trim() : "";

    if (!evidence) {
      dropped.push({ question: label, reason: "no supporting quote from the passage" });
      continue;
    }
    if (!evidenceInPassage(evidence, passage)) {
      dropped.push({
        question: label,
        reason: "its supporting quote is not in the passage",
      });
      continue;
    }

    const choices = Array.isArray(o.choices)
      ? o.choices.filter((c): c is string => typeof c === "string" && c.trim().length > 0)
      : [];
    const answerIndexRaw = typeof o.answerIndex === "number" ? o.answerIndex : null;
    const answer = typeof o.answer === "string" && o.answer.trim() ? o.answer.trim() : null;

    if (choices.length > 0) {
      if (
        answerIndexRaw === null ||
        !Number.isInteger(answerIndexRaw) ||
        answerIndexRaw < 0 ||
        answerIndexRaw >= choices.length
      ) {
        dropped.push({ question: label, reason: "no valid correct answer" });
        continue;
      }
      if (choices.length < 3) {
        dropped.push({ question: label, reason: "too few answer choices" });
        continue;
      }
    } else if (!answer) {
      dropped.push({ question: label, reason: "no model answer" });
      continue;
    }

    kept.push({
      type,
      question,
      choices,
      answerIndex: choices.length > 0 ? answerIndexRaw : null,
      answer: choices.length > 0 ? null : answer,
      evidence,
    });
  }

  return { kept, dropped };
}

/**
 * Spread the correct answer across positions. Copilot produced an eight-item
 * quiz whose key read "A, A, A, A, A, A, A, A" (session 093) and she shipped
 * it without noticing. Deterministic rotation, no RNG, so output is stable.
 */
export function balanceAnswerPositions(items: GeneratedItem[]): GeneratedItem[] {
  return items.map((item, i) => {
    if (item.choices.length === 0 || item.answerIndex === null) return item;
    const target = i % item.choices.length;
    if (target === item.answerIndex) return item;
    const choices = [...item.choices];
    const correct = choices[item.answerIndex];
    choices.splice(item.answerIndex, 1);
    choices.splice(target, 0, correct);
    return { ...item, choices, answerIndex: target };
  });
}

const LETTERS = "ABCDEFGH";

/**
 * Plain text, ready to paste into Google Docs or Classroom. No widgets: the
 * interactive quiz control failed her six times in the corpus, twice costing
 * whole turns just to read her own questions.
 */
export function formatItemsAsPlainText(
  items: GeneratedItem[],
  opts: { title?: string; includeKey?: boolean } = {},
): string {
  const { title, includeKey = true } = opts;
  const lines: string[] = [];
  if (title) lines.push(title, "");

  items.forEach((item, i) => {
    lines.push(`${i + 1}. ${item.question}`);
    item.choices.forEach((c, j) => lines.push(`   ${LETTERS[j]}. ${c}`));
    lines.push("");
  });

  if (includeKey) {
    lines.push("---", "ANSWER KEY", "");
    items.forEach((item, i) => {
      const ans =
        item.answerIndex !== null ? `${LETTERS[item.answerIndex]}. ${item.choices[item.answerIndex]}` : (item.answer ?? "");
      lines.push(`${i + 1}. ${ans}`);
      lines.push(`   Evidence: "${item.evidence}"`);
      lines.push("");
    });
  }

  return lines.join("\n").trimEnd() + "\n";
}

/** Build the generation prompt. The passage is the only permitted source. */
export function buildItemPrompt(args: {
  passage: string;
  types: ItemType[];
  count: number;
  format: ItemFormat;
  grade?: number | null;
  sourceTitle?: string | null;
}): { system: string; user: string } {
  const { passage, types, count, format, grade, sourceTitle } = args;
  const typeGuidance = ITEM_TYPES.filter((t) => types.includes(t.value))
    .map((t) => `- ${t.value} (${t.label}): ${t.guidance}`)
    .join("\n");

  const shape =
    format === "multiple_choice"
      ? `{"type": "inferential", "question": "...", "choices": ["...", "...", "...", "..."], "answerIndex": 0, "evidence": "exact sentence or phrase copied from the passage"}`
      : `{"type": "inferential", "question": "...", "answer": "what a strong response says", "evidence": "exact sentence or phrase copied from the passage"}`;

  const system = `You write reading assessment items for a middle-school English teacher${
    grade ? ` (grade ${grade})` : ""
  }.

THE PASSAGE IS YOUR ONLY SOURCE. You may not use anything you know or believe about the book, the author, the plot, or events outside the passage. If the passage does not support an item, do not write that item.

Every item must include "evidence": an EXACT span copied character-for-character from the passage that a student could point to to justify the answer. Do not paraphrase the evidence. Do not invent page numbers, chapter numbers, or citations — none are available to you.

Item types requested:
${typeGuidance}

Write ${count} items${count > 1 ? ", varying the type across the requested types" : ""}. Vary which position holds the correct answer.

Return ONLY a JSON array, no prose and no code fences:
[${shape}]`;

  const user = `${sourceTitle ? `Passage from: ${sourceTitle}\n\n` : ""}PASSAGE:\n"""\n${passage}\n"""`;

  return { system, user };
}
