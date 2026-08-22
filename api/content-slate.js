import { guard, sweep } from './_guard.js';
import {
  brandContext, underCap, loadResearch, loadPerformance, insertPosts,
  markResearchUsed, logUsage, askAnthropic, isCronCaller, cronDenial,
} from './_content.js';
import {
  buildUserPrompt, parseModelJson, postsFrom, postRow, comingMonday, normResearch,
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
//      JWT, checked by guard({ requireOwner:true }), which asks Postgres
//      through crm_whoami() rather than trusting anything in the body.
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
    // one — _guard.js says to set it per endpoint for exactly this reason.
    const gate = await guard(req, res, {
      name: 'content-slate', perIp: 6, windowMin: 60, perDay: 40,
      maxChars: 2000, requireOwner: true,
    });
    if (!gate.ok) return;
    sweep();
  } else if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'GET or POST only' });
    return;
  }

  const body = (req && typeof req.body === 'object' && req.body) || {};
  const dryRun = body.dry_run === true;

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
  const weekOf = comingMonday(now);

  const [research, performance] = await Promise.all([loadResearch(20), loadPerformance(now)]);
  if (!research.ok) console.error('[content-slate] research unreadable:', research.error);
  if (!performance.ok) console.error('[content-slate] performance unreadable:', performance.error);

  const researchRows = (research.ok ? research.rows : []).map(normResearch);
  const performanceRows = performance.ok ? performance.rows : [];

  /* --- 5, 6, 7. compose, call, parse ------------------------------------- */
  const user = buildUserPrompt({
    research: researchRows, performance: performanceRows,
    count: config.posts_per_week, weekOf,
  });

  const call = await askAnthropic({
    model: config.model, system, user, maxTokens: config.max_tokens,
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

  /* The dry run WEEKEND1 asks for: everything above, none of the writes. The
     research is NOT marked used either — a test run that burned the queue
     would make the flag useless the second time you reached for it. */
  if (dryRun) {
    res.status(200).json({
      ok: true, dry_run: true, week_of: weekOf, posts: rows,
      config_defaults_used: missing, spent_cents: spend.cents,
      cap_cents: cap.cap_cents, context_rows: contextRows.length,
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
     retire research that produced nothing, and there is no way back to it. */
  const mark = await markResearchUsed(researchIds);
  if (!mark.ok) console.error('[content-slate] posts saved but research not marked used:', mark.error);

  res.status(200).json({
    ok: true, week_of: weekOf, count: (ins.rows || []).length,
    posts: ins.rows || [], research_used: researchIds.length,
    research_marked: mark.ok, config_defaults_used: missing,
    spent_cents: spend.cents, cap_cents: cap.cap_cents,
  });
}
