/* THE CLIENT LIFECYCLE: stages, the 14-day clock, automatic due dates.
   ============================================================================

   lib/lifecycle.js is pure, so this drives it with leads shaped exactly as the
   CRM stores them and asserts on the PATCH it returns: the thing that reaches
   the database through updateLead. The board, the card and the dashboard are
   in tests/lifecycleui.mjs.

     - clock start is #90's launchState (deposit, onboarding, access, logo,
       headshot; Terms 6.2), in calendar days (6.1)
     - automatic moves go forward one step and never out of At Risk / Former;
       each is logged once, by "Automatic", and a second run changes nothing
     - due dates per product, written onto the item's EXISTING home (the
       checklist, the delivery track) unless someone typed a different date
     - the Terms 6.3 pause: feedback more than one business day late pauses
       the clock, ticking it resumes and every open date moves
     - excluded items (Terms 6.4) never get a date and never count
     - owners: the proposal's contact or the builder, never a task in the
       shared tasks row
     - "What's due" grouping and "Mine"; "Launches this month"

   Seen red: allowing a backward automatic move; ignoring a hand-set due date;
   counting business days; a pause that shifts finished items.             */
import fs from 'node:fs';
import esbuild from 'esbuild';
import * as LC from '../src/lib/lifecycle.js';
import { test, eq, ok, report } from './assert.mjs';
/* lib/lead.js reaches for ./brand and lucide-react (extensionless), so it is
   bundled the way tests/systemnotes.mjs does it */
const built = await esbuild.build({ entryPoints: ['src/lib/lead.js'], bundle: true, write: false,
  format: 'esm', jsx: 'automatic', loader: { '.js': 'jsx' },
  define: { 'import.meta.env': '__ENV__' }, banner: { js: 'const __ENV__={MODE:"test",DEV:false,PROD:true};' }, logLevel: 'silent' });
fs.writeFileSync('tests/.blc.mjs', built.outputFiles[0].text);
const LEAD = await import('./.blc.mjs?v=' + Date.now());
fs.unlinkSync('tests/.blc.mjs');
const { DEFAULT_DELIVERY_TRACKS } = LEAD;

const tracks = DEFAULT_DELIVERY_TRACKS;
const cfg = { builder: 'Logan', template: LC.DEFAULT_TEMPLATE, fellBack: [] };
const GROWTH = ['website', 'suite'];
const base = (o = {}) => ({ id: 'L1', name: 'Jordan Reed', company: 'Reed Realty', isClient: true, clientPhase: 'intake', convertedAt: '2026-10-01', owner: 'Garrett', activities: [], onboarding: {}, ...o });
const done = d => ({ done: d, due: null, assignee: null, taskId: null });
/* every Terms 6.2 piece in, the last on Oct 8 */
const allIn = { deposit_paid: done('2026-10-02'), intake_form: done('2026-10-05'), access_dns: done('2026-10-07'), access_gbp: done('2026-10-06'), logo_received: done('2026-10-05'), headshot_received: done('2026-10-08') };
const ctx = (o = {}) => ({ today: '2026-10-09', now: '2026-10-09T15:00:00Z', products: GROWTH, launchDays: 14, cfg, tracks, contact: 'Garrett', ...o });
const run = (lead, o) => LC.lifecyclePatch(lead, ctx(o));
const apply = (lead, p) => (p ? { ...lead, ...p } : lead);

test('vocabulary: one forward path, two side states', () => {
  eq(LC.FLOW, ['intake', 'build', 'review', 'launch', 'active']);
  eq(LC.SIDE, ['atrisk', 'churned']);
});

test('the clock is #90\'s launchState: waits on every Terms 6.2 piece, by name', () => {
  const c = LC.clockOf(base({ onboarding: { deposit_paid: done('2026-10-02') } }), { products: GROWTH, launchDays: 14, today: '2026-10-09' });
  ok(!c.started);
  /* Google profile access is required only when their answers say they have
     a profile (#90's requiredAccess); with no answers yet it is not */
  eq(c.waiting, ['your onboarding', 'domain access', 'your logo', 'your headshot']);
  const s = LC.clockOf(base({ onboarding: allIn }), { products: GROWTH, launchDays: 14, today: '2026-10-09' });
  ok(s.started); eq(s.startedOn, '2026-10-08');
  eq(s.target, '2026-10-22', '14 CALENDAR days');
  eq(s.day, 1); eq(s.tone, 'ok');
  eq(LC.clockOf(base({ onboarding: allIn }), { products: GROWTH, launchDays: 14, today: '2026-10-18' }).tone, 'warn', 'orange from day 10');
  eq(LC.clockOf(base({ onboarding: allIn }), { products: GROWTH, launchDays: 14, today: '2026-10-21' }).tone, 'late', 'red from day 13');
});

test('Intake → Build when the clock starts, logged once, by Automatic', () => {
  const l = base({ onboarding: allIn });
  const p = run(l);
  eq(p.clientPhase, 'build'); eq(p.phaseSince, '2026-10-09');
  const n = p.activities[0];
  eq(n.who, 'Automatic'); eq(n.text, 'Phase → Build (automatic: the 14-day clock started Oct 8).');
  const again = run(apply(l, p));
  ok(!again || !again.clientPhase, 'a second run moves nothing');
  ok(!again || !(again.activities || []).some(a => /Phase →/.test(a.text)), 'and logs nothing');
  ok(!run(base({ onboarding: { ...allIn, logo_received: null } })) || !run(base({ onboarding: { ...allIn, logo_received: null } })).clientPhase, 'no logo, no Build');
});

test('a move already logged is not logged again (a write that stamped the note but lost the stage)', () => {
  const l = base({ onboarding: allIn, activities: [{ id: 'lc-move-intake-build-2026-10-09', ts: '2026-10-09T10:00:00Z', type: 'Note', who: 'Automatic', text: 'Phase → Build (automatic: the 14-day clock started Oct 8).' }] });
  const p = run(l);
  eq(p.clientPhase, 'build', 'the stage is still put right');
  ok(!p.activities, 'but no second note');
});

test('automatic moves are forward only, and never leave At Risk or Former', () => {
  for (const ph of ['build', 'review', 'launch', 'active', 'atrisk', 'churned']) {
    const p = run(base({ clientPhase: ph, phaseSince: '2026-10-09', launchedAt: '2026-10-09', onboarding: allIn, activities: [{ ts: '2026-10-09T10:00:00Z', type: 'Call', text: 'x' }] }), { lastContact: '2026-10-09' });
    ok(!p || !p.clientPhase, `${ph}: the clock having started never pulls it anywhere`);
  }
  const atrisk = run(base({ clientPhase: 'atrisk', phaseSince: '2026-01-01' }), { lastContact: '2026-01-01' });
  ok(!atrisk || !atrisk.clientPhase, 'At Risk stays At Risk without a hand move');
});

test('marking launched completes the Launch item', () => {
  const items = LC.dueItems(base({ clientPhase: 'launch', phaseSince: '2026-10-20', launchedAt: '2026-10-20', onboarding: allIn }), ctx({ today: '2026-10-30' }));
  const it = items.find(i => i.id === 'launch');
  eq(it.done, '2026-10-20'); ok(!it.overdue);
});

test('Launched → Active 30 days after launch', () => {
  const l = base({ clientPhase: 'launch', phaseSince: '2026-09-08', launchedAt: '2026-09-08', onboarding: allIn });
  ok(!run(l, { today: '2026-10-07' }), 'day 29: nothing happens, nothing is written');
  const p = run(l, { today: '2026-10-08' });
  eq(p.clientPhase, 'active'); ok(/30 days after launch/.test(p.activities[0].text));
  eq(LC.launchedOn(base({ clientPhase: 'launch', phaseSince: '2026-10-01' })), '2026-10-01', 'moved to Launched by hand before launchedAt existed: when it entered Launched');
  const old = run(base({ clientPhase: 'launch', phaseSince: '2026-09-01', onboarding: allIn }), { today: '2026-10-09' });
  eq(old.launchedAt, '2026-09-01', 'leaving Launched stamps the launch date it was counted from');
});

test('Active → At Risk after 45 days without logged contact; the payment hook is wired and off', () => {
  const l = base({ clientPhase: 'active', phaseSince: '2026-07-01' });
  ok(!run(l, { lastContact: '2026-08-26' }) || !run(l, { lastContact: '2026-08-26' }).clientPhase, '44 days: still Active');
  const p = run(l, { lastContact: '2026-08-25' });
  eq(p.clientPhase, 'atrisk'); ok(/no logged contact in 45 days/.test(p.activities[0].text));
  const fresh = run(base({ clientPhase: 'active', phaseSince: '2026-10-01' }), { lastContact: '2026-06-01' });
  ok(!fresh || !fresh.clientPhase, 'just went Active: counted from then, not from an old last call');
  eq(LC.paymentFailed(l), false, 'Phase 3 (Square) turns this on');
});

test('Intake dates: from acceptance, computed on read, nothing written', () => {
  const l = base({ onboarding: { deposit_paid: done('2026-10-01') } });
  const items = LC.dueItems(l, ctx({ proposal: { accepted_at: '2026-10-01T18:00:00Z' } }));
  const due = id => (items.find(i => i.id === id) || {}).due;
  eq(due('onboarding'), '2026-10-03', 'onboarding: +2');
  eq(due('access_dns'), '2026-10-04'); eq(due('logo'), '2026-10-04'); eq(due('headshot'), '2026-10-04', 'access and assets: +3');
  eq(items.find(i => i.id === 'deposit').done, '2026-10-01', 'the deposit reads the checklist tick');
  eq(due('kickoff'), null, 'kickoff waits for the submit date');
  ok(!items.some(i => i.stage !== 'intake'), 'only the stages reached');
  ok(!run(l, { proposal: { accepted_at: '2026-10-01T18:00:00Z' } }), 'a client with nothing happening is never written (opening a screen writes nothing)');
});

test('kickoff: one BUSINESS day after onboarding submitted', () => {
  const items = LC.dueItems(base({ onboarding: { intake_form: done('2026-10-09') } }), ctx());   // a Friday
  eq(items.find(i => i.id === 'kickoff').due, '2026-10-12', 'Friday + 1 business day = Monday');
});

test('Build and Review dates: from Day 0, per product, onto each item\'s existing home', () => {
  const l = base({ clientPhase: 'review', phaseSince: '2026-10-14', onboarding: allIn });
  const g = LC.dueItems(l, ctx());
  const it = id => g.find(i => i.id === id) || {};
  eq(it('site_v1').due, '2026-10-14', 'site V1: Day 6'); eq([it('site_v1').home.kind, it('site_v1').home.track, it('site_v1').home.milestone], ['track', 'website', 'Website V1 sent']);
  eq(it('suite_install').due, '2026-10-10', 'Suite install: Day 2');
  eq(it('suite_config').due, '2026-10-14');
  eq(it('final_proof').due, '2026-10-19', 'final proof: Day 11');
  eq(it('approval').due, '2026-10-21', 'approval: Day 13');
  eq(it('feedback').due, '2026-10-17', 'feedback: Day 9'); eq(it('feedback').home.kind, 'lc');
  eq(it('launch').due, '2026-10-22', 'launch: Day 14');
  ok(!g.some(i => i.id === 'a2p_submit'), 'no Automations, no A2P');
  const s = LC.dueItems(base({ clientPhase: 'build', onboarding: allIn }), ctx({ products: ['suite'] }));
  ok(!s.some(i => i.home.track === 'website'), 'Suite only: no website items');
  const a = LC.dueItems(base({ clientPhase: 'build', onboarding: allIn }), ctx({ products: ['website', 'automations'] }));
  eq(a.find(i => i.id === 'a2p_submit').due, '2026-10-09', 'Automations: Submit A2P, Day 1');
  eq(a.find(i => i.id === 'texting_live').due, null, 'Texting live: excluded, no date');
  const gone = LC.dueItems(l, ctx({ tracks: tracks.map(t => t.key === 'website' ? { ...t, milestones: ['Something else'] } : t) }));
  eq(gone.find(i => i.id === 'site_v1').home.kind, 'lc', 'a milestone renamed away in Settings falls back to the lifecycle record, not to nothing');
});

test('excluded items: listed, never dated, never overdue, never counted', () => {
  const l = base({ clientPhase: 'build', phaseSince: '2026-10-09', onboarding: allIn });
  const items = LC.dueItems(l, ctx({ products: ['website', 'automations'], onboarding: { products: ['website', 'automations'], answers: { 'biz.industry': 'realtor' }, submitted_at: '2026-10-05' } }));
  const ex = items.filter(i => i.excluded).map(i => i.id).sort();
  eq(ex, ['idx', 'texting_live']);
  ok(items.filter(i => i.excluded).every(i => i.due === null && !i.overdue));
  const due = LC.whatsDue([{ lead: l, items }], { today: '2026-12-31' });
  ok(!JSON.stringify(due).includes('texting_live') && !JSON.stringify(due).includes('"idx"'), 'never on the What\'s due card');
});

test('a date someone typed wins, and a finished item keeps its date', () => {
  const l = base({ clientPhase: 'build', phaseSince: '2026-10-09', onboarding: allIn,
    delivery: { website: { 'Website V1 sent': { done: null, due: '2026-10-20' } }, suite: { 'Install set up': { done: '2026-10-09', due: null } } } });
  const items = LC.dueItems(l, ctx());
  const v1 = items.find(i => i.id === 'site_v1');
  eq(v1.due, '2026-10-20'); ok(v1.typed); eq(v1.computed, '2026-10-14');
  eq(items.find(i => i.id === 'suite_install').done, '2026-10-09');
  ok(!run(l), 'and nothing is written over it');
});

test('Terms 6.3: feedback more than a business day late pauses the clock; ticking it resumes and dates move', () => {
  let l = base({ clientPhase: 'review', phaseSince: '2026-10-14', onboarding: allIn });
  const due = (lead, id, today) => LC.dueItems(lead, ctx({ today })).find(i => i.id === id).due;
  eq(due(l, 'feedback', '2026-10-17'), '2026-10-17');
  ok(!run(l, { today: '2026-10-19' }), 'Monday Oct 19 is the grace day: no pause, no write');
  const p = run(l, { today: '2026-10-20' });
  eq(p.lifecycle.pauses, [{ from: '2026-10-19', to: null, reason: 'Waiting on client feedback' }]);
  ok(p.activities.some(a => a.text === 'Clock paused: waiting on client feedback.'));
  l = apply(l, p);
  ok(!run(l, { today: '2026-10-21' }), 'paused: nothing more to write while it waits');
  const c = LC.clockOf(l, { products: GROWTH, launchDays: 14, today: '2026-10-22' });
  ok(c.paused); eq(c.pausedDays, 3); eq(c.target, '2026-10-25', 'target moves with the pause');
  eq(due(l, 'final_proof', '2026-10-22'), '2026-10-22', 'open dates move while paused: Day 11 (Oct 19) + 3');
  l = { ...l, lifecycle: { ...l.lifecycle, items: { feedback: { done: '2026-10-22' } } } };
  const r = run(l, { today: '2026-10-22' });
  eq(r.lifecycle.pauses[0].to, '2026-10-22');
  ok(r.activities.some(a => a.text === 'Clock resumed: client feedback received. Remaining dates moved 3 days later.'), JSON.stringify(r.activities.map(a => a.text)));
  l = apply(l, r);
  eq(due(l, 'final_proof', '2026-10-30'), '2026-10-22', 'after resuming the move is fixed at 3 days, not growing');
  eq(due(l, 'launch', '2026-10-30'), '2026-10-25');
  eq(due(l, 'feedback', '2026-10-30'), '2026-10-17', 'the feedback item itself keeps its date');
  ok(!run(l, { today: '2026-10-22' }), 'and a second run is a no-op');
});

test('owners: the proposal\'s contact for client-facing items, the builder for build items, an override wins', () => {
  const l = base({ clientPhase: 'build', phaseSince: '2026-10-09', onboarding: allIn, lifecycle: { owners: { site_v1: 'Garrett' } } });
  const items = LC.dueItems(l, ctx());
  eq(items.find(i => i.id === 'logo').owner, 'Garrett');
  eq(items.find(i => i.id === 'suite_install').owner, 'Logan');
  eq(items.find(i => i.id === 'site_v1').owner, 'Garrett', 'set per item');
  const noBuilder = LC.dueItems(l, ctx({ cfg: { ...cfg, builder: '' } }));
  eq(noBuilder.find(i => i.id === 'suite_install').owner, 'Garrett', 'no builder set: the lead\'s owner, never blank');
});

test('readLifecycle names every fallback', () => {
  eq(LC.readLifecycle({}).fellBack, ['lifecycle', 'lifecycle.builder']);
  eq(LC.readLifecycle({ lifecycle: { builder: 'Logan' } }).fellBack, ['lifecycle.template']);
  eq(LC.readLifecycle({ lifecycle: { builder: 'Logan', template: LC.DEFAULT_TEMPLATE } }).fellBack, []);
});

test('products: the onboarding, else the proposal through the product map, else the tracks', () => {
  eq(LC.productsOf({ onboarding: { products: ['suite'] } }), ['suite']);
  eq(LC.productsOf({ proposal: { body: { quote: { items: [{ id: 'growth-os' }] } } }, productMap: { 'growth-os': ['website', 'suite'] } }), ['website', 'suite']);
  eq(LC.productsOf({ trackKeys: ['website', 'ai'] }), ['website', 'automations']);
});

test('What\'s due: Overdue / Today / This week, grouped by client, earliest first, and Mine', () => {
  const rows = [
    { lead: { id: 'A', company: 'Acme', clientPhase: 'build' }, items: [
      { id: 'x', label: 'Late', due: '2026-10-05', owner: 'Logan' }, { id: 'y', label: 'Now', due: '2026-10-09', owner: 'Garrett' },
      { id: 'z', label: 'Done', due: '2026-10-05', done: '2026-10-05', owner: 'Logan' }, { id: 'w', label: 'Far', due: '2026-11-30', owner: 'Logan' }] },
    { lead: { id: 'B', name: 'Bea', clientPhase: 'intake' }, items: [{ id: 'q', label: 'Soon', due: '2026-10-15', owner: 'Logan' }, { id: 'r', label: 'Later this week', due: '2026-10-12', owner: 'Logan' }] },
  ];
  const d = LC.whatsDue(rows, { today: '2026-10-09' });
  eq(d.overdue.map(g => g.client), ['Acme']); eq(d.overdue[0].items.map(i => i.label), ['Late']);
  eq(d.today[0].items[0].label, 'Now');
  eq(d.week.map(g => g.client), ['Bea']); eq(d.week[0].items.map(i => i.label), ['Later this week', 'Soon'], 'earliest first');
  eq(d.count, 4, 'done and far-off items are not on the card');
  const mine = LC.whatsDue(rows, { today: '2026-10-09', mine: 'Garrett' });
  eq(mine.count, 1); eq(mine.today[0].items[0].label, 'Now');
  eq(LC.dueGroup('2026-10-15', '2026-10-09'), 'week'); eq(LC.dueGroup('2026-10-16', '2026-10-09'), null);
});

test('Launches this month: Build and Review clients with a target this month, soonest first', () => {
  const rows = [
    { lead: { id: 'A', company: 'Acme', clientPhase: 'build' }, clock: { started: true, target: '2026-10-22', day: 1, launchDays: 14, tone: 'ok' } },
    { lead: { id: 'B', company: 'Bea', clientPhase: 'review' }, clock: { started: true, target: '2026-10-15', day: 10, launchDays: 14, tone: 'warn' } },
    { lead: { id: 'C', company: 'Cee', clientPhase: 'build' }, clock: { started: true, target: '2026-11-02', day: 1, launchDays: 14, tone: 'ok' } },
    { lead: { id: 'D', company: 'Dee', clientPhase: 'active' }, clock: { started: true, target: '2026-10-03', day: 20, launchDays: 14, tone: 'late' } },
  ];
  eq(LC.launchesThisMonth(rows, '2026-10-09').map(x => x.client), ['Bea', 'Acme']);
});

test('the stage list: Review after Build, Launched and Former by default; a saved list gains Review once', () => {
  const { DEFAULT_CLIENT_PHASES, stdPhases } = LEAD;
  eq(DEFAULT_CLIENT_PHASES.map(p => p.key), ['intake', 'build', 'review', 'launch', 'active', 'atrisk', 'churned']);
  eq(DEFAULT_CLIENT_PHASES.map(p => p.label), ['Intake', 'Build', 'Review', 'Launched', 'Active', 'At Risk', 'Former']);
  const saved = [{ key: 'intake', label: 'In' }, { key: 'build', label: 'Making' }, { key: 'launch', label: 'Launch' }, { key: 'active', label: 'On' }, { key: 'atrisk', label: 'Risk' }, { key: 'churned', label: 'Gone' }];
  const got = stdPhases({ clientPhases: saved });
  eq(got.map(p => p.key), ['intake', 'build', 'review', 'launch', 'active', 'atrisk', 'churned']);
  eq(got.map(p => p.label).filter(x => x !== 'Review'), ['In', 'Making', 'Launch', 'On', 'Risk', 'Gone'], 'their labels kept');
  eq(stdPhases({ clientPhases: got }), got, 'already has it: unchanged');
});

test('the move notes are machine notes (lib/lead SYS_NOTE)', () => {
  const { SYS_NOTE } = LEAD;
  for (const t of ['Phase → Build (automatic: the 14-day clock started Oct 8).', 'Clock paused: waiting on client feedback.', 'Clock resumed: client feedback received. Remaining dates moved 3 days later.'])
    ok(SYS_NOTE.test(t), t);
});

test('LIFECYCLE-MIGRATION.sql: one function, its grants, and it checks itself (PGlite runs it: tests/onbrlsdb.mjs)', () => {
  const sql = fs.readFileSync('LIFECYCLE-MIGRATION.sql', 'utf8');
  const onb = fs.readFileSync('ONBOARDING-MIGRATION.sql', 'utf8');
  ok(/^begin;$/m.test(sql) && /^commit;$/m.test(sql), 'one transaction');
  ok(!/create table|alter table|create policy|drop policy|drop table/i.test(sql), 'no table, column or policy');
  ok(/create or replace function onboarding_public\(p_token text\)/.test(sql) && /security definer/.test(sql));
  ok(/'logo_received',\s+l\.data->'onboarding'->'logo_received'/.test(sql) && /'headshot_received',\s+l\.data->'onboarding'->'headshot_received'/.test(sql), 'reads the ticks from the LEAD');
  ok(/revoke all on function onboarding_public\(text\) from public, anon, authenticated/.test(sql) && /grant execute on function onboarding_public\(text\) to service_role/.test(sql));
  ok(sql.indexOf('LIFECYCLE OK') < sql.indexOf('commit;'), 'verifies before commit');
  const fn = s => s.slice(s.indexOf('create or replace function onboarding_public'), s.indexOf('$$;', s.indexOf('create or replace function onboarding_public')));
  eq(fn(sql), fn(onb), 'the same function ONBOARDING-MIGRATION.sql now creates, so re-running either cannot undo the other');
});

report('lifecycle');
