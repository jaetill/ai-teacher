CREATE TABLE "glossary_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"term_key" text NOT NULL,
	"definition" text NOT NULL,
	"owner_email" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_glossary_term_owner" UNIQUE NULLS NOT DISTINCT("term_key","owner_email")
);
