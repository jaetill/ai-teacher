// Seed script: creates Grade 8 ELA course and Q1 unit from the teacher's
// actual curriculum documents (Curriculum Overview + Timeline).
//
// This is Q1 ONLY — not a full year plan. Other quarters will be added later.
//
// Run with: npx tsx src/db/seed-curriculum-g8-q1.ts

import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { courses } from "./schema/courses";
import { units, unitStandards } from "./schema/units";
import { lessons } from "./schema/lessons";
import { eq } from "drizzle-orm";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

async function seed() {
  // ── 1. Create or find Grade 8 ELA course ───
  const existingCourses = await db
    .select()
    .from(courses)
    .where(eq(courses.grade, 8));

  let courseId: string;
  if (existingCourses.length > 0) {
    courseId = existingCourses[0].id;
    console.log("Found existing Grade 8 course:", courseId);
  } else {
    const [newCourse] = await db
      .insert(courses)
      .values({
        title: "Grade 8 English Language Arts",
        grade: 8,
        subject: "ELA",
        description:
          "8th grade English Language Arts covering literature, informational text, writing, language usage, communication, and research aligned to VA SOL 2024.",
        teacherNotes:
          "Resources: No Red Ink (grammar), CommonLit (nonfiction/poetry), Newsela (critical literacy), novel studies.",
      })
      .returning({ id: courses.id });
    courseId = newCourse.id;
    console.log("Created Grade 8 course:", courseId);
  }

  // ── 2. Create Q1 unit: Night & The Hiding Place ───
  const [unit] = await db
    .insert(units)
    .values({
      courseId,
      title: "Night & The Hiding Place — Comparative Memoir Study",
      sortOrder: 1,
      durationWeeks: 7,
      summary:
        "Comparative memoir study of Night (Elie Wiesel) and The Hiding Place (Corrie ten Boom). Students analyze author voice, tone, theme, and literary devices while exploring essential questions about justice, courage, bystander behavior, and bias. Includes supporting texts: The Lottery (Shirley Jackson), poetry, and nonfiction articles on the Holocaust and ethics.",
      essentialQuestions: [
        "What is justice and who shapes it?",
        "What impacts our ability to stand up for what we believe is just?",
        "How do authors use literature to comment on society?",
        "How does bias and discrimination impact someone's perspective?",
      ].join("\n"),
      anchorTexts:
        "Night (Elie Wiesel), The Hiding Place (Corrie ten Boom), The Lottery (Shirley Jackson), First They Came (Martin Niemöller)",
      contentWarnings:
        "Holocaust content — trauma, violence, dehumanization. Some students may find Night emotionally distressing. Consider trigger warnings and alternative text options.",
      teacherNotes:
        "Quarter 1 unit. Assessments: Comparative Literary Analysis (major writing), vocabulary quiz, reading quizzes, journal responses. Grammar focus: verb tense, subject-verb agreement, run-ons, complex sentences, conjunctions.",
      source: "human",
    })
    .returning({ id: units.id });

  console.log("Created Q1 unit:", unit.id);

  // ── 3. Map standards to unit ───
  // Standards identified from the Curriculum Overview document
  const unitStandardIds = [
    // Reading Literary Text
    "8.RL.1.A", // Theme development
    "8.RL.1.B", // Plot patterns
    "8.RL.1.C", // Dynamic vs static characters
    "8.RL.2.A", // Poetic elements
    "8.RL.2.B", // Author's style / tone and voice
    "8.RL.2.C", // Contrasting character perspectives
    "8.RL.2.D", // Literary devices (foreshadowing, flashback, symbolism, irony)
    "8.RL.3.B", // Compare fictional portrayals with historical accounts
    // Reading and Vocabulary
    "8.RV.1.A", // Academic vocabulary
    "8.RV.1.E", // Figurative language
    "8.RV.1.F", // Connotative vs denotative
    // Writing
    "8.W.1.A", // Narrative writing
    "8.W.1.B", // Expository writing
    // Language Usage
    "8.LU.1.A", // Grammar conventions
    "8.LU.1.B", // Spelling, capitalization, punctuation
    // Communication
    "8.C.1.A", // Collaborative discussions
    // DSR
    "8.DSR.A", // Read with accuracy and expression
    "8.DSR.C", // Evidence from complex texts
  ];

  for (const standardId of unitStandardIds) {
    await db
      .insert(unitStandards)
      .values({
        unitId: unit.id,
        standardId,
        emphasis: "primary",
      })
      .onConflictDoNothing();
  }
  console.log(`Mapped ${unitStandardIds.length} standards to unit`);

  // ── 4. Create lessons from the Timeline document ───
  // ~20 instructional days across 7 weeks
  const lessonData = [
    {
      title: "Welcome & Where I'm From Poem",
      sortOrder: 1,
      durationMinutes: 45,
      objectives: [
        "Build classroom community through personal writing",
        "Review figurative language and imagery",
      ],
      lessonPlan: {
        activities: [
          "Welcome activities and introductions",
          "Where I'm From Poem introduction (Canva or paper)",
          "Review figurative language and imagery",
          "Figurative language sort activity",
        ],
      },
    },
    {
      title: "Where I'm From Poem — Figurative Language Review",
      sortOrder: 2,
      durationMinutes: 45,
      objectives: [
        "Review figurative language through creative writing",
        "Practice imagery in personal poetry",
      ],
      lessonPlan: {
        activities: [
          "Continue figurative language review",
          "Where I'm From Poem work",
        ],
      },
    },
    {
      title: "Where I'm From Poem — Independent Work",
      sortOrder: 3,
      durationMinutes: 45,
      objectives: [
        "Complete personal poem using figurative language",
      ],
      lessonPlan: {
        activities: [
          "Independent work on Where I'm From Poem",
          "Peer sharing",
        ],
      },
    },
    {
      title: "Bystander Effect & Introduction to Night",
      sortOrder: 4,
      durationMinutes: 45,
      objectives: [
        "Understand the bystander effect and its relevance to Holocaust literature",
        "Engage with essential questions about justice and standing up for beliefs",
        "Introduction to Night: characters, vocabulary",
      ],
      lessonPlan: {
        activities: [
          "Bystander Effect lesson with videos",
          "Essential questions discussion",
          "\"First They Came\" poem analysis",
          "Night Anticipation Guide",
          "Intro to Night: character list, vocabulary",
        ],
      },
    },
    {
      title: "Gallery Walk, Vocabulary & Terms",
      sortOrder: 5,
      durationMinutes: 45,
      objectives: [
        "Build background knowledge through gallery walk",
        "Learn key vocabulary for the unit",
      ],
      lessonPlan: {
        activities: [
          "Gallery walk with Holocaust-related terms and images",
          "Vocabulary introduction and practice",
        ],
      },
    },
    {
      title: "The Hiding Place — Conflict Analysis",
      sortOrder: 6,
      durationMinutes: 45,
      objectives: [
        "Review The Hiding Place through the lens of conflict",
        "Analyze types of conflict in memoir",
      ],
      lessonPlan: {
        activities: [
          "Lesson and activity on The Hiding Place",
          "Review Hiding Place lessons through conflict framework",
        ],
      },
    },
    {
      title: "Read Aloud, Genre Walk & Grammar",
      sortOrder: 7,
      durationMinutes: 45,
      objectives: [
        "Engage with text through read-aloud",
        "Explore genre characteristics",
        "Grammar practice",
      ],
      lessonPlan: {
        activities: [
          "Read aloud session",
          "Genre walk activity",
          "Grammar practice",
          "Vocabulary review",
        ],
      },
    },
    {
      title: "Night Book 1 — Voice and Tone",
      sortOrder: 8,
      durationMinutes: 45,
      objectives: [
        "Analyze Wiesel's voice and tone in Night Book 1",
        "Identify author's style choices",
      ],
      lessonPlan: {
        activities: [
          "Night Book 1 discussion",
          "Voice and tone analysis activity",
        ],
      },
    },
    {
      title: "Night Book 1 — Foreshadowing and Ethics",
      sortOrder: 9,
      durationMinutes: 45,
      objectives: [
        "Identify foreshadowing in Night",
        "Discuss ethical dilemmas presented in the text",
      ],
      lessonPlan: {
        activities: [
          "Night Book 1 continued",
          "Foreshadowing identification activity",
          "Ethics discussion and activity",
        ],
      },
    },
    {
      title: "Herd Behavior Unit",
      sortOrder: 10,
      durationMinutes: 45,
      objectives: [
        "Understand herd behavior and its connection to bystander effect",
        "Connect psychological concepts to Holocaust literature",
      ],
      lessonPlan: {
        activities: ["Herd Behavior lesson and student copy activity"],
      },
    },
    {
      title: "Night Book 2 — Figurative Language",
      sortOrder: 11,
      durationMinutes: 45,
      objectives: [
        "Analyze figurative language in Night Book 2",
        "Identify metaphor, simile, and imagery",
      ],
      lessonPlan: {
        activities: [
          "Night Book 2 discussion",
          "Figurative language analysis activity",
        ],
      },
    },
    {
      title: "Night Book 2 — Conflict",
      sortOrder: 12,
      durationMinutes: 45,
      objectives: [
        "Analyze internal and external conflicts in Night",
        "Compare conflict types across texts",
      ],
      lessonPlan: {
        activities: [
          "Night continued reading",
          "Conflict analysis activity",
        ],
      },
    },
    {
      title: "Night — Setting and Tone / Catch-up Day",
      sortOrder: 13,
      durationMinutes: 45,
      objectives: [
        "Analyze how setting impacts tone in Night",
        "Grammar review and catch-up",
      ],
      lessonPlan: {
        activities: [
          "Night setting and tone discussion",
          "Catch-up on grammar and reading",
        ],
      },
    },
    {
      title: "Night Book 3 — Allusion and Cause & Effect",
      sortOrder: 14,
      durationMinutes: 45,
      objectives: [
        "Identify allusions in Night Book 3",
        "Analyze cause and effect relationships",
      ],
      lessonPlan: {
        activities: [
          "Night Book 3 discussion",
          "Allusion identification",
          "Cause and effect activity",
        ],
      },
    },
    {
      title: "Poetry — Sonnet Study",
      sortOrder: 15,
      durationMinutes: 45,
      objectives: [
        "Understand sonnet structure and poetic elements",
        "Analyze poetry terms",
      ],
      lessonPlan: {
        activities: ["Sonnet study lesson", "Poetry terms practice"],
      },
    },
    {
      title: "Vocabulary Quiz & Poetry",
      sortOrder: 16,
      durationMinutes: 45,
      objectives: [
        "Demonstrate vocabulary knowledge",
        "Continue poetry analysis",
      ],
      lessonPlan: {
        activities: [
          "Vocabulary Quiz",
          "Reading and grammar practice",
          "Poetry continuation",
        ],
        assessments: ["Vocabulary Quiz"],
      },
    },
    {
      title: "Night Book 4 — Theme and Irony",
      sortOrder: 17,
      durationMinutes: 45,
      objectives: [
        "Analyze theme development across Night",
        "Identify irony in the text",
      ],
      lessonPlan: {
        activities: [
          "Night Book 4 discussion",
          "Theme and irony analysis",
          "Snapshot writing activity",
        ],
      },
    },
    {
      title: "Writing Comparison — Night & The Hiding Place",
      sortOrder: 18,
      durationMinutes: 45,
      objectives: [
        "Begin comparative literary analysis",
        "Identify similarities and differences between memoirs",
      ],
      lessonPlan: {
        activities: [
          "Writing comparison introduction",
          "Comparative Literary Analysis Planner",
        ],
        assessments: ["Comparative Literary Analysis (begin)"],
      },
    },
    {
      title: "Silence or Speech Analysis",
      sortOrder: 19,
      durationMinutes: 45,
      objectives: [
        "Analyze key moments of silence and courage in both texts",
        "Connect themes to essential questions",
      ],
      lessonPlan: {
        activities: [
          "Identify key moments: who was silent, who was courageous",
          "Analyze consequences of silence vs. speech",
          "Powerful quotes selection",
          "Theme connections to essential questions",
        ],
      },
    },
    {
      title: "Comparative Analysis & Transition to Uprising",
      sortOrder: 20,
      durationMinutes: 45,
      objectives: [
        "Complete comparative literary analysis",
        "Transition to next text if time permits",
      ],
      lessonPlan: {
        activities: [
          "Comparative Literary Analysis completion",
          "Begin Uprising if time permits",
        ],
        assessments: ["Comparative Literary Analysis (final)"],
      },
    },
  ];

  for (const lesson of lessonData) {
    await db.insert(lessons).values({
      unitId: unit.id,
      title: lesson.title,
      sortOrder: lesson.sortOrder,
      durationMinutes: lesson.durationMinutes,
      objectives: lesson.objectives,
      lessonPlan: lesson.lessonPlan,
      source: "human",
    });
  }
  console.log(`Created ${lessonData.length} lessons`);

  console.log("\nDone! Grade 8 Q1 curriculum seeded:");
  console.log(`  Course: Grade 8 ELA (${courseId})`);
  console.log(`  Unit: Night & The Hiding Place (${unit.id})`);
  console.log(`  Standards: ${unitStandardIds.length} mapped`);
  console.log(`  Lessons: ${lessonData.length} created`);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
