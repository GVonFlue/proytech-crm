/* THE CLIENT LIFECYCLE: stages, the 14-day clock, and what is due when.
   ============================================================================

   Pure. No React, no network. The CRM calls lifecyclePatch() for each client
   and applies what comes back through updateLead (one event, one patch,
   ENGINEERING §3); the board and the dashboard read clockOf() and dueItems().

   ONE SOURCE FOR EACH FACT (ENGINEERING §5)
   - The stage is the lead's existing `clientPhase`. The keys below are the
     keys lib/lead DEFAULT_CLIENT_PHASES has always used, plus `review`.
   - "The clock started" is lib/onboarding launchState(), the same function the
     client's portal shows. It reads the lead's existing checklist (deposit,
     onboarding, access, logo, headshot; Terms 6.2). Nothing here stores it.
   - An item that already has a home keeps it: the deposit is the checklist's
     deposit_paid, "Website V1" is the Website track's milestone. Its done date
     lives there. Only items with no home (the launch itself, A2P, round-1
     feedback) keep their done date in lead.lifecycle.items.
   - DUE DATES ARE DERIVED, NEVER STORED, like the clock: anchor + offset +
     pauses, computed on read. A date someone types onto the item's home wins.
     So a pause moves every open date at once with nothing to rewrite, and
     opening a screen never writes (tests/moneyaudit.mjs holds the CRM to
     that). Writes happen only on events: a move, a pause, a resume.
   - Owners of automatic items live in lead.lifecycle.owners, NOT on the
     checklist entry's assignee: an assignee on the checklist means a real task
     in someone's Tasks list (assignOnboarding), and only a person assigning
     one by hand should create that. Due items stay on the lead, so the leads
     table's own row policies cover them; the shared tasks row (which every
     rep reads) never receives client delivery work automatically.

   WHAT IS STORED ON THE LEAD (no schema change: it is the lead's own jsonb)
     phaseSince   YYYY-MM-DD the current stage was entered (set by a move;
                  older clients fall back to their last "Phase →" note)
     launchedAt   YYYY-MM-DD it was marked launched
     lifecycle    { pauses:[{from,to,reason}], items:{id:{done,due}},
                    owners:{id:name} }
   Everything else is derived. */
import { launchState, ctxOf, addCalendarDays, addBusinessDays, productsFor, PRODUCTS } from './onboarding.js';

const S = (v, n = 200) => (v == null ? '' : String(v)).slice(0, n);
const A = v => (Array.isArray(v) ? v : []);
const O = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const day = v => S(v, 10);
const doneOf = v => (!v ? null : typeof v === 'string' ? v : v.done || null);
const dueOf = v => (!v || typeof v === 'string' ? null : v.due || null);
const daysBetween = (a, b) => Math.round((Date.parse(day(b) + 'T12:00:00Z') - Date.parse(day(a) + 'T12:00:00Z')) / 864e5);

/* ---------- the vocabulary ---------- */
/** The forward path. Automatic moves only ever go one step along it. */
export const FLOW = ['intake', 'build', 'review', 'launch', 'active'];
/** Off the path: At Risk is a state of an Active client; Former is gone. */
export const SIDE = ['atrisk', 'churned'];
export const AUTO = 'Automatic';
export const ACTIVE_AFTER_DAYS = 30;
export const AT_RISK_AFTER_DAYS = 45;
export const WARN_DAY = 10, LATE_DAY = 13;

/* ---------- the template ----------
   Each item: id (never changes once shipped), stage it is created in, label,
   anchor ('accept' = the day they accepted, 'submit' = onboarding submitted,
   'clock' = Day 0 of the 14), day (calendar days from the anchor; bizDays for
   "business day" rules), owner role ('contact' = the proposal's point of
   contact, 'builder' = Settings → Client lifecycle), products it applies to
   (none = every client), and where it lives:
     ref { onb: key }                 the lead's onboarding checklist item
     ref { track: key, milestone }    a delivery track milestone
     no ref                           lead.lifecycle.items[id]
   excluded: Terms 6.4 items (texting approval, IDX, transfers, third-party
   verification). They get their own line, never a due date, and never count
   against the 14 days. pauseWhenLate: Terms 6.3, the clock pauses when the
   client is more than one business day late with it. */
export const DEFAULT_TEMPLATE = [
  { id: 'deposit',     stage: 'intake', label: 'Deposit received',            anchor: 'accept', day: 0, owner: 'contact', ref: { onb: 'deposit_paid' } },
  { id: 'onboarding',  stage: 'intake', label: 'Onboarding submitted',        anchor: 'accept', day: 2, owner: 'contact', ref: { onb: 'intake_form' } },
  { id: 'access_dns',  stage: 'intake', label: 'Domain access received',      anchor: 'accept', day: 3, owner: 'contact', products: ['website'], ref: { onb: 'access_dns' } },
  { id: 'access_gbp',  stage: 'intake', label: 'Google profile access received', anchor: 'accept', day: 3, owner: 'contact', products: ['website'], ref: { onb: 'access_gbp' } },
  { id: 'logo',        stage: 'intake', label: 'Logo received',               anchor: 'accept', day: 3, owner: 'contact', ref: { onb: 'logo_received' } },
  { id: 'headshot',    stage: 'intake', label: 'Headshot received',           anchor: 'accept', day: 3, owner: 'contact', products: ['website'], ref: { onb: 'headshot_received' } },
  { id: 'kickoff',     stage: 'intake', label: 'Kickoff call held',           anchor: 'submit', bizDays: 1, owner: 'contact', ref: { onb: 'kickoff_call' } },
  { id: 'plan',        stage: 'build',  label: 'Kickoff complete, plan confirmed', anchor: 'clock', day: 1, owner: 'builder' },
  { id: 'a2p_submit',  stage: 'build',  label: 'Submit A2P registration',     anchor: 'clock', day: 1, owner: 'builder', products: ['automations'] },
  { id: 'suite_install', stage: 'build', label: 'Business Suite installed from the industry template', anchor: 'clock', day: 2, owner: 'builder', products: ['suite'], ref: { track: 'suite', milestone: 'Install set up' } },
  { id: 'site_v1',     stage: 'build',  label: 'Website V1 ready',            anchor: 'clock', day: 6, owner: 'builder', products: ['website'], ref: { track: 'website', milestone: 'Website V1 sent' } },
  { id: 'suite_config', stage: 'build', label: 'Business Suite configured, data imported', anchor: 'clock', day: 6, owner: 'builder', products: ['suite'], ref: { track: 'suite', milestone: 'Contacts and data imported' } },
  { id: 'texting_live', stage: 'build', label: 'Texting live (carrier approval)', owner: 'builder', products: ['automations'], excluded: true },
  { id: 'idx',         stage: 'build',  label: 'IDX feed connected (third party)', owner: 'builder', products: ['website'], industries: ['realtor'], excluded: true },
  { id: 'feedback',    stage: 'review', label: 'Client feedback due (round 1)', anchor: 'clock', day: 9, owner: 'contact', pauseWhenLate: true },
  { id: 'final_proof', stage: 'review', label: 'Revisions done, final proof sent', anchor: 'clock', day: 11, owner: 'builder', products: ['website'], ref: { track: 'website', milestone: 'Final proof sent' } },
  { id: 'approval',    stage: 'review', label: 'Client approval',             anchor: 'clock', day: 13, owner: 'contact', products: ['website'], ref: { track: 'website', milestone: 'Website approved by client' } },
  /* done when the client is marked launched: the move IS the launch */
  { id: 'launch',      stage: 'review', label: 'Launch',                      anchor: 'clock', day: 14, owner: 'builder', doneOn: 'launched' },
];
export const OWNER_ROLES = ['contact', 'builder'];

/** Settings → Client lifecycle, read with every fallback named (CLAUDE.md:
 *  "the row was never created" must not look like a choice). */
export function readLifecycle(settings) {
  const raw = settings && settings.lifecycle && typeof settings.lifecycle === 'object' ? settings.lifecycle : null;
  const fellBack = [];
  if (!raw) fellBack.push('lifecycle');
  const r = raw || {};
  const builder = S(r.builder, 80).trim();
  if (!builder) fellBack.push('lifecycle.builder');
  let template = A(r.template).filter(t => t && t.id && FLOW.includes(t.stage));
  if (!template.length) { template = DEFAULT_TEMPLATE; if (raw) fellBack.push('lifecycle.template'); }
  return { builder, template, fellBack };
}

/* ---------- what the client bought ---------- */
const TRACK_PRODUCT = { website: 'website', suite: 'suite', ai: 'automations' };
/** The onboarding's products when there is one (the portal and the CRM then
 *  agree on what is being built), else the accepted proposal's items through
 *  the onboarding product map, else the delivery tracks the client is on. */
export function productsOf({ onboarding, proposal, productMap, trackKeys } = {}) {
  const o = A(onboarding && onboarding.products).filter(p => PRODUCTS.includes(p));
  if (o.length) return o;
  const items = A(proposal && proposal.body && proposal.body.quote && proposal.body.quote.items).map(i => i && i.id).filter(Boolean);
  const fromProposal = productsFor(items, productMap);
  if (fromProposal.length) return fromProposal;
  return PRODUCTS.filter(p => A(trackKeys).some(k => TRACK_PRODUCT[k] === p));
}
const applies = (t, products, industry) => (!A(t.products).length || A(t.products).some(p => products.includes(p)))
  && (!A(t.industries).length || A(t.industries).includes(industry));

/* ---------- the clock ---------- */
/** Pauses, as calendar days. An open pause runs to today. */
export function pausedDays(pauses, today, until) {
  const end = day(until || today);
  return A(pauses).reduce((n, p) => {
    if (!p || !p.from || p.from > end) return n;
    const to = p.to && p.to < end ? p.to : end;
    return n + Math.max(0, daysBetween(p.from, to));
  }, 0);
}
/** A date `base` moved later by every pause that began on or before it. */
export function shiftByPauses(base, pauses, today) {
  if (!base) return null;
  let d = base;
  for (const p of A(pauses).filter(x => x && x.from).sort((a, b) => a.from.localeCompare(b.from))) {
    if (p.from > d) continue;
    d = addCalendarDays(d, Math.max(0, daysBetween(p.from, p.to || today)));
  }
  return d;
}
/** The 14-day clock for one client, from #90's launchState (the portal's own
 *  function), plus pauses and the day count the board colours by. */
export function clockOf(lead, { onboarding, products, launchDays, today } = {}) {
  const l = lead || {};
  const ob = O(l.onboarding);
  /* no onboarding row (a client from before the portal, or one made by
     hand): the checklist's own "intake form" tick is the submit date, and
     what they bought decides which access and assets are required */
  const submittedAt = (onboarding && onboarding.submitted_at) || doneOf(ob.intake_form);
  const ctx = ctxOf(onboarding || { products: A(products) }, onboarding ? onboarding.answers : {}, null);
  const st = launchState({ submittedAt, checklist: { ...ob, onbSkip: l.onbSkip }, ctx, answers: onboarding ? onboarding.answers || {} : {}, launchDays });
  const pauses = A(O(l.lifecycle).pauses);
  const t = day(today);
  if (!st.started) return { ...st, day: null, paused: false, pausedDays: 0, tone: 'none' };
  const paused = pauses.some(p => p && p.from && !p.to);
  const off = pausedDays(pauses, t);
  const n = Math.max(0, daysBetween(st.startedOn, t) - off);
  const target = st.target ? addCalendarDays(st.target, off) : null;
  const tone = n >= LATE_DAY ? 'late' : n >= WARN_DAY ? 'warn' : 'ok';
  return { ...st, target, day: n, paused, pausedDays: off, tone };
}

/* ---------- the items ---------- */
const anchorDate = (t, a) => (t.anchor === 'accept' ? a.accept : t.anchor === 'submit' ? a.submit : t.anchor === 'clock' ? a.clock : null);
function baseDue(t, a) {
  if (t.excluded) return null;
  const d = anchorDate(t, a);
  if (!d) return null;
  if (Number.isInteger(t.bizDays)) return addBusinessDays(d, t.bizDays);
  return Number.isInteger(t.day) || typeof t.day === 'number' ? addCalendarDays(d, Math.floor(t.day)) : null;
}
/** Where an item's done and due live, resolved against the lead's tracks:
 *  a milestone the saved track no longer has falls back to the lifecycle's
 *  own record rather than vanishing. */
function homeOf(t, lead, tracks) {
  const ref = t.ref || {};
  if (ref.onb) return { kind: 'onb', key: ref.onb, entry: O(lead.onboarding)[ref.onb] };
  if (ref.track) {
    const tr = A(tracks).find(x => x && x.key === ref.track);
    if (tr && A(tr.milestones).includes(ref.milestone)) return { kind: 'track', track: ref.track, milestone: ref.milestone, entry: O(O(lead.delivery)[ref.track])[ref.milestone] };
  }
  return { kind: 'lc', key: t.id, entry: O(O(lead.lifecycle).items)[t.id] };
}
const stageIdx = k => (FLOW.includes(k) ? FLOW.indexOf(k) : SIDE.includes(k) ? FLOW.length : 0);

/** Every item this client has (the stages they have reached), with its due
 *  date, done date, owner and where it lives. */
export function dueItems(lead, { onboarding, proposal, launchDays, today, cfg, tracks, products, contact } = {}) {
  const l = lead || {};
  const t = day(today);
  const lc = O(l.lifecycle);
  const clock = clockOf(l, { onboarding, products, launchDays, today: t });
  const a = {
    accept: day((proposal && proposal.accepted_at) || l.convertedAt || l.closedAt || ''),
    submit: day((onboarding && onboarding.submitted_at) || doneOf(O(l.onboarding).intake_form) || ''),
    clock: clock.started ? clock.startedOn : '',
  };
  const industry = (onboarding && (O(onboarding.answers)['biz.industry'] || onboarding.industry)) || '';
  const reached = stageIdx(l.clientPhase || 'intake');
  const skip = A(l.onbSkip);
  const c = cfg || readLifecycle(null);
  return A(c.template).filter(it => stageIdx(it.stage) <= reached && applies(it, A(products), industry))
    .map(it => {
      const home = homeOf(it, l, tracks);
      if (home.kind === 'onb' && skip.includes(home.key)) return null;   // "not applicable" on the checklist
      const computed = it.anchor === 'clock' ? shiftByPauses(baseDue(it, a), lc.pauses, t) : baseDue(it, a);
      /* a date someone typed onto the item's home wins over the computed one */
      const typed = dueOf(home.entry);
      const due = it.excluded ? null : typed || computed;
      const done = doneOf(home.entry) || (it.doneOn === 'launched' ? launchedOn(l) || null : null);
      const owner = O(lc.owners)[it.id] || (it.owner === 'contact' ? contact : c.builder) || l.owner || '';
      return { id: it.id, stage: it.stage, label: it.label, due, computed, typed: !!typed, done, owner, home, excluded: !!it.excluded,
        overdue: !done && !!due && due < t, pauseWhenLate: !!it.pauseWhenLate };
    }).filter(Boolean);
}

/** When the client entered the stage they are in: the date a move stamped,
 *  else the newest "Phase →" note (clients moved before phaseSince existed),
 *  else when they became a client. Derived, so reading it writes nothing. */
export function stageSince(lead) {
  const l = lead || {};
  if (l.phaseSince) return day(l.phaseSince);
  const n = A(l.activities).filter(a => a && a.ts && /^Phase → /.test(String(a.text || '')) && !/\(.*project.*\)$/.test(String(a.text || ''))).map(a => day(a.ts)).sort().pop();
  return n || day(l.convertedAt || l.closedAt || '') || '';
}
/** When they launched: stamped by the move, else when they entered Launched. */
export const launchedOn = l => day((l && l.launchedAt) || '') || ((l && l.clientPhase) === 'launch' ? stageSince(l) : '');

/** "Waiting on:" for the card. Intake: what the clock waits for, in the
 *  CRM's words. Review: the client's feedback. Otherwise nothing. */
export function waitingOn(lead, clock, items) {
  const ph = (lead && lead.clientPhase) || 'intake';
  if (ph === 'intake') return A(clock && clock.waiting).map(w => w.replace(/^your /, ''));
  if (ph === 'review') return A(items).some(i => i.id === 'feedback' && !i.done) ? ['client feedback'] : [];
  return [];
}

/* ---------- the reconcile: one patch per client, or null ---------- */
const PHASE_WORD = { intake: 'Intake', build: 'Build', review: 'Review', launch: 'Launched', active: 'Active', atrisk: 'At Risk', churned: 'Former' };
const fmt = iso => { const d = new Date(day(iso) + 'T12:00:00Z'); return Number.isFinite(d.getTime()) ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : day(iso); };
/** Hook for Phase 3 (Square): true when a payment for this client failed.
 *  Nothing records a failed payment yet, so it is always false; the rule that
 *  reads it is wired, so turning it on is one function. */
export const paymentFailed = () => false;

/**
 * The EVENTS the lifecycle causes for one client today, as ONE patch for
 * updateLead, or null when nothing happened. Idempotent: run it twice and the
 * second run returns null. Due dates and days-in-stage are derived and never
 * appear here, so a client with nothing happening is never written.
 *  - the automatic move, forward only, one step:
 *      intake → build      when the clock starts
 *      launch → active     30 days after launch
 *      active → atrisk     45 days with no logged contact, or a failed payment
 *    never out of At Risk or Former, never backward; the move stamps
 *    phaseSince (and launchedAt when it leaves Launched without one);
 *  - Terms 6.3: round-1 feedback more than one business day late pauses the
 *    clock; the feedback ticked resumes it. Every open date moves on read.
 * `label(key)` names a stage as Settings calls it; `lastContact` is the
 * lead's last real touch (lib/lead lastTouch).
 */
export function lifecyclePatch(lead, ctx = {}) {
  const l = lead || {};
  if (!l.isClient) return null;
  const t = day(ctx.today);
  const label = ctx.label || (k => PHASE_WORD[k] || k);
  const patch = {};
  const acts = [];
  const note = (id, text) => { if (!A(l.activities).some(x => x && x.id === id)) acts.push({ id, ts: ctx.now || new Date().toISOString(), type: 'Note', who: AUTO, text }); };
  const phase = l.clientPhase || 'intake';
  const lc0 = O(l.lifecycle);
  const pauses = A(lc0.pauses).map(p => ({ ...p }));
  let paused = false;
  const clock = clockOf(l, { onboarding: ctx.onboarding, products: ctx.products, launchDays: ctx.launchDays, today: t });

  /* ---- the automatic move (forward, one step) ---- */
  let to = null, why = '';
  if (phase === 'intake' && clock.started) { to = 'build'; why = `the ${clock.launchDays ? clock.launchDays + '-day ' : ''}clock started ${fmt(clock.startedOn)}`; }
  else if (phase === 'launch') {
    const launched = launchedOn(l);
    if (launched && daysBetween(launched, t) >= ACTIVE_AFTER_DAYS) { to = 'active'; why = `${ACTIVE_AFTER_DAYS} days after launch`; }
  } else if (phase === 'active') {
    /* from the later of the last real contact and becoming Active: a client
       who just went Active is not "45 days without contact" on day one */
    const since = [day(ctx.lastContact || ''), stageSince(l)].filter(Boolean).sort().pop() || '';
    if (paymentFailed(l)) { to = 'atrisk'; why = 'a payment failed'; }
    else if (since && daysBetween(since, t) >= AT_RISK_AFTER_DAYS) { to = 'atrisk'; why = `no logged contact in ${AT_RISK_AFTER_DAYS} days`; }
  }
  if (to) {
    patch.clientPhase = to; patch.phaseSince = t;
    if (phase === 'launch' && !l.launchedAt) patch.launchedAt = launchedOn(l);
    note(`lc-move-${phase}-${to}-${t}`, `Phase → ${label(to)} (automatic: ${why}).`);
  }

  /* ---- Terms 6.3: the pause, and the resume ---- */
  if (phase === 'review' || pauses.some(p => p && p.from && !p.to)) {
    const fb = dueItems(l, { ...ctx, today: t }).find(i => i.pauseWhenLate);
    const open = pauses.find(p => p && p.from && !p.to);
    if (fb && fb.done && open) {
      open.to = day(fb.done) < open.from ? open.from : day(fb.done); paused = true;
      const n = daysBetween(open.from, open.to);
      note(`lc-resume-${open.from}`, `Clock resumed: client feedback received. Remaining dates moved ${n} day${n === 1 ? '' : 's'} later.`);
    } else if (fb && !fb.done && fb.due && !open && phase === 'review') {
      const grace = addBusinessDays(fb.due, 1);
      if (grace && t > grace && !pauses.some(p => p && p.from === grace)) {
        pauses.push({ from: grace, to: null, reason: 'Waiting on client feedback' }); paused = true;
        note(`lc-pause-${grace}`, 'Clock paused: waiting on client feedback.');
      }
    }
  }
  if (paused) patch.lifecycle = { ...lc0, pauses };
  if (acts.length) patch.activities = [...acts, ...A(l.activities)];
  return Object.keys(patch).length ? patch : null;
}

/* ---------- the dashboard ---------- */
export const DUE_GROUPS = [['overdue', 'Overdue'], ['today', 'Today'], ['week', 'This week']];
/** Bucket one due date: overdue, today, the next 6 days, or null (later or
 *  undated, so not on the card). */
export function dueGroup(due, today) {
  if (!due) return null;
  const t = day(today);
  if (due < t) return 'overdue';
  if (due === t) return 'today';
  return daysBetween(t, due) <= 6 ? 'week' : null;
}
/** The "What's due" card: open, dated items across clients, grouped
 *  Overdue / Today / This week, then by client, earliest first. `mine` keeps
 *  only items owned by that name. */
export function whatsDue(rows, { today, mine } = {}) {
  const out = { overdue: [], today: [], week: [] };
  for (const r of A(rows)) for (const it of A(r.items)) {
    if (it.done || it.excluded) continue;
    if (mine && it.owner !== mine) continue;
    const g = dueGroup(it.due, today); if (!g) continue;
    out[g].push({ ...it, leadId: r.lead.id, client: r.lead.company || r.lead.name || 'Client', phase: r.lead.clientPhase || 'intake' });
  }
  const group = list => {
    const by = new Map();
    for (const it of list.sort((x, y) => x.due.localeCompare(y.due) || x.client.localeCompare(y.client))) {
      if (!by.has(it.leadId)) by.set(it.leadId, { leadId: it.leadId, client: it.client, phase: it.phase, items: [] });
      by.get(it.leadId).items.push(it);
    }
    return [...by.values()];
  };
  return { overdue: group(out.overdue), today: group(out.today), week: group(out.week), count: out.overdue.length + out.today.length + out.week.length };
}
/** "Launches this month": every client in Build or Review with a target
 *  launch date in the month of `today`, soonest first. */
export function launchesThisMonth(rows, today) {
  const ym = day(today).slice(0, 7);
  return A(rows).filter(r => ['build', 'review'].includes(r.lead.clientPhase) && r.clock && r.clock.started && r.clock.target && r.clock.target.slice(0, 7) === ym)
    .map(r => ({ leadId: r.lead.id, client: r.lead.company || r.lead.name || 'Client', day: r.clock.day, launchDays: r.clock.launchDays, target: r.clock.target, tone: r.clock.tone, paused: r.clock.paused }))
    .sort((a, b) => a.target.localeCompare(b.target));
}
