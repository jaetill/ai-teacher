---
description: Draft narrative release notes for the pending release
---

Draft narrative release notes for the pending release.

## Routing

Invoke `release-captain` (Tier 2 — Sonnet) for narrative drafting.

## Process

The release-captain reads:
- The auto-generated `CHANGELOG.md` section for the pending version
- The release-please PR's diff
- Relevant ADRs for context (especially for breaking changes)

It drafts narrative content following Keep a Changelog's tone — clear, user-focused, no jargon. The output goes to the GitHub Release description (not into `CHANGELOG.md`, which stays auto-generated).

## When to use this command

Per ADR-0010 §3, narrative is warranted when:

- Major version bump (always)
- Release contains a `feat!:` or `BREAKING CHANGE:` footer (always)
- Release contains 3+ `feat:` commits (often)
- Release follows >2 weeks of accumulated commits (sometimes)

For routine patches, the auto-generated changelog is sufficient; this command isn't needed.

## Output

Narrative paragraphs (typically 100–200 words) suitable for the GitHub Release description, with separate Migration subsection for breaking changes if applicable.
