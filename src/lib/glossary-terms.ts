// Default glossary definitions — the app's working vocabulary, inferred from
// how Heidi actually organizes and categorizes her materials (Drive folder
// structure, material re-typing in the editor, and her Copilot usage study).
// These are deliberately phrased as best guesses: the /glossary page invites
// her to rewrite any of them, and her wording (stored in glossary_terms)
// overrides these defaults. Once vocabulary is agreed, her definitions become
// the contract for AI classification prompts too.

export type GlossaryTerm = {
  key: string;
  term: string;
  category: "Curriculum structure" | "Material types" | "Material roles" | "Badges & provenance";
  definition: string;
};

export const DEFAULT_TERMS: GlossaryTerm[] = [
  // ── Curriculum structure ───
  {
    key: "curriculum-concept",
    term: "Curriculum",
    category: "Curriculum structure",
    definition:
      "The whole plan for a course, taken together: the year's units, their lessons and assessments, and the materials linked to them. Distinct from a Curriculum *document* (a syllabus or pacing guide, which describes the plan on paper).",
  },
  {
    key: "course",
    term: "Course",
    category: "Curriculum structure",
    definition:
      "One grade's English class for one school year — e.g. \"Grade 7 English Language Arts, 2026-27\". A course holds units, and a new school year gets a new course.",
  },
  {
    key: "track",
    term: "Track",
    category: "Curriculum structure",
    definition:
      "A variant of a grade that has its own curriculum — \"Grade 8 Honors\" next to \"Grade 8 Regular.\" Different pacing and often different texts, so each track is its own course, not another class period of the same one. Most grades have no track; none of yours do.",
  },
  {
    key: "unit",
    term: "Unit",
    category: "Curriculum structure",
    definition:
      "A multi-week arc of study, usually anchored by a novel or genre — \"The Westing Game,\" \"Persuasive Essay,\" \"Poetry.\" Matches the unit folders you keep in Drive. Units generally live in a quarter, but sometimes cross quarter boundaries.",
  },
  {
    key: "lesson-entity",
    term: "Lesson (in a unit)",
    category: "Curriculum structure",
    definition:
      "A lesson is a file — usually a PowerPoint — that you teach from. It can run several class days (\"The Giver: Ch. 13–23 (6 days)\"), and two lessons can land on the same day when you're finishing one before starting the next. So a lesson is not a class period, and the app never assumes one lesson means one day.",
  },
  {
    key: "assessment-entity",
    term: "Assessment (in a unit)",
    category: "Curriculum structure",
    definition:
      "A graded checkpoint in a unit — quiz, test, essay, or project — as a row in the plan (distinct from the assessment *documents* attached to it).",
  },
  {
    key: "quarter",
    term: "Quarter",
    category: "Curriculum structure",
    definition:
      "A grading period, Q1–Q4. \"Summer\" is the extra bucket for summer reading that comes before Q1.",
  },
  {
    key: "school-year",
    term: "School year (captured vs. planning)",
    category: "Curriculum structure",
    definition:
      "One August-to-June cycle. A *captured* year is the record of a year you already taught (your 2025-26); the *planning* year is the one you're building next (2026-27).",
  },
  {
    key: "section",
    term: "Section (class period)",
    category: "Curriculum structure",
    definition:
      "One scheduled group of students taking the course — e.g. \"7th grade English, 3rd period.\" The same course can have several sections; each section is a row on the Calendar. For now sections share their course's plan and pacing — per-section drift comes later.",
  },
  {
    key: "pool",
    term: "Material pool",
    category: "Curriculum structure",
    definition:
      "All the files imported for a course that aren't currently attached to a lesson. Deleting a lesson returns its files here — nothing is ever lost, it just goes back to the pool.",
  },
  {
    key: "import-scope",
    term: "Import scope",
    category: "Curriculum structure",
    definition:
      "What you're telling the app a folder or file *is* when you import it: one material, one unit, a quarter's worth of units, or a whole year. You declare this first, and where it should go is a separate, second choice. The app used to infer it from how deep your folders went, which is how a sub-project folder could turn into a unit of its own.",
  },

  // ── Material types ───
  {
    key: "reading",
    term: "Reading",
    category: "Material types",
    definition:
      "A text students read: an article, poem, excerpt, or short story — like the \"I Am From\" poem. If students' main job with it is to read it, it's a reading.",
  },
  {
    key: "activity",
    term: "Activity",
    category: "Material types",
    definition:
      "Work students actively do: station work, viewing guides, film comparisons, projects, games — like the Westing Game viewing guide. Doing, not just reading.",
  },
  {
    key: "rubric",
    term: "Rubric",
    category: "Material types",
    definition:
      "A scoring guide or grading checklist that says how an assignment earns its points.",
  },
  {
    key: "lesson",
    term: "Lesson (document)",
    category: "Material types",
    definition:
      "The file you teach from, usually a PowerPoint — the ones in your Lessons folders (\"Westing Game: Vocabulary Words\"). For you the file and the lesson are the same thing: this type tag is how the app knows which files become lessons in a unit and which are supporting material hung off them.",
  },
  {
    key: "assessment",
    term: "Assessment (document)",
    category: "Material types",
    definition:
      "A quiz, test, or graded-assignment document — the Vocab Quiz Retake, the Character Analysis graphic organizer. Anything that comes back with a score.",
  },
  {
    key: "resource",
    term: "Resource",
    category: "Material types",
    definition:
      "Teacher-side support material that doesn't go to students as-is: idea lists (\"WG film ideas\"), references, background reading for you.",
  },
  {
    key: "curriculum",
    term: "Curriculum (document)",
    category: "Material types",
    definition:
      "A document about the plan itself: a syllabus, pacing guide, or unit outline — the paperwork that describes the year rather than teaches a day of it.",
  },
  {
    key: "other",
    term: "Other",
    category: "Material types",
    definition:
      "Doesn't fit any type yet. A parking spot — if something keeps landing here, the categories probably need a new word (tell us).",
  },

  // ── Material roles ───
  {
    key: "role-primary",
    term: "Primary",
    category: "Material roles",
    definition:
      "The anchor document a lesson is built around — the thing you'd grab first if you could only take one file to class.",
  },
  {
    key: "role-supporting",
    term: "Supporting",
    category: "Material roles",
    definition: "Used alongside the primary — extra handouts, slides, examples.",
  },
  {
    key: "role-teacher-reference",
    term: "Teacher reference",
    category: "Material roles",
    definition: "For your eyes only — notes and keys students never see.",
  },

  // ── Badges & provenance ───
  {
    key: "from-docs",
    term: "\"from docs\" badge",
    category: "Badges & provenance",
    definition:
      "This came from your real files — captured from your curriculum documents, not invented by AI. Your judgment, preserved.",
  },
  {
    key: "ai-generated",
    term: "\"AI generated\" badge",
    category: "Badges & provenance",
    definition:
      "The app's AI created this (a unit shape, a lesson title, a draft). Treat it as a proposal until you've corrected or accepted it.",
  },
];

export const TERM_KEYS = new Set(DEFAULT_TERMS.map((t) => t.key));
export const MAX_DEFINITION_CHARS = 2000;
