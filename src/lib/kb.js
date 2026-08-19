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
export const KB_CATEGORIES = [
  'Process', 'Objections', 'Onboarding', 'Vendors', 'Pricing rules', 'Tools', 'Other',
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
