/* WHERE A LEAD CAME FROM, AND WHAT IT WAS WORTH (Relationships & Referrals
   spec, Part 2).
   ============================================================================

   Pure. TWO FACTS, never one (decided 7 Oct 2026):

     referredBy(lead)  WHO GETS CREDIT. A person, via the lead's existing
                       introducedBy (any contact: relationship, client, lead),
                       or, when no person is linked, a non-person source.
     arrivedVia(lead)  HOW THEY ARRIVED: the channel (coffee page, website,
                       event, ad, social...). The lead's existing `source`.
                       Picking a person never overwrites it, so "Dana sent
                       them, and they came in through the coffee page" stays
                       two true statements. The future lead-to-client
                       analytics reports by channel from this, not by credit.

   Nothing is migrated. Existing rows map as they are:
     introducedBy set                      the person (wins over source)
     introducedBy pointing at nobody       "(removed contact)", still a person
     source "Intro from Dana", no person   "Intro from Dana (not linked)", its
                                           own row until somebody links Dana
     source "Referral", no person          "Referral (person not recorded)",
                                           its own row, never folded into one
     any other source                      that source
     nothing                               "Unknown", counted, never dropped

   Credit is DIRECT ONLY: Dana referred Marcus, Marcus referred Sam, so Sam is
   Marcus's. Chains stay on the network web; crediting them would count Sam
   twice across rows.

   THE MONEY IS THE MONEY PAGE'S. Revenue is lib/lead revenueForMonth, called
   per lead per month, so a source's revenue is exactly what the Money page
   counts for those leads in those months (cash on the day it was paid, plus
   the bounded legacy fallback), and summing every row gives the Money page's
   client revenue with nothing counted twice. It is split into setup (one-off
   payments + legacy closes) and retainer cash, so "setup won" sits next to
   MRR without containing it. MRR is lib/retainer billsMrr, now. */
import { revenueForMonth, sOf, num, isoOf } from './lead.js';
import { retainerPayments, billsMrr } from './retainer.js';

const S = (v, n = 200) => (v == null ? '' : String(v)).trim().slice(0, n);
export const INTRO_FROM = /^Intro from\s+(.+)$/i;
export const UNRECORDED_KEY = 'referral:unrecorded';
export const UNKNOWN_KEY = 'unknown';

/** Who gets credit. {kind:'person'|'unlinked'|'unrecorded'|'source'|'unknown',
 *  key, label, id?, gone?}. `byId` is a Map or object of every contact. */
export function referredBy(l, byId) {
  const get = id => (byId instanceof Map ? byId.get(id) : byId && byId[id]);
  const via = S(l && l.introducedBy);
  if (via && via !== (l && l.id)) {
    const p = get(via);
    return { kind: 'person', key: 'person:' + via, id: via, gone: !p, label: p ? (S(p.name) || S(p.company) || '(unnamed)') : '(removed contact)' };
  }
  const src = S(l && l.source);
  const m = src.match(INTRO_FROM);
  if (m) return { kind: 'unlinked', key: 'unlinked:' + m[1].toLowerCase(), label: `Intro from ${m[1]} (not linked)` };
  if (/^referral$/i.test(src)) return { kind: 'unrecorded', key: UNRECORDED_KEY, label: 'Referral (person not recorded)' };
  if (src) return { kind: 'source', key: 'source:' + src.toLowerCase(), label: src };
  return { kind: 'unknown', key: UNKNOWN_KEY, label: 'Unknown' };
}

/** How they arrived. The coffee page writes the visitor's own answer into
 *  source ("Intro from Dana", "Instagram"...) and labels the lead 'Coffee';
 *  for an "Intro from" line that label is the channel. */
export function arrivedVia(l) {
  const src = S(l && l.source);
  const coffee = Array.isArray(l && l.labels) && l.labels.includes('Coffee');
  if (INTRO_FROM.test(src)) return { key: coffee ? 'coffee page' : 'referral', label: coffee ? 'Coffee page' : 'Referral' };
  if (src) return { key: src.toLowerCase(), label: src };
  return { key: UNKNOWN_KEY, label: 'Unknown' };
}

/* ---------------------------------------------------------------- periods */
export const PERIODS = [['month', 'This month'], ['quarter', 'This quarter'], ['year', 'This year'], ['all', 'All time']];
/** {from, to} as YYYY-MM-DD (inclusive), or null bounds for all time. */
export function periodRange(key, today) {
  const t = S(today, 10) || isoOf(new Date());
  const y = +t.slice(0, 4), m = +t.slice(5, 7);
  const pad = n => String(n).padStart(2, '0');
  if (key === 'month') return { from: `${y}-${pad(m)}-01`, to: t };
  if (key === 'quarter') { const q0 = Math.floor((m - 1) / 3) * 3 + 1; return { from: `${y}-${pad(q0)}-01`, to: t }; }
  if (key === 'year') return { from: `${y}-01-01`, to: t };
  return { from: null, to: t };
}
const inRange = (d, r) => !!d && (!r.from || d >= r.from) && d <= r.to;
const dayOf = v => { const s = S(v, 40); if (!s) return ''; if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; const d = new Date(s); return isNaN(d) ? '' : isoOf(d); };

/** Every month a lead has money in, so "all time" covers it exactly. */
function moneyMonths(l) {
  const ks = new Set();
  for (const p of [...((l && l.payments) || []), ...((l && l.retainerPayments) || [])]) if (p && p.date) ks.add(String(p.date).slice(0, 7));
  for (const d of ((l && l.closedDeals) || [])) if (d && d.closedAt) ks.add(String(d.closedAt).slice(0, 7));
  if (l && l.closedAt) ks.add(String(l.closedAt).slice(0, 7));
  return [...ks].filter(k => /^\d{4}-\d{2}$/.test(k));
}
function monthsIn(r, l) {
  const all = moneyMonths(l);
  return all.filter(k => (!r.from || k >= r.from.slice(0, 7)) && k <= r.to.slice(0, 7));
}

/** One lead's revenue in a range, the Money page's way: {setup, retainer, total}.
 *  revenueForMonth counts a whole month; a range that starts or ends mid-month
 *  only happens at "today", which is the month's end so far. */
export function leadRevenue(l, stages, r) {
  let total = 0, retainer = 0;
  for (const k of monthsIn(r, l)) {
    total += revenueForMonth([l], stages, [], k).clientRevenueMonth;
    retainer += retainerPayments(l).reduce((a, p) => a + (p && p.date && String(p.date).slice(0, 7) === k ? num(p.amount) : 0), 0);
  }
  return { setup: total - retainer, retainer, total };
}

const isWon = (l, stages) => !!(l && (l.isClient || sOf(l.stage, stages).won));
const wonOn = l => dayOf(l.convertedAt || l.closedAt);

/** The leaderboard. One row per referrer, ranked by setup revenue won, then
 *  clients won. Each row also breaks down by arrival channel.
 *  A relationship is not a lead and is not counted as referred, UNLESS it
 *  carries money or was won: the Money page counts that money (its set is
 *  business leads plus relationships with real money), so leaving it out here
 *  would make the two totals disagree. */
export function sourceRollup(leads, stages, { period = 'all', today, mrrOf } = {}) {
  const r = periodRange(period, today);
  const all = leads || [];
  const byId = new Map(all.map(l => [l.id, l]));
  const mrrFn = mrrOf || (l => (billsMrr(l) ? num(l.retainer) : 0));
  const rows = new Map();
  const blank = c => ({ ...c, leads: 0, won: 0, wonOfReferred: 0, setup: 0, retainerCash: 0, revenue: 0, mrr: 0, ids: [], channels: new Map() });
  for (const l of all) {
    if (!l || (l.isRelationship && !isWon(l, stages) && !moneyMonths(l).length)) continue;
    const c = referredBy(l, byId);
    if (!rows.has(c.key)) rows.set(c.key, blank(c));
    const row = rows.get(c.key);
    const ch = arrivedVia(l);
    if (!row.channels.has(ch.key)) row.channels.set(ch.key, { ...ch, leads: 0, won: 0, setup: 0 });
    const chRow = row.channels.get(ch.key);
    const referredHere = inRange(dayOf(l.createdAt), r);
    const won = isWon(l, stages);
    const money = leadRevenue(l, stages, r);
    if (referredHere) { row.leads++; chRow.leads++; if (won) row.wonOfReferred++; }
    if (won && inRange(wonOn(l), r)) { row.won++; chRow.won++; }
    row.setup += money.setup; row.retainerCash += money.retainer; row.revenue += money.total; chRow.setup += money.setup;
    if (won) row.mrr += mrrFn(l);
    if (referredHere || money.total > 0 || (won && inRange(wonOn(l), r))) row.ids.push(l.id);
  }
  const out = [...rows.values()]
    .filter(x => x.leads || x.won || x.revenue || x.mrr)
    .map(x => ({ ...x, rate: x.leads ? x.wonOfReferred / x.leads : null,
      channels: [...x.channels.values()].filter(c => c.leads || c.won || c.setup).sort((a, b) => b.setup - a.setup || b.leads - a.leads) }))
    .sort((a, b) => b.setup - a.setup || b.won - a.won || b.mrr - a.mrr || b.leads - a.leads || a.label.localeCompare(b.label));
  const totals = out.reduce((t, x) => ({ leads: t.leads + x.leads, won: t.won + x.won, setup: t.setup + x.setup, retainerCash: t.retainerCash + x.retainerCash, revenue: t.revenue + x.revenue, mrr: t.mrr + x.mrr }),
    { leads: 0, won: 0, setup: 0, retainerCash: 0, revenue: 0, mrr: 0 });
  return { period, range: r, rows: out, totals };
}

/** One referrer's row (a relationship record's "Sent to you"), or an empty one. */
export function rollupFor(personId, leads, stages, opts = {}) {
  const ro = sourceRollup(leads, stages, opts);
  return ro.rows.find(x => x.key === 'person:' + personId) || { key: 'person:' + personId, leads: 0, won: 0, setup: 0, retainerCash: 0, revenue: 0, mrr: 0, rate: null, channels: [] };
}

/** What changed, for the notes the record writes (app-written, so they never
 *  count as a touch: lib/lead SYS_NOTE knows "Referred by: " and "Arrived
 *  via: "). {referred:[from,to]|null, arrived:[from,to]|null}. The record
 *  writes the text as literals so tests/systemnotes.mjs can read them. */
export function sourceChange(before, after, byId) {
  const name = id => { if (!id) return '—'; const p = byId instanceof Map ? byId.get(id) : byId && byId[id]; return p ? (S(p.name) || S(p.company) || '(unnamed)') : '(removed contact)'; };
  return {
    referred: 'introducedBy' in after && S(after.introducedBy) !== S(before.introducedBy) ? [name(S(before.introducedBy)), name(S(after.introducedBy))] : null,
    arrived: 'source' in after && S(after.source) !== S(before.source) ? [S(before.source) || '—', S(after.source) || '—'] : null,
  };
}
