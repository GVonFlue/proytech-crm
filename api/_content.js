// api/_content.js — the impure half of Content Studio: Postgres, Anthropic,
// the spend ledger, and the cron caller check.
//
// The PURE half is src/lib/content.js and both routes import it. The split is
// the same one src/lib/kb.js draws: everything that decides WHAT goes into a
// paid call is testable without a network, and everything below is the plumbing
// that carries it.
//
// Deliberately a separate file from _guard.js and _spend.js, for the reason
// _spend.js states about itself: _guard.js is load-bearing for six working
// endpoints and there is no reason to risk them to add a seventh feature.
//
// THE SPEND CAP HERE IS NOT THE ONE IN _spend.js.
//
//   _spend.js counts DOLLARS in api_hits and caps JARVIS. This counts CENTS in
//   content_usage and caps Content Studio, because WEEKEND1 puts the ceiling in
//   `config.monthly_cap_cents` — an owner-editable row, not an env var — and
//   puts the ledger in content_usage, which already has the columns for it.
//   Two ledgers is right here: a week's slate must not be able to eat the
//   assistant's budget, and the owner must be able to move one without the
//   other. The RATE CARD is shared (RATES, below) so the two cannot disagree
//   about what a token costs.

import { timingSafeEqual } from 'node:crypto';
import { costOf } from './_spend.js';
import {
  readConfig, buildSystemPrompt, centsFrom, unitsFrom, currentMonday,
} from '../src/lib/content.js';

const SUPA = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY  = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

/* The content key is its own env var, NOT ANTHROPIC_API_KEY. WEEKEND1 §3: it
   lives in Vercel and is read only inside api/. It is never named in a VITE_
   variable, so Vite cannot inline it into the client bundle — tests/content.mjs
   asserts that, because "I checked and it wasn't in there" is not a control. */
export const CONTENT_KEY = () => process.env.ANTHROPIC_API_KEY_CONTENT || '';

/* ------------------------------------------------------------- supabase rest */

async function sb(path, opts = {}) {
  if (!SUPA || !KEY) return { ok: false, rows: null, error: 'Supabase is not configured on this deployment.' };
  try {
    const r = await fetch(`${SUPA}/rest/v1/${path}`, {
      ...opts,
      headers: {
        apikey: KEY,
        authorization: `Bearer ${KEY}`,
        'content-type': 'application/json',
        ...(opts.headers || {}),
      },
    });
    const t = await r.text();
    if (!r.ok) {
      /* Name the table and the status. "Could not read the brand context" with
         no code is the shape of error that costs an afternoon — ENGINEERING.md
         §2 on fallbacks that do not say which column. */
      return { ok: false, rows: null, error: `${path.split('?')[0]}: ${r.status} ${t.slice(0, 300)}` };
    }
    return { ok: true, rows: t ? JSON.parse(t) : [], error: '' };
  } catch (e) {
    return { ok: false, rows: null, error: `${path.split('?')[0]}: ${(e && e.message) || 'unreachable'}` };
  }
}

const CONTEXT_COLS  = 'id,category,key,value,active,sort_order';
const RESEARCH_COLS = 'id,source_type,url,platform,format,raw,why_it_worked,used,captured_at';
/* Every column this feature writes appears in this list. ENGINEERING.md §2:
   a column written but not selected is a column that vanishes, and it has
   happened three times in this project. The later-phase columns (idea_id,
   parent_id, series_key, series_index, source_insights, recycled_from) are
   absent because nothing here writes them. */
export const POST_COLS =
  'id,week_of,mix_class,surface,pillar,format,hook,concept,image_prompt,'
  + 'carousel_slides,captions,cta_key,value_statement,source_research,status,'
  + 'generated_at,posted_at,platform_post_ids,performance,created_at';

/** All active brand context. Serves BOTH the config read and the prompt
 *  composition — one value, one read (ENGINEERING.md §2). */
export async function loadContext() {
  return sb(`content_brand_context?active=eq.true&select=${CONTEXT_COLS}&order=sort_order.asc`);
}

/** Unused research, most recent 20. WEEKEND1 §A.3. */
export async function loadResearch(limit = 20) {
  return sb(`content_research?used=eq.false&select=${RESEARCH_COLS}&order=captured_at.desc&limit=${Math.max(1, Number(limit) || 20)}`);
}

/** Posts from the last four weeks that carry a performance note. WEEKEND1 §A.4
 *  — so the model can see what actually landed. */
export async function loadPerformance(now) {
  const d = new Date(currentMonday(now) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 28);
  const from = d.toISOString().slice(0, 10);
  return sb(`content_posts?performance=not.is.null&week_of=gte.${from}&select=${POST_COLS}&order=week_of.desc`);
}

export async function loadPost(id) {
  const r = await sb(`content_posts?id=eq.${encodeURIComponent(id)}&select=${POST_COLS}&limit=1`);
  if (!r.ok) return r;
  return { ok: true, rows: r.rows, row: (r.rows || [])[0] || null, error: '' };
}

export async function insertPosts(rows) {
  return sb('content_posts', {
    method: 'POST',
    headers: { prefer: 'return=representation' },
    body: JSON.stringify(rows),
  });
}

export async function patchPost(id, patch) {
  return sb(`content_posts?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { prefer: 'return=representation' },
    body: JSON.stringify(patch),
  });
}

/** Mark the research the slate was built from. WEEKEND1 §A.10. */
export async function markResearchUsed(ids) {
  const list = (ids || []).filter(Boolean);
  if (!list.length) return { ok: true, rows: [], error: '' };
  const inList = list.map(i => `"${String(i).replace(/"/g, '')}"`).join(',');
  return sb(`content_research?id=in.(${encodeURIComponent(inList)})`, {
    method: 'PATCH',
    body: JSON.stringify({ used: true }),
  });
}

/* ---------------------------------------------------------------- the ledger */

/** Cents spent this calendar month, from content_usage.
 *
 *  Returns null when the ledger is UNREACHABLE, and the caller must decide.
 *  Same posture as _spend.js: failing open on a spend cap is a decision worth
 *  making explicitly, not a shrug. This feature fails CLOSED — see the routes. */
export async function spentCentsThisMonth() {
  const d = new Date();
  const from = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
  const r = await sb(`content_usage?created_at=gte.${from}&select=est_cents`);
  if (!r.ok) return null;
  return (r.rows || []).reduce((a, x) => a + (Number(x && x.est_cents) || 0), 0);
}

/** Record what a call cost. Best effort — a failed write must never fail the
 *  owner's request, they already paid for the tokens. */
export async function logUsage(operation, model, usage) {
  const units = unitsFrom(usage);
  const cents = centsFrom(costOf(model, usage));
  const r = await sb('content_usage', {
    method: 'POST',
    body: JSON.stringify({
      provider: 'anthropic',
      operation: String(operation || '').slice(0, 60),
      units,
      est_cents: cents,
    }),
  });
  if (!r.ok) console.error('[content] usage row not written:', r.error);
  return { units, cents };
}

/* ------------------------------------------------------------------ the call */

/** One Anthropic call. Raw HTTP, matching every other route in this api/
 *  directory (jarvis, kb-draft, meeting-log, huddle) rather than adding an SDK
 *  dependency this repo does not have.
 *
 *  Nothing is logged here on success and the body is never echoed back — the
 *  same privacy posture as api/jarvis.js. The ONE exception is a parse
 *  failure, which WEEKEND1 §A.8 requires be logged raw, and which the CALLER
 *  does so the decision stays visible at the call site. */
export async function askAnthropic({ model, system, user, maxTokens }) {
  const key = CONTENT_KEY();
  if (!key) return { ok: false, error: 'Content Studio is not configured on this install (ANTHROPIC_API_KEY_CONTENT is unset).' };
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model,
        max_tokens: Math.max(1024, Number(maxTokens) || 8000),
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
    const j = await r.json();
    if (!r.ok) return { ok: false, error: (j && j.error && j.error.message) || 'The model is unavailable right now.' };
    const text = (j.content || []).filter(x => x.type === 'text').map(x => x.text).join('').trim();
    return { ok: true, text, usage: j.usage || {}, model: j.model || model };
  } catch (e) {
    return { ok: false, error: 'Could not reach the model. ' + ((e && e.message) || '') };
  }
}

/* --------------------------------------------------------------- the cron leg */

/** Is this Vercel's scheduler?
 *
 *  WEEKEND1 §C says the cron must authenticate "the same way the other
 *  scheduled routes do". THERE ARE NO OTHER SCHEDULED ROUTES — ENGINEERING.md
 *  §7 still lists cron as a gap — so this uses Vercel's own scheme, which is
 *  the platform's answer to the same question: the scheduler sends
 *  `authorization: Bearer $CRON_SECRET` on a GET, and nothing else can.
 *
 *  Compared with timingSafeEqual, the same way api/pocket-hook.js compares its
 *  HMAC. An `===` on a secret leaks its prefix a byte at a time.
 *
 *  Fails CLOSED when CRON_SECRET is unset: an unset secret means EVERY caller
 *  is refused the cron path and falls through to the owner guard, rather than
 *  the endpoint quietly becoming public. Loud on the server, because "the cron
 *  silently never ran" and "the cron is wide open" must not look the same. */
export function isCronCaller(req) {
  const secret = process.env.CRON_SECRET || '';
  if (!secret) {
    console.error('[content-slate] CRON_SECRET is not set; the scheduled run cannot authenticate');
    return false;
  }
  const got = String((req && req.headers && req.headers.authorization) || '').replace(/^Bearer /i, '');
  if (!got) return false;
  const a = Buffer.from(got), b = Buffer.from(secret);
  if (a.length !== b.length) return false;      // timingSafeEqual throws on a length mismatch
  return timingSafeEqual(a, b);
}

/* ------------------------------------------------------------- put together */

/** Everything both routes need before they can compose a prompt: the config,
 *  which config keys fell back BY NAME, and the composed system prompt.
 *
 *  Both routes call this so the brand context cannot be assembled two ways —
 *  ENGINEERING.md §2, where the two disagreeing parties would be two prompts. */
export async function brandContext(extra) {
  const ctx = await loadContext();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const { config, missing } = readConfig(ctx.rows);
  if (missing.length) {
    /* BY NAME. "some config is missing" and "this install is deliberately on
       the defaults" are otherwise the same log line forever. */
    console.warn('[content] config rows missing, using defaults for: ' + missing.join(', '));
  }
  return {
    ok: true,
    rows: ctx.rows,
    config,
    missing,
    system: buildSystemPrompt(ctx.rows, config, extra),
    error: '',
  };
}

/** The hard spend cap. Returns { ok } or { ok:false, status, body }.
 *
 *  Fails CLOSED on an unreachable ledger. _guard.js fails open because a rate
 *  limiter that takes the product down when its datastore blips is worse than
 *  the abuse it prevents. This is the opposite trade: nothing about a weekly
 *  content slate is urgent, and a cap that cannot see the ledger is not a cap. */
export async function underCap(config) {
  const cap = Number(config && config.monthly_cap_cents) || 0;
  const spent = await spentCentsThisMonth();
  if (spent === null) {
    return {
      ok: false, status: 503,
      body: { ok: false, error: 'Could not read the spend ledger, so nothing was generated. Try again shortly.' },
    };
  }
  if (spent >= cap) {
    const usd = c => '$' + (c / 100).toFixed(2);
    return {
      ok: false, status: 429,
      body: {
        ok: false, capped: true,
        error: `This month's content budget of ${usd(cap)} is used up (${usd(spent)} spent). It resets on the 1st.`,
        spent_cents: spent, cap_cents: cap,
      },
    };
  }
  return { ok: true, spent_cents: spent, cap_cents: cap };
}
