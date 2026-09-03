// Estimate how much prepaid Anthropic credit is left, from our own records.
//
//   npm run ai:credit               → prints the estimate, exit 0
//   npm run ai:credit -- --strict   → exit 1 when below the alert threshold
//                                     (what the daily workflow runs, so the
//                                     failure email IS the notification)
//
// Anthropic exposes no balance endpoint. We know the balance at one moment
// (scripts/ai-credit-baseline.json, read off the console by a human) and we
// record every call's tokens (src/lib/ai-usage.ts → ai_interactions; the
// copilot → copilot_messages). Price those at list rates and subtract.
//
// Deliberately conservative — every rounding goes toward "less money left":
//   • copilot_messages.token_count_in bundles cache reads/writes with plain
//     input, so it is priced at full input rate (cache reads really cost 10%).
//   • the tool-use system prompt tokens Anthropic adds are already in
//     input_tokens, so nothing is missed there.
//   • unknown model ids are priced at Opus rates.
// An early alert costs a glance at the console. A late one costs Heidi a turn.
import { readFile } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { connect } from "./lib/db-tools.mjs";

// USD per million tokens — platform.claude.com/docs/en/about-claude/pricing (2026-09-03)
const PRICES = {
  "claude-opus-4-8": { in: 5, out: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  "claude-opus-4-7": { in: 5, out: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  "claude-opus-4-6": { in: 5, out: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  "claude-sonnet-4-6": { in: 3, out: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  "claude-haiku-4-5-20251001": { in: 1, out: 5, cacheWrite: 1.25, cacheRead: 0.1 },
};
const FALLBACK = PRICES["claude-opus-4-8"]; // unknown → assume the dearest

function priceFor(model) {
  return PRICES[model] ?? FALLBACK;
}
function usd(model, { tin = 0, tout = 0, cw = 0, cr = 0 }) {
  const p = priceFor(model);
  return (tin * p.in + tout * p.out + cw * p.cacheWrite + cr * p.cacheRead) / 1_000_000;
}

const strict = process.argv.includes("--strict");
const baseline = JSON.parse(await readFile(new URL("./ai-credit-baseline.json", import.meta.url), "utf8"));
const since = new Date(baseline.at);
if (Number.isNaN(since.getTime())) {
  console.error("ai-credit-baseline.json: `at` is not a valid ISO timestamp");
  process.exit(2);
}

const db = connect();

// Non-copilot routes.
let interactions;
try {
  interactions = (
    await db.execute(sql`
      select model,
             coalesce(sum(token_count_in),0)::bigint  as tin,
             coalesce(sum(token_count_out),0)::bigint as tout,
             coalesce(sum(cache_write_tokens),0)::bigint as cw,
             coalesce(sum(cache_read_tokens),0)::bigint  as cr,
             count(*)::int as calls
      from ai_interactions
      where created_at > ${since.toISOString()}::timestamptz
      group by model`)
  ).rows;
} catch (err) {
  console.error(
    "Could not read ai_interactions with the cache columns. Migration 0018 not applied to this database?\n" +
      "  DATABASE_URL=\"<prod>\" npm run db:migrate\n  " +
      (err instanceof Error ? err.message : err),
  );
  process.exit(2);
}

// Copilot: tokens live on the assistant message row. Rows written before
// 2026-09-03 (#706) have no token counts; a null must not price as free.
const UNMETERED_TURN_USD = 0.25; // ≈ 30k input + 2k output on Opus; deliberately high
const copilot = (
  await db.execute(sql`
    select coalesce(model,'claude-opus-4-6') as model,
           coalesce(sum(token_count_in),0)::bigint  as tin,
           coalesce(sum(token_count_out),0)::bigint as tout,
           count(*)::int as calls,
           count(*) filter (where token_count_in is null)::int as unmetered
    from copilot_messages
    where role = 'assistant' and created_at > ${since.toISOString()}::timestamptz
    group by 1`)
).rows;

let spent = 0;
const lines = [];
for (const r of interactions) {
  const c = usd(r.model, { tin: Number(r.tin), tout: Number(r.tout), cw: Number(r.cw), cr: Number(r.cr) });
  spent += c;
  lines.push(`  ${String(r.calls).padStart(5)} calls  ${r.model.padEnd(28)} $${c.toFixed(4)}  (routes)`);
}
for (const r of copilot) {
  const metered = usd(r.model, { tin: Number(r.tin), tout: Number(r.tout) });
  const unmetered = Number(r.unmetered) * UNMETERED_TURN_USD;
  spent += metered + unmetered;
  lines.push(`  ${String(r.calls).padStart(5)} turns  ${r.model.padEnd(28)} $${metered.toFixed(4)}  (copilot, cache priced as input — high)`);
  if (Number(r.unmetered) > 0) {
    lines.push(`  ${String(r.unmetered).padStart(5)} of those had no token counts → assumed $${UNMETERED_TURN_USD} each = $${unmetered.toFixed(2)}`);
  }
}

const remaining = baseline.usd - spent;
const days = (Date.now() - since.getTime()) / 86_400_000;
const perDay = days > 0.5 ? spent / days : null;
const runway = perDay && perDay > 0 ? (remaining - baseline.alertBelowUsd) / perDay : null;

console.log(`Anthropic credit estimate — org ${baseline.org}`);
console.log(`  baseline: $${baseline.usd.toFixed(2)} at ${baseline.at}`);
console.log(lines.length ? lines.join("\n") : "  (no recorded usage since baseline)");
console.log(`  spent since baseline: $${spent.toFixed(4)} over ${days.toFixed(1)} days` + (perDay ? ` (≈ $${perDay.toFixed(3)}/day)` : ""));
console.log(`  ESTIMATED REMAINING:  $${remaining.toFixed(2)}   (alert below $${baseline.alertBelowUsd.toFixed(2)})`);
if (runway !== null) console.log(`  runway to alert line: ≈ ${runway.toFixed(0)} days at the current rate`);

// GitHub Actions job summary, when present.
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFile } = await import("node:fs/promises");
  await appendFile(
    process.env.GITHUB_STEP_SUMMARY,
    `## Anthropic credit estimate\n\n| | |\n|---|---|\n| Baseline | $${baseline.usd.toFixed(2)} at ${baseline.at} |\n| Spent since | $${spent.toFixed(4)} |\n| **Estimated remaining** | **$${remaining.toFixed(2)}** |\n| Alert below | $${baseline.alertBelowUsd.toFixed(2)} |\n${runway !== null ? `| Runway to alert | ≈ ${runway.toFixed(0)} days |\n` : ""}\n`,
  );
}

if (strict && remaining < baseline.alertBelowUsd) {
  console.error(
    `\nBELOW THRESHOLD: ≈ $${remaining.toFixed(2)} of Anthropic credit left on the ${baseline.org} org.\n` +
      "Switch ANTHROPIC_API_KEY to the jaetill org: docs/runbooks/ai-billing.md",
  );
  process.exit(1);
}
