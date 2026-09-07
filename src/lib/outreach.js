/* ============================================================================
   MASS OUTREACH — the pure half.
   ----------------------------------------------------------------------------
   One occasion, a hand-picked audience, one drafted text each, sent one tap at
   a time through the Mac's own Messages app.

   Everything in this file is PURE. No React, no Supabase, no fetch. The rules
   that must not be got wrong — who is excluded, what is held back, what a draft
   is allowed to contain — are here so they can be unit-tested without a
   browser, exactly like src/lib/jarvis.js.

   THE THREE RULES THAT ARE NOT NEGOTIABLE, AND WHERE EACH IS ENFORCED

     1. DNC AND BAD NUMBERS NEVER APPEAR.  `pickable()` below, called by the
        screen BEFORE the list renders — not a filter applied to the selection
        afterwards. A record that is not on the screen cannot be ticked by
        accident, which is a stronger guarantee than a check that runs later.
        The predicate is `deadReason` from lib/lead.js, the SAME one the dial
        screen uses. There is deliberately no second definition of "do not
        contact" in this codebase.

     2. MEMORIAL DAY DOES NOT GET DRAFTED FOR VETERANS AND MILITARY FAMILIES.
        `heldBy()` below. Memorial Day is a day for people who died, and a
        cheerful note about enjoying the long weekend is the wrong thing to
        send someone who lost people. Those records are FLAGGED, not skipped
        and not drafted: they reach the review list with an empty message and
        the reason, and the owner writes the line themselves.

        ONE CONDITION, NOT A FEATURE. This is not a sensitivity engine and must
        not grow into one — a general "is this occasion delicate for this
        person" rule is a thing that fails silently in both directions. It is
        one named holiday against one pair of labels, and if a second case is
        ever wanted it should be a second named condition sitting beside this
        one, visible in the source.

     3. NOTHING IS SENT BY THIS CODE. There is no send path here, in the route,
        or anywhere in the app. A draft becomes an `sms:` link, and a person
        presses send inside Messages. Written down because it is the strongest
        guarantee in the design, and the kind of thing that gets "improved"
        away in six months by someone who did not know it was load-bearing.

   MONEY NEVER ENTERS THE REQUEST. `cardOf()` builds its payload from an
   ALLOWLIST of named fields rather than by stripping a record. Same reasoning
   as CONTACT_DISP in lib/lead.js: a field added later and forgotten here is
   simply absent, which is the safe direction. A denylist fails the other way —
   add `dealValue2` and it ships straight to the model. A deal value has no
   business anywhere near a text message, and the cheapest way to guarantee it
   never lands in one is for it never to be in the request.
   ========================================================================== */

/* Extension is required. The test bundles this file with esbuild (lib/lead.js
   pulls in lucide-react through ACT_TYPES, so plain Node ESM cannot load it),
   but the bundler still resolves relative imports literally here. */
import { deadReason, labelsOf, keyDatesOf, isRealTouch, lastTouch } from './lead.js';

/* ------------------------------------------------------------------ basics */

const A = v => (Array.isArray(v) ? v : []);
const S = (v, cap = 300) => String(v == null ? '' : v).slice(0, cap);
const low = v => S(v, 200).trim().toLowerCase();

/** Leads drafted in one request to api/outreach-draft. The browser drives the
 *  loop and calls the route once per chunk, because there is no `functions`
 *  block in vercel.json — the deployment runs on the platform default duration,
 *  and a single invocation drafting two hundred messages does not fit inside
 *  it. Ten also means a failure costs ten drafts, not the whole run, and the
 *  review list fills in while the rest is still being written. */
export const OUTREACH_CHUNK = 10;

/** A ceiling on one run. Not a guess at what is reasonable — it is the number
 *  above which a mis-click on "select all shown" stops being recoverable by
 *  looking at the screen. Stated on the screen rather than enforced silently,
 *  per CLAUDE.md: a default is a fallback, and it says which one fell back. */
export const OUTREACH_MAX = 250;

/** Longest drafted message. Not an SMS segment limit — a holiday text that runs
 *  past this reads as a form letter, and a model asked for "short" without a
 *  number gives you four sentences. Enforced at the write in `validateDraft`,
 *  not requested in the prompt, per ENGINEERING.md: a model told to be brief is
 *  making an effort, not obeying a constraint. */
export const DRAFT_MAX_CHARS = 320;

/* ---------------------------------------------------- who can be texted */

/** The phone number as a URL scheme will accept it: digits, with a single
 *  leading +. `(555) 867-5309` in an href is a broken link, and the failure is
 *  silent — Messages opens with an empty To field and you notice after you have
 *  typed something into it. */
export function dialDigits(phone) {
  const raw = S(phone, 40).trim();
  if (!raw) return '';
  const plus = raw.startsWith('+');
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  return (plus ? '+' : '') + digits;
}

/** Can this record be ticked, and if not, why not?
 *
 *  Returns { ok, reason, why } — `reason` is a stable code for the screen to
 *  branch on, `why` is the sentence a person reads.
 *
 *  THE TWO ANSWERS ARE NOT THE SAME SHAPE, deliberately:
 *
 *    dead ('DNC' | 'BAD')  the record must not reach the screen at all. See
 *                          `pickable` below — the list is filtered, not the
 *                          selection.
 *    'nophone'             the record IS shown, greyed, with the reason. A
 *                          record you cannot text because you never wrote the
 *                          number down is a thing you want to SEE; hiding it
 *                          makes "not in the list" mean two different things,
 *                          and MEMORY/failed-search says the difference
 *                          between "I could not find it" and "it is not there"
 *                          is the whole answer. */
export function eligibility(lead) {
  const dead = deadReason(lead);
  if (dead === 'DNC') {
    return { ok: false, reason: 'DNC', why: 'Marked do-not-call. Never contacted again.' };
  }
  if (dead === 'BAD') {
    return { ok: false, reason: 'BAD', why: 'The number on file is dead, wrong or disconnected.' };
  }
  if (!dialDigits(lead && lead.phone)) {
    return { ok: false, reason: 'nophone', why: 'No phone number on this record.' };
  }
  return { ok: true, reason: '', why: '' };
}

/** THE LIST THE SCREEN RENDERS. Do-not-call and dead numbers are removed here,
 *  before anything is drawn, so they cannot be ticked however hard someone
 *  tries. Everything else — including records with no phone — stays visible and
 *  is refused at the checkbox instead. */
export function pickable(leads) {
  return A(leads).filter(l => {
    if (!l) return false;
    const d = deadReason(l);
    return d !== 'DNC' && d !== 'BAD';
  });
}

/** Why a record is missing from the list, counted. The screen states this out
 *  loud — "31 records are not shown: 12 do-not-call, 19 dead numbers" — because
 *  a list that is quietly shorter than the book is a list nobody can trust. */
export function excludedCounts(leads) {
  let dnc = 0, bad = 0;
  for (const l of A(leads)) {
    const d = deadReason(l);
    if (d === 'DNC') dnc++;
    else if (d === 'BAD') bad++;
  }
  return { dnc, bad, total: dnc + bad };
}

/* ------------------------------------------- the one sensitivity condition */

/* The labels that mean this person served, or lost someone who did. Matched as
   SUBSTRINGS, case-insensitively, and not against a fixed list: the label
   vocabulary is editable per install (DEFAULT_OPTIONS.labels in lib/lead.js),
   so an install may well have "US Veteran", "Military Family" or "Gold Star"
   rather than the two words shipped by default. An exact-match check would
   pass silently on every one of those, which is the failure that matters here.
   'Military' also catches 'Military Family', which is intended. */
const HELD_LABEL_WORDS = ['veteran', 'military'];

/* The occasion this applies to. One holiday, named. Memorial Day is for the
   people who did not come home; Veterans Day is for the living and is NOT in
   this list, because a warm note on Veterans Day is exactly right. Getting that
   distinction wrong in either direction is the whole point of the rule. */
const HELD_OCCASION_WORDS = ['memorial day'];

/** Does this occasion, for this person, need a human to write it?
 *
 *  Returns '' or the sentence the review row shows. Both halves must match:
 *  a Memorial Day message to someone with no service label is drafted
 *  normally, and a birthday message to a veteran is drafted normally. */
export function heldBy(lead, occasion) {
  const occ = low(occasion);
  if (!HELD_OCCASION_WORDS.some(w => occ.includes(w))) return '';
  const labels = labelsOf(lead).map(low);
  const hit = labels.find(l => HELD_LABEL_WORDS.some(w => l.includes(w)));
  if (!hit) return '';
  return `Labelled "${hit}" and this is Memorial Day. Write this one yourself — `
    + 'a cheerful note about enjoying the long weekend is the wrong thing to '
    + 'send someone who lost people.';
}

/* ------------------------------------------------- what the model is given */

/* Human-written notes only. A system note ("Stage moved: …") is the app talking
   to itself, and an imported note is a spreadsheet cell nobody said out loud —
   both would be mined as if they were a conversation. isRealTouch already
   encodes exactly that judgement and is the predicate the touch clock uses, so
   this reuses it rather than re-deciding it. */
function recentNotes(lead, n) {
  return A(lead && lead.activities)
    .filter(a => a && a.ts && isRealTouch(a))
    .slice()
    .sort((a, b) => String(b.ts).localeCompare(String(a.ts)))
    .slice(0, n)
    .map(a => ({ when: S(a.ts, 10), what: S(a.type, 20), text: S(a.text, 220) }));
}

/** One person, compressed to what is worth personalising a holiday text from.
 *
 *  AN ALLOWLIST OF NAMED FIELDS. Nothing arrives here by being on the record —
 *  it arrives by being written below. That is what guarantees no deal value,
 *  retainer, commission or payment can reach the model, today or after somebody
 *  adds a field in six months. */
export function cardOf(lead) {
  const l = lead || {};
  const card = {
    id: S(l.id, 40),
    name: S(l.name, 80),
    company: S(l.company, 80),
    businessType: S(l.businessType, 60),
    /* What they are to the business. A connector worked for introductions and a
       client mid-build are owed different messages, and the register is most of
       what makes a holiday text read as written by a person. */
    kind: l.isClient ? 'client' : l.isRelationship ? 'relationship' : 'lead',
    labels: labelsOf(l).map(x => S(x, 40)).slice(0, 8),
    keyDates: keyDatesOf(l).slice(0, 6).map(k => ({
      what: S(k && (k.label || k.what), 40), when: S(k && (k.date || k.when), 12),
    })),
    /* How the owner knows them, in the owner's own words. On a relationship
       this is usually the single most useful line on the record. */
    relNote: S(l.relNote, 400),
    lastSpoke: S(lastTouch(l), 10),
    recent: recentNotes(l, 3),
  };
  /* Empty keys are dropped. Across a hundred records this is real, and an
     absent key reads to a model as "nothing here" more clearly than an empty
     string does. */
  for (const k of Object.keys(card)) {
    const v = card[k];
    if (v === '' || v == null || (Array.isArray(v) && !v.length)) delete card[k];
  }
  return card;
}

/** Has this record got anything to personalise FROM? Used only to tell the
 *  truth on screen — a row whose draft is generic says so, rather than looking
 *  like a personalised message that came out bland. Nothing is skipped for
 *  being thin: a plain warm note from someone you met once is fine, and a
 *  fake-specific one is not. */
export function hasSubstance(lead) {
  const c = cardOf(lead);
  return !!(c.labels || c.keyDates || c.relNote || c.recent || c.businessType);
}

/* -------------------------------------------------------- draft validation */

/* A URL in an unreviewed bulk text is two problems at once: it is the shape
   carriers throttle, and it is the payload a prompt injection would aim for —
   lead notes are attacker-influenced text, they go into this prompt, and unlike
   JARVIS's chat (where the worst case is a suggested note you decline) the
   output here is something you SEND to a person. So a draft carrying a link,
   an email address or a phone number is refused rather than shown. */
const HAS_URL   = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|co|us|biz|info)\b)/i;
const HAS_EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const HAS_PHONE = /(\+?\d[\d\s().-]{7,}\d)/;

/** Is this drafted message allowed to reach the screen?
 *
 *  Returns { ok, text, problem }. A refused draft is not silently dropped — the
 *  row shows the reason and an empty box, so a message that had to be thrown
 *  away is a thing you can see and rewrite, not a person who quietly vanished
 *  from the run. */
export function validateDraft(raw) {
  const text = S(raw, 2000).trim();
  if (!text) return { ok: false, text: '', problem: 'came back empty' };
  if (text.length > DRAFT_MAX_CHARS) {
    return { ok: false, text, problem: `ran to ${text.length} characters, past the ${DRAFT_MAX_CHARS} limit` };
  }
  if (HAS_URL.test(text))   return { ok: false, text, problem: 'contains a link' };
  if (HAS_EMAIL.test(text)) return { ok: false, text, problem: 'contains an email address' };
  if (HAS_PHONE.test(text)) return { ok: false, text, problem: 'contains a phone number' };
  return { ok: true, text, problem: '' };
}

/* ------------------------------------------------------------ the sms link */

/* WHICH URL FORM MESSAGES ACTUALLY HONOURS IS A MEASURED FACT, NOT A GUESS.
   Apple's own documentation and RFC 5724 disagree about the separator, and
   Chrome re-encodes some of them on the way out. The form below is the one the
   spike confirmed on the target machine; the alternates are named so that
   switching is one edit here rather than a hunt through the screen.

   ONE BUILDER, ONE PLACE. Every link in the app comes through this function, so
   there is no second encoding rule to drift out of step with this one. */
export const SMS_FORMS = {
  ampersand: (to, body) => `sms:${to}&body=${encodeURIComponent(body)}`,
  question:  (to, body) => `sms:${to}?body=${encodeURIComponent(body)}`,
  open:      (to, body) => `sms:/open?addresses=${encodeURIComponent(to)}&body=${encodeURIComponent(body)}`,
  imessage:  (to, body) => `imessage:${to}&body=${encodeURIComponent(body)}`,
};

export const SMS_FORM = 'ampersand';

/** The href for one row's Send button, or '' when there is nothing to send to.
 *  Returns '' rather than a half-built link: an `sms:` with no recipient opens
 *  Messages on an empty compose, which looks like it worked. */
export function smsHref(phone, body, form = SMS_FORM) {
  const to = dialDigits(phone);
  const text = S(body, 2000).trim();
  if (!to || !text) return '';
  const build = SMS_FORMS[form] || SMS_FORMS[SMS_FORM];
  return build(to, text);
}

/* ---------------------------------------------------------------- the run */

/** A stable key for one occasion, stamped on every activity the run logs.
 *
 *  This is what makes "did I already text them about this" answerable from the
 *  record instead of from memory, and it is the field a future cooldown would
 *  read. Derived from the occasion words plus the date, so two different
 *  occasions on one day do not collide and the same occasion next year is a
 *  different run. */
export function campaignKey(occasion, when) {
  const d = when instanceof Date ? when : new Date(when || Date.now());
  const day = isNaN(d) ? 'undated'
    : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const slug = low(occasion).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'outreach';
  return `${slug}-${day}`;
}

/** Split the picked records into the two piles the run actually has: the ones a
 *  model drafts, and the ones a person must write. Nothing is discarded — every
 *  ticked record comes out of here in exactly one pile, so the count on the
 *  review screen always equals the count that was ticked. */
export function planRun(leads, occasion) {
  const draft = [];
  const held = [];
  for (const l of A(leads)) {
    if (!l) continue;
    const e = eligibility(l);
    if (!e.ok) continue;                       // unpickable never reaches here
    const hold = heldBy(l, occasion);
    if (hold) held.push({ lead: l, reason: hold });
    else draft.push(l);
  }
  return { draft, held };
}

/** The chunks the browser walks through, one HTTP request each. */
export function chunk(list, size = OUTREACH_CHUNK) {
  const out = [];
  const all = A(list);
  for (let i = 0; i < all.length; i += size) out.push(all.slice(i, i + size));
  return out;
}

/* ----------------------------------------------------------------- parsing */

/** Read the drafter's reply. It is asked for strict JSON; this assumes it might
 *  not comply, because api/huddle.js learned that the hard way.
 *
 *  Returns a Map of id -> { text, from }. Keyed by id and never by position:
 *  a model that returns nine drafts for ten people would otherwise shift every
 *  message after the gap onto the wrong person, and a holiday text addressed to
 *  the wrong name is the single worst thing this feature could do. An id that
 *  was not asked for is dropped; a person who got no draft simply is not in the
 *  map, and the screen shows them as needing a rewrite. */
export function parseDrafts(reply, askedIds) {
  const asked = new Set(A(askedIds).map(String));
  const out = new Map();
  const raw = S(reply, 40000).trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();

  let o = null;
  try { o = JSON.parse(raw); } catch { /* fall through */ }
  if (!o) {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) { try { o = JSON.parse(m[0]); } catch { /* fall through */ } }
  }
  if (!o || typeof o !== 'object') return out;

  for (const d of A(o.drafts)) {
    if (!d || typeof d !== 'object') continue;
    const id = S(d.id, 40);
    if (!id || !asked.has(id)) continue;      // never invent a recipient
    if (out.has(id)) continue;                // first answer wins, no overwrite
    out.set(id, { text: S(d.text, 2000).trim(), from: S(d.from, 80).trim() });
  }
  return out;
}

/* ----------------------------------------------------------- the activity */

/** What gets written to the lead when — and only when — the owner confirms the
 *  message actually went.
 *
 *  'Text' is already in ACT_TYPES and already in REACHED_TYPES, so this counts
 *  as a real touch, moves lastTouch, and renders in the feed with the right
 *  icon. No new vocabulary, and no migration: activities live in leads.data
 *  jsonb and addActivity's `extra` takes arbitrary fields.
 *
 *  `outreach: true` and the campaign key are stamped so that this is
 *  DISTINGUISHABLE later. A holiday text is a real touch and should move the
 *  clock — you did reach them — but it is not the same thing as a call, and
 *  REAL-TOUCH-FINDING.md and IMPORT-NOTE-FINDING.md are both about the cost of
 *  an activity that counts as contact when nobody really spoke. Marking it at
 *  the source is what leaves that decision open to be made honestly later,
 *  rather than needing a backfill to reconstruct which rows these were. */
export function sentActivity(occasion, when) {
  return { outreach: true, campaign: campaignKey(occasion, when), occasion: S(occasion, 200) };
}
