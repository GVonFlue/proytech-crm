/* STAYING IN TOUCH ON A CADENCE (Relationships & Referrals spec, Part 1).
   ============================================================================

   Pure. One answer to "who should I reach out to, and when", read by every
   screen that asks: the dashboard's "Reach out" group (owner and rep), the
   Relationships page's "Needs attention" strip, the tier columns' colouring
   and the Monday Huddle's cold list. Before this, the strip and the Huddle
   read COLD_DAYS (30/60/90) and nothing else knew a cadence existed.

   THE RULES
   - Cadence: A every 14 days, B every 30, C every 90, editable in Settings
     (settings.relCadence). A tier the owner never saved falls back to those
     numbers, and readCadence says which tiers fell back, by name, so the
     screen can say so (CLAUDE.md: a fallback never renders like a choice).
   - Per person: relCadenceDays on the record (whole days, 1-365). Blank means
     the tier's cadence.
   - Last touch is lib/lead lastTouch(): logged activity a person did (call,
     text, email, meeting, coffee, event, intro, referral, a note they wrote)
     or a meeting marked held. Never typed separately.
   - Next touch due = last touch + cadence. A manual follow-up date wins when
     it is SOONER ("call him Tuesday"); it never pushes the cadence later.
     Never contacted = due now.
   - Overdue = due before today. Due this week = today through today + 6.
   - Birthdays (any key date whose label says birthday) show 3 days ahead.

   Tier keys stay the stored ones ('champion', 'b', 'new'), shown as A / B / C
   (see REL_TIERS in lib/lead). */
import { REL_TIERS, lastTouch, keyDatesOf, daysToDate, isoOf, fmtDate } from './lead.js';

export const TIER_KEYS = REL_TIERS.map(t => t[0]);
/** what each tier means, the spec's words */
export const REL_TIER_DESC = { champion: 'Actively sends business', b: 'Warm', new: 'Keep in touch' };
export const CADENCE_DEFAULT = { champion: 14, b: 30, new: 90 };
export const CADENCE_MIN = 1, CADENCE_MAX = 365;
export const BIRTHDAY_AHEAD = 3;
export const WEEK_DAYS = 6;

export const tierOf = r => (TIER_KEYS.includes(r && r.relTier) ? r.relTier : 'new');
export const tierMeta = k => REL_TIERS.find(t => t[0] === k) || REL_TIERS[2];
export const tierLetter = k => ({ champion: 'A', b: 'B', new: 'C' })[k] || 'C';
const tierRank = k => { const i = TIER_KEYS.indexOf(k); return i < 0 ? TIER_KEYS.length : i; };

/** A whole number of days inside the allowed range, or null. '' / 0 / junk
 *  are null, so a cleared field means "use the tier", never "every 0 days". */
export function cleanDays(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const d = Math.round(n);
  return d >= CADENCE_MIN && d <= CADENCE_MAX ? d : null;
}

/** settings.relCadence, with every tier that was never saved named. */
export function readCadence(settings) {
  const saved = (settings && settings.relCadence && typeof settings.relCadence === 'object') ? settings.relCadence : {};
  const days = {}, fellBack = [];
  for (const k of TIER_KEYS) {
    const d = cleanDays(saved[k]);
    if (d === null) { days[k] = CADENCE_DEFAULT[k]; fellBack.push(k); } else days[k] = d;
  }
  return { days, fellBack };
}

/** {days, source}: 'person' when the record overrides, else 'tier'. */
export function cadenceOf(r, cfg) {
  const own = cleanDays(r && r.relCadenceDays);
  if (own !== null) return { days: own, source: 'person' };
  const c = cfg || readCadence(null);
  return { days: c.days[tierOf(r)], source: 'tier' };
}

const dayOf = ts => { if (!ts) return null; const d = new Date(ts); return isNaN(d) ? null : isoOf(d); };
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoOf(d); };
const between = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5);
const todayOf = today => (today ? String(today).slice(0, 10) : isoOf(new Date()));

/** When the next touch is due, and why.
 *  {due, last, cadence, source:'never'|'cadence'|'followUp', daysLate} */
export function nextTouch(r, cfg, today) {
  const t = todayOf(today);
  const cad = cadenceOf(r, cfg);
  const lastTs = lastTouch(r);
  const last = dayOf(lastTs);
  const fu = /^\d{4}-\d{2}-\d{2}$/.test(String((r && r.followUp) || '')) ? r.followUp : null;
  let due, source;
  if (!last) { due = t; source = 'never'; }
  else { due = addDays(last, cad.days); source = 'cadence'; }
  if (fu && fu < due) { due = fu; source = 'followUp'; }
  return { due, last, lastTs, cadence: cad.days, cadenceSource: cad.source, source, daysLate: Math.max(0, between(due, t)) };
}

/** The birthday showing for this record inside BIRTHDAY_AHEAD days, or null. */
export function birthdaySoon(r, today) {
  const t = todayOf(today);
  const from = new Date(t + 'T12:00:00');
  let best = null;
  for (const d of keyDatesOf(r)) {
    if (!/birthday/i.test(String((d && d.label) || ''))) continue;
    const n = daysToDate(d.date, d.annual !== false, from);
    if (n === null || n < 0 || n > BIRTHDAY_AHEAD) continue;
    if (!best || n < best.inDays) best = { label: d.label, inDays: n, on: addDays(t, n) };
  }
  return best;
}

const whyOf = (n, t) => n.source === 'never' ? 'Never contacted'
  : n.source === 'followUp' ? (n.due < t ? `Follow-up was ${fmtDate(n.due)}` : n.due === t ? 'Follow-up today' : `Follow-up ${fmtDate(n.due)}`)
  : n.due < t ? `${between(n.last, t)}d since a touch · every ${n.cadence}d`
  : n.due === t ? `Due today · every ${n.cadence}d`
  : `Due ${fmtDate(n.due)} · every ${n.cadence}d`;

/** The "Reach out" list. Overdue and due this week, A tier first, then the
 *  earliest due; never-contacted counts as overdue. Birthdays 3 days ahead,
 *  soonest first. `mine` keeps only relationships that person owns.
 *  {overdue:[], week:[], birthdays:[], count} */
export function reachOut(rels, { cfg, today, mine } = {}) {
  const t = todayOf(today);
  const c = cfg || readCadence(null);
  const out = { overdue: [], week: [], birthdays: [] };
  for (const r of (rels || [])) {
    if (!r || !r.isRelationship) continue;
    if (mine && r.owner !== mine) continue;
    const n = nextTouch(r, c, t);
    const tier = tierOf(r);
    const row = { r, id: r.id, name: r.name || r.company || '(no name)', tier, ...n, why: whyOf(n, t) };
    if (n.due < t || n.source === 'never') out.overdue.push(row);
    else if (between(t, n.due) <= WEEK_DAYS) out.week.push(row);
    const b = birthdaySoon(r, t);
    if (b) out.birthdays.push({ r, id: r.id, name: row.name, tier, ...b, why: b.inDays === 0 ? `${b.label} today` : `${b.label} in ${b.inDays}d` });
  }
  /* never contacted sorts first inside its tier: it is the coldest thing
     there is, not a due date of today */
  const key = x => (x.source === 'never' ? '0000-00-00' : x.due);
  const order = (a, b) => tierRank(a.tier) - tierRank(b.tier) || key(a).localeCompare(key(b)) || a.name.localeCompare(b.name);
  out.overdue.sort(order); out.week.sort(order);
  out.birthdays.sort((a, b) => a.inDays - b.inDays || tierRank(a.tier) - tierRank(b.tier) || a.name.localeCompare(b.name));
  return { ...out, count: out.overdue.length + out.week.length + out.birthdays.length };
}
export const REACH_GROUPS = [['overdue', 'Overdue'], ['week', 'Due this week'], ['birthdays', 'Birthdays']];

/** Gone cold for the Huddle: past cadence (or never contacted), coldest first.
 *  The cadence half of "overdue" only: a follow-up date that slipped is
 *  already its own line in the Huddle (overdue follow-ups). */
export function coldByCadence(rels, cfg, today) {
  const t = todayOf(today);
  return (rels || []).map(r => {
    const n = nextTouch({ ...r, followUp: '' }, cfg, t);
    const days = n.last ? between(n.last, t) : null;
    return { r, tier: tierOf(r), last: n.lastTs, days, limit: n.cadence, cold: n.source === 'never' || n.due < t };
  }).filter(x => x.cold).sort((a, b) => (b.days === null ? Infinity : b.days) - (a.days === null ? Infinity : a.days));
}

/* ---- logging a touch --------------------------------------------------- */
/** What "Log touch" offers. Coffee is a Meeting with mtype 'Coffee'. */
export const TOUCH_KINDS = [
  { key: 'Call', type: 'Call' }, { key: 'Text', type: 'Text' }, { key: 'Email', type: 'Email' },
  { key: 'Coffee', type: 'Meeting', mtype: 'Coffee' }, { key: 'Meeting', type: 'Meeting' },
  { key: 'Event', type: 'Event' }, { key: 'Intro', type: 'Intro' }, { key: 'Referral', type: 'Referral' },
];
/** The activity "Log touch" writes: [type, text, extra]. The text is the
 *  note when there is one, else the kind, so the feed never shows a blank
 *  row and addActivity (which refuses empty text) always writes. */
export function touchActivity(kindKey, note) {
  const k = TOUCH_KINDS.find(x => x.key === kindKey);
  if (!k) return null;
  const n = String(note || '').trim().slice(0, 2000);
  const text = n ? (k.key === k.type ? n : `${k.key}: ${n}`) : `${k.key} logged`;
  return [k.type, text, { touch: k.key, ...(k.mtype ? { mtype: k.mtype } : {}) }];
}
