/* ============================================================================
   PLAYBOOK — the internal knowledge base, brain side.
   ----------------------------------------------------------------------------
   Pure. No React, no Supabase, no fetch — the same rule src/lib/jarvis.js
   follows and for the same reason: the parts that decide what a rep can see
   must be testable without a browser, because "I clicked around and it looked
   fine" is not a proof.

   WHAT THIS MODULE IS

   Notes about how the business runs — process, handling a lender objection,
   onboarding a client, vendor quirks. Reps search them. JARVIS answers rep
   questions from them.

   WHERE THE BOUNDARY ACTUALLY LIVES — NOT HERE

   Nothing in this file enforces anything. A draft is invisible to a rep
   because `kb_notes` RLS returns them zero rows, and JARVIS sees published
   text only because `kb_ai_context()` reads `kb_published` and does not name
   `kb_notes` (KB-MIGRATION.sql, proved in VERIFY-RLS.md §6). This file
   formats what the database already decided to hand over.

   That distinction matters when reading `kbBlock` below. It is not a filter
   standing between drafts and the model. It is given published rows and
   arranges them. If it were the control, the control would be a function call
   away from being forgotten — which is exactly the failure mode the two-table
   design exists to remove.
   ========================================================================== */

/* Declared before every use — `const` does not hoist and this file is imported
   into a module graph that renders immediately (ENGINEERING.md §1). */
const S = (v, cap = 4000) => String(v == null ? '' : v).slice(0, cap);
const A = v => (Array.isArray(v) ? v : []);

export const kbUid = () => 'kb' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* Categories are a starting list, not a fixed set — the owner can type a new
   one. Deliberately NOT settings-driven yet: ENGINEERING.md §5 lists the
   things that look like settings and aren't, and this is honestly one more.
   Promote it when someone asks, not before. */
/* 'Objections', 'Script' and 'Compliance' are also the first three MODULES on
   the rep landing screen (KB_MODULE_RANK below). Naming a category one of
   these is what puts a note in that module — there is no second field to keep
   in sync, and a category that is not in this list still gets a module, it
   just sorts after the ranked ones. */
export const KB_CATEGORIES = [
  'Objections', 'Compliance', 'Script', 'Process',
  'Onboarding', 'Vendors', 'Pricing rules', 'Tools', 'Other',
];

/* How much Playbook text JARVIS gets. The published body is capped at 8000
   characters in Postgres, so six full notes is ~12k tokens worst case — the
   same order as the lead index, and it rides in the cached block. */
export const KB_MAX_FULL  = 6;
export const KB_MAX_BODY  = 2400;
export const KB_MAX_LINES = 60;

/* ------------------------------------------------------------------ shapes */

export const newKbNote = (by) => ({
  id: kbUid(),
  title: '',
  category: 'Process',
  tags: [],
  body: '',
  /* The meeting log a draft was STARTED from. An id, never any text — see
     "starting from a recording" below. */
  sourceLogId: '',
  /* Same reasoning as newMeetingLog: an id and a locator, never transcript. */
  sourcePocketId: '',
  sourceSegment: null,
  status: 'draft',
  createdAt: new Date().toISOString(),
  createdBy: S(by, 60),
  updatedAt: new Date().toISOString(),
});

/* Rows come back from Supabase as whatever was written months ago. Normalise
   on read so an older record cannot crash a newer screen.

   THIS FUNCTION NAMES EVERY KEY EXPLICITLY. A field added to the record and
   not added here saves fine and vanishes on reload — that bug has already
   shipped twice in this project (the settings loader dropped `recurring` in
   v36; normLog carries the same warning). Any new Playbook field has to be
   added below or it does not survive a refresh. */
export const normKbNote = (r) => ({
  id: S(r && r.id, 60) || kbUid(),
  title: S(r && r.title, 200),
  category: S(r && r.category, 60) || 'Process',
  tags: A(r && r.tags).map(t => S(t, 40)).filter(Boolean).slice(0, 12),
  body: S(r && r.body, 8000),
  sourceLogId: S(r && r.sourceLogId, 60),
  sourcePocketId: S(r && r.sourcePocketId, 60),
  sourceSegment: (r && r.sourceSegment) ? {
    start: S(r.sourceSegment.start, 12), end: S(r.sourceSegment.end, 12), quote: S(r.sourceSegment.quote, 300),
  } : null,
  status: S(r && r.status, 20) === 'published' ? 'published' : 'draft',
  createdAt: S(r && r.createdAt, 40) || new Date().toISOString(),
  createdBy: S(r && r.createdBy, 60),
  updatedAt: S(r && r.updatedAt, 40) || S(r && r.createdAt, 40) || new Date().toISOString(),
});

/* A row out of kb_published / kb_preview(). Six fields, matching the table
   column for column — if this ever grows a seventh, the column has to exist
   first, which is the point of that table not being a jsonb blob. */
export const normKbPub = (r) => ({
  id: S(r && r.id, 60),
  title: S(r && r.title, 200),
  category: S(r && r.category, 60),
  tags: A(r && r.tags).map(t => S(t, 40)).filter(Boolean),
  body: S(r && r.body, 8000),
  publishedAt: S((r && (r.published_at || r.publishedAt)), 40),
});

/* --------------------------------------------------------------- the drift */

/* The published copy is a deliberate snapshot, not a derived value — the owner
   keeps editing while reps keep reading the last approved text. ENGINEERING.md
   §2 says a second copy of a fact drifts; here the drift IS the feature, so it
   is made VISIBLE rather than prevented. An invisible drift is the
   two-screens-disagree bug wearing a hat.

   kb_publish() stamps kb_notes.updated_at and kb_published.published_at from
   the same transaction now(), so a freshly published note reads as in sync. */
export const isBehind = (note, pub) => {
  if (!note || !pub) return false;
  const edited = S(note.updatedAt, 40);
  const shipped = S(pub.publishedAt, 40);
  if (!edited || !shipped) return false;
  return new Date(edited).getTime() > new Date(shipped).getTime();
};

/* What actually differs, for the indicator's tooltip. Deliberately coarse: the
   owner wants to know THAT it moved and can press preview to see how. */
export const behindSummary = (note, pub) => {
  if (!note || !pub) return '';
  const bits = [];
  if (S(note.title, 200) !== S(pub.title, 200)) bits.push('title');
  if (S(note.category, 60) !== S(pub.category, 60)) bits.push('category');
  if (A(note.tags).join('|') !== A(pub.tags).join('|')) bits.push('tags');
  if (S(note.body, 8000) !== S(pub.body, 8000)) bits.push('the text');
  return bits.length ? bits.join(', ') : 'nothing visible — only the timestamp';
};

/* --------------------------------------------------------------- searching */

const words = q => S(q, 300).toLowerCase().replace(/[^a-z0-9\s'-]/g, ' ').split(/\s+/).filter(w => w.length > 2);

/** Rank notes against a query. Title and tags outweigh the body, because a
 *  rep searching "lender objection" wants the note CALLED that, not every note
 *  that mentions a lender in passing. Returns a new array, highest first. */
export function searchKb(notes, q) {
  const list = A(notes);
  const ws = words(q);
  if (!ws.length) return list.slice().sort((a, b) => S(b.updatedAt || b.publishedAt).localeCompare(S(a.updatedAt || a.publishedAt)));
  const scored = list.map(n => {
    const title = S(n && n.title, 200).toLowerCase();
    const tags = A(n && n.tags).join(' ').toLowerCase();
    const cat = S(n && n.category, 60).toLowerCase();
    const body = S(n && n.body, 8000).toLowerCase();
    let score = 0;
    for (const w of ws) {
      if (title.includes(w)) score += 12;
      if (tags.includes(w)) score += 8;
      if (cat.includes(w)) score += 5;
      if (body.includes(w)) score += 2;
    }
    return { n, score };
  }).filter(x => x.score > 0);
  scored.sort((a, b) => b.score - a.score || S(a.n.title).localeCompare(S(b.n.title)));
  return scored.map(x => x.n);
}

/* ------------------------------------------------------------ JARVIS block */

/** Build the `kb` block of the JARVIS payload.
 *
 *  GIVEN published rows only — the caller passes the result of
 *  `db.kbAiContext()`, which is `kb_ai_context()`, which reads `kb_published`.
 *  There is no draft branch here because there are no drafts here.
 *
 *  Two tiers, mirroring the lead index/detail split rather than inventing a
 *  second scheme: the notes most relevant to the question arrive whole, the
 *  rest arrive as a title line so the model knows they exist and can say
 *  "there's a note on that, pin it". */
export function kbBlock(rows, question, opts = {}) {
  const { maxFull = KB_MAX_FULL, maxBody = KB_MAX_BODY, maxLines = KB_MAX_LINES } = opts;
  const all = A(rows).map(normKbPub).filter(n => n.id && n.body);
  if (!all.length) return { full: [], lines: [] };

  const ranked = searchKb(all, question);
  const rest = all.filter(n => !ranked.includes(n));
  const ordered = ranked.concat(rest);

  const full = ordered.slice(0, maxFull).map(n => ({
    id: n.id, title: n.title, category: n.category,
    tags: n.tags.slice(0, 6), body: S(n.body, maxBody),
  }));
  const seen = new Set(full.map(f => f.id));
  const lines = ordered.filter(n => !seen.has(n.id)).slice(0, maxLines)
    .map(n => ({ id: n.id, title: n.title, category: n.category }));

  return { full, lines };
}

/* ==========================================================================
   THE REP-FACING SHAPE — modules, order, and the blocks inside a note.
   --------------------------------------------------------------------------
   Everything below exists because of ONE failure mode, and it is worth naming
   before reading any of it:

     A rep is on a live call. The prospect says "what's the catch." He has
     seconds, and the words he is supposed to SAY are sitting in the middle of
     a paragraph explaining WHY they work.

   The old rep screen rendered a note as `whiteSpace: pre-wrap` — one
   undifferentiated block, spoken lines and coaching identical. That is the
   thing that fails, and it fails exactly when it matters most.

   So a note body is parsed into typed blocks and the SPOKEN ones are a
   different block kind from the explanatory ones. The screen can then make
   them look nothing like each other. `>` is what you say out loud; a plain
   paragraph is why it works; `!` is a compliance line.

   NO SCHEMA CHANGE. This is a body-text convention, not a column. `kb_notes`
   and `kb_published` are untouched, which is deliberate: the security model
   in KB-MIGRATION.sql is proved (VERIFY-RLS.md §6) and re-proving it was not
   worth a nicer parser.

   WHY THE PARSER RETURNS DATA AND NOT HTML. Every function here returns plain
   objects that the screen maps to React elements. Nothing builds a markup
   string and nothing is handed to dangerouslySetInnerHTML — a Playbook note is
   text an owner typed, and the one guaranteed way to keep typed text from
   becoming script is to never have a path that could render it as markup.
   ========================================================================== */

/* Which modules come first on a rep's landing screen.

   'Objections' leads because it is the highest-frequency thing a rep opens the
   Playbook FOR — mid-call, under time pressure. That is a claim about sales
   playbooks generally, not about this install, which is why it is a default
   ordering and not a hardcoded list of screens: categories are free text
   (KB_CATEGORIES is "a starting list, not a fixed set"), so a tenant that
   never uses these names still gets a sane screen — unranked categories sort
   after the ranked ones, alphabetically, rather than vanishing. */
export const KB_MODULE_RANK = ['Objections', 'Compliance', 'Script', 'Process'];

export const moduleRank = (cat) => {
  const c = S(cat, 60);
  const i = KB_MODULE_RANK.indexOf(c);
  if (i >= 0) return i;
  const j = KB_CATEGORIES.indexOf(c);
  /* Known-but-unranked sorts after ranked; unknown sorts after everything.
     Both keep a stable, explainable position — an arbitrary order on a
     reference a rep is learning is its own small tax. */
  return j >= 0 ? KB_MODULE_RANK.length + j : 900;
};

/* Order inside a module.

   Reads the number the SOURCE DOCUMENT already carries — "SOP-01 · …",
   "2. The in" — rather than inventing a sort column. The documents are
   numbered because their author numbered them, so honouring that is both
   free and correct, and a note with no number falls back to alphabetical
   instead of to publish date. Publish date was the old behaviour and it put
   SOP-04 before SOP-01 whenever SOP-04 was edited last. */
const NUM_PREFIX = /^\s*(?:SOP[\s._-]*)?(\d{1,3})\s*[.·:)\]-]/i;
export const titleRank = (t) => {
  const m = NUM_PREFIX.exec(S(t, 200));
  return m ? Number(m[1]) : 9999;
};

const cmpNote = (a, b) =>
  titleRank(a && a.title) - titleRank(b && b.title) ||
  S(a && a.title, 200).localeCompare(S(b && b.title, 200));

/** Group published notes into ordered modules for the rep landing.
 *  Given kb_published rows — the only Playbook table a rep's login can select
 *  from at all — so there is no draft branch here for the same reason kbBlock
 *  has none. */
export function kbModules(notes) {
  const by = new Map();
  for (const r of A(notes)) {
    const n = normKbPub(r);
    if (!n.id) continue;
    const k = n.category || 'Other';
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(n);
  }
  return Array.from(by.entries())
    .map(([key, ns]) => ({ key, notes: ns.slice().sort(cmpNote) }))
    .sort((a, b) => moduleRank(a.key) - moduleRank(b.key) || a.key.localeCompare(b.key));
}

/* ----------------------------------------------------------------- inline */

/* **bold**, *italic*, `code`. Deliberately small: the vocabulary a rep needs
   inside a spoken line is emphasis, and every construct added here is one more
   thing that can render wrong on a phone mid-call. */
const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\n]+\*)/g;

export function parseInline(s) {
  const str = S(s, 8000);
  const out = [];
  let last = 0;
  str.replace(INLINE, (m, _g, idx) => {
    if (idx > last) out.push({ t: 't', s: str.slice(last, idx) });
    if (m.slice(0, 2) === '**') out.push({ t: 'b', s: m.slice(2, -2) });
    else if (m[0] === '`') out.push({ t: 'c', s: m.slice(1, -1) });
    else out.push({ t: 'i', s: m.slice(1, -1) });
    last = idx + m.length;
    return m;
  });
  if (last < str.length) out.push({ t: 't', s: str.slice(last) });
  return out.length ? out : [{ t: 't', s: str }];
}

/* ----------------------------------------------------------------- blocks */

/** Parse a note body into typed blocks.
 *
 *  kinds:
 *    say     — the words to say OUT LOUD. `> line`. The one that matters.
 *    p       — why it works. Plain prose.
 *    h       — `## heading`
 *    ul / ol — `- item` / `1. item`
 *    caution — `! never do this`. Compliance, not content.
 *    table   — `| a | b |`
 *    hr      — `---`
 *
 *  Unknown syntax degrades to a paragraph rather than being dropped. A note
 *  that renders as plain prose is a bad screen; a note with a silently missing
 *  line is a rep who never reads a rule.
 */
export function parseBlocks(body) {
  const lines = S(body, 8000).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let para = [];
  const flush = () => { if (para.length) { out.push({ kind: 'p', text: para.join(' ').trim() }); para = []; } };
  const runOf = (i, re, strip) => {
    const items = [];
    while (i < lines.length && re.test(lines[i])) { items.push(lines[i].trim().replace(strip, '')); i++; }
    return [items, i];
  };

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const t = raw.trim();

    if (!t) { flush(); i++; continue; }

    if (/^-{3,}$/.test(t) || /^_{3,}$/.test(t)) { flush(); out.push({ kind: 'hr' }); i++; continue; }

    const h = /^(#{1,4})\s+(.*)$/.exec(t);
    if (h) { flush(); out.push({ kind: 'h', level: h[1].length, text: h[2].trim() }); i++; continue; }

    /* A run of `>` lines is one spoken passage. A bare `>` inside the run
       splits it into two paragraphs — that is a pause on the call, and the
       script uses it deliberately ("Then stop talking"). */
    if (/^>/.test(t)) {
      flush();
      const paras = [];
      let cur = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        const c = lines[i].trim().replace(/^>\s?/, '').trim();
        if (!c) { if (cur.length) { paras.push(cur.join(' ')); cur = []; } }
        else cur.push(c);
        i++;
      }
      if (cur.length) paras.push(cur.join(' '));
      if (paras.length) out.push({ kind: 'say', paras });
      continue;
    }

    if (/^!\s+/.test(t)) {
      flush();
      let items; [items, i] = runOf(i, /^\s*!\s+/, /^!\s+/);
      out.push({ kind: 'caution', items });
      continue;
    }

    if (/^[-*]\s+/.test(t)) {
      flush();
      let items; [items, i] = runOf(i, /^\s*[-*]\s+/, /^[-*]\s+/);
      out.push({ kind: 'ul', items });
      continue;
    }

    if (/^\d+[.)]\s+/.test(t)) {
      flush();
      let items; [items, i] = runOf(i, /^\s*\d+[.)]\s+/, /^\d+[.)]\s+/);
      out.push({ kind: 'ol', items });
      continue;
    }

    if (/^\|/.test(t)) {
      flush();
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        rows.push(lines[i].trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim()));
        i++;
      }
      /* The `|---|---|` rule is a separator, never a row of data. Without this
         the swap table renders a row of dashes as its first industry. */
      const sep = rows.length > 1 && rows[1].every(c => /^:?-{2,}:?$/.test(c));
      out.push({ kind: 'table', head: rows[0] || [], rows: sep ? rows.slice(2) : rows.slice(1) });
      continue;
    }

    para.push(t);
    i++;
  }
  flush();
  return out;
}

/* The short front half of a compliance line — "no results promises", "no
   client names" — for the strip that sits on the landing screen. A rep who is
   unsure mid-call needs to SEE the headline without opening anything; the full
   rule is one click behind it. */
export const leadOf = (text) => {
  const s = S(text, 400).trim();
  const b = /^\*\*(.+?)\*\*/.exec(s);
  if (b) return b[1].replace(/[\s.:;,—-]+$/, '').trim();
  const cut = s.split(/[.—]/)[0];
  return (cut || s).replace(/[\s.:;,—-]+$/, '').trim();
};

/** The published note that carries the compliance list, or null.
 *
 *  Found by CONTENT — the note with the MOST `!` lines — and not by category
 *  name. Two reasons, and the second one is the bug this shape exists to
 *  prevent:
 *
 *  1. Keying the treatment off the string 'Compliance' would mean a tenant who
 *     renames the category silently loses the warning styling on the one list
 *     where losing it matters. Ordering may degrade to alphabetical; this must
 *     not.
 *
 *  2. MOST, not FIRST. Individual notes legitimately carry a rule or two — the
 *     price objection ends in three of them. First-match would put the
 *     objections module ahead of the actual compliance list and pin the wrong
 *     note to the landing screen, which is worse than pinning none: a rep
 *     would learn the strip is where the rules live and be reading three of
 *     the nine.
 *
 *  Ties break by module order, so the result is stable rather than dependent
 *  on which note was published last. */
export const cautionNote = (mods) => {
  let best = null, bestN = 0;
  for (const m of A(mods)) {
    for (const n of A(m && m.notes)) {
      const c = parseBlocks(n && n.body).filter(b => b.kind === 'caution')
        .reduce((s, b) => s + A(b.items).length, 0);
      if (c > bestN) { best = n; bestN = c; }
    }
  }
  return best;
};

/** Every compliance line in a note, flattened. */
export const cautionItems = (note) =>
  parseBlocks(note && note.body).filter(b => b.kind === 'caution').flatMap(b => A(b.items));

/* ==========================================================================
   PAGINATION — a note becomes a deck of cards, not a document.
   --------------------------------------------------------------------------
   THE MOMENT THIS EXISTS FOR

     A rep is mid-sentence. Someone has just said "what's the catch." He looks
     at one card and reads. He does not scroll, and he does not scan past a
     heading to find the line.

   WHY HEADINGS AND NOT HEIGHT

   Card breaks come from the source document's own `##`, never from measuring
   pixels. Four reasons, and the first decides it:

     1. STABILITY. Height pagination reflows with viewport, zoom and text size,
        so card 3 on a laptop is card 4 on a phone. A rep LEARNS this deck —
        "the answer is the first card" has to be true everywhere, or he is
        re-finding it every time and the deck is worse than the document was.
     2. A `##` is where the author decided an idea ended. A height break is
        where a pixel ran out. Splitting the coaching mid-paragraph is the wall
        of text wearing a different hat.
     3. Pure and testable. No DOM, no measurement, same answer every run.
     4. A position indicator only means something if the count is stable.

   Height-based splitting also has one disqualifying failure: it can break a
   SAY block in half. The words he reads aloud are the one thing that must
   never straddle a card, and `neverSplit` below is what guarantees it.

   THE COST MODEL IS AN ESTIMATE, AND IT ERRS TOWARDS MORE CARDS

   Numbers below are approximate PIXELS at the card's type scale. They are not
   measured and cannot be — that is the point. So the budget is set below the
   real usable height, the card keeps `overflow-y:auto` as a net that should
   never engage, and a test asserts every seeded note stays inside it. If the
   model is ever wrong a rep gets a scrollbar, not a compliance rule he cannot
   see. Degrade visibly, never silently.
   ========================================================================== */

/* Usable height inside a card once the header and the footer are taken out. */
export const CARD_BUDGET = 560;

/* Rough line counts at the card's type scale, in a ~1000px column. */
const linesOf = (s, perLine) => Math.max(1, Math.ceil(S(s, 8000).length / perLine));

export const blockCost = (b) => {
  if (!b) return 0;
  if (b.kind === 'say')     return 34 + A(b.paras).reduce((n, p) => n + linesOf(p, 52) * 42 + 14, 0);
  if (b.kind === 'p')       return 14 + linesOf(b.text, 92) * 25;
  if (b.kind === 'ul' ||
      b.kind === 'ol')      return 12 + A(b.items).reduce((n, i) => n + linesOf(i, 88) * 24 + 8, 0);
  if (b.kind === 'caution') return 10 + A(b.items).reduce((n, i) => n + linesOf(i, 80) * 23 + 20, 0);
  if (b.kind === 'table')   return 44 + (A(b.rows).length + 1) * 44;
  if (b.kind === 'rowcard') return 60 + A(b.cells).reduce((n, c) => n + linesOf(c, 60) * 26 + 26, 0);
  if (b.kind === 'hr')      return 22;
  return 26;
};

/* A say block is never split. Everything else may start a new card, but only
   at a block boundary — never inside one, and never mid-sentence. */
const neverSplit = b => b && b.kind === 'say';

/* A LIST OF INDEPENDENT RULES MAY SPLIT AT ITS ITEMS, and must: "Things you
   cannot say" is nine compliance rules in ONE caution block, which as a single
   unsplittable unit is half again taller than a card. Each rule stands alone,
   so breaking between two of them costs nothing — whereas breaking a sentence,
   or a spoken line, costs everything. Prose blocks are never split this way. */
const SPLITTABLE = new Set(['caution', 'ul', 'ol']);

const splitBlock = (b, budget) => {
  if (!SPLITTABLE.has(b && b.kind) || blockCost(b) <= budget) return [b];
  const out = [];
  let items = [], cost = 0;
  for (const it of A(b.items)) {
    const c = blockCost({ kind: b.kind, items: [it] });
    if (items.length && cost + c > budget) { out.push({ ...b, items }); items = []; cost = 0; }
    items.push(it); cost += c;
  }
  if (items.length) out.push({ ...b, items });
  return out;
};

/* --------------------------------------------------------------- the shape */

/** How one card lays out.
 *
 *  THE SPOKEN LINE LEADS. If the card has one, it is the largest thing on it
 *  and everything else arranges around it:
 *
 *    eyebrow  a SHORT paragraph immediately before the say — "They say: …" —
 *             which is context for the line, not a competitor to it. Rendered
 *             small and dim, so the eye still lands on the say.
 *    say      the words out loud.
 *    rest     everything else, in authored order, below.
 *
 *  A long paragraph before the say is NOT an eyebrow; it moves below, because
 *  a rep should never read a paragraph to reach the sentence he needs. */
export const EYEBROW_MAX = 96;

export function cardShape(blocks) {
  const bs = A(blocks);
  const i = bs.findIndex(b => b && b.kind === 'say');
  if (i < 0) return { eyebrow: null, say: null, rest: bs };
  const prev = i > 0 ? bs[i - 1] : null;
  const isEyebrow = !!prev && prev.kind === 'p' && S(prev.text, 400).length <= EYEBROW_MAX;
  const rest = bs.filter((b, j) => j !== i && !(isEyebrow && j === i - 1));
  return { eyebrow: isEyebrow ? prev : null, say: bs[i], rest };
}

/* ---------------------------------------------------------- the pagination */

/** Break a note body into cards.
 *
 *  Returns [{ heading, blocks, cont, pos }], where `cont` marks a continuation
 *  of the previous heading and `pos` is [n, total] for a table's row cards.
 *  Always at least one card, so an empty note is an empty card rather than a
 *  crash or a blank screen with no explanation. */
export function paginate(body) {
  const blocks = parseBlocks(body);

  /* Level 1 — split at the author's own headings. */
  const sections = [];
  let cur = { heading: '', blocks: [] };
  for (const b of blocks) {
    if (b.kind === 'h') {
      if (cur.heading || cur.blocks.length) sections.push(cur);
      cur = { heading: b.text, blocks: [] };
    } else cur.blocks.push(b);
  }
  if (cur.heading || cur.blocks.length) sections.push(cur);
  if (!sections.length) return [{ heading: '', blocks: [], cont: false }];

  /* A WIDE TABLE BECOMES ONE CARD PER ROW, then one card of the whole table.
     On a call he wants his own industry, not a grid of six — but the grid is
     the only way to compare, so it stays, as the last card of the same deck
     rather than somewhere he has to navigate to. */
  const expanded = [];
  for (const s of sections) {
    let buf = [];
    const flush = () => { if (buf.length) { expanded.push({ heading: s.heading, blocks: buf }); buf = []; } };
    for (const b of s.blocks) {
      if (b.kind === 'table' && A(b.rows).length >= 3) {
        flush();
        b.rows.forEach((r, i) => expanded.push({
          heading: s.heading,
          blocks: [{ kind: 'rowcard', head: A(b.head), cells: A(r) }],
          pos: [i + 1, b.rows.length],
        }));
        expanded.push({ heading: s.heading, blocks: [b], all: true });
      } else buf.push(b);
    }
    flush();
  }

  /* Level 2 — a section still over budget splits again, at block boundaries
     only. A say block is moved whole rather than broken. */
  const cards = [];
  for (const sec of expanded) {
    let run = [], cost = 0, first = true;
    const push = () => {
      cards.push({ heading: sec.heading, blocks: run, cont: !first, ...(sec.pos ? { pos: sec.pos } : {}), ...(sec.all ? { all: true } : {}) });
      first = false; run = []; cost = 0;
    };
    const parts = sec.blocks.flatMap(b => splitBlock(b, CARD_BUDGET));
    for (const b of parts) {
      const c = blockCost(b);
      if (run.length && cost + c > CARD_BUDGET) {
        /* THE EYEBROW GOES WITH ITS SAY. A short "They say: …" left stranded on
           its own card is the exact failure this deck exists to prevent: the
           rep clicks the objection and lands on the question he was just asked
           instead of the answer. So a trailing short paragraph is carried onto
           the new card rather than orphaned on the old one. */
        const last = run[run.length - 1];
        const carry = (neverSplit(b) && last && last.kind === 'p'
                       && S(last.text, 400).length <= EYEBROW_MAX) ? run.pop() : null;
        if (run.length) push(); else run.length = 0;
        if (carry) { run.push(carry); cost = blockCost(carry); }
      }
      run.push(b); cost += c;
    }
    if (run.length || first) push();
  }
  return cards.length ? cards : [{ heading: '', blocks: [], cont: false }];
}

/* ==========================================================================
   PLAYBOOK PROGRESS — what a rep has read, and whether he is through the gate.
   --------------------------------------------------------------------------
   READ MEANS HE REACHED THE LAST CARD, not that he opened the note. Since a
   note is a deck, the card index is already known, so the stronger definition
   is free — and a fourteen-card SOP can no longer be dismissed with one click.

   THE COMPLIANCE LIST ALSO NEEDS AN ACKNOWLEDGEMENT. It is the one whose answer
   might have to be produced to somebody outside the company, and a record of
   "he said he had read it, at 09:14 on the 26th" is worth more than the gate
   is. Everything else is opened-and-finished.

   A RESET IS A ROW, NOT A DELETION. Sending a rep back through the Playbook
   must not erase the fact that he acknowledged the rules a fortnight ago, so
   progress is counted only from the most recent reset forward.

   Nothing here enforces anything. The gate is a routing decision in the app
   (canOpen), and it is a speed bump rather than a boundary — deliberately, and
   the reasoning is in ROLES.md. What is NOT a speed bump is the record, which
   only kb_mark_read() can write.
   ========================================================================== */

/** Fold kb_reads rows into "what has this rep finished".
 *  Rows are {note_id, kind, at}; the caller passes one rep's rows. */
export function readState(rows) {
  const all = A(rows).filter(r => r && r.kind);
  /* Everything before the newest reset is history, not progress. */
  const resetAt = all.filter(r => r.kind === 'reset')
    .reduce((mx, r) => (!mx || S(r.at, 40) > mx) ? S(r.at, 40) : mx, '');
  const live = all.filter(r => r.kind !== 'reset' && (!resetAt || S(r.at, 40) > resetAt));

  const read = new Map();
  const acked = new Map();
  for (const r of live) {
    const id = S(r.note_id, 60);
    if (!id) continue;
    const at = S(r.at, 40);
    if (r.kind === 'ack') { if (!acked.has(id) || at < acked.get(id)) acked.set(id, at); }
    if (!read.has(id) || at < read.get(id)) read.set(id, at);
  }
  return { read, acked, resetAt };
}

/** Which published notes still stand between a rep and the rest of the app.
 *
 *  A note needs an ACKNOWLEDGEMENT rather than a read when it carries the
 *  compliance rules — found by content (the note with the most `!` lines), the
 *  same way the landing strip finds it, so renaming a category cannot quietly
 *  drop the one requirement that has a record attached to it. */
export function playbookGate(pub, rows) {
  const mods = kbModules(pub);
  const notes = mods.flatMap(m => m.notes);
  const { read, acked, resetAt } = readState(rows);
  const needsAck = cautionNote(mods);
  const ackId = needsAck ? needsAck.id : '';

  const outstanding = notes.filter(n =>
    n.id === ackId ? !acked.has(n.id) : !read.has(n.id));

  /* FAILS OPEN ON AN EMPTY PLAYBOOK. An install that has published nothing must
     not lock every rep out of the whole app; "he has read all zero notes" is
     the true answer and it is also the safe one. */
  return {
    total: notes.length,
    done: notes.length - outstanding.length,
    outstanding,
    ackId,
    ackDone: !ackId || acked.has(ackId),
    complete: notes.length === 0 || outstanding.length === 0,
    resetAt,
  };
}

/** Notes published since the rep finished — the ones that must NOT re-lock him.
 *  Locking a working rep out over one new note is a worse outcome than his
 *  reading it a day late, so these surface as a count and a banner. A new
 *  COMPLIANCE note is the exception and asks for one click, not the gate. */
export function unreadSince(pub, rows) {
  const mods = kbModules(pub);
  const notes = mods.flatMap(m => m.notes);
  const { read, acked } = readState(rows);
  const ack = cautionNote(mods);
  const fresh = notes.filter(n => !read.has(n.id));
  return {
    fresh,
    count: fresh.length,
    /* A new compliance list he has never acknowledged. */
    needsAck: ack && !acked.has(ack.id) ? ack : null,
  };
}
