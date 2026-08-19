/* ============================================================================
   POCKET MATCHING — who is this segment about?
   ----------------------------------------------------------------------------
   Pure. No React, no Supabase, no fetch — the same rule src/lib/jarvis.js and
   src/lib/kb.js follow, and for the same reason: this decides what gets
   pre-selected on a card the owner is about to confirm, so it has to be
   testable without a browser.

   PLAIN TEXT, NOT AI. Names, emails and phone numbers in the transcript,
   matched against the leads already in memory. Deliberately not Pocket's
   semantic search and deliberately not a model: this runs on every proposal,
   costs nothing, and is inspectable — when it picks the wrong Mark you can read
   why in one line.

   IT RUNS IN THE BROWSER, AND IT IS DERIVED
   The owner's session already holds every lead, so matching is free and needs
   no service-key read of the leads table. More importantly it is computed at
   render, never stored (ENGINEERING §2). Rename a lead a week after the
   recording arrived and the card matches correctly; a match computed once at
   delivery would be quietly stale with nothing to notice it.

   AMBIGUITY IS A RESULT, NOT A TIEBREAK
   There are two leads named Mark Kaufmann. So this returns a LIST and says
   whether the top of it is contested. It never breaks a tie by recency,
   alphabet or record age. A pre-selected wrong destination is worse than no
   pre-selection at all, because the confirm step stops being a check and
   becomes a rubber stamp — see `best` below.
   ========================================================================== */

const S = (v, cap = 4000) => String(v == null ? '' : v).slice(0, cap);
const A = v => (Array.isArray(v) ? v : []);

/* Strongest first. The order IS the tie-break, and the only tie-break. */
export const MATCH_STRENGTHS = ['email', 'phone', 'name', 'company', 'first'];
const rank = s => MATCH_STRENGTHS.indexOf(s);

/* Company names below this are too generic to be evidence — "AB", "CO". */
const MIN_COMPANY = 4;

/* First names are the weakest signal by a distance: "so I spoke to Mark" in a
   transcript with three Marks in the database is not information. It counts
   only when nothing stronger matched at all, and never pre-selects on its own
   unless it is genuinely the only candidate. */
const MIN_FIRST = 3;

const norm = t => S(t, 400000).toLowerCase();

/** Last 10 digits. Phone formatting in a CRM is whatever someone pasted —
 *  +1 (816) 555-0134, 816.555.0134, 8165550134 — and the last ten are the only
 *  part that reliably survives that. */
const digits10 = v => { const d = S(v, 40).replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : ''; };

/** Word-boundary containment, so "Mark" does not match "marketing" and "Ana"
 *  does not match "banana". Escaped, because a lead really can be called
 *  "Smith & Co. (Holdings)". */
const hasWord = (hay, needle) => {
  const n = S(needle, 200).trim().toLowerCase();
  if (!n) return false;
  const esc = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`, 'i').test(hay);
};

/** Every phone-shaped run of digits in the text, reduced to its last 10. */
const phonesIn = text => {
  const out = new Set();
  for (const m of S(text, 400000).matchAll(/\+?\d[\d\s().-]{8,}\d/g)) {
    const d = digits10(m[0]);
    if (d) out.add(d);
  }
  return out;
};

const emailsIn = text => new Set(
  Array.from(S(text, 400000).matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi), m => m[0].toLowerCase()));

/** EVERY way this lead shows up in this text, strongest first. Empty for
 *  not at all.
 *
 *  All of them, not just the strongest, because corroboration is what resolves
 *  the two Mark Kaufmanns when a segment says "Mark Kaufmann at Delta Freight".
 *  Both Marks match the name; only one also matches the company. That is
 *  EVIDENCE, and breaking a tie on it is the opposite of breaking a tie on
 *  recency or alphabet — which this still never does. */
function signalsFor(lead, ctx) {
  if (!lead) return [];
  const out = [];

  const email = S(lead.email, 200).trim().toLowerCase();
  if (email && ctx.emails.has(email)) out.push('email');

  const phone = digits10(lead.phone);
  if (phone && ctx.phones.has(phone)) out.push('phone');

  const name = S(lead.name, 200).trim();
  const full = name.includes(' ');
  if (full && hasWord(ctx.text, name)) out.push('name');

  const company = S(lead.company, 200).trim();
  if (company.length >= MIN_COMPANY && hasWord(ctx.text, company)) out.push('company');

  /* A single-word `name` is a first name, not a full one. Only counted when
     the full name did not already match, so one person is never both. */
  const first = (full ? name.split(/\s+/)[0] : name).trim();
  if (!out.includes('name') && first.length >= MIN_FIRST && hasWord(ctx.text, first)) out.push('first');

  return out.sort((a, b) => rank(a) - rank(b));
}

/** How much corroboration a lead has, for separating leads that tie on their
 *  strongest signal. Weighted by strength so name+company beats name+first. */
const weigh = signals => signals.reduce((n, s) => n + (MATCH_STRENGTHS.length - rank(s)), 0);

/**
 * Match one segment of transcript against the leads in memory.
 *
 * Returns:
 *   matches   every lead that appears at all, strongest signal first
 *   best      the ONE lead to pre-select, or null. Null whenever the top
 *             strength is shared, so an ambiguous match offers rather than picks
 *   ambiguous true when more than one lead ties at the top strength
 *   tied      the leads that tie, for "Two people match 'Mark Kaufmann'"
 *
 * `best` is the only field that carries risk, and it is the only one held to a
 * strict standard: it is set only when a single lead is strictly stronger than
 * every other candidate.
 */
export function matchSegment(text, leads, opts = {}) {
  const { minBest = 'first' } = opts;
  const hay = norm(text);
  const ctx = { text: hay, emails: emailsIn(hay), phones: phonesIn(hay) };

  const matches = [];
  for (const lead of A(leads)) {
    const signals = signalsFor(lead, ctx);
    if (!signals.length) continue;
    matches.push({
      id: S(lead && lead.id, 60),
      lead,
      via: signals[0],
      signals,
      score: weigh(signals),
      rel: !!(lead && lead.isRelationship),
      label: S((lead && (lead.name || lead.company)) || 'Unnamed', 120),
    });
  }

  matches.sort((a, b) => rank(a.via) - rank(b.via) || b.score - a.score || a.label.localeCompare(b.label));

  if (!matches.length) return { matches: [], best: null, ambiguous: false, tied: [] };

  const top = matches[0].via;
  const atTop = matches.filter(m => m.via === top);

  /* Among leads sharing the strongest signal, the one with strictly MORE
     corroborating evidence wins. Equal evidence stays a tie — and a tie is
     offered, never guessed. */
  const bestScore = Math.max(...atTop.map(m => m.score));
  const tied = atTop.filter(m => m.score === bestScore);

  /* Below the floor, nothing is pre-selected however alone it is — a bare first
     name should open the picker, not fill it in. */
  const strongEnough = rank(top) <= rank(minBest) && top !== 'first';

  const ambiguous = tied.length > 1;
  const best = !ambiguous && strongEnough ? tied[0] : null;

  return { matches, best, ambiguous, tied };
}

/** One line explaining the result, shown on the proposal card. The owner should
 *  be able to see WHY something was pre-selected without opening anything. */
export function explainMatch(result) {
  if (!result || !result.matches.length) return 'No one in the CRM was named in this part.';
  const { best, ambiguous, tied, matches } = result;
  const how = { email: 'their email address', phone: 'their phone number', name: 'their full name',
    company: 'their company', first: 'a first name only' };
  if (ambiguous) {
    return `${tied.length} people match ${how[tied[0].via]} — ${tied.map(t => t.label).join(', ')}. Pick one.`;
  }
  if (best) {
    const also = best.signals.slice(1).map(x => how[x]);
    return also.length
      ? `Matched on ${how[best.via]}, confirmed by ${also.join(' and ')}.`
      : `Matched on ${how[best.via]}.`;
  }
  return `Only a weak match (${how[matches[0].via]}), so nothing is pre-selected.`;
}
