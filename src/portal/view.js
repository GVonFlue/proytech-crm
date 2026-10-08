/* The client portal's arithmetic, pure: what the Home screen says, built
   from portal_home() (PORTAL-MIGRATION.sql) by the SAME functions the CRM's
   client cards and dashboard use (lib/lifecycle: clockOf, dueItems,
   waitingOn). The client, the CRM and the onboarding portal cannot show three
   different launch dates. */
import { clockOf, dueItems, waitingOn, productsOf, DEFAULT_TEMPLATE } from '../lib/lifecycle.js';

const A = v => (Array.isArray(v) ? v : []);
const O = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

/** The greeting, from the CLIENT's device clock (spec B2.1):
 *  5:00 to 11:59 morning, 12:00 to 4:59 PM afternoon, 5:00 to 9:59 PM
 *  evening, 10:00 PM to 4:59 AM "Burning the midnight oil". */
export function greetingFor(hour) {
  const h = Number(hour);
  if (h >= 5 && h < 12) return 'Good morning';
  if (h >= 12 && h < 17) return 'Good afternoon';
  if (h >= 17 && h < 22) return 'Good evening';
  return 'Burning the midnight oil';
}

/* the five stages a client is shown. At Risk is a CRM word and never reaches
   a client: they see Active. */
export const CLIENT_STAGES = [['intake', 'Intake'], ['build', 'Build'], ['review', 'Review'], ['launch', 'Launch'], ['active', 'Active']];
export const stageOf = phase => (phase === 'atrisk' ? 'active' : CLIENT_STAGES.some(s => s[0] === phase) ? phase : 'intake');
/** "Reed Realty Group is in the build." */
export const STAGE_LINE = { intake: 'is getting set up', build: 'is in the build', review: 'is in review', launch: 'is live', active: 'is live and growing' };

/* the template names its delivery milestones; the portal is not sent the
   owner's track settings, so it trusts the template's own names */
function tracksFromTemplate(template) {
  const by = {};
  for (const t of A(template)) if (t && t.ref && t.ref.track) (by[t.ref.track] = by[t.ref.track] || []).push(t.ref.milestone);
  return Object.entries(by).map(([key, milestones]) => ({ key, milestones }));
}

/** Everything Home shows, from portal_home(), as of `today` (YYYY-MM-DD). */
export function homeModel(h, today, review) {
  if (!h) return null;
  const ck = O(h.checklist);
  const { onbSkip, ...ticks } = ck;
  const lead = { isClient: true, clientPhase: h.phase || 'intake', phaseSince: h.phase_since, launchedAt: h.launched_at, convertedAt: h.converted_at,
    onboarding: ticks, onbSkip: A(onbSkip), delivery: O(h.delivery), lifecycle: O(h.lifecycle) };
  const cfgIn = O(h.config);
  const template = A(cfgIn.template).length ? cfgIn.template : DEFAULT_TEMPLATE;
  const cfg = { builder: cfgIn.builder || '', template, fellBack: [] };
  const p = h.proposal ? { accepted_at: h.proposal.accepted_at, body: { quote: O(h.proposal.quote) } } : null;
  const products = productsOf({ onboarding: h.onboarding, proposal: p, productMap: cfgIn.product_map, trackKeys: [] });
  const ld = h.proposal && Number.isInteger(h.proposal.launch_days) ? h.proposal.launch_days : Number.isInteger(cfgIn.launch_days) ? cfgIn.launch_days : null;
  const contacts = A(h.proposal && h.proposal.contacts);
  /* review dates from portal_review() (B-2): round 1 submitted, revisions done,
     approved complete their items here exactly as in the CRM */
  const ctx = { onboarding: h.onboarding ? { ...h.onboarding } : null, proposal: p, products, launchDays: ld, today, cfg, tracks: tracksFromTemplate(template), contact: (contacts[0] && contacts[0].name) || '', review: O(review && review.dates) };
  const clock = clockOf(lead, ctx);
  const items = dueItems(lead, ctx).filter(i => !i.excluded);
  const waiting = waitingOn(lead, clock, items);
  const stage = stageOf(lead.clientPhase);
  const q = O(h.proposal && h.proposal.quote);
  const deposit = Number(q.deposit) || 0, setup = Number(q.setup) || 0;
  return {
    firstName: h.first_name || '', company: h.company || '', stage, stageLine: STAGE_LINE[stage], products,
    clock, items, waiting, contacts,
    packageLine: q.packageName || A(q.items).map(i => i && i.name).filter(Boolean).join(' + '),
    billing: h.proposal ? { depositPct: q.depositPct || null, deposit, paid: !!(ticks.deposit_paid && (ticks.deposit_paid.done || typeof ticks.deposit_paid === 'string')) || A(onbSkip).includes('deposit_paid'),
      balance: Math.max(0, setup - deposit), monthly: Number(q.monthly) || 0 } : null,
  };
}
