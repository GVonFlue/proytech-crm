/* ============================================================================
   CONTENT STUDIO — the brain side.
   ----------------------------------------------------------------------------
   Pure. No React, no Supabase, no fetch — the same rule src/lib/kb.js and
   src/lib/jarvis.js follow, and for the same reason: the function that decides
   what goes into a paid model call must be testable without a browser, because
   "I clicked Generate and it looked fine" costs money to run twice.

   This module is imported by BOTH sides:
     - src/ContentStudio.jsx  (the screen)
     - api/content-slate.js / api/content-regenerate.js  (the routes)

   That is deliberate and it is why nothing here may touch import.meta.env,
   window, or the DOM. The api/ routes run on Node with no Vite transform.

   NOTHING ABOUT THE GENERATOR IS HARDCODED HERE.

   Post count, model, spend cap, the instruction wrapper and the output
   contract are ROWS in content_brand_context under the `config` category, read
   at runtime. The DEFAULTS below exist so a missing row degrades to something
   sensible and LOUD (readConfig reports which keys fell back, by name) rather
   than to zero — ENGINEERING.md §2: a missing number that coerces to 0 renders
   as a plausible value, and "the config row was never created" and "the owner
   set it to zero" must never be the same screen.
   ========================================================================== */

/* Declared before every use — `const` does not hoist and this file is imported
   into a module graph that renders immediately (ENGINEERING.md §1). */
const S = (v, cap = 8000) => String(v == null ? '' : v).slice(0, cap);
const A = v => (Array.isArray(v) ? v : []);
const N = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
const O = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

export const contentUid = () =>
  'ct' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ------------------------------------------------------------------- config */

/* The `config` rows the routes read. Every one of these is a ROW the owner
   creates in content_brand_context (category = 'config'); the value here is
   only what happens when that row does not exist yet.

   Do not inline any of these anywhere else. If you find yourself typing 7 or
   'claude-opus-5' in a route, you have re-hardcoded the thing this table
   exists to stop being hardcoded. */
export const CONFIG_DEFAULTS = {
  /* The instruction wrapper. Placed FIRST in the system prompt, before any
     brand context. Owner-editable prose — this is the whole "how to behave"
     half of the prompt and it does not belong in a deploy. */
  instructions:
    'You are the content strategist for this business. You are writing next week\'s social slate. '
    + 'Work only from the brand context below. Do not invent offers, prices, credentials or client results '
    + 'that the context does not state. Every post must be something this specific business could publish today.',
  /* The JSON contract. Placed LAST, after all context, because the last thing
     a model reads is the thing it obeys most reliably. */
  output_contract:
    'Return ONLY valid JSON. No markdown fences, no preamble, no trailing prose.\n'
    + '{"posts":[{"mix_class":"personal|proytech","surface":"one of the surfaces listed above",'
    + '"pillar":"one of the pillars listed above","format":"short label e.g. carousel, single, reel-script",'
    + '"hook":"the scroll-stopping first line","concept":"2-4 sentences on what the post actually says",'
    + '"value_statement":"one sentence naming what the reader walks away with",'
    + '"cta_key":"one of the cta keys listed above","image_prompt":"a description of the visual, text only",'
    + '"carousel_slides":["slide 1 text","slide 2 text"],'
    + '"captions":{"<surface key>":"the full caption for that surface"}}]}',
  model: 'claude-opus-5',
  posts_per_week: 7,
  monthly_cap_cents: 2000,
  /* Which caption variants exist. Drives the caption tabs on the Slate card and
     the `captions` jsonb keys, and is the set `surface` is chosen from. */
  surfaces: 'linkedin,instagram',
  /* Anthropic's max_tokens for a slate call. A ceiling, not a target. */
  max_tokens: 8000,
};

/* Keys whose value is a list. Stored as either a JSON array or a comma list —
   an owner typing into a text box should not have to know which. */
const LIST_KEYS = new Set(['surfaces']);
const NUM_KEYS = new Set(['posts_per_week', 'monthly_cap_cents', 'max_tokens']);

export const parseList = (v) => {
  const raw = S(v, 4000).trim();
  if (!raw) return [];
  if (raw.startsWith('[')) {
    try {
      const j = JSON.parse(raw);
      if (Array.isArray(j)) return j.map(x => S(x, 80).trim()).filter(Boolean);
    } catch { /* fall through to the comma list */ }
  }
  return raw.split(',').map(s => s.trim()).filter(Boolean);
};

/** Read the `config` category into a typed object.
 *
 *  Returns { config, missing } — `missing` is the list of keys that fell back,
 *  BY NAME. ENGINEERING.md §2: "a schema fallback that drops a column must log
 *  WHICH column, by name", and the same argument applies to a config row. The
 *  routes log it; the Brand tab renders it. */
export function readConfig(rows) {
  const byKey = new Map();
  for (const r of A(rows)) {
    if (!r || S(r.category, 60) !== 'config') continue;
    if (r.active === false) continue;
    const k = S(r.key, 80).trim();
    if (k) byKey.set(k, r.value);
  }
  const config = {};
  const missing = [];
  for (const key of Object.keys(CONFIG_DEFAULTS)) {
    const raw = byKey.has(key) ? S(byKey.get(key), 20000).trim() : '';
    if (!raw) {
      missing.push(key);
      config[key] = LIST_KEYS.has(key) ? parseList(CONFIG_DEFAULTS[key]) : CONFIG_DEFAULTS[key];
      continue;
    }
    if (LIST_KEYS.has(key)) { config[key] = parseList(raw); continue; }
    if (NUM_KEYS.has(key)) {
      const n = Number(raw);
      /* A row that exists but holds nonsense is a MISSING row, not a zero.
         posts_per_week = 0 generates nothing and looks like a working cap. */
      if (!Number.isFinite(n) || n <= 0) { missing.push(key); config[key] = CONFIG_DEFAULTS[key]; continue; }
      config[key] = n;
      continue;
    }
    config[key] = raw;
  }
  return { config, missing };
}

/* --------------------------------------------------------------- normalisers
   Each one NAMES EVERY KEY. A field added to a write and not added here saves
   fine and vanishes on reload — that bug has shipped three times in this
   project (ENGINEERING.md §2). Any new column has to be added below AND to the
   select list in src/lib/supabase.js, or it does not survive a refresh. */

export const normContext = (r) => ({
  id: S(r && r.id, 60),
  category: S(r && r.category, 60),
  key: S(r && r.key, 200),
  value: S(r && r.value, 20000),
  active: (r && r.active) !== false,
  sort_order: N(r && r.sort_order),
});

export const normResearch = (r) => ({
  id: S(r && r.id, 60),
  source_type: S(r && r.source_type, 60),
  url: S(r && r.url, 2000),
  platform: S(r && r.platform, 60),
  format: S(r && r.format, 60),
  raw: S(r && r.raw, 20000),
  why_it_worked: S(r && r.why_it_worked, 8000),
  used: !!(r && r.used),
  captured_at: S(r && r.captured_at, 40),
});

/* content_posts. The later-phase columns — idea_id, parent_id, series_key,
   series_index, source_insights, recycled_from — are NOT named here on
   purpose: this weekend never writes them, so naming them would be a read path
   for a value nothing produces. They stay null in Postgres and untouched. */
export const normPost = (r) => ({
  id: S(r && r.id, 60),
  week_of: S(r && r.week_of, 40),
  mix_class: S(r && r.mix_class, 60),
  surface: S(r && r.surface, 60),
  pillar: S(r && r.pillar, 120),
  format: S(r && r.format, 60),
  hook: S(r && r.hook, 1000),
  concept: S(r && r.concept, 4000),
  image_prompt: S(r && r.image_prompt, 4000),
  carousel_slides: A(r && r.carousel_slides).map(s => S(s, 2000)),
  captions: (() => {
    const c = O(r && r.captions);
    const out = {};
    for (const k of Object.keys(c)) out[S(k, 60)] = S(c[k], 8000);
    return out;
  })(),
  cta_key: S(r && r.cta_key, 120),
  value_statement: S(r && r.value_statement, 2000),
  source_research: A(r && r.source_research).map(x => S(x, 60)).filter(Boolean),
  status: S(r && r.status, 20) || 'draft',
  generated_at: S(r && r.generated_at, 40),
  posted_at: S(r && r.posted_at, 40),
  platform_post_ids: (() => {
    const c = O(r && r.platform_post_ids);
    const out = {};
    for (const k of Object.keys(c)) out[S(k, 60)] = S(c[k], 300);
    return out;
  })(),
  performance: S(r && r.performance, 4000),
  created_at: S(r && r.created_at, 40),
});

/* ------------------------------------------------------------------- dates */

/** The Monday that starts the COMING week, as YYYY-MM-DD.
 *
 *  Pure and takes its clock as an argument so a test can pin it —
 *  tests/dates.mjs and tests/leapdates.mjs exist because date helpers in this
 *  project have been wrong before. Built from local Y/M/D parts rather than
 *  toISOString(), which would shift the date across the UTC boundary for
 *  anyone west of Greenwich and silently file Sunday-night work under the
 *  wrong week. */
export function comingMonday(now) {
  const d = now instanceof Date && !isNaN(now) ? new Date(now.getTime()) : new Date();
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();                     // 0 Sun … 6 Sat
  const ahead = dow === 1 ? 7 : (8 - dow) % 7 || 7;
  d.setDate(d.getDate() + ahead);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** The Monday on or before `now` — the week currently being posted. */
export function currentMonday(now) {
  const d = now instanceof Date && !isNaN(now) ? new Date(now.getTime()) : new Date();
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  d.setDate(d.getDate() - ((dow + 6) % 7));
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** ISO timestamp `weeks` weeks before `now`. Used for the performance lookback. */
export function weeksAgoIso(weeks, now) {
  const d = now instanceof Date && !isNaN(now) ? new Date(now.getTime()) : new Date();
  d.setDate(d.getDate() - Math.max(0, N(weeks)) * 7);
  return d.toISOString();
}

/* ------------------------------------------------------- prompt composition */

/* The categories that become sections, IN ORDER, with the heading each one
   gets. WEEKEND1 §A.5 fixes this order: instructions, then these, then the
   output contract. Adding a category to content_brand_context that is not in
   this list is legal — it lands in "additional context" below rather than
   being dropped, because a row the owner deliberately typed must never be
   silently ignored. */
export const PROMPT_SECTIONS = [
  ['voice', 'VOICE — how this sounds'],
  ['forbidden', 'FORBIDDEN — never do these'],
  ['pillar', 'PILLARS — what this account talks about'],
  ['cta', 'CALLS TO ACTION — use the key, not your own wording'],
  ['offer', 'OFFERS — what is actually being sold'],
  ['audience', 'AUDIENCE — who is reading'],
  ['mix', 'MIX — the personal / business ratio, and it is not a suggestion'],
  ['proof', 'PROOF — real results and credentials that may be referenced'],
];

/* Categories that are machinery, not voice. `config` is read by readConfig and
   must never be pasted into the prompt: output_contract would appear twice and
   the model would see the spend cap. */
const NEVER_IN_PROMPT = new Set(['config']);

/** Group active rows by category, each category sorted by sort_order then key. */
export function groupContext(rows) {
  const out = {};
  for (const raw of A(rows)) {
    const r = normContext(raw);
    if (!r.active) continue;
    if (!r.category || !r.value) continue;
    (out[r.category] = out[r.category] || []).push(r);
  }
  for (const k of Object.keys(out)) {
    out[k].sort((a, b) => (a.sort_order - b.sort_order) || a.key.localeCompare(b.key));
  }
  return out;
}

const section = (heading, rows) => {
  if (!rows || !rows.length) return '';
  const body = rows.map(r => `- ${r.key}: ${r.value}`).join('\n');
  return `${heading}\n${body}`;
};

/** THE function WEEKEND1 §A.5 asks for.
 *
 *  Pure: rows in, one string out. No fetch, no clock, no env. Both routes call
 *  it, which is the point — api/content-regenerate.js rebuilding the brand
 *  context its own way would be the two-screens-disagree bug (ENGINEERING.md
 *  §2) with two prompts as the two disagreeing parties.
 *
 *  Order is fixed and load-bearing: config.instructions, the brand sections,
 *  config.output_contract LAST. */
export function buildSystemPrompt(contextRows, config, extra) {
  const cfg = O(config);
  const grouped = groupContext(contextRows);
  const parts = [];

  parts.push(S(cfg.instructions || CONFIG_DEFAULTS.instructions, 20000));

  const named = new Set(PROMPT_SECTIONS.map(s => s[0]));
  for (const [cat, heading] of PROMPT_SECTIONS) {
    const s = section(heading, grouped[cat]);
    if (s) parts.push(s);
  }
  /* Anything the owner added that is not one of the eight. Never dropped. */
  const leftovers = Object.keys(grouped)
    .filter(c => !named.has(c) && !NEVER_IN_PROMPT.has(c))
    .sort();
  for (const cat of leftovers) {
    const s = section(`${cat.toUpperCase()} — additional context`, grouped[cat]);
    if (s) parts.push(s);
  }

  const surfaces = A(cfg.surfaces).length ? A(cfg.surfaces) : parseList(CONFIG_DEFAULTS.surfaces);
  parts.push(
    'SURFACES — every post names exactly one, and carries a caption for each of them\n'
    + surfaces.map(s => `- ${s}`).join('\n'),
  );

  if (extra) parts.push(S(extra, 20000));

  parts.push(S(cfg.output_contract || CONFIG_DEFAULTS.output_contract, 20000));
  return parts.filter(Boolean).join('\n\n');
}

/** The user turn: the unused research and what actually landed.
 *  Pure, same reasons. */
export function buildUserPrompt(opts) {
  const o = O(opts);
  const research = A(o.research).map(normResearch);
  const performance = A(o.performance).map(normPost);
  const n = N(o.count) || CONFIG_DEFAULTS.posts_per_week;
  const weekOf = S(o.weekOf, 40);

  const bits = [];
  bits.push(`Write the slate for the week beginning ${weekOf || 'next Monday'}. Produce exactly ${n} posts.`);

  if (research.length) {
    bits.push(
      'RESEARCH — things that worked elsewhere. Borrow the STRUCTURE, never the words:\n'
      + research.map((r, i) => {
        const head = [r.source_type, r.platform, r.format].filter(Boolean).join(' · ');
        return `${i + 1}. ${head}${r.url ? ` (${r.url})` : ''}\n   ${S(r.raw, 1200)}`
          + (r.why_it_worked ? `\n   why it worked: ${S(r.why_it_worked, 600)}` : '');
      }).join('\n'),
    );
  } else {
    bits.push('RESEARCH — none captured. Work from the brand context alone.');
  }

  if (performance.length) {
    bits.push(
      'WHAT ACTUALLY LANDED in the last four weeks. Weight toward what worked:\n'
      + performance.map(p =>
        `- [${p.mix_class || '?'} · ${p.surface || '?'} · ${p.pillar || '?'}] "${S(p.hook, 160)}" -> ${S(p.performance, 400)}`,
      ).join('\n'),
    );
  }

  return bits.join('\n\n');
}

/** The regenerate turn. `mode` is 'caption' or 'full'.
 *
 *  Same brand context, a different ask — WEEKEND1 §B: keep week_of, mix_class
 *  and pillar, rewrite either the two captions or the whole post. Those three
 *  are stated back to the model as FIXED rather than being left to survive by
 *  luck, and the route re-imposes them on the way to the database anyway. */
export function buildRegeneratePrompt(post, mode, surfaces) {
  const p = normPost(post);
  const list = A(surfaces).length ? A(surfaces) : parseList(CONFIG_DEFAULTS.surfaces);
  const fixed = `THIS POST IS BEING REWRITTEN. These do not change and you must reuse them exactly:\n`
    + `- week_of: ${p.week_of}\n- mix_class: ${p.mix_class}\n- pillar: ${p.pillar}`;
  const current = `THE CURRENT POST\n`
    + `- surface: ${p.surface}\n- format: ${p.format}\n- hook: ${p.hook}\n`
    + `- concept: ${p.concept}\n- value_statement: ${p.value_statement}\n- cta_key: ${p.cta_key}\n`
    + list.map(s => `- caption[${s}]: ${S(p.captions[s], 4000)}`).join('\n');

  if (mode === 'caption') {
    return [
      fixed, current,
      'REWRITE THE CAPTIONS ONLY. The hook, concept, value statement, format and pillar all stay '
      + 'exactly as they are — this is a wording fix on a concept that was kept on purpose. '
      + 'Return one caption for each surface listed above.\n\n'
      + 'Return ONLY valid JSON, no fences: {"captions":{"<surface key>":"the full caption"}}',
    ].join('\n\n');
  }
  return [
    fixed, current,
    'REWRITE THE WHOLE POST against the same pillar and mix class. A genuinely different angle, '
    + 'not a paraphrase of the above. Keep week_of, mix_class and pillar; everything else is yours.',
  ].join('\n\n');
}

/* ------------------------------------------------------------------ parsing */

/** Strip fences and salvage a JSON object from a model response.
 *
 *  Returns { ok, value, raw }. Never throws — WEEKEND1 §A.8: parsing failure
 *  must log the raw response and error, not write garbage rows. The caller
 *  owns the logging because this function is pure. */
export function parseModelJson(text) {
  const raw = S(text, 400000).trim();
  if (!raw) return { ok: false, value: null, raw };
  const body = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try { return { ok: true, value: JSON.parse(body), raw }; } catch { /* salvage below */ }
  /* The model occasionally wraps the object in a sentence — same salvage as
     api/kb-draft.js and api/huddle.js. */
  const m = body.match(/\{[\s\S]*\}/);
  if (!m) return { ok: false, value: null, raw };
  try { return { ok: true, value: JSON.parse(m[0]), raw }; }
  catch { return { ok: false, value: null, raw }; }
}

/** Turn one parsed post object into a row shaped for content_posts.
 *
 *  The later-phase columns are absent, not null-assigned: an INSERT that does
 *  not name a column leaves the database default alone, which is what
 *  "leave them null, do not remove them" means. */
export function postRow(p, ctx) {
  const c = O(ctx);
  const surfaces = A(c.surfaces).length ? A(c.surfaces) : parseList(CONFIG_DEFAULTS.surfaces);
  const o = O(p);
  const surface = surfaces.includes(S(o.surface, 60)) ? S(o.surface, 60) : (surfaces[0] || '');
  const captionsIn = O(o.captions);
  const captions = {};
  /* One entry per configured surface, always. A caption tab with no key behind
     it renders an empty textarea the owner cannot tell from a model that
     declined to write one. */
  for (const s of surfaces) captions[s] = S(captionsIn[s], 8000);
  return {
    week_of: S(c.weekOf, 40),
    mix_class: S(o.mix_class, 60),
    surface,
    pillar: S(o.pillar, 120),
    format: S(o.format, 60),
    hook: S(o.hook, 1000),
    concept: S(o.concept, 4000),
    image_prompt: S(o.image_prompt, 4000),
    carousel_slides: A(o.carousel_slides).map(s => S(s, 2000)),
    captions,
    cta_key: S(o.cta_key, 120),
    value_statement: S(o.value_statement, 2000),
    source_research: A(c.researchIds).map(x => S(x, 60)).filter(Boolean),
    status: 'draft',
    generated_at: S(c.generatedAt, 40),
  };
}

/** Pull the posts array out of whatever the model returned. Accepts a bare
 *  array too — a contract the owner rewrites may not keep the wrapper. */
export function postsFrom(parsed) {
  if (Array.isArray(parsed)) return parsed;
  const o = O(parsed);
  if (Array.isArray(o.posts)) return o.posts;
  return [];
}

/** Captions out of a regenerate response, one key per configured surface.
 *  Returns null when the model produced nothing usable, so the caller can
 *  error instead of blanking captions the owner wanted kept. */
export function captionsFrom(parsed, surfaces) {
  const list = A(surfaces).length ? A(surfaces) : parseList(CONFIG_DEFAULTS.surfaces);
  const o = O(parsed);
  const src = O(o.captions).constructor === Object && Object.keys(O(o.captions)).length ? O(o.captions) : O(o);
  const out = {};
  let any = false;
  for (const s of list) {
    const v = S(src[s], 8000);
    if (v) any = true;
    out[s] = v;
  }
  return any ? out : null;
}

/* --------------------------------------------------------------------- cost */

/** Whole cents, rounded UP. A spend cap that rounds down lets every call under
 *  half a cent through free, and a weekly job makes that a real number. */
export const centsFrom = dollars => Math.ceil(Math.max(0, N(dollars)) * 100);

/** Billable tokens on one call — what goes in content_usage.units. */
export const unitsFrom = (usage) => {
  const u = O(usage);
  return N(u.input_tokens) + N(u.cache_creation_input_tokens)
       + N(u.cache_read_input_tokens) + N(u.output_tokens);
};

/* --------------------------------------------------------------- the screen */

/** Posts for one week, ordered the way the Slate reads them. */
export const postsForWeek = (posts, weekOf) =>
  A(posts).map(normPost).filter(p => p.week_of === S(weekOf, 40))
    .sort((a, b) => S(a.generated_at).localeCompare(S(b.generated_at)) || S(a.hook).localeCompare(S(b.hook)));

/** Every week_of present in the table, newest first. Drives the week picker. */
export const weeksOf = (posts) =>
  Array.from(new Set(A(posts).map(normPost).map(p => p.week_of).filter(Boolean)))
    .sort((a, b) => b.localeCompare(a));

/** The Today queue: approved, not yet posted, current week first. */
export const todayQueue = (posts, weekOf) =>
  A(posts).map(normPost).filter(p => p.status === 'approved' && !p.posted_at)
    .sort((a, b) => {
      const aw = a.week_of === weekOf ? 0 : 1, bw = b.week_of === weekOf ? 0 : 1;
      return aw - bw || S(a.week_of).localeCompare(S(b.week_of)) || S(a.generated_at).localeCompare(S(b.generated_at));
    });

/** Research list: unused first, then newest. WEEKEND1 §D asks for exactly this. */
export const researchOrder = (rows) =>
  A(rows).map(normResearch).sort((a, b) =>
    (a.used === b.used ? 0 : a.used ? 1 : -1) || S(b.captured_at).localeCompare(S(a.captured_at)));

/* -------------------------------------------------------- export / import */

/** The whole brand table as a JSON document. This is the white-label path: a
 *  future client install is seeded by importing one of these, not by anyone
 *  editing code. Version it so an importer can tell what it is holding. */
export function exportContext(rows, at) {
  return {
    kind: 'proytech-content-brand-context',
    version: 1,
    exported_at: S(at, 40) || new Date().toISOString(),
    rows: A(rows).map(normContext).map(r => ({
      category: r.category, key: r.key, value: r.value,
      active: r.active, sort_order: r.sort_order,
    })),
  };
}

/** Read an export back. Returns { ok, add, collide, error }.
 *
 *  ADDITIVE, and the caller must confirm — WEEKEND1 §D: "never a silent
 *  overwrite". So this returns the rows to ADD and, separately, the ones whose
 *  category+key ALREADY EXISTS, so the confirm step can say what it is about
 *  to skip. It does not decide; it reports. */
export function planImportContext(doc, existing) {
  const d = O(doc);
  if (d.kind && d.kind !== 'proytech-content-brand-context') {
    return { ok: false, add: [], collide: [], error: `That file says it is "${S(d.kind, 80)}", not a brand context export.` };
  }
  const rows = A(d.rows).map(normContext)
    .filter(r => r.category && r.key)
    .map(r => ({ ...r, id: '' }));
  if (!rows.length) return { ok: false, add: [], collide: [], error: 'That file has no usable rows in it.' };
  const have = new Set(A(existing).map(normContext).map(r => `${r.category} ${r.key}`));
  const add = [], collide = [];
  for (const r of rows) (have.has(`${r.category} ${r.key}`) ? collide : add).push(r);
  return { ok: true, add, collide, error: '' };
}
