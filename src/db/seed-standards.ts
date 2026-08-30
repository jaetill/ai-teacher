// Seed script: loads VA SOL 2024 Grade 8 English standards into the database.
// Run with: npx tsx src/db/seed-standards.ts
//
// ── Source (this matters; it is what went wrong before) ───
//
// Verbatim from the Virginia Department of Education, "English Standards of
// Learning for Virginia Public Schools, 2024", Grade 8 (March 2024), pages
// 67-74. Cross-checked against VDOE "Understanding the Standards - Grade 8".
//
// The previous version of this file was built from "IXL skill plan + VDOE
// documents". IXL publishes a *skill plan* — a paraphrase organised for their
// exercises — not the standards. Three consequences reached Heidi's live
// curriculum before anyone noticed:
//
//   1. Every description was a summary. 8.RI.1.A shipped as "Create main idea
//      statements and accurate summaries." The actual standard is "Create a
//      main idea statement and provide an accurate summary, clarifying the
//      relationships among the key details and ideas or events." The clause
//      carrying the cognitive demand was the part that got cut. Grade 8
//      averaged 68 characters per standard; grades 6-7, taken from the real
//      document, average 175.
//   2. Twenty-one standards were missing, because IXL's plan does not
//      enumerate every indicator. 8.W.1.D ("Write reflectively...") was one;
//      the W, R, LU and C strands were all truncated after the first two or
//      three items.
//   3. One standard was invented. 8.C.1.B does not exist in the SOL — IXL's
//      multimodal-presentation item is VDOE's 8.C.3.A. See MISLABELLED below.
//
// Rule going forward: transcribe from the VDOE document, verbatim, including
// the parenthetical strand references and the nested i/ii/iii sub-items. If a
// description here is shorter than the source, it is wrong. tests/lib/
// standards-completeness.test.ts enforces both the roster and the paraphrase
// guard.

import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { standards } from "./schema/standards";

// Built inside seed(), not at module scope. The completeness test imports the
// roster from this file, and a module-scope neon() call made that import fail
// in CI ("No database connection string was provided") where there is no
// .env.local — reading the data should not require a database.
function connect() {
  return drizzle(neon(process.env.DATABASE_URL!));
}

// ── VA SOL 2024 Grade 8 English Standards ───
// id = {grade}.{strand}.{subcategory}.{indicator}, and the id IS the code the
// rest of the app joins on — 644 unit/lesson mappings depend on these strings,
// so an id is never renamed, only added.

export const grade8Standards = [
  // ── Developing Skilled Readers and Building Reading Stamina (8.DSR) ───
  {
    id: "8.DSR.A",
    grade: 8,
    strandCode: "DSR",
    strandName: "Developing Skilled Readers and Building Reading Stamina",
    subcategory: null,
    indicator: "A",
    description:
      "Read a variety of grade-level complex text with accuracy, automaticity, appropriate rate, and meaningful expression in successive readings to support comprehension. Monitor while reading to confirm or self-correct word recognition and understanding, as necessary (Reading Fluency, K-12).",
  },
  {
    id: "8.DSR.B",
    grade: 8,
    strandCode: "DSR",
    strandName: "Developing Skilled Readers and Building Reading Stamina",
    subcategory: null,
    indicator: "B",
    description:
      "Proficiently read and comprehend a variety of literary and informational texts that exhibit complexity at the higher range of the grades 6-8 band (See the Quantitative and Qualitative Analysis charts for determining complexity in the Appendix.) (Text Complexity, 2-12).",
  },
  {
    id: "8.DSR.C",
    grade: 8,
    strandCode: "DSR",
    strandName: "Developing Skilled Readers and Building Reading Stamina",
    subcategory: null,
    indicator: "C",
    description:
      "When responding to text through discussion and/or writing, draw several pieces of evidence from grade-level complex texts to support claims, conclusions, and inferences, including quoting or paraphrasing from texts accurately and tracing where relevant evidence is located (Textual Evidence, K-12).",
  },
  {
    id: "8.DSR.D",
    grade: 8,
    strandCode: "DSR",
    strandName: "Developing Skilled Readers and Building Reading Stamina",
    subcategory: null,
    indicator: "D",
    description:
      "Regularly engage in reading a series of conceptually related texts organized around topics of study to build knowledge and vocabulary. (These texts should be at a range of complexity levels so students can read the texts independently, with peers, or with modest support.) Use this background knowledge as context for new learning (Deep Reading on Topics to Build Knowledge and Vocabulary, K-12).",
  },
  {
    id: "8.DSR.E",
    grade: 8,
    strandCode: "DSR",
    strandName: "Developing Skilled Readers and Building Reading Stamina",
    subcategory: null,
    indicator: "E",
    description:
      "Use reading strategies as needed to aid and monitor comprehension when encountering challenging sections of text. These sense-making strategies attend to text structure, common organizational structures, summarizing, asking questions of the text, and others (Reading Strategies, 3-12).",
  },

  // ── Reading and Vocabulary (8.RV.1 Vocabulary Development and Word Analysis) ───
  {
    id: "8.RV.1.A",
    grade: 8,
    strandCode: "RV",
    strandName: "Reading and Vocabulary",
    subcategory: "1",
    indicator: "A",
    description:
      "Develop and accurately use general and academic language and content-specific vocabulary by listening to, reading, and discussing a variety of grade-eight texts and topics.",
  },
  {
    id: "8.RV.1.B",
    grade: 8,
    strandCode: "RV",
    strandName: "Reading and Vocabulary",
    subcategory: "1",
    indicator: "B",
    description:
      "Use context (e.g., the overall meaning of a sentence or paragraph; a word's position or function in a sentence) to determine the meaning of words or phrases.",
  },
  {
    id: "8.RV.1.C",
    grade: 8,
    strandCode: "RV",
    strandName: "Reading and Vocabulary",
    subcategory: "1",
    indicator: "C",
    description:
      "Apply knowledge of Greek and Latin roots and affixes to determine the meaning of unfamiliar words.",
  },
  {
    id: "8.RV.1.D",
    grade: 8,
    strandCode: "RV",
    strandName: "Reading and Vocabulary",
    subcategory: "1",
    indicator: "D",
    description:
      "Use the relationship between particular words, including synonyms, antonyms, and analogies to better understand each word.",
  },
  {
    id: "8.RV.1.E",
    grade: 8,
    strandCode: "RV",
    strandName: "Reading and Vocabulary",
    subcategory: "1",
    indicator: "E",
    description:
      "Analyze the construction and meaning of an author's use of symbols, analogy, and figurative language such as simile, metaphor, personification, hyperbole, and idiom.",
  },
  {
    id: "8.RV.1.F",
    grade: 8,
    strandCode: "RV",
    strandName: "Reading and Vocabulary",
    subcategory: "1",
    indicator: "F",
    description:
      "Discriminate between the meanings of connotative words and their denotative meanings.",
  },
  {
    id: "8.RV.1.G",
    grade: 8,
    strandCode: "RV",
    strandName: "Reading and Vocabulary",
    subcategory: "1",
    indicator: "G",
    description:
      "Use general and specialized word-reference materials, print and digital, to determine pronunciation, etymology, derivations, and parts of speech.",
  },
  {
    id: "8.RV.1.H",
    grade: 8,
    strandCode: "RV",
    strandName: "Reading and Vocabulary",
    subcategory: "1",
    indicator: "H",
    description:
      "Use newly learned words and phrases in multiple contexts, including in students' discussions and speaking and writing activities.",
  },

  // ── Reading Literary Text (8.RL) ───
  {
    id: "8.RL.1.A",
    grade: 8,
    strandCode: "RL",
    strandName: "Reading Literary Text",
    subcategory: "1",
    indicator: "A",
    description:
      "Analyze and explain the development of theme(s) over the course of texts and their relationship to the characters, settings, plots, and overall messages.",
  },
  {
    id: "8.RL.1.B",
    grade: 8,
    strandCode: "RL",
    strandName: "Reading Literary Text",
    subcategory: "1",
    indicator: "B",
    description:
      "Explain how different plot patterns (e.g., comedy, drama, tragedy) and subplots create meaning and examine their influence on characters, theme, pacing, and point of view.",
  },
  {
    id: "8.RL.1.C",
    grade: 8,
    strandCode: "RL",
    strandName: "Reading Literary Text",
    subcategory: "1",
    indicator: "C",
    description:
      "Justify the decisions and actions of dynamic versus static characters using dialogue or specific events from the text.",
  },
  {
    id: "8.RL.2.A",
    grade: 8,
    strandCode: "RL",
    strandName: "Reading Literary Text",
    subcategory: "2",
    indicator: "A",
    description:
      "Interpret the meaning and analyze the impact of poetic elements in prose and poetry (e.g., rhyme, rhythm, repetition, alliteration, and onomatopoeia) on the reader.",
  },
  {
    id: "8.RL.2.B",
    grade: 8,
    strandCode: "RL",
    strandName: "Reading Literary Text",
    subcategory: "2",
    indicator: "B",
    description:
      "Analyze how the elements of an author's style (e.g., dialogue, sentence structure and word choices) are used to influence and develop tone and voice.",
  },
  {
    id: "8.RL.2.C",
    grade: 8,
    strandCode: "RL",
    strandName: "Reading Literary Text",
    subcategory: "2",
    indicator: "C",
    description:
      "Analyze how an author develops and contrasts the points of view of different characters or narrators in a text.",
  },
  {
    id: "8.RL.2.D",
    grade: 8,
    strandCode: "RL",
    strandName: "Reading Literary Text",
    subcategory: "2",
    indicator: "D",
    description:
      "Analyze how an author's use of literary devices including foreshadowing, flashback, symbolism, and irony are used to build mystery, suspense, or surprise.",
  },
  {
    id: "8.RL.3.A",
    grade: 8,
    strandCode: "RL",
    strandName: "Reading Literary Text",
    subcategory: "3",
    indicator: "A",
    description:
      "Compare and contrast the structure of two or more stories, poems, and plays and analyze how the differing structure of each literary text contributes to its meaning and style.",
  },
  {
    id: "8.RL.3.B",
    grade: 8,
    strandCode: "RL",
    strandName: "Reading Literary Text",
    subcategory: "3",
    indicator: "B",
    description:
      "Compare and contrast fictional portrayals of a time, place, or character with historical accounts of the same period as a means of understanding how authors of fiction use or alter history.",
  },
  {
    id: "8.RL.3.C",
    grade: 8,
    strandCode: "RL",
    strandName: "Reading Literary Text",
    subcategory: "3",
    indicator: "C",
    description:
      "Compare and contrast texts in different forms or genres (e.g., stories and poems; historical novels and fantasy stories; literary nonfiction and informational) in terms of their approaches to similar themes and topics.",
  },

  // ── Reading Informational Text (8.RI) ───
  {
    id: "8.RI.1.A",
    grade: 8,
    strandCode: "RI",
    strandName: "Reading Informational Text",
    subcategory: "1",
    indicator: "A",
    description:
      "Create a main idea statement and provide an accurate summary, clarifying the relationships among the key details and ideas or events.",
  },
  {
    id: "8.RI.1.B",
    grade: 8,
    strandCode: "RI",
    strandName: "Reading Informational Text",
    subcategory: "1",
    indicator: "B",
    description:
      "Analyze how the author unfolds a perspective or series of ideas or events in historical, scientific, or technical texts, including the order in which the points are made, how they are introduced and developed, and the connections drawn between them.",
  },
  {
    id: "8.RI.1.C",
    grade: 8,
    strandCode: "RI",
    strandName: "Reading Informational Text",
    subcategory: "1",
    indicator: "C",
    description:
      "Trace and evaluate the argument and specific claims in a text, assessing whether the reasoning and evidence are relevant and sufficient to support the claims.",
  },
  {
    id: "8.RI.2.A",
    grade: 8,
    strandCode: "RI",
    strandName: "Reading Informational Text",
    subcategory: "2",
    indicator: "A",
    description:
      "Evaluate an author's use of text features (e.g., boldface and italics; type set in color; underlining; indentation; sidebars; illustrations, graphics, and photographs; headings and subheadings; footnotes and annotations) to enhance and support the reader's comprehension.",
  },
  {
    id: "8.RI.2.B",
    grade: 8,
    strandCode: "RI",
    strandName: "Reading Informational Text",
    subcategory: "2",
    indicator: "B",
    description:
      "Analyze how an author's word choice, organizational pattern, language structure, viewpoints, and qualifications impact meaning and credibility of a text.",
  },
  {
    id: "8.RI.2.C",
    grade: 8,
    strandCode: "RI",
    strandName: "Reading Informational Text",
    subcategory: "2",
    indicator: "C",
    description:
      "Analyze how an author establishes and conveys a perspective or purpose in a text and acknowledges and responds to conflicting evidence or viewpoints.",
  },
  {
    id: "8.RI.3.A",
    grade: 8,
    strandCode: "RI",
    strandName: "Reading Informational Text",
    subcategory: "3",
    indicator: "A",
    description:
      "Analyze ideas within and between selections including how specific sentences, paragraphs, sections, and text features contribute to the development and refinement of the ideas presented.",
  },
  {
    id: "8.RI.3.B",
    grade: 8,
    strandCode: "RI",
    strandName: "Reading Informational Text",
    subcategory: "3",
    indicator: "B",
    description:
      "Compare and contrast how two or more authors present conflicting information on the same topic by assessing where the texts disagree in reasoning and evidence.",
  },

  // ── Writing (8.W) ───
  {
    id: "8.W.1.A",
    grade: 8,
    strandCode: "W",
    strandName: "Writing",
    subcategory: "1",
    indicator: "A",
    description:
      "Write narratives to develop real or imagined experiences or to alter an existing text, using well-structured event sequences, precise words and phrases, and transitional words to develop the characters, convey sequence, and capture the action.",
  },
  {
    id: "8.W.1.B",
    grade: 8,
    strandCode: "W",
    strandName: "Writing",
    subcategory: "1",
    indicator: "B",
    description:
      "Write expository texts to examine a topic or concept that conveys ideas and information by maintaining a clear focus with relevant, well-chosen facts, definitions, concrete details, quotations, and examples from multiple credible sources, using structures and patterns (e.g., description, enumeration, classification, comparison, problem-solution, or cause-effect) to clarify relationships among ideas and concepts.",
  },
  {
    id: "8.W.1.C",
    grade: 8,
    strandCode: "W",
    strandName: "Writing",
    subcategory: "1",
    indicator: "C",
    description:
      "Write persuasively, supporting well-defined points of view effectively with relevant evidence and clear reasoning in ways that logically advance the claim(s) made.",
  },
  {
    // The standard that started this: reported missing by Heidi against her
    // VA SOL 6-8 side-by-side comparison, 2026-08-30.
    id: "8.W.1.D",
    grade: 8,
    strandCode: "W",
    strandName: "Writing",
    subcategory: "1",
    indicator: "D",
    description:
      "Write reflectively in response to reading to demonstrate thinking with details, examples, and other evidence from the text(s).",
  },
  {
    id: "8.W.2.A",
    grade: 8,
    strandCode: "W",
    strandName: "Writing",
    subcategory: "2",
    indicator: "A",
    description:
      "Generate and organize ideas using the writing process (planning, drafting, revising, editing) to develop multi-paragraph texts. This includes: i. Composing a thesis statement that states a position or explains the purpose. ii. Establishing a central idea that aligns with the thesis and maintaining an organized structure and formal style to fit form and topic, providing elaboration and unity throughout the writing and maintaining a consistent point of view. iii. Stating and defending conclusions or positions with reasons and precise, relevant evidence and complete explanation of how evidence and details support a position addressing counterclaims when appropriate. iv. Using appropriate and varied transitions to signal shifts in writing to clarify the relationships among ideas and concepts. v. Developing voice and tone by using language that provides vivid and precise vocabulary to enhance the meaning of the writing. vi. Expanding and embedding ideas to create sentence variety. vii. Providing a concluding statement or section.",
  },
  {
    id: "8.W.3.A",
    grade: 8,
    strandCode: "W",
    strandName: "Writing",
    subcategory: "3",
    indicator: "A",
    description:
      "Revise writing for clarity of content, word choice, sentence variety, and transition among paragraphs.",
  },
  {
    id: "8.W.3.B",
    grade: 8,
    strandCode: "W",
    strandName: "Writing",
    subcategory: "3",
    indicator: "B",
    description:
      "Self-and peer-edit writing for capitalization, spelling, punctuation, sentence structure, paragraphing, and Standard English (See Language Usage for grade level expectations).",
  },

  // ── Language Usage (8.LU) ───
  {
    id: "8.LU.1.A",
    grade: 8,
    strandCode: "LU",
    strandName: "Language Usage",
    subcategory: "1",
    indicator: "A",
    description:
      "Construct simple, compound, complex, and compound-complex sentences to communicate ideas clearly and add variety to writing.",
  },
  {
    id: "8.LU.1.B",
    grade: 8,
    strandCode: "LU",
    strandName: "Language Usage",
    subcategory: "1",
    indicator: "B",
    description:
      "Recognize and use pronoun-antecedent agreement, including indefinite, reflexive, and relative pronouns, when speaking and writing.",
  },
  {
    id: "8.LU.1.C",
    grade: 8,
    strandCode: "LU",
    strandName: "Language Usage",
    subcategory: "1",
    indicator: "C",
    description: "Use specific adjectives and adverbs to enhance speech and writing.",
  },
  {
    id: "8.LU.1.D",
    grade: 8,
    strandCode: "LU",
    strandName: "Language Usage",
    subcategory: "1",
    indicator: "D",
    description:
      "Arrange phrases and clauses within a sentence to improve meaning reader/listener interest, and style in writing.",
  },
  {
    id: "8.LU.1.E",
    grade: 8,
    strandCode: "LU",
    strandName: "Language Usage",
    subcategory: "1",
    indicator: "E",
    description: "Maintain consistent verb tense across paragraphs in writing.",
  },
  {
    id: "8.LU.2.A",
    grade: 8,
    strandCode: "LU",
    strandName: "Language Usage",
    subcategory: "2",
    indicator: "A",
    description:
      "Construct complete sentences with appropriate punctuation, avoiding comma splices and run-ons in writing.",
  },
  {
    id: "8.LU.2.B",
    grade: 8,
    strandCode: "LU",
    strandName: "Language Usage",
    subcategory: "2",
    indicator: "B",
    description: "Use and punctuate dialogue and direct quotations appropriately in writing.",
  },
  {
    id: "8.LU.2.C",
    grade: 8,
    strandCode: "LU",
    strandName: "Language Usage",
    subcategory: "2",
    indicator: "C",
    description: "Recognize and consistently spell frequently used words accurately.",
  },
  {
    id: "8.LU.2.D",
    grade: 8,
    strandCode: "LU",
    strandName: "Language Usage",
    subcategory: "2",
    indicator: "D",
    description: "Consult reference materials to check and correct spelling.",
  },

  // ── Communication and Multimodal Literacies (8.C) ───
  {
    id: "8.C.1.A",
    grade: 8,
    strandCode: "C",
    strandName: "Communication and Multimodal Literacies",
    subcategory: "1",
    indicator: "A",
    description:
      "Facilitate and contribute to a range of sustained collaborative discussions with diverse partners on grade eight topics and texts. This includes: i. Listening actively, offering and seeking ideas, and setting guidelines for presentations and discussions. ii. Working effectively and respectfully by actively contributing relevant and well-supported ideas and opinions and sharing responsibility for the collaborative work. iii. Asking clarifying questions and responding appropriately to others' questions to encourage discussion, foster understanding, and maintain focus on the topic. iv. Communicating agreement or tactful disagreement with others' ideas, using carefully constructed responses. v. Thoughtfully paraphrasing and summarizing ideas made during discussions. vi. Acknowledging new insights expressed by others, and, when justified, modifying their own views. vii. Valuing contributions made by each group member while exhibiting a willingness to make necessary concessions to accomplish a common goal. viii. Using self-reflection to evaluate one's own role in preparation and participation in small-group activities.",
  },
  {
    id: "8.C.2.A",
    grade: 8,
    strandCode: "C",
    strandName: "Communication and Multimodal Literacies",
    subcategory: "2",
    indicator: "A",
    description:
      "Deliver collaborative and individual formal and informal interactive presentations. This includes: i. Clearly communicating information in an organized and succinct manner. ii. Incorporating pertinent descriptions, facts, details, and examples to support the main ideas. iii. Using language and vocabulary appropriate to the audience, topic, and purpose, including speaking clearly at an understandable pace with appropriate tone and volume. iv. Responding to audience questions and comments with relevant evidence, observations, and ideas. v. Referencing source material as appropriate during the presentation.",
  },
  {
    id: "8.C.3.A",
    grade: 8,
    strandCode: "C",
    strandName: "Communication and Multimodal Literacies",
    subcategory: "3",
    indicator: "A",
    description:
      "Plan and present a multimodal presentation that i. Sequences ideas logically. ii. Uses pertinent descriptions, facts, and details. iii. Uses two or more communication modes to make meaning (e.g., still or moving images, gestures, spoken language, and written language). iv. Emphasizes different points of view.",
  },
  {
    id: "8.C.3.B",
    grade: 8,
    strandCode: "C",
    strandName: "Communication and Multimodal Literacies",
    subcategory: "3",
    indicator: "B",
    description:
      "Craft and publish audience-specific media messages that present claims and findings with relevant evidence and reasoning.",
  },
  {
    id: "8.C.4.A",
    grade: 8,
    strandCode: "C",
    strandName: "Communication and Multimodal Literacies",
    subcategory: "4",
    indicator: "A",
    description:
      "Examine how the media can influence beliefs, behaviors, and interpretations by using persuasive techniques (e.g., name calling, innuendo, glittering generalities, card stacking, bandwagon, testimonials, appeal to prestige, snobbery or plain folks, appeal to emotions).",
  },
  {
    id: "8.C.4.B",
    grade: 8,
    strandCode: "C",
    strandName: "Communication and Multimodal Literacies",
    subcategory: "4",
    indicator: "B",
    description:
      "Analyze how similar information is presented in diverse media formats by examining electronic, print, propaganda, and mass media.",
  },
  {
    id: "8.C.4.C",
    grade: 8,
    strandCode: "C",
    strandName: "Communication and Multimodal Literacies",
    subcategory: "4",
    indicator: "C",
    description:
      "Evaluate sources for their relationships, motives, intent, and content (e.g., social, emotional, commercial).",
  },

  // ── Research (8.R) ───
  {
    id: "8.R.1.A",
    grade: 8,
    strandCode: "R",
    strandName: "Research",
    subcategory: "1",
    indicator: "A",
    description:
      "Formulate and revise questions about a research topic, broadening or narrowing the inquiry as necessary.",
  },
  {
    id: "8.R.1.B",
    grade: 8,
    strandCode: "R",
    strandName: "Research",
    subcategory: "1",
    indicator: "B",
    description:
      "Collect, organize, and synthesize information from multiple sources using various notetaking formats.",
  },
  {
    id: "8.R.1.C",
    grade: 8,
    strandCode: "R",
    strandName: "Research",
    subcategory: "1",
    indicator: "C",
    description:
      "Evaluate and analyze the relevance, validity, and credibility of sources (primary, secondary, digital, and print) identifying main and supporting ideas, conflicting information, points of view, and any biases.",
  },
  {
    id: "8.R.1.D",
    grade: 8,
    strandCode: "R",
    strandName: "Research",
    subcategory: "1",
    indicator: "D",
    description:
      "Quote, summarize, and paraphrase research findings from primary and secondary sources, avoiding plagiarism by using own words and following ethical and legal guidelines.",
  },
  {
    id: "8.R.1.E",
    grade: 8,
    strandCode: "R",
    strandName: "Research",
    subcategory: "1",
    indicator: "E",
    description: "Organize and share findings in formal and informal oral or written formats.",
  },
  {
    id: "8.R.1.F",
    grade: 8,
    strandCode: "R",
    strandName: "Research",
    subcategory: "1",
    indicator: "F",
    description:
      "Cite primary and secondary sources using the Modern Language Association (MLA) or American Psychological Association (APA) style.",
  },
  {
    id: "8.R.1.G",
    grade: 8,
    strandCode: "R",
    strandName: "Research",
    subcategory: "1",
    indicator: "G",
    description:
      "Demonstrate ethical and responsible use of all sources, including the Internet, Artificial Intelligence (AI), and new technologies, as they develop.",
  },
];

// ── MISLABELLED: 8.C.1.B ───
// Not a VA SOL standard. VDOE's 8.C.1 has a single indicator (A). IXL's skill
// plan split off a multimodal-presentation item and numbered it B; that content
// is VDOE's 8.C.3.A, which now exists above.
//
// It is deliberately NOT deleted here. Heidi has 14 live mappings to it (4
// units, 10 lessons), and dropping the row would either violate the foreign key
// or silently strip alignment off real lessons. Re-pointing those mappings at
// 8.C.3.A and then removing the row is a data migration with a judgment call in
// it, so it lives in scripts/repair-8-C-1-B.ts and is run deliberately.
export const MISLABELLED_IDS = ["8.C.1.B"];

async function seed() {
  const db = connect();
  console.log(`Seeding ${grade8Standards.length} Grade 8 standards...`);

  let inserted = 0;
  let updated = 0;

  for (const std of grade8Standards) {
    // Upsert, not onConflictDoNothing. The previous version ignored conflicts,
    // which meant a corrected description could never reach a row that already
    // existed — the 40 IXL paraphrases would have survived any number of
    // re-seeds. Ids are stable, so updating in place preserves every
    // unit_standards / lesson_standards mapping.
    const [row] = await db
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
      .onConflictDoUpdate({
        target: standards.id,
        set: {
          grade: std.grade,
          strandCode: std.strandCode,
          strandName: std.strandName,
          subcategory: std.subcategory,
          indicator: std.indicator,
          description: std.description,
          framework: "VA_SOL_2024",
        },
      })
      .returning({ id: standards.id, createdAt: standards.createdAt });

    if (row) inserted++;
    else updated++;
  }

  console.log(`Done. ${inserted + updated} standards written (insert or update).`);
  console.log(
    `Note: ${MISLABELLED_IDS.join(", ")} is not a VA SOL standard and was left in place — see scripts/repair-8-C-1-B.ts.`
  );
}

// Only seed when run as a script. Without this the completeness test could not
// import the roster without writing to the database.
const invokedDirectly =
  typeof process !== "undefined" &&
  process.argv[1] !== undefined &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop() ?? "\0");

if (invokedDirectly) {
  seed().catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
}
