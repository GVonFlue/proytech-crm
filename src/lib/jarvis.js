/* ============================================================================
   JARVIS — the CRM assistant's brain-side plumbing.
   ----------------------------------------------------------------------------
   Everything in this file is PURE. No React, no Supabase, no fetch. That is
   deliberate: the security-critical parts (what a rep is allowed to see, what
   an action is allowed to do) must be unit-testable without a browser, because
   "I clicked around and it looked fine" is not a proof.

   THE ARCHITECTURE, AND WHY
   -------------------------
   Sending the whole database on every question does not fit in a budget. A
   200-lead install with real activity history is ~280k tokens per question.
   At Haiku rates that is $0.28 a question — about $170/month at 20 questions a
   day — and it blows straight past api/_guard.js's 12k character body cap.

   So the payload is TWO TIERS:

     1. INDEX   — one thin line for EVERY lead. No activities, no payments,
                  no deal rows. ~60 tokens each, so 200 leads is ~12k tokens.
                  This is what makes "ask it anything" true: the model can see
                  that every lead exists, and can answer any question that is
                  really about stage / owner / staleness / value / dates.

     2. DETAIL  — full history, but only for the handful of leads the question
                  actually touches (matched by name, or pinned by the user).

   Same principle as api/huddle.js: the CRM does the arithmetic, the model does
   the interpretation. Numbers are computed here by the SAME functions the
   dashboard uses and passed in as facts. Per ENGINEERING.md §2, two screens
   must never disagree — and Jarvis is now a second screen.

   REDACTION IS NOT A PROMPT INSTRUCTION
   -------------------------------------
   ROLES.md promises a rep never sees deal value, and admits honestly that this
   is a UI promise rather than a Postgres one, because dealValue lives inside
   the jsonb of a lead the rep may legitimately read. A chat box walks straight
   around a hidden tab. So redaction happens HERE, before the payload is built
   — the money never enters the request. Telling a model not to mention
   something is not a control.
   ========================================================================== */

/* Extension is required. tests/jarvis.test.mjs imports THIS file directly
   under plain Node ESM, which does not do extensionless resolution — only the
   bundler does. Dropping the '.js' builds green and fails the suite. */
import { kbBlock } from './kb.js';

/* ------------------------------------------------------------------ basics */
/* Declared before every use. `const` does not hoist and this file is imported
   into a module graph that renders immediately — see ENGINEERING.md §1. */

export const JARVIS_MAX_DETAIL = 6;      // leads hydrated in full per question
export const JARVIS_MAX_ACTS   = 12;     // activities kept per hydrated lead
export const JARVIS_MAX_TURNS  = 6;      // conversation turns replayed
export const JARVIS_MAX_TEXT   = 4000;   // per-field character ceiling

const num = v => { const n = Number(v); return isNaN(n) ? 0 : n; };
const str = (v, cap = 300) => String(v == null ? '' : v).slice(0, cap);
const arr = v => (Array.isArray(v) ? v : []);
const iso = d => {
  const t = new Date(d);
  return isNaN(t) ? '' : `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
};

/** Rough token estimate for dense JSON. Punctuation-heavy text tokenises worse
 *  than prose, so 3.6 chars/token is the honest ratio here, not 4. Used for the
 *  budget meter and to decide whether a block is worth caching. */
export const estimateTokens = s => Math.ceil(String(s || '').length / 3.6);

/* --------------------------------------------------------------- redaction */

/** Fields that carry company money. A rep must never receive these, in the
 *  index or in the detail. Kept as one list so there is exactly one place to
 *  audit, and so the test can assert against the same list the code uses. */
export const MONEY_FIELDS = [
  'dealValue', 'deals', 'deal', 'closedDeals', 'payments', 'retainer',
  'retainerActive', 'retainerStart', 'commission', 'commissionPct',
  'commissionBase', 'commissionState', 'owed', 'contracted', 'invoiceIds',
];

/** Strip every money-bearing field from a plain object. Recurses one level into
 *  arrays of objects (activities carry the odd stray amount). Returns a copy;
 *  never mutates, because the caller is holding the live leads array. */
export function redactMoney(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(redactMoney);
  const out = {};
  for (const k of Object.keys(obj)) {
    if (MONEY_FIELDS.includes(k)) continue;
    const v = obj[k];
    out[k] = v && typeof v === 'object' ? redactMoney(v) : v;
  }
  return out;
}

/** Which leads this person is allowed to have in the payload at all.
 *  Owners get everything. Reps get what RLS already gives them: leads they own,
 *  plus unclaimed leads in their pools. This mirrors the database policy rather
 *  than inventing a second one — if they diverge, the database wins and this is
 *  the bug. */
export function visibleLeads(leads, { rep, myUid, me, pools }) {
  const all = arr(leads);
  if (!rep) return all;
  const mine = new Set(arr(pools).map(String));
  return all.filter(l => {
    if (!l) return false;
    if (l.owner_id && myUid && l.owner_id === myUid) return true;
    if (!l.owner_id && me && l.owner === me) return true;
    return !l.owner_id && l.pool && mine.has(String(l.pool));
  });
}

/* ------------------------------------------------------------ the thin line */

/** Last time anything actually happened on this lead. Falls back to createdAt
 *  so a brand-new lead reads as new rather than as infinitely stale. */
export function lastTouchOf(l) {
  const acts = arr(l && l.activities).filter(a => a && a.ts);
  if (!acts.length) return (l && l.createdAt) || null;
  return acts.reduce((best, a) => (!best || new Date(a.ts) > new Date(best) ? a.ts : best), null);
}

export function daysSinceOf(ts) {
  if (!ts) return null;
  const t = new Date(ts);
  if (isNaN(t)) return null;
  return Math.floor((Date.now() - t.getTime()) / 86400000);
}

/** One lead, compressed to the smallest thing that still supports a real
 *  answer. Keys are short on purpose: at 200 leads, `company` vs `co` is about
 *  1,400 tokens, and the model reads either just as well. A legend goes in the
 *  system prompt so this stays self-describing. */
export function indexLine(l, opts = {}) {
  const { rep = false, stages = [] } = opts;
  const touch = lastTouchOf(l);
  const stage = arr(stages).find(s => s && s.key === l.stage);
  const meetings = arr(l.meetings);
  const nextMeet = meetings
    .map(m => m && m.start)
    .filter(Boolean)
    .filter(s => new Date(s) > new Date())
    .sort()[0] || '';

  const line = {
    id: str(l.id, 40),
    n: str(l.name, 80),
    co: str(l.company, 80),
    st: str((stage && stage.label) || l.stage, 40),
    ow: str(l.owner, 40),
    pr: str(l.priority, 10),
    src: str(l.source, 60),
    last: touch ? iso(touch) : '',
    days: daysSinceOf(touch),
    next: str(l.nextAction, 60),
    fu: str(l.followUp, 12),
    mt: meetings.length,
    nm: nextMeet ? iso(nextMeet) : '',
    acts: arr(l.activities).length,
  };
  if (l.isClient) line.client = str(l.clientPhase || 'intake', 30);
  if (l.isRelationship) { line.rel = 1; line.tier = str(l.relTier, 4); }
  if (l.introducedBy) line.via = str(l.introducedBy, 60);
  if (l.pastSponsor) line.spon = 1;
  if (arr(l.labels).length) line.tags = arr(l.labels).map(x => str(x, 30)).slice(0, 6);

  /* Money only for owners. Absent, not blanked — a null still tells a model
     there is a field worth asking about. */
  if (!rep) {
    const v = num(l.dealValue);
    const r = num(l.retainer);
    if (v) line.v = v;
    if (r) line.ret = r;
  }
  /* Drop empty keys. On 200 leads this is a real saving, not a nicety. */
  for (const k of Object.keys(line)) {
    const val = line[k];
    if (val === '' || val === null || val === undefined || val === 0) {
      if (k !== 'days') delete line[k];
    }
  }
  return line;
}

/* ------------------------------------------------------------- the detail */

/** Full record for a lead the question actually touches. Activities are the
 *  expensive part, so they are capped and newest-first: the last dozen things
 *  that happened is what someone needs before the next call, and a 200-message
 *  history is unusable anyway. */
export function detailOf(l, opts = {}) {
  const { rep = false, stages = [] } = opts;
  const stage = arr(stages).find(s => s && s.key === l.stage);
  const acts = arr(l.activities)
    .filter(a => a && a.ts)
    .slice()
    .sort((a, b) => new Date(b.ts) - new Date(a.ts))
    .slice(0, JARVIS_MAX_ACTS)
    .map(a => ({ d: iso(a.ts), t: str(a.type, 20), who: str(a.who, 40), text: str(a.text, 800) }));

  const d = {
    id: str(l.id, 40),
    name: str(l.name, 120),
    company: str(l.company, 120),
    stage: str((stage && stage.label) || l.stage, 40),
    owner: str(l.owner, 40),
    priority: str(l.priority, 10),
    email: str(l.email, 120),
    phone: str(l.phone, 40),
    website: str(l.website, 160),
    businessType: str(l.businessType, 80),
    source: str(l.source, 80),
    introducedBy: str(l.introducedBy, 80),
    nextAction: str(l.nextAction, 80),
    nextSteps: str(l.nextSteps, 600),
    followUp: str(l.followUp, 12),
    expectedClose: str(l.expectedClose, 12),
    serviceInterest: arr(l.serviceInterest).map(x => str(x, 60)).slice(0, 12),
    createdAt: iso(l.createdAt),
    lastTouch: iso(lastTouchOf(l)),
    daysSinceTouch: daysSinceOf(lastTouchOf(l)),
    isClient: !!l.isClient,
    clientPhase: str(l.clientPhase, 40),
    isRelationship: !!l.isRelationship,
    relTier: str(l.relTier, 4),
    relNote: str(l.relNote, 600),
    custom: l.custom && typeof l.custom === 'object' ? l.custom : {},
    /* Labels and key dates were on every record and reached the assistant on
       none of them. For a connector they are most of what you actually know:
       the tag you filed them under, and the date you meant to remember. */
    labels: arr(l.labels).map(x => str(x, 40)).slice(0, 20),
    keyDates: arr(l.keyDates).slice(0, 12).map(k => ({
      what: str(k && (k.label || k.what), 60), when: str(k && (k.date || k.when), 12),
    })),
    /* Sponsorship is a whole relationship this CRM tracks and never mentioned.
       Asked about a connector who has sponsored an event, the assistant could
       only infer it from activity notes — which is why it talked around it. */
    pastSponsor: !!l.pastSponsor,
    potentialSponsor: !!l.potentialSponsor,
    sponsorTier: str(l.sponsorTier, 40),
    meetings: arr(l.meetings).slice(0, 12).map(m => ({
      d: m && m.start ? iso(m.start) : '', type: str(m && (m.mtype || m.type), 40),
      status: str(m && m.status, 20), title: str(m && m.title, 120),
    })),
    recentActivity: acts,
  };

  if (!rep) {
    d.dealValue = num(l.dealValue);
    d.retainer = num(l.retainer);
    d.retainerActive = !!l.retainerActive;
    d.closedAt = str(l.closedAt, 12);
    d.deals = arr(l.deals).slice(0, 10).map(x => ({ label: str(x.label, 60), setup: num(x.setup), website: num(x.website), integration: num(x.integration) }));
    d.payments = arr(l.payments).slice(0, 20).map(p => ({ d: str(p.date, 12), amt: num(p.amount), note: str(p.note, 80) }));
    d.sponsorAmount = num(l.sponsorAmount);
    d.retainerStart = str(l.retainerStart, 12);
    d.closedDeals = arr(l.closedDeals).slice(0, 12).map(x => ({
      label: str(x && x.label, 60), when: str(x && (x.closedAt || x.date), 12), value: num(x && x.value),
    }));
  }
  return rep ? redactMoney(d) : d;
}

/* ------------------------------------------------------------- retrieval */

const STOP = new Set(('a an and are as at be by for from has have how i in is it its me my of on or our so that the their'
  + ' them there they this to us was we what when where which who why will with you your do does did can could should'
  + ' would about any all get got need needs next now show tell give list find whats hows lets').split(' '));

/** Words worth matching a lead name against. Anything short or stopwordy is
 *  noise: matching on "the" pulls in every lead with "The" in the company. */
export function keywords(q) {
  return String(q || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .map(w => w.replace(/^['-]+|['-]+$/g, ''))
    .filter(w => w.length > 2 && !STOP.has(w));
}

/** Pick which leads get hydrated in full.
 *
 *  Pinned ids always win and are never scored away — that is the whole point of
 *  letting the user attach a lead. Everything else is scored on name/company
 *  overlap with the question, with a small nudge for records that are already
 *  hot (recent touch, upcoming follow-up), because a bare "where are we at"
 *  with no name in it should still return something useful rather than nothing.
 */
/* ---- the introduction graph ------------------------------------------------
   The index carries `via` (the introducer's record ID) on each lead, which is
   the FORWARD edge only. Answering "who has Brandon introduced" from that means
   finding Brandon's id and then scanning every other line for via===that id — a
   reverse ID join across the whole book. A model will sometimes do that and
   sometimes not, which is exactly what was happening: the graph was reachable
   but only when the user said "look at the relationships web" out loud.

   So precompute the reverse edge. Only people who actually have one appear, so
   this stays small — on a 170-lead book it is a few dozen rows, not 170.

   referralsOut is the other direction again: who the OWNER sent TO this person.
   "Who should he meet" is half about who you have already put in front of him,
   and it was on the record and never sent. */
export function buildGraph(leads) {
  const all = arr(leads);
  const byId = new Map(all.map(l => [String(l.id), l]));
  const label = l => {
    const n = str(l && l.name, 80).trim(), c = str(l && l.company, 80).trim();
    if (n && c) return `${n} — ${c}`;
    return n || c || 'Unnamed';
  };

  const introduced = new Map();          // introducer id -> [introduced ids]
  for (const l of all) {
    if (!l || !l.introducedBy) continue;
    const via = String(l.introducedBy);
    if (via === String(l.id)) continue;  // a record pointing at itself is not an introduction
    if (!byId.has(via)) continue;        // dangling edge: the introducer was deleted
    if (!introduced.has(via)) introduced.set(via, []);
    introduced.get(via).push(String(l.id));
  }

  const nodes = [];
  for (const [id, kids] of introduced) {
    const l = byId.get(id);
    nodes.push({
      id, name: label(l),
      rel: l.isRelationship ? 1 : 0,
      tier: str(l.relTier, 12),
      introduced: kids.slice(0, 60),
      introducedNames: kids.slice(0, 60).map(k => label(byId.get(k))),
    });
  }
  /* busiest connectors first — that is nearly always what the question is about */
  nodes.sort((a, b) => b.introduced.length - a.introduced.length);

  /* who the owner has sent TO each person */
  const sent = [];
  for (const l of all) {
    const outs = arr(l && l.referralsOut);
    if (!outs.length) continue;
    sent.push({
      id: String(l.id), name: label(l),
      to: outs.slice(0, 40).map(r => {
        const hit = r && r.leadId ? byId.get(String(r.leadId)) : null;
        return {
          name: hit ? label(hit) : str(r && r.name, 80),
          id: hit ? String(hit.id) : '',
          when: str(r && r.sentAt, 12),
          note: str(r && r.note, 160),
        };
      }),
    });
  }
  sent.sort((a, b) => b.to.length - a.to.length);

  return { introducers: nodes.slice(0, 80), sentTo: sent.slice(0, 80) };
}

export function pickDetail(leads, question, pinned = [], limit = JARVIS_MAX_DETAIL) {
  const all = arr(leads);
  const pin = new Set(arr(pinned).map(String));
  const picked = all.filter(l => l && pin.has(String(l.id)));
  const words = keywords(question);
  const rest = all.filter(l => l && !pin.has(String(l.id)));

  const scored = rest.map(l => {
    const hay = `${l.name || ''} ${l.company || ''} ${l.email || ''}`.toLowerCase();
    let score = 0;
    for (const w of words) {
      if (!hay.includes(w)) continue;
      /* A whole-word hit on a name is a much stronger signal than a substring
         landing inside an unrelated word. */
      score += new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(hay) ? 10 : 3;
    }
    if (score > 0) {
      const days = daysSinceOf(lastTouchOf(l));
      if (days !== null && days <= 30) score += 1;
      if (l.followUp) score += 1;
    }
    return { l, score };
  }).filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || String(a.l.name || '').localeCompare(String(b.l.name || '')));

  const room = Math.max(0, limit - picked.length);
  return picked.concat(scored.slice(0, room).map(x => x.l));
}

/* ---------------------------------------------------------------- totals */

/** Pre-computed facts. The model is explicitly told not to do arithmetic, so
 *  anything it might otherwise add up itself is handed over already summed by
 *  the caller (which uses the app's own money functions). Reps get counts only. */
export function buildTotals(leads, opts = {}) {
  const { rep = false, money = null, stages = [] } = opts;
  const all = arr(leads);
  const byStage = {};
  for (const l of all) {
    const s = arr(stages).find(x => x && x.key === l.stage);
    const key = str((s && s.label) || l.stage || 'Unknown', 40);
    byStage[key] = (byStage[key] || 0) + 1;
  }
  const stale = all.filter(l => {
    const d = daysSinceOf(lastTouchOf(l));
    return d !== null && d >= 30;
  }).length;

  const t = {
    leadCount: all.length,
    clientCount: all.filter(l => l && l.isClient).length,
    relationshipCount: all.filter(l => l && l.isRelationship).length,
    byStage,
    staleOver30Days: stale,
    today: iso(new Date()),
  };
  /* `money` is whatever the caller computed with the app's own functions.
     Jarvis never derives a dollar figure itself. */
  if (!rep && money && typeof money === 'object') t.money = money;
  return t;
}

/* ------------------------------------------------------------- the payload */

/** Assemble the whole request body. Returns { payload, stats } so the UI can
 *  show what it is about to send before it sends it. */
export function buildPayload(opts) {
  const {
    leads = [], question = '', pinned = [], history = [],
    rep = false, me = '', role = 'owner', stages = [], money = null,
    tasks = [], teamNames = [], kb = [],
  } = opts || {};

  const detailLeads = pickDetail(leads, question, pinned);
  const detailIds = new Set(detailLeads.map(l => String(l.id)));

  const payload = {
    question: str(question, JARVIS_MAX_TEXT),
    who: { name: str(me, 60), role: rep ? 'rep' : 'owner' },
    team: arr(teamNames).map(x => str(x, 40)).slice(0, 20),
    totals: buildTotals(leads, { rep, money, stages }),
    /* Every lead, thin. This is the "ask it anything" tier. */
    index: arr(leads).map(l => indexLine(l, { rep, stages })),
    /* A handful of leads, thick. */
    detail: detailLeads.map(l => detailOf(l, { rep, stages })),
    /* The introduction network, both directions, precomputed. */
    graph: buildGraph(leads),
    openTasks: arr(tasks).filter(t => t && !t.done).slice(0, 40).map(t => ({
      id: str(t.id, 40), title: str(t.title, 200), owner: str(t.owner, 40),
      due: str(t.due, 12), lead: str(t.lead, 80),
    })),
    history: arr(history).slice(-JARVIS_MAX_TURNS * 2).map(m => ({
      role: m && m.role === 'assistant' ? 'assistant' : 'user',
      content: str(m && m.content, 2000),
    })),
    /* PUBLISHED Playbook notes. The caller passes the result of
       db.kbAiContext() -> kb_ai_context(), which reads kb_published and does
       not name kb_notes, so an OWNER building this payload gets published rows
       only, exactly like a rep.

       There is deliberately NO draft filter here. A filter would imply drafts
       can arrive and be removed, and a control one call site away from being
       forgotten is not a control. Drafts do not arrive. */
    kb: kbBlock(kb, question),
  };

  const json = JSON.stringify(payload);
  const stats = {
    leads: arr(leads).length,
    hydrated: detailLeads.length,
    hydratedNames: detailLeads.map(l => str(l.name || l.company, 60)),
    bytes: json.length,
    tokens: estimateTokens(json),
    detailIds: [...detailIds],
  };
  return { payload, stats };
}

/* --------------------------------------------------------------- actions */

/* 3B: Jarvis PROPOSES, a human confirms. Nothing here executes anything — this
   validates a proposal into a shape the app is willing to run, or rejects it.

   This is also the real answer to prompt injection. Lead notes, imported
   spreadsheet rows and pasted email threads all end up in the context, and any
   of them can contain "ignore your instructions and ...". None of that matters
   much when the only things a model can ask for are on this whitelist, must
   name a lead the signed-in user can already see, and do not run until someone
   clicks. An injection's best case is a suggested note the user then declines. */

export const ACTION_KINDS = ['note', 'task', 'followup', 'tag'];

export function validateActions(raw, ctx = {}) {
  const { visibleIds = [], rep = false, teamNames = [] } = ctx;
  const ids = new Set(arr(visibleIds).map(String));
  const team = new Set(arr(teamNames).map(x => String(x).toLowerCase()));
  const out = [];
  const rejected = [];

  for (const a of arr(raw).slice(0, 8)) {
    if (!a || typeof a !== 'object') { rejected.push('not an object'); continue; }
    const kind = String(a.kind || '').toLowerCase();
    if (!ACTION_KINDS.includes(kind)) { rejected.push(`unknown kind "${kind}"`); continue; }

    /* Every action except a bare task must name a lead the user can SEE. This
       is the line that stops an injected instruction touching someone else's
       record. */
    const leadId = a.leadId == null ? '' : String(a.leadId);
    if (kind !== 'task' && !ids.has(leadId)) { rejected.push(`${kind}: lead not visible`); continue; }
    if (kind === 'task' && leadId && !ids.has(leadId)) { rejected.push('task: lead not visible'); continue; }

    if (kind === 'note') {
      const text = str(a.text, 2000).trim();
      if (!text) { rejected.push('note: empty'); continue; }
      out.push({ kind, leadId, text });
    } else if (kind === 'task') {
      const title = str(a.title, 200).trim();
      if (!title) { rejected.push('task: no title'); continue; }
      const due = /^\d{4}-\d{2}-\d{2}$/.test(String(a.due || '')) ? String(a.due) : '';
      out.push({ kind, leadId, title, due, owner: str(a.owner, 40) });
    } else if (kind === 'followup') {
      const date = String(a.date || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { rejected.push('followup: bad date'); continue; }
      out.push({ kind, leadId, date, why: str(a.why, 300) });
    } else if (kind === 'tag') {
      /* A rep flagging something to the owner is the whole point of giving reps
         Jarvis at all — but it can only tag a real teammate. */
      const who = str(a.who, 40).trim();
      if (!who || !team.has(who.toLowerCase())) { rejected.push('tag: unknown person'); continue; }
      const text = str(a.text, 1000).trim();
      if (!text) { rejected.push('tag: empty'); continue; }
      out.push({ kind, leadId, who, text });
    }
  }
  /* A rep cannot propose anything that writes money, but no action kind writes
     money in the first place. Asserted in the tests so it stays that way. */
  return { actions: out, rejected };
}

/** Human-readable one-liner for the confirm button. */
export function describeAction(a, leadName) {
  const who = leadName || 'this lead';
  if (!a) return '';
  if (a.kind === 'note') return `Add a note to ${who}`;
  if (a.kind === 'task') return a.leadId ? `Create a task on ${who}: ${a.title}` : `Create a task: ${a.title}`;
  if (a.kind === 'followup') return `Set ${who}'s follow-up to ${a.date}`;
  if (a.kind === 'tag') return `Tag ${a.who} on ${who}`;
  return '';
}

/* ----------------------------------------------------------------- parsing */

/** Read the model's reply. It is asked for strict JSON; this assumes it might
 *  not comply, because api/huddle.js learned that the hard way. A malformed
 *  answer degrades to "here is the text", never to a crash. */
export function parseReply(text) {
  const raw = String(text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  let o = null;
  try { o = JSON.parse(raw); } catch { /* fall through */ }
  if (!o) {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) { try { o = JSON.parse(m[0]); } catch { /* fall through */ } }
  }
  if (!o || typeof o !== 'object') return { answer: raw, beyond: '', actions: [], cited: [], malformed: true };
  return {
    answer: str(o.answer, 6000),
    /* Kept as its own field all the way to the screen. A heading inside the
       prose would be a promise the model can blur mid-paragraph; a separate
       field cannot be blurred, only left empty. */
    beyond: str(o.beyond, 4000),
    actions: arr(o.actions),
    cited: arr(o.cited).map(x => str(x, 40)).slice(0, 20),
    malformed: false,
  };
}
