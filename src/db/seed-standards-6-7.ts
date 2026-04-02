// Seed script: loads VA SOL 2024 Grade 6 & 7 English standards into the database.
// Run with: npx tsx src/db/seed-standards-6-7.ts

import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { standards } from "./schema/standards";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

// ── VA SOL 2024 Grade 6 English Standards ───
// Source: VDOE documents
// Naming: {grade}.{strand}.{subcategory}.{indicator}

const grade6Standards = [
  // ── Developing Skilled Readers and Building Reading Stamina (DSR) ───
  {
    id: "6.DSR.A",
    grade: 6,
    strandCode: "DSR",
    strandName: "Developing Skilled Readers and Building Reading Stamina",
    subcategory: null,
    indicator: "A",
    description:
      "Read a variety of grade-level complex text with accuracy, automaticity, appropriate rate, and meaningful expression in successive readings to support comprehension. Monitor while reading to confirm or self-correct word recognition and understanding when necessary.",
  },
  {
    id: "6.DSR.B",
    grade: 6,
    strandCode: "DSR",
    strandName: "Developing Skilled Readers and Building Reading Stamina",
    subcategory: null,
    indicator: "B",
    description:
      "Proficiently read and comprehend a variety of literary and informational texts that exhibit complexity at the lower range of the grade 6-8 band.",
  },
  {
    id: "6.DSR.C",
    grade: 6,
    strandCode: "DSR",
    strandName: "Developing Skilled Readers and Building Reading Stamina",
    subcategory: null,
    indicator: "C",
    description:
      "When responding to text through discussion and/or writing, draw several pieces of evidence from grade-level complex texts to support claims, conclusions, and inferences, including quoting or paraphrasing from texts accurately and tracing where relevant evidence is located.",
  },
  {
    id: "6.DSR.D",
    grade: 6,
    strandCode: "DSR",
    strandName: "Developing Skilled Readers and Building Reading Stamina",
    subcategory: null,
    indicator: "D",
    description:
      "Regularly engage in reading a series of conceptually related texts organized around topics of study to build knowledge and vocabulary. Use this background knowledge as context for new learning.",
  },
  {
    id: "6.DSR.E",
    grade: 6,
    strandCode: "DSR",
    strandName: "Developing Skilled Readers and Building Reading Stamina",
    subcategory: null,
    indicator: "E",
    description:
      "Use reading strategies as needed to aid and monitor comprehension when encountering challenging sections of text. These sense-making strategies attend to text structure, common organizational structures, summarizing, asking questions of the text, and others.",
  },

  // ── Reading and Vocabulary (RV) ───
  {
    id: "6.RV.1.A",
    grade: 6,
    strandCode: "RV",
    strandName: "Reading and Vocabulary",
    subcategory: "1",
    indicator: "A",
    description:
      "Develop and accurately use general academic language and content-specific vocabulary by listening to, reading, and discussing a variety of grade-six texts and topics.",
  },
  {
    id: "6.RV.1.B",
    grade: 6,
    strandCode: "RV",
    strandName: "Reading and Vocabulary",
    subcategory: "1",
    indicator: "B",
    description:
      "Use context and sentence structure to determine multiple meanings of words and clarify the meanings of unfamiliar words and phrases.",
  },
  {
    id: "6.RV.1.C",
    grade: 6,
    strandCode: "RV",
    strandName: "Reading and Vocabulary",
    subcategory: "1",
    indicator: "C",
    description:
      "Apply knowledge of Greek and Latin roots and affixes to predict the meaning of unfamiliar words.",
  },
  {
    id: "6.RV.1.D",
    grade: 6,
    strandCode: "RV",
    strandName: "Reading and Vocabulary",
    subcategory: "1",
    indicator: "D",
    description:
      "Use the relationship between particular words, including synonyms and antonyms to better understand each word.",
  },
  {
    id: "6.RV.1.E",
    grade: 6,
    strandCode: "RV",
    strandName: "Reading and Vocabulary",
    subcategory: "1",
    indicator: "E",
    description:
      "Explain the construction and meaning of figurative language, including simile, hyperbole, metaphor, and personification.",
  },
  {
    id: "6.RV.1.F",
    grade: 6,
    strandCode: "RV",
    strandName: "Reading and Vocabulary",
    subcategory: "1",
    indicator: "F",
    description:
      "Clarify the meaning of an unknown word or select the applicable definition of a word from a text by using word reference materials.",
  },
  {
    id: "6.RV.1.G",
    grade: 6,
    strandCode: "RV",
    strandName: "Reading and Vocabulary",
    subcategory: "1",
    indicator: "G",
    description:
      "Use general and specialized word-reference materials, print and digital, to identify word origins, derivations, and pronunciations.",
  },
  {
    id: "6.RV.1.H",
    grade: 6,
    strandCode: "RV",
    strandName: "Reading and Vocabulary",
    subcategory: "1",
    indicator: "H",
    description:
      "Use newly learned words and phrases in multiple contexts, including in students' discussions and speaking and writing activities.",
  },

  // ── Reading Literary Text (RL) ───
  {
    id: "6.RL.1.A",
    grade: 6,
    strandCode: "RL",
    strandName: "Reading Literary Text",
    subcategory: "1",
    indicator: "A",
    description:
      "Summarize texts, including determining the central theme of stories, plays, or poems, and how they are conveyed through specific details.",
  },
  {
    id: "6.RL.1.B",
    grade: 6,
    strandCode: "RL",
    strandName: "Reading Literary Text",
    subcategory: "1",
    indicator: "B",
    description:
      "Describe plot developments in stories and dramas by examining the exposition, initiating event, central conflict, rising action, climax, falling action, and resolution.",
  },
  {
    id: "6.RL.1.C",
    grade: 6,
    strandCode: "RL",
    strandName: "Reading Literary Text",
    subcategory: "1",
    indicator: "C",
    description:
      "Differentiate between internal and external conflicts (e.g., individual vs. individual, individual vs. nature, individual vs. society, individual vs. technology, and individual vs. self) and explain how they impact character development and plot.",
  },
  {
    id: "6.RL.1.D",
    grade: 6,
    strandCode: "RL",
    strandName: "Reading Literary Text",
    subcategory: "1",
    indicator: "D",
    description:
      "Explain how static and dynamic characters impact the plot.",
  },
  {
    id: "6.RL.1.E",
    grade: 6,
    strandCode: "RL",
    strandName: "Reading Literary Text",
    subcategory: "1",
    indicator: "E",
    description:
      "Explain the role of the protagonist and antagonist on plot events.",
  },
  {
    id: "6.RL.2.A",
    grade: 6,
    strandCode: "RL",
    strandName: "Reading Literary Text",
    subcategory: "2",
    indicator: "A",
    description:
      "Describe the poetic elements in prose and poetry (e.g., rhyme, rhythm, repetition, alliteration, and onomatopoeia) and their intended impact on the reader.",
  },
  {
    id: "6.RL.2.B",
    grade: 6,
    strandCode: "RL",
    strandName: "Reading Literary Text",
    subcategory: "2",
    indicator: "B",
    description:
      "Explain elements of author's style as purposeful choices (e.g., imagery, figurative language, and word choice) to develop tone.",
  },
  {
    id: "6.RL.2.C",
    grade: 6,
    strandCode: "RL",
    strandName: "Reading Literary Text",
    subcategory: "2",
    indicator: "C",
    description:
      "Explain how an author develops the point of view (e.g., first-person, third person limited, third-person omniscient) of the narrator or speaker in a text and influences how events are described in stories, plays, or poems.",
  },
  {
    id: "6.RL.3.A",
    grade: 6,
    strandCode: "RL",
    strandName: "Reading Literary Text",
    subcategory: "3",
    indicator: "A",
    description:
      "Describe how the interactions between individuals, settings, events, and ideas within a text influence one another.",
  },
  {
    id: "6.RL.3.B",
    grade: 6,
    strandCode: "RL",
    strandName: "Reading Literary Text",
    subcategory: "3",
    indicator: "B",
    description:
      "Compare and contrast details in two or more paired literary fiction and nonfiction texts on the same topic or with similar themes, including how chapters, scenes, or stanzas work together to provide the overall structure of each text.",
  },

  // ── Reading Informational Text (RI) ───
  {
    id: "6.RI.1.A",
    grade: 6,
    strandCode: "RI",
    strandName: "Reading Informational Text",
    subcategory: "1",
    indicator: "A",
    description:
      "Summarize texts, including their main idea(s) and how they are developed with specific details.",
  },
  {
    id: "6.RI.1.B",
    grade: 6,
    strandCode: "RI",
    strandName: "Reading Informational Text",
    subcategory: "1",
    indicator: "B",
    description:
      "Describe how a key individual, event or idea is introduced, illustrated, and elaborated in historical, scientific, or technical texts (e.g., through examples or anecdotes).",
  },
  {
    id: "6.RI.1.C",
    grade: 6,
    strandCode: "RI",
    strandName: "Reading Informational Text",
    subcategory: "1",
    indicator: "C",
    description:
      "Trace the argument and specific claims in texts, distinguishing claims that are supported by evidence and reasons, from claims that are not.",
  },
  {
    id: "6.RI.2.A",
    grade: 6,
    strandCode: "RI",
    strandName: "Reading Informational Text",
    subcategory: "2",
    indicator: "A",
    description:
      "Determine the purpose of text features (e.g., boldface and italics type; type set in color; underlining; graphics and photographs; and headings and subheadings).",
  },
  {
    id: "6.RI.2.B",
    grade: 6,
    strandCode: "RI",
    strandName: "Reading Informational Text",
    subcategory: "2",
    indicator: "B",
    description:
      "Explain how an author's word choice, organizational pattern, and language structure convey the author's purpose.",
  },
  {
    id: "6.RI.2.C",
    grade: 6,
    strandCode: "RI",
    strandName: "Reading Informational Text",
    subcategory: "2",
    indicator: "C",
    description:
      "Explain how an author establishes and conveys a perspective or purpose in an informational text.",
  },
  {
    id: "6.RI.3.A",
    grade: 6,
    strandCode: "RI",
    strandName: "Reading Informational Text",
    subcategory: "3",
    indicator: "A",
    description:
      "Describe ideas within and between selections including how specific sentences, paragraphs, or sections contribute to the development of ideas.",
  },
  {
    id: "6.RI.3.B",
    grade: 6,
    strandCode: "RI",
    strandName: "Reading Informational Text",
    subcategory: "3",
    indicator: "B",
    description:
      "Compare and contrast one author's presentation of ideas or events with another's, identifying where the texts agree or disagree.",
  },

  // ── Writing (W) ───
  {
    id: "6.W.1.A",
    grade: 6,
    strandCode: "W",
    strandName: "Writing",
    subcategory: "1",
    indicator: "A",
    description:
      "Write narratives to entertain, to share a personal experience, or to alter an existing story that uses narrative techniques to develop the characters, event(s), and experience(s).",
  },
  {
    id: "6.W.1.B",
    grade: 6,
    strandCode: "W",
    strandName: "Writing",
    subcategory: "1",
    indicator: "B",
    description:
      "Write expository texts to examine a topic or concept, logically conveying ideas and information using text structures such as description, comparison, or cause-effect to create cohesion.",
  },
  {
    id: "6.W.1.C",
    grade: 6,
    strandCode: "W",
    strandName: "Writing",
    subcategory: "1",
    indicator: "C",
    description:
      "Write persuasively about topics or texts, including media messages, supporting well-defined claims with clear reasons and evidence that are logically grouped.",
  },
  {
    id: "6.W.1.D",
    grade: 6,
    strandCode: "W",
    strandName: "Writing",
    subcategory: "1",
    indicator: "D",
    description:
      "Write reflectively in response to text(s) read to demonstrate thinking with details, examples, and other evidence from the text(s).",
  },
  {
    id: "6.W.2.A",
    grade: 6,
    strandCode: "W",
    strandName: "Writing",
    subcategory: "2",
    indicator: "A",
    description:
      "Generate and organize ideas using the writing process (planning, drafting, revising, editing) to develop multi-paragraph texts. This includes: composing a thesis statement that focuses the topic and introduces the piece clearly; establishing a central idea incorporating evidence and maintaining an organized structure to fit the form and topic; elaborating and supporting ideas, using relevant facts, definitions, details, quotations, and/or examples; using transitions to show relationships between ideas, signal a shift or change in the writer's thoughts, and make sentences clearer; selecting vocabulary and information to enhance the central idea, tone, and voice; expanding and embedding ideas to create sentence variety; providing a concluding statement or section.",
  },
  {
    id: "6.W.3.A",
    grade: 6,
    strandCode: "W",
    strandName: "Writing",
    subcategory: "3",
    indicator: "A",
    description:
      "Revise writing for clarity of content, word choice, sentence variety, and transition among paragraphs.",
  },
  {
    id: "6.W.3.B",
    grade: 6,
    strandCode: "W",
    strandName: "Writing",
    subcategory: "3",
    indicator: "B",
    description:
      "Self-and peer-edit for capitalization, spelling, punctuation, sentence structure, paragraphing, and Standard English.",
  },

  // ── Language Usage (LU) ───
  {
    id: "6.LU.1.A",
    grade: 6,
    strandCode: "LU",
    strandName: "Language Usage",
    subcategory: "1",
    indicator: "A",
    description:
      "Construct simple, compound, and complex sentences to communicate ideas clearly and add variety to writing.",
  },
  {
    id: "6.LU.1.B",
    grade: 6,
    strandCode: "LU",
    strandName: "Language Usage",
    subcategory: "1",
    indicator: "B",
    description:
      "Use pronoun-antecedent agreement, including indefinite and reflexive pronouns when speaking and writing.",
  },
  {
    id: "6.LU.1.C",
    grade: 6,
    strandCode: "LU",
    strandName: "Language Usage",
    subcategory: "1",
    indicator: "C",
    description:
      "Use adverbs to modify verbs, adjectives, and other adverbs to express manner, place, time, frequency, degree, and level of certainty precisely when speaking and writing.",
  },
  {
    id: "6.LU.1.D",
    grade: 6,
    strandCode: "LU",
    strandName: "Language Usage",
    subcategory: "1",
    indicator: "D",
    description:
      "Use phrases and clauses within a sentence and apply appropriate subject-verb agreement when speaking and writing.",
  },
  {
    id: "6.LU.1.E",
    grade: 6,
    strandCode: "LU",
    strandName: "Language Usage",
    subcategory: "1",
    indicator: "E",
    description:
      "Form and use often confusing verbs (e.g., lie/lay, sit/set, rise/raise) correctly in sentences.",
  },
  {
    id: "6.LU.2.A",
    grade: 6,
    strandCode: "LU",
    strandName: "Language Usage",
    subcategory: "2",
    indicator: "A",
    description:
      "Construct complete sentences with appropriate punctuation, avoiding comma splices and run-ons in writing.",
  },
  {
    id: "6.LU.2.B",
    grade: 6,
    strandCode: "LU",
    strandName: "Language Usage",
    subcategory: "2",
    indicator: "B",
    description:
      "Use and punctuate dialogue and direct quotations appropriately in writing.",
  },
  {
    id: "6.LU.2.C",
    grade: 6,
    strandCode: "LU",
    strandName: "Language Usage",
    subcategory: "2",
    indicator: "C",
    description:
      "Recognize and consistently spell frequently used words accurately.",
  },
  {
    id: "6.LU.2.D",
    grade: 6,
    strandCode: "LU",
    strandName: "Language Usage",
    subcategory: "2",
    indicator: "D",
    description:
      "Consult reference materials to check and correct spelling.",
  },

  // ── Communication and Multimodal Literacies (C) ───
  {
    id: "6.C.1.A",
    grade: 6,
    strandCode: "C",
    strandName: "Communication and Multimodal Literacies",
    subcategory: "1",
    indicator: "A",
    description:
      "Facilitate and contribute to a range of sustained collaborative discussions with diverse partners on grade six topics and texts. This includes: listening actively through verbal and nonverbal communication and using agreed-upon discussion rules; working respectfully by building on others' ideas and showing value for others' ideas and contributions; asking relevant questions to clarify others' perspectives; communicating agreement or tactful disagreement with others' ideas, using carefully constructed responses; paraphrasing and summarizing key ideas being discussed by using ample evidence, examples, or details to support opinions and conclusions; evaluating the effectiveness of participant interactions and one's own contributions to the collaborative work.",
  },
  {
    id: "6.C.2.A",
    grade: 6,
    strandCode: "C",
    strandName: "Communication and Multimodal Literacies",
    subcategory: "2",
    indicator: "A",
    description:
      "Report orally on a topic or present an opinion. This includes: clearly communicating information in an organized or succinct manner; providing evidence to support the main ideas; using language, vocabulary, and style appropriate to the audience, topic, and purpose; using verbal communication skills, such as volume, tone, and enunciation to enhance the overall message; using nonverbal skills, such as proper posture and stance, gestures, and eye movement to enhance the overall message; encouraging audience participation through planned interactions (e.g., questioning, discussion, gathering responses, and movement); referencing source material as appropriate during the presentation.",
  },
  {
    id: "6.C.3.A",
    grade: 6,
    strandCode: "C",
    strandName: "Communication and Multimodal Literacies",
    subcategory: "3",
    indicator: "A",
    description:
      "Use media and visual literacy skills to select, organize, and create multimodal content that articulates the purpose of the presentation, using two or more communication modes to make meaning (e.g., still or moving images, gestures, spoken language, and written language).",
  },
  {
    id: "6.C.3.B",
    grade: 6,
    strandCode: "C",
    strandName: "Communication and Multimodal Literacies",
    subcategory: "3",
    indicator: "B",
    description:
      "Craft and publish audience-specific media messages that present claims and findings in a logical sequence.",
  },
  {
    id: "6.C.4.A",
    grade: 6,
    strandCode: "C",
    strandName: "Communication and Multimodal Literacies",
    subcategory: "4",
    indicator: "A",
    description:
      "Interpret information presented in diverse media formats and explain how it contributes to the topic.",
  },
  {
    id: "6.C.4.B",
    grade: 6,
    strandCode: "C",
    strandName: "Communication and Multimodal Literacies",
    subcategory: "4",
    indicator: "B",
    description:
      "Explain how media messages are intentionally constructed to impact a specific audience.",
  },
  {
    id: "6.C.4.C",
    grade: 6,
    strandCode: "C",
    strandName: "Communication and Multimodal Literacies",
    subcategory: "4",
    indicator: "C",
    description:
      "Explain the characteristics and analyze the effectiveness of a variety of media messages by considering the results and/or impact on the intended audience.",
  },

  // ── Research (R) ───
  {
    id: "6.R.1.A",
    grade: 6,
    strandCode: "R",
    strandName: "Research",
    subcategory: "1",
    indicator: "A",
    description:
      "Formulate appropriately narrow questions about a research topic and refocus the inquiry when appropriate.",
  },
  {
    id: "6.R.1.B",
    grade: 6,
    strandCode: "R",
    strandName: "Research",
    subcategory: "1",
    indicator: "B",
    description:
      "Collect information from multiple sources, using search terms effectively.",
  },
  {
    id: "6.R.1.C",
    grade: 6,
    strandCode: "R",
    strandName: "Research",
    subcategory: "1",
    indicator: "C",
    description:
      "Organize and synthesize information from multiple sources (primary, secondary, digital, and print) evaluating the relevance, usefulness, validity, and credibility of each source.",
  },
  {
    id: "6.R.1.D",
    grade: 6,
    strandCode: "R",
    strandName: "Research",
    subcategory: "1",
    indicator: "D",
    description:
      "Develop notes that include important concepts and summaries, including quoting, summarizing, and paraphrasing research findings, avoiding plagiarism by using own words and following ethical and legal guidelines for gathering and using information.",
  },
  {
    id: "6.R.1.E",
    grade: 6,
    strandCode: "R",
    strandName: "Research",
    subcategory: "1",
    indicator: "E",
    description:
      "Organize and share findings in formal and informal oral or written formats.",
  },
  {
    id: "6.R.1.F",
    grade: 6,
    strandCode: "R",
    strandName: "Research",
    subcategory: "1",
    indicator: "F",
    description:
      "Give credit for information quoted or paraphrased using standard citations (e.g., author, article title, webpage, and publication date).",
  },
  {
    id: "6.R.1.G",
    grade: 6,
    strandCode: "R",
    strandName: "Research",
    subcategory: "1",
    indicator: "G",
    description:
      "Demonstrate ethical and responsible use of all sources, including the Internet, Artificial Intelligence (AI), and new technologies as they develop.",
  },
];

// ── VA SOL 2024 Grade 7 English Standards ───

const grade7Standards = [
  // ── Developing Skilled Readers and Building Reading Stamina (DSR) ───
  {
    id: "7.DSR.A",
    grade: 7,
    strandCode: "DSR",
    strandName: "Developing Skilled Readers and Building Reading Stamina",
    subcategory: null,
    indicator: "A",
    description:
      "Read a variety of grade-level complex text with accuracy, automaticity, appropriate rate, and meaningful expression in successive readings to support comprehension. Monitor while reading to confirm or self-correct word recognition and understanding, as necessary.",
  },
  {
    id: "7.DSR.B",
    grade: 7,
    strandCode: "DSR",
    strandName: "Developing Skilled Readers and Building Reading Stamina",
    subcategory: null,
    indicator: "B",
    description:
      "Proficiently read and comprehend a variety of literary and informational texts that exhibit complexity at the mid-range of the grades 6-8 band.",
  },
  {
    id: "7.DSR.C",
    grade: 7,
    strandCode: "DSR",
    strandName: "Developing Skilled Readers and Building Reading Stamina",
    subcategory: null,
    indicator: "C",
    description:
      "When responding to text through discussion and/or writing, draw several pieces of evidence from grade-level complex texts to support claims, conclusions, and inferences, including quoting or paraphrasing from texts accurately and tracing where relevant evidence is located.",
  },
  {
    id: "7.DSR.D",
    grade: 7,
    strandCode: "DSR",
    strandName: "Developing Skilled Readers and Building Reading Stamina",
    subcategory: null,
    indicator: "D",
    description:
      "Regularly engage in reading a series of conceptually related texts organized around topics of study to build knowledge and vocabulary. Use this background knowledge as context for new learning.",
  },
  {
    id: "7.DSR.E",
    grade: 7,
    strandCode: "DSR",
    strandName: "Developing Skilled Readers and Building Reading Stamina",
    subcategory: null,
    indicator: "E",
    description:
      "Use reading strategies as needed to aid and monitor comprehension when encountering challenging sections of text. These sense-making strategies attend to text structure, common organizational structures, summarizing, asking questions of the text, and others.",
  },

  // ── Reading and Vocabulary (RV) ───
  {
    id: "7.RV.1.A",
    grade: 7,
    strandCode: "RV",
    strandName: "Reading and Vocabulary",
    subcategory: "1",
    indicator: "A",
    description:
      "Develop and accurately use general academic language and content-specific vocabulary by listening to, reading, and discussing a variety of grade-seven texts and topics.",
  },
  {
    id: "7.RV.1.B",
    grade: 7,
    strandCode: "RV",
    strandName: "Reading and Vocabulary",
    subcategory: "1",
    indicator: "B",
    description:
      "Use context (e.g., the overall meaning of a sentence or paragraph; a word's position or function in a sentence) to determine the meaning of words or phrases.",
  },
  {
    id: "7.RV.1.C",
    grade: 7,
    strandCode: "RV",
    strandName: "Reading and Vocabulary",
    subcategory: "1",
    indicator: "C",
    description:
      "Apply knowledge of Greek and Latin roots and affixes to predict the meaning of unfamiliar words.",
  },
  {
    id: "7.RV.1.D",
    grade: 7,
    strandCode: "RV",
    strandName: "Reading and Vocabulary",
    subcategory: "1",
    indicator: "D",
    description:
      "Use the relationship between particular words, including synonyms, antonyms, and analogies to better understand each word.",
  },
  {
    id: "7.RV.1.E",
    grade: 7,
    strandCode: "RV",
    strandName: "Reading and Vocabulary",
    subcategory: "1",
    indicator: "E",
    description:
      "Analyze the construction and meaning of figurative language, including simile, hyperbole, metaphor, and personification.",
  },
  {
    id: "7.RV.1.F",
    grade: 7,
    strandCode: "RV",
    strandName: "Reading and Vocabulary",
    subcategory: "1",
    indicator: "F",
    description:
      "Distinguish among the nuances in the meaning of connotations of words with similar denotations.",
  },
  {
    id: "7.RV.1.G",
    grade: 7,
    strandCode: "RV",
    strandName: "Reading and Vocabulary",
    subcategory: "1",
    indicator: "G",
    description:
      "Use general and specialized word-reference materials, print and digital, to identify word origins and derivations, pronunciations, precise meanings, and their parts of speech.",
  },
  {
    id: "7.RV.1.H",
    grade: 7,
    strandCode: "RV",
    strandName: "Reading and Vocabulary",
    subcategory: "1",
    indicator: "H",
    description:
      "Use newly learned words and phrases in multiple contexts, including in students' discussions and speaking and writing activities.",
  },

  // ── Reading Literary Text (RL) ───
  {
    id: "7.RL.1.A",
    grade: 7,
    strandCode: "RL",
    strandName: "Reading Literary Text",
    subcategory: "1",
    indicator: "A",
    description:
      "Describe stated or implied themes of texts and analyze their development throughout the texts using specific details.",
  },
  {
    id: "7.RL.1.B",
    grade: 7,
    strandCode: "RL",
    strandName: "Reading Literary Text",
    subcategory: "1",
    indicator: "B",
    description:
      "Analyze how the central conflict and key elements (e.g., exposition, initiating event, rising action, climax, falling action, and resolution) impact plot development.",
  },
  {
    id: "7.RL.1.C",
    grade: 7,
    strandCode: "RL",
    strandName: "Reading Literary Text",
    subcategory: "1",
    indicator: "C",
    description:
      "Explain how static and dynamic characters and the roles of protagonist and antagonist influence plot events.",
  },
  {
    id: "7.RL.2.A",
    grade: 7,
    strandCode: "RL",
    strandName: "Reading Literary Text",
    subcategory: "2",
    indicator: "A",
    description:
      "Analyze how elements of authors' styles (e.g., word choice, dialogue, form, voice, rhyme, rhythm, and/or sound devices) contribute to meaning in various forms of prose and poetry.",
  },
  {
    id: "7.RL.2.B",
    grade: 7,
    strandCode: "RL",
    strandName: "Reading Literary Text",
    subcategory: "2",
    indicator: "B",
    description:
      "Analyze how the elements of an author's style (e.g., word choice, sentence structure, dialogue, figurative language, imagery) are used to influence and develop tone.",
  },
  {
    id: "7.RL.2.C",
    grade: 7,
    strandCode: "RL",
    strandName: "Reading Literary Text",
    subcategory: "2",
    indicator: "C",
    description:
      "Explain how an author develops the points of view of different characters in a text (e.g., first-person, third person limited, third-person omniscient) and how they affect the reader's interpretation of a text.",
  },
  {
    id: "7.RL.3.A",
    grade: 7,
    strandCode: "RL",
    strandName: "Reading Literary Text",
    subcategory: "3",
    indicator: "A",
    description:
      "Explain how particular elements of stories or dramas interact including how settings shape and influence characters and plot.",
  },
  {
    id: "7.RL.3.B",
    grade: 7,
    strandCode: "RL",
    strandName: "Reading Literary Text",
    subcategory: "3",
    indicator: "B",
    description:
      "Compare and contrast texts in different forms or genres (e.g., stories and poems; historical novels and fantasy stories) in terms of their approaches to similar themes and topics.",
  },

  // ── Reading Informational Text (RI) ───
  {
    id: "7.RI.1.A",
    grade: 7,
    strandCode: "RI",
    strandName: "Reading Informational Text",
    subcategory: "1",
    indicator: "A",
    description:
      "Create a main idea statement and provide an accurate summary of how key events or ideas develop through the text.",
  },
  {
    id: "7.RI.1.B",
    grade: 7,
    strandCode: "RI",
    strandName: "Reading Informational Text",
    subcategory: "1",
    indicator: "B",
    description:
      "Analyze how the author unfolds a perspective or series of ideas or events in historical, scientific, or technical texts, including the order in which the points are made and how they are introduced and developed.",
  },
  {
    id: "7.RI.1.C",
    grade: 7,
    strandCode: "RI",
    strandName: "Reading Informational Text",
    subcategory: "1",
    indicator: "C",
    description:
      "Trace the argument and specific claims in texts and assess whether all the evidence presented is relevant and whether irrelevant evidence was introduced.",
  },
  {
    id: "7.RI.2.A",
    grade: 7,
    strandCode: "RI",
    strandName: "Reading Informational Text",
    subcategory: "2",
    indicator: "A",
    description:
      "Analyze how an author uses text features (e.g., boldface and italics; type set in color; underlining; indentation; sidebars; illustrations, graphics and photographs; headings and subheadings; footnotes and annotations) to enhance and support the reader's comprehension.",
  },
  {
    id: "7.RI.2.B",
    grade: 7,
    strandCode: "RI",
    strandName: "Reading Informational Text",
    subcategory: "2",
    indicator: "B",
    description:
      "Analyze how an author's word choice, organizational pattern, and language structure impact the author's purpose and support the reader's comprehension.",
  },
  {
    id: "7.RI.2.C",
    grade: 7,
    strandCode: "RI",
    strandName: "Reading Informational Text",
    subcategory: "2",
    indicator: "C",
    description:
      "Analyze how an author's purpose(s) reflects the author's perspective (e.g., beliefs, assumptions, biases) and influences the meaning of an informational text.",
  },
  {
    id: "7.RI.3.A",
    grade: 7,
    strandCode: "RI",
    strandName: "Reading Informational Text",
    subcategory: "3",
    indicator: "A",
    description:
      "Analyze ideas within and between selections including how specific sentences, paragraphs, or sections contribute to the development and meaning of ideas.",
  },
  {
    id: "7.RI.3.B",
    grade: 7,
    strandCode: "RI",
    strandName: "Reading Informational Text",
    subcategory: "3",
    indicator: "B",
    description:
      "Compare and contrast how two or more authors writing about the same topic shape their presentations or viewpoints of key information by emphasizing different facts, opinions, and reasoning.",
  },

  // ── Writing (W) ───
  {
    id: "7.W.1.A",
    grade: 7,
    strandCode: "W",
    strandName: "Writing",
    subcategory: "1",
    indicator: "A",
    description:
      "Write narratives to develop real or imagined experiences or to alter an existing text, using a variety of precise words and phrases and transitional words to develop the characters, convey sequence, and signal shifts from one timeframe or setting to another.",
  },
  {
    id: "7.W.1.B",
    grade: 7,
    strandCode: "W",
    strandName: "Writing",
    subcategory: "1",
    indicator: "B",
    description:
      "Write expository texts to examine a topic or concept that develops the focus with relevant facts, definitions, concrete details, or other information from multiple credible sources, using structures and patterns (e.g., description, enumeration, classification, comparison, problem-solution, or cause-effect) to clarify relationships among ideas.",
  },
  {
    id: "7.W.1.C",
    grade: 7,
    strandCode: "W",
    strandName: "Writing",
    subcategory: "1",
    indicator: "C",
    description:
      "Write persuasively supporting a well-defined point of view with appropriate claims, relevant evidence, and clear reasoning that are logically grouped.",
  },
  {
    id: "7.W.1.D",
    grade: 7,
    strandCode: "W",
    strandName: "Writing",
    subcategory: "1",
    indicator: "D",
    description:
      "Write reflectively in response to reading to demonstrate thinking with details, examples, and other evidence from the text(s).",
  },
  {
    id: "7.W.2.A",
    grade: 7,
    strandCode: "W",
    strandName: "Writing",
    subcategory: "2",
    indicator: "A",
    description:
      "Generate and organize ideas using the writing process (planning, drafting, revising, editing) to develop multi-paragraph texts. This includes: composing a thesis statement that states a position or explains the purpose; establishing a central idea that aligns with the thesis and maintains an organized structure to fit form and topic; defending conclusions or positions with reasons and precise, relevant evidence (e.g., facts, definitions, details, quotations, and examples); using transitions within and between paragraphs to signal shifts in writing and clarify the relationships among ideas and concepts; developing voice and tone by using language that provides vivid and precise vocabulary to enhance the meaning of the writing; expanding and embedding ideas to create sentence variety; providing a concluding statement or section.",
  },
  {
    id: "7.W.3.A",
    grade: 7,
    strandCode: "W",
    strandName: "Writing",
    subcategory: "3",
    indicator: "A",
    description:
      "Revise writing for clarity of content, word choice, sentence variety, and transition among paragraphs.",
  },
  {
    id: "7.W.3.B",
    grade: 7,
    strandCode: "W",
    strandName: "Writing",
    subcategory: "3",
    indicator: "B",
    description:
      "Self-and peer-edit writing for capitalization, spelling, punctuation, sentence structure, paragraphing, and Standard English.",
  },

  // ── Language Usage (LU) ───
  {
    id: "7.LU.1.A",
    grade: 7,
    strandCode: "LU",
    strandName: "Language Usage",
    subcategory: "1",
    indicator: "A",
    description:
      "Construct simple, compound, complex, and compound-complex sentences to communicate ideas clearly and add variety to writing.",
  },
  {
    id: "7.LU.1.B",
    grade: 7,
    strandCode: "LU",
    strandName: "Language Usage",
    subcategory: "1",
    indicator: "B",
    description:
      "Recognize and use pronoun-antecedent agreement, including indefinite, reflexive, and relative pronouns, when speaking and writing.",
  },
  {
    id: "7.LU.1.C",
    grade: 7,
    strandCode: "LU",
    strandName: "Language Usage",
    subcategory: "1",
    indicator: "C",
    description:
      "Use specific adjectives and adverbs to enhance speech and writing.",
  },
  {
    id: "7.LU.1.D",
    grade: 7,
    strandCode: "LU",
    strandName: "Language Usage",
    subcategory: "1",
    indicator: "D",
    description:
      "Arrange phrases and clauses within a sentence and apply appropriate subject-verb agreement to improve meaning, reader/listener interest, and style in writing.",
  },
  {
    id: "7.LU.1.E",
    grade: 7,
    strandCode: "LU",
    strandName: "Language Usage",
    subcategory: "1",
    indicator: "E",
    description:
      "Maintain consistent verb tense across paragraphs in writing.",
  },
  {
    id: "7.LU.2.A",
    grade: 7,
    strandCode: "LU",
    strandName: "Language Usage",
    subcategory: "2",
    indicator: "A",
    description:
      "Construct complete sentence with appropriate punctuation, avoiding comma splices and run-ons in writing.",
  },
  {
    id: "7.LU.2.B",
    grade: 7,
    strandCode: "LU",
    strandName: "Language Usage",
    subcategory: "2",
    indicator: "B",
    description:
      "Use and punctuate dialogue and direct quotations appropriately in writing.",
  },
  {
    id: "7.LU.2.C",
    grade: 7,
    strandCode: "LU",
    strandName: "Language Usage",
    subcategory: "2",
    indicator: "C",
    description:
      "Recognize and consistently spell frequently used words accurately.",
  },
  {
    id: "7.LU.2.D",
    grade: 7,
    strandCode: "LU",
    strandName: "Language Usage",
    subcategory: "2",
    indicator: "D",
    description:
      "Consult reference materials to check and correct spelling.",
  },

  // ── Communication and Multimodal Literacies (C) ───
  {
    id: "7.C.1.A",
    grade: 7,
    strandCode: "C",
    strandName: "Communication and Multimodal Literacies",
    subcategory: "1",
    indicator: "A",
    description:
      "Facilitate and contribute to a range of sustained collaborative discussions with diverse partners on grade seven topics and texts. This includes: listening actively through verbal and nonverbal communication and using agreed-upon discussion rules; working effectively and respectfully by building on others' ideas, actively contributing relevant and well-supported ideas and opinions, and sharing responsibility for the collaborative work; asking and responding to probing questions and providing appropriate feedback within structured discussions; communicating agreement or tactful disagreement with others' ideas using carefully constructed statements; paraphrasing, summarizing, and writing reflectively in response to the ideas being discussed; evaluating the effectiveness of participant interactions and one's own contributions to small group activities.",
  },
  {
    id: "7.C.2.A",
    grade: 7,
    strandCode: "C",
    strandName: "Communication and Multimodal Literacies",
    subcategory: "2",
    indicator: "A",
    description:
      "Report orally on a topic or text or present an opinion. This includes: clearly communicating information in an organized and succinct manner; providing evidence to support the main ideas, including pertinent descriptions, facts, details, and examples; adjusting verbal and nonverbal communication skills appropriate to audience, topic, and purpose to enhance the overall message; responding to audience questions and comments with relevant evidence, observations, and ideas; referencing source material as appropriate during the presentation.",
  },
  {
    id: "7.C.2.B",
    grade: 7,
    strandCode: "C",
    strandName: "Communication and Multimodal Literacies",
    subcategory: "2",
    indicator: "B",
    description:
      "Memorize and recite a poem demonstrating inflection and meaningful expression that is appropriate to the tone and voice of the selection.",
  },
  {
    id: "7.C.3.A",
    grade: 7,
    strandCode: "C",
    strandName: "Communication and Multimodal Literacies",
    subcategory: "3",
    indicator: "A",
    description:
      "Use medial and visual literacy skills to select, organize, and create multimodal content that articulates and enhances the purpose of the presentation using two or more communication modes to make meaning (e.g., still or moving images, gestures, spoken language, and written language).",
  },
  {
    id: "7.C.3.B",
    grade: 7,
    strandCode: "C",
    strandName: "Communication and Multimodal Literacies",
    subcategory: "3",
    indicator: "B",
    description:
      "Craft and publish audience-specific media messages that present claims and findings with relevant evidence in a logical sequence.",
  },
  {
    id: "7.C.4.A",
    grade: 7,
    strandCode: "C",
    strandName: "Communication and Multimodal Literacies",
    subcategory: "4",
    indicator: "A",
    description:
      "Explain persuasive/informative techniques used in media to sway the audience (e.g., innuendo, card stacking, bandwagon, and appeal to emotions).",
  },
  {
    id: "7.C.4.B",
    grade: 7,
    strandCode: "C",
    strandName: "Communication and Multimodal Literacies",
    subcategory: "4",
    indicator: "B",
    description:
      "Analyze media messages for facts, opinions, persuasive messages, word choice, and viewpoint.",
  },
  {
    id: "7.C.4.C",
    grade: 7,
    strandCode: "C",
    strandName: "Communication and Multimodal Literacies",
    subcategory: "4",
    indicator: "C",
    description:
      "Compare and contrast the effectiveness of techniques in auditory, visual, and written media messages (e.g., authorship, format, content, purpose) on the intended audience.",
  },

  // ── Research (R) ───
  {
    id: "7.R.1.A",
    grade: 7,
    strandCode: "R",
    strandName: "Research",
    subcategory: "1",
    indicator: "A",
    description:
      "Formulate questions about a research topic, broadening or narrowing the inquiry as necessary.",
  },
  {
    id: "7.R.1.B",
    grade: 7,
    strandCode: "R",
    strandName: "Research",
    subcategory: "1",
    indicator: "B",
    description:
      "Collect, organize, and synthesize information from multiple sources using various notetaking formats.",
  },
  {
    id: "7.R.1.C",
    grade: 7,
    strandCode: "R",
    strandName: "Research",
    subcategory: "1",
    indicator: "C",
    description:
      "Evaluate and analyze the relevance, validity, and credibility of each source (primary, secondary, digital, and print), determining what information to include and exclude.",
  },
  {
    id: "7.R.1.D",
    grade: 7,
    strandCode: "R",
    strandName: "Research",
    subcategory: "1",
    indicator: "D",
    description:
      "Quote, summarize, and paraphrase research findings from primary and secondary sources, avoiding plagiarism by using own words and following ethical and legal guidelines.",
  },
  {
    id: "7.R.1.E",
    grade: 7,
    strandCode: "R",
    strandName: "Research",
    subcategory: "1",
    indicator: "E",
    description:
      "Organize and share findings in formal and informal oral written formats.",
  },
  {
    id: "7.R.1.F",
    grade: 7,
    strandCode: "R",
    strandName: "Research",
    subcategory: "1",
    indicator: "F",
    description:
      "Give credit for information quoted or paraphrased, using standard citations (e.g., author, article title and webpage, and publication date).",
  },
  {
    id: "7.R.1.G",
    grade: 7,
    strandCode: "R",
    strandName: "Research",
    subcategory: "1",
    indicator: "G",
    description:
      "Demonstrate ethical and responsible use of all sources, including the Internet, Artificial Intelligence (AI), and new technologies, as they develop.",
  },
];

async function seed() {
  console.log(`Seeding ${grade6Standards.length} Grade 6 standards...`);

  for (const std of grade6Standards) {
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

  console.log(`Done! ${grade6Standards.length} Grade 6 standards seeded.`);

  console.log(`Seeding ${grade7Standards.length} Grade 7 standards...`);

  for (const std of grade7Standards) {
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

  console.log(`Done! ${grade7Standards.length} Grade 7 standards seeded.`);
  console.log("All Grade 6 & 7 standards seeded successfully.");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
