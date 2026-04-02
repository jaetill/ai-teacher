// Seed script: loads VA SOL 2024 Grade 8 English standards into the database.
// Run with: npx tsx src/db/seed-standards.ts

import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { standards } from "./schema/standards";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

// ── VA SOL 2024 Grade 8 English Standards ───
// Source: IXL skill plan + VDOE documents
// Naming: {grade}.{strand}.{subcategory}.{indicator}

const grade8Standards = [
  // ── Developing Skilled Readers and Building Reading Stamina (DSR) ───
  {
    id: "8.DSR.A",
    grade: 8,
    strandCode: "DSR",
    strandName: "Developing Skilled Readers and Building Reading Stamina",
    subcategory: null,
    indicator: "A",
    description:
      "Read a variety of grade-level complex text with accuracy, automaticity, appropriate rate, and meaningful expression.",
  },
  {
    id: "8.DSR.B",
    grade: 8,
    strandCode: "DSR",
    strandName: "Developing Skilled Readers and Building Reading Stamina",
    subcategory: null,
    indicator: "B",
    description:
      "Proficiently read and comprehend a variety of literary and informational texts.",
  },
  {
    id: "8.DSR.C",
    grade: 8,
    strandCode: "DSR",
    strandName: "Developing Skilled Readers and Building Reading Stamina",
    subcategory: null,
    indicator: "C",
    description:
      "Draw several pieces of evidence from grade-level complex texts to support claims.",
  },
  {
    id: "8.DSR.D",
    grade: 8,
    strandCode: "DSR",
    strandName: "Developing Skilled Readers and Building Reading Stamina",
    subcategory: null,
    indicator: "D",
    description:
      "Regularly engage in reading a series of conceptually related texts organized around topics.",
  },
  {
    id: "8.DSR.E",
    grade: 8,
    strandCode: "DSR",
    strandName: "Developing Skilled Readers and Building Reading Stamina",
    subcategory: null,
    indicator: "E",
    description:
      "Use reading strategies as needed to aid and monitor comprehension.",
  },

  // ── Reading and Vocabulary (RV) ───
  {
    id: "8.RV.1.A",
    grade: 8,
    strandCode: "RV",
    strandName: "Reading and Vocabulary",
    subcategory: "1",
    indicator: "A",
    description:
      "Develop and use general, academic, and content-specific vocabulary.",
  },
  {
    id: "8.RV.1.B",
    grade: 8,
    strandCode: "RV",
    strandName: "Reading and Vocabulary",
    subcategory: "1",
    indicator: "B",
    description: "Use context to determine the meaning of words or phrases.",
  },
  {
    id: "8.RV.1.C",
    grade: 8,
    strandCode: "RV",
    strandName: "Reading and Vocabulary",
    subcategory: "1",
    indicator: "C",
    description:
      "Apply knowledge of Greek and Latin roots and affixes to determine meaning.",
  },
  {
    id: "8.RV.1.D",
    grade: 8,
    strandCode: "RV",
    strandName: "Reading and Vocabulary",
    subcategory: "1",
    indicator: "D",
    description:
      "Use word relationships including synonyms, antonyms, and analogies.",
  },
  {
    id: "8.RV.1.E",
    grade: 8,
    strandCode: "RV",
    strandName: "Reading and Vocabulary",
    subcategory: "1",
    indicator: "E",
    description:
      "Analyze symbols, analogy, and figurative language in author's work.",
  },
  {
    id: "8.RV.1.F",
    grade: 8,
    strandCode: "RV",
    strandName: "Reading and Vocabulary",
    subcategory: "1",
    indicator: "F",
    description:
      "Distinguish between connotative and denotative word meanings.",
  },
  {
    id: "8.RV.1.G",
    grade: 8,
    strandCode: "RV",
    strandName: "Reading and Vocabulary",
    subcategory: "1",
    indicator: "G",
    description:
      "Use general and specialized word-reference materials to determine pronunciation.",
  },
  {
    id: "8.RV.1.H",
    grade: 8,
    strandCode: "RV",
    strandName: "Reading and Vocabulary",
    subcategory: "1",
    indicator: "H",
    description: "Use newly learned words in multiple contexts.",
  },

  // ── Reading Literary Text (RL) ───
  {
    id: "8.RL.1.A",
    grade: 8,
    strandCode: "RL",
    strandName: "Reading Literary Text",
    subcategory: "1",
    indicator: "A",
    description:
      "Analyze theme development and relationships to characters and plot.",
  },
  {
    id: "8.RL.1.B",
    grade: 8,
    strandCode: "RL",
    strandName: "Reading Literary Text",
    subcategory: "1",
    indicator: "B",
    description:
      "Explain how plot patterns create meaning and influence story elements.",
  },
  {
    id: "8.RL.1.C",
    grade: 8,
    strandCode: "RL",
    strandName: "Reading Literary Text",
    subcategory: "1",
    indicator: "C",
    description:
      "Justify decisions of dynamic versus static characters.",
  },
  {
    id: "8.RL.2.A",
    grade: 8,
    strandCode: "RL",
    strandName: "Reading Literary Text",
    subcategory: "2",
    indicator: "A",
    description:
      "Interpret poetic elements' meaning and impact on readers.",
  },
  {
    id: "8.RL.2.B",
    grade: 8,
    strandCode: "RL",
    strandName: "Reading Literary Text",
    subcategory: "2",
    indicator: "B",
    description:
      "Analyze author's style elements' influence on tone and voice.",
  },
  {
    id: "8.RL.2.C",
    grade: 8,
    strandCode: "RL",
    strandName: "Reading Literary Text",
    subcategory: "2",
    indicator: "C",
    description:
      "Analyze how authors develop contrasting character perspectives.",
  },
  {
    id: "8.RL.2.D",
    grade: 8,
    strandCode: "RL",
    strandName: "Reading Literary Text",
    subcategory: "2",
    indicator: "D",
    description:
      "Analyze literary devices building mystery and suspense.",
  },
  {
    id: "8.RL.3.A",
    grade: 8,
    strandCode: "RL",
    strandName: "Reading Literary Text",
    subcategory: "3",
    indicator: "A",
    description:
      "Compare and contrast story structures across genres.",
  },
  {
    id: "8.RL.3.B",
    grade: 8,
    strandCode: "RL",
    strandName: "Reading Literary Text",
    subcategory: "3",
    indicator: "B",
    description:
      "Compare fictional portrayals with historical accounts.",
  },
  {
    id: "8.RL.3.C",
    grade: 8,
    strandCode: "RL",
    strandName: "Reading Literary Text",
    subcategory: "3",
    indicator: "C",
    description:
      "Compare texts in different genres regarding similar themes.",
  },

  // ── Reading Informational Text (RI) ───
  {
    id: "8.RI.1.A",
    grade: 8,
    strandCode: "RI",
    strandName: "Reading Informational Text",
    subcategory: "1",
    indicator: "A",
    description:
      "Create main idea statements and accurate summaries.",
  },
  {
    id: "8.RI.1.B",
    grade: 8,
    strandCode: "RI",
    strandName: "Reading Informational Text",
    subcategory: "1",
    indicator: "B",
    description:
      "Analyze how authors unfold perspectives in historical and scientific texts.",
  },
  {
    id: "8.RI.1.C",
    grade: 8,
    strandCode: "RI",
    strandName: "Reading Informational Text",
    subcategory: "1",
    indicator: "C",
    description:
      "Trace and evaluate the argument and specific claims in a text.",
  },
  {
    id: "8.RI.2.A",
    grade: 8,
    strandCode: "RI",
    strandName: "Reading Informational Text",
    subcategory: "2",
    indicator: "A",
    description:
      "Evaluate an author's use of text features to enhance comprehension.",
  },
  {
    id: "8.RI.2.B",
    grade: 8,
    strandCode: "RI",
    strandName: "Reading Informational Text",
    subcategory: "2",
    indicator: "B",
    description:
      "Analyze how word choice and structure impact meaning and credibility.",
  },
  {
    id: "8.RI.2.C",
    grade: 8,
    strandCode: "RI",
    strandName: "Reading Informational Text",
    subcategory: "2",
    indicator: "C",
    description:
      "Analyze author perspective and response to conflicting evidence.",
  },
  {
    id: "8.RI.3.A",
    grade: 8,
    strandCode: "RI",
    strandName: "Reading Informational Text",
    subcategory: "3",
    indicator: "A",
    description:
      "Analyze ideas within and between selections.",
  },
  {
    id: "8.RI.3.B",
    grade: 8,
    strandCode: "RI",
    strandName: "Reading Informational Text",
    subcategory: "3",
    indicator: "B",
    description:
      "Compare how authors present conflicting information on same topics.",
  },

  // ── Writing (W) ───
  {
    id: "8.W.1.A",
    grade: 8,
    strandCode: "W",
    strandName: "Writing",
    subcategory: "1",
    indicator: "A",
    description:
      "Write narratives developing experiences using precise language and transitions.",
  },
  {
    id: "8.W.1.B",
    grade: 8,
    strandCode: "W",
    strandName: "Writing",
    subcategory: "1",
    indicator: "B",
    description:
      "Write expository texts examining topics with relevant facts and examples.",
  },
  {
    id: "8.W.1.C",
    grade: 8,
    strandCode: "W",
    strandName: "Writing",
    subcategory: "1",
    indicator: "C",
    description:
      "Write persuasively with relevant evidence and clear reasoning.",
  },

  // ── Language Usage (LU) ───
  {
    id: "8.LU.1.A",
    grade: 8,
    strandCode: "LU",
    strandName: "Language Usage",
    subcategory: "1",
    indicator: "A",
    description:
      "Apply grammatical conventions including sentence structure and usage.",
  },
  {
    id: "8.LU.1.B",
    grade: 8,
    strandCode: "LU",
    strandName: "Language Usage",
    subcategory: "1",
    indicator: "B",
    description:
      "Apply conventions of spelling, capitalization, and punctuation.",
  },

  // ── Communication and Multimodal Literacies (C) ───
  {
    id: "8.C.1.A",
    grade: 8,
    strandCode: "C",
    strandName: "Communication and Multimodal Literacies",
    subcategory: "1",
    indicator: "A",
    description:
      "Facilitate and contribute to a range of sustained collaborative discussions with diverse peers.",
  },
  {
    id: "8.C.1.B",
    grade: 8,
    strandCode: "C",
    strandName: "Communication and Multimodal Literacies",
    subcategory: "1",
    indicator: "B",
    description:
      "Create multimodal presentations that effectively convey ideas.",
  },

  // ── Research (R) ───
  {
    id: "8.R.1.A",
    grade: 8,
    strandCode: "R",
    strandName: "Research",
    subcategory: "1",
    indicator: "A",
    description:
      "Formulate research questions and refine search to gather relevant information from multiple sources.",
  },
  {
    id: "8.R.1.B",
    grade: 8,
    strandCode: "R",
    strandName: "Research",
    subcategory: "1",
    indicator: "B",
    description:
      "Evaluate the credibility and accuracy of sources and present findings.",
  },
];

async function seed() {
  console.log(`Seeding ${grade8Standards.length} Grade 8 standards...`);

  // Upsert: insert or skip if already exists
  for (const std of grade8Standards) {
    await db
      .insert(standards)
      .values({
        id: std.id,
        grade: std.grade,
        strandCode: std.strandCode,
        strandName: std.strandName,
        subcategory: std.subcategory,
        indicator: std.indicator,
        description: std.description,
        framework: "VA_SOL_2024",
      })
      .onConflictDoNothing();
  }

  console.log("Done! Standards seeded successfully.");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
