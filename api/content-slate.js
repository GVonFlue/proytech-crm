import { guard, sweep } from '@getproytech/core/guard';
import {
  brandContext, underCap, loadResearch, loadPerformance, insertPosts,
  markResearchUsed, logUsage, askAnthropic, isCronCaller, cronDenial,
} from './_content.js';
import {
  buildUserPrompt, parseModelJson, postsFrom, postRow, comingMonday, normResearch,
  checkCounts, countsTotal, buildBatchInstructions, allTextOnly, weekOfInput,
} from '../src/lib/content.js';

// api/content-slate.js — generate next week's slate.
//
// WHAT IS AND IS NOT HARDCODED HERE
//
//   Nothing about how this behaves. Post count, model, spend cap, max_tokens,
//   the surfaces, the instruction wrapper and the output contract are ROWS in
//   content_brand_context under the `config` category, read on every call. The
//   defaults live in ONE place — CONFIG_DEFAULTS in src/lib/content.js — and a
//   fallback is logged BY NAME so "the row was never created" and "the owner
//   chose that value" are never the same log line (ENGINEERING.md §2).
//
//   If you find yourself typing a post count or a model id below, stop. That
//   is the thing this table exists to stop being a deploy.
//
// TWO CALLERS, TWO AUTHENTICATIONS
//
//   1. The owner, pressing "Generate next week" — a POST carrying a Supabase
//      JWT, checked by guard({ requireAdmin:true }), which asks Postgres
//      through core_whoami() rather than trusting anything in the body.
//   2. Vercel's scheduler — a GET carrying `Bearer $CRON_SECRET`, compared
//      with timingSafeEqual in _content.js.
//
//   Everything else gets 401. There is no third door: isCronCaller returns
//   false when CRON_SECRET is unset, so a misconfigured deployment refuses the
//   scheduled run rather than becoming public.
//
// THE SPEND CAP IS CHECKED BEFORE ANYTHING IS GENERATED, and it fails closed
// on an unreachable ledger. A cap that cannot see the ledger is not a cap.
//
// Privacy posture matches the other AI routes: the payload goes to
// api.anthropic.com and nowhere else, and nothing is logged on success. The one
// deliberate exception is a PARSE FAILURE, which WEEKEND1 §A.8 requires be
// logged raw so a broken output contract is diagnosable — that text is the
// model's own output, never a transcript and never a lead.

const OPERATION = 'slate';

export default async function handler(req, res) {
  const cron = isCronCaller(req);

  if (!cron) {
    // A caller that PRESENTS as the scheduler and failed the check above is a
    // cron whose secret is wrong or unset, and is told so by name. Without this
    // it falls into guard() and is refused for the wrong reason — 405 "POST
    // only" on the GET the scheduler actually sends, which is a verb nobody can
    // change, or 401 "Session expired." on a POST, which points at Supabase for
    // what is a Vercel env var. The cron's only user interface is a log line,
    // so the log line has to be true. cronDenial() returns null for everyone
    // else, so a stranger still learns nothing about whether a cron exists.
    const denial = cronDenial(req);
    if (denial) { res.status(401).json({ ok: false, error: denial }); return; }

    // maxChars is small on purpose: the only body this route accepts is
    // { dry_run }. The shared default is sized for a chat box and this is not
    // one — @getproytech/core/guard says to set it per endpoint for exactly this reason.
    const gate = await guard(req, res, {
      name: 'content-slate', perIp: 6, windowMin: 60, perDay: 40,
      maxChars: 2000, requireAdmin: true,
    });
    if (!gate.ok) return;
    sweep();
  } else if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'GET or POST only' });
    return;
  }

  const body = (req && typeof req.body === 'object' && req.body) || {};
  const dryRun = body.dry_run === true;

  /* --- 0. a CUSTOM run, or the weekly one? --------------------------------
     The cron sends no body at all, so `custom` is false for it and every line
     below behaves exactly as it did in Weekend 1. That is the whole contract of
     this block: the scheduled path must not change shape because a manual path
     was added beside it. */
  const custom = countsTotal(body.counts) > 0;
  let counts = null;
  if (custom) {
    const check = checkCounts(body.counts);
    if (!check.ok) { res.status(400).json({ ok: false, error: check.error }); return; }
    counts = check.counts;
  }
  const focus = String(body.focus || '').slice(0, 600).trim();

  /* --- 1. config first, then the cap. Nothing is generated above this line. */
  const brand = await brandContext();
  if (!brand.ok) {
    console.error('[content-slate] brand context unreadable:', brand.error);
    res.status(502).json({ ok: false, error: 'Could not read the brand context. ' + brand.error });
    return;
  }
  const { config, missing, rows: contextRows, system } = brand;

  const cap = await underCap(config);
  if (!cap.ok) { res.status(cap.status).json(cap.body); return; }

  /* --- 2 & 3 & 4. research and what landed ------------------------------- */
  const now = new Date();
  /* A custom run may target the CURRENT week; the weekly run is always the
     coming Monday. weekOfInput snaps whatever arrives to that week's Monday,
     because week_of is matched as an exact string by the screen. */
  const weekOf = (custom && weekOfInput(body.week_of)) || comingMonday(now);

  /* THE RESEARCH QUEUE BELONGS TO THE WEEKLY RUN.
     A custom batch — "three ads about Military Suite Night" — would otherwise
     read the twenty most recent unused rows and mark every one of them used,
     retiring research that had nothing to do with it. There is no unmark
     anywhere in the UI, so that is not recoverable from the screen. The cron
     stays the only consumer; a custom run still sees what LANDED, which is
     history rather than a queue. */
  const [research, performance] = await Promise.all([
    custom ? Promise.resolve({ ok: true, rows: [] }) : loadResearch(20),
    loadPerformance(now),
  ]);
  if (!research.ok) console.error('[content-slate] research unreadable:', research.error);
  if (!performance.ok) console.error('[content-slate] performance unreadable:', performance.error);

  const researchRows = (research.ok ? research.rows : []).map(normResearch);
  const performanceRows = performance.ok ? performance.rows : [];

  /* --- 5, 6, 7. compose, call, parse ------------------------------------- */
  const user = buildUserPrompt({
    research: researchRows, performance: performanceRows,
    count: config.posts_per_week, counts, focus, weekOf,
  });

  /* The ad rules ride in as `extra` — composed in src/lib/content.js beside the
     rest of the mix handling, and only present when ads were actually asked
     for. brandContext() rebuilds the system prompt with it so there is still
     exactly ONE composition path (ENGINEERING.md §2). */
  const batch = buildBatchInstructions(config, counts);
  const system2 = batch ? (await brandContext(batch)).system : system;

  const call = await askAnthropic({
    model: config.model, system: system2, user, maxTokens: config.max_tokens,
  });
  if (!call.ok) { res.status(502).json({ ok: false, error: call.error }); return; }

  /* Logged before the parse: the tokens were spent whether or not the JSON was
     readable, and a ledger that only records successes under-reports the bill
     — which is the one thing a spend cap must never do. */
  const spend = await logUsage(OPERATION, config.model, call.usage);

  /* --- 8. parse defensively ---------------------------------------------- */
  const parsed = parseModelJson(call.text);
  if (!parsed.ok) {
    // WEEKEND1 §A.8 — log the raw response, return an error, write nothing.
    console.error('[content-slate] unparseable response, no rows written. Raw follows:\n' + parsed.raw.slice(0, 4000));
    res.status(502).json({
      ok: false,
      error: 'The slate came back in a shape we could not read, so nothing was saved. The raw response is in the function logs.',
      spent_cents: spend.cents,
    });
    return;
  }

  const requested = custom ? countsTotal(counts) : config.posts_per_week;
  const researchIds = researchRows.map(r => r.id).filter(Boolean);
  const generatedAt = now.toISOString();
  const rows = postsFrom(parsed.value).map(p => postRow(p, {
    weekOf, surfaces: config.surfaces, researchIds, generatedAt,
  }));

  if (!rows.length) {
    console.error('[content-slate] response parsed but held no posts. Raw follows:\n' + parsed.raw.slice(0, 4000));
    res.status(502).json({ ok: false, error: 'That came back with no posts in it, so nothing was saved.', spent_cents: spend.cents });
    return;
  }

  /* WEEKEND1.5 §A. Every post text_only, with more than two asked for, is
     almost certainly the model taking the cheapest option rather than choosing
     — which is exactly how the first real run produced no visual output at all.
     It does NOT reject the slate: these are real posts and the tokens are
     already spent. It is LOGGED and RETURNED so the failure is visible instead
     of silent, which was the entire complaint. */
  const textOnly = allTextOnly(rows, requested);
  if (textOnly) {
    console.warn(
      `[content-slate] all ${rows.length} posts came back format=text_only for ${requested} requested. `
      + 'The model is defaulting. Check the config.format_mix row.',
    );
  }
  const formatWarning = textOnly
    ? `All ${rows.length} posts came back as text_only, so this slate has no visual output. `
      + 'That is usually the model defaulting rather than choosing — tighten the '
      + 'config.format_mix row under Brand and regenerate.'
    : '';

  /* The dry run WEEKEND1 asks for: everything above, none of the writes. The
     research is NOT marked used either — a test run that burned the queue
     would make the flag useless the second time you reached for it. */
  if (dryRun) {
    res.status(200).json({
      ok: true, dry_run: true, week_of: weekOf, posts: rows,
      config_defaults_used: missing, spent_cents: spend.cents,
      cap_cents: cap.cap_cents, context_rows: contextRows.length,
      custom, counts, requested, all_text_only: textOnly, format_warning: formatWarning,
    });
    return;
  }

  /* --- 9, 10. insert, then mark the research used ------------------------ */
  const ins = await insertPosts(rows);
  if (!ins.ok) {
    console.error('[content-slate] insert failed:', ins.error);
    res.status(502).json({ ok: false, error: 'The posts could not be saved. ' + ins.error, spent_cents: spend.cents });
    return;
  }

  /* AFTER the insert, never before. Marking first and failing to insert would
     retire research that produced nothing, and there is no way back to it.
     researchIds is empty on a custom run, so this is a no-op there. */
  const mark = await markResearchUsed(researchIds);
  if (!mark.ok) console.error('[content-slate] posts saved but research not marked used:', mark.error);

  res.status(200).json({
    ok: true, week_of: weekOf, count: (ins.rows || []).length,
    posts: ins.rows || [], research_used: researchIds.length,
    research_marked: mark.ok, config_defaults_used: missing,
    spent_cents: spend.cents, cap_cents: cap.cap_cents,
    custom, counts, requested, all_text_only: textOnly, format_warning: formatWarning,
  });
}
