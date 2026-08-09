/* ============================================================================
   CONVERSATION CAPTURE — pure helpers.

   Paste a thread (texts, emails, DMs, a call transcript) and get structured
   notes attached to a lead. This file holds everything that is decidable
   WITHOUT the model: splitting a paste into turns, guessing who is who from
   hard signals, chunking a long paste, validating whatever JSON comes back,
   and rendering the result into the note text that actually gets stored.

   THE ONE THING THAT MATTERS MOST
   The raw thread is never written to the database. Not behind a toggle, not
   in a "show full conversation" panel, not in a retention window. It is held
   in React state while the user reviews it and discarded when the modal
   closes. What persists is the structured note.

   That is Garrett's call and it is the right one: the pasted text is a third
   party's personal data — their phone number, their divorce, their finances —
   and a CRM that never stores it cannot leak it, cannot be subpoenaed for it,
   and needs no retention policy, no purge job and no delete button.

   The cost, stated plainly: you cannot later check a summary against the
   transcript. If the model mis-summarises, the mistake is the record. Two
   things push back against that — the summary quotes the client's own words
   where it can, and nothing is written until a human has looked at the
   speaker mapping and pressed save.
   ========================================================================== */

/* ---------------------------------------------------------------------------
   1. SPLITTING A PASTE INTO TURNS

   Handles the four shapes that actually turn up:
     "Me: ...", "Sarah: ..."          explicit labels
     "> quoted"                       email quote blocks
     "On Tue, X wrote:"               email direction markers
     blank-line separated blocks      SMS exports with no labels at all
   ------------------------------------------------------------------------- */
const LABEL_RE = /^\s*([A-Za-z][\w .'-]{0,28}|\+?\d[\d ()-]{6,}|[A-Z]{1,3})\s*[:–-]\s+/;
const EMAIL_FROM_RE = /^\s*(?:from|de)\s*:\s*(.+)$/i;
/* GREEDY .+ before the comma on purpose. Lazy (`.+?`) matches the FIRST comma,
   so "On Tue, Aug 4, 2026 at 9:14 AM, Garrett Von Flue wrote:" gives a speaker
   of "Aug 4, 2026 at 9:14 AM, Garrett Von Flue" — a date masquerading as a
   person, which then shows up in the speaker review screen as a candidate. */
const EMAIL_WROTE_RE = /^\s*on .+,\s*(.+?)\s+wrote:\s*$/i;

export function splitTurns(text) {
  const raw = String(text || '').replace(/\r\n?/g, '\n');
  if (!raw.trim()) return [];
  const lines = raw.split('\n');
  const turns = [];
  let cur = null;
  const push = () => { if (cur && cur.text.trim()) turns.push({ ...cur, text: cur.text.trim() }); cur = null; };

  lines.forEach(line => {
    const from = EMAIL_FROM_RE.exec(line) || EMAIL_WROTE_RE.exec(line);
    if (from) { push(); cur = { speaker: from[1].trim().slice(0, 40), text: '', source: 'email' }; return; }
    const lab = LABEL_RE.exec(line);
    if (lab) { push(); cur = { speaker: lab[1].trim(), text: line.slice(lab[0].length), source: 'label' }; return; }
    if (!line.trim()) { if (cur && cur.text.trim()) push(); return; }
    if (!cur) cur = { speaker: null, text: '', source: 'block' };
    cur.text += (cur.text ? '\n' : '') + line;
  });
  push();
  return turns;
}

/* ---------------------------------------------------------------------------
   2. HARD SIGNALS ABOUT WHO IS WHO

   Computed locally and sent to the model as evidence, so the model is
   reconciling facts rather than inventing them — and so the review screen can
   show the user WHY something was proposed, not just what.

   'Me', 'You' and the signed-in user's own name are the strong signals. The
   lead's name or company appearing as a label is the other. Everything else
   is weak and is labelled weak.
   ------------------------------------------------------------------------- */
const norm = s => String(s || '').trim().toLowerCase();
const SELF_WORDS = ['me', 'i', 'self', 'you'];

export function speakerSignals(turns, { lead, meName } = {}) {
  const names = {};
  turns.forEach(t => {
    const k = norm(t.speaker) || '(unlabelled)';
    names[k] = names[k] || { label: t.speaker || null, turns: 0, chars: 0, questions: 0, prices: 0, signals: [] };
    names[k].turns++;
    names[k].chars += t.text.length;
    if (/\?/.test(t.text)) names[k].questions++;
    if (/\$\s?\d|\d+\s?(k|per month|\/mo|monthly)/i.test(t.text)) names[k].prices++;
  });
  const leadNames = [lead && lead.name, lead && lead.company].filter(Boolean).map(norm);
  Object.entries(names).forEach(([k, v]) => {
    if (SELF_WORDS.includes(k)) v.signals.push({ kind: 'self_word', strength: 'strong', why: `labelled "${v.label}"` });
    if (meName && k === norm(meName)) v.signals.push({ kind: 'my_name', strength: 'strong', why: `matches the signed-in user (${meName})` });
    leadNames.forEach(ln => {
      if (ln && (k === ln || (k.length > 2 && ln.includes(k)))) v.signals.push({ kind: 'lead_name', strength: 'strong', why: `matches the lead record (${lead.name || lead.company})` });
    });
    if (v.prices > 0) v.signals.push({ kind: 'quotes_price', strength: 'weak', why: 'quotes pricing' });
    if (v.questions > v.turns / 2) v.signals.push({ kind: 'asks', strength: 'weak', why: 'mostly asks questions' });
  });
  return names;
}

/* Would a human bet on this mapping from the local signals alone?
   'none' means the paste has no signal and the UI must ASK rather than pick —
   the brief's rule, and the one that stops "client said they're ready to move
   forward" being written when in fact the user said it. */
export function localConfidence(signals) {
  const entries = Object.entries(signals);
  if (entries.length < 2) return 'none';
  const strong = entries.filter(([, v]) => v.signals.some(s => s.strength === 'strong'));
  if (strong.length >= 2) return 'high';
  if (strong.length === 1) return 'medium';
  return 'none';
}

/* ---------------------------------------------------------------------------
   3. CHUNKING

   A 200-message thread does not fit in one call and must not be silently
   truncated. Split on turn boundaries so a message is never cut in half, and
   report the chunk count so the UI can say "this was long, I read it in 3
   parts" rather than quietly losing the end of it.
   ------------------------------------------------------------------------- */
export const CHUNK_CHARS = 24000;

export function chunkTurns(turns, limit = CHUNK_CHARS) {
  const out = [];
  let cur = [], size = 0;
  turns.forEach(t => {
    const len = (t.speaker ? t.speaker.length + 2 : 0) + t.text.length + 1;
    if (size + len > limit && cur.length) { out.push(cur); cur = []; size = 0; }
    cur.push(t); size += len;
  });
  if (cur.length) out.push(cur);
  return out.length ? out : [[]];
}

export const turnsToText = turns =>
  turns.map(t => (t.speaker ? `${t.speaker}: ` : '') + t.text).join('\n');

/* ---------------------------------------------------------------------------
   4. VALIDATING THE MODEL'S ANSWER

   Parse defensively. A malformed response is "couldn't read that, here's the
   raw text as a note", never a crash — every field is coerced to the shape the
   UI renders, and anything unrecognised is dropped rather than spread.
   ------------------------------------------------------------------------- */
const str = (v, max = 4000) => typeof v === 'string' ? v.slice(0, max) : '';
const arr = (v, n = 20) => Array.isArray(v) ? v.slice(0, n) : [];
const strs = (v, n = 20) => arr(v, n).map(x => str(x, 500)).filter(Boolean);

export function normalizeExtract(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  return {
    summary: str(o.summary, 2000),
    wants: strs(o.wants),
    promised: arr(o.promised).map(p => ({
      what: str(p && p.what, 400),
      by: /^\d{4}-\d{2}-\d{2}$/.test(str(p && p.by)) ? p.by : '',
      who: str(p && p.who, 60),
    })).filter(p => p.what),
    objections: strs(o.objections),
    openQuestions: arr(o.openQuestions).map(q => ({
      question: str(q && q.question, 400),
      askedBy: str(q && q.askedBy, 60),
    })).filter(q => q.question),
    facts: arr(o.facts).map(f => ({
      label: str(f && f.label, 80),
      value: str(f && f.value, 300),
      field: str(f && f.field, 40),      // maps to a lead field when the model is sure
    })).filter(f => f.label && f.value),
    followUps: arr(o.followUps, 10).map(f => ({
      title: str(f && f.title, 200),
      due: /^\d{4}-\d{2}-\d{2}$/.test(str(f && f.due)) ? f.due : '',
    })).filter(f => f.title),
    dates: arr(o.dates, 10).map(d => ({
      date: /^\d{4}-\d{2}-\d{2}$/.test(str(d && d.date)) ? d.date : '',
      what: str(d && d.what, 200),
    })).filter(d => d.date && d.what),
  };
}

export function normalizeSpeakers(raw, turns) {
  const o = raw && typeof raw === 'object' ? raw : {};
  const seen = new Set(turns.map(t => norm(t.speaker) || '(unlabelled)'));
  const speakers = arr(o.speakers, 8).map(s => ({
    key: norm(s && s.key) || norm(s && s.label) || '(unlabelled)',
    label: str(s && s.label, 40) || '(unlabelled)',
    role: ['lead', 'us', 'other', 'unknown'].includes(s && s.role) ? s.role : 'unknown',
    evidence: str(s && s.evidence, 300),
  })).filter(s => seen.has(s.key) || s.key === '(unlabelled)');
  const conf = ['high', 'medium', 'low', 'none'].includes(o.confidence) ? o.confidence : 'none';
  /* two speakers both claiming to be the lead is not a mapping, it's a guess —
     drop to 'none' and make the human choose */
  const leads = speakers.filter(s => s.role === 'lead');
  return {
    speakers,
    confidence: leads.length === 1 ? conf : 'none',
    ambiguous: !!o.ambiguous || leads.length !== 1 || conf === 'none',
    reasoning: str(o.reasoning, 600),
  };
}

/* Merge the per-chunk extractions into one. Deterministic and local — no
   second model call, so a long paste costs exactly as much as its length and
   nothing gets re-interpreted on the way through.
   Dedupe is case-insensitive on the visible text: the same promise restated in
   two chunks should appear once. */
export function mergeExtracts(parts) {
  const list = (parts || []).filter(Boolean);
  if (!list.length) return normalizeExtract(null);
  if (list.length === 1) return list[0];
  const dedupe = (items, keyOf) => {
    const seen = new Set(), out = [];
    items.forEach(i => { const k = norm(keyOf(i)); if (k && !seen.has(k)) { seen.add(k); out.push(i); } });
    return out;
  };
  return {
    summary: list.map(p => p.summary).filter(Boolean).join(' '),
    wants: dedupe(list.flatMap(p => p.wants), x => x),
    promised: dedupe(list.flatMap(p => p.promised), x => x.what),
    objections: dedupe(list.flatMap(p => p.objections), x => x),
    openQuestions: dedupe(list.flatMap(p => p.openQuestions), x => x.question),
    facts: dedupe(list.flatMap(p => p.facts), x => x.label + '|' + x.value),
    followUps: dedupe(list.flatMap(p => p.followUps), x => x.title),
    dates: dedupe(list.flatMap(p => p.dates), x => x.date + '|' + x.what),
  };
}

/* ---------------------------------------------------------------------------
   5. RENDERING THE NOTE

   This string IS the record — there is no transcript behind it. So it leads
   with the summary a human would want to read first, and everything else is
   plain labelled lines rather than JSON, because it appears in an activity
   feed and gets read on a phone.
   ------------------------------------------------------------------------- */
export function toNoteText(x, { when, channel, parts } = {}) {
  const L = [];
  const head = ['Conversation'];
  if (channel) head.push(channel);
  if (when) head.push(when);
  L.push(head.join(' · '));
  if (x.summary) L.push('', x.summary);
  const sec = (title, items) => { if (items && items.length) { L.push('', title); items.forEach(i => L.push('• ' + i)); } };
  sec('What they want', x.wants);
  sec('What we promised', x.promised.map(p => p.what + (p.by ? ` (by ${p.by})` : '') + (p.who ? ` — ${p.who}` : '')));
  sec('Objections and concerns', x.objections);
  sec('Open questions', x.openQuestions.map(q => q.question + (q.askedBy ? ` — asked by ${q.askedBy}` : '')));
  sec('Worth keeping', x.facts.map(f => `${f.label}: ${f.value}`));
  sec('Dates mentioned', x.dates.map(d => `${d.date} — ${d.what}`));
  if (parts > 1) L.push('', `(Long conversation — read in ${parts} parts.)`);
  return L.join('\n').trim();
}

/* The fallback when the model returns something unusable. Deliberately keeps
   the user's own paste as the note body: they pasted something real and losing
   it because a JSON parse failed would be the worst outcome available. */
export function fallbackNote(text, reason) {
  const t = String(text || '').trim();
  return [
    `Conversation (couldn't be summarised${reason ? ` — ${reason}` : ''})`,
    '',
    t.length > 6000 ? t.slice(0, 6000) + '\n…(truncated)' : t,
  ].join('\n');
}

/* ---------------------------------------------------------------------------
   6. FIELD UPDATES, OFFERED AS A DIFF

   Extracted facts are never written over an existing value silently. The UI
   shows old -> new and the user ticks what to apply.
   ------------------------------------------------------------------------- */
export const FIELD_LABELS = {
  email: 'Email', phone: 'Phone', dealValue: 'Deal value', retainer: 'Retainer',
  timeline: 'Timeline', source: 'Source', address: 'Address', notes: 'Notes',
};

export function fieldDiffs(facts, lead) {
  return (facts || [])
    .filter(f => f.field && Object.prototype.hasOwnProperty.call(FIELD_LABELS, f.field))
    .map(f => {
      const before = lead && lead[f.field] != null ? String(lead[f.field]) : '';
      return {
        field: f.field,
        label: FIELD_LABELS[f.field],
        before,
        after: f.value,
        conflict: !!before && norm(before) !== norm(f.value),
        /* an unchanged value is not an update and should not be offered */
        noop: norm(before) === norm(f.value),
      };
    })
    .filter(d => !d.noop);
}
